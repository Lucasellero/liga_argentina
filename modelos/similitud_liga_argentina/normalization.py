"""
normalization.py — Z-score standardization sobre las features del modelo.

La media y el desvío se calculan sobre la población completa filtrada
(misma que se pasa como argumento). NaN se imputan con 0 después de
normalizar (equivale al jugador promedio en esa dimensión).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .feature_engineering import FEATURES


def normalize(df: pd.DataFrame) -> "tuple[pd.DataFrame, dict]":
    """
    Aplica z-score a cada feature en FEATURES sobre el DataFrame df.

    Devuelve:
        normalized_df : DataFrame con las mismas columnas, valores estandarizados.
        params        : dict {feature: {"mean": float, "std": float}} para
                        auditoría / serialización.
    """
    result = df.copy()
    params = {}

    for feat in FEATURES:
        col = df[feat]
        mean = col.mean()
        std  = col.std(ddof=0)

        params[feat] = {"mean": float(mean), "std": float(std)}

        if std > 0:
            result[feat] = (col - mean) / std
        else:
            # Desvío cero: todos los jugadores tienen el mismo valor → feature constante
            result[feat] = 0.0

        # Imputar NaN (divisiones por cero, stats faltantes) con 0 = jugador promedio
        result[feat] = result[feat].fillna(0.0)

    return result, params
