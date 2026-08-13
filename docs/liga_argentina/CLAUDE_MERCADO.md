# CLAUDE_MERCADO.md — Mercado de Pases en Vivo (Liga Argentina)

Documentación técnica del tab **"Mercado"** del dashboard de Liga Argentina (`docs/liga_argentina/index.html`). Para las convenciones generales del proyecto ver `CLAUDE.md` en la raíz del repo.

## Qué es

Tab **"Mercado"**, primer botón de `.main-tabs` (a la izquierda de "Home"), sección `mercado`. Muestra en vivo el estado del mercado de pases: altas confirmadas, jugadores pretendidos, que se quedan, que se van, y vacantes por puesto en cada plantel.

**Existe en Liga Argentina y Liga Nacional** (no en Femenina ni Desarrollo — Pick and Roll no trackea esas ligas). La implementación de Liga Nacional (`docs/liga_nacional/index.html` + `liga_nacional.js` + `scraper/mercado_scraper_nacional.py`) es un port directo de la de Liga Argentina descripta en este documento, con dos diferencias:
- Fuente: `https://pickandroll.com.ar/mercado-vivo/` (`competition == "LNB"`), en vez de `mercado-vivo-liga-argentina/` (`competition == "LA"`).
- El hover de stats de temporada matchea únicamente contra el propio `PLAYERS` de Liga Nacional (no hay bridge cruzado hacia Liga Argentina como sí existe en la página de Liga Argentina hacia Liga Nacional) — más simple porque el dataset ya está cargado en la misma página.

No es data propia del proyecto (no sale de `liga_argentina.csv` ni de los scrapers de `laliganacional.com.ar`): se re-empaqueta un feed de un medio externo, con foco en presentarlo con el mismo lenguaje visual y de datos que el resto del dashboard.

## Fuente de datos

**`https://pickandroll.com.ar/mercado-vivo-liga-argentina/`**

La página no tiene API pública. El HTML embebe un `<script>` con:
```js
window.PNRMV_DATA = { version, clubs: [...], players: [...], competition, positions, statuses, ficha_types, confidence_levels, source_types, market_statuses };
```
Ese blob incluye clubes/jugadores de **todas** las competencias que trackea Pick and Roll (no solo Liga Argentina) — el scraper filtra por `competition === "LA"`.

**Campos relevantes de `players[]]` en el origen:**
| Campo | Descripción |
|---|---|
| `club_id` | id interno del club (slug), ej. `"san_isidro"` |
| `name` | nombre completo del jugador |
| `position` | `base\|escolta\|alero\|ala_pivote\|pivote` |
| `status` | `confirmado\|pretendido\|se_queda\|se_va\|vacante` |
| `confidence` | `oficial\|arreglo_verbal\|muy_avanzado\|interes\|en_duda\|se_cayo` |
| `ficha_type` | `mayor\|u21\|juvenil\|staff` |
| `age`, `height` | strings, no siempre presentes |
| `last_club` | último club del jugador (útil para altas) |
| `image_url` | foto del jugador (jpg/png), casi siempre presente |
| `source_type` | `club_oficial\|pnr\|agente\|medio\|seguimiento\|sin_fuente` |
| `updated_at` | timestamp de la última edición en el origen |

**Campos relevantes de `clubs[]]`:**
`id, name, abbr, pct` (0–100, % de plantel armado según Pick and Roll), `coach`, `market_status` (`abierto\|avanzado\|cerrado\|cerrado_reserva`), `target_mayor`, `target_u23`, `order`.

## Scraper — `scraper/mercado_scraper.py`

```bash
python3 scraper/mercado_scraper.py
```

1. `fetch_pnrmv_data()` — pide la página con `cloudscraper` (mismo patrón anti-bot que el resto de los scrapers del proyecto) y extrae `window.PNRMV_DATA` con una regex (`re.search(r"window\.PNRMV_DATA\s*=\s*(\{.*?\});", ...)`).
2. `transform(raw)`:
   - Filtra `clubs` y `players` a `competition == "LA"` y `active`.
   - Traduce `club_id` → nombre de equipo del dashboard vía el diccionario **`CLUB_ID_TO_TEAM`** (28 clubes mapeados a día de hoy — ver tabla abajo). Ese nombre es la clave que ya usa `LOGOS` en `liga_argentina.js`, así el frontend muestra los mismos escudos que el resto del sitio en vez de los del sitio fuente.
   - Descarta del JSON de salida los campos que no usa el frontend (`related_url`, `blurb`, `sort_order`, `source_detail`, etc.) para mantenerlo liviano.
3. Escribe **`docs/liga_argentina/mercado.json`**.
4. Si algún `club_id` no matchea con `CLUB_ID_TO_TEAM`, lo loguea a `stderr` (`Clubes sin match de logo...`) pero **no falla** — ese club se sirve igual, solo que sin logo (fallback de 3 letras, ver frontend).

**Corre 4 veces al día** vía `.github/workflows/mercado.yml` (workflow independiente del scraper diario de stats, `scraper.yml`) — a las 10:00, 13:00, 17:00 y 21:00 ART, cubriendo el horario donde más se mueve el mercado. Corre `mercado_scraper.py` (Liga Argentina) y `mercado_scraper_nacional.py` (Liga Nacional) y commitea ambos `mercado.json` si cambiaron. También se puede disparar manualmente desde GitHub Actions (`workflow_dispatch`) o correr los scrapers a mano. Es un workflow separado a propósito: si pickandroll cambia de estructura y la regex deja de matchear, no debe bloquear ni afectar al resto de los scrapers de stats.

### Mapeo `CLUB_ID_TO_TEAM` (pickandroll → `LOGOS`)

Pick and Roll trackea 28 de los 34 equipos de Liga Argentina (los que están fuera de su cobertura simplemente no aparecen en `clubs[]`). Los 6 que faltan: LANÚS, EL TALAR, COLON (SF), FUSION RIOJANA, HURACAN (LH), PERGAMINO BASQUET.

```python
CLUB_ID_TO_TEAM = {
    "amancay": "AMANCAY (LR)", "barrio_parque": "BARRIO PARQUE",
    "bochas_sport_club": "BOCHAS (CC)", "centenario_vt": "CENTENARIO (VT)",
    "central_entrerriano": "CENTRAL ENTRERRIANO", "ciclista_juninense": "CICLISTA (J)",
    "comunicaciones": "COMUNICACIONES", "deportivo_norte": "DEP. NORTE",
    "deportivo_viedma": "DEP. VIEDMA", "estudiantes_tucuman": "ESTUDIANTES (T)",
    "gimnasia_lp": "GIMNASIA (LP)", "hindu_club": "HINDU (C)",
    "independiente_bbc": "INDEPENDIENTE (SDE)", "jujuy_basquet": "JUJUY BASQUET",
    "la_union_colon": "LA UNIÓN (C)", "pico_fc": "PICO F.C.",
    "provincial_rosario": "PROVINCIAL (R)", "quilmes_mdp": "QUILMES (MDP)",
    "racing_avellaneda": "RACING (A)", "rivadavia_mendoza": "RIVADAVIA (MZA)",
    "salta_basket": "SALTA BASKET", "san_isidro": "SAN ISIDRO",
    "santa_paula": "SANTA PAULA (G)", "sportivo_suardi": "SP. SUARDI",
    "tomas_de_rocamora": "ROCAMORA", "union_mdp": "UNION (MDP)",
    "villa_mitre": "VILLA MITRE (BB)", "villa_san_martin": "VILLA SAN MARTIN",
}
```

**Si pickandroll agrega un club nuevo o le cambia el `club_id`**: agregar/actualizar la entrada acá. El nombre del valor debe ser exactamente una clave de `LOGOS` en `liga_argentina.js` (mayúsculas, con el sufijo entre paréntesis si corresponde) para que el logo matchee.

## `docs/liga_argentina/mercado.json` — esquema

```json
{
  "updated_at": "2026-07-25T13:40:00+00:00",
  "source_url": "https://pickandroll.com.ar/mercado-vivo-liga-argentina/",
  "clubs": [
    { "id": "san_isidro", "name": "San Isidro", "team": "SAN ISIDRO", "pct": 73,
      "coach": "...", "market_status": "abierto", "target_mayor": 7, "target_u23": 4, "order": 20 }
  ],
  "players": [
    { "id": "p_...", "club_id": "san_isidro", "name": "Nahuel Buchaillot",
      "position": "base", "ficha_type": "mayor", "status": "confirmado",
      "confidence": "oficial", "age": "25", "height": "1.78", "last_club": "San Isidro",
      "source_type": "club_oficial", "image_url": "https://.../foto.jpg", "updated_at": "2026-07-19 11:44:35" }
  ],
  "statuses": { "confirmado": "Confirmado", "pretendido": "Pretendido", "se_queda": "Se queda", "se_va": "Se va", "vacante": "Vacante" },
  "positions": { "base": "Base", "escolta": "Escolta", "alero": "Alero", "ala_pivote": "Ala-pivote", "pivote": "Pivote" },
  "ficha_types": { "...": "..." },
  "confidence_levels": { "...": "..." },
  "market_statuses": { "...": "..." }
}
```

- `clubs[].team` puede ser `null` si el `club_id` no está en `CLUB_ID_TO_TEAM` — el frontend cae a `clubs[].name` y a un placeholder de 3 letras en vez del logo.
- Los `*_levels`/`statuses`/`positions` diccionarios viajan en el JSON (no hardcodeados en el JS) para no romper si pickandroll agrega un valor nuevo — el frontend hace `MKT_DATA.statuses[key] || key` en todos lados.
- Cargado **lazy**: recién se hace `fetch('mercado.json?v=timestamp')` la primera vez que el usuario entra al tab (`mktInit()`), igual que `SHOTS_MAP`/`PBP_MAP` en el resto del dashboard.

## Frontend — `liga_argentina.js`

Todo el módulo vive agrupado bajo el comentario `// MERCADO EN VIVO`, cerca de `LOGOS`/`teamLogoHtml` (necesita `LOGOS` para los escudos).

**Estado global:**
| Variable | Uso |
|---|---|
| `MKT_DATA` | JSON completo de `mercado.json`, `null` hasta el primer `fetch` |
| `mktStatus` | filtro de estado activo en la vista de grid (`''` = todos) |
| `mktClub` | `club_id` seleccionado en el sidebar, `null` = ninguno (vista grid) |

**Funciones:**
- `mktInit()` — lazy fetch de `mercado.json`; si `MKT_DATA` ya está cargado, solo re-renderiza (mismo patrón que `tzcInit()`/`cnxInit()`).
- `mktBuildStatic()` — corre una sola vez tras cargar el JSON. Pinta: KPIs (`#mktKpis`), pills de estado (`#mktStatusPills`), timestamp (`#mktUpdated`), y la lista de clubes del sidebar (`#mktClubList`, con `%` de plantel armado).
- `mktSetStatus(s)` — cambia `mktStatus` y re-renderiza la vista grid. No aplica en la vista de tablero por club (los pills se ocultan ahí).
- `mktSelectClub(clubId)` — alterna entre **vista grid** (`#mktListView`) y **vista tablero por club** (`#mktBoardView`); oculta pills de estado y buscador cuando hay un club seleccionado (no aplican al tablero). `clubId = null` vuelve a la vista grid.
- `mktRender()` — vista grid: filtra `MKT_DATA.players` por `mktStatus` + `mktClub` + texto de búsqueda (`#mktSearch`), ordena por estado (confirmado→...→vacante) y nombre, pinta cards en `#mktGrid`.
- `mktRenderBoard(clubId)` — vista tablero: agrupa el plantel del club por las 5 posiciones fijas (`MKT_POS_ORDER`). Por posición: si hay jugadores `confirmado`, los pinta todos (puede haber más de uno, ej. dos ala-pívots); si no hay ninguno, pinta un placeholder punteado "Jugador a definir" — con badge `Vacante` si existe una entrada `status === 'vacante'` para esa posición, o `Sin confirmar` si no hay dato alguno.
- `mktInitials(name)` — iniciales (máx 2 letras) para el placeholder de foto cuando no hay `image_url` o falla la carga (`onerror` hace swap del `<img>` por un `<div>` con iniciales).

### Vista Grid (por defecto, sin club seleccionado)
`#mktListView` → `#mktCount` (contador) + `#mktGrid` (cards `.mkt-card`, una por jugador que matchea los filtros). Cada card: logo + nombre + badge de estado, meta (edad/altura/procedencia), footer con nombre de club + nivel de confianza.

### Vista Tablero (club seleccionado en el sidebar)
`#mktBoardView` → header con logo/nombre/DT del club (`#mktBoardLogo`/`#mktBoardName`/`#mktBoardMeta`) + `#mktBoard`, grid de 5 columnas (`MKT_POS_ORDER`: Base, Escolta, Alero, Ala-Pívot, Pívot). Cada columna (`.mkt-board-col`) tiene un título y N cards `.mkt-board-card` (foto 64×64 redondeada, nombre, badge de estado + confianza) o un placeholder `.is-vacant` (borde punteado) si no hay confirmados en esa posición.

**Portabilidad a otra liga**: este tab es específico de Liga Argentina — si se quisiera portar, haría falta (a) un feed equivalente de Pick and Roll para esa liga (hoy no existe/no está mapeado), y (b) su propio diccionario `club_id → LOGOS`. No hay nada reusable a nivel de código además de copiar el patrón.

## Hover: stats de temporada (Liga Argentina + Liga Nacional)

Al pasar el mouse por una card (grid o tablero) que tenga `data-mkt-name="<nombre completo>"`, se muestra un tooltip flotante (`#mktTip`, mismo patrón que `#thTip` — event delegation con `mouseover`/`mousemove`/`mouseout`) con PTS/REB/AST/MIN/TC%/3P% de la temporada, **si el jugador está en nuestra base de datos** (Liga Argentina o Liga Nacional). Si no matchea con ninguna, no se muestra nada — no hay mensaje de "no encontrado".

**El problema a resolver**: Pick and Roll da el nombre completo sin abreviar y en orden "Nombre Apellido" (`"Nahuel Buchaillot"`), mientras que las stats del dashboard usan el formato abreviado `"APELLIDO, N."` (campo `Nombre completo` de los CSV de stats). No hay forma directa de cruzar ambos.

**Solución — puente vía `players_dob.csv`**: ese CSV compartido (`docs/shared/players_dob.csv`, ver `CLAUDE.md` raíz) ya tiene ambos formatos por jugador y por liga: `nombre_completo` (`"NAHUEL BUCHAILLOT"`, sin abreviar) y `nombre_abreviado` (`"BUCHAILLOT, N."`). Es la misma clave que ya usa el dashboard para calcular `Edad` vía `DOB_MAP`.

1. **`DOB_ROWS_ALL`** (`liga_argentina.js`, junto a `DOB_MAP`) — guarda **todas** las filas de `players_dob.csv` sin filtrar por liga (a diferencia de `DOB_MAP`, que solo indexa Liga Argentina para el cálculo de edad). Se puebla en `initApp()`, en el mismo fetch que ya se hacía.
2. **`mktBuildNameIndex()`** — construye `MKT_NAME_INDEX`: `"NORMALIZADO(nombre_completo)" → [{liga, nombre_abreviado}, ...]`, restringido a `liga ∈ {'Liga Argentina','Liga Nacional'}` (las otras dos ligas quedan fuera a propósito — no forman parte del pedido). El valor es un **array**, no un objeto único: un jugador puede tener historial en ambas ligas (ascenso/descenso, préstamos) y `players_dob.csv` trae una fila por jugador y por liga — se guardan todas, no solo la primera encontrada. Se corre una sola vez, lazy, al entrar al tab (`mktInit()`).
3. **`mktNorm(s)`** — normaliza: quita acentos (`NFD` + strip de diacríticos `̀-ͯ`), mayúsculas, trim, colapsa espacios. Mismo patrón usado en otras partes del dashboard (ej. autocomplete de `j-radar`).
4. **Lookup de stats — `mktLookupStatsSync(fullName, currentTeam)`**:
   - Resuelve `fullName` a **todas** las entradas del jugador (`mktResolveEntry` → array de `{liga, nombre_abreviado}`, una por liga donde tiene historial).
   - Por cada entrada, `mktCandidatesForLeague(liga, nombre_abreviado)` junta sus temporadas/equipos en esa liga, normalizadas a un shape común (`liga, equipo, PJ, MPG, PPG, RPG, APG, SPG, BPG, TC%, T3%`):
     - Liga Argentina: filtra el array `PLAYERS` ya cargado (mismo dataset que alimenta toda Liga Argentina) por `Nombre completo === nombre_abreviado`, usando las stats por-partido ya calculadas en `initApp()`.
     - Liga Nacional: **no hay un `PLAYERS` de Liga Nacional cargado en esta página** (es la app de Liga Argentina). Se resuelve con `mktEnsureNacionalLoaded()`: fetch lazy de `../liga_nacional/liga_nacional.csv` (2–3 MB), cacheado en `MKT_NACIONAL_ROWS`, reutilizando **la misma función `buildRAW_J()`** que arma `PLAYERS` en Liga Argentina — el esquema de columnas es idéntico entre CSVs de stats de todas las ligas (ver `CLAUDE.md` raíz). El resultado (`MKT_NACIONAL_PLAYERS`) se agrega con `mktSimpleAverages()`. Si todavía no cargó, `mktCandidatesForLeague` devuelve `null` para esa liga (se trata distinto de "sin candidatos": ver punto 5).
   - Los candidatos de **todas** las ligas resueltas se concatenan en un único array y se le pasan a `mktPickBest()` — así, si el jugador jugó en ambas ligas, ninguna de las dos queda descartada de antemano por haber sido la "primera" en el índice.
5. **Precarga en background + espera si hace falta**: `mktInit()` dispara `mktEnsureNacionalLoaded()` sin esperarlo (fire-and-forget) apenas se entra al tab, para que el fetch de Liga Nacional ya esté resuelto cuando el usuario efectivamente pasa el mouse sobre una card. Si aun así el hover llega antes (red lenta) **y** el jugador tiene alguna entrada en Liga Nacional en el índice, el handler de hover espera explícitamente: muestra el resultado parcial de Liga Argentina (o "Buscando stats…" si no hay ninguno) y vuelve a renderizar con el resultado final una vez que `MKT_NACIONAL_PLAYERS` está listo — sin este chequeo, un jugador con mejor match en Liga Nacional (p. ej. "sigue en el club" ahí) podría mostrarse con datos de Liga Argentina y nunca actualizarse.

**Cobertura real** (jul 2026, tras el match por subconjunto de palabras descripto abajo): de los jugadores `confirmado`/`se_queda` en `mercado.json` (LA + LN), **201 de 231 (~87%)** resuelven a stats propias. El resto (~30) son altas juveniles, extranjeros recién llegados o jugadores sin minutos en la temporada actual de ninguna de las dos ligas — genuinamente no están en nuestra base, y no muestran tooltip (comportamiento correcto, no un bug).

**Dónde se agregó `data-mkt-name`/`data-mkt-team`**: en `mktRender()` (`.mkt-card` de la vista grid) y en `mktRenderBoard()` (`.mkt-board-card` de jugadores del tablero — los placeholders `is-vacant` no lo llevan, no hay jugador real que buscar). `data-mkt-name` es el `name` crudo de `mercado.json` (formato Pick and Roll); `data-mkt-team` es `club.team` (nombre `LOGOS`) del club actual del jugador en el mercado. Ambos escapados con `mktEscAttr()`.

### Discrepancias de nombre entre Pick and Roll y `players_dob.csv`

Pick and Roll es contenido cargado a mano por un medio, y `players_dob.csv` viene de un scrape de la liga — el mismo jugador puede aparecer escrito de formas distintas en cada fuente. `mktResolveEntry(fullName)` prueba, en orden, tres estrategias antes de rendirse:

1. **Match exacto normalizado** — `mktNorm()` saca acentos (`NFD` + strip de diacríticos), pasa a mayúsculas y colapsa espacios. Cubre mayúsculas/minúsculas, tildes y espacios dobles.
2. **Match por subconjunto de palabras — `mktSubsetMatch(key)`**: cubre el caso más común de discrepancia, que no es un typo sino una **cantidad distinta de palabras** en el nombre:
   - Segundo nombre de más o de menos: `"Jano Martínez"` (Pick and Roll) vs `"JANO DAVID MARTINEZ"` (`players_dob.csv`).
   - Segundo apellido de más o de menos: `"Agustin Perez Tapia"` vs `"AGUSTIN PEREZ"`.
   - Se usa el segundo nombre de pila como si fuera el primero: `"Ignacio Respaud"` vs `"JUAN IGNACIO RESPAUD"`.
   - En los tres casos, el conjunto de palabras de un nombre es **subconjunto** del otro. `mktSubsetMatch` compara el nombre buscado (como conjunto de palabras) contra cada clave del índice (`MKT_NAME_TOKENS`, precomputado una vez en `mktBuildNameIndex()`) y se queda con la de menor diferencia de palabras (`big.size - small.size`), exigiendo que el conjunto más chico tenga ≥2 palabras (para no matchear por un solo nombre de pila común). Si el mejor resultado empatado corresponde a **más de una persona distinta**, no adivina — devuelve `null` en vez de mostrar stats de otro jugador.
   - Esto reemplazó un fix anterior más angosto que solo probaba "primer nombre + último apellido"; ese approach fallaba con apellidos compuestos (`"Tiago López Estela"` vs `"TIAGO NAHUEL LOPEZ ESTELA"` — el primer+último de cada uno no coincidía) y con el patrón de "segundo nombre usado como primero". El match por subconjunto cubre todos esos casos con una sola regla.
3. **Distancia de Levenshtein — `mktLevenshtein(a,b)`** (implementación estándar de programación dinámica, sin dependencias), como último recurso para typos de caracteres que no cambian la cantidad de palabras (una letra de más/menos, una tilde). Tolerancia: `min(3, max(1, round(largo_nombre * 0.12)))` caracteres.

Recorre el índice completo por cada nombre no resuelto, pero es lazy y **cacheado por nombre** (`MKT_FUZZY_CACHE`, compartido entre las estrategias 2 y 3) — el costo solo se paga una vez por jugador, en el primer hover.

Validado contra los ~230 jugadores reales de `mercado.json` (LA + LN): la cobertura subió de 169/231 a 201/231 tras agregar el match por subconjunto, sin introducir falsos positivos (nombres sin relación real, como `"Agustin Sigel"` vs `"AGUSTIN PEREZ"`, siguen devolviendo `null`).

Este mismo `mktResolveEntry()` es el que usa el branch de "cargando Liga Nacional" del hover handler en `liga_argentina.js`.

### Preferencia por el equipo actual (renovaciones)

Cuando un jugador confirmado ya jugó antes en el **mismo club** al que acaba de firmar (una renovación, no un fichaje nuevo), el tooltip debe reflejar esa continuidad en vez de mostrar, por ejemplo, su paso por otro equipo hace dos temporadas.

- **`mktPickBest(candidates, currentTeam)`** — dado el conjunto de entradas del jugador (puede tener más de una si jugó para varios equipos), primero filtra por `p.Equipo === currentTeam` (el `club.team` del mercado); si hay alguna, usa la de mayor `PJ` entre esas y marca `sameTeam: true`. Si no jugó para ese equipo, cae al fallback general (mayor `PJ` sin importar el equipo).
- El tooltip muestra un indicador visual cuando `sameTeam` es `true`: `· sigue en el club` en teal, junto al nombre de equipo/liga/PJ.
- Esto requiere pasarle el equipo actual del jugador al lookup — por eso `mktLookupStatsSync` ahora recibe `(fullName, currentTeam)`, y las cards llevan `data-mkt-team` además de `data-mkt-name`.

## CSS

Todo con prefijo `.mkt-*`, definido en un `<style>` inline dentro de `docs/liga_argentina/index.html` (no en `docs/shared/common.css`, porque es exclusivo de esta liga). Usa únicamente las variables de `common.css` (`--surface`, `--border2`, `--purple`, `--teal`, `--green`, `--orange`, `--red`, `--muted`, etc.) — no se agregaron colores nuevos al sistema.

Colores de estado (reservados, no reutilizar para otra cosa):
| Estado | Color |
|---|---|
| `confirmado` | `--green` |
| `pretendido` | `--orange` |
| `se_queda` | `--teal-l` |
| `se_va` | `--red` |
| `vacante` | `--muted` |

## Chat del Mercado (IA) — agosto 2026

Widget colapsable "Preguntale a la IA sobre el mercado" dentro del tab, entre el header y la
barra de progreso (`#mktChatWrap`, presente en Liga Argentina y Liga Nacional). Permite preguntas
libres en lenguaje natural sobre `mercado.json` de ambas ligas (altas, bajas, pretendidos,
vacantes, comparaciones entre clubes/ligas). Pensado como producto pago para asistentes de
equipo — prototipado y validado primero en `scraper/prototipo_agente_mercado.py` antes de portar
a producción (ese script documenta el razonamiento completo, incluidos los bugs encontrados
durante la validación).

**Arquitectura**: nada de contexto crudo — el modelo (`claude-haiku-4-5-20251001`) no recibe el
JSON completo, solo tiene 3 tools de filtrado exacto (`buscar_jugadores`, `buscar_clubes`,
`resumen_liga`, definidas en `api/lib/mercado-chat.js`) sobre una clase `Mercado`
(`api/lib/mercado.js`) que hace el filtrado en JS puro. Motivo: se probó en el prototipo que un
modelo chico se equivoca en conteos/listados si tiene que "leer" el JSON a ojo (contó mal por
decenas de jugadores, e incluso alucinó un campo directo) — con tools de filtrado exacto, las
10 preguntas de validación dieron 100% correctas contra la data real.

- **`buscar_jugadores`** devuelve, además de la lista, `total`, y el desglose `renovaciones`/
  `nuevos` **ya precalculado** (cada jugador trae `es_renovacion`). Esto no es opcional: se probó
  que aunque el system prompt le pida explícitamente usar ese desglose, un modelo chico a veces
  igual intenta contarlo "a mano" sobre una lista ya traída y se equivoca — por eso el cálculo
  vive en el código, no depende de que el modelo lo pida bien.
- `es_renovacion` compara `last_club` (tal cual lo escribe la fuente) contra el nombre **crudo**
  del club (`clubs[].name`), no contra la abreviatura resuelta de `LOGOS` (`clubs[].team`) — si se
  compara contra la abreviatura, casos como "Hindú Club" vs "HINDU (C)" no matchean y se cuentan
  como fichaje nuevo cuando en realidad es una renovación (bug encontrado y corregido durante la
  validación).
- El system prompt instruye explícitamente **no mencionar el nombre de la fuente** (pickandroll)
  en las respuestas — se refiere a la data como "nuestra base de datos del mercado".
- `MAX_TOOL_ROUNDS = 5` en el backend, tope de idas y vueltas de tool-calling por pregunta (evita
  loops largos en preguntas raras).

**Endpoint**: `POST /api/mercado/chat` (`api/lib/mercado-chat.js`, ruteado desde `api/index.js`).
Body: `{ liga: 'liga_argentina'|'liga_nacional'|'ambas', pregunta: string, historial?: [{role,
content}] }` — el frontend manda hasta 12 mensajes de historial para permitir preguntas de
seguimiento. Trae `mercado.json` de ambas ligas **en vivo por HTTP** desde el propio dominio
(`https://${req.headers.host}/liga_*/mercado.json`), no de un archivo bundleado — así nunca
queda desactualizado respecto al último scrape, sin necesitar redeploy.

**Auth — solo usuarios logueados**: el widget es visible para cualquiera, pero
`handleMercadoChat` exige un `Authorization: Bearer <token>` válido (`api/lib/auth.js`, ver
sección "Backend serverless" del `CLAUDE.md` raíz) antes de gastar ni un token de la API de
Claude — la protección real es server-side, el frontend solo evita mandar el request si ya sabe
que no hay sesión (`localStorage.auth_token`). Sin token: el widget muestra "Iniciá sesión para
usar el asistente" con link a `login.html?returnTo=<liga>/` en vez de llamar al endpoint. Si el
backend devuelve 401 (token vencido), limpia la sesión local y muestra el mismo prompt.

**Costo**: validado en el prototipo a ~$0.006-0.008/pregunta con Haiku (2 llamadas a la API por
pregunta: una para decidir qué tool llamar, otra para redactar la respuesta final).

**Archivos**: `api/lib/mercado.js` (filtrado, sin dependencias), `api/lib/mercado-chat.js`
(system prompt, tools, loop de tool-calling), `api/lib/auth.js` (compartido con
`/api/placas/generate`). Frontend: bloque `// Chat del Mercado (IA)` al final de
`liga_argentina.js`/`liga_nacional.js` (funciones `mktChat*`), widget HTML en `sec-mercado` de
cada `index.html`, CSS `.mktchat-*` junto al resto de `.mkt-*`.

**Portabilidad a otra liga**: no aplica hoy — el chat depende de `mercado.json`, que solo existe
en Liga Argentina y Liga Nacional (mismo alcance que el resto del tab Mercado).

## Limitaciones conocidas

- Datos de un tercero (Pick and Roll): pueden estar desactualizados según cuándo se corrió el scraper (no hay refresh automático — ver timestamp `#mktUpdated`). Se linkea la fuente explícitamente en el header del tab por transparencia.
- 6 equipos de Liga Argentina no están cubiertos por Pick and Roll (no aparecen ni en el sidebar de clubes ni en ningún filtro).
- Un jugador con `status: "vacante"` es una fila "placeholder" del origen (sin nombre real) que marca que ese puesto está buscado activamente; no es un jugador real. El tablero lo usa solo para decidir el label del placeholder, nunca lo pinta como card.
- Si pickandroll cambia el nombre de las claves de `PNRMV_DATA` (ej. renombra `players` o `club_id`), el scraper no rompe pero el JSON de salida queda vacío/incompleto — no hay validación de schema en `transform()`.
