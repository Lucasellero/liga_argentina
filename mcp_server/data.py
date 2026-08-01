"""
Fetch + agregación de datos de scouteado.com para el servidor MCP.

Los CSVs se leen en vivo desde https://scouteado.com/<liga>/<archivo> (los mismos
que sirve Vercel desde docs/), con un cache en memoria de corta duración para no
re-descargar en cada llamada de una misma sesión. La agregación de stats replica
la misma lógica que usa el frontend (buildRAW_J / buildRAW_T, documentada en
CLAUDE.md): PJ = partidos con "Segundos jugados" > 0, promedios = total / PJ.
"""
import io
import re
import time
import unicodedata

import pandas as pd
import requests

BASE_URL = "https://scouteado.com"
CACHE_TTL_SECONDS = 600  # 10 min

LIGAS = {
    "liga_argentina": {"csv": "liga_argentina.csv", "label": "Liga Argentina"},
    "liga_nacional": {"csv": "liga_nacional.csv", "label": "Liga Nacional"},
}

# categoria -> (columna, tipo, mínimo de intentos para categorías de %)
CATEGORIAS = {
    "puntos": ("Puntos", "sum_per_game", None),
    "rebotes": ("TReb", "sum_per_game", None),
    "asistencias": ("Asistencias", "sum_per_game", None),
    "recuperos": ("Recuperos", "sum_per_game", None),
    "tapones": ("Tapones cometidos", "sum_per_game", None),
    "valoracion": ("Valoracion", "sum_per_game", None),
    "t2_pct": (("T2A", "T2I"), "pct", 30),
    "t3_pct": (("T3A", "T3I"), "pct", 20),
    "tl_pct": (("T1A", "T1I"), "pct", 15),
}

MIN_PJ_LEADERS = 5  # partidos mínimos para entrar al ranking de líderes

_cache = {}


def _norm(s):
    if not s:
        return ""
    s = re.sub(r"\([^)]*\)", "", str(s))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _cached_get(liga, filename, parser):
    key = (liga, filename)
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    url = f"{BASE_URL}/{liga}/{filename}"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    value = parser(resp)
    _cache[key] = (now, value)
    return value


def _validate_liga(liga):
    if liga not in LIGAS:
        raise ValueError(f'Liga inválida: "{liga}". Usar una de: {list(LIGAS)}')


def stats_df(liga):
    _validate_liga(liga)
    return _cached_get(liga, LIGAS[liga]["csv"], lambda r: pd.read_csv(io.StringIO(r.text)))


def _round(v, nd=1):
    return None if v is None else round(float(v), nd)


def _pct(made, att):
    return _round(made / att * 100) if att else None


def _player_row_stats(sub):
    """sub: filas del CSV de un solo jugador (un equipo). Devuelve dict de stats."""
    pj = int((sub["Segundos jugados"] > 0).sum())
    n = pj or 1  # evita división por cero si por algún motivo PJ==0

    puntos = sub["Puntos"].sum()
    t2a, t2i = sub["T2A"].sum(), sub["T2I"].sum()
    t3a, t3i = sub["T3A"].sum(), sub["T3I"].sum()
    t1a, t1i = sub["T1A"].sum(), sub["T1I"].sum()
    dreb, oreb, treb = sub["DReb"].sum(), sub["OReb"].sum(), sub["TReb"].sum()
    ast, rec, per = sub["Asistencias"].sum(), sub["Recuperos"].sum(), sub["Perdidas"].sum()
    tap = sub["Tapones cometidos"].sum()
    val = sub["Valoracion"].sum()
    tci = t2i + t3i

    return {
        "pj": pj,
        "basicas": {
            "puntos_pp": _round(puntos / n),
            "rebotes_pp": _round(treb / n),
            "reb_ofensivo_pp": _round(oreb / n),
            "reb_defensivo_pp": _round(dreb / n),
            "asistencias_pp": _round(ast / n),
            "recuperos_pp": _round(rec / n),
            "perdidas_pp": _round(per / n),
            "tapones_pp": _round(tap / n),
            "valoracion_pp": _round(val / n),
            "t2": f"{int(t2a)}/{int(t2i)}", "t2_pct": _pct(t2a, t2i),
            "t3": f"{int(t3a)}/{int(t3i)}", "t3_pct": _pct(t3a, t3i),
            "tl": f"{int(t1a)}/{int(t1i)}", "tl_pct": _pct(t1a, t1i),
        },
        "avanzadas": {
            "efg_pct": _pct(t2a + 1.5 * t3a, tci),
            "ts_pct": _round(puntos / (2 * (tci + 0.44 * t1i)) * 100) if (tci + 0.44 * t1i) else None,
        },
    }


def stats_jugador(liga, nombre):
    """Busca jugador(es) por substring de nombre (sin distinguir acentos/mayúsculas)."""
    df = stats_df(liga)
    jugadores = df[df["Nombre completo"] != "TOTALES"].copy()
    q = _norm(nombre)
    mask = jugadores["Nombre completo"].apply(lambda s: q in _norm(s))
    matches = jugadores[mask]
    if matches.empty:
        return []

    resultados = []
    for (nombre_completo, equipo), sub in matches.groupby(["Nombre completo", "Equipo"]):
        stats = _player_row_stats(sub)
        resultados.append({
            "nombre": nombre_completo,
            "equipo": equipo,
            **stats,
        })
    resultados.sort(key=lambda r: r["basicas"]["puntos_pp"] or 0, reverse=True)
    return resultados


def stats_equipo(liga, nombre):
    """Busca equipo(s) por substring de nombre; agrega las filas TOTALES."""
    df = stats_df(liga)
    totales = df[df["Nombre completo"] == "TOTALES"].copy()
    q = _norm(nombre)
    mask = totales["Equipo"].apply(lambda s: q in _norm(s))
    matches = totales[mask]
    if matches.empty:
        return []

    resultados = []
    for equipo, sub in matches.groupby("Equipo"):
        pj = len(sub)
        ganados = int(sub["Ganado"].sum())
        perdidos = pj - ganados
        t2a, t2i = sub["T2A"].sum(), sub["T2I"].sum()
        t3a, t3i = sub["T3A"].sum(), sub["T3I"].sum()
        t1a, t1i = sub["T1A"].sum(), sub["T1I"].sum()

        # puntos recibidos: busca en el CSV la fila TOTALES del rival en la misma fecha
        opp_pts = []
        for _, row in sub.iterrows():
            rival_row = totales[(totales["Fecha"] == row["Fecha"]) & (totales["Equipo"] == row["Rival"])]
            if not rival_row.empty:
                opp_pts.append(rival_row.iloc[0]["Puntos"])
        pts_recibidos_pp = _round(sum(opp_pts) / len(opp_pts)) if opp_pts else None

        resultados.append({
            "equipo": equipo,
            "pj": pj,
            "ganados": ganados,
            "perdidos": perdidos,
            "puntos_pp": _round(sub["Puntos"].sum() / pj),
            "puntos_recibidos_pp": pts_recibidos_pp,
            "rebotes_pp": _round(sub["TReb"].sum() / pj),
            "asistencias_pp": _round(sub["Asistencias"].sum() / pj),
            "t2": f"{int(t2a)}/{int(t2i)}", "t2_pct": _pct(t2a, t2i),
            "t3": f"{int(t3a)}/{int(t3i)}", "t3_pct": _pct(t3a, t3i),
            "tl": f"{int(t1a)}/{int(t1i)}", "tl_pct": _pct(t1a, t1i),
        })
    return resultados


def lideres_liga(liga, categoria, n=5):
    if categoria not in CATEGORIAS:
        raise ValueError(f'Categoría inválida: "{categoria}". Usar una de: {list(CATEGORIAS)}')

    df = stats_df(liga)
    jugadores = df[df["Nombre completo"] != "TOTALES"]
    col, tipo, min_att = CATEGORIAS[categoria]

    filas = []
    for (nombre_completo, equipo), sub in jugadores.groupby(["Nombre completo", "Equipo"]):
        pj = int((sub["Segundos jugados"] > 0).sum())
        if pj < MIN_PJ_LEADERS:
            continue
        if tipo == "sum_per_game":
            valor = _round(sub[col].sum() / pj)
        else:
            made_col, att_col = col
            made, att = sub[made_col].sum(), sub[att_col].sum()
            if att < min_att:
                continue
            valor = _pct(made, att)
        if valor is None:
            continue
        filas.append({"jugador": nombre_completo, "equipo": equipo, "pj": pj, "valor": valor})

    filas.sort(key=lambda r: r["valor"], reverse=True)
    return filas[:n]
