# CLAUDE.md — Liga Argentina Basketball Stats

## Proyecto
Dashboard de estadísticas y scouting de la Liga Argentina de Básquet (Temporada Regular 2025/26).
Busca ser una herramienta util para equipos y aficionados con conocimientos del deporte y datos.
Desplegado como GitHub Pages desde `docs/`.

## Estructura
```
docs/
  index.html              # App completa (SPA, ~3300 líneas, vanilla JS + Tailwind CDN)
  liga_argentina.csv      # Stats por jugador/partido (~11k filas)
  liga_argentina_shots.csv # Mapa de tiros (~57k filas)
  logos/                  # JPEGs de equipos + scouteado_logo.png
Scraper/
  data_scraper.py         # Scraper principal de stats
  shot_map_scraper.py     # Scraper de mapas de tiro
  requirements.txt        # cloudscraper, pandas, bs4, lxml, playwright
```

## Fuente de datos
- URL base: `https://www.laliganacional.com.ar/laligaargentina`
- Scraper usa `cloudscraper` para evadir protección anti-bot
- `shot_map_scraper.py --full` regenera el CSV completo de tiros

## CSV: liga_argentina.csv
Columnas clave: `Fecha, Condicion equipos, Equipo, Rival, Nombre completo, IdPartido, Etapa, Titular`
Stats: `Puntos, T2A/T2I/T2%, T3A/T3I/T3%, T1A/T1I/T1%, DReb, OReb, TReb, Asistencias, Recuperos, Perdidas, Tapones cometidos/recibidos, Faltas Cometidas/Recibidas, Valoracion, Ganado`
- Filas `Nombre completo == "TOTALES"` son los totales de equipo por partido

## CSV: liga_argentina_shots.csv
Columnas: `IdPartido, Fecha, Equipo_local, Equipo_visitante, Local, Equipo, Dorsal, Periodo, Tipo, Resultado, Zona, Left_pct, Top_pct`
- `Tipo`: `TIRO1 | TIRO2 | TIRO3`
- `Resultado`: `CONVERTIDO | FALLADO`
- `Left_pct / Top_pct`: coordenadas en % del canvas (0–100)
- La cancha tiene ~6.51% de padding horizontal a cada lado (los tiros no van de 0% a 100%)
- Tiros convertidos en la web: `CANASTA-2P` / `CANASTA-3P` (no `TIRO2-CONVERTIDO`)

## index.html — Arquitectura
SPA pura, sin build. Todo en un archivo. Usa Tailwind CDN sólo para utilidades puntuales, el sistema de diseño es CSS custom con variables `--bg`, `--purple`, `--teal`, etc.

**Secciones (tabs):**
- `posiciones` — Tabla de posiciones por conferencia
- `lideres` — Líderes individuales por categoría
- `j-tabla` — Tabla filtrable de jugadores
- `j-chart` — Scatter plot comparativo de jugadores
- `t-tabla` — Tabla de equipos
- `t-chart` — Scatter plot comparativo de equipos

**Modal de partido** (`#teamGamesBackdrop`):
- Se abre al hacer clic en una fila de equipo
- Tab "Estadísticas": stats head-to-head del partido
- Tab "Mapa de tiro": canvas con tiros, filtros equipo/tipo/resultado

**Sección "Tiro" (`j-tiro`):**
- Media cancha coloreada por zonas de eficiencia vs promedio de liga
- **7 zonas** (1 pintura + 3 mid-range 2pt + 3 triples):
  - `PAINT` — dentro del rectángulo de la pintura + área restringida (RA fusionada)
  - `MID_TOP` — mid-range techo (dy < -1.5m desde el aro, fuera de pintura, dentro del arco)
  - `MID_CENTER` — mid-range centro (|dy| ≤ 1.5m, fuera de pintura, dentro del arco)
  - `MID_BOT` — mid-range fondo (dy > 1.5m)
  - `CORNER_TOP` — triple esquina superior: ángulo > 45° hacia arriba desde el aro (`dy < -dx`)
  - `CORNER_BOT` — triple esquina inferior: ángulo > 45° hacia abajo desde el aro (`dy > dx`)
  - `ABOVE_BREAK` — todo el arco de 3pt dentro de los ±45° (wings + centro)
- Coloreado pixel-a-pixel con `ImageData` (rápido, sin paths de canvas por zona)
- Paleta de zonas: interpolación continua entre anclas (rojo = mejor, azul = peor vs promedio liga):
  - diff ≤ −12%: `[29, 78, 216]` azul oscuro
  - diff = −6%:  `[96, 165, 250]` azul medio
  - diff = −2%:  `[147, 197, 253]` azul muy claro
  - diff =  0%:  `[203, 213, 225]` gris claro (promedio)
  - diff = +2%:  `[253, 186, 116]` naranja muy claro
  - diff = +6%:  `[251, 146, 60]`  naranja
  - diff ≥ +12%: `[220, 38, 38]`   rojo oscuro
  - sin datos:   `[55, 58, 90]`    oscuro
  - Implementado en `szcZoneColor()` con lerp lineal entre anclas adyacentes
- **Sin leyenda de gradiente** (fue eliminada). El color de cada zona habla por sí solo.
- **Panel lateral de zonas** (`.szc-right-panel` → `#szcZoneCards`): cards por cada zona con nombre, `makes/att`, `%` grande y `Liga X.X%` coloreado (naranja = por encima, azul = por debajo, neutro = similar). Renderizado por `szcRenderZoneCards()` al final de `renderZoneChart()`.
- **Labels en el canvas** (`szcDrawLabels`): dos líneas — `%` (grande, blanco) y `makes/att` (pequeño, gris). Borde del box tintado con el color de zona. Sin promedio de liga en el canvas.
- **Header del jugador**: nombre en mayúsculas + equipo en `--purple-l` + número de camiseta. Badges de resumen `2PT X/Y Z%` y `3PT X/Y Z%` calculados en `selectSzcPlayer()` desde los tiros crudos.
- Normalización: LOCAL ataca aro izquierdo (Left_pct < 50), VISIT se espeja (100 - Left_pct)
- Separadores de zona punteados (`rgba(255,255,255,.45)`):
  - dy = ±1.5m (límites MID_TOP/CENTER/BOT): línea horizontal desde el paint hasta el arco
  - Diagonal 45° (límites CORNER/ABOVE_BREAK): línea desde la intersección con el arco de 3pt (`bx + R3/√2`, `by ∓ R3/√2`) hasta el borde del canvas (`diagEdgeX = bx + by = 9.075m`). No empieza en el paint para no meterse en la zona 2pt.
- Centros de labels (`SZC_CENTERS`, en metros): `PAINT [3.0, 7.5]`, `MID_TOP [3.0, 3.2]`, `MID_CENTER [7.5, 7.5]`, `MID_BOT [3.0, 11.8]`, `CORNER_TOP [6.5, 1.5]`, `CORNER_BOT [6.5, 13.5]`, `ABOVE_BREAK [12.0, 7.5]`. PAINT/MID_TOP/MID_BOT comparten el mismo eje x (x=3.0) para alineación visual.
- Clasificación de corners: `szcClassifyCoord` chequea **primero** si `y < 0.9` o `y > 14.1` (bandas de la línea recta FIBA de corner), porque en esa franja algunos píxeles tienen `dist ≤ 6.75` pero están fuera de la línea de 3pt. Dentro de esa franja se aplica igual la diagonal 45° (`dy < -dx` → CORNER_TOP, `dy > dx` → CORNER_BOT, sino ABOVE_BREAK). Luego sigue el check `dist > 6.75` para el resto del arco. `szcClassifyShot` ídem — ambas funciones deben mantenerse consistentes
- **Totales garantizados**: `szcClassifyShot` usa `Tipo` del CSV (TIRO2/TIRO3) como fuente de verdad para 2pt vs 3pt; las coordenadas solo determinan la sub-zona. Esto asegura que la suma de zonas 2pt = T2I y suma de zonas 3pt = T3I de la tabla. Tiros con coordenadas inválidas defaultean a `PAINT` (2pt) o `ABOVE_BREAK` (3pt).
- Búsqueda de jugadores con autocomplete; matching por `Equipo||Dorsal` (numérico redondeado)
- `SHOTS_BY_PLAYER`: `Map<"Equipo||Dorsal" → rows[]>`, construido en `loadShots()` junto a `SHOTS_MAP`
- `LEAGUE_ZONE_STATS`: stats de toda la liga por zona, calculado lazy una vez cargado `SHOTS_MAP`
- `buildRAW_J` ahora guarda `DORSAL` (último valor de `Número Camiseta` visto por partido)

**Shot map canvas:**
- `renderShotMap()` lee `Left_pct/Top_pct` directamente como % del canvas
- `drawCourt()` usa `PL = 0.0651 * W` para el padding, `mx = (W-2*PL)/28`, `my = H/15`
- Canvas ratio fijo: `H = W * 15/28` (cancha FIBA 28×15m)
- Usa `ctx.translate(PL,0) + ctx.scale(mx/my, 1)` para dibujar en espacio uniforme de metros

## Responsive
El frontend debe funcionar y verse bien tanto en celular como en computadora. Cualquier cambio de UI debe considerar ambos contextos.

Media query `@media (max-width:640px)` cubre:
- Header compacto, main-tabs con scroll horizontal (tab-cat oculto)
- Controles apilados, padding 12px en lugar de 40px
- Leaders grid 1 columna, comparison grid 1 columna
- Modal 98% ancho / 92vh alto
- Shot map court 96% ancho
- `.scroll-bar-outer` con `margin:0 8px` (vs 40px desktop)

## Scroll horizontal de tablas

### Tablas de jugadores y equipos (`j-tabla`, `t-tabla`)
- `.table-card` usa `transform:scaleY(-1)` (y `table` interior con `scaleY(-1)`) para mostrar el scrollbar nativo en la parte superior del card
- `.scroll-bar-outer` / `.scroll-bar-inner`: scrollbar externo sincronizado que aparece justo encima de la tabla (entre el toggle básica/avanzada y el `table-wrap`). Sincronizan scroll con el `table-wrap` vía `setupScrollSync()` en JS
- `jScrollOuter` está ubicado justo antes de `jTableWrap` (después del toggle); `tScrollOuter` entre los controles y el toggle de equipos
- En mobile, `scroll-bar-outer` tiene `margin:0 8px` para alinearse con el padding reducido

### Tabla de Posiciones
- Cada `pos-table` está envuelta en `div.pos-table-scroll` con `overflow-x:auto`
- La clase `.pos-table-scroll` está definida en CSS junto al bloque `/* ── Posiciones ── */`

### Modal de partidos
- `tgm-body` tiene `overflow-x:auto` además de `overflow-y:auto` para que la tabla del historial sea scrolleable horizontalmente en mobile

## Flujo de carga de datos

### Inicio (`initApp()`)
Se llama al final del script al cargar la página. Muestra `#loadingOverlay` mientras trabaja.

```
fetch('liga_argentina.csv?v=<timestamp>')   ← cache-busting, no-store
  → parseCSV(text)          ← parser CSV propio (maneja comillas, sin dependencias)
  → buildRAW_J(rows)        ← agrega stats de jugador por clave "Nombre||Equipo"
  → buildRAW_T(rows)        ← agrega stats de equipo desde filas TOTALES
  → calcular promedios y stats derivadas
  → poblar PLAYERS[], TEAMS[], TEAM_MAP{}, LEADERS_DATA{}
  → onJFilter() + onTFilter() + buildLeaders() + renderStandings()
  → ocultar loadingOverlay
```

### `buildRAW_J(rows)`
- Filtra filas donde `Nombre completo !== "TOTALES"`
- Agrupa por clave compuesta `"Nombre completo||Equipo"` (permite mismo nombre en distintos equipos)
- `PJ` = partidos con `Segundos jugados > 0`
- Suma totales acumulados; los promedios se calculan después dividiendo por `PJ`

### `buildRAW_T(rows)`
- Filtra filas `Nombre completo === "TOTALES"` (una por equipo por partido)
- Agrupa por `Equipo`, acumula stats totales
- Construye `_gamelog[]` con stats individuales de cada partido (para el modal de juegos)
- Calcula `OPP_PTS` buscando el rival en cada `IdPartido` (requiere exactamente 2 filas TOTALES por partido)

### Stats derivadas calculadas en `initApp()`
| Variable | Fórmula |
|---|---|
| `EFG%` | `(T2A + 1.5*T3A) / (T2I+T3I)` |
| `TS%` | `PTS / (2*(TCI + 0.44*T1I))` |
| `USG%` | `posesiones_jugador * min_equipo / (5 * min_jugador * posesiones_equipo)` |
| `ORtg` | `PTS / posesiones * 100` |
| `DRtg` | Tomado de `TEAM_MAP[equipo].DRtg` |
| `PACE` | Posesiones por partido del equipo |

### Datos de tiros (`SHOTS_MAP` + `SHOTS_BY_PLAYER`)
Carga **lazy**: se inicializa `null` y solo se fetch al abrir el tab "Mapa de tiro" o "Tiro" por primera vez.
```
loadShots()
  → fetch('liga_argentina_shots.csv?v=<timestamp>')
  → parseCSV(text)
  → SHOTS_MAP = Map<IdPartido → row[]>
  → SHOTS_BY_PLAYER = Map<"Equipo||Dorsal" → row[]>
```
- `LEAGUE_ZONE_STATS` se computa una vez (lazy) al primer render del zone chart, agregando todos los tiros de `SHOTS_MAP`

## Convenciones de código
- JS: `let DATA = null` para datos cargados una vez (lazy). `SHOTS_MAP` es `Map<gameId, rows[]>`
- Paleta: local = `#a78bfa` (purple-l), visitante = `#5eead4` (teal-l)
- Tiros convertidos: círculo relleno. Fallados: círculo vacío con X
- IDs de partido son strings Base64 (`IdPartido`)

## Cambios que Claude debe evitar

- No cambiar el formato de los CSV
- No modificar el sistema de coordenadas del shot map
- No alterar la paleta de colores del proyecto (variables CSS `--bg`, `--purple`, `--teal`, etc.; la paleta de zonas de tiro sí puede cambiar)

## Comandos útiles
```bash
# Actualizar stats de jugadores
python Scraper/data_scraper.py

# Actualizar mapa de tiros (sólo nuevos partidos)
python Scraper/shot_map_scraper.py

# Forzar re-scrape completo de tiros
python Scraper/shot_map_scraper.py --full
```