# -*- coding: utf-8 -*-
"""
Utilidades compartidas para los scrapers del FIBA U17 South American Championship 2025.

Los datos están embebidos en el HTML de cada página como RSC payload de Next.js
en scripts `self.__next_f.push([1,"..."])`. No se requiere API key ni autenticación.
"""

import re
import json
import time
import cloudscraper

# ── Configuración ──────────────────────────────────────────────────────────────
BASE_URL = "https://www.fiba.basketball"
TOURNAMENT_SLUG = "fiba-u17-south-american-championship-2025"
GAMES_URL = f"{BASE_URL}/es/events/{TOURNAMENT_SLUG}/games"
GAME_URL_TEMPLATE = f"{BASE_URL}/es/events/{TOURNAMENT_SLUG}/games/{{game_slug}}"

# Todos los partidos del torneo: gameId → "TEAMCOD1-TEAMCOD2"
KNOWN_GAMES = {
    125521: "URU-ARG",
    125522: "ECU-COL",
    125523: "COL-URU",
    125524: "ARG-ECU",
    125525: "URU-ECU",
    125526: "COL-ARG",
    125527: "PAR-VEN",
    125528: "BRA-CHI",
    125529: "CHI-PAR",
    125530: "VEN-BRA",
    125531: "PAR-BRA",
    125532: "CHI-VEN",
    130826: "COL-PAR",
    130827: "CHI-ECU",
    130828: "ARG-VEN",
    130829: "BRA-URU",
    130830: "COL-ECU",
    130831: "PAR-CHI",
    130832: "VEN-URU",
    130833: "ARG-BRA",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
}


def make_scraper():
    """Devuelve una sesión de cloudscraper lista para usar."""
    s = cloudscraper.create_scraper()
    s.headers.update(HEADERS)
    return s


def fetch_page(scraper, url: str, retries: int = 3, delay: float = 2.0) -> str:
    """Descarga una página con reintentos. Devuelve el HTML como string."""
    for attempt in range(1, retries + 1):
        try:
            resp = scraper.get(url, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"  [!] Intento {attempt}/{retries} falló para {url}: {e}")
            if attempt < retries:
                time.sleep(delay * attempt)
    raise RuntimeError(f"No se pudo obtener {url} tras {retries} intentos")


def extract_rsc_data(html: str) -> str:
    """
    Extrae y concatena el contenido de todos los scripts RSC de Next.js
    (`self.__next_f.push([1,"..."])`).
    """
    parts = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
    return "\n".join(parts)


def _unescape_rsc(raw: str) -> str:
    """
    Desescapa la cadena JSON que viene embebida dentro del JS.
    El contenido está escape-ado con \\\" para strings y \\\\ para backslash.
    """
    # Reemplaza secuencias de escape comunes sin modificar el resto
    return (
        raw
        .replace('\\"', '"')
        .replace('\\/', '/')
        .replace('\\n', '\n')
        .replace('\\t', '\t')
        .replace('\\\\', '\\')
    )


def find_json_block(rsc: str, start_key: str):
    """
    Busca `start_key` en el RSC y devuelve el bloque JSON que le sigue
    (si existe). Útil para extraer `playByPlay`, `gameDetails`, etc.
    """
    idx = rsc.find(start_key)
    if idx == -1:
        return None
    # Avanza hasta el '{' o '[' que abre el bloque
    open_idx = idx + len(start_key)
    while open_idx < len(rsc) and rsc[open_idx] not in ('{', '['):
        open_idx += 1
    if open_idx >= len(rsc):
        return None
    # Extrae el bloque completo balanceando {}
    open_char = rsc[open_idx]
    close_char = '}' if open_char == '{' else ']'
    depth = 0
    for i in range(open_idx, len(rsc)):
        if rsc[i] == open_char:
            depth += 1
        elif rsc[i] == close_char:
            depth -= 1
            if depth == 0:
                raw_block = rsc[open_idx:i + 1]
                try:
                    return json.loads(_unescape_rsc(raw_block))
                except json.JSONDecodeError:
                    return None
    return None


def parse_game_meta(rsc: str) -> dict:
    """
    Extrae metadata del partido: IDs, nombres, equipos, resultado.
    Devuelve un dict con las claves principales.
    """
    game = {}

    # gameId, gameName, teamA, teamB, scores
    m = re.search(r'\\"gameId\\":(\d+)', rsc)
    if m:
        game['gameId'] = int(m.group(1))

    m = re.search(r'\\"gameName\\":\\"([^\\]+)\\"', rsc)
    if m:
        game['gameName'] = m.group(1)

    # Actual order in RSC: teamId, organisationId, code, officialName, shortName
    m = re.search(r'\\"teamA\\":\{\\"teamId\\":\d+,\\"organisationId\\":(\d+),\\"code\\":\\"([A-Z]+)\\",\\"officialName\\":\\"([^\\]+)\\"', rsc)
    if m:
        game['teamA_orgId'] = int(m.group(1))
        game['teamA_code'] = m.group(2)
        game['teamA_name'] = m.group(3)

    m = re.search(r'\\"teamB\\":\{\\"teamId\\":\d+,\\"organisationId\\":(\d+),\\"code\\":\\"([A-Z]+)\\",\\"officialName\\":\\"([^\\]+)\\"', rsc)
    if m:
        game['teamB_orgId'] = int(m.group(1))
        game['teamB_code'] = m.group(2)
        game['teamB_name'] = m.group(3)

    # Scores from gameDetails
    scores = re.findall(r'\\"Id\\":\\"T_\d+\\"[^}]*?\\"Score\\":(\d+)', rsc)
    if len(scores) >= 2:
        game['scoreA'] = int(scores[0])
        game['scoreB'] = int(scores[1])

    # Date (ISO format from $D prefix)
    m = re.search(r'\\"date\\":\\"\\$D([\d\-T:.Z]+)\\"', rsc)
    if m:
        game['date'] = m.group(1)[:10]  # YYYY-MM-DD

    return game


def parse_players(rsc: str) -> dict:
    """
    Extrae el diccionario personId → {firstName, lastName, uniformNumber}
    para ambos equipos.
    """
    players = {}
    # playersTeamA and playersTeamB arrays
    for team_key in ('playersTeamA', 'playersTeamB'):
        idx = rsc.find(f'\\"{team_key}\\":[')
        if idx == -1:
            continue
        open_idx = rsc.find('[', idx)
        depth = 0
        for i in range(open_idx, len(rsc)):
            if rsc[i] == '[':
                depth += 1
            elif rsc[i] == ']':
                depth -= 1
                if depth == 0:
                    raw = rsc[open_idx:i + 1]
                    try:
                        pl_list = json.loads(_unescape_rsc(raw))
                        for p in pl_list:
                            pid = p.get('personId')
                            if pid:
                                players[pid] = {
                                    'firstName': p.get('firstName', ''),
                                    'lastName': p.get('lastName', ''),
                                    'uniformNumber': p.get('uniformNumber', ''),
                                    'isCaptain': p.get('isCaptain', False),
                                }
                    except Exception:
                        pass
                    break
    return players
