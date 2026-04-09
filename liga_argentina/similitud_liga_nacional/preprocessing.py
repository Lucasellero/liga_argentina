"""
preprocessing.py — Carga y agrega el CSV de Liga Nacional a nivel jugador-temporada.
"""

import pandas as pd

import os as _os
CSV_PATH = _os.path.join(_os.path.dirname(__file__), "..", "docs", "liga_nacional", "liga_nacional.csv")

RENAME = {
    "Nombre completo": "player_name",
    "Equipo":          "team",
    "Segundos jugados":"seconds",
    "Puntos":          "points",
    "T2A":             "FGM2",
    "T2I":             "FGA2",
    "T3A":             "3PM",
    "T3I":             "3PA",
    "T1A":             "FTM",
    "T1I":             "FTA",
    "DReb":            "DREB",
    "OReb":            "OREB",
    "TReb":            "TRB",
    "Asistencias":     "AST",
    "Recuperos":       "STL",
    "Perdidas":        "TOV",
    "Tapones cometidos": "BLK",
    "Faltas Cometidas":  "PF",
}

MIN_MINUTES = 200


def _assign_season(date_series: pd.Series) -> pd.Series:
    dt = pd.to_datetime(date_series, dayfirst=True)
    return dt.apply(
        lambda d: f"{d.year-1}/{d.year}" if d.month < 7 else f"{d.year}/{d.year+1}"
    )


def load_player_seasons(csv_path: str = CSV_PATH) -> pd.DataFrame:
    """
    Lee el CSV, descarta la fila agregada 'TOTALES', agrega por jugador-temporada
    y filtra jugadores con menos de MIN_MINUTES minutos.

    Retorna un DataFrame con columnas estandarizadas listo para feature_engineering.
    """
    raw = pd.read_csv(csv_path)

    # Quitar fila de totales de equipo
    raw = raw[raw["Nombre completo"] != "TOTALES"].copy()

    raw["season"] = _assign_season(raw["Fecha"])
    raw = raw.rename(columns=RENAME)

    # FGM total = T2A + T3A
    raw["FGM"] = raw["FGM2"] + raw["3PM"]
    raw["FGA"] = raw["FGA2"] + raw["3PA"]

    agg_cols = {
        "team":   "last",
        "seconds":"sum",
        "points": "sum",
        "FGM":    "sum",
        "FGA":    "sum",
        "3PM":    "sum",
        "3PA":    "sum",
        "FTM":    "sum",
        "FTA":    "sum",
        "DREB":   "sum",
        "OREB":   "sum",
        "TRB":    "sum",
        "AST":    "sum",
        "STL":    "sum",
        "TOV":    "sum",
        "BLK":    "sum",
        "PF":     "sum",
    }

    df = (
        raw
        .groupby(["player_name", "season"], as_index=False)
        .agg(agg_cols)
    )

    df["minutes"] = df["seconds"] / 60.0
    df = df[df["minutes"] >= MIN_MINUTES].reset_index(drop=True)

    return df
