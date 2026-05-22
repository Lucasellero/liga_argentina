# CLAUDE.md — Sudamericano U17 FIBA 2025

## Proyecto

Datos del **Campeonato Sudamericano FIBA U17 2025** (Paraguay, 10–14 dic 2025), orientados al scouting de la Selección Argentina de básquet formativo.

8 selecciones: ARG, BRA, CHI, COL, ECU, PAR, URU, VEN. 20 partidos totales (fase de grupos + cuadro de medallas). Argentina disputó 5 partidos.

URL base: `https://www.fiba.basketball/es/events/fiba-u17-south-american-championship-2025`

---

## Estructura de la carpeta

```
sudamericano_u18/
  CLAUDE.md                        # este archivo
  fiba_utils.py                    # módulo compartido: fetch, parseo RSC, helpers
  boxscore_scraper.py              # genera sudamericano_u18_boxscore.csv
  pbp_scraper.py                   # genera sudamericano_u18_pbp.csv
  shots_scraper.py                 # genera sudamericano_u18_shots.csv
  sudamericano_u18_boxscore.csv    # stats por jugador por partido (475 filas)
  sudamericano_u18_pbp.csv         # todos los eventos PBP (11,351 filas)
  sudamericano_u18_shots.csv       # solo tiros con coordenadas (3,518 filas)
```

---

## Cómo funciona el scraper (técnico)

### Fuente de datos

La web de FIBA (`www.fiba.basketball`) es una **Next.js App Router** SPA. Los datos de cada partido (box score, PBP, shot chart) están **embebidos directamente en el HTML** como RSC payload (React Server Components), en scripts del tipo:

```html
<script>self.__next_f.push([1,"...JSON escapado..."])</script>
```

No se requiere API key, login ni interceptar llamadas XHR. `fiba_utils.extract_rsc_data()` extrae y concatena todo ese contenido.

El acceso usa `cloudscraper` (ya instalado en el proyecto) para evadir protección anti-bot básica.

### URL de cada partido

```
https://www.fiba.basketball/es/events/fiba-u17-south-american-championship-2025/games/{gameId}-{TEAM1}-{TEAM2}
```

Ejemplo: `https://www.fiba.basketball/es/events/fiba-u17-south-american-championship-2025/games/125522-ECU-COL`

### Partidos conocidos (`KNOWN_GAMES` en `fiba_utils.py`)

| gameId | Slug | Fase |
|---|---|---|
| 125521 | URU-ARG | Grupos A |
| 125522 | ECU-COL | Grupos A |
| 125523 | COL-URU | Grupos A |
| 125524 | ARG-ECU | Grupos A |
| 125525 | URU-ECU | Grupos A |
| 125526 | COL-ARG | Grupos A |
| 125527 | PAR-VEN | Grupos B |
| 125528 | BRA-CHI | Grupos B |
| 125529 | CHI-PAR | Grupos B |
| 125530 | VEN-BRA | Grupos B |
| 125531 | PAR-BRA | Grupos B |
| 125532 | CHI-VEN | Grupos B |
| 130826 | COL-PAR | 5°–8° puesto |
| 130827 | CHI-ECU | 5°–8° puesto |
| 130828 | ARG-VEN | Semifinal/medallas |
| 130829 | BRA-URU | Semifinal/medallas |
| 130830 | COL-ECU | 7° puesto |
| 130831 | PAR-CHI | 5° puesto |
| 130832 | VEN-URU | Bronce |
| 130833 | ARG-BRA | Final (🥇 ARG) |

### Estructura del RSC (qué hay dentro)

El payload embebido contiene tres bloques principales:

```
playByPlay: {
  items: {
    Q1: { name, scoreA, scoreB, items: [...eventos] },
    Q2: {...}, Q3: {...}, Q4: {...}
  }
}

gameDetails: {
  c: [
    { Id: "T_52",  Score: 48,  Children: [{ Id: "P_409013", Stats: {...} }, ...] },
    { Id: "T_40",  Score: 79,  Children: [...] }
  ]
}

game: { gameId, gameName, teamA: { organisationId, code, officialName }, teamB: {...} }
playersTeamA: [{ personId, firstName, lastName, uniformNumber, isCaptain }, ...]
playersTeamB: [...]
```

El `Id` de equipo tiene formato `"T_{organisationId}"` (ej. `T_52` = Ecuador, `T_40` = Colombia). El `Id` de jugador tiene formato `"P_{personId}"`.

---

## Comandos

```bash
# Scrape completo (sobreescribe todo)
python boxscore_scraper.py --full
python pbp_scraper.py --full
python shots_scraper.py --full

# Solo partidos nuevos (incremental, por defecto)
python boxscore_scraper.py
python pbp_scraper.py
python shots_scraper.py
```

El modo incremental detecta los `gameId` ya presentes en el CSV y solo descarga los que faltan. Útil si se agrega un nuevo torneo o se amplía `KNOWN_GAMES`.

---

## CSV: sudamericano_u18_boxscore.csv

Stats finales por jugador por partido. Una fila = un jugador en un partido.

| Columna | Descripción |
|---|---|
| `gameId` | ID numérico del partido |
| `gameName` | Código interno FIBA (ej. `29454-A-2`) |
| `date` | Fecha ISO (puede estar vacía si FIBA no la expone en el RSC) |
| `teamCode` | Código de 2–3 letras del equipo (ARG, BRA, etc.) |
| `teamName` | Nombre oficial (Argentina, Brasil, etc.) |
| `orgId` | ID de la organización FIBA |
| `personId` | ID FIBA del jugador |
| `firstName` / `lastName` | Nombre y apellido |
| `uniformNumber` | Dorsal |
| `isStarter` | `1` si titular, `0` si reserva |
| `MIN` | Minutos jugados en formato `MM:SS` |
| `PTS` | Puntos |
| `FG2M` / `FG2A` / `FG2P` | Dobles (convertidos / intentados / %) |
| `FG3M` / `FG3A` / `FG3P` | Triples (convertidos / intentados / %) |
| `FTM` / `FTA` / `FTP` | Tiros libres (convertidos / intentados / %) |
| `REB` / `DREB` / `OREB` | Rebotes (total / defensivos / ofensivos) |
| `AST` | Asistencias |
| `STL` | Robos |
| `BLK` | Tapones cometidos |
| `BLKR` | Tapones recibidos |
| `TO` | Pérdidas |
| `PF` | Faltas cometidas |
| `FD` | Faltas recibidas |
| `PM` | Plus/minus |
| `EFF` | Valoración FIBA |

---

## CSV: sudamericano_u18_pbp.csv

Todos los eventos del partido en orden cronológico por período y `order`.

| Columna | Descripción |
|---|---|
| `gameId` | ID del partido |
| `gameName` | Código FIBA |
| `date` | Fecha ISO |
| `teamA_code` / `teamB_code` | Códigos de equipos (teamA = local) |
| `period` | Período: `Q1`, `Q2`, `Q3`, `Q4` (o `OT1`, etc.) |
| `timeRemaining` | Tiempo restante en el período (`MM:SS`) |
| `scoreA` / `scoreB` | Marcador en ese momento (después del evento) |
| `eventId` | ID del evento (correlativo dentro del partido) |
| `order` | Orden de clasificación global del evento (múltiplos de 1000, los sub-eventos tienen decimales: 1001, 1002) |
| `act` | Tipo de evento: `shot`, `subst`, `periods`, `timeout`, `unknwown` |
| `actionCode` | Código FIBA del evento (ver tabla abajo) |
| `actionText` | Descripción en inglés del evento |
| `orgId` | ID de organización del equipo involucrado (vacío en eventos neutros) |
| `personId` | ID del jugador involucrado (vacío en eventos neutros) |
| `made` | `True`/`False` (solo en `act=shot`) |
| `pts` | Valor del tiro: 1, 2 o 3 (solo en `act=shot`) |
| `x` / `y` | Coordenadas del tiro (solo en `act=shot`; ver sección Coordenadas) |
| `substitution_in_out` | `IN` o `OUT` (solo en `act=subst`) |
| `p2Id` | ID del segundo jugador (solo en `act=subst`, si aplica) |

### Tabla de `actionCode`

| Código | Significado | `act` |
|---|---|---|
| `STARTG` | Inicio del partido | `periods` |
| `ENDG` | Fin del partido | `periods` |
| `STARTP` | Inicio de período | `periods` |
| `ENDP` | Fin de período | `periods` |
| `P2` | Tiro de 2pt | `shot` |
| `P3` | Tiro de 3pt | `shot` |
| `FT` | Tiro libre | `shot` |
| `ASS` | Asistencia | `unknwown` |
| `REB` | Rebote | `unknwown` |
| `TREB` | Rebote de equipo | `unknwown` |
| `ST` | Robo | `unknwown` |
| `BS` | Tapón | `unknwown` |
| `TO` | Pérdida | `unknwown` |
| `FOUL` | Falta cometida | `unknwown` |
| `RFOUL` | Falta recibida | `unknwown` |
| `CFOUL` | Falta de equipo | `unknwown` |
| `SUBST` | Sustitución | `subst` |
| `TIMO` | Tiempo muerto | `timeout` |
| `TTO` | Tiempo muerto de equipo | `unknwown` |
| `JB` | Jump ball | `unknwown` |
| `JS` | Posesión tras salto | `unknwown` |
| `VTR` | Video review | `unknwown` |

**Nota**: FIBA usa `"act":"unknwown"` (sic, con error tipográfico) para todos los eventos que no son tiros, sustituciones, períodos ni tiempos muertos. El `actionCode` distingue el tipo real.

---

## CSV: sudamericano_u18_shots.csv

Solo los eventos de tiro (`act=shot`), enriquecidos con nombre y dorsal del jugador.

| Columna | Descripción |
|---|---|
| `gameId` / `gameName` / `date` | Identificación del partido |
| `teamA_code` / `teamB_code` | Equipos del partido |
| `period` | Período del tiro |
| `timeRemaining` | Tiempo restante |
| `scoreA` / `scoreB` | Marcador al momento del tiro |
| `orgId` | ID org del equipo que tira |
| `teamCode` | Código del equipo que tira |
| `personId` | ID del jugador |
| `firstName` / `lastName` / `uniformNumber` | Info del jugador |
| `actionCode` | `P2`, `P3` o `FT` |
| `actionText` | Descripción en inglés (ej. "3pt jump shot made") |
| `made` | `1` convertido, `0` fallado |
| `pts` | Valor: 1, 2 o 3 |
| `shotType` | `2PT`, `3PT` o `FT` |
| `x` / `y` | Coordenadas en el sistema FIBA (ver abajo) |

---

## Coordenadas de tiros

**Sistema empíricamente determinado** a partir del dataset real (los valores del CLAUDE.md original eran incorrectos):

- `x`: 0–280 → **ancho de la cancha** (15m). Basket centrado en x≈140.
- `y`: 0–270 → **profundidad desde el aro atacado** (y pequeño = cerca del aro).
- **FIBA pre-normaliza** todos los tiros para que apunten al mismo aro, independientemente del período. **No hace falta espejar Q3/Q4** — los datos de Q1 y Q3 muestran las mismas distribuciones de y.
- **Tiros libres**: `x=0, y=0` (sin coordenada real).

### Constantes empíricas del sistema

Derivadas ajustando los datos reales del torneo:

| Constante | Valor | Descripción |
|---|---|---|
| `FIBA_BX` | 140 | Basket center x (mitad del ancho) |
| `FIBA_BY` | 32 | Basket center y (≈1.7m desde la línea de fondo) |
| `FIBA_R3` | 138 | Radio del arco de 3pt en unidades FIBA (≈6.6m) |
| `FIBA_PW2` | 46 | Semiancho de la pintura (±2.45m → 280/15×2.45) |
| `FIBA_PD` | 109 | Profundidad de la pintura / línea de tiro libre |
| `FIBA_FTR` | 34 | Radio del círculo de tiro libre |
| `FIBA_RAR` | 23 | Radio del área restringida |
| `FIBA_CX` | 17 | X del corner (0.9m desde la línea lateral) |

Valores de referencia verificados en el dataset:
- Bandeja bajo el aro: x≈140, y≈32 (mediana de 2pt convertidos)
- Triple frontal (centro): x≈140, y≈170
- Triple corner izquierdo: x≈5–17, y≈40–95
- Tiros del half-court y muy lejanos pueden tener y hasta 254

### Canvas para shot chart

El dashboard usa una **media cancha en landscape** con estas proporciones:

```
H = W × (FIBA_H / FIBA_W) = W × (261 / 280) ≈ W × 0.932
Scale S = W / 280  (pixels por unidad FIBA, igual en x e y)
canvas_x = fx × S
canvas_y = fy × S
```

`FIBA_H = 261` corresponde a la profundidad real de la media cancha FIBA (14m = 522/2 unidades). Usar 175 era incorrecto: el arco de 3pt llega a y≈170, dejando la zona ABOVE_BREAK como un sliver de 5px y recortando los tiros lejanos (y hasta 254).

**Arco de 3pt en el canvas** (`drawCourt`): se dibuja con `anticlockwise=true` (counterclockwise). El arco va desde la unión izquierda (17, ~94.6) bajando hasta el punto más lejano (140, 170) y subiendo hasta la unión derecha (263, ~94.6). `anticlockwise=false` lo haría ir por arriba del aro (fuera de pantalla).

**Arco de 3pt en el SVG overlay** (`szcUpdateSvg`): se dibuja con `sweep=0` (counterclockwise en SVG). Mismo razonamiento: `sweep=1` traza el arco que bordea la línea de fondo en lugar del arco exterior.

### Clasificación de zonas (7 zonas)

Mismas 7 zonas del dashboard principal, adaptadas al sistema FIBA:

```javascript
dx = fx - FIBA_BX   // negativo = izquierda, positivo = derecha
dy = fy - FIBA_BY   // positivo = alejándose del aro (hacia el centro)

// 3pt:
CORNER_TOP  (corner izquierdo):  dx < 0 && dy < -dx
CORNER_BOT  (corner derecho):    dx > 0 && dy <  dx
ABOVE_BREAK (arco central):      resto

// 2pt:
PAINT:       (fy <= FIBA_PD && |dx| <= FIBA_PW2) || dist <= FIBA_RAR
MID_TOP:     dx < -FIBA_PW2   (lateral izquierdo)
MID_BOT:     dx >  FIBA_PW2   (lateral derecho)
MID_CENTER:  resto             (top of key)
```

---

## Jugadores de Argentina

| personId | Nombre | Dorsal |
|---|---|---|
| (ver CSV) | Bautista Gobetti | — |
| (ver CSV) | Benjamin Pettovello | — |
| (ver CSV) | Elias Torrens | — |
| (ver CSV) | Facundo Cornalis | — |
| (ver CSV) | Gonzalo Aman | — |
| (ver CSV) | Joaquin Caumo | — |
| (ver CSV) | Joaquin Celiz | — |
| (ver CSV) | Juan Marquez | — |
| (ver CSV) | Manuel Hernandez | — |
| (ver CSV) | Mateo Fessia | — |
| (ver CSV) | Roman Moravansky | — |
| (ver CSV) | Santiago Pettinaroli | — |

Para obtener los dorsales: `df[df['teamCode']=='ARG'][['firstName','lastName','uniformNumber']].drop_duplicates()`

## Partidos de Argentina

| gameId | Rival | gameName |
|---|---|---|
| 125521 | URU | 29454-A-1 (Grupos A) |
| 125524 | ECU | 29454-A-4 (Grupos A) |
| 125526 | COL | 29454-A-6 (Grupos A) |
| 130828 | VEN | 29460-15-15 (Semis) |
| 130833 | BRA | 29462-20-20 (Final 🥇) |

---

## Agregar un nuevo torneo FIBA

El mismo enfoque funciona para cualquier otro torneo en `www.fiba.basketball`. Pasos:

1. **Identificar el slug del torneo** desde la URL: `fiba-u17-south-american-championship-2025`
2. **Obtener los gameIds** cargando la página de partidos del torneo y buscando el patrón `\\"gameId\\":\\d+` en el RSC embebido
3. **Actualizar `KNOWN_GAMES`** en `fiba_utils.py` con `{gameId: "TEAM1-TEAM2"}`
4. **Actualizar `TOURNAMENT_SLUG`** en `fiba_utils.py`
5. Correr los scrapers

### Script para descubrir gameIds de un torneo

```python
import re, cloudscraper
slug = "fiba-u17-south-american-championship-2025"
s = cloudscraper.create_scraper()
html = s.get(f"https://www.fiba.basketball/es/events/{slug}/games").text
# Extraer RSC
parts = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full = "\n".join(parts)
# Buscar gameId + equipos
games = re.findall(
    r'\\"gameId\\":(\d+),[^\n]*?\\"teamA\\":\{[^\n]*?\\"code\\":\\"([A-Z]+)\\"[^\n]*?\\"teamB\\":\{[^\n]*?\\"code\\":\\"([A-Z]+)\\"',
    full
)
for gid, ta, tb in games:
    print(f'{gid}: "{ta}-{tb}"')
```

---

## Notas técnicas

- El RSC usa `\"` para los strings internos; `fiba_utils._unescape_rsc()` los desescapa antes de parsear con `json.loads()`
- El campo `date` suele quedar vacío porque FIBA lo expone como `"$D2025-12-10T..."` (prefijo React) que el regex actual no captura para el nivel de partido individual. Las fechas exactas pueden inferirse del `gameName` (ej. `29454-A-1` es el partido A-1 de la competición 29454)
- `act=unknwown` es un typo del sistema FIBA LiveStats; no corregir para evitar romper el matching contra futuros datos crudos
- Los IDs de partido (`gameId`) son **numéricos enteros**, no strings Base64 como en la Liga Nacional Argentina

---

## Dashboard — `docs/argentina_formativas/`

El dashboard vive en `docs/argentina_formativas/` y está basado en el de Liga Nacional con las siguientes diferencias intencionales para adaptarse al formato torneo.

### Archivos del dashboard

```
docs/argentina_formativas/
  index.html                      # SPA del dashboard
  argentina_formativas.js         # lógica JS (~4200 líneas)
  argentina_formativas.csv        # box score transformado (515 filas player + 40 TOTALES)
  argentina_formativas_shots.csv  # tiros con coordenadas FIBA nativas x/y (3518 filas)
  argentina_formativas_pbp.csv    # jugada a jugada en formato Liga Nacional (11351 filas)
  logos/                          # logos de las 8 selecciones (arg.png, bra.png, etc.)
```

Los 3 CSVs son generados por `sudamericano_u18/transform_to_liga_format.py`.

**Diferencia clave en shots CSV**: usa columnas `x`/`y` (unidades FIBA, rango 0–280 × 0–270) en lugar de `Left_pct`/`Top_pct`. Todo el código de renderizado en `argentina_formativas.js` fue adaptado para leer estas columnas directamente.

### Header

- Logo: `../liga_argentina/logos/scouteado_logo.png` (90×90px, mismo que Liga Argentina)
- Favicon: `../liga_argentina/logos/scouteados_favicon.png`
- Badge `#badgePlayers`: se actualiza en `initApp()` con `PLAYERS.length + ' Jugadores'`
- Badge fijo: `'8 Selecciones'`
- Sin botones de navegación cruzada entre ligas (página oculta)

### Navegación

Nav principal con solo **3 secciones** (vs 5 en ligas regulares):

| Main tab | Sub-secciones (en orden) |
|---|---|
| Home | — (`sec-posiciones`) |
| Equipos | Tabla · Tiros · Quintetos · Tríos · Duplas · Conexiones · Comparar T-T · Gráfico |
| Jugadores | Tabla · Tiro · Comparar · Conexiones · Radar |

**`_SUB_IDX` de Equipos** (debe coincidir con el orden DOM de `#subEquipos`):
```
't-tabla':0, 't-tiro':1, 'quintetos':2, 'trios':3, 'duplas':4, 't-conexiones':5, 't-tcmp':6, 't-chart':7
```

**Secciones eliminadas** (no aplican a torneo):
- **Destacados** (`sec-lideres`): torneo de 20 partidos, sin acumulación suficiente para líderes.
- **Fixture** (`sec-partidos`): el torneo ya terminó, no hay partidos próximos.

### Filtros eliminados (stubs no-op)

Los siguientes filtros están **stubbed como no-ops** en `argentina_formativas.js` y sus botones no existen en el HTML:

- **Período** (Últimos 5 / Últimos 10): torneo de 3–5 partidos por equipo, sin sentido estadístico.
- **Condición** (Local / Visitante): sede neutral (Asunción), distinción arbitraria.

Las variables `jPeriod`, `tPeriod`, `szcPeriod`, `tzcPeriod`, `jLocVis`, `tLocVis`, `szcLocVis`, `tzcLocVis` existen pero siempre valen `'all'`. Las funciones setter son no-ops.

### Configuración específica del JS

```javascript
PLAYOFF_DATE  = new Date(2025, 11, 13)      // 13 dic = inicio fase de medallas
CONF_NORTE    = new Set(['ARG','URU','COL','ECU'])  // Grupo A
CONF_SUR      = new Set(['BRA','CHI','PAR','VEN'])  // Grupo B
RADAR_MIN_SEG = 600                          // 10 min mínimo (vs 12000 en ligas regulares)
```

### Constantes del shot chart (`argentina_formativas.js`)

```javascript
const FIBA_W   = 280;  // ancho total en unidades FIBA (15m)
const FIBA_H   = 261;  // profundidad media cancha (14m = 522/2 unidades FIBA)
const FIBA_BX  = 140;  // basket center x
const FIBA_BY  = 32;   // basket center y (~1.7m desde la línea de fondo)
const FIBA_R3  = 138;  // radio arco 3pt (≈6.6m, ajustado empíricamente)
const FIBA_PW2 = 46;   // semiancho de la pintura (≈2.45m)
const FIBA_PD  = 109;  // profundidad de la pintura / línea TL (≈5.8m)
const FIBA_FTR = 34;   // radio del círculo de tiro libre (≈1.8m)
const FIBA_RAR = 23;   // radio área restringida (≈1.25m)
const FIBA_CX  = 17;   // x del corner (≈0.9m desde la lateral)
```

Canvas: `H = W × (FIBA_H / FIBA_W)`, escala uniforme `S = W / FIBA_W`. Centro del label ABOVE_BREAK en el SVG: `[140, 215]` (centro del rango y=170..261).

FIBA pre-normaliza todos los tiros al mismo aro — no hace falta espejar Q3/Q4. Tiros libres tienen `x=0, y=0` y son ignorados en el shot chart.

### Acceso restringido

Página oculta (no aparece en la navegación entre ligas). El auth guard al inicio de `argentina_formativas.js` admite dos vías:

1. **UUID en `ALLOWED`** (lista hardcodeada):
```javascript
const ALLOWED = new Set([
  '996a7324-08c2-47de-bc55-4219c7d144fd', // ramiellero@gmail.com
  'cea8e4c5-959e-497f-b991-ee431c4c585b', // silveirajalejandro@gmail.com
  'dac0503f-0e85-4d28-ac58-66fce78afcbd', // lucasellero05@gmail.com
]);
```
2. **`user_metadata.formativas_access === true`** en Supabase (para escalar sin tocar código).

Para dar acceso a un usuario nuevo: agregar su UUID a `ALLOWED` y pushear, **o** setear `formativas_access: true` en su metadata de Supabase.

### Particularidades del PBP transformado (`argentina_formativas_pbp.csv`)

El PBP se convierte del formato FIBA al formato Liga Nacional mediante `transform_to_liga_format.py`. Algunas diferencias importantes respecto al PBP de las ligas regulares:

**`CANASTA-1P` = canasta con foul ("and-one")**: en el PBP transformado, `CANASTA-1P` no representa un tiro libre convertido sino una canasta de campo hecha mientras el jugador era fouled. La secuencia típica es:
```
FALTA-COMETIDA
FALTA-RECIBIDA
CANASTA-1P   ← la canasta de campo del and-one
ASISTENCIA   ← la asistencia a esa canasta
```
El código de `computeConnections` y `computeTeamConnections` en `argentina_formativas.js` busca `CANASTA-1P | CANASTA-2P | CANASTA-3P` al retroceder desde cada `ASISTENCIA`. **No omitir `CANASTA-1P`**: de los 634 eventos `ASISTENCIA` del torneo, 71 (11%) corresponden a and-ones y se perderían. Las ligas regulares no tienen este caso porque las canastas con foul se registran como `CANASTA-2P` seguidas del tiro libre separado.

### Integridad de datos (verificada 22/05/2026)

| Cruce | Resultado |
|---|---|
| Stats ↔ Shots (T2I, T3I, T1I, T2A, T3A, T1A) | Diferencia 0 en los 20 partidos |
| Stats ↔ PBP (PTS, T2A, T3A, T1A, AST, REC) | Diferencia 0 |
| Stats ↔ PBP (DREB, OREB) | Diferencia esperada: PBP incluye rebotes de equipo no atribuidos a jugador |
| Stats ↔ PBP (PER) | Diferencia de −2 en todo el torneo (mínima, eventos en límite de período) |
| Zonas shot chart | 1624 TIRO2 + 1179 TIRO3 con zona válida (0 nulos) |

### Para regenerar los CSVs del dashboard

```bash
cd liga_argentina   # o la raíz del repo
python sudamericano_u18/transform_to_liga_format.py
```

Sobreescribe los 3 CSVs en `docs/argentina_formativas/`.
