# CLAUDE.md — FIFA World Cup 2026 Stats (Privado)

## Proyecto
Dashboard privado de estadísticas avanzadas del **FIFA World Cup 2026**, basado en los reportes oficiales del [FIFA Training Centre](https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php).

- **URL**: `https://scouteado.com/fifa-wc-2026/`
- **Acceso**: solo usuarios autorizados (whitelist de UUID + metadata `wc_access:true`)
- **No aparece** en la navegación principal de scouteado.com ni en ninguna otra liga

---

## Fuente de datos

**Hub**: `https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php`

Cada partido tiene un **PDF Post Match Summary Report (PMSR)** descargable. Los PDFs están organizados por grupo (A–L) en el hub.

Patrón de URL de PDFs (varía entre partidos — el scraper los descubre dinámicamente del hub):
```
https://www.fifatrainingcentre.com/media/native/tournaments/fifa-world-cup/2026/PMSR-M{N}-{LOCAL}-V-{VISIT}.pdf
```

Cada PDF tiene ~53 páginas con:
- Resumen del partido (resultado, formaciones, estadio)
- Stats clave de equipo (xG, pases, líneas rotas, presión, distancia)
- Stats individuales "In Possession - Distributions" (por jugador)
- Stats individuales "In Possession - Offers & Receptions" (por jugador)
- Stats individuales "Out of Possession" (por jugador)
- Datos físicos (zona de velocidad, distancia — **no disponibles en el PDF público**)

**Limitación conocida**: el PDF del partido 10 (Germany vs Curaçao, M010) no tiene texto extraíble con `pdfplumber` — probablemente usa fuentes embebidas como imágenes. El resto funciona correctamente.

---

## Estructura del proyecto

```
docs/fifa-wc-2026/
  index.html                  # SPA del dashboard (privado, requiere login)
  CLAUDE.md                   # Este archivo
  wc_matches.csv              # Resultados de partidos
  wc_team_stats.csv           # Stats de equipo por partido
  wc_player_possession.csv    # Stats individuales en posesión
  wc_player_defense.csv       # Stats individuales fuera de posesión
  wc_player_offers.csv        # Movimientos de oferta por jugador (dato auxiliar)

Scraper/fifawc_scraper.py     # Scraper principal
Scraper/cache/fifawc_pdfs/    # PDFs cacheados localmente (NO en el repo, .gitignored)
```

---

## Scraper

```bash
# Solo partidos nuevos (incremental)
python3 Scraper/fifawc_scraper.py

# Reprocesar todos los PDFs (útil si se cambió el parser)
python3 Scraper/fifawc_scraper.py --full
```

**Dependencias** (ya en `requirements.txt`): `requests`, `beautifulsoup4`, `pdfplumber`, `pandas`

### Flujo interno

1. `get_pdf_links()` — scrapea el hub con `requests` + `BeautifulSoup`, extrae todos los links `.pdf` con su grupo (A–L)
2. `download_pdf()` — descarga el PDF si no está cacheado en `Scraper/cache/fifawc_pdfs/M{NNN}.pdf`
3. `process_pdf()` — abre el PDF con `pdfplumber` y llama a los 4 parsers:
   - `parse_match_header()` — página 0: resultado, fecha, estadio, grupo
   - `parse_key_stats()` — página con "Key Statistics": xG, pases, líneas rotas, presiones, distancia
   - `parse_player_distributions()` — páginas con "In Possession - Distributions": tabla por jugador
   - `parse_player_offers()` — páginas con "In Possession - Offers": tabla de movimientos de oferta
   - `parse_player_defense()` — páginas con "Out of Possession": tabla defensiva por jugador
4. `append_csv()` — agrega filas nuevas a los CSVs existentes (no duplica)

### Estrategia de parsing

Los parsers usan `extract_text()` de pdfplumber + **regex** para encontrar filas de jugadores.

**DIST_RE** (distribución en posesión) — ancla en los dos `%` en posición fija:
```
^(\d+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$
```
Grupos: jersey, nombre, passes_att, passes_comp, pass_pct, switches, crosses_att, crosses_comp, lb_att, lb_comp, lb_pct, ball_prog, take_ons, step_ins, att_goal, goals

**DEF_RE** (fuera de posesión) — ancla en el `X / Y` de los tackles:
```
^(\d+)\s+(.+?)\s+(\d+)\s*/\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$
```
Grupos: jersey, nombre, tackles_made, tackles_won, blocks, interceptions, pressing_contests, clearances, pushing_on_won, pressing_direct, pressing_indirect, duels_aerial, duels_physical, loose_ball, pushing_on_pressing, poss_regains, poss_interrupted

La función `_team_from_text(text, home, away)` determina a qué equipo pertenece cada página contando palabras del nombre del equipo presentes en el texto.

---

## CSVs

### `wc_matches.csv`
Una fila por partido jugado.

| Columna | Descripción |
|---|---|
| `match_num` | Número de partido (1, 2, 3...) |
| `group` | Grupo (A–L) |
| `date` | Fecha en texto (ej. "12 June 2026") |
| `stadium` | Nombre del estadio |
| `home` | Equipo local |
| `away` | Equipo visitante |
| `home_score` | Goles local |
| `away_score` | Goles visitante |

### `wc_team_stats.csv`
Una fila por equipo por partido (2 filas por match).

Columnas contextuales: `match_num, group, date, stadium, home, away, home_score, away_score`

Columnas de stats (sufijo `_home` y `_away` para cada métrica):

| Base | Descripción |
|---|---|
| `xg` | Expected Goals |
| `goals` | Goles marcados |
| `att` | Intentos de gol totales |
| `att_ot` | Intentos al arco (on target) |
| `passes_att` | Pases intentados |
| `passes_comp` | Pases completados |
| `pass_pct` | % pases completados |
| `lb` | Líneas rotas completadas |
| `def_lb` | Líneas rotas defensivas |
| `final_third` | Recepciones en el último tercio |
| `crosses` | Centros totales |
| `ball_prog` | Progresiones de balón |
| `pressures` | Presiones defensivas totales |
| `direct_press` | Presiones directas |
| `forced_to` | Pérdidas de posesión forzadas |
| `second_balls` | Segundas jugadas |
| `distance` | Distancia total recorrida (km) |

### `wc_player_possession.csv`
Una fila por jugador por partido.

Columnas contextuales: `match_num, group, date, home, away, home_score, away_score, team, jersey, player`

| Columna | Descripción |
|---|---|
| `passes_att` | Pases intentados |
| `passes_comp` | Pases completados |
| `pass_pct` | % de pases completados |
| `switches` | Cambios de orientación (switches) |
| `crosses_att` | Centros intentados |
| `crosses_comp` | Centros completados |
| `lb_att` | Líneas rotas intentadas |
| `lb_comp` | Líneas rotas completadas |
| `lb_pct` | % de líneas rotas completadas |
| `ball_prog` | Progresiones de balón |
| `take_ons` | Regates intentados |
| `step_ins` | Step-ins (penetraciones al espacio) |
| `att_goal` | Intentos de gol |
| `goals` | Goles |

### `wc_player_defense.csv`
Una fila por jugador por partido (mismo contexto que possession).

| Columna | Descripción |
|---|---|
| `tackles_made` | Tackles realizados |
| `tackles_won` | Tackles ganados |
| `blocks` | Bloqueos |
| `interceptions` | Intercepciones |
| `pressing_contests` | Disputas de presión |
| `clearances` | Despejes |
| `pushing_on_won` | Pushing on ganado |
| `pressing_direct` | Presiones directas |
| `pressing_indirect` | Presiones indirectas |
| `duels_aerial` | Duelos aéreos ganados |
| `duels_physical` | Duelos físicos ganados |
| `loose_ball` | Segundas jugadas recibidas |
| `pushing_on_pressing` | Presionando en avance |
| `poss_regains` | Recuperaciones de posesión |
| `poss_interrupted` | Posesiones interrumpidas |

### `wc_player_offers.csv`
Una fila por jugador por partido. Datos de movimientos de oferta (para análisis táctico futuro).

| Columna | Descripción |
|---|---|
| `total_offers` | Total de movimientos de oferta |
| `offers_in_front` | Ofertas en frente |
| `offers_in_between` | Ofertas entre líneas |
| `offers_out_to_in` | Ofertas de fuera hacia adentro |
| `offers_in_to_out` | Ofertas de adentro hacia afuera |
| `offers_in_behind` | Ofertas en profundidad (a la espalda) |
| `no_movement` | Sin movimiento |
| `offers_received` | Ofertas recibidas (balón llegó al jugador) |

---

## Dashboard — index.html

SPA vanilla JS. Sin build, sin dependencias externas excepto Google Fonts.

### Auth guard

```javascript
// Inmediato: si no hay token válido → redirect a login
const LOGIN_URL = '../login.html?returnTo=fifa-wc-2026/';
const token = localStorage.getItem('auth_token');
```

- Verifica expiración del JWT (`payload.exp`)
- Whitelist de UUIDs hardcodeada en `ALLOWED` + flag `payload.user_metadata?.wc_access`
- **Sin gracia de 5 minutos** — acceso inmediatamente bloqueado si no está logueado
- **No aparece** en los botones de navegación entre ligas de ninguna otra página

Para dar acceso a un usuario nuevo, agregar su UUID en el `ALLOWED` set del auth guard, **o** setear `wc_access: true` en los metadatos de Supabase del usuario.

### Secciones

| Tab | ID | Descripción |
|---|---|---|
| Resultados | `sec-resultados` | Cards de partidos agrupadas por grupo (A–F) |
| Grupos | `sec-grupos` | Tablas de posiciones calculadas dinámicamente |
| Jugadores | `sec-jugadores` | Tabla sorteable, filtrable por equipo, toggle Posesión/Defensa |
| Equipos | `sec-equipos` | Barras comparativas con toggle xG/Pases/Líneas Rotas/Presión |

### Flujo de carga

```
initApp()
  → Promise.all: wc_matches.csv, wc_team_stats.csv, wc_player_possession.csv, wc_player_defense.csv
  → buildPlayers()       — merge por clave `match_num|team|player`
  → buildTeamsAgg()      — agrega team stats de wc_team_stats
  → populateTeamFilter() — select de equipos en sección Jugadores
  → renderMatches()      — render Resultados
  → renderGroups()       — render Grupos (calcula standings desde MATCHES)
  → renderPlayerTable()  — render Jugadores
```

### Variables globales JS

| Variable | Tipo | Descripción |
|---|---|---|
| `MATCHES` | Array | Rows de wc_matches.csv |
| `TEAM_STATS` | Array | Rows de wc_team_stats.csv |
| `PLAYERS_DIST` | Array | Rows de wc_player_possession.csv |
| `PLAYERS_DEF` | Array | Rows de wc_player_defense.csv |
| `PLAYERS` | Array | Merge de DIST + DEF por partido/equipo/jugador |
| `TEAMS_AGG` | Object | Stats agregadas por equipo (totales acumulados) |
| `_playerView` | String | `'pos'` o `'def'` — vista activa en tabla de jugadores |
| `_playerSort` | Object | `{col, asc}` — columna y dirección de sort activa |
| `_teamMetric` | String | `'xg'|'pas'|'lb'|'pre'` — métrica activa en sección Equipos |

### Columnas de tabla de jugadores

**Posesión** (`POS_COLS`): Jugador, Selección, Partido, PA, PC, PA%, Cam, Crs, CrsC, LRA, LRC, LR%, PBal, TA, StIn, IG, Gol

**Defensa** (`DEF_COLS`): Jugador, Selección, Partido, TG, TGG, Blo, Int, Pre, Des, POn, PreD, PreI, DA, DF, LBal, PonP, RPo, IPo

### Colores destacados

- `val-goal` (gold): columna `goals` con valor > 0
- `val-high` (teal): columnas destacadas con valor > 0 (`lb_comp`, `att_goal`, `take_ons`, `ball_prog` en posesión; `poss_regains`, `interceptions`, `tackles_won`, `duels_aerial` en defensa)
- `highlight` (text): columna nombre del jugador

---

## Agregar acceso a nuevos usuarios

**Opción 1 — Whitelist (hardcoded):**
Agregar el UUID de Supabase del usuario en `ALLOWED` dentro del auth guard de `index.html`.

**Opción 2 — Metadata Supabase:**
En el dashboard de Supabase, ir al usuario → editar metadata → agregar:
```json
{ "wc_access": true }
```

---

## Agregar partidos nuevos

```bash
python3 Scraper/fifawc_scraper.py
```

El scraper detecta automáticamente los PDFs nuevos en el hub y los agrega a los CSVs. Commitear los CSVs actualizados y pushear para que Vercel redeploy.

Los PDFs cacheados están en `Scraper/cache/fifawc_pdfs/` — agregar ese path a `.gitignore` si no está ya.

---

## Pendientes / próximas features

- [ ] **Match 10 (Germany vs Curaçao)** — el PDF no tiene texto extraíble con pdfplumber. Probar con `pymupdf` (`fitz`) como alternativa
- [ ] **Fase eliminatoria** — el scraper y el dashboard ya soportan más de 1 partido por jugador; las tablas de jugadores mostrarán stats acumuladas automáticamente cuando haya datos de múltiples partidos
- [ ] **Mapa de tiro** — el PDF incluye heatmaps de zonas pero están renderizados como imágenes, no como datos estructurados
- [ ] **Datos físicos** (distancia por zona de velocidad) — disponibles en el PDF solo para usuarios con suscripción del FIFA Training Centre; el PDF público muestra checkmarks sin valores numéricos
- [ ] **Sección de partido** — click en una card de resultado para ver stats detalladas del partido (equipo vs equipo)
- [ ] **Ofertas de movimiento** — `wc_player_offers.csv` está cargado pero no visualizado todavía
