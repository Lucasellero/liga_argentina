# CLAUDE_MODELOS.md — Modelos de Predicción

Documentación técnica de los modelos de machine learning del proyecto.
Aplica solo a los scripts de predicción; el dashboard y los scrapers tienen sus propias convenciones en `CLAUDE.md`.

---

## Estado actual

| Liga | Archivo | Modelo | Estado |
|---|---|---|---|
| Liga Nacional | `liga_argentina/modelo_liga_nacional.py` | Logistic Regression | ✅ Funcional |
| Liga Nacional | `liga_argentina/similitud_liga_nacional/` | Cosine Similarity | ✅ Funcional |
| Liga Argentina | — | — | No implementado |
| Liga Femenina | — | — | No implementado |

**Fuentes de datos usadas por el modelo actual:**
- `liga_nacional.csv` — stats por jugador/partido (agrega a nivel equipo)
- `liga_nacional_pbp.csv` — play-by-play (pace + clutch)
- `liga_nacional_shots.csv` — shot map (calidad de tiro por zona)
- `fixture_upcoming.csv` — partidos por jugar (entrada de `predict_upcoming_games`)

---

## Arquitectura general

Todos los modelos siguen el mismo pipeline de siete funciones:

```
load_data()
    ↓  agrega stats a nivel equipo/partido desde el CSV de stats
build_features()
    ↓  Four Factors, Ratings, Diferenciales in-game, rest_diff
build_pbp_features()
    ↓  pace y clutch_net_pts por partido/equipo desde PBP
build_shots_features()
    ↓  paint_rate, mid_rate, triple_rate, paint_efg desde shot map
build_rolling_features()
    ↓  rolling de todas las métricas anteriores, con shift(1) — sin leakage
train_model()
    ↓  split temporal 75/25, StandardScaler, LogisticRegression
evaluate_model()
```

El dataset tiene **una fila por (partido, equipo)** — dos filas por partido.
La variable target es `win` (1 = ganó, 0 = perdió).

---

## Fuente de datos

Los modelos leen los CSVs existentes en `docs/`. **No se crea ningún CSV nuevo.**
Toda la agregación y transformación ocurre en memoria.

| Liga | CSV stats | CSV PBP | CSV shots |
|---|---|---|---|
| Liga Nacional | `docs/liga_nacional/liga_nacional.csv` | `docs/liga_nacional/liga_nacional_pbp.csv` | `docs/liga_nacional/liga_nacional_shots.csv` |

**Archivos de salida del modelo:**
- `liga_argentina/modelo_liga_nacional_prod.pkl` — modelo serializado (joblib)
- `docs/liga_nacional/predicciones_upcoming.csv` — predicciones para partidos próximos

`load_data()` agrupa el CSV de stats por `(IdPartido, Equipo)` y suma las columnas de stats.
`build_pbp_features()` y `build_shots_features()` también devuelven una fila por `(id_partido, equipo)` y se joinean al DataFrame principal antes del rolling.

### Columnas usadas del CSV

| Campo interno | Columna CSV | Descripción |
|---|---|---|
| `pts` | `Puntos` | Puntos del jugador |
| `fgm2` | `T2A` | Dobles anotados |
| `fga2` | `T2I` | Dobles intentados |
| `tpm` | `T3A` | Triples anotados |
| `tpa` | `T3I` | Triples intentados |
| `ftm` | `T1A` | Libres anotados |
| `fta` | `T1I` | Libres intentados |
| `orb` | `OReb` | Rebotes ofensivos |
| `drb` | `DReb` | Rebotes defensivos |
| `tov` | `Perdidas` | Pérdidas de balón |
| `win` | `Ganado` | Resultado (bool → int) |
| `home` | `Condicion equipos` | `LOCAL` → 1, `VISITANTE` → 0 |

Si el CSV cambia los nombres de columnas, editar solo el bloque `COL = {...}` al inicio de cada script. El resto del código usa las claves internas.

---

## Features

### Métricas intermedias (calculadas en `build_features`)

```python
fgm  = fgm2 + tpm          # field goals totales anotados
fga  = fga2 + tpa          # field goals totales intentados
poss = fga - orb + tov + 0.44 * fta   # posesiones (fórmula Oliver)

efg      = (fgm + 0.5 * tpm) / fga    # effective FG%
tov_pct  = tov / poss                 # turnover rate
orb_pct  = orb / (orb + opp_drb)     # offensive rebound rate
ftr      = fta / fga                  # free throw rate

ortg = 100 * pts / poss               # offensive rating
drtg = 100 * opp_pts / opp_poss       # defensive rating
net_rating = ortg - drtg
```

Todas las divisiones usan `_safe_div()` que retorna `NaN` cuando el denominador es 0.
Las posesiones se clipean a `min=1` para evitar división por cero.

### Join con el rival

Para calcular métricas del rival (`opp_*`), `build_features()` hace un self-join del DataFrame:

```python
# CORRECTO: left.rival == opp.equipo
df.merge(opp, left_on=["id_partido", "rival"],
               right_on=["id_partido", "opp_equipo"])

# INCORRECTO (bug anterior): left.equipo == opp.equipo
# Eso juntaba cada equipo consigo mismo → delta_* ≈ 0
```

### Features finales

#### Grupo A — In-game (stats del partido actual)

> Útil para análisis retrospectivo. **Son leakage** para predicción pre-partido.

| Feature | Fórmula |
|---|---|
| `delta_efg` | `efg - opp_efg` |
| `delta_tov_pct` | `tov_pct - opp_tov_pct` |
| `delta_orb_pct` | `orb_pct - opp_orb_pct` |
| `delta_ftr` | `ftr - opp_ftr` |
| `delta_net_rating` | `net_rating - opp_net_rating` |

#### Grupo B — Pre-partido (sin leakage)

> Features genuinamente predictivas para partidos futuros.

**Contexto:**

| Feature | Descripción |
|---|---|
| `home` | 1 si el equipo juega de local |
| `rest_diff` | días de descanso propios − días de descanso del rival |

**Rolling de stats base** (`build_rolling_features` sobre métricas de `build_features`):

| Feature | Fuente |
|---|---|
| `rolling_net_rating_5` | promedio de `net_rating` últimos 5 partidos |
| `rolling_efg_5` | promedio de `efg` últimos 5 partidos |
| `rolling_tov_pct_5` | promedio de `tov_pct` últimos 5 partidos |

**Rolling de PBP** (`build_pbp_features` → `build_rolling_features`):

| Feature | Descripción |
|---|---|
| `rolling_pace_5` | posesiones promedio últimos 5 partidos (ritmo de juego) |
| `rolling_clutch_5` | diferencia de puntos anotados vs recibidos en Q4 ≤2min margen≤5, promedio 5 partidos |

`pace` se estima desde eventos PBP con la misma fórmula de Oliver: `FGA + TOV + 0.44·FTA`.
`clutch_net_pts` es 0 en partidos sin situación clutch (ganado o perdido sin llegar a ese escenario).

**Rolling de shot quality** (`build_shots_features` → `build_rolling_features`):

| Feature | Descripción |
|---|---|
| `rolling_paint_rate_5` | % de tiros desde la pintura (zonas Z1, FRANJA) últimos 5 |
| `rolling_mid_rate_5` | % de tiros mid-range (Z2–Z9) últimos 5 |
| `rolling_triple_rate_5` | % de triples intentados (Z10–Z14) últimos 5 |
| `rolling_paint_efg_5` | eFG% dentro de la pintura últimos 5 partidos |

Las zonas del shot map: `PAINT_ZONES = {Z1-DE, Z1-IZ, FRANJA-*}`, `TRIPLE_ZONES = {Z10–Z14}`, el resto son mid-range.
Tiros con `Top_pct > 100` se descartan (artefactos del scraper).

Rolling construido con `shift(1).rolling(window, min_periods=1).mean()` por equipo, ordenado por fecha. El `shift(1)` garantiza que el partido actual no entra en su propio cálculo.

`rest_diff` asume **7 días** de descanso para el primer partido de cada equipo en la temporada (sin referencia previa).

---

## Modos de uso

El script define dos conjuntos de features y corre ambos al ejecutarse:

```python
FEATURE_COLS         # análisis: in-game + rolling (AUC ~0.998)
FEATURE_COLS_PREGAME # predicción: solo rolling + home + rest (AUC ~0.646)
```

Además guarda un **modelo de producción** en `modelo_liga_nacional_prod.pkl` entrenado sobre todos los datos disponibles (sin holdout). Este modelo se actualiza automáticamente cada vez que se ejecuta el script.

### Modo análisis (retrospectivo)

Usa todas las features. Útil para entender qué métricas diferencian ganadores y perdedores.
Los `delta_*` dominan los coeficientes porque son estadísticas del partido mismo.

```
delta_net_rating  5.52   ← más importante
delta_efg         1.74
delta_ftr         0.40
delta_orb_pct     0.34
home              0.18
```

### Modo predicción (pre-partido)

Usa solo features disponibles antes del partido. Métricas de referencia sobre el test set temporal (últimas ~38 jornadas de la temporada 2025/26):

| Métrica | Solo stats base | + PBP + Shots |
|---|---|---|
| Accuracy | ~0.575 | ~0.632 |
| ROC AUC | ~0.646 | ~0.618 |
| Log Loss | ~0.667 | ~0.673 |

> La accuracy sube con las nuevas features pero el AUC baja levemente, probablemente por multicolinealidad entre `rolling_efg_5` y `rolling_paint_efg_5`. Si se quisiera optimizar AUC, se puede eliminar una de las dos.

### Modelo de producción (dinámico)

El modelo de producción vive en `modelo_liga_nacional_prod.pkl`. Se diferencia del modelo de evaluación en que **entrena sobre todos los datos** (sin holdout), maximizando la información disponible para predicciones reales.

**Flujo de actualización** (post-scraper):

```bash
# 1. Actualizar CSVs con el scraper
python Scraper/data_scraper_nacional.py
python Scraper/pbp_scraper_nacional.py
python Scraper/shot_map_scraper_nacional.py

# 2. Reentrenar el modelo con los nuevos partidos
python3.11 liga_argentina/modelo_liga_nacional.py
# → imprime métricas de evaluación
# → guarda modelo_liga_nacional_prod.pkl
# → genera predicciones_upcoming.csv para el fixture próximo
```

O solo reentrenar sin ver las métricas:

```python
from liga_argentina.modelo_liga_nacional import retrain
retrain()   # carga CSVs, entrena sobre todo, guarda .pkl y predicciones_upcoming.csv
```

**Predecir desde otro script** (sin reentrenar):

```python
from liga_argentina.modelo_liga_nacional import load_model, predict_proba_game

model, scaler, features = load_model()
prob = predict_proba_game(model, scaler, features, {
    "home": 1,
    "rest_diff": 2,
    "rolling_net_rating_5": 4.3,
    "rolling_efg_5": 0.52,
    "rolling_tov_pct_5": 0.14,
    "rolling_pace_5": 85.0,
    "rolling_clutch_5": 1.2,
    "rolling_paint_rate_5": 0.40,
    "rolling_mid_rate_5": 0.15,
    "rolling_triple_rate_5": 0.45,
    "rolling_paint_efg_5": 0.60,
})
# → probabilidad de victoria entre 0.0 y 1.0
```

### Predicciones de partidos próximos (`predict_upcoming_games`)

Genera `docs/liga_nacional/predicciones_upcoming.csv` a partir de `fixture_upcoming.csv`.
Se ejecuta automáticamente al final de `retrain()` y de `__main__`.

```python
from liga_argentina.modelo_liga_nacional import predict_upcoming_games
predict_upcoming_games()  # lee fixture_upcoming.csv, escribe predicciones_upcoming.csv
```

**Columnas del CSV de salida:**

| Columna | Descripción |
|---|---|
| `fecha` | Fecha del partido (DD/MM/YYYY) |
| `local` | Nombre del equipo local |
| `visitante` | Nombre del equipo visitante |
| `prob_local` | Probabilidad de victoria del local (0.0–1.0) |
| `prob_visit` | `1 - prob_local` |

**Cómo se calculan los rolling features para el partido próximo:**

Para cada equipo se toman sus últimos 5 partidos reales y se promedian las fuentes de rolling (`net_rating`, `efg`, `tov_pct`, `pace`, `clutch_net_pts`, `paint_rate`, `mid_rate`, `triple_rate`, `paint_efg`). Esto equivale a lo que el rolling produciría para el partido N+1 del equipo.

`rest_diff` se calcula como `(fecha_partido − último_partido_local).days − (fecha_partido − último_partido_visita).days`.

Si una feature tiene NaN (equipo sin datos de PBP o shots), se imputa con la media de liga. Esto garantiza que siempre haya predicción disponible aunque falten datos parciales.

El CSV es consumido por el dashboard de Liga Nacional (`docs/liga_nacional/index.html`) para mostrar una barra de probabilidad en las cards de partidos próximos.

---

## Validación

**Split temporal puro** — no hay shuffle, no hay k-fold.

- Train: primeros 75% de filas ordenadas por fecha
- Test: últimos 25%
- La fecha de corte se imprime al ejecutar

Esto evita leakage temporal: el modelo nunca ve información futura durante el entrenamiento.

El train se hace sobre filas individuales (equipo/partido), no sobre partidos completos.
Dado que cada partido genera 2 filas (local y visitante), ambas filas del mismo partido pueden caer en el mismo split — esto es correcto y esperado.

---

## Modelo

```python
LogisticRegression(max_iter=1000, random_state=42)
```

- Regularización: L2, C=1 (default sklearn)
- Preprocesado: `StandardScaler` fitteado sobre train, aplicado a test
- `random_state=42` para reproducibilidad del solver

No se usa ningún otro modelo. Si en el futuro se quiere comparar, hacerlo en un script separado sin modificar este pipeline.

---

## Supuestos documentados

1. **Solo etapa `regular`** — el filtro está explícito en `load_data()`. Si el CSV incorpora playoffs, se excluyen automáticamente. Revisar si el valor de `Etapa` para playoffs cambia.
2. **Fórmula de posesiones de Oliver** — `poss = FGA - ORB + TOV + 0.44 * FTA`. Es una estimación; la cifra exacta requeriría datos de jugada a jugada.
3. **Primer partido del equipo** — se asume 7 días de descanso. Es un valor razonable para inicio de temporada pero es un supuesto.
4. **`min_periods=1` en rolling** — los primeros partidos calculan el promedio con menos de 5 observaciones. Para excluirlos del entrenamiento, cambiar a `min_periods=window` (más filas con NaN serán descartadas).
5. **Sin datos de lesiones ni rotaciones** — el modelo no sabe si un equipo juega sin titulares.
6. **Una temporada** — el CSV cubre desde septiembre 2025. El modelo no tiene datos de temporadas anteriores; el rolling de los primeros partidos es más ruidoso.

---

## Convenciones para nuevos modelos

Al implementar un modelo para otra liga (Liga Argentina, Liga Femenina, etc.):

- Crear un archivo nuevo: `modelo_<nombre_liga>.py`
- Copiar el pipeline base de `modelo_liga_nacional.py`
- Cambiar solo: `DATA_PATH`, el filtro de `etapa` en `load_data()`, y ajustar `COL` si los nombres de columna difieren
- Agregar una fila a la tabla de estado al inicio de este archivo
- No mezclar datos de distintas ligas en el mismo modelo

---

## Ejecución

```bash
# Requiere python 3.11+ con sklearn, pandas, numpy
python3.11 liga_argentina/modelo_liga_nacional.py
```

Imprime los resultados de ambos modos (análisis + predicción) con métricas y coeficientes.

---

## Modelo de Similitud — Liga Nacional

### Descripción

Modelo determinístico basado en distancia coseno en un espacio de features normalizadas.
Permite encontrar jugadores similares y comparar perfiles estadísticos entre dos jugadores.

**Archivo:** `liga_argentina/similitud_liga_nacional/`

```
similitud_liga_nacional/
├── __init__.py             # expone get_similar_players, compare_players, reload_model
├── preprocessing.py        # carga CSV → agrega por jugador-temporada → filtra ≥200 min
├── feature_engineering.py  # construye las 19 features + define FEATURE_WEIGHTS
├── normalization.py        # z-score (media/std de la población), imputa NaN → 0
├── similarity_model.py     # SimilarityModel: fit, get_similar_players, compare_players
└── queries.py              # interfaz pública con caché del modelo
```

### Fuente de datos

Lee `docs/liga_nacional/liga_nacional.csv` (mismo CSV que el modelo de predicción).
Agrega a nivel **jugador-temporada** — una fila por jugador por temporada.
Filtra jugadores con menos de 200 minutos.

### Features (19 en total)

| Grupo | Variables | Peso total |
|---|---|---|
| Scoring / volumen | `pts_per40`, `fga_per40` | 25% |
| Eficiencia | `ts_pct`, `efg_pct`, `3p_pct`, `ft_pct` | 25% |
| Playmaking | `ast_per40`, `ast_tov_ratio` | 20% |
| Rebote | `trb_per40`, `oreb_pct`, `dreb_pct` | 15% |
| Defensa | `stl_per40`, `blk_per40` | 10% |
| Shot profile | `3pa_rate`, `fta_rate` | 5% |
| Sin peso en similitud* | `tov_per40`, `3pa_per40`, `fta_per40`, `fg_pct` | — |

> *Disponibles para `compare_players` pero con peso 0 en el cálculo de similitud.

**Métricas de volumen:** por 40 minutos — `stat / minutes * 40`.
**`oreb_pct` / `dreb_pct`:** fracción de rebotes ofensivos/defensivos sobre el total del jugador (`OReb/TReb`, `DReb/TReb`). No es el OREB% NBA-style (que requiere posesiones de equipo).

### Normalización

Z-score: `z = (x − mean) / std`, calculado sobre la población filtrada de la misma temporada.
Features con desvío cero quedan en 0.
NaN (divisiones por cero, stats faltantes) se imputan con 0 = jugador promedio en esa dimensión.

### Similitud coseno ponderada

Los pesos se aplican via `sqrt(w)` sobre los vectores normalizados antes del producto punto:

```
weighted_vec = z_scores * sqrt(weights)
similarity(a, b) = cosine(weighted_vec_a, weighted_vec_b)
```

Esto garantiza que cada grupo de features contribuya exactamente con su peso definido.
El score final se expresa en escala 0–100.

### Filtros en tiempo de consulta

- Solo jugadores de la misma temporada que el jugador de referencia.
- El jugador de referencia se excluye del ranking de similares.
- Si el jugador tiene múltiples temporadas, se usa la más reciente salvo que se indique `season`.

### Uso

```python
from similitud_liga_nacional import get_similar_players, compare_players, reload_model

# Top 5 similares (misma temporada)
df = get_similar_players("COOPER, T.", n=5)
# → player_name, team, similarity_score (0–100),
#   pts_per40, ast_per40, trb_per40, stl_per40, blk_per40, ts_pct, 3pa_rate, ast_tov_ratio

# Comparar dos jugadores
cmp = compare_players("COOPER, T.", "MONACCHI, T.")
# → dict con: player_a, player_b, season_a, season_b,
#             features (DataFrame con value_a, value_b, diff_abs, diff_z),
#             most_similar (top 3 features), most_different (top 3 features)

# Forzar recarga tras actualizar el CSV
reload_model()
```

El modelo se cachea en memoria después del primer `fit()`. Llamar `reload_model()` al actualizar el CSV.

### Supuestos documentados

1. **Una sola temporada en el CSV actual** — el filtro por temporada está implementado pero solo hay datos de 2025/2026. Al agregar temporadas futuras, el modelo comparará correctamente dentro de cada una.
2. **`oreb_pct` y `dreb_pct` como fracción propia** — se usa `OReb/TReb` del jugador, no el OREB% convencional (que requiere posesiones de equipo). Esto es interpretable pero subestima el impacto real de reboteadores en equipos con muchos rebotes de equipo.
3. **Imputación con 0** — jugadores con cero intentos de triples tienen `3p_pct = NaN → 0`. Quedan en la media de liga en esa dimensión, lo que puede sobreestimar su similitud con tiradores promedio.
4. **`season` se infiere por año calendario** — meses ≥ julio se asignan al inicio de temporada (ej. septiembre 2025 → "2025/2026").
