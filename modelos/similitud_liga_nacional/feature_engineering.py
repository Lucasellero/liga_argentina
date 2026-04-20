"""
feature_engineering.py — Construye todas las features del modelo de similitud.

Todas las métricas de volumen se expresan por 40 minutos.
Las métricas de eficiencia son porcentajes o ratios.
"""

import numpy as np
import pandas as pd

# Orden canónico de features
FEATURES = [
    # Volumen / 40 min
    "pts_per40",
    "fga_per40",
    "ast_per40",
    "trb_per40",
    "stl_per40",
    "blk_per40",
    "tov_per40",
    "3pa_per40",
    "fta_per40",
    # Eficiencia
    "fg_pct",
    "3p_pct",
    "ft_pct",
    "efg_pct",
    "ts_pct",
    # Playmaking
    "ast_tov_ratio",
    # Shot profile
    "3pa_rate",
    "fta_rate",
    # Rebote avanzado
    "oreb_pct",
    "dreb_pct",
]

# Pesos por grupo, distribuidos uniformemente entre sus variables
_WEIGHTS_RAW = {
    "pts_per40":     0.25 / 2,
    "fga_per40":     0.25 / 2,
    "ts_pct":        0.25 / 4,
    "efg_pct":       0.25 / 4,
    "3p_pct":        0.25 / 4,
    "ft_pct":        0.25 / 4,
    "ast_per40":     0.20 / 2,
    "ast_tov_ratio": 0.20 / 2,
    "trb_per40":     0.15 / 3,
    "oreb_pct":      0.15 / 3,
    "dreb_pct":      0.15 / 3,
    "stl_per40":     0.10 / 2,
    "blk_per40":     0.10 / 2,
    "3pa_rate":      0.05 / 2,
    "fta_rate":      0.05 / 2,
    # No ponderadas explícitamente — las incluimos con peso 0 para mantener
    # disponibles en explain; el modelo de similitud solo usa las de arriba.
    "tov_per40":     0.0,
    "3pa_per40":     0.0,
    "fta_per40":     0.0,
    "fg_pct":        0.0,
}

FEATURE_WEIGHTS = {f: _WEIGHTS_RAW[f] for f in FEATURES}


def _per40(stat: pd.Series, minutes: pd.Series) -> pd.Series:
    return (stat / minutes) * 40.0


def _safe_div(num: pd.Series, den: pd.Series) -> pd.Series:
    return num.where(den > 0, other=np.nan) / den.where(den > 0, other=np.nan)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Recibe el DataFrame agregado de preprocessing y devuelve uno con las
    columnas de FEATURES calculadas, conservando player_name, team, season
    y minutes.
    """
    m = df["minutes"]

    out = df[["player_name", "team", "season", "minutes"]].copy()

    # Volumen por 40
    out["pts_per40"]  = _per40(df["points"], m)
    out["fga_per40"]  = _per40(df["FGA"],    m)
    out["ast_per40"]  = _per40(df["AST"],    m)
    out["trb_per40"]  = _per40(df["TRB"],    m)
    out["stl_per40"]  = _per40(df["STL"],    m)
    out["blk_per40"]  = _per40(df["BLK"],    m)
    out["tov_per40"]  = _per40(df["TOV"],    m)
    out["3pa_per40"]  = _per40(df["3PA"],    m)
    out["fta_per40"]  = _per40(df["FTA"],    m)

    # Eficiencia
    out["fg_pct"]  = _safe_div(df["FGM"], df["FGA"])
    out["3p_pct"]  = _safe_div(df["3PM"], df["3PA"])
    out["ft_pct"]  = _safe_div(df["FTM"], df["FTA"])
    out["efg_pct"] = _safe_div(df["FGM"] + 0.5 * df["3PM"], df["FGA"])
    out["ts_pct"]  = _safe_div(df["points"], 2 * (df["FGA"] + 0.44 * df["FTA"]))

    # Playmaking
    out["ast_tov_ratio"] = _safe_div(df["AST"], df["TOV"])

    # Shot profile
    out["3pa_rate"] = _safe_div(df["3PA"], df["FGA"])
    out["fta_rate"] = _safe_div(df["FTA"], df["FGA"])

    # Rebote avanzado (fracción del total de rebotes del jugador)
    out["oreb_pct"] = _safe_div(df["OREB"], df["TRB"])
    out["dreb_pct"] = _safe_div(df["DREB"], df["TRB"])

    return out
