# CLAUDE.md — Liga Nacional Basketball Stats

## Proyecto
Dashboard de estadísticas y scouting de la Liga Nacional de Básquet (Temporada Regular 2025/26).
Busca ser una herramienta util para equipos y aficionados con conocimientos del deporte y datos.
Desplegado como GitHub Pages desde `docs/`.

**Relación con Liga Argentina**: este dashboard es una segunda instancia del mismo SPA. `docs/index.html` es una copia adaptada de `liga_argentina/docs/index.html`. Ambas páginas tienen botones de navegación cruzada en el header. Los cambios de arquitectura o funcionalidad generales deben aplicarse en ambos archivos.

## Estructura
```
docs/
  index.html              # App completa (SPA, vanilla JS + Tailwind CDN)
  liga_nacional.csv       # Stats por jugador/partido (~6700 filas, 323 jugadores, 19 equipos)
  liga_nacional_shots.csv # Mapa de tiros (~columnas iguales a liga_argentina_shots.csv)
  liga_nacional_pbp.csv   # Jugada a jugada (generado con Scraper/pbp_scraper.py)
  fixture_upcoming.csv    # Partidos por jugar (fecha,hora,local,visitante,estadio)
  logos/                  # JPEGs de equipos + scouteado_logo.png (pendiente — carpeta vacía)
Scraper/
  data_scraper.py         # Scraper principal de stats
  shot_map_scraper.py     # Scraper de mapas de tiro
  pbp_scraper.py          # Scraper de jugada a jugada
  requirements.txt        # cloudscraper, pandas, bs4, lxml, playwright
```

## Fuente de datos
- URL base: `https://www.laliganacional.com.ar/laliga`
- Scraper usa `cloudscraper` para evadir protección anti-bot
- Temporada arranca el 24/09/2025

## CSV: liga_nacional.csv
Columnas idénticas a `liga_argentina.csv` — el parser JS funciona sin cambios.
Columnas clave: `Fecha, Condicion equipos, Equipo, Rival, Nombre completo, IdPartido, Etapa, Titular`
Stats: `Puntos, T2A/T2I/T2%, T3A/T3I/T3%, T1A/T1I/T1%, DReb, OReb, TReb, Asistencias, Recuperos, Perdidas, Tapones cometidos/recibidos, Faltas Cometidas/Recibidas, Valoracion, Ganado`
- Filas `Nombre completo == "TOTALES"` son los totales de equipo por partido

## Equipos (19)
`ARGENTINO (J)`, `ATENAS (C)`, `BOCA`, `FERRO`, `GIMNASIA (CR)`, `INDEPENDIENTE (O)`,
`INSTITUTO`, `LA UNION FSA.`, `OBERÁ`, `OBRAS`, `OLÍMPICO (LB)`, `PEÑAROL (MDP)`,
`PLATENSE`, `QUIMSA`, `RACING (CH)`, `REGATAS (C)`, `SAN LORENZO`, `SAN MARTÍN (C)`, `UNION (SF)`

La Liga Nacional **no tiene conferencias** — la sección Home muestra una única tabla de posiciones con todos los equipos ordenados por W%. No existen `CONF_NORTE` / `CONF_SUR` en el JS.

**Atención con nombres**: `LA UNION FSA.` va **sin tilde** (así figura en el CSV de stats y debe coincidir en `fixture_upcoming.csv` para que el deduplicado funcione correctamente).

## index.html — Diferencias con Liga Argentina

El archivo es una copia de `liga_argentina/docs/index.html` con estas adaptaciones:

### Tabs disponibles
| Nav principal | Sub-sección | Section ID | Disponible |
|---|---|---|---|
| Home | — | `posiciones` | ✓ |
| Destacados | — | `lideres` | ✓ |
| Fixture | — | `partidos` | ✓ |
| Equipos | Tabla | `t-tabla` | ✓ |
| Equipos | Quintetos | `quintetos` | ✓ |
| Equipos | Comparar | `t-chart` | ✓ |
| Equipos | Conexiones | `t-conexiones` | ✓ |
| Jugadores | Tabla | `j-tabla` | ✓ |
| Jugadores | Tiros | `j-tiro` | ✓ |
| Jugadores | Comparar | `j-chart` | ✓ |
| Jugadores | Conexiones | `j-conexiones` | ✓ |

### Mapas JS de navegación
```js
const _SUB_GROUP = {
  't-tabla':'equipos','quintetos':'equipos','t-chart':'equipos','t-conexiones':'equipos',
  'j-tabla':'jugadores','j-tiro':'jugadores','j-chart':'jugadores','j-conexiones':'jugadores'
};
const _SUB_IDX = {
  't-tabla':0,'quintetos':1,'t-chart':2,'t-conexiones':3,
  'j-tabla':0,'j-tiro':1,'j-chart':2,'j-conexiones':3
};
```

### Modal de partido
Tabs disponibles: "Estadísticas", "Mapa de tiro" (`tgmTabMap`), "Box Score".

### Logos
La carpeta `logos/` existe y contiene `scouteado_logo.png`. Los logos de equipos están pendientes — agregarlos con estos nombres:
| Equipo | Archivo |
|---|---|
| ARGENTINO (J) | `argentino_j.jpeg` |
| ATENAS (C) | `atenas_c.jpeg` |
| BOCA | `boca.jpeg` |
| FERRO | `ferro.jpeg` |
| GIMNASIA (CR) | `gimnasia_cr.jpeg` |
| INDEPENDIENTE (O) | `independiente_o.jpeg` |
| INSTITUTO | `instituto.jpeg` |
| LA UNION FSA. | `la_union_fsa.jpeg` |
| OBERÁ | `obera.jpeg` |
| OBRAS | `obras.jpeg` |
| OLÍMPICO (LB) | `olimpico_lb.jpeg` |
| PEÑAROL (MDP) | `peñarol_mdp.jpeg` |
| PLATENSE | `platense.jpeg` |
| QUIMSA | `quimsa.jpeg` |
| RACING (CH) | `racing_ch.jpeg` |
| REGATAS (C) | `regatas_c.jpeg` |
| SAN LORENZO | `san_lorenzo.jpeg` |
| SAN MARTÍN (C) | `san_martin_c.jpeg` |
| UNION (SF) | `union_sf.jpeg` |

La función `teamLogoHtml()` maneja imágenes faltantes con `onerror="this.style.display='none'"` — no hay errores visibles hasta que se agreguen los archivos.

### Botón de navegación entre ligas
Ambas páginas tienen un botón en el header (debajo del subtítulo) que linkea a la otra liga:
- Liga Nacional → `../../liga_argentina/docs/index.html`
- Liga Argentina → `../../liga_nacional/docs/index.html`

Si los paths de deployment cambian (GitHub Pages, dominio propio, etc.), actualizar el atributo `href` de esos `<a>` en ambos archivos.

## CSV: liga_nacional_pbp.csv
Columnas idénticas a `liga_argentina_pbp.csv`:
`IdPartido, Fecha, Equipo_local, Equipo_visitante, NumAccion, Tipo, Equipo_lado, Dorsal, Jugador, Periodo, Tiempo, Marcador_local, Marcador_visitante`
- `NumAccion`: índice secuencial 0-based desde el inicio del partido (cronológico)
- `Tipo`: tipo de evento — `CANASTA-1P/2P/3P`, `TIRO1/2/3-FALLADO`, `REBOTE-DEFENSIVO/OFENSIVO`, `ASISTENCIA`, `FALTA-COMETIDA/RECIBIDA`, `TANTIDEPORTIVA`, `TECNICA`, `TAPON-COMETIDO/RECIBIDO`, `RECUPERACION`, `PERDIDA`, `CAMBIO-JUGADOR-ENTRA/SALE`, `TIEMPO-MUERTO-SOLICITADO`, `FLECHA-ALTERNANCIA-LOCAL/VISITANTE`, `INICIO/FINAL-PARTIDO`, `INICIO/FINAL-PERIODO`
- `Equipo_lado`: `LOCAL` | `VISITANTE` | `None` (eventos neutros)
- `Periodo`: 1-4 regular, 5+ OT
- `Tiempo`: reloj en `MM:SS` (tiempo restante del período)
- `Marcador_local/visitante`: forward-fill desde la última canasta, arranca en 0
- Fuente: `https://www.laliganacional.com.ar/laliga/partido/en-vivo/{game_id}`

## Datos PBP — implementación JS

La implementación es **idéntica** a `liga_argentina/docs/index.html`. Ver el CLAUDE.md de liga_argentina para documentación detallada. Resumen:

### Carga lazy
```
loadPbp()
  → fetch('liga_nacional_pbp.csv?v=<timestamp>')
  → PBP_MAP = Map<IdPartido → row[]>

computeLineups()   ← una sola vez tras loadPbp()
  → LINEUP_DATA = Map<teamName → Map<lineupKey → stats>>
```
Se activa al entrar a Quintetos, Conexiones Equipo o Red de Asistencias.

### Sección "Quintetos" (`quintetos`)
- Selector de equipo + filtro de minutos mínimos → tabla de quintetos
- Stats: Min, Pos, +/-, OffRtg, DefRtg, Net, TC%, 3P%, AST%, TOV%, ORB%, DReb%, 3PA Rate, FTr
- `lineupKey` = jugadores ordenados alfabéticamente unidos por `~`

### Sección "Conexiones Equipo" (`t-conexiones`)
- Selector de equipo → top 10 duplas por AST/partido
- Columnas: Jugador A/B, AST A→B, AST B→A, Total AST, AST/Partido, PJ juntos, Min/PJ juntos, PTS/40 juntos
- Badge de cobertura PBP: verde ≥90%, amarillo 70–89%, rojo <70%

### Sección "Red de Asistencias" (`j-conexiones`)
- Selector de equipo → selector de jugador → grafo SVG dirigido
- Flechas violeta (AST dadas) y teal (AST recibidas); grosor proporcional a APG
- Curvas Bézier para conexiones bidireccionales (> 0.04 ast/p)
- Matching nombres stats↔PBP via dorsal (`dorsalToPbp` → `statsToPbp`)

### Integridad de datos
- El scraper aplica `drop_duplicates()` antes de guardar
- Si el CSV ya tiene duplicados: `python3 -c "import pandas as pd; df=pd.read_csv('docs/liga_nacional_pbp.csv'); df.drop_duplicates(inplace=True); df.to_csv('docs/liga_nacional_pbp.csv', index=False)"` desde `liga_nacional/`

## Comandos útiles
```bash
# Actualizar stats de jugadores
python Scraper/data_scraper.py

# Dry run (lista partidos sin scrapear stats)
python Scraper/data_scraper.py --dry-run

# Forzar re-scrape completo
python Scraper/data_scraper.py --full

# Debug (guarda HTML crudos en Scraper/debug_html/)
python Scraper/data_scraper.py --debug

# Actualizar mapa de tiros (solo nuevos partidos)
python Scraper/shot_map_scraper.py

# Forzar re-scrape completo de tiros
python Scraper/shot_map_scraper.py --full

# Actualizar jugada a jugada (solo partidos nuevos)
python Scraper/pbp_scraper.py

# Forzar re-scrape completo de jugada a jugada
python Scraper/pbp_scraper.py --full
```

## CSV: fixture_upcoming.csv

Columnas: `fecha,hora,local,visitante,estadio`
- `fecha`: formato `DD/MM/YYYY`
- `hora`: formato `HH:MM`
- Los nombres de equipo deben coincidir exactamente con los de `liga_nacional.csv` (ver lista de 19 equipos arriba). Esto es crítico: el JS desduplicta usando la clave `fecha|local|visit`; si hay discrepancia de nombre, el partido aparece duplicado una vez scrapeado.
- **Para actualizar el fixture**: reemplazar este archivo sin tocar el HTML. Cuando un partido es scrapeado, su clave ya existe en `GAMES_ALL` y la entrada upcoming se descarta automáticamente.
- Si el fetch falla o el archivo no existe, se ignora silenciosamente (no rompe la app).

## Cambios que Claude debe evitar
- No cambiar el formato de los CSV
- No modificar el sistema de coordenadas del shot map (cuando se implemente)
- No alterar la paleta de colores del proyecto (variables CSS `--bg`, `--purple`, `--teal`, etc.)
- No sincronizar cambios automáticamente con `liga_argentina/docs/index.html` — ambos archivos se editan por separado
