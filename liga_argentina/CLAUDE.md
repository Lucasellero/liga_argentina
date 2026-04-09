# CLAUDE.md — Liga Argentina Basketball Stats

## Proyecto
Dashboard de estadísticas y scouting de la Liga Argentina de Básquet (Temporada Regular 2025/26).
Busca ser una herramienta util para equipos y aficionados con conocimientos del deporte y datos.
Desplegado en **Vercel** desde `docs/` (configurado en `vercel.json`).

## Deployment
- **Plataforma**: Vercel. El repo es `Lucasellero/liga_argentina` en GitHub. Vercel deploya automáticamente al hacer push a `main`.
- **Root servido**: `docs/` (definido en `vercel.json` → `outputDirectory: "docs"`).
- **URL base**: `https://<proyecto>.vercel.app/` → sirve `docs/index.html`.

### Cómo agregar una nueva liga
Cada liga vive como subcarpeta dentro de `docs/`. Pasos:

1. **Copiar los archivos** de la nueva liga a `docs/<nombre-liga>/`:
   ```
   cp -r /ruta/local/<nombre-liga>/docs docs/<nombre-liga>
   ```
   La subcarpeta debe contener: `index.html`, los CSVs (`*.csv`) y `logos/`.

2. **Actualizar el link de navegación cruzada** en el nuevo `docs/<nombre-liga>/index.html`:
   - El link hacia liga_argentina debe ser `href="../"` (sube un nivel al root).
   - El link hacia otra liga hermana debe ser `href="../<otra-liga>/"`.

3. **Actualizar el link en `docs/index.html`** (liga_argentina) que apunta a la nueva liga:
   - Usar `href="<nombre-liga>/"` (path relativo desde el root, sin `../`).

4. **Commitear y pushear**:
   ```bash
   git add docs/<nombre-liga>/ docs/index.html
   git commit -m "Add <nombre-liga>"
   git push origin main
   ```

### Regla clave de rutas
> Todos los paths entre ligas deben ser **relativos al root deployado** (`docs/`).
> - Desde `docs/index.html` hacia una sub-liga: `liga_nacional/` ✓
> - Desde `docs/liga_nacional/index.html` hacia el root: `../` ✓
> - Desde `docs/liga_nacional/index.html` hacia otra sub-liga: `../liga_regional/` ✓
> - Nunca usar paths que suban más de un nivel (`../../`) porque rompen en deployment.

### Auth — login compartido entre ligas

El `login.html` y `register.html` viven en `docs/` (raíz) y son compartidos por todas las ligas.

**Flujo de login:**
1. Cada `docs/<liga>/index.html` tiene un auth guard al inicio del script.
2. Si el token es válido, muestra el nombre del usuario en el header y deja navegar libremente.
3. Si no hay token (o está expirado), el usuario puede navegar libremente. Después de **7 minutos exactos** (`setTimeout` de 420000ms) aparece un modal bloqueante sin botón de cerrar que obliga al login o registro.
4. El modal tiene dos botones: "Iniciar sesión" → `login.html` y "Registrarme gratis" → `register.html`.
5. `login.html` lee el parámetro `returnTo` después del login exitoso y redirige a esa ruta. Si no hay `returnTo`, vuelve a `index.html` (liga_argentina).
6. El logout (`authLogout()`) redirige a `../login.html?returnTo=<liga>/`.

**Nota:** el tiempo transcurrido se persiste en `sessionStorage` con la clave `scouteado_session_start`. Si el usuario recarga la página, el timer continúa desde donde quedó. Al cerrar la pestaña, `sessionStorage` se limpia y el timer vuelve a 0. Si navega entre ligas dentro de la misma pestaña, la clave persiste y el tiempo sigue corriendo.

**Regla al agregar una nueva liga:** definir `LOGIN_URL` y `REGISTER_URL` correctos en el auth guard (`../login.html?returnTo=<nombre-liga>/` y `../register.html`). El modal los usa para los botones.

### Register — selección de liga y club

`register.html` tiene un selector encadenado de **Liga → Club**:

1. El usuario primero elige su liga (`<select id="liga">`): `liga_argentina`, `liga_nacional` o `liga_femenina`.
2. Al cambiar la liga, `onLigaChange()` puebla dinámicamente el `<select id="club">` con los equipos de esa liga y lo habilita (arranca `disabled`).
3. Ambos campos son requeridos. Si el usuario intenta registrarse sin seleccionarlos, aparecen los mensajes de error `ligaErr` / `clubErr`.

**Equipos por liga (objeto `TEAMS_BY_LIGA` en el script de `register.html`):**
- `liga_argentina` (34 equipos): AMANCAY (LR), BARRIO PARQUE, BOCHAS (CC), CENTENARIO (VT), CENTRAL ENTRERRIANO, CICLISTA (J), COLON (SF), COMUNICACIONES, DEP. NORTE, DEP. VIEDMA, EL TALAR, ESTUDIANTES (T), FUSION RIOJANA, GIMNASIA (LP), HINDU (C), HURACAN (LH), INDEPENDIENTE (SDE), JUJUY BASQUET, LA UNION (C), LANUS, PERGAMINO BASQUET, PICO F.C., PROVINCIAL (R), QUILMES (MDP), RACING (A), RIVADAVIA (MZA), ROCAMORA, SALTA BASKET, SAN ISIDRO, SANTA PAULA (G), SP. SUARDI, UNION (MDP), VILLA MITRE (BB), VILLA SAN MARTIN
- `liga_nacional` (19 equipos): ARGENTINO (J), ATENAS (C), BOCA, FERRO, GIMNASIA (CR), INDEPENDIENTE (O), INSTITUTO, LA UNION FSA., OBERA, OBRAS, OLIMPICO (LB), PEÑAROL (MDP), PLATENSE, QUIMSA, RACING (CH), REGATAS (C), SAN LORENZO, SAN MARTIN (C), UNION (SF)
- `liga_femenina` (18 equipos): BOCHAS (CC), CHAÑARES, DEP. BERAZATEGUI, EL BIGUA (NQN), EL TALAR, FERRO, FUSION RIOJANA, GORRIONES (RIO IV), HINDU (C), INDEPENDIENTE (NQN), INSTITUTO, LANUS, NAUTICO (R), OBRAS, QUIMSA, ROCAMORA, SAN JOSE (MENDOZA), UNION FLORIDA
- `liga_proximo` (19 equipos): ARGENTINO (J), ATENAS (C), BOCA, FERRO, GIMNASIA (CR), INDEPENDIENTE (O), INSTITUTO, LA UNION FSA., OBERA, OBRAS, OLIMPICO (LB), PEÑAROL (MDP), PLATENSE, QUIMSA, RACING (CH), REGATAS (C), SAN LORENZO, SAN MARTÍN (C), UNION (SF)

**Metadata guardada en Supabase** (`auth/v1/signup` → campo `data`):
```json
{ "nombre": "...", "apellido": "...", "telefono": "...", "liga": "liga_nacional", "club": "OBRAS" }
```
El campo `liga` usa el valor del `<option value="">` (snake_case), no el label visible.

**Al agregar un nuevo equipo a una liga:** actualizar el array correspondiente en `TEAMS_BY_LIGA` dentro de `register.html`.

### Botones de navegación entre ligas (header)
Cada página tiene **4 botones** de navegación cruzada en el header, uno por cada liga. Orden fijo: **Liga Nacional → Liga Argentina → Liga Femenina → Liga Desarrollo**.

**Botón de la liga activa (página actual):**
- Renderizado como `<span>` (no `<a>`, no es clickeable)
- `cursor:default; font-weight:700`
- Color teal (`--teal-l`): `border:1.5px solid rgba(45,212,191,.7); background:rgba(45,212,191,.22)`
- Aplica a **todas** las ligas (Nacional, Argentina, Femenina y Desarrollo)

**Botones de las otras ligas (links):**
- Renderizado como `<a href="...">`
- Color violeta (`--purple-l`) para todos: `border:1px solid rgba(139,92,246,.3); background:rgba(139,92,246,.08)`
- Hover: `rgba(139,92,246,.18)`; `font-weight:600`

**Estilo común a todos los botones:**
- `display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:120px`
- `padding:3px 10px; border-radius:20px; font-size:0.68rem`
- Ícono `›` **siempre a la derecha** del texto (nunca a la izquierda)
- Al agregar una nueva liga: añadir su botón activo en la nueva página y su botón link (violeta) en las 4 páginas existentes, respetando el orden

### Actualizar CSVs de una liga desplegada
Reemplazar los archivos en `docs/<nombre-liga>/` y pushear. Vercel re-deploya automáticamente.

## Estructura
```
docs/
  index.html              # App completa (SPA, ~3700 líneas, vanilla JS + Tailwind CDN)
  liga_argentina.csv      # Stats por jugador/partido (~11k filas)
  liga_argentina_shots.csv # Mapa de tiros (~57k filas)
  liga_argentina_pbp.csv  # Jugada a jugada (eventos por partido)
  fixture_upcoming.csv    # Partidos por jugar (fecha,hora,local,visitante,estadio)
  liga_nacional/          # Liga Nacional (misma estructura, sirve en /liga_nacional/)
  liga_femenina/          # Liga Femenina (misma estructura, sirve en /liga_femenina/)
  liga_proximo/           # Liga de Desarrollo (misma estructura, sirve en /liga_proximo/)
  logos/                  # JPEGs de equipos + scouteado_logo.png
Scraper/
  data_scraper.py         # Scraper principal de stats (Liga Argentina)
  data_scraper_nacional.py # Scraper principal de stats (Liga Nacional)
  data_scraper_femenina.py # Scraper principal de stats (Liga Femenina)
  data_scraper_proximo.py  # Scraper principal de stats (Liga de Desarrollo)
  shot_map_scraper.py     # Scraper de mapas de tiro (Liga Argentina)
  shot_map_scraper_nacional.py # Scraper de mapas de tiro (Liga Nacional)
  shot_map_scraper_femenina.py # Scraper de mapas de tiro (Liga Femenina)
  shot_map_scraper_proximo.py  # Scraper de mapas de tiro (Liga de Desarrollo)
  pbp_scraper.py          # Scraper de jugada a jugada (Liga Argentina)
  pbp_scraper_nacional.py # Scraper de jugada a jugada (Liga Nacional)
  pbp_scraper_femenina.py # Scraper de jugada a jugada (Liga Femenina)
  pbp_scraper_proximo.py  # Scraper de jugada a jugada (Liga de Desarrollo)
  requirements.txt        # cloudscraper, pandas, bs4, lxml, playwright
```

## Fuente de datos
- Liga Argentina URL base: `https://www.laliganacional.com.ar/laligaargentina`
- Liga Nacional URL base: `https://www.laliganacional.com.ar/laliga`
- Liga Femenina URL base: `https://www.laliganacional.com.ar/lfb`
- Liga de Desarrollo URL base: `https://www.laliganacional.com.ar/ligaproximo`
- Temporada Liga Argentina: desde `30/10/2025`
- Temporada Liga Nacional: desde `23/09/2025`
- Temporada Liga Femenina: desde `03/10/2025` (CSV completo), pero el dashboard filtra desde `09/01/2026` (Segunda Vuelta)
- Temporada Liga de Desarrollo: desde `22/09/2025`
- Scraper usa `cloudscraper` para evadir protección anti-bot
- `shot_map_scraper.py --full` regenera el CSV completo de tiros (Liga Argentina)
- `shot_map_scraper_nacional.py --full` regenera el CSV completo de tiros (Liga Nacional)
- `shot_map_scraper_femenina.py --full` regenera el CSV completo de tiros (Liga Femenina)
- `shot_map_scraper_proximo.py --full` regenera el CSV completo de tiros (Liga de Desarrollo)

## CSV: liga_argentina.csv
Columnas clave: `Fecha, Condicion equipos, Equipo, Rival, Nombre completo, IdPartido, Etapa, Titular`
Stats: `Puntos, T2A/T2I/T2%, T3A/T3I/T3%, T1A/T1I/T1%, DReb, OReb, TReb, Asistencias, Recuperos, Perdidas, Tapones cometidos/recibidos, Faltas Cometidas/Recibidas, Valoracion, Ganado`
- Filas `Nombre completo == "TOTALES"` son los totales de equipo por partido

## CSV: players_dob.csv
Columnas: `liga, nombre_completo, nombre_abreviado, fecha_nacimiento, url_perfil`
- Compartido por todas las ligas (una fila por jugador registrado)
- `liga`: nombre de la liga tal como aparece en el dashboard (ej. `"Liga Nacional"`, `"Liga Argentina"`)
- `nombre_abreviado`: formato `"APELLIDO, I."` — coincide con el campo `Nombre completo` del CSV de stats de cada liga. **Esta es la clave de matching.**
- `nombre_completo`: nombre completo sin abreviar (ej. `"AGUSTIN CAFFARO"`). No usar como clave de lookup.
- `fecha_nacimiento`: formato `DD/MM/YYYY`
- Usado en cada `index.html` para calcular la columna `Edad` de la tabla de jugadores. Se carga en paralelo con el CSV de stats en `initApp()` via `Promise.all`. Se indexa en `DOB_MAP` por `nombre_abreviado`.
- `calcAge(dob)` calcula la edad exacta en años enteros (considera si el cumpleaños ya ocurrió en el año actual).
- Si el archivo no existe o falla el fetch, la app continúa sin errores y los jugadores sin DOB muestran `—`.

## CSV: liga_argentina_shots.csv
Columnas: `IdPartido, Fecha, Equipo_local, Equipo_visitante, Local, Equipo, Dorsal, Periodo, Tipo, Resultado, Zona, Left_pct, Top_pct`
- `Tipo`: `TIRO1 | TIRO2 | TIRO3`
- `Resultado`: `CONVERTIDO | FALLADO`
- `Left_pct / Top_pct`: coordenadas en % del canvas (0–100)
- La cancha tiene ~6.51% de padding horizontal a cada lado (los tiros no van de 0% a 100%)
- Tiros convertidos en la web: `CANASTA-2P` / `CANASTA-3P` (no `TIRO2-CONVERTIDO`)

## index.html — Arquitectura
SPA pura, sin build. Todo en un archivo. Usa Tailwind CDN sólo para utilidades puntuales, el sistema de diseño es CSS custom con variables `--bg`, `--purple`, `--teal`, etc.

**Navegación (estructura actual):**

| Nav principal | Sub-sección | Section ID |
|---|---|---|
| Home | — | `posiciones` |
| Destacados | — | `lideres` |
| Fixture | — | `partidos` |
| Equipos | Tabla | `t-tabla` |
| Equipos | Quintetos | `quintetos` |
| Equipos | Comparar | `t-chart` |
| Equipos | Conexiones | `t-conexiones` |
| Jugadores | Tabla | `j-tabla` |
| Jugadores | Tiros | `j-tiro` |
| Jugadores | Comparar | `j-chart` |
| Jugadores | Conexiones | `j-conexiones` |
| Jugadores | Radar | `j-radar` |

**Secciones (IDs en el DOM):**
- `posiciones` — Home: dos tabs internos ("Temporada Regular" con tablas de posiciones filtradas a < PLAYOFF_DATE, y "Post Temporada" con series head-to-head del bracket)
- `lideres` — Líderes individuales por categoría (cards por categoría)
- `partidos` — Fixture: lista de partidos con filtros de fecha/equipo
- `t-tabla` — Tabla filtrable de equipos
- `quintetos` — Mejores quintetos por equipo (requiere PBP)
- `t-chart` — Scatter plot comparativo de equipos
- `t-conexiones` — Top 10 duplas de jugadores de un equipo ordenadas por asistencias/partido
- `j-tabla` — Tabla filtrable de jugadores
- `j-tiro` — Mapa de zonas de tiro por jugador
- `j-chart` — Scatter plot comparativo de jugadores
- `j-conexiones` — Grafo de conexiones (asistencias + puntos juntos) entre un jugador y sus compañeros
- `j-radar` — Radar hexagonal de perfil estadístico (percentiles en 6 ejes, estilo FIFA)

**Sistema de navegación — dos barras:**
- **`.main-tabs`**: barra principal con 5 botones (Home, Destacados, Fixture, Equipos, Jugadores). Los 3 primeros llaman `switchSection(id)` directamente. Equipos (`#grpEquipos`) y Jugadores (`#grpJugadores`) llaman `openGroup(group, defaultSection)`.
- **`.sub-tabs`**: barra secundaria que aparece debajo de `.main-tabs` cuando Equipos o Jugadores está activo. `#subEquipos` y `#subJugadores` se muestran/ocultan con `style.display`. Cada ítem de sub-tab llama `switchSection(id)`.
- **Por qué sub-barra y no dropdown flotante**: los `<select>` nativos del browser siempre se renderizan por encima de cualquier `z-index`, lo que causaba que los filtros de equipos aparecieran sobre el dropdown. La sub-barra empuja el contenido hacia abajo y no genera conflictos.

**Funciones JS de navegación:**
- `openGroup(group, defaultSection)` — activa el grupo (`'equipos'` | `'jugadores'`), muestra su sub-barra, y llama `switchSection(defaultSection)`.
- `switchSection(id)` — muestra la sección `sec-{id}`, actualiza el estado activo de `.main-tab` y `.sub-tab`. Si `id` pertenece a un grupo (`_SUB_GROUP`), muestra la sub-barra correspondiente y marca el ítem correcto.
- `_SUB_GROUP` — mapa `{sectionId → 'equipos'|'jugadores'}` para saber a qué grupo pertenece cada sección.
- `_SUB_IDX` — mapa `{sectionId → 0|1|2|3|4}` para saber qué índice de `.sub-tab` marcar como activo. Jugadores: `j-tabla`=0, `j-tiro`=1, `j-chart`=2, `j-conexiones`=3, `j-radar`=4.
- `.main-tab.grp-active` — clase CSS adicional que se aplica al botón de grupo cuando alguna de sus sub-secciones está activa (color violeta, border-bottom violeta).

**Filtro de período (Jugadores y Equipos):**
Ambas tablas (`j-tabla`, `t-tabla`) tienen un toggle de período: **Temporada / Últ. 5 / Últ. 10**.
- Botones en `.tbl-toggle-wrap` junto a Básica/Avanzada. Estado: `jPeriod` / `tPeriod` (`'all'|'last5'|'last10'`).
- `setJPeriod(p)` / `setTPeriod(p)` actualizan el estado y re-renderizan.
- `getPlayerData(p)` / `getTeamData(t)` devuelven `p._last5`, `p._last10` o el objeto completo según el período activo.
- Las stats de período se precomputan en `initApp()` y se guardan en `player._last5`, `player._last10`, `team._last5`, `team._last10`.
- **Jugadores**: `buildRAW_J` guarda `_games[]` (filas CSV con `Segundos jugados > 0`). En `initApp` se ordenan por fecha y se pasan a `computeStatsFromGames(games, tm)` que replica todas las fórmulas de stats básicas y avanzadas.
- **Equipos**: `buildRAW_T` ya construye `_gamelog[]` ordenado por fecha. Se pasan a `computeTeamStatsFromGames(gamelog)` que computa W%, PTS/p, tiros, rebotes, ORtg, DRtg, NetRtg, EFG%, TS%, TOV%, ORB%, FTr, PACE.
- Layout del toggle wrap: `[Básica/Avanzada] [Temporada/Últ.5/Últ.10] [Todos/Local/Visitante] [Comparar jugadores / Comparar equipos]`. En mobile (`flex-direction:column`) se apilan verticalmente.

**Filtro por Conferencia (Jugadores, Equipos, Destacados):**
Permite ver estadísticas solo de la Conferencia Norte, Conferencia Sur, o ambas.
- **Estados**: `jConf` (jugadores), `tConf` (equipos), `lConf` (destacados). Valores: `'all'|'norte'|'sur'`.
- **Setter functions**: `setJConf(v)`, `setTConf(v)`, `setLConf(v)`. Cada una actualiza el estado, sincroniza todos los controles de UI asociados y llama a `onJFilter()` / `onTFilter()` / `buildLeaders()`.
- **Jugadores>Tabla** (`j-tabla`): pills en el sidebar (`jConfAll`, `jConfNorte`, `jConfSur`). Filtra en `getJFiltered()` usando `CONF_NORTE` / `CONF_SUR`.
- **Jugadores>Comparar** (`j-chart`): select `#jChartConf` en los controles del scatter plot. Comparte el estado `jConf` con Jugadores>Tabla — al cambiar uno el otro se sincroniza.
- **Equipos>Tabla** (`t-tabla`): pills en el sidebar (`tConfAll`, `tConfNorte`, `tConfSur`). Filtra en `getTFiltered()`.
- **Equipos>Comparar** (`t-chart`): select `#tChartConf` en los controles del scatter plot. Comparte el estado `tConf` con Equipos>Tabla.
- **Destacados** (`lideres`): pills en el header de la sección (`lConfAll`, `lConfNorte`, `lConfSur`). `buildLeaders()` filtra `cat.entries` por conferencia y luego toma `.slice(0,5)`.
- **LEADERS_DATA**: `top5()` y `top5Pct()` ya no hacen `.slice(0,5)` — almacenan todos los jugadores ordenados. El slice a 5 lo hace `buildLeaders()` después de filtrar por conferencia, garantizando siempre top 5 dentro de la conferencia seleccionada.

**Filtro Local/Visitante (solo Jugadores):**
La tabla `j-tabla` tiene un toggle adicional: **Todos / Local / Visitante**.
- Estado: `jLocVis` (`'all'|'local'|'visit'`). Función: `setJLocVis(v)`.
- Se combina con `jPeriod`: `getPlayerData(p)` selecciona la combinación correcta (ej. "Últ. 5 Local" devuelve `_last5Local`).
- Stats precomputadas en `initApp()` usando `_games[]` filtrado por `Condicion equipos === 'LOCAL'` o `'VISITANTE'`:
  | Propiedad | Descripción |
  |---|---|
  | `player._local` | Todos los partidos como local |
  | `player._visit` | Todos los partidos como visitante |
  | `player._last5Local` | Últimos 5 partidos como local |
  | `player._last10Local` | Últimos 10 partidos como local |
  | `player._last5Visit` | Últimos 5 partidos como visitante |
  | `player._last10Visit` | Últimos 10 partidos como visitante |
- Si el jugador no tiene partidos en esa condición, la propiedad es `null` y `getPlayerData` cae al objeto completo.

**Modal de partido** (`#teamGamesBackdrop`):
- Se abre al hacer clic en una fila de equipo (desde `t-tabla`) o en una card de partido (desde `partidos`)
- Tab "Estadísticas": stats head-to-head del partido
- Tab "Mapa de tiro": canvas con tiros, filtros equipo/tipo/resultado
- Tab "Box Score": tabla por equipo con todos los jugadores del partido. Columnas: #dorsal, Min, PTS, Dobles (M/I), Triples (M/I), TL (M/I), REB, RD, RO, AST, REC, PER, TAP, VAL. Titulares marcados con ●. DNP atenuados.
- Botón "‹ Volver": si fue abierto desde `partidos` (`_partidoMode=true`) cierra el modal; si fue desde `t-tabla` vuelve a la lista de juegos del equipo (`closeGameDetail`)
- `switchGameTab(tab)` maneja los 3 tabs (`'stats'|'map'|'box'`); al activar `'box'` llama `renderBoxScore(_smState.gameId, _smState.local, _smState.visit)`
- **Scroll horizontal del Box Score**: `.tgm-box-table-wrap` tiene `overflow-x:auto`. El selector `#teamGamesModal table{table-layout:fixed}` aplica a todas las tablas del modal y causaría que el box score recortara columnas en lugar de crear scroll. Se sobreescribe con `#teamGamesModal .tgm-box-table{table-layout:auto;}` (mayor especificidad: ID+clase > ID+elemento). **Al agregar una nueva liga, incluir esta regla CSS.**

**Sección "Tiro" (`j-tiro`):**
- Media cancha coloreada por zonas de eficiencia vs promedio de liga
- **Filtro de período**: toggle **Temporada / Últ. 5 / Últ. 10** en el `.szc-header` (junto al buscador). Estado: `szcPeriod` (`'all'|'last5'|'last10'`), jugador activo: `szcCurrentIdx`.
  - `setSzcPeriod(p)`: actualiza estado, botón activo, y re-renderiza si hay jugador seleccionado.
  - `szcFilterByPeriod(shots, period, gameIds)`: filtra tiros a los últimos N partidos. Acepta un tercer argumento `gameIds` (array de `IdPartido` ya ordenados cronológicamente desde `player._gameIds`). Si `gameIds` está presente, usa `gameIds.slice(-n)` como fuente de verdad — esto garantiza que "último 5" coincida exactamente con la tabla de jugadores. Sin `gameIds` (fallback), deriva los partidos del shots CSV ordenando fechas con `new Date(ay,am-1,ad)` (DD/MM/YYYY). **No usar comparación lexicográfica sobre strings DD/MM/YYYY** — da resultados incorrectos entre fechas de distintos meses.
  - `player._gameIds`: array de `IdPartido` (strings) correspondiente a `player._games`, en orden cronológico ascendente. Se computa en `initApp()` junto a `_last5`/`_last10`. Permite que `szcFilterByPeriod` use la misma ventana de partidos que la tabla.
  - `szcPlayerGameIds`: variable global (inicialmente `null`) que se actualiza en `selectSzcPlayer()` con `player._gameIds`. Se pasa a todas las llamadas de `szcFilterByPeriod` (incluyendo las de `renderZoneChart` para las zone cards).
  - **Limitación conocida**: el matching `Equipo||Dorsal` falla si el jugador cambió dorsal durante la temporada (ej. NOVATTI en Liga Femenina usó #6 en un partido) o si hay dos jugadores con el mismo nombre abreviado en el mismo equipo (ej. MARTINEZ, M. #14 y #55 en UNION FLORIDA). En esos casos el mapa de tiros puede mostrar stats incompletas.
  - **Jugadores que llegan mid-season con dorsal ya usado**: si un jugador nuevo toma un número que ya usó otro jugador en el mismo equipo (ej. SCHATTMANN llega a Instituto con #20, que era de BOONE), `SHOTS_BY_PLAYER.get('INSTITUTO||20')` mezclaría tiros de ambos. **Fix aplicado**: en `selectSzcPlayer()`, `allShots` se pre-filtra por `player._gameIds` antes de cualquier filtro de período. Así cada jugador ve solo los tiros de los partidos donde él efectivamente jugó para ese equipo, independientemente de quién más usó ese dorsal.
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
- **SVG overlay** (`#szcSvg`): posicionado absolutamente sobre el canvas (`pointer-events:none`). Generado por `szcUpdateSvg(pStats, leagueStats)`. Contiene:
  - Líneas de cancha (rect, arcos, aro, líneas de 3pt y corner) — `viewBox="0 0 14 15"` en metros
  - Labels por zona: `rect` base oscuro + `linearGradient` tintado con color de zona + borde de zona color + `feDropShadow`. Texto `%` en blanco (grande) y `makes/att` en gris (pequeño).
  - Los `linearGradient` e `id="lblShadow"` se definen en `<defs>` dentro del propio `innerHTML`.
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
- **Header**: logo 44px (vs 90px desktop), padding 10px 14px, `header-badges` ocultos (`display:none`), `#lastUpdate` oculto
- **Main tabs**: sin padding lateral, `overflow-x:auto` + `scroll-snap-type:x proximity`, scrollbar oculto, botones 13px 14px padding, fuente .72rem, iconos 12px
- **Sub tabs**: misma mecánica de scroll horizontal, padding 9px 16px, fuente .71rem, iconos 11px
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
Promise.all([
  fetch('<liga>.csv?v=<timestamp>'),          ← stats principales
  fetch('../players_dob.csv?v=<timestamp>')   ← fechas de nacimiento (catch→null si falla)
])
  → parseCSV(text)          ← parser CSV propio (maneja comillas, sin dependencias)
  → DOB_MAP = { [nombre_abreviado]: fecha_nacimiento }  ← indexado por liga
  → buildRAW_J(rows)        ← agrega stats de jugador por clave "Nombre||Equipo"
  → buildRAW_T(rows)        ← agrega stats de equipo desde filas TOTALES
  → calcular promedios y stats derivadas; d.Edad = calcAge(DOB_MAP[p['Nombre completo']])
  → poblar PLAYERS[], TEAMS[], TEAM_MAP{}, LEADERS_DATA{}
  → buildear GAMES_ALL (partidos únicos desde _gamelog[])
  → buildear GAME_PLAYERS_MAP (filas CSV por IdPartido, para box score)
  → poblar pTeam select + showUpcomingDefault()
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
- Construye `_gamelog[]` con stats individuales de cada partido (para el modal de juegos); cada entrada incluye `estadio` leído de `my['Estadio']`
- Calcula `OPP_PTS` buscando el rival en cada `IdPartido` (requiere exactamente 2 filas TOTALES por partido)

### Stats derivadas calculadas en `initApp()`
| Variable | Fórmula |
|---|---|
| `EFG%` | `(T2A + 1.5*T3A) / (T2I+T3I)` |
| `TS%` | `PTS / (2*(TCI + 0.44*T1I))` |
| `USG%` | `posesiones_jugador * min_equipo / (5 * min_jugador * posesiones_equipo)` |
| `ORtg` | `PTS / posesiones * 100` |
| `DRtg` | Tomado de `TEAM_MAP[equipo].DRtg` |
| `ORB%` | `DReb_jugador × (MinEq/5) / (Min_jugador × DRebEq)` — % de rebotes ofensivos disponibles capturados. Calculado en `computeStatsFromGames()` usando `tm.RO`. |
| `DRB%` | `DReb_jugador × (MinEq/5) / (Min_jugador × (DRebEq + ORebRival))` — % de rebotes defensivos disponibles capturados. Calculado en `computeStatsFromGames()` usando `tm.RD` y `tm.OPP_RO`. `OPP_RO` se acumula en `buildRAW_T` como rebotes ofensivos del rival por partido. Verde ≥ 75%, rojo < 60%. |
| `FTr` | `T1I / (T2I+T3I)` — Free Throw Rate (tiros libres intentados / tiros de campo intentados). Calculado en `initApp()`, `computeStatsFromGames()` y `computeTeamStatsFromGames()`. Aparece en la tabla avanzada de jugadores (verde ≥ 0.35) y equipos (verde ≥ 0.28, rojo < 0.18). Usa `fVal()` (2 decimales, sin %). |
| `PACE` | Posesiones por partido del equipo |
| `Edad` | `calcAge(DOB_MAP[nombre_abreviado])` — edad en años enteros al día de hoy. Propagada a todos los objetos de período (`mkPeriod`, `mkLocVisPeriod`) para que el sort por edad funcione en todos los modos de vista. Jugadores sin DOB muestran `—`. |

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

### Datos de jugada a jugada (`PBP_MAP` + `LINEUP_DATA`)
Carga **lazy**: se fetch al seleccionar un equipo en el tab "Quintetos" por primera vez.
```
loadPbp()
  → fetch('liga_argentina_pbp.csv?v=<timestamp>')
  → parseCSV(text)
  → PBP_MAP = Map<IdPartido → row[]>

computeLineups()   ← llamado una sola vez después de loadPbp()
  → itera PBP_MAP partido por partido
  → trackea localCourt / visitCourt (Set de nombres de jugadores)
  → acumula {secs, pf, pa, fga, fgm, fg3a, fg3m, fta, ast, oreb, dreb, to, dfga, dfgm, dfg3a, dfg3m, dfta, doreb, ddreb, dto} por segmento activo
  → LINEUP_DATA = Map<teamName → Map<lineupKey → stats>>
```

**Manejo de límites de período en `computeLineups`:**
- El scraper emite `CAMBIO-JUGADOR-ENTRA` para los 5 titulares al inicio de **cada período**. Algunos partidos (≈8 en el dataset) omiten estos CAMBIO-ENTRA en períodos intermedios.
- **Modo "boundary"** (`localBndEntras` / `visitBndEntras`): al `FINAL-PERIODO`, se cierran segmentos, se mantienen courts, y se activan buffers vacíos. Los `CAMBIO-JUGADOR-ENTRA` que llegan antes del `INICIO-PERIODO` se bufferean (no se aplican al court todavía).
- Al `INICIO-PERIODO`: si buffer ≥5 jugadores → se reemplaza el court con ese lineup (caso normal). Si buffer <5 → se **conserva el court anterior** (partidos sin CAMBIO de inicio de período continúan tracking sin interrupción).
- Al `FINAL-PARTIDO`: se limpian courts, segs y poss completamente.
- Este doble mecanismo evita: (1) court creciendo a >5 por CAMBIO-ENTRA periódicos superponiéndose al court anterior, y (2) pérdida de tracking en partidos sin esos CAMBIO.
```

**Sección "Home" / Posiciones (`posiciones`):**
La sección Home tiene dos tabs internos: **Temporada Regular** y **Post Temporada**.

- `PLAYOFF_DATE = new Date(2026, 3, 1)` — constante que delimita el fin de la temporada regular (1/04/2026). Definida antes de `CONF_NORTE` en el JS.
- `switchPosTab(tab)` — alterna entre `'regular'` y `'post'`. Muestra/oculta `#posRegPanel` / `#posPostPanel`. Si cambia a `'post'` y `#playoffContent` está vacío, llama `renderPostSeason()` (lazy).
- Tabs en HTML: `#posTabReg` / `#posTabPost` (clase `.pos-tab`, activo con `.active`).

**Tab "Temporada Regular" (`#posRegPanel`):**
- Tablas de posiciones Norte y Sur (`posNorteTbody` / `posSurTbody`).
- `renderStandings()` recalcula stats directamente desde `t._gamelog[]` filtrando por fecha `< PLAYOFF_DATE`. **No usa los totales acumulados de `TEAMS`** (que incluirían playoffs una vez scrapeados). Stats por juego: PJ, G, P, ptsFor, ptsAgainst, localG/P, visitG/P, last5. Ordenamiento: W% → PJ → PTS/P.

**Tab "Post Temporada" (`#posPostPanel`):**
- `renderPostSeason()` filtra `GAMES_ALL` por fecha `>= PLAYOFF_DATE`, ordena cronológicamente, y agrupa en series por par de equipos (clave = `[local, visit].sort().join('|')`).
- `teamA` = equipo local del primer partido de la serie. Los scores siempre se expresan como `teamA – teamB` independientemente de la localía en cada juego.
- Separación por conferencia: si `teamA` o `teamB` ∈ `CONF_NORTE` → `northSeries`, sino → `southSeries`.
- HTML inyectado en `#playoffContent`.

**Tarjetas de serie (`.series-card`):**
- Header: logo + nombre de equipo + marcador de serie (`winsA – winsB`). El equipo que va ganando recibe clase `.lead` en el contenedor (`.series-team.lead` → fondo violeta sutil) y en el nombre (`.series-team-name.lead` → texto brillante). No hay texto de estado ("Gana X-Y" eliminado; el score lo comunica).
- Filas de juego: `J1`, `J2`, `J3`. Jugado: `teamA_score – teamB_score` + fecha + botón **Stats**. Pendiente: hora + fecha en itálica.
- Botón **Stats** (`.sg-stats-btn`): `onclick="openPartidoModal(GAMES_ALL.find(x=>x.gameId==='${safeId}'))"` → abre el modal completo con estadísticas, mapa de tiros y box score. El `gameId` puede contener caracteres Base64 (`+`, `/`, `=`); se escapan las comillas simples con `safeId`.

**`fixture_upcoming.csv` en post-temporada:**
- Durante playoffs el archivo contiene el bracket completo (best-of-3). La deduplicación por `fecha|local|visit` garantiza que un partido ya scrapeado desplaza su entrada upcoming automáticamente.
- Los partidos de post-temporada aparecen tanto en la sección Fixture como en el tab Post Temporada de Home.

**Sección "Partidos" (`partidos`):**
- Filtros: rango de fechas (`pDateFrom`/`pDateTo`, inputs tipo `date`) + equipo (`pTeam`). `onPartidoFilter()` filtra `GAMES_ALL` y llama `renderPartidoList(filtered)`.
- **Vista por defecto**: al entrar a la sección (o al limpiar filtros), se llama `showUpcomingDefault()` que muestra solo los partidos próximos (`upcoming: true`) en orden ascendente (más cercano primero). Si el usuario aplica algún filtro, `onPartidoFilter()` muestra todos los partidos coincidentes en orden descendente (más reciente primero).
- `showUpcomingDefault()`: limpia los inputs de fecha y equipo, filtra `GAMES_ALL.filter(g => g.upcoming)`, y llama `renderPartidoList(upcoming, true)`.
- `clearPartidoFilter()`: delega en `showUpcomingDefault()`.
- Cards agrupadas por fecha. El orden depende del parámetro `ascending` de `renderPartidoList`: ascendente en la vista default (próximos primero), descendente cuando hay filtros aplicados. Cada card muestra local vs visitante con logos, marcador, ganador en `--text-bright`, y estadio debajo de las badges.
- Al hacer clic en una card **de partido jugado** se llama `openPartidoModal(game)`, que setea `_partidoMode=true` y abre el modal de detalle directamente (sin mostrar la lista de juegos del equipo).
- `GAMES_ALL`: array global de partidos únicos construido en `initApp()` desde los `_gamelog[]` de `TEAMS`. Cada entrada: `{ gameId, fecha, local, visit, ptsLocal, ptsVisit, ganLocal, estadio, sLocal, sVisit }`. Ordenado por fecha ascendente. Se desduplicata por `gameId` usando un `Set`.
- **Partidos por jugar**: se leen de `docs/fixture_upcoming.csv` (columnas: `fecha,hora,local,visitante,estadio`). En `initApp()` se hace un `fetch` de ese archivo y se fusionan las filas en `GAMES_ALL` usando un Set de claves `fecha|local|visit` para evitar duplicados con partidos ya scrapeados. Las cards de estos partidos muestran hora y estadio en lugar del marcador, no tienen cursor pointer ni abren el modal. Cuando un partido se scrapea, su entrada en el CSV desplaza automáticamente la entrada upcoming (la clave ya existe → se ignora). Si el archivo no existe o falla el fetch, se ignora silenciosamente. **Para actualizar el fixture: reemplazar `fixture_upcoming.csv` sin tocar el HTML.**
- **Predicciones de victoria (Liga Nacional)**: se leen de `predicciones_upcoming.csv` (columnas: `fecha,local,visitante,prob_local,prob_visit`), generado por `liga_argentina/modelo_liga_nacional.py`. En `initApp()` se carga justo después del fixture y se indexa en `PRED_MAP` por clave `"fecha|local|visitante"`. Las cards de partidos próximos muestran una barra dividida: porcentaje violeta (local) a la izquierda y teal (visitante) a la derecha, con leyenda "PROB. VICTORIA" (oculta en mobile). Si el CSV no existe, las cards se muestran sin barra. El CSV se regenera automáticamente cada vez que se ejecuta el modelo.
- `GAME_PLAYERS_MAP`: `Map<IdPartido → rows[]>` con todas las filas no-TOTALES del CSV, construido en `initApp()` desde `rows`. Usado por `renderBoxScore()` para el box score.
- `_partidoMode`: flag booleano. `true` cuando el modal fue abierto desde `partidos`. Controla el comportamiento del botón "‹ Volver" (`onTgmBack()`).
- Dorsal en box score formateado como `#15` (entero sin decimal): `#${Math.round(parseFloat(r['Número Camiseta'])||0)}`.
- El select `pTeam` se puebla desde todos los equipos en `GAMES_ALL` (jugados + upcoming), no solo desde `TEAMS`.
- **Nombres largos en cards**: `TEAM_NAME_BREAKS` (objeto literal antes de `renderPartidoList`) mapea nombres de equipo a su versión con `<br>`. `fmtTeamName(name)` lo aplica en los 4 `pcard-name` spans. `.pcard-name` usa `white-space:normal` para que el `<br>` renderice. Para agregar un nuevo equipo con nombre largo: añadir entrada a `TEAM_NAME_BREAKS`.

## Convenciones de código
- JS: `let DATA = null` para datos cargados una vez (lazy). `SHOTS_MAP` es `Map<gameId, rows[]>`
- Paleta: local = `#a78bfa` (purple-l), visitante = `#5eead4` (teal-l)
- Tiros convertidos: círculo relleno. Fallados: círculo vacío con X
- IDs de partido son strings Base64 (`IdPartido`)

## Tooltips en encabezados de tabla

Todas las tablas tienen tooltips custom que se muestran al hacer hover sobre un `<th>`.

**Implementación:**
- Atributo `data-tip="..."` en cada `<th>` de `<thead>`
- `<div id="thTip">` ubicado justo **antes** del `<script>` principal (importante: debe estar en el DOM antes de que corra el script)
- CSS en `#thTip`: `position:fixed`, `z-index:9999`, usa variables `--surface2`, `--border2`, `--text`
- JS IIFE al final del `<script>`: event delegation global en `mouseover`/`mousemove`/`mouseout` sobre `thead th[data-tip]`. El div sigue el cursor con offset `+14px` horizontal, `-height-10px` vertical; se invierte si sale de la pantalla
- **Usar `data-tip`, NO `title`**: los `title` nativos del browser se migraron a `data-tip` para poder usar el tooltip custom estilizado

**Tablas con tooltips:**
- Tablas estáticas (HTML): `jCardBasic`, `jCardAdv`, `tCardBasic`, `tCardAdv`, tabla de posiciones Norte y Sur
- Tablas dinámicas (JS): box score (`renderBoxScore` → array `cols` con campo `tip`), quintetos (`QNT_COLS` con campo `tip`, template usa `data-tip="${c.tip}"`), conexiones equipo (array `cols` con campo `title`, template usa `data-tip="${c.title}"`)

## Vercel Analytics

Todos los HTML tienen Vercel Analytics habilitado via:
```html
<script defer src="/_vercel/insights/script.js"></script>
```
Ubicado justo antes de `</head>` en los 6 archivos: `docs/index.html`, `docs/login.html`, `docs/register.html`, `docs/liga_femenina/index.html`, `docs/liga_nacional/index.html`, `docs/liga_proximo/index.html`.

**Al agregar una nueva liga:** incluir este script en el nuevo `index.html` antes de `</head>`.

El script es servido automáticamente por Vercel cuando Analytics está habilitado en el dashboard (Settings → Analytics → Enable). En local no hace nada.

## Cambios que Claude debe evitar

- No cambiar el formato de los CSV
- No modificar el sistema de coordenadas del shot map
- No alterar la paleta de colores del proyecto (variables CSS `--bg`, `--purple`, `--teal`, etc.; la paleta de zonas de tiro sí puede cambiar)

**Sección "Quintetos" (`quintetos`):**
- Selector de equipo (poblado desde `TEAMS` al abrir el tab) + filtro de minutos mínimos
- Carga lazy del PBP al seleccionar equipo; `computeLineups()` se ejecuta una sola vez y queda en `LINEUP_DATA`
- Tabla ordenable por cualquier columna (default: Min ↓)
- **Tracking de posesiones por evento**: cada tiro/TL/rebote/pérdida/asistencia se acumula simultáneamente en el segmento activo del equipo atacante (ofensa) y del defensor (defensa)
- `calcPoss(fga, fta, oreb, to)` = `FGA + 0.44×FTA − OReb + TO`
- Stats por lineup:
  | Columna | Fórmula | Color |
  |---|---|---|
  | `Min` | minutos juntos | blanco (más = más brillante) |
  | `Pos` | `round((offPoss + defPoss) / 2)` | blanco |
  | `+/-` | `PF − PC` bruto | rojo→gris→verde |
  | `OffRtg` | `PF / offPoss × 100` | gris→violeta |
  | `DefRtg` | `PA / defPoss × 100` | gris→teal (invertido) |
  | `Net` | `OffRtg − DefRtg` | rojo→gris→verde |
  | `TC%` | `FGM / FGA × 100` | gris→violeta |
  | `3P%` | `3PM / 3PA × 100` | gris→violeta |
  | `AST%` | `AST / FGM × 100` | gris→violeta |
  | `TOV%` | `TO / (FGA + 0.44×FTA + TO) × 100` | gris→teal invertido (menor = mejor) |
  | `ORB%` | `OReb / (OReb + DReb_rival) × 100` | gris→violeta |
  | `DReb%` | `DReb / (DReb + OReb_rival) × 100` | gris→teal |
  | `3PA Rate` | `3PA / FGA × 100` | gris→blanco (neutro) |
  | `FTr` | `FTA / FGA` (ratio) | gris→violeta |
- `LINEUP_DATA`: `Map<teamName, Map<lineupKey, {players, secs, pf, pa, games, fga, fgm, fg3a, fg3m, fta, ast, oreb, dreb, to, dfga, dfgm, dfg3a, dfg3m, dfta, doreb, ddreb, dto}>>`
- `lineupKey` = jugadores del quinteto ordenados alfabéticamente y unidos por `~`
- Los headers de la tabla tienen `title` con descripción de cada stat (mismo patrón que ORtg/DRtg en otras tablas)
- `pbpElapsed(period, tiempo)` convierte `Periodo + "MM:SS"` (tiempo restante) a segundos totales transcurridos. Periods 1-4: 600s cada uno; OT (5+): 300s cada uno

## CSV: liga_argentina_pbp.csv
Columnas: `IdPartido, Fecha, Equipo_local, Equipo_visitante, NumAccion, Tipo, Equipo_lado, Dorsal, Jugador, Periodo, Tiempo, Marcador_local, Marcador_visitante`
- `NumAccion`: índice secuencial 0-based desde el inicio del partido (cronológico)
- `Tipo`: tipo de evento — `CANASTA-1P/2P/3P`, `TIRO1/2/3-FALLADO`, `REBOTE-DEFENSIVO/OFENSIVO`, `ASISTENCIA`, `FALTA-COMETIDA/RECIBIDA`, `TANTIDEPORTIVA`, `TECNICA`, `TAPON-COMETIDO/RECIBIDO`, `RECUPERACION`, `PERDIDA`, `CAMBIO-JUGADOR-ENTRA/SALE`, `TIEMPO-MUERTO-SOLICITADO`, `FLECHA-ALTERNANCIA-LOCAL/VISITANTE`, `INICIO/FINAL-PARTIDO`, `INICIO/FINAL-PERIODO`
- `Equipo_lado`: `LOCAL` | `VISITANTE` | `None` (eventos neutros como INICIO/FINAL-PARTIDO)
- `Dorsal`: número de camiseta cuando está disponible en el HTML (puede ser `None`)
- `Jugador`: nombre completo del jugador (formato `APELLIDO, NOMBRE`)
- `Periodo`: número de cuarto/prórroga (1-4 regular, 5+ OT). Para INICIO/FINAL-PERIODO viene del `<span>` del título
- `Tiempo`: reloj de juego en `MM:SS`. Solo en eventos con jugador (no en INICIO/FINAL-PARTIDO/PERIODO)
- `Marcador_local` / `Marcador_visitante`: marcador vigente en el momento del evento (forward-fill desde la última canasta). Arranca en `0 - 0` antes de la primera canasta. El valor en canastas refleja el marcador **después** de convertir.
- Fuente: `https://www.laliganacional.com.ar/laligaargentina/partido/en-vivo/{game_id}` (HTML puro, sin arrays JS)
- Datos lazy cargados del `liga_argentina.csv` para obtener la lista de partidos y nombres de equipos

## CSV: liga_nacional_pbp.csv
Mismo esquema y formato que `liga_argentina_pbp.csv`. Columnas idénticas: `IdPartido, Fecha, Equipo_local, Equipo_visitante, NumAccion, Tipo, Equipo_lado, Dorsal, Jugador, Periodo, Tiempo, Marcador_local, Marcador_visitante`
- Fuente: `https://www.laliganacional.com.ar/laliga/partido/en-vivo/{game_id}` (HTML puro, misma estructura)
- Scraper: `Scraper/pbp_scraper_nacional.py` — lógica de parsing idéntica a `pbp_scraper.py`, solo cambia `LEAGUE = "/laliga"` y los paths a `docs/liga_nacional/`
- Datos lazy cargados del `docs/liga_nacional/liga_nacional.csv` para obtener la lista de partidos y nombres de equipos

## CSV: liga_femenina_pbp.csv
Mismo esquema y formato que `liga_argentina_pbp.csv` y `liga_nacional_pbp.csv`.
- Fuente: `https://www.laliganacional.com.ar/lfb/partido/en-vivo/{game_id}`
- Scraper: `Scraper/pbp_scraper_femenina.py`
- Datos lazy cargados del `docs/liga_femenina/liga_femenina.csv`

## CSV: liga_proximo_pbp.csv
Mismo esquema y formato que los demás PBP CSVs.
- Fuente: `https://www.laliganacional.com.ar/ligaproximo/partido/en-vivo/{game_id}`
- Scraper: `Scraper/pbp_scraper_proximo.py`
- Datos lazy cargados del `docs/liga_proximo/liga_proximo.csv`

## Liga de Desarrollo — particularidades del dashboard
- Sirve en `/liga_proximo/` (subcarpeta `docs/liga_proximo/`)
- Una sola conferencia (igual que Liga Nacional, sin división Norte/Sur)
- Logos referenciados desde `../liga_nacional/logos/` (equipos idénticos a Liga Nacional)
- Sin filtro de `START_DATE` — muestra toda la temporada desde `22/09/2025`
- Jugador por defecto en Tiro: SOÑORA (OBRAS)
- CSVs: `liga_proximo.csv`, `liga_proximo_shots.csv`, `liga_proximo_pbp.csv`
- Filtro mínimo de PJ en tabla de jugadores: **10+ PJ** por defecto (mismo criterio que Liga Femenina)

## Liga Femenina — particularidades del dashboard
- El CSV `liga_femenina.csv` contiene datos desde `03/10/2025` (inicio de temporada)
- El dashboard filtra en `initApp()` las filas anteriores al `09/01/2026` (inicio Segunda Vuelta) con `START_DATE = new Date(2026, 0, 9)` antes de llamar a `buildRAW_J`/`buildRAW_T`
- Logos en `docs/liga_femenina/logos/` — objeto `LOGOS` poblado con los 18 equipos
- Tabla de posiciones dividida en **Conferencia Norte** y **Conferencia Sur** (igual que Liga Argentina), usando `CONF_NORTE` / `CONF_SUR` y `fillTable()` en `renderStandings()`
- **Conferencia Norte**: CHAÑARES, HINDU (C), INSTITUTO, QUIMSA, NÁUTICO (R), GORRIONES (RIO IV), SAN JOSE (MENDOZA), BOCHAS (CC), FUSION RIOJANA
- **Conferencia Sur**: OBRAS, FERRO, DEP. BERAZATEGUI, EL TALAR, UNION FLORIDA, INDEPENDIENTE (NQN), EL BIGUA (NQN), LANUS, ROCAMORA
- Filtro mínimo de PJ en tabla de jugadores: **10+ PJ** por defecto (vs 20+ en las otras ligas), porque se juegan menos partidos
- IDs de tabla: `posNorteTbody` / `posSurTbody` (reemplazaron `posAllTbody`)

## Integridad de datos PBP

### Duplicados en liga_argentina_pbp.csv / liga_nacional_pbp.csv
- La web de la liga puede servir eventos duplicados en ciertos partidos (misma fila idéntica, mismo `NumAccion`).
- **Eventos de bajo riesgo duplicados**: `FINAL-PERIODO`, `FINAL-PARTIDO` — el código JS los ignora en la segunda pasada por el guard `if (!seg...) return`.
- **Eventos de alto riesgo duplicados**: `TIRO*-FALLADO`, `REBOTE-*`, `CANASTA-*` — inflan stats en `computeLineups()` (fga, fg3a, dreb, etc.), afectando OffRtg/DefRtg/TC% de los quintetos.
- **Fix en scraper**: ambos scrapers aplican `drop_duplicates()` antes de guardar el CSV (con warning si encuentran algo).
- Si el CSV ya tiene duplicados, correr desde `liga_argentina/`:
  ```bash
  # Liga Argentina
  python3 -c "import pandas as pd; df=pd.read_csv('docs/liga_argentina_pbp.csv'); df.drop_duplicates(inplace=True); df.to_csv('docs/liga_argentina_pbp.csv', index=False)"
  # Liga Nacional
  python3 -c "import pandas as pd; df=pd.read_csv('docs/liga_nacional/liga_nacional_pbp.csv'); df.drop_duplicates(inplace=True); df.to_csv('docs/liga_nacional/liga_nacional_pbp.csv', index=False)"
  ```

**Sección "Conexiones Equipo" (`t-conexiones`):**
- Selector de equipo → tabla con las 10 duplas de mayor conexión del equipo
- Carga lazy del PBP (igual que Quintetos y `j-conexiones`). `computeLineups()` se ejecuta si `LINEUP_DATA === null`.
- **Columnas de la tabla** (todas ordenables por clic en el header):
  | Columna | Descripción |
  |---|---|
  | Jugador A / Jugador B | Nombres de la dupla (stats CSV, formato abreviado) |
  | AST A→B | Asistencias de A a B en toda la temporada |
  | AST B→A | Asistencias de B a A en toda la temporada |
  | Total AST | Suma de ambas direcciones |
  | AST/Partido | `Total AST / PJ del equipo` — columna coloreada violeta→teal |
  | PJ juntos | Partidos en que ambos compartieron cancha (desde `LINEUP_DATA`) |
  | Min/PJ juntos | Minutos promedio por partido jugando juntos |
  | PTS/40 juntos | Puntos del equipo por 40 min con ambos en cancha |
- **Orden por defecto**: AST/Partido descendente.
- **Check de cobertura PBP**: badge sobre la tabla que muestra cuántas asistencias del PBP coinciden con el total del box score. Color: verde (≥90%), amarillo (70–89%), rojo (<70%).
  - `pbpAst` = asistencias del PBP emparejadas con una canasta (las usadas en la tabla)
  - `csvAst` = `teamObj.AST` (total acumulado del CSV de stats)
- `tCnxInit()` — puebla el select de equipos una sola vez (guard `options.length > 1`).
- `onTCnxTeamChange()` — async, carga PBP si necesario, computa y renderiza.
- `computeTeamConnections(team)` — retorna `{ rows, pbpAst, csvAst }`. Enumera todas las duplas únicas del plantel; retorna las 10 con mayor AST/partido.
- `onTCnxSort(col)` — alterna asc/desc en `_tCnxSort`; llama `renderTCnxTable()`.
- `renderTCnxTable()` — renderiza el badge de cobertura y la tabla ordenada.
- Estado global: `_tCnxRows[]` (top 10 rows), `_tCnxSort` (`{col, asc}`), `_tCnxCheck` (`{pbpAst, csvAst}`).

**Sección "Red de Asistencias" (`j-conexiones`):**
- Selector de equipo → selector de jugador (poblado con jugadores del equipo, ordenados por PPG desc) → grafo SVG dirigido
- Carga lazy del PBP al seleccionar equipo (igual que Quintetos). `computeLineups()` se ejecuta si `LINEUP_DATA === null`.

**Visualización — red dirigida:**
- SVG generado dinámicamente vía `innerHTML` en `drawConnections()`.
- **Nodo central**: jugador seleccionado (violeta, radio 38). Muestra apellido + `X.X ast/p` (asistencias dadas/partido a compañeros visibles).
- **Nodos periféricos**: compañeros con datos (radio 22), dispuestos en círculo. Borde violeta si da más AST de las que recibe; borde teal si recibe más.
- **Aristas dirigidas** — dos flechas separadas por par, cada una con su propia dirección:
  - **Violeta** (`#8b5cf6`): jugador central → compañero (asistencias *dadas*)
  - **Teal** (`#2dd4bf`): compañero → jugador central (asistencias *recibidas*)
- **Grosor de flecha** → `0.8 + (apg_dirección / maxApg) * 5.5` px por dirección independiente.
- **Curvas Bézier cuadráticas** para conexiones bidireccionales: cuando ambas direcciones superan el umbral (> 0.04 ast/p), las flechas se arquean en sentidos opuestos con `curva = dist * 0.14`. Para conexiones unidireccionales se usa línea recta.
- **Etiquetas de valor**: aparecen en la arista cuando `apg ≥ 0.08`, posicionadas en el punto medio de la curva Bézier (`0.25·P0 + 0.5·Q + 0.25·P2`) desplazadas perpendicularmente hacia afuera del arco.
- **Arrowhead** (`markerUnits="userSpaceOnUse"`, tamaño fijo 11×15px): forma cóncava `M0,0.5 L11,8 L0,15.5 L3,8 z`. El `refX=11` (punta) coincide exactamente con el endpoint del path = borde del círculo destino, sin gap ni solapamiento. Altura 15px garantiza visibilidad incluso con líneas gruesas (máx ~6.3px).
- **SVG filters**: `cnxShadow` en nodos periféricos; `cnxGlow` en nodo central.

**Datos retornados por `computeConnections(team, focusName)`:**
- `{ focusName, team, totalGames, focusApgGiven, focusApgReceived, connections[] }`
- `focusApgGiven` / `focusApgReceived`: suma de AST dadas/recibidas sobre todos los compañeros visibles dividida por `totalGames` (calculada antes del `slice(0,14)`).
- Cada conexión: `{ name, apg, astGiven, astReceived, totalAst, pts40, minTog, gamesTog }`.

**Tooltip (`cnxShowTip`):**
- Nodo central: AST dadas/partido + AST recibidas/partido.
- Nodo compañero: "→ AST dadas/partido" (violeta) + "← AST recibidas/partido" (teal) + PTS/40 juntos + min/partido juntos + partidos juntos.

**Matching de nombres stats↔PBP**: `Nombre completo` del stats CSV es abreviado (`"MERLO, A."`), mientras que `Jugador` del PBP CSV es el nombre completo (`"MERLO, ALEJANDRO"`). El bridge es el **dorsal**: `dorsalToPbp` mapea `dorsal(int) → PBP name` escaneando eventos del equipo en `PBP_MAP`. Luego `statsToPbp` mapea `statsName → pbpName` via `DORSAL` del player object.

- **Cálculo de asistencias**: itera `PBP_MAP` buscando `ASISTENCIA` del equipo, retrocede hasta 5 eventos para encontrar el `CANASTA-2P/3P` del mismo lado → par `(assister, scorer)` usando nombres PBP.
- **Cálculo de PTS/40 min juntos**: desde `LINEUP_DATA.get(team)`, suma `pf` y `secs` de todos los quintetos donde aparecen ambos jugadores (por nombre PBP). Normaliza: `(pf / secs * 60) * 40`.
- **Filtro de compañeros**: se muestran solo quienes tienen `gamesTog > 0 || totalAst > 0`. Máximo 14 compañeros (los de mayor conexión).
- `cnxInit()` — puebla el select de equipos una sola vez (guard `options.length > 1`).
- `onCnxTeamChange()` — async, carga PBP si es necesario, puebla select de jugadores.
- `onCnxPlayerChange()` — llama `computeConnections()` + `drawConnections()`.
- `drawConnections()` — escribe `svg.innerHTML`; re-dibuja en resize.
- `cnxShowTip(event, idx)` / `cnxHideTip()` — tooltip; `idx` referencia `_cnxNodes[]`.

**Sección "Radar de Jugador" (`j-radar`) — Liga Nacional únicamente:**
- Visualización tipo radar hexagonal (estilo FIFA) con 6 ejes expresados en percentil 0–100.
- **Criterio mínimo**: jugadores con ≥ 200 minutos jugados en la temporada (`RADAR_MIN_SEG = 12000` segundos). Los percentiles y la similitud se calculan solo dentro de ese conjunto.
- **Búsqueda con autocomplete**: mismo patrón que `j-tiro`. Dos inputs: jugador A (obligatorio) y jugador B (opcional, se activa con el checkbox "Comparar con otro jugador").
- **Implementación SVG pura**, sin librerías externas. El SVG se genera dinámicamente via `radarBuildSvg()` con `viewBox="0 0 460 460"` (cx=cy=230, R=148) y es responsive (`width:100%;height:auto`). El viewBox de 460×460 da margen suficiente para que los labels de los ejes no queden recortados.

**6 ejes y su composición:**

| Eje | Fórmula |
|---|---|
| SCORING | mean(pct(PTS/40), pct(TCI/40)) |
| SHOOTING | mean(pct(T3I/TCI), pct(T3A/T3I)) |
| DEFENSE | mean(pct(REC/40), pct(TAP/40)) |
| REBOUNDING | mean(pct(REB/40), pct(ORB%), pct(DRB%)) |
| PLAYMAKING | mean(pct(AST/40), pct(AST/PER)) |
| EFFICIENCY | mean(pct(TS%), pct(EFG%)) |

Orden de ejes en el radar (sentido horario desde arriba): SCORING → SHOOTING → DEFENSE → REBOUNDING → PLAYMAKING → EFFICIENCY.

**Layout de la sección:**
```
#radarContent
  └─ .radar-main-row (flex, gap 28px)
       ├─ .radar-chart-col
       │    ├─ #radarSvgWrap   ← SVG del radar
       │    └─ #radarCards     ← cartas FIFA de percentiles (grid 3 columnas)
       └─ .radar-similar-col
            └─ #radarSimilar   ← panel de jugadores similares
  └─ #radarAxisDefs            ← composición de los 6 ejes (al final, flex-wrap)
```
- El párrafo "Percentiles calculados entre jugadores con ≥ 200 min…" fue eliminado de la UI.

**Cartas de percentiles (`#radarCards`):**
- Grid de 3 columnas × 2 filas (una carta por eje).
- Cada carta muestra: label del eje, score del jugador A (grande), score del jugador B si está en modo comparación (teal, más pequeño), barra de progreso.
- Clases CSS: `.radar-card`, `.radar-card-lbl`, `.radar-card-val`, `.radar-card-val-b`, `.radar-card-bar-wrap`, `.radar-card-bar`.

**Panel de jugadores similares (`#radarSimilar`):**
- Muestra los 5 jugadores más similares al jugador A usando similitud coseno ponderada con z-scores.
- El algoritmo replica el modelo Python `similitud_liga_nacional/` completamente en JS.
- Cada ítem: nombre del jugador, equipo, barra de similitud, porcentaje.
- Clases CSS: `.radar-similar-col`, `.radar-similar-title`, `.radar-sim-item`, `.radar-sim-header`, `.radar-sim-name`, `.radar-sim-meta`, `.radar-sim-bar-wrap`, `.radar-sim-bar`, `.radar-sim-score`.

**Modelo de similitud en JS (replica `similitud_liga_nacional/`):**
- 15 features con pesos (idénticos a `feature_engineering.py`):
  `pts_per40`(0.125), `fga_per40`(0.125), `ts_pct`/`efg_pct`/`t3p_pct`/`ft_pct`(0.0625 c/u), `ast_per40`/`ast_tov`(0.10 c/u), `trb_per40`/`orb_pct`/`drb_pct`/`stl_per40`/`blk_per40`(0.05 c/u), `t3pa_rate`/`fta_rate`(0.025 c/u).
- `radarBuildSimVectors()` — normaliza (z-score) por feature y aplica `sqrt(weight)` igual que el modelo Python. Cachea en `_radarSim`. Requiere que `radarComputePercentiles()` ya se haya ejecutado.
- `radarGetSimilar(pA, n=5)` — similitud coseno sobre los vectores ponderados; excluye al propio jugador; retorna top-n.
- `radarGetRaw(p)` fue extendido para incluir `ft_pct` (T1A/T1I) y `fta_rate` (T1I/TCI), necesarios para la similitud.

**Funciones JS:**
- `radarComputePercentiles()` — calcula y cachea en `_radarPct` los arrays ordenados de cada feature para los jugadores calificados. Se ejecuta una sola vez (lazy, guard `if (_radarPct) return`).
- `radarGetRaw(p)` — extrae valores crudos (per-40, ratios, %) desde el objeto `p` de `PLAYERS`. Para `ast_tov`: si `PER === 0` y `AST > 0`, retorna 10 (máximo implícito); si `AST === 0`, retorna 0. Incluye `ft_pct` y `fta_rate`.
- `radarPercentile(feat, val)` — búsqueda binaria en el array ordenado de la feature; retorna percentil 0–100.
- `radarGetScores(p)` — retorna objeto `{ SCORING, SHOOTING, DEFENSE, REBOUNDING, PLAYMAKING, EFFICIENCY }` (0–100 enteros). Para REBOUNDING: si `ORB%` o `DRB%` son null, se excluyen del promedio sin penalizar. Para SHOOTING: si 0 intentos de triple, `t3p_pct` es null y se usa `t3pa_rate` dos veces.
- `radarBuildSvg(scoresA, nameA, scoresB, nameB)` — genera el SVG completo. Incluye: anillos de referencia (20/40/60/80/100) con dashes, líneas de eje, polígono del jugador A (violeta), polígono del jugador B si presente (teal), dots en cada eje, labels de eje con nombre y valor.
- `radarBuildSimVectors()` — construye vectores z-score ponderados para el pool de jugadores calificados. Cachea en `_radarSim`.
- `radarGetSimilar(pA, n=5)` — similitud coseno sobre `_radarSim`; retorna top-n similares al jugador A.
- `radarRender()` — orquesta: valida `_radarIdxA`, llama `radarGetScores()`, inyecta SVG en `#radarSvgWrap`, construye cartas en `#radarCards`, similares en `#radarSimilar`, composición de ejes en `#radarAxisDefs`.
- `radarAcInput(side)` / `radarAcSelect(side, idx, name)` / `radarAcKey(event, side)` / `radarAcOpen(side)` / `radarAcClose(side)` — autocomplete; `side` es `'A'` o `'B'`. Guarda índice en `_radarIdxA` / `_radarIdxB`.
- `radarToggleCmp()` — muestra/oculta el bloque `#radarSearchB` y limpia jugador B al desactivar.

**Estado global:**
- `_radarPct` — objeto con arrays ordenados por feature; `null` hasta primer uso.
- `_radarIdxA` / `_radarIdxB` — índices en `PLAYERS`; `null` si no hay jugador seleccionado.
- `_radarAcFocusIdx` — `{ A: -1, B: -1 }` para navegación teclado en el dropdown.
- `_radarSim` — array de `{ p, i, raw, vec }` con los vectores ponderados; `null` hasta primer uso.

**Constantes:**
- `RADAR_MIN_SEG = 12000` — mínimo de segundos jugados para entrar al cálculo de percentiles y similitud.
- `RADAR_AXES` — array de 6 objetos `{ key, label, desc }` que define ejes y su composición legible.
- `RADAR_COLORS` — `{ A: { fill, stroke }, B: { fill, stroke } }`. A = violeta (`#8b5cf6`), B = teal (`#2dd4bf`).
- `_SIM_FEATS` — array de 15 objetos `{ k, w }` con las features y pesos del modelo de similitud.

**CSS relevante**: clases con prefijo `.radar-*`. El bloque responsive en `@media (max-width:640px)` apila `.radar-chart-col` y `.radar-similar-col` verticalmente y limita el SVG a `max-width:380px`. Las cartas FIFA (`#radarCards`) mantienen 3 columnas en mobile.

**Nota de portabilidad**: esta sección existe actualmente solo en `docs/liga_nacional/index.html`. Si se porta a otras ligas, copiar el bloque CSS `.radar-*`, el HTML `sec-j-radar`, las funciones `radar*` y añadir `'j-radar':'jugadores'` a `_SUB_GROUP` y `'j-radar':4` a `_SUB_IDX`.

## Comandos útiles
```bash
# Actualizar stats de jugadores — Liga Argentina
python Scraper/data_scraper.py

# Actualizar stats de jugadores — Liga Nacional
python Scraper/data_scraper_nacional.py

# Actualizar stats de jugadores — Liga Femenina
python Scraper/data_scraper_femenina.py

# Actualizar mapa de tiros (sólo nuevos partidos) — Liga Argentina
python Scraper/shot_map_scraper.py

# Forzar re-scrape completo de tiros — Liga Argentina
python Scraper/shot_map_scraper.py --full

# Actualizar mapa de tiros (sólo nuevos partidos) — Liga Nacional
python Scraper/shot_map_scraper_nacional.py

# Forzar re-scrape completo de tiros — Liga Nacional
python Scraper/shot_map_scraper_nacional.py --full

# Actualizar mapa de tiros (sólo nuevos partidos) — Liga Femenina
python Scraper/shot_map_scraper_femenina.py

# Forzar re-scrape completo de tiros — Liga Femenina
python Scraper/shot_map_scraper_femenina.py --full

# Actualizar jugada a jugada (sólo partidos nuevos) — Liga Argentina
python Scraper/pbp_scraper.py

# Forzar re-scrape completo de jugada a jugada — Liga Argentina
python Scraper/pbp_scraper.py --full

# Actualizar jugada a jugada (sólo partidos nuevos) — Liga Nacional
python Scraper/pbp_scraper_nacional.py

# Forzar re-scrape completo de jugada a jugada — Liga Nacional
python Scraper/pbp_scraper_nacional.py --full

# Actualizar jugada a jugada (sólo partidos nuevos) — Liga Femenina
python Scraper/pbp_scraper_femenina.py

# Forzar re-scrape completo de jugada a jugada — Liga Femenina
python Scraper/pbp_scraper_femenina.py --full

# Actualizar stats de jugadores — Liga de Desarrollo
python Scraper/data_scraper_proximo.py

# Actualizar mapa de tiros (sólo nuevos partidos) — Liga de Desarrollo
python Scraper/shot_map_scraper_proximo.py

# Forzar re-scrape completo de tiros — Liga de Desarrollo
python Scraper/shot_map_scraper_proximo.py --full

# Actualizar jugada a jugada (sólo partidos nuevos) — Liga de Desarrollo
python Scraper/pbp_scraper_proximo.py

# Forzar re-scrape completo de jugada a jugada — Liga de Desarrollo
python Scraper/pbp_scraper_proximo.py --full
```