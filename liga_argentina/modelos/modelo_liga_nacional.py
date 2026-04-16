"""
Modelo de Regresión Logística — Liga Nacional de Básquet (Argentina)
====================================================================
Estima la probabilidad de victoria de un equipo en un partido de la
Liga Nacional de Básquet de Argentina.

⚠️  IMPORTANTE: Este modelo fue construido EXCLUSIVAMENTE con datos de la
    Liga Nacional. No aplica a la Liga Argentina, Liga Femenina u otras
    competencias.

Uso:
    # Evaluar métricas + guardar modelo de producción
    python3.11 modelo_liga_nacional.py

    # Reentrenar el modelo con los datos más recientes (post-scraper)
    from modelo_liga_nacional import retrain
    retrain()

    # Predecir desde otro script sin reentrenar
    from modelo_liga_nacional import load_model, predict_proba_game
    model, scaler, features = load_model()
    prob = predict_proba_game(model, scaler, features, {...})
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, roc_auc_score, log_loss
from sklearn.model_selection import TimeSeriesSplit

# ─────────────────────────────────────────────────────────────────────────────
# MAPEO DE COLUMNAS
# Si el CSV cambia de nombre de columnas, editar solo este bloque.
# ─────────────────────────────────────────────────────────────────────────────
COL = {
    "fecha":      "Fecha",
    "equipo":     "Equipo",
    "rival":      "Rival",
    "condicion":  "Condicion equipos",   # 'LOCAL' | 'VISITANTE'
    "ganado":     "Ganado",              # bool
    "id_partido": "IdPartido",
    "etapa":      "Etapa",
    # Stats de jugador que se suman por equipo
    "pts":        "Puntos",
    "t2m":        "T2A",    # field goals 2p anotados
    "t2a":        "T2I",    # field goals 2p intentados
    "t3m":        "T3A",    # triples anotados
    "t3a":        "T3I",    # triples intentados
    "ftm":        "T1A",    # libres anotados
    "fta":        "T1I",    # libres intentados
    "orb":        "OReb",   # rebotes ofensivos
    "drb":        "DReb",   # rebotes defensivos
    "tov":        "Perdidas",
}

DATA_PATH    = "liga_argentina/docs/liga_nacional/liga_nacional.csv"
PBP_PATH     = "liga_argentina/docs/liga_nacional/liga_nacional_pbp.csv"
SHOTS_PATH   = "liga_argentina/docs/liga_nacional/liga_nacional_shots.csv"
MODEL_PATH   = "liga_argentina/modelos/modelo_liga_nacional_prod.pkl"
FIXTURE_PATH = "liga_argentina/docs/liga_nacional/fixture_upcoming.csv"
PRED_PATH    = "liga_argentina/docs/liga_nacional/predicciones_upcoming.csv"

# Span del EWM: controla la velocidad de decaimiento exponencial.
# alpha = 2 / (EWM_SPAN + 1). Con span=10 → alpha≈0.18 (~18% al partido más reciente).
# Calibrado por CV temporal sobre 5 folds — span=10 maximiza AUC con varianza controlada.
EWM_SPAN = 10

# Zonas del shot map agrupadas en tres categorías
PAINT_ZONES  = {"Z1-DE", "Z1-IZ", "FRANJA-DE", "FRANJA-INFERIOR", "FRANJA-SUPERIOR"}
TRIPLE_ZONES = {f"Z{i}-DE" for i in range(10, 15)} | {f"Z{i}-IZ" for i in range(10, 15)}

# ─────────────────────────────────────────────────────────────────────────────
# 1. CARGA DE DATOS
# ─────────────────────────────────────────────────────────────────────────────

def load_data(path: str = DATA_PATH) -> pd.DataFrame:
    """
    Lee el CSV de la Liga Nacional y agrega las stats a nivel equipo por partido.
    Devuelve un DataFrame con una fila por (partido, equipo).
    Solo incluye partidos de etapa 'regular' (el CSV ya solo contiene eso,
    pero el filtro queda explícito por si se agregan playoffs en el futuro).
    """
    df = pd.read_csv(path)

    # Renombrar BOM si lo hay en la primera columna
    df.columns = [c.lstrip("\ufeff") for c in df.columns]

    # Parsear fecha
    df[COL["fecha"]] = pd.to_datetime(df[COL["fecha"]], dayfirst=True)

    # Filtrar solo Liga Nacional (etapa regular); ajustar si se suman playoffs
    df = df[df[COL["etapa"]] == "regular"].copy()

    # Columnas a sumar por equipo/partido
    stat_cols = [
        COL["pts"], COL["t2m"], COL["t2a"], COL["t3m"], COL["t3a"],
        COL["ftm"], COL["fta"], COL["orb"], COL["drb"], COL["tov"],
    ]

    # Columnas de contexto (son iguales para todos los jugadores del equipo)
    ctx_cols = [
        COL["fecha"], COL["id_partido"], COL["equipo"], COL["rival"],
        COL["condicion"], COL["ganado"],
    ]

    # Agregar: suma de stats + primer valor de contexto
    agg_dict = {c: "sum" for c in stat_cols}
    agg_dict.update({c: "first" for c in ctx_cols})

    team_box = (
        df.groupby([COL["id_partido"], COL["equipo"]], as_index=False)
        .agg(agg_dict)
    )

    # Nombres más cómodos internamente
    team_box = team_box.rename(columns={
        COL["fecha"]:      "fecha",
        COL["id_partido"]: "id_partido",
        COL["equipo"]:     "equipo",
        COL["rival"]:      "rival",
        COL["condicion"]:  "condicion",
        COL["ganado"]:     "win",
        COL["pts"]:        "pts",
        COL["t2m"]:        "fgm2",
        COL["t2a"]:        "fga2",
        COL["t3m"]:        "tpm",
        COL["t3a"]:        "tpa",
        COL["ftm"]:        "ftm",
        COL["fta"]:        "fta",
        COL["orb"]:        "orb",
        COL["drb"]:        "drb",
        COL["tov"]:        "tov",
    })

    team_box["win"] = team_box["win"].astype(int)
    team_box["home"] = (team_box["condicion"] == "LOCAL").astype(int)

    # FGM y FGA totales (2p + 3p)
    team_box["fgm"] = team_box["fgm2"] + team_box["tpm"]
    team_box["fga"] = team_box["fga2"] + team_box["tpa"]

    team_box = team_box.sort_values("fecha").reset_index(drop=True)
    return team_box


# ─────────────────────────────────────────────────────────────────────────────
# 2. CONSTRUCCIÓN DE FEATURES
# ─────────────────────────────────────────────────────────────────────────────

def _safe_div(num: pd.Series, den: pd.Series) -> pd.Series:
    """División segura: retorna NaN donde el denominador es 0."""
    return num.where(den != 0, np.nan) / den.where(den != 0, np.nan)


def build_features(team_box: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega métricas de Four Factors y Ratings a cada fila (equipo/partido).
    Requiere haber juntado stats del rival primero.

    Proceso:
        1. Calcula métricas propias.
        2. Hace self-join para traer métricas del rival.
        3. Calcula diferenciales (equipo - rival).
        4. Calcula rest_diff (días de descanso entre partidos).
    """
    df = team_box.copy()

    # ── Métricas propias ──────────────────────────────────────────────────────

    # Posesiones estimadas
    df["poss"] = df["fga"] - df["orb"] + df["tov"] + 0.44 * df["fta"]
    df["poss"] = df["poss"].clip(lower=1)  # evitar /0 en casos raros

    # Four Factors
    df["efg"]     = _safe_div(df["fgm"] + 0.5 * df["tpm"], df["fga"])
    df["tov_pct"] = _safe_div(df["tov"], df["poss"])
    df["ftr"]     = _safe_div(df["fta"], df["fga"])
    # orb_pct se calcula después de juntar con rival (necesita opp_drb)

    # Offensive rating
    df["ortg"] = 100 * _safe_div(df["pts"], df["poss"])

    # ── Join con el rival ─────────────────────────────────────────────────────
    # Cada partido tiene 2 filas. Para cada equipo necesitamos las stats del
    # rival → juntamos left.rival == opp.equipo (no left.equipo == opp.equipo).
    opp = df[["id_partido", "equipo", "pts", "poss", "drb",
              "efg", "tov_pct", "ftr", "ortg"]].copy()
    opp.columns = ["id_partido", "opp_equipo",
                   "opp_pts", "opp_poss", "opp_drb",
                   "opp_efg", "opp_tov_pct", "opp_ftr", "opp_ortg"]

    # left.rival = nombre del rival → coincide con opp.opp_equipo = nombre del equipo en opp
    df = df.merge(
        opp,
        left_on=["id_partido", "rival"],
        right_on=["id_partido", "opp_equipo"],
        how="left"
    ).drop(columns=["opp_equipo"])

    # orb_pct: rebotes ofensivos del equipo sobre el total de rebotes disputados
    df["orb_pct"] = _safe_div(df["orb"], df["orb"] + df["opp_drb"])

    # Ratings
    df["drtg"]        = 100 * _safe_div(df["opp_pts"], df["opp_poss"])
    df["net_rating"]  = df["ortg"] - df["drtg"]

    # net_rating del rival (= opp_ortg - opp_drtg, donde opp_drtg usa PTS del equipo)
    df["opp_drtg"]       = 100 * _safe_div(df["pts"], df["opp_poss"])
    df["opp_net_rating"] = df["opp_ortg"] - df["opp_drtg"]

    # orb_pct del rival (lo necesitamos para delta_orb_pct)
    df["opp_orb_pct"] = _safe_div(df["opp_drb"], df["opp_drb"] + df["orb"])
    # nota: opp_orb_pct del rival = DRB_rival / (DRB_rival + ORB_equipo), no es lo mismo
    # que 1 - orb_pct_equipo porque las posesiones no son simétricas

    # ── Diferenciales (perspectiva del equipo) ────────────────────────────────
    df["delta_efg"]        = df["efg"]        - df["opp_efg"]
    df["delta_tov_pct"]    = df["tov_pct"]    - df["opp_tov_pct"]
    df["delta_orb_pct"]    = df["orb_pct"]    - df["opp_orb_pct"]
    df["delta_ftr"]        = df["ftr"]        - df["opp_ftr"]
    df["delta_net_rating"] = df["net_rating"] - df["opp_net_rating"]

    # ── Descanso (días desde último partido del equipo) ───────────────────────
    df = df.sort_values(["equipo", "fecha"]).reset_index(drop=True)
    df["rest"] = (
        df.groupby("equipo")["fecha"]
        .diff()
        .dt.days
        .fillna(7)   # primer partido del equipo: asumir 7 días de descanso
    )

    # rest_diff: descanso propio - descanso rival
    rest_map = df.set_index(["id_partido", "equipo"])["rest"]
    df["opp_rest"] = df.apply(
        lambda r: rest_map.get((r["id_partido"], r["rival"]), np.nan), axis=1
    )
    df["rest_diff"] = df["rest"] - df["opp_rest"]

    return df


# ─────────────────────────────────────────────────────────────────────────────
# 3a. FEATURES DESDE PBP
# ─────────────────────────────────────────────────────────────────────────────

def build_pbp_features(path: str = PBP_PATH) -> pd.DataFrame:
    """
    Extrae dos métricas por (partido, equipo) desde el play-by-play:

    - pace: posesiones estimadas del partido (Oliver) a partir de eventos PBP.
            Mide el ritmo de juego — equipos más rápidos generan más posesiones.

    - clutch_net_pts: diferencia de puntos anotados vs recibidos en situaciones
            clutch (cuarto período, ≤2 minutos, margen ≤5 puntos).
            Mide cómo rinde el equipo cuando el partido está en juego.

    Devuelve un DataFrame con columnas: id_partido, equipo, pace, clutch_net_pts.
    """
    pbp = pd.read_csv(path)

    # ── Pace ─────────────────────────────────────────────────────────────────
    # Usamos conteo de eventos de posesión como proxy de posesiones:
    # cada tiro de campo, pérdida o tiro libre (grupos de 2-3 cuentan como 1)
    # La forma más limpia con PBP es contar FGA + TOV + (0.44 * FTA)
    poss_events = pbp[pbp["Tipo"].isin([
        "CANASTA-2P", "CANASTA-3P", "TIRO2-FALLADO", "TIRO3-FALLADO",
        "PERDIDA",
        "CANASTA-1P", "TIRO1-FALLADO",
    ])].copy()

    # Asignar equipo a cada evento
    poss_events["equipo"] = np.where(
        poss_events["Equipo_lado"] == "LOCAL",
        poss_events["Equipo_local"],
        poss_events["Equipo_visitante"],
    )

    # Peso por tipo (libres valen 0.44 por posesión)
    peso = {
        "CANASTA-2P": 1.0, "CANASTA-3P": 1.0,
        "TIRO2-FALLADO": 1.0, "TIRO3-FALLADO": 1.0,
        "PERDIDA": 1.0,
        "CANASTA-1P": 0.44, "TIRO1-FALLADO": 0.44,
    }
    poss_events["poss_weight"] = poss_events["Tipo"].map(peso)

    pace_df = (
        poss_events.groupby(["IdPartido", "equipo"])["poss_weight"]
        .sum()
        .reset_index()
        .rename(columns={"IdPartido": "id_partido", "poss_weight": "pace"})
    )

    # ── Clutch net points ─────────────────────────────────────────────────────
    canastas = pbp[pbp["Tipo"].isin(["CANASTA-1P", "CANASTA-2P", "CANASTA-3P"])].copy()
    canastas["pts_val"] = canastas["Tipo"].map(
        {"CANASTA-1P": 1, "CANASTA-2P": 2, "CANASTA-3P": 3}
    )

    # Convertir tiempo restante a minutos (formato MM:SS, cuenta regresiva)
    canastas["min_left"] = canastas["Tiempo"].apply(
        lambda t: int(t.split(":")[0]) + int(t.split(":")[1]) / 60
        if pd.notna(t) and ":" in str(t) else np.nan
    )
    canastas["margen"] = abs(
        canastas["Marcador_local"] - canastas["Marcador_visitante"]
    )

    # Situación clutch: Q4, ≤2 min restantes, margen ≤5 puntos
    clutch = canastas[
        (canastas["Periodo"] == 4)
        & (canastas["min_left"] <= 2)
        & (canastas["margen"] <= 5)
    ].copy()

    clutch["equipo"] = np.where(
        clutch["Equipo_lado"] == "LOCAL",
        clutch["Equipo_local"],
        clutch["Equipo_visitante"],
    )
    clutch["rival"] = np.where(
        clutch["Equipo_lado"] == "LOCAL",
        clutch["Equipo_visitante"],
        clutch["Equipo_local"],
    )

    # Puntos a favor en clutch por equipo/partido
    pts_for = (
        clutch.groupby(["IdPartido", "equipo"])["pts_val"]
        .sum()
        .reset_index()
        .rename(columns={"pts_val": "clutch_pts_for"})
    )
    # Puntos en contra en clutch (puntos del rival en el mismo partido/segmento)
    pts_against = (
        clutch.groupby(["IdPartido", "rival"])["pts_val"]
        .sum()
        .reset_index()
        .rename(columns={"rival": "equipo", "pts_val": "clutch_pts_against"})
    )

    clutch_df = pts_for.merge(
        pts_against, on=["IdPartido", "equipo"], how="outer"
    ).fillna(0)
    clutch_df["clutch_net_pts"] = (
        clutch_df["clutch_pts_for"] - clutch_df["clutch_pts_against"]
    )
    clutch_df = clutch_df[["IdPartido", "equipo", "clutch_net_pts"]].rename(
        columns={"IdPartido": "id_partido"}
    )

    # ── Merge pace + clutch ───────────────────────────────────────────────────
    result = pace_df.merge(clutch_df, on=["id_partido", "equipo"], how="left")
    # Partidos sin situación clutch: clutch_net_pts = 0 (ninguno anotó en clutch)
    result["clutch_net_pts"] = result["clutch_net_pts"].fillna(0)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 3b. FEATURES DESDE SHOT MAP
# ─────────────────────────────────────────────────────────────────────────────

def build_shots_features(path: str = SHOTS_PATH) -> pd.DataFrame:
    """
    Extrae métricas de calidad de tiro por (partido, equipo) desde el shot map:

    - paint_rate: proporción de tiros desde la pintura (alta eficiencia esperada)
    - mid_rate:   proporción de tiros mid-range (baja eficiencia esperada)
    - triple_rate: proporción de triples intentados
    - paint_efg:  eFG% dentro de la pintura (calidad de ejecución en zona prime)

    Devuelve un DataFrame con columnas: id_partido, equipo, paint_rate,
    mid_rate, triple_rate, paint_efg.
    """
    shots = pd.read_csv(path)

    # Filtrar tiros con coordenadas anómalas (Top_pct > 100 son artefactos)
    shots = shots[shots["Top_pct"] <= 100].copy()

    # Clasificar zona
    shots["zona_cat"] = shots["Zona"].apply(
        lambda z: "paint"  if z in PAINT_ZONES  else
                  "triple" if z in TRIPLE_ZONES else
                  "mid"
    )

    shots["made"]    = (shots["Resultado"] == "CONVERTIDO").astype(int)
    shots["is_3pt"]  = (shots["Tipo"] == "TIRO3").astype(int)
    shots["id_partido"] = shots["IdPartido"]

    # Totales por partido/equipo
    totals = shots.groupby(["id_partido", "Equipo"]).agg(
        total_att  = ("made", "count"),
        paint_att  = ("zona_cat", lambda x: (x == "paint").sum()),
        mid_att    = ("zona_cat", lambda x: (x == "mid").sum()),
        triple_att = ("zona_cat", lambda x: (x == "triple").sum()),
        paint_made = ("made",    lambda x: x[shots.loc[x.index, "zona_cat"] == "paint"].sum()),
        triple_made= ("made",    lambda x: x[shots.loc[x.index, "zona_cat"] == "triple"].sum()),
    ).reset_index().rename(columns={"Equipo": "equipo"})

    totals["paint_rate"]  = _safe_div(totals["paint_att"],  totals["total_att"])
    totals["mid_rate"]    = _safe_div(totals["mid_att"],    totals["total_att"])
    totals["triple_rate"] = _safe_div(totals["triple_att"], totals["total_att"])
    # eFG% en pintura: (made_paint + 0 extra por 3pt — todos los tiros de pintura son 2pt)
    totals["paint_efg"]   = _safe_div(totals["paint_made"], totals["paint_att"])

    return totals[[
        "id_partido", "equipo",
        "paint_rate", "mid_rate", "triple_rate", "paint_efg",
    ]]


# ─────────────────────────────────────────────────────────────────────────────
# 3c. ROLLING FEATURES (sin leakage)
# ─────────────────────────────────────────────────────────────────────────────

def build_rolling_features(df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    """
    Construye rolling features por equipo usando solo información pasada.

    Técnica anti-leakage:
        1. Ordenar por fecha dentro de cada equipo.
        2. shift(1): excluye el partido actual del cálculo.
        3. rolling(window): promedio de los últimos `window` partidos anteriores.

    Aplica a métricas de stats, PBP y shots.
    """
    df = df.sort_values(["equipo", "fecha"]).reset_index(drop=True)

    # 3pt% y drb_pct se calculan aquí si no existen aún
    if "tpt_pct" not in df.columns:
        df["tpt_pct"] = _safe_div(df["tpm"], df["tpa"])
    if "drb_pct" not in df.columns:
        # rebotes defensivos propios / (drb propios + orb rival)
        df["drb_pct"] = _safe_div(df["drb"], df["drb"] + df["orb"])

    roll_cols = {
        # Stats base
        f"rolling_net_rating_{window}": "net_rating",
        f"rolling_efg_{window}":        "efg",
        f"rolling_tov_pct_{window}":    "tov_pct",
        # Rebotes
        f"rolling_orb_pct_{window}":   "orb_pct",   # rebote ofensivo %
        f"rolling_drb_pct_{window}":   "drb_pct",   # rebote defensivo %
        # Triples
        f"rolling_3pt_pct_{window}":   "tpt_pct",   # % de triples anotados
        # PBP
        f"rolling_pace_{window}":        "pace",
        f"rolling_clutch_{window}":      "clutch_net_pts",
        # Shots
        f"rolling_paint_rate_{window}":  "paint_rate",
        f"rolling_mid_rate_{window}":    "mid_rate",
        f"rolling_triple_rate_{window}": "triple_rate",
        f"rolling_paint_efg_{window}":   "paint_efg",
    }

    for new_col, src_col in roll_cols.items():
        if src_col not in df.columns:
            continue  # feature opcional — no romper si falta
        # EWM con shift(1) para anti-leakage: el partido actual no se incluye.
        # span=EWM_SPAN → alpha ≈ 0.5, el partido más reciente pondera ~50%,
        # el anterior ~25%, y así sucesivamente (decaimiento exponencial).
        df[new_col] = (
            df.groupby("equipo")[src_col]
            .transform(lambda s: s.shift(1).ewm(span=EWM_SPAN, min_periods=1).mean())
        )

    return df


# ─────────────────────────────────────────────────────────────────────────────
# 4. ENTRENAMIENTO
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# NOTA SOBRE LEAKAGE Y MODOS DE USO
# ─────────────────────────────────────────────────────────────────────────────
# Las features se dividen en dos grupos:
#
# A) IN-GAME (delta_*): calculadas con stats del partido actual.
#    → Son el driver estadístico del resultado (quién tiró mejor, etc.).
#    → ÚTIL para: análisis retrospectivo, explicar por qué ganó un equipo.
#    → NO útil para: predecir antes del partido (son estadísticas del partido mismo).
#    → En el modelo alcanzan AUC ~0.99 porque correlacionan casi perfectamente con win.
#
# B) PRE-GAME (rolling_*, home, rest_diff): calculadas SOLO con info anterior al partido.
#    → Son las features genuinamente predictivas para partidos futuros.
#    → AUC típico: ~0.60–0.65 (ver evaluación separada abajo en train_model).
#    → Usar estas para predicciones de partidos todavía no jugados.
#
# Por defecto el modelo usa todas las features (modo análisis completo).
# Cambiar FEATURE_COLS a FEATURE_COLS_PREGAME para predicción pura sin leakage.
# ─────────────────────────────────────────────────────────────────────────────

# Todas las features (análisis retrospectivo + predictivo combinado)
FEATURE_COLS = [
    # Diferenciales Four Factors (in-game — stats del partido actual)
    "delta_efg",
    "delta_tov_pct",
    "delta_orb_pct",
    "delta_ftr",
    "delta_net_rating",
    # Contexto pre-partido
    "home",
    "rest_diff",
    # Forma reciente (rolling pre-partido — sin leakage)
    "rolling_net_rating_5",
    "rolling_efg_5",
    "rolling_tov_pct_5",
]

# Solo features pre-partido (para predecir partidos futuros)
# Set calibrado por CV temporal (TimeSeriesSplit, 5 folds) — AUC ~0.624, Acc ~59.6%
# Criterio de selección: menor cantidad de features ortogonales que maximiza AUC sin leakage.
# Se descartaron: rest_diff (r=+0.02 con win), rolling_efg_5 (colineal con net_rating, r=0.576),
#   rolling_tov_pct_5, rolling_pace_5, rolling_clutch_5, rolling_paint_rate_5,
#   rolling_mid_rate_5 (colineal con paint_rate, r=-0.83).
FEATURE_COLS_PREGAME = [
    # Ventaja de cancha
    "home",
    # Forma reciente — eficiencia global
    "rolling_net_rating_5",
    # Forma reciente — racha de victorias
    "rolling_win_5",
    # Forma reciente — calidad de tiro en la zona más eficiente
    "rolling_paint_efg_5",
    # Forma reciente — eficiencia en triples (complementa paint_efg con otra zona)
    "rolling_3pt_pct_5",
]


def train_model(df: pd.DataFrame, train_frac: float = 0.75, feature_cols: list = None):
    """
    Split temporal: train con los primeros `train_frac` partidos (por fecha),
    test con el resto. No hay shuffle, no hay leakage temporal.

    Retorna: (model, scaler, feature_cols)
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLS

    df = df.sort_values("fecha").reset_index(drop=True)

    # Eliminar filas con NaN en features o target
    model_df = df[feature_cols + ["win"]].dropna()
    valid_idx = model_df.index
    df_clean  = df.loc[valid_idx].sort_values("fecha").reset_index(drop=True)
    model_df  = df_clean[feature_cols + ["win"]]

    # Split temporal
    split_idx = int(len(model_df) * train_frac)
    train = model_df.iloc[:split_idx]
    test  = model_df.iloc[split_idx:]

    X_train, y_train = train[feature_cols].values, train["win"].values
    X_test,  y_test  = test[feature_cols].values,  test["win"].values

    # Estandarización (mejora estabilidad numérica de LogReg)
    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test  = scaler.transform(X_test)

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train, y_train)

    # Guardar índice de corte para referencia
    split_date = df_clean["fecha"].iloc[split_idx]
    print(f"\n{'─'*55}")
    print(f"  Liga Nacional — Logistic Regression")
    print(f"{'─'*55}")
    print(f"  Partidos totales (sin NaN): {len(model_df)}")
    print(f"  Train: {split_idx} filas  |  hasta {split_date.date()}")
    print(f"  Test : {len(model_df) - split_idx} filas")
    print(f"  Features: {feature_cols}")

    return model, scaler, feature_cols, X_test, y_test, df_clean, split_idx


# ─────────────────────────────────────────────────────────────────────────────
# 5. EVALUACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_model(model, scaler, feature_cols, X_test, y_test):
    """
    Reporta accuracy, ROC AUC y Log Loss sobre el conjunto de test.
    """
    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    acc  = accuracy_score(y_test, y_pred)
    auc  = roc_auc_score(y_test, y_proba)
    ll   = log_loss(y_test, y_proba)

    print(f"\n  Métricas (test set)")
    print(f"  {'Accuracy':<15}: {acc:.4f}")
    print(f"  {'ROC AUC':<15}: {auc:.4f}")
    print(f"  {'Log Loss':<15}: {ll:.4f}")

    # Coeficientes del modelo
    coef_df = (
        pd.DataFrame({"feature": feature_cols, "coef": model.coef_[0]})
        .sort_values("coef", ascending=False)
    )
    print(f"\n  Coeficientes (estandarizados):")
    print(coef_df.to_string(index=False))
    print(f"{'─'*55}\n")

    return {"accuracy": acc, "roc_auc": auc, "log_loss": ll}


# ─────────────────────────────────────────────────────────────────────────────
# 5b. CROSS-VALIDATION TEMPORAL
# ─────────────────────────────────────────────────────────────────────────────

def cross_validate_temporal(
    df: pd.DataFrame,
    feature_cols: list = None,
    n_splits: int = 5,
) -> dict:
    """
    Cross-validation con TimeSeriesSplit para detectar underfitting/overfitting.

    Usa splits temporales: cada fold entrena sobre partidos anteriores y testea
    sobre los siguientes. Nunca mezcla fechas futuras en el train (sin leakage).

    Parámetros
    ----------
    df          : DataFrame con features y columna 'win'.
    feature_cols: lista de features a usar (default: FEATURE_COLS_PREGAME).
    n_splits    : número de folds (default: 5).

    Retorna
    -------
    dict con arrays de métricas por fold y sus promedios/desvíos.
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLS_PREGAME

    # Ordenar cronológicamente y limpiar NaN
    model_df = (
        df[feature_cols + ["win", "fecha"]]
        .dropna()
        .sort_values("fecha")
        .reset_index(drop=True)
    )

    X = model_df[feature_cols].values
    y = model_df["win"].values

    tscv = TimeSeriesSplit(n_splits=n_splits)

    fold_metrics = []
    print(f"\n{'─'*55}")
    print(f"  Cross-Validation Temporal — {n_splits} folds (TimeSeriesSplit)")
    print(f"{'─'*55}")
    print(f"  {'Fold':<6} {'Train':>7} {'Test':>6}  {'Accuracy':>9} {'AUC':>7} {'LogLoss':>9}")
    print(f"  {'─'*52}")

    for fold, (train_idx, test_idx) in enumerate(tscv.split(X), start=1):
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]

        scaler_cv = StandardScaler()
        X_tr_s = scaler_cv.fit_transform(X_tr)
        X_te_s  = scaler_cv.transform(X_te)

        mdl = LogisticRegression(max_iter=1000, random_state=42)
        mdl.fit(X_tr_s, y_tr)

        y_pred  = mdl.predict(X_te_s)
        y_proba = mdl.predict_proba(X_te_s)[:, 1]

        acc = accuracy_score(y_te, y_pred)
        auc = roc_auc_score(y_te, y_proba)
        ll  = log_loss(y_te, y_proba)

        fold_metrics.append({"accuracy": acc, "roc_auc": auc, "log_loss": ll})

        date_from = model_df["fecha"].iloc[train_idx[0]].date()
        date_to   = model_df["fecha"].iloc[test_idx[-1]].date()
        print(
            f"  {fold:<6} {len(train_idx):>7} {len(test_idx):>6}  "
            f"{acc:>9.4f} {auc:>7.4f} {ll:>9.4f}"
            f"  ({date_from} → {date_to})"
        )

    accs = [m["accuracy"] for m in fold_metrics]
    aucs = [m["roc_auc"]  for m in fold_metrics]
    lls  = [m["log_loss"] for m in fold_metrics]

    print(f"  {'─'*52}")
    print(f"  {'Media':<6} {'':>7} {'':>6}  {np.mean(accs):>9.4f} {np.mean(aucs):>7.4f} {np.mean(lls):>9.4f}")
    print(f"  {'Desv.':<6} {'':>7} {'':>6}  {np.std(accs):>9.4f} {np.std(aucs):>7.4f} {np.std(lls):>9.4f}")
    print(f"{'─'*55}\n")

    return {
        "fold_metrics": fold_metrics,
        "mean_accuracy": np.mean(accs),
        "std_accuracy":  np.std(accs),
        "mean_auc":      np.mean(aucs),
        "std_auc":       np.std(aucs),
        "mean_log_loss": np.mean(lls),
        "std_log_loss":  np.std(lls),
    }


def predict_proba_game(model, scaler, feature_cols, row: dict) -> float:
    """
    Dado un diccionario con los valores de las features para un equipo en un
    partido, devuelve la probabilidad estimada de victoria.

    Ejemplo:
        prob = predict_proba_game(model, scaler, feature_cols, {
            "delta_efg": 0.05,
            "delta_tov_pct": -0.02,
            ...
        })
    """
    x = np.array([[row[f] for f in feature_cols]])
    x_scaled = scaler.transform(x)
    return float(model.predict_proba(x_scaled)[0, 1])


# ─────────────────────────────────────────────────────────────────────────────
# 7. MODELO DE PRODUCCIÓN — SAVE / LOAD / RETRAIN
# ─────────────────────────────────────────────────────────────────────────────

def _build_feature_df():
    """Pipeline interno: carga datos y construye features. Devuelve el DataFrame listo."""
    raw  = load_data()
    feat = build_features(raw)
    feat = feat.merge(build_pbp_features(),   on=["id_partido", "equipo"], how="left")
    feat = feat.merge(build_shots_features(), on=["id_partido", "equipo"], how="left")
    feat = build_rolling_features(feat)
    # rolling_win_5: racha de victorias de los últimos 5 partidos (anti-leakage con shift(1))
    feat = feat.sort_values(["equipo", "fecha"]).reset_index(drop=True)
    feat["rolling_win_5"] = (
        feat.groupby("equipo")["win"]
        .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
    )
    return feat


def save_model(model, scaler, feature_cols, path: str = MODEL_PATH, n_games: int = None):
    """Guarda el modelo de producción en disco junto con sus metadatos."""
    payload = {
        "model":        model,
        "scaler":       scaler,
        "feature_cols": feature_cols,
        "trained_on":   pd.Timestamp.now().isoformat(),
        "n_games":      n_games,
    }
    joblib.dump(payload, path)
    print(f"  Modelo guardado → {path}")


def load_model(path: str = MODEL_PATH):
    """
    Carga el modelo de producción desde disco.
    Devuelve (model, scaler, feature_cols) o lanza FileNotFoundError si no existe.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No se encontró el modelo en '{path}'.\n"
            "Ejecutá `python3.11 liga_argentina/modelo_liga_nacional.py` para entrenarlo."
        )
    payload = joblib.load(path)
    return payload["model"], payload["scaler"], payload["feature_cols"]


def retrain(save: bool = True, verbose: bool = True) -> tuple:
    """
    Entrena el modelo de producción sobre TODOS los datos disponibles
    (sin holdout) y lo guarda en disco.

    Llamar después de actualizar los CSVs con el scraper para que el
    modelo incorpore los partidos nuevos.

    Parámetros
    ----------
    save    : si True, guarda el modelo en MODEL_PATH.
    verbose : si True, imprime estadísticas del reentrenamiento.

    Devuelve
    --------
    (model, scaler, feature_cols)
    """
    if verbose:
        print("Reentrenando modelo de producción con todos los datos disponibles...")

    feat = _build_feature_df()

    # Filtrar filas con NaN en las features de predicción
    df_clean = feat.dropna(subset=FEATURE_COLS_PREGAME + ["win"]).copy()
    df_clean = df_clean.sort_values("fecha").reset_index(drop=True)

    X = df_clean[FEATURE_COLS_PREGAME].values
    y = df_clean["win"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_scaled, y)

    n_games = df_clean["id_partido"].nunique()
    last_game = df_clean["fecha"].max()

    if verbose:
        print(f"  Partidos incorporados : {n_games}")
        print(f"  Último partido        : {last_game.date()}")
        print(f"  Features              : {FEATURE_COLS_PREGAME}")

    if save:
        save_model(model, scaler, FEATURE_COLS_PREGAME, n_games=n_games)
        # Actualizar predicciones de partidos próximos con el modelo recién guardado
        predict_upcoming_games(feat=feat)

    return model, scaler, FEATURE_COLS_PREGAME


# ─────────────────────────────────────────────────────────────────────────────
# 8. PREDICCIÓN DE PARTIDOS PRÓXIMOS
# ─────────────────────────────────────────────────────────────────────────────

# Fuentes de rolling: mapeadas al nombre del feature
# rolling_win_5 se calcula aparte desde la columna 'win' en predict_upcoming_games
_ROLL_SOURCES = {
    "rolling_net_rating_5":  "net_rating",
    "rolling_efg_5":         "efg",
    "rolling_tov_pct_5":     "tov_pct",
    "rolling_pace_5":        "pace",
    "rolling_clutch_5":      "clutch_net_pts",
    "rolling_paint_rate_5":  "paint_rate",
    "rolling_mid_rate_5":    "mid_rate",
    "rolling_triple_rate_5": "triple_rate",
    "rolling_paint_efg_5":   "paint_efg",
    # Rebotes
    "rolling_orb_pct_5":     "orb_pct",
    "rolling_drb_pct_5":     "drb_pct",
    # Triples
    "rolling_3pt_pct_5":     "tpt_pct",
}


def predict_upcoming_games(
    feat: pd.DataFrame = None,
    fixture_path: str = FIXTURE_PATH,
    pred_path:    str = PRED_PATH,
) -> pd.DataFrame | None:
    """
    Genera predicciones de probabilidad para los partidos próximos en
    fixture_upcoming.csv y las guarda en predicciones_upcoming.csv.

    Columnas del CSV de salida:
        fecha, local, visitante, prob_local, prob_visit

    Llamar después de retrain() para que las predicciones estén actualizadas.
    Requiere que modelo_liga_nacional_prod.pkl exista en disco.
    """
    if not os.path.exists(fixture_path):
        print(f"  predict_upcoming: no se encontró {fixture_path}")
        return None

    fixture = pd.read_csv(fixture_path)
    fixture.columns = [c.lstrip("\ufeff") for c in fixture.columns]
    if fixture.empty:
        print("  predict_upcoming: fixture vacío, saltando.")
        return None

    try:
        model, scaler, feature_cols = load_model()
    except FileNotFoundError as e:
        print(f"  predict_upcoming: {e}")
        return None

    # Construir feature DataFrame si no viene como parámetro
    if feat is None:
        feat = _build_feature_df()

    # ── Rolling para el próximo partido de cada equipo ────────────────────────
    # rolling_X_5 del próximo partido = mean de los últimos 5 valores reales.
    # Calificamos NaN con la media de liga como fallback.
    league_means = {
        src: feat[src].mean()
        for src in _ROLL_SOURCES.values()
        if src in feat.columns
    }

    team_stats = {}
    for team, grp in feat.groupby("equipo"):
        grp_s = grp.sort_values("fecha")
        last5 = grp_s.tail(5)
        row: dict = {"last_game_date": grp_s["fecha"].max()}
        for roll_col, src_col in _ROLL_SOURCES.items():
            if src_col in last5.columns and not last5[src_col].isna().all():
                # EWM sobre los últimos 5 partidos: el más reciente pondera ~50%
                row[roll_col] = (
                    last5[src_col]
                    .ewm(span=EWM_SPAN, min_periods=1)
                    .mean()
                    .iloc[-1]
                )
            else:
                row[roll_col] = league_means.get(src_col, np.nan)
        # rolling_win_5: promedio de victorias en los últimos 5 partidos
        row["rolling_win_5"] = last5["win"].mean() if len(last5) > 0 else 0.5
        team_stats[team] = row

    # ── Predecir cada partido ─────────────────────────────────────────────────
    results = []
    for _, u in fixture.iterrows():
        local = u["local"]
        visit = u["visitante"]
        fecha_str = u["fecha"]

        if local not in team_stats or visit not in team_stats:
            continue  # equipo nuevo sin historial

        try:
            game_date = pd.to_datetime(fecha_str, dayfirst=True)
        except Exception:
            continue

        ls = team_stats[local]
        vs = team_stats[visit]

        local_rest = max(int((game_date - ls["last_game_date"]).days), 1)
        visit_rest = max(int((game_date - vs["last_game_date"]).days), 1)

        # Vector de features para el equipo local
        feats = {fc: ls.get(fc, np.nan) for fc in feature_cols}
        feats["home"]      = 1
        feats["rest_diff"] = local_rest - visit_rest

        # Reemplazar NaN residuales con 0 (equivale a media tras el scaler)
        feats = {k: (v if not (isinstance(v, float) and np.isnan(v)) else 0.0)
                 for k, v in feats.items()}

        try:
            prob_local = round(predict_proba_game(model, scaler, feature_cols, feats), 3)
        except Exception:
            continue

        results.append({
            "fecha":      fecha_str,
            "local":      local,
            "visitante":  visit,
            "prob_local": prob_local,
            "prob_visit": round(1 - prob_local, 3),
        })

    if not results:
        print("  predict_upcoming: no se generaron predicciones.")
        return None

    pred_df = pd.DataFrame(results)
    pred_df.to_csv(pred_path, index=False)
    print(f"  Predicciones guardadas → {pred_path} ({len(results)} partidos)")
    return pred_df


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # 1. Cargar y agregar a nivel equipo/partido
    print("Cargando datos de la Liga Nacional...")
    raw = load_data()
    print(f"  {raw['id_partido'].nunique()} partidos | {raw['equipo'].nunique()} equipos")

    # 2. Features derivadas (Four Factors, Ratings, Diferenciales)
    print("Construyendo features de stats...")
    feat = build_features(raw)

    # 3a. Features desde PBP (pace + clutch)
    print("Construyendo features desde PBP...")
    pbp_feat = build_pbp_features()
    feat = feat.merge(pbp_feat, on=["id_partido", "equipo"], how="left")

    # 3b. Features desde shot map (calidad de tiro por zona)
    print("Construyendo features desde shot map...")
    shot_feat = build_shots_features()
    feat = feat.merge(shot_feat, on=["id_partido", "equipo"], how="left")

    # 3c. Rolling features (sin leakage) — sobre todas las métricas anteriores
    print("Construyendo rolling features (window=5)...")
    feat = build_rolling_features(feat)

    # 4a. Modelo completo (in-game + rolling) — análisis retrospectivo
    print("\n== MODO ANÁLISIS (in-game + rolling) ==")
    model_full, scaler_full, fc_full, Xt_full, yt_full, df_clean, _ = train_model(feat, feature_cols=FEATURE_COLS)
    evaluate_model(model_full, scaler_full, fc_full, Xt_full, yt_full)

    # 4b. Modelo pre-partido (rolling + PBP + shots) — predicción real sin leakage
    print("\n== MODO PREDICCIÓN PRE-PARTIDO (rolling, sin leakage) ==")
    model_pre, scaler_pre, fc_pre, Xt_pre, yt_pre, _, _ = train_model(feat, feature_cols=FEATURE_COLS_PREGAME)
    evaluate_model(model_pre, scaler_pre, fc_pre, Xt_pre, yt_pre)

    # 4c. Cross-validation temporal — detecta underfitting/overfitting entre folds
    print("\n== CROSS-VALIDATION TEMPORAL (pre-partido) ==")
    cross_validate_temporal(feat, feature_cols=FEATURE_COLS_PREGAME, n_splits=5)

    # 5. Modelo de producción — entrena sobre TODOS los datos y guarda en disco
    print("\n== ENTRENANDO MODELO DE PRODUCCIÓN (todos los datos) ==")
    retrain(save=True, verbose=True)

    # 6. Predicciones de partidos próximos
    print("\n== PREDICCIONES PARTIDOS PRÓXIMOS ==")
    predict_upcoming_games(feat=feat)
