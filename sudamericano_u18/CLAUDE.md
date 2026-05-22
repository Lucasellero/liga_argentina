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

FIBA usa un sistema de coordenadas **en décimas de metro** sobre una cancha de 28m × 15m:

- `x`: 0–280 (largo de la cancha)
- `y`: 0–150 (ancho de la cancha)
- Origen `(0,0)`: esquina del aro atacado en Q1/Q2 (convención FIBA LiveStats)
- **Tiros libres**: `x=0, y=0` (sin coordenada real)

### Normalización para shot chart

FIBA **no normaliza** automáticamente la dirección de ataque: en Q1/Q2 el equipo ataca desde `x≈0` hacia `x≈280`, y en Q3/Q4 invierte. Para construir un heat map consistente hay que espejar los tiros de los períodos 3 y 4:

```python
# Pseudocódigo de normalización
if period in ('Q3', 'Q4', 'OT1', ...):
    x_norm = 280 - x
    y_norm = 150 - y
else:
    x_norm = x
    y_norm = y
```

Valores de referencia observados:
- Bandeja bajo el aro (equipos atacando hacia x alto): `x≈150–160, y≈30–40` o `y≈110–120`
- Triple esquinero: `x≈10–30, y≈10–30` (o simétricamente `y≈120–140`)
- Triple frontal: `x≈15–20, y≈70–80`

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
