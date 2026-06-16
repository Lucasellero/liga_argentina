# -*- coding: utf-8 -*-
"""
Utilidades compartidas para los scrapers del FIBA U18 AmeriCup 2026.

Datos embebidos en HTML como RSC payload de Next.js.
No se requiere API key ni autenticación.
"""

import re
import json
import time
import cloudscraper

# ── Configuración ──────────────────────────────────────────────────────────────
BASE_URL = "https://www.fiba.basketball"
TOURNAMENT_SLUG = "fiba-u18-americup-2026"
GAMES_URL = f"{BASE_URL}/en/events/{TOURNAMENT_SLUG}/games"
GAME_URL_TEMPLATE = f"{BASE_URL}/en/events/{TOURNAMENT_SLUG}/games/{{game_slug}}"

# Grupos del torneo
# Grupo A: USA, ARG, BRA, MEX
# Grupo B: DOM, PUR, VEN, CAN
# Partidos de grupos (12 en total, 3 por equipo)
# Partidos de playoffs (IDs 134636+, equipos TBD hasta que se jueguen)
KNOWN_GAMES = {
    # Grupo A
    130879: "USA-ARG",
    130877: "BRA-MEX",
    130878: "MEX-USA",
    130880: "ARG-BRA",
    130881: "MEX-ARG",
    130882: "USA-BRA",
    # Grupo B
    130885: "DOM-PUR",
    130884: "VEN-CAN",
    130888: "CAN-DOM",
    130886: "PUR-VEN",
    130887: "CAN-PUR",
    130883: "DOM-VEN",
    # Playoffs (equipos TBD — se agregan una vez conocidos)
    134636: None,  # 5°-8° puesto
    134637: None,  # 5°-8° puesto
    134638: None,  # Semifinal
    134639: None,  # Semifinal
    134640: None,  # 7° puesto
    134641: None,  # 5° puesto
    134642: None,  # Bronce
    134643: None,  # Final
    134644: None,
    134645: None,
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
}


def make_scraper():
    s = cloudscraper.create_scraper()
    s.headers.update(HEADERS)
    return s


def fetch_page(scraper, url: str, retries: int = 3, delay: float = 2.0) -> str:
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
    parts = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
    return "\n".join(parts)


def _unescape_rsc(raw: str) -> str:
    return (
        raw
        .replace('\\"', '"')
        .replace('\\/', '/')
        .replace('\\n', '\n')
        .replace('\\t', '\t')
        .replace('\\\\', '\\')
    )


def find_json_block(rsc: str, start_key: str):
    idx = rsc.find(start_key)
    if idx == -1:
        return None
    open_idx = idx + len(start_key)
    while open_idx < len(rsc) and rsc[open_idx] not in ('{', '['):
        open_idx += 1
    if open_idx >= len(rsc):
        return None
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
    game = {}

    m = re.search(r'\\"gameId\\":(\d+)', rsc)
    if m:
        game['gameId'] = int(m.group(1))

    m = re.search(r'\\"gameName\\":\\"([^\\]+)\\"', rsc)
    if m:
        game['gameName'] = m.group(1)

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

    scores = re.findall(r'\\"Id\\":\\"T_\d+\\"[^}]*?\\"Score\\":(\d+)', rsc)
    if len(scores) >= 2:
        game['scoreA'] = int(scores[0])
        game['scoreB'] = int(scores[1])

    m = re.search(r'\\"date\\":\\"\\$D([\d\-T:.Z]+)\\"', rsc)
    if m:
        game['date'] = m.group(1)[:10]

    return game


def check_game_status(rsc: str) -> str:
    """
    Retorna:
      'live'      — partido en juego (datos aún no embebidos)
      'finished'  — partido terminado (boxscore disponible en RSC)
      'not_started' — partido no comenzado
    """
    unesc = _unescape_rsc(rsc)
    if '"isLive":true' in unesc:
        return 'live'
    # Si gameDetails es $undefined y score 0-0 → no empezó
    if '"gameDetails":"$undefined"' in unesc:
        import re
        m = re.search(r'"teamAScore":(\d+),"teamBScore":(\d+)', unesc)
        if m and int(m.group(1)) == 0 and int(m.group(2)) == 0:
            return 'not_started'
        # $undefined pero con score > 0 puede ser problema de parseo → tratar como finished
        return 'finished'
    # gameDetails presente como objeto → terminado
    if '"gameDetails":{' in unesc or '\\"gameDetails\\":{' in rsc:
        return 'finished'
    return 'not_started'


def parse_players(rsc: str) -> dict:
    players = {}
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


def discover_game_slug(scraper, game_id: int):
    """
    Intenta descubrir el slug de un partido (ej. 'USA-ARG') consultando
    la página de partidos del torneo. Útil para playoffs donde teamA/teamB
    no se conocen de antemano.
    """
    try:
        html = fetch_page(scraper, GAMES_URL)
        parts = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
        full = "\n".join(parts)
        unesc = full.replace('\\"', '"').replace('\\/', '/')

        # Buscar el gameId y extraer los teamCodes circundantes
        pattern = (
            rf'"gameId":{game_id}[^{{}}]*?'
            r'"teamA":\{"teamId":\d+,"organisationId":\d+,"code":"([A-Z]+)"'
            r'[^}}]*?"teamB":\{"teamId":\d+,"organisationId":\d+,"code":"([A-Z]+)"'
        )
        m = re.search(pattern, unesc)
        if m:
            return f"{m.group(1)}-{m.group(2)}"
    except Exception as e:
        print(f"  [!] No se pudo descubrir slug para {game_id}: {e}")
    return None
