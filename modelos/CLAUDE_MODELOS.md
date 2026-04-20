# CLAUDE_MODELOS.md — Modelos de Predicción

Documentación técnica de los modelos de machine learning del proyecto.
Aplica solo a los scripts de predicción; el dashboard y los scrapers tienen sus propias convenciones en `CLAUDE.md`.

---

## Estado actual

| Liga | Archivo | Modelo | Estado |
|---|---|---|---|
| Liga Nacional | `liga_argentina/modelos/modelo_liga_nacional.py` | Logistic Regression | ✅ Funcional |
| Liga Nacional | `liga_argentina/modelos/similitud_liga_nacional/` | Cosine Similarity | ✅ Funcional |
| Liga Argentina | `liga_argentina/modelos/similitud_liga_argentina/` | Cosine Similarity | ✅ Funcional |
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
- `liga_argentina/modelos/modelo_liga_nacional_prod.pkl` — modelo serializado (joblib)
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

| Feature | Fuente | En modelo |
|---|---|---|
| `rolling_net_rating_5` | promedio de `net_rating` últimos 5 partidos | ✅ |
| `rolling_efg_5` | promedio de `efg` últimos 5 partidos | ❌ colineal con net_rating (r=0.58) |
| `rolling_tov_pct_5` | promedio de `tov_pct` últimos 5 partidos | ❌ capturado por net_rating |
| `rolling_orb_pct_5` | rebote ofensivo % (orb / (orb + opp_drb)) últimos 5 | ❌ señal capturada por net_rating |
| `rolling_drb_pct_5` | rebote defensivo % (drb / (drb + orb)) últimos 5 | ❌ señal capturada por net_rating |

**Rolling de forma reciente** (calculado en `_build_feature_df`):

| Feature | Fuente | En modelo |
|---|---|---|
| `rolling_win_5` | promedio de victorias de los últimos 5 partidos | ✅ |

**Rolling de triples** (calculado en `build_rolling_features` sobre `tpt_pct = tpm/tpa`):

| Feature | Fuente | En modelo |
|---|---|---|
| `rolling_3pt_pct_5` | % de conversión en triples (tpm/tpa) últimos 5 | ✅ |
| `rolling_triple_rate_5` | % de triples intentados sobre total de tiros | ❌ volumen, no eficiencia |

**Rolling de PBP** (`build_pbp_features` → `build_rolling_features`):

| Feature | Descripción | En modelo |
|---|---|---|
| `rolling_pace_5` | posesiones promedio últimos 5 partidos (ritmo de juego) | ❌ r=+0.03 con win |
| `rolling_clutch_5` | diferencia de puntos en Q4 ≤2min margen≤5, promedio 5 partidos | ❌ r=−0.01 con win |

`pace` se estima desde eventos PBP con la misma fórmula de Oliver: `FGA + TOV + 0.44·FTA`.
`clutch_net_pts` es 0 en partidos sin situación clutch (ganado o perdido sin llegar a ese escenario).

**Rolling de shot quality** (`build_shots_features` → `build_rolling_features`):

| Feature | Descripción | En modelo |
|---|---|---|
| `rolling_paint_rate_5` | % de tiros desde la pintura (zonas Z1, FRANJA) últimos 5 | ❌ colineal con mid_rate (r=−0.83) |
| `rolling_mid_rate_5` | % de tiros mid-range (Z2–Z9) últimos 5 | ❌ colineal con paint_rate |
| `rolling_triple_rate_5` | % de triples intentados (Z10–Z14) últimos 5 | ❌ ver arriba |
| `rolling_paint_efg_5` | eFG% dentro de la pintura últimos 5 partidos | ✅ |

Las zonas del shot map: `PAINT_ZONES = {Z1-DE, Z1-IZ, FRANJA-*}`, `TRIPLE_ZONES = {Z10–Z14}`, el resto son mid-range.
Tiros con `Top_pct > 100` se descartan (artefactos del scraper).

**Rebotes: por qué no aportan señal independiente**

`rolling_orb_pct_5` y `rolling_drb_pct_5` fueron evaluados con CV temporal y no mejoran el AUC (0.6156 vs 0.6229 del core solo). Los rebotes ya están implícitos en `net_rating`: más rebotes ofensivos generan más posesiones → mejor ortg; más defensivos reducen las del rival → mejor drtg. Agregar ambas métricas de forma explícita introduce ruido redundante.

Rolling construido con `shift(1).ewm(span=EWM_SPAN, min_periods=1).mean()` por equipo, ordenado por fecha.
- El `shift(1)` garantiza que el partido actual no entra en su propio cálculo (anti-leakage).
- El EWM pondera exponencialmente: los partidos más recientes pesan más que los históricos.
- `EWM_SPAN = 10` es el valor calibrado por cross-validation temporal (5 folds). Con span=10 → `alpha ≈ 0.18`: el partido más reciente pesa ~18%, el anterior ~15%, y así sucesivamente.
- Calibrado probando spans 2, 3, 4, 5, 7, 10, 15, 20 — span=10 maximiza CV AUC (0.590) con varianza controlada (std=0.064). Spans bajos (2-3) son demasiado reactivos; spans altos (15-20) se aproximan al promedio simple y pierden la señal de recencia.

`rest_diff` asume **7 días** de descanso para el primer partido de cada equipo en la temporada (sin referencia previa).

---

## Modos de uso

El script define dos conjuntos de features y corre ambos al ejecutarse:

```python
FEATURE_COLS         # análisis: in-game + rolling (AUC ~0.998)
FEATURE_COLS_PREGAME # predicción: solo rolling + home + rest (AUC ~0.637 split, 0.590 CV)
```

Además guarda un **modelo de producción** en `modelo_liga_nacional_prod.pkl` entrenado sobre todos los datos disponibles (sin holdout). Este modelo se actualiza automáticamente cada vez que se ejecuta el script o se llama a `retrain()`.

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

Usa solo features disponibles antes del partido. Métricas de referencia con EWM span=10 (split 75/25 temporal, temporada 2025/26):

| Métrica | Modelo anterior (11 feats) | Modelo actual (5 feats) | Δ |
|---|---|---|---|
| Accuracy | 0.625 | 0.613 | −0.012 |
| ROC AUC | 0.638 | 0.629 | −0.009 |
| Log Loss | 0.662 | 0.669 | +0.007 |

> El test split 75/25 favorece marginalmente al modelo anterior porque su test window específico benefició más features. La CV temporal (métrica más robusta) muestra mejora clara en el modelo actual.

**Cross-validation temporal (5 folds, TimeSeriesSplit) — modelo actual:**

| Fold | Train | Test | Accuracy | AUC | LogLoss | Período test |
|---|---|---|---|---|---|---|
| 1 | 107 | 106 | 0.604 | 0.639 | 0.662 | hasta dic-25 |
| 2 | 213 | 106 | 0.528 | 0.560 | 0.697 | hasta ene-26 |
| 3 | 319 | 106 | 0.642 | 0.685 | 0.653 | hasta feb-26 |
| 4 | 425 | 106 | 0.594 | 0.623 | 0.669 | hasta mar-26 |
| 5 | 531 | 106 | 0.613 | 0.613 | 0.676 | hasta abr-26 |
| **Media** | | | **0.596** | **0.624** | **0.671** | |
| **Desv.** | | | 0.038 | 0.041 | 0.015 | |

**Cross-validation temporal (5 folds) — modelo anterior (11 feats, referencia):**

| Media Accuracy | Media AUC | Media LogLoss |
|---|---|---|
| 0.577 | 0.597 | 0.695 |

El modelo actual mejora el CV AUC en +0.027 y la CV Accuracy en +0.019 usando menos de la mitad de features. La menor varianza en LogLoss (0.015 vs 0.035) indica también mayor estabilidad entre folds.

**Coeficientes estandarizados (referencia, pueden variar al reentrenar):**

| Feature | Coef | Interpretación |
|---|---|---|
| `home` | +0.368 | Ventaja de local — factor más importante |
| `rolling_net_rating_5` | +0.290 | Eficiencia global reciente (ortg − drtg) |
| `rolling_paint_efg_5` | +0.129 | Calidad de finalización en la zona más eficiente |
| `rolling_3pt_pct_5` | −0.085 | Dado un buen net_rating, alta dependencia de triples → más varianza → peor predictor |
| `rolling_win_5` | −0.110 | Dado un buen net_rating, rachas de victorias recientes tienden a revertir a la media |

Los coeficientes negativos de `rolling_3pt_pct_5` y `rolling_win_5` son esperables: condicionados a `net_rating`, las rachas de victorias y la alta eficiencia en triples capturan componentes de varianza que no se sostienen partido a partido (regresión a la media).

### Modelo de producción (dinámico — se actualiza con cada partido nuevo)

El modelo de producción vive en `modelo_liga_nacional_prod.pkl`. Se diferencia del modelo de evaluación en que **entrena sobre todos los datos** (sin holdout), maximizando la información disponible para predicciones reales.

**El modelo es completamente dinámico**: cada vez que se corren los scrapers y se reentrana, incorpora automáticamente todos los partidos nuevos. Los rolling EWM se recalculan sobre el historial actualizado, de modo que las predicciones siempre reflejan la forma más reciente de cada equipo.

**Flujo de actualización** (después de cada jornada):

```bash
# 1. Actualizar CSVs con los scrapers
python Scraper/data_scraper_nacional.py
python Scraper/pbp_scraper_nacional.py
python Scraper/shot_map_scraper_nacional.py

# 2. Reentrenar e incorporar partidos nuevos
python3.12 liga_argentina/modelos/modelo_liga_nacional.py
# → imprime métricas de evaluación y cross-validation
# → guarda modelos/modelo_liga_nacional_prod.pkl (entrenado sobre todos los datos)
# → genera predicciones_upcoming.csv para el fixture próximo
```

O solo reentrenar sin ver las métricas:

```python
from liga_argentina.modelos.modelo_liga_nacional import retrain
retrain()   # carga CSVs, entrena sobre todo, guarda .pkl y predicciones_upcoming.csv
```

**Predecir desde otro script** (sin reentrenar):

```python
from liga_argentina.modelos.modelo_liga_nacional import load_model, predict_proba_game

model, scaler, features = load_model()
prob = predict_proba_game(model, scaler, features, {
    "home": 1,
    "rolling_net_rating_5": 4.3,
    "rolling_win_5": 0.6,
    "rolling_paint_efg_5": 0.60,
    "rolling_3pt_pct_5": 0.34,
})
# → probabilidad de victoria entre 0.0 y 1.0
```

### Predicciones de partidos próximos (`predict_upcoming_games`)

Genera `docs/liga_nacional/predicciones_upcoming.csv` a partir de `fixture_upcoming.csv`.
Se ejecuta automáticamente al final de `retrain()` y de `__main__`.

```python
from liga_argentina.modelos.modelo_liga_nacional import predict_upcoming_games
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

Para cada equipo se toman sus últimos 5 partidos reales y se aplica EWM con `span=EWM_SPAN` sobre las fuentes de rolling (`net_rating`, `paint_efg`, `tpt_pct`). El valor resultante es el último de la serie EWM, que pondera el partido más reciente con ~18% del peso y decae exponencialmente hacia atrás. `rolling_win_5` se calcula como la media simple de victorias en los últimos 5 partidos (no EWM, ya que `win` es binario).

Esto es coherente con el EWM aplicado durante el entrenamiento: ambos usan `span=EWM_SPAN`, garantizando que la escala de las features en predicción sea la misma que aprendió el modelo.

`rest_diff` se calcula como `(fecha_partido − último_partido_local).days − (fecha_partido − último_partido_visita).days`.

Si una feature tiene NaN (equipo sin datos de PBP o shots), se imputa con la media de liga. Esto garantiza que siempre haya predicción disponible aunque falten datos parciales.

El CSV es consumido por el dashboard de Liga Nacional (`docs/liga_nacional/index.html`) para mostrar una barra de probabilidad en las cards de partidos próximos.

---

## Validación

Se usan dos métodos de evaluación complementarios:

### Split temporal 75/25

- Train: primeros 75% de filas ordenadas por fecha
- Test: últimos 25%
- La fecha de corte se imprime al ejecutar
- Útil para ver métricas en el período más reciente de la temporada

### Cross-validation temporal (`cross_validate_temporal`)

`TimeSeriesSplit` con 5 folds. Cada fold entrena sobre todos los partidos anteriores al corte y testea sobre los siguientes — nunca mezcla fechas futuras en el train.

```python
from liga_argentina.modelos.modelo_liga_nacional import cross_validate_temporal
cv = cross_validate_temporal(feat, feature_cols=FEATURE_COLS_PREGAME, n_splits=5)
# → imprime tabla por fold + media/desvío de Accuracy, AUC y LogLoss
# → retorna dict con arrays de métricas y sus estadísticos
```

Se usa para:
- Detectar **underfitting** (AUC consistentemente bajo en todos los folds)
- Detectar **overfitting** (AUC alto en split único pero bajo en CV)
- Calibrar hiperparámetros como `EWM_SPAN` (se probaron spans 2–20, ganó span=10)

El train se hace sobre filas individuales (equipo/partido), no sobre partidos completos.
Dado que cada partido genera 2 filas (local y visitante), ambas filas del mismo partido pueden caer en el mismo split — esto es correcto y esperado.

---

## Modelo

```python
LogisticRegression(max_iter=1000, random_state=42)
```

- Regularización: L2, C=1 (default sklearn). Se evaluaron C=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0] por CV temporal; la mejora de C=5 sobre C=1 es marginal (+0.002 AUC) y no justifica alejarse del default.
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
# Requiere python 3.10+ con sklearn, pandas, numpy, joblib
python3.12 liga_argentina/modelos/modelo_liga_nacional.py
```

Imprime los resultados de ambos modos (análisis + predicción) con métricas y coeficientes.

---

## Modelos de Similitud

Cada liga tiene su propio modelo de similitud independiente. **Los datos nunca se mezclan entre ligas.**

La normalización (media y desvío de cada feature) se calcula sobre la población de jugadores de esa liga. Un base de Liga Argentina con 20 pts/40 se compara contra el promedio de Liga Argentina; uno de Liga Nacional, contra el promedio de Liga Nacional. Esto garantiza que las similitudes sean significativas dentro del contexto de cada competencia.

| Liga | Paquete | CSV |
|---|---|---|
| Liga Nacional | `liga_argentina/similitud_liga_nacional/` | `docs/liga_nacional/liga_nacional.csv` |
| Liga Argentina | `liga_argentina/similitud_liga_argentina/` | `docs/liga_argentina.csv` |

**Regla para nuevas ligas:** crear una carpeta `similitud_<nombre_liga>/`, copiar los 5 archivos, cambiar solo `CSV_PATH` en `preprocessing.py` y `queries.py`. No reutilizar ni combinar instancias del modelo entre ligas.

---

## Modelo de Similitud — Liga Nacional

### Descripción

Modelo determinístico basado en distancia coseno en un espacio de features normalizadas.
Permite encontrar jugadores similares y comparar perfiles estadísticos entre dos jugadores.
**Solo compara jugadores de Liga Nacional contra jugadores de Liga Nacional.**

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

---

## Modelo de Similitud — Liga Argentina

### Descripción

Idéntico en arquitectura al modelo de Liga Nacional: similitud coseno ponderada sobre features normalizadas con z-score.
**Solo compara jugadores de Liga Argentina contra jugadores de Liga Argentina.**
Los percentiles y la similitud se calculan dentro de la población de Liga Argentina; los datos de ambas ligas no se mezclan.

**Archivo:** `liga_argentina/similitud_liga_argentina/`

```
similitud_liga_argentina/
├── __init__.py             # expone get_similar_players, compare_players, reload_model
├── preprocessing.py        # carga liga_argentina.csv → agrega por jugador-temporada → filtra ≥200 min
├── feature_engineering.py  # construye las 19 features + define FEATURE_WEIGHTS (idéntico a LN)
├── normalization.py        # z-score (media/std de la población de LA), imputa NaN → 0
├── similarity_model.py     # SimilarityModel: fit, get_similar_players, compare_players
└── queries.py              # interfaz pública con caché del modelo
```

### Fuente de datos

Lee `docs/liga_argentina.csv`.
Agrega a nivel **jugador-temporada** — una fila por jugador por temporada.
Filtra jugadores con menos de 200 minutos.

### Features y normalización

Idénticas al modelo de Liga Nacional (ver sección anterior). Los 19 features, los pesos y el algoritmo de similitud coseno son los mismos. La diferencia clave es que la normalización (media y desvío) se calcula sobre la **población de Liga Argentina**, no de Liga Nacional.

### Uso

```python
from liga_argentina.similitud_liga_argentina import get_similar_players, compare_players, reload_model

# Top 5 similares (misma temporada, dentro de Liga Argentina)
df = get_similar_players("MENDEZ, R.", n=5)
# → player_name, team, similarity_score (0–100),
#   pts_per40, ast_per40, trb_per40, stl_per40, blk_per40, ts_pct, 3pa_rate, ast_tov_ratio

# Comparar dos jugadores
cmp = compare_players("MENDEZ, R.", "LAGGER, O.")
# → dict con: player_a, player_b, season_a, season_b,
#             features (DataFrame con value_a, value_b, diff_abs, diff_z),
#             most_similar (top 3 features), most_different (top 3 features)

# Forzar recarga tras actualizar el CSV
reload_model()
```

El modelo se cachea en memoria después del primer `fit()`. Llamar `reload_model()` al actualizar el CSV.
