# CLAUDE_MODELOS.md — Modelos

Documentación técnica de los modelos de similitud entre jugadores. El modelo de predicción de victorias (regresión logística) se eliminó en noviembre 2026.

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

---

## Análisis de Kilómetros Viajados

### Descripción

Script determinístico que calcula los kilómetros recorridos por cada equipo durante la temporada regular, con optimización de "Giras" (road trips).

**Archivo:** `liga_argentina/travel_km.py`  
**Datos geográficos:** `docs/ciudades_equipos.csv`

### Concepto de Gira

Una **Gira** es una secuencia de 2 o más partidos de visitante consecutivos (sin partido de local en el medio) donde el tiempo entre partidos consecutivos es **menor a 7 días**.

Para una gira, el equipo no regresa a su ciudad entre partidos:

- **Partido suelto:** `home → city → home` (ida y vuelta simple)
- **Gira de 2:** `home → cityA → cityB → home`
- **Gira de N:** `home → city1 → city2 → ... → cityN → home`

El umbral configurable está en la constante `GIRA_MAX_DAYS = 7` al inicio del script.

### Fuente de datos

| Archivo | Descripción |
|---|---|
| `docs/ciudades_equipos.csv` | Base geográfica: equipo, ciudad, provincia, lat, lng |
| `docs/liga_nacional/liga_nacional.csv` | Stats Liga Nacional (se filtran filas `TOTALES`) |
| `docs/liga_argentina/liga_argentina.csv` | Stats Liga Argentina (se filtran filas `TOTALES`) |

`ciudades_equipos.csv` tiene una fila por equipo con columnas: `liga, equipo, ciudad, provincia, lat, lng`. Cubre 19 equipos de Liga Nacional y 34 de Liga Argentina. El nombre en `equipo` debe coincidir exactamente con el campo `Equipo` y `Rival` del CSV de stats (incluye tildes).

### Algoritmo

1. Para cada equipo, ordenar su cronograma por fecha.
2. Recorrer los partidos secuencialmente:
   - **Local** → no genera km, avanzar al siguiente.
   - **Visitante** → intentar extender a gira: mientras el siguiente partido también sea visitante, el `Rival` esté en `ciudades_equipos.csv`, y haya < `GIRA_MAX_DAYS` días de diferencia, agregar al segmento.
3. Calcular km del segmento con Haversine y la ruta óptima (sin volver a casa hasta el final de la gira).

### Funciones clave

- `haversine_km(lat1, lon1, lat2, lon2)` — distancia geodésica entre dos puntos (R = 6371 km).
- `segment_km(home_lat, home_lon, city_coords)` — ruta completa de un viaje: `home → c1 → c2 → ... → home`.

### Configuración

```python
GIRA_MAX_DAYS = 7   # días máximos entre dos partidos para ser parte de la misma gira

LIGAS = {
    "Liga Nacional": { "cutoff": "2026-04-24" },  # solo temporada regular (excluye playoffs desde 24/04)
    "Liga Argentina": { "cutoff": "2026-03-30" },  # solo temporada regular (excluye playoffs desde 30/03)
}
```

### Columnas del resultado

| Columna | Descripción |
|---|---|
| `Equipo` | Nombre del equipo |
| `Ciudad` | Ciudad base del equipo |
| `PJ` | Partidos jugados |
| `Local` | Partidos de local |
| `Visitante` | Partidos de visitante |
| `Giras` | Número de road trips (secuencias de 2+ partidos fuera) |
| `KM total` | Total de kilómetros viajados en la temporada |
| `KM/part. visit.` | Kilómetros promedio por partido de visitante |

### Ejecución

```bash
# Desde la carpeta liga_argentina/
python travel_km.py
```

Imprime una tabla por liga ordenada por KM total descendente, con resumen de totales y giras detectadas.

### Supuestos documentados

1. **Ciudad base, no estadio** — la referencia geográfica es la ciudad del equipo, no el estadio específico. Equipos de la misma ciudad (ej. BOCA, OBRAS, SAN LORENZO, FERRO en Buenos Aires) comparten coordenadas; partidos entre ellos contribuyen 0 km al visitante.
2. **Gira sin tope de partidos** — no hay límite máximo de partidos por gira; la agrupación continúa mientras se cumplan las condiciones.
3. **Rival desconocido corta la gira** — si el rival de un partido visitante no está en `ciudades_equipos.csv`, ese partido se omite del cálculo de km y no puede extender la gira.
4. **Corte Liga Nacional = `2026-04-24`** — primer día de playoffs (24/04); se incluyen partidos hasta el 23/04 inclusive. La temporada regular terminó el 23/04/2026 (36 fechas, 19 equipos, 18L/18V cada uno).
5. **Corte Liga Argentina = `2026-03-30`** — primer día de playoffs (30/03); se incluyen partidos hasta el 29/03 inclusive. La temporada regular terminó el 29/03/2026 (32 fechas, 34 equipos, 16L/16V cada uno).
