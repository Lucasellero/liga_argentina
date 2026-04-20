"""
queries.py — Interfaz de alto nivel para consultas de similitud.

Instancia y cachea el modelo globalmente para evitar recarga en cada consulta.
"""

from __future__ import annotations

import os
from typing import Optional
import pandas as pd

from .similarity_model import SimilarityModel

_DEFAULT_CSV = os.path.join(
    os.path.dirname(__file__),
    "..", "docs", "liga_nacional", "liga_nacional.csv"
)

_model: SimilarityModel | None = None


def _get_model(csv_path: str = _DEFAULT_CSV) -> SimilarityModel:
    global _model
    if _model is None:
        _model = SimilarityModel().fit(csv_path)
    return _model


def reload_model(csv_path: str = _DEFAULT_CSV) -> None:
    """Fuerza recarga del modelo (útil al actualizar el CSV)."""
    global _model
    _model = SimilarityModel().fit(csv_path)


def get_similar_players(
    player_name: str,
    n: int = 5,
    season: Optional[str] = None,
    csv_path: str = _DEFAULT_CSV,
) -> pd.DataFrame:
    """
    Devuelve los n jugadores más similares a player_name en la misma temporada.

    Parámetros
    ----------
    player_name : str   e.g. "COOPER, T."
    n           : int   cantidad de similares a devolver (default 5)
    season      : Optional[str]   e.g. "2025/2026". Si None, usa la más reciente.

    Retorna
    -------
    pd.DataFrame con columnas:
        player_name, team, similarity_score (0–100),
        pts_per40, ast_per40, trb_per40, stl_per40, blk_per40,
        ts_pct, 3pa_rate, ast_tov_ratio
    """
    return _get_model(csv_path).get_similar_players(player_name, n, season)


def compare_players(
    player_a: str,
    player_b: str,
    season: Optional[str] = None,
    csv_path: str = _DEFAULT_CSV,
) -> dict:
    """
    Compara dos jugadores en todas las features.

    Retorna dict con:
        player_a, player_b, season_a, season_b,
        features      : pd.DataFrame [feature, value_a, value_b, diff_abs, diff_z]
        most_similar  : list[str] — top 3 features más parecidas
        most_different: list[str] — top 3 features más distintas
    """
    return _get_model(csv_path).compare_players(player_a, player_b, season)
