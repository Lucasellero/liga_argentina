"""
similarity_model.py — Cosine similarity con pesos sobre features normalizadas.

Pipeline completo: carga → features → normalización → matriz de similitud.
"""

from __future__ import annotations

from typing import Optional
import numpy as np
import pandas as pd

from .preprocessing       import load_player_seasons
from .feature_engineering import build_features, FEATURES, FEATURE_WEIGHTS
from .normalization       import normalize


def _weighted_vectors(norm_df: pd.DataFrame) -> np.ndarray:
    """Aplica sqrt(weight) a cada columna para que el producto punto resulte
    en la similitud coseno ponderada."""
    mat = norm_df[FEATURES].values.astype(float)
    w   = np.array([FEATURE_WEIGHTS[f] for f in FEATURES])
    return mat * np.sqrt(w)


def _cosine_similarity(vec: np.ndarray, mat: np.ndarray) -> np.ndarray:
    """Similitud coseno entre un vector y cada fila de una matriz."""
    num   = mat @ vec
    denom = np.linalg.norm(mat, axis=1) * np.linalg.norm(vec)
    with np.errstate(invalid="ignore", divide="ignore"):
        sim = np.where(denom > 0, num / denom, 0.0)
    return sim


class SimilarityModel:
    """
    Modelo de similitud entre jugadores de Liga Argentina.

    Uso:
        model = SimilarityModel()
        model.fit(csv_path)
        similar = model.get_similar_players("MENDEZ, R.", n=5)
        diff    = model.compare_players("MENDEZ, R.", "LAGGER, O.")
    """

    def __init__(self):
        self._feat_df:  Optional[pd.DataFrame] = None
        self._norm_df:  Optional[pd.DataFrame] = None
        self._wvecs:    Optional[np.ndarray]   = None
        self._params:   Optional[dict]         = None
        self._seasons:  Optional[list]         = None

    # ------------------------------------------------------------------
    # Ajuste
    # ------------------------------------------------------------------

    def fit(self, csv_path: str) -> "SimilarityModel":
        raw      = load_player_seasons(csv_path)
        feat_df  = build_features(raw)
        norm_df, params = normalize(feat_df)

        self._feat_df = feat_df.reset_index(drop=True)
        self._norm_df = norm_df.reset_index(drop=True)
        self._wvecs   = _weighted_vectors(norm_df)
        self._params  = params
        self._seasons = sorted(feat_df["season"].unique().tolist())
        return self

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    def _require_fit(self):
        if self._feat_df is None:
            raise RuntimeError("Llamar a fit() antes de usar el modelo.")

    def _find_player(self, player_name: str, season: Optional[str] = None) -> int:
        """Devuelve el índice del jugador. Si season es None, usa la más reciente."""
        mask = self._feat_df["player_name"] == player_name
        if season:
            mask &= self._feat_df["season"] == season
        idxs = self._feat_df[mask].index.tolist()
        if not idxs:
            available = self._feat_df["player_name"].unique().tolist()
            raise ValueError(
                f"Jugador '{player_name}' no encontrado"
                + (f" en temporada '{season}'" if season else "")
                + f". Jugadores disponibles: {sorted(available)}"
            )
        return self._feat_df.loc[idxs, "season"].idxmax()

    def _season_of(self, idx: int) -> str:
        return self._feat_df.at[idx, "season"]

    # ------------------------------------------------------------------
    # Consultas públicas
    # ------------------------------------------------------------------

    def get_similar_players(
        self,
        player_name: str,
        n: int = 5,
        season: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Retorna los n jugadores más similares al jugador dado en la misma temporada.

        Columnas devueltas:
            player_name, team, similarity_score,
            pts_per40, ast_per40, trb_per40, stl_per40, blk_per40,
            ts_pct, 3pa_rate, ast_tov_ratio
        """
        self._require_fit()
        ref_idx  = self._find_player(player_name, season)
        ref_seas = self._season_of(ref_idx)

        mask  = (self._feat_df["season"] == ref_seas).values
        idxs  = np.where(mask)[0]

        ref_vec   = self._wvecs[ref_idx]
        pool_vecs = self._wvecs[idxs]
        sims      = _cosine_similarity(ref_vec, pool_vecs)

        ref_pos = np.where(idxs == ref_idx)[0]
        if ref_pos.size:
            sims[ref_pos[0]] = -999.0

        top_k    = np.argsort(sims)[::-1][:n]
        top_idxs = idxs[top_k]

        STAT_COLS = [
            "player_name", "team",
            "pts_per40", "ast_per40", "trb_per40",
            "stl_per40", "blk_per40",
            "ts_pct", "3pa_rate", "ast_tov_ratio",
        ]
        result = self._feat_df.loc[top_idxs, STAT_COLS].copy()
        result.insert(2, "similarity_score", (sims[top_k] * 100).round(1))
        return result.reset_index(drop=True)

    def compare_players(
        self,
        player_a: str,
        player_b: str,
        season: Optional[str] = None,
    ) -> dict:
        """
        Compara dos jugadores feature por feature.

        Retorna un dict con:
            features    : DataFrame con columnas [feature, value_a, value_b, diff_abs, diff_z]
            most_similar: list[str] — top 3 features donde son más parecidos
            most_different: list[str] — top 3 features donde más difieren
        """
        self._require_fit()
        idx_a = self._find_player(player_a, season)
        idx_b = self._find_player(player_b, season)

        raw_a = self._feat_df.loc[idx_a, FEATURES]
        raw_b = self._feat_df.loc[idx_b, FEATURES]
        z_a   = self._norm_df.loc[idx_a, FEATURES]
        z_b   = self._norm_df.loc[idx_b, FEATURES]

        diff_z = (z_a - z_b).abs()

        rows = []
        for feat in FEATURES:
            rows.append({
                "feature":  feat,
                "value_a":  round(float(raw_a[feat]), 3),
                "value_b":  round(float(raw_b[feat]), 3),
                "diff_abs": round(abs(float(raw_a[feat]) - float(raw_b[feat])), 3),
                "diff_z":   round(float(diff_z[feat]), 3),
            })

        feat_df = pd.DataFrame(rows)

        most_similar   = feat_df.nsmallest(3, "diff_z")["feature"].tolist()
        most_different = feat_df.nlargest(3,  "diff_z")["feature"].tolist()

        return {
            "player_a":       player_a,
            "player_b":       player_b,
            "season_a":       self._season_of(idx_a),
            "season_b":       self._season_of(idx_b),
            "features":       feat_df,
            "most_similar":   most_similar,
            "most_different": most_different,
        }
