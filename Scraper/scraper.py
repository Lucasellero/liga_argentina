#!/usr/bin/env python3
"""
Liga Argentina Basketball Scraper
Scrapes daily game statistics from www.laliganacional.com.ar

Usage:
    python scrapper.py                    # Run normally, saves CSV
    python scrapper.py --debug            # Also saves raw HTML for inspection
    python scrapper.py --dry-run          # Print games found without scraping stats
    python scrapper.py --output path.csv  # Custom output path
"""

import re
import sys
import time
import logging
import argparse
from datetime import datetime
from pathlib import Path

import requests
import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://www.laliganacional.com.ar"
LEAGUE_PATH = "/laligaargentina"
FIXTURE_START_DATE = "30/10/2025"  # Fixed season start

OUTPUT_DIR = Path(__file__).parent.parent / "docs"
DEBUG_DIR = Path(__file__).parent / "debug_html"

REQUEST_DELAY = 0.8   # seconds between requests
REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

CSV_COLUMNS = [
    "Fecha", "Condicion equipos", "Equipo", "Rival",
    "Número Camiseta", "Apellido", "Nombre", "Nombre completo",
    "Segundos jugados", "Tiempo jugado (mm:ss)",
    "Puntos",
    "T2A", "T2I", "T2%",
    "T3A", "T3I", "T3%",
    "T1A", "T1I", "T1%",
    "DReb", "OReb", "TReb",
    "Asistencias", "Recuperos", "Perdidas",
    "Tapones cometidos", "Tapones recibidos",
    "Faltas Cometidas", "Faltas Recibidas",
    "Valoracion", "Ganado", "Estadio", "IdPartido", "Etapa", "Titular",
]

# Known column positions in the stats table (0-indexed TD cells)
# ['', dorsal, nombre, min, ptos, t2_combined, t2_pct, t3_combined, t3_pct,
#  tl_combined, tl_pct, reb_def, reb_of, reb_tot, ast, rec, per,
#  tap_com, tap_rec, falt_com, falt_rec, val, pm]
COL = {
    "dorsal":       1,
    "nombre":       2,
    "min":          3,
    "ptos":         4,
    "t2_combined":  5,   # '{pct}{made}/{attempted}'
    "t2_pct":       6,
    "t3_combined":  7,
    "t3_pct":       8,
    "tl_combined":  9,
    "tl_pct":       10,
    "reb_def":      11,
    "reb_of":       12,
    "reb_tot":      13,
    "ast":          14,
    "rec":          15,
    "per":          16,
    "tap_com":      17,
    "tap_rec":      18,
    "falt_com":     19,
    "falt_rec":     20,
    "val":          21,
    # col 22 = +/- (not used)
}

# Column positions in the Totales row (TH cells, 0-indexed)
# ['Totales', min, ptos, t2_fraction, t2_pct, t3_fraction, t3_pct,
#  tl_fraction, tl_pct, reb_def, reb_of, reb_tot, ast, rec, per,
#  tap_com, tap_rec, falt_com, falt_rec, val, pm]
COL_TOT = {
    "min":         1,
    "ptos":        2,
    "t2_fraction": 3,   # plain 'X/Y'
    "t2_pct":      4,
    "t3_fraction": 5,
    "t3_pct":      6,
    "tl_fraction": 7,
    "tl_pct":      8,
    "reb_def":     9,
    "reb_of":      10,
    "reb_tot":     11,
    "ast":         12,
    "rec":         13,
    "per":         14,
    "tap_com":     15,
    "tap_rec":     16,
    "falt_com":    17,
    "falt_rec":    18,
    "val":         19,
    # col 20 = +/- (not used)
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def make_session() -> cloudscraper.CloudScraper:
    s = cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "windows", "mobile": False})
    s.headers.update({"Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7"})
    return s


def get(session, url: str, **kwargs) -> requests.Response:
    resp = session.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp


# ---------------------------------------------------------------------------
# Fixture parsing
# ---------------------------------------------------------------------------

def fetch_fixture_games(session: requests.Session, debug: bool = False) -> list[dict]:
    """
    Fetch all games from season start up to today.
    Returns list of game metadata dicts.
    """
    today = datetime.now().strftime("%d/%m/%Y")
    url = f"{BASE_URL}{LEAGUE_PATH}/fixture"
    params = {
        "handler": "ProximosPartidos",
        "fechaInicio": FIXTURE_START_DATE,
        "fechaFin": today,
    }
    log.info(f"Fetching fixture {FIXTURE_START_DATE} -> {today}")

    resp = get(session, url, params=params)
    html = resp.text

    if debug:
        DEBUG_DIR.mkdir(exist_ok=True)
        (DEBUG_DIR / "fixture.html").write_text(html, encoding="utf-8")
        log.debug("Saved fixture HTML -> debug_html/fixture.html")

    return parse_fixture_html(html)


def parse_fixture_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    games: list[dict] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        m = re.search(r"/partido/([^/?#\s]+)/[^/?#\s]+-vs-[^/?#\s]+", href)
        if not m:
            continue
        game_id = m.group(1)
        if game_id in seen:
            continue
        seen.add(game_id)

        # Climb to the nearest row/container for this link
        container = a.find_parent("tr") or a.find_parent(
            class_=re.compile(r"partido|fixture|match|jornada|row")
        )
        games.append(_extract_fixture_meta(container, game_id, href))

    log.info(f"Found {len(games)} games in fixture")
    return games


def _extract_fixture_meta(container, game_id: str, href: str) -> dict:
    """Extract date, teams, scores, stadium from a fixture table row.

    The fixture table structure is:
      TD[0]: empty (logo)
      TD[1]: home team name
      TD[2]: home score
      TD[3]: away score
      TD[4]: away team name
      TD[5]: empty (logo)
      TD[6]: '{DD/MM/YYYY HH:MM}{STADIUM_NAME}'  (concatenated, no separator)
      TD[7]: empty (link)
    """
    info: dict = {
        "game_id": game_id,
        "href": href,
        "date": None,
        "home_team": None,
        "away_team": None,
        "home_score": None,
        "away_score": None,
        "stadium": None,
        "etapa": "regular",
    }

    if container is None:
        return info

    tds = container.find_all("td")
    if len(tds) >= 7:
        info["home_team"] = tds[1].get_text(strip=True) or None
        info["away_team"] = tds[4].get_text(strip=True) or None

        try:
            info["home_score"] = int(tds[2].get_text(strip=True))
        except (ValueError, AttributeError):
            pass
        try:
            info["away_score"] = int(tds[3].get_text(strip=True))
        except (ValueError, AttributeError):
            pass

        # TD[6] = '{DD/MM/YYYY HH:MM}{STADIUM}'
        date_stadium = tds[6].get_text(strip=True)
        m = re.match(r"(\d{2}/\d{2}/\d{4})\s*\d{2}:\d{2}(.*)", date_stadium)
        if m:
            info["date"] = m.group(1)
            stadium = m.group(2).strip()
            if stadium:
                info["stadium"] = stadium
    else:
        # Fallback: parse raw text
        text = container.get_text(" ", strip=True)
        m = re.search(r"(\d{2}/\d{2}/\d{4})", text)
        if m:
            info["date"] = m.group(1)

    return info


# ---------------------------------------------------------------------------
# Stats page fetching
# ---------------------------------------------------------------------------

def fetch_game_stats(session: requests.Session, game_id: str, debug: bool = False) -> str | None:
    url = f"{BASE_URL}{LEAGUE_PATH}/partido/estadisticas/{game_id}"
    try:
        resp = get(session, url)
        html = resp.text
        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            safe_id = re.sub(r"[^\w]", "", game_id)
            (DEBUG_DIR / f"stats_{safe_id}.html").write_text(html, encoding="utf-8")
        return html
    except requests.HTTPError as e:
        log.warning(f"  Stats HTTP error {game_id}: {e}")
        return None
    except Exception as e:
        log.warning(f"  Stats error {game_id}: {e}")
        return None


# ---------------------------------------------------------------------------
# Stats HTML parsing
# ---------------------------------------------------------------------------

def parse_stats_html(html: str, game_meta: dict) -> list[dict]:
    """
    Parse the estadisticas iframe page.
    The page structure:
      <div class="tarjeta-widget tabla-doble-con-estadisticas">
        <div class="tarjeta-widget-contenido">
          TEAM_NAME_1
          Coach: ...
          <div class="table-responsive"> <table> ... </table> </div>
          TEAM_NAME_2
          Coach: ...
          <div class="table-responsive"> <table> ... </table> </div>
        </div>
      </div>
    """
    soup = BeautifulSoup(html, "html.parser")

    # Find all table-responsive containers
    containers = soup.find_all("div", class_="table-responsive")
    if not containers:
        # Fallback: any table
        tables = soup.find_all("table")
        containers = [t.parent for t in tables[:2]]

    if not containers:
        log.warning(f"  No stat tables found for game {game_meta['game_id']}")
        return []

    team_sections = []
    for div in containers[:2]:
        table = div.find("table")
        if not table:
            continue
        team_name = _find_team_name_before(div)
        team_sections.append((team_name, table))

    if not team_sections:
        return []

    rows: list[dict] = []
    for i, (team_name, table) in enumerate(team_sections):
        condition = "LOCAL" if i == 0 else "VISITANTE"
        rival = team_sections[1 - i][0] if len(team_sections) == 2 else ""
        won = _did_win(i, game_meta)
        rows.extend(_parse_team_table(table, team_name, rival, condition, won, game_meta))

    return rows


def _find_team_name_before(div) -> str:
    """
    The team name is the closest element preceding this div that looks like a team name.
    DOM order (newest first from find_previous_siblings):
      <div class="table-responsive">   ← this div
      'Entrenador:PUJOL…'             ← skip
      'HURACAN (LH)'                  ← ← return this (closest match)
    """
    # Iterate from closest to furthest (no reverse)
    for sibling in div.find_previous_siblings():
        text = sibling.get_text(strip=True)
        if not text:
            continue
        # Skip coach/header lines
        if text.lower().startswith("entrenador"):
            continue
        # Skip if it looks like a table (starts with shot stats headers)
        if text.lower().startswith("tiros") or len(text) > 150:
            continue
        # Accept short all-caps-ish strings as team names
        if re.match(r"^[A-ZÁÉÍÓÚÑ0-9\s\(\)\-\.]+$", text) and 3 < len(text) < 60:
            return text
    return "DESCONOCIDO"


def _did_win(team_index: int, meta: dict) -> bool:
    hs = meta.get("home_score")
    aws = meta.get("away_score")
    if hs is None or aws is None:
        return False
    return (hs > aws) if team_index == 0 else (aws > hs)


# ---------------------------------------------------------------------------
# Table row parsing
# ---------------------------------------------------------------------------

def _parse_team_table(
    table,
    team_name: str,
    rival: str,
    condition: str,
    won: bool,
    meta: dict,
) -> list[dict]:
    rows: list[dict] = []
    min_cols = max(COL.values()) + 1

    for tr in table.find_all("tr"):
        # --- Totales row uses <th> elements ---
        ths = [th.get_text(strip=True) for th in tr.find_all("th")]
        if ths and ths[0].lower().startswith("total"):
            totals = _parse_totals_cells(ths)
            if totals:
                rows.append(_build_totals_row(totals, team_name, rival, condition, won, meta))
            continue

        # --- Player rows use <td> elements ---
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < min_cols:
            continue
        if not re.search(r"\d{1,2}:\d{2}", cells[COL["min"]]):
            continue

        player = _parse_player_cells(cells)
        if not player:
            continue

        rows.append(_build_row(player, team_name, rival, condition, won, meta))

    return rows


def _parse_player_cells(cells: list[str]) -> dict | None:
    """Extract player stats from a data row using known column positions."""
    dorsal_raw = cells[COL["dorsal"]]
    is_starter = "*" in dorsal_raw
    dorsal_str = re.sub(r"[^\d.]", "", dorsal_raw)

    name = cells[COL["nombre"]].replace("*", "").strip()
    if not name:
        return None

    t2a, t2i, t2pct = _parse_combined_shot(cells[COL["t2_combined"]])
    t3a, t3i, t3pct = _parse_combined_shot(cells[COL["t3_combined"]])
    t1a, t1i, t1pct = _parse_combined_shot(cells[COL["tl_combined"]])

    def ival(key: str) -> int:
        try:
            return int(cells[COL[key]])
        except (ValueError, IndexError):
            return 0

    return {
        "dorsal": dorsal_str,
        "nombre": name,
        "min": cells[COL["min"]],
        "ptos": ival("ptos"),
        "t2a": t2a, "t2i": t2i, "t2pct": t2pct,
        "t3a": t3a, "t3i": t3i, "t3pct": t3pct,
        "t1a": t1a, "t1i": t1i, "t1pct": t1pct,
        "reb_def": ival("reb_def"),
        "reb_of": ival("reb_of"),
        "reb_tot": ival("reb_tot"),
        "ast": ival("ast"),
        "rec": ival("rec"),
        "per": ival("per"),
        "tap_com": ival("tap_com"),
        "tap_rec": ival("tap_rec"),
        "falt_com": ival("falt_com"),
        "falt_rec": ival("falt_rec"),
        "val": ival("val"),
        "starter": is_starter,
    }


def _parse_totals_cells(cells: list[str]) -> dict | None:
    """Parse the Totales <th> row using COL_TOT positions."""
    if len(cells) <= max(COL_TOT.values()):
        return None

    def ival(key: str) -> int:
        try:
            return int(cells[COL_TOT[key]])
        except (ValueError, IndexError):
            return 0

    t2a, t2i, t2pct = _parse_plain_fraction(cells[COL_TOT["t2_fraction"]])
    t3a, t3i, t3pct = _parse_plain_fraction(cells[COL_TOT["t3_fraction"]])
    t1a, t1i, t1pct = _parse_plain_fraction(cells[COL_TOT["tl_fraction"]])

    return {
        "min":      cells[COL_TOT["min"]],
        "ptos":     ival("ptos"),
        "t2a": t2a, "t2i": t2i, "t2pct": t2pct,
        "t3a": t3a, "t3i": t3i, "t3pct": t3pct,
        "t1a": t1a, "t1i": t1i, "t1pct": t1pct,
        "reb_def":  ival("reb_def"),
        "reb_of":   ival("reb_of"),
        "reb_tot":  ival("reb_tot"),
        "ast":      ival("ast"),
        "rec":      ival("rec"),
        "per":      ival("per"),
        "tap_com":  ival("tap_com"),
        "tap_rec":  ival("tap_rec"),
        "falt_com": ival("falt_com"),
        "falt_rec": ival("falt_rec"),
        "val":      ival("val"),
    }


def _build_totals_row(totals: dict, team: str, rival: str, condition: str, won: bool, meta: dict) -> dict:
    tiempo = totals["min"]
    return {
        "Fecha": meta.get("date", ""),
        "Condicion equipos": condition,
        "Equipo": team,
        "Rival": rival,
        "Número Camiseta": None,
        "Apellido": "TOTALES",
        "Nombre": "",
        "Nombre completo": "TOTALES",
        "Segundos jugados": _time_to_seconds(tiempo),
        "Tiempo jugado (mm:ss)": tiempo,
        "Puntos": totals["ptos"],
        "T2A": totals["t2a"], "T2I": totals["t2i"], "T2%": totals["t2pct"],
        "T3A": totals["t3a"], "T3I": totals["t3i"], "T3%": totals["t3pct"],
        "T1A": totals["t1a"], "T1I": totals["t1i"], "T1%": totals["t1pct"],
        "DReb": totals["reb_def"],
        "OReb": totals["reb_of"],
        "TReb": totals["reb_tot"],
        "Asistencias": totals["ast"],
        "Recuperos": totals["rec"],
        "Perdidas": totals["per"],
        "Tapones cometidos": totals["tap_com"],
        "Tapones recibidos": totals["tap_rec"],
        "Faltas Cometidas": totals["falt_com"],
        "Faltas Recibidas": totals["falt_rec"],
        "Valoracion": totals["val"],
        "Ganado": won,
        "Estadio": meta.get("stadium", ""),
        "IdPartido": meta.get("game_id", ""),
        "Etapa": meta.get("etapa", "regular"),
        "Titular": False,
    }


def _parse_plain_fraction(cell: str) -> tuple[int, int, float]:
    """Parse '24/50' → (24, 50, 48.0). Used for the Totales row."""
    cell = cell.strip()
    if "/" not in cell:
        return 0, 0, 0.0
    parts = cell.split("/", 1)
    try:
        made = int(parts[0])
        attempted = int(parts[1])
        pct = round(made / attempted * 100, 2) if attempted > 0 else 0.0
        return made, attempted, pct
    except (ValueError, IndexError):
        return 0, 0, 0.0


def _parse_combined_shot(cell: str) -> tuple[int, int, float]:
    """
    Parse a combined percentage+fraction cell like '251/4' → (made=1, attempted=4, pct=25.0).

    The site renders each shooting-stats cell as '{pct}{made}/{attempted}'.
    We disambiguate by verifying: round(made/attempted * 100) ≈ pct.
    """
    cell = cell.strip()
    if "/" not in cell:
        return 0, 0, 0.0

    slash = cell.index("/")
    pre = cell[:slash]           # e.g. '251' from '251/4'
    att_str = cell[slash + 1:]   # e.g. '4'

    if not att_str.isdigit():
        return 0, 0, 0.0

    attempted = int(att_str)
    if attempted == 0:
        return 0, 0, 0.0

    # Try splitting 'pre' as {pct_digits}{made_digits} for pct_len in 3,2,1
    for pct_len in (3, 2, 1):
        if len(pre) < pct_len + 1:  # need at least 1 digit for made
            continue
        pct_str = pre[:pct_len]
        made_str = pre[pct_len:]
        if not pct_str.isdigit() or not made_str.isdigit():
            continue
        pct = int(pct_str)
        if pct > 100:
            continue
        made = int(made_str)
        # Verify consistency: round(made/attempted * 100) should be ≈ pct
        expected = round(made / attempted * 100)
        if abs(expected - pct) <= 1:
            return made, attempted, round(made / attempted * 100, 2)

    return 0, attempted, 0.0


def _build_row(player: dict, team: str, rival: str, condition: str, won: bool, meta: dict) -> dict:
    name = player["nombre"]
    apellido, nombre_str = _split_name(name)
    nombre_completo = f"{apellido}, {nombre_str}" if nombre_str else apellido

    tiempo = player["min"]
    try:
        dorsal = float(player["dorsal"]) if player["dorsal"] else None
    except ValueError:
        dorsal = None

    return {
        "Fecha": meta.get("date", ""),
        "Condicion equipos": condition,
        "Equipo": team,
        "Rival": rival,
        "Número Camiseta": dorsal,
        "Apellido": apellido,
        "Nombre": nombre_str,
        "Nombre completo": nombre_completo,
        "Segundos jugados": _time_to_seconds(tiempo),
        "Tiempo jugado (mm:ss)": tiempo,
        "Puntos": player["ptos"],
        "T2A": player["t2a"], "T2I": player["t2i"], "T2%": player["t2pct"],
        "T3A": player["t3a"], "T3I": player["t3i"], "T3%": player["t3pct"],
        "T1A": player["t1a"], "T1I": player["t1i"], "T1%": player["t1pct"],
        "DReb": player["reb_def"],
        "OReb": player["reb_of"],
        "TReb": player["reb_tot"],
        "Asistencias": player["ast"],
        "Recuperos": player["rec"],
        "Perdidas": player["per"],
        "Tapones cometidos": player["tap_com"],
        "Tapones recibidos": player["tap_rec"],
        "Faltas Cometidas": player["falt_com"],
        "Faltas Recibidas": player["falt_rec"],
        "Valoracion": player["val"],
        "Ganado": won,
        "Estadio": meta.get("stadium", ""),
        "IdPartido": meta.get("game_id", ""),
        "Etapa": meta.get("etapa", "regular"),
        "Titular": player["starter"],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _time_to_seconds(time_str: str) -> int:
    m = re.match(r"(\d+):(\d{2})", str(time_str).strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else 0


def _split_name(full: str) -> tuple[str, str]:
    """
    'MENDEZ, R.' → ('MENDEZ', 'R.')
    'MENDEZ ALVAREZ, RAMIRO' → ('MENDEZ ALVAREZ', 'RAMIRO')
    'RAMIRO MENDEZ' → ('MENDEZ', 'RAMIRO')
    """
    full = full.strip().replace("*", "")
    if "," in full:
        parts = [p.strip() for p in full.split(",", 1)]
        return parts[0], parts[1]
    words = full.split()
    if len(words) >= 2:
        return words[-1], " ".join(words[:-1])
    return full, ""


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def find_latest_csv() -> Path | None:
    """Return the most recently modified liga_argentina_todos_partidos_*.csv in OUTPUT_DIR."""
    candidates = sorted(
        OUTPUT_DIR.glob("liga_argentina_todos_partidos_*.csv"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def load_cached_game_ids(csv_path: Path) -> set[str]:
    """Load the set of already-scraped IdPartido values from an existing CSV."""
    try:
        df = pd.read_csv(csv_path, usecols=["IdPartido"], encoding="utf-8-sig")
        ids = set(df["IdPartido"].dropna().astype(str).unique())
        log.info(f"Cache loaded: {len(ids)} games already scraped from {csv_path.name}")
        return ids
    except Exception as e:
        log.warning(f"Could not read cache {csv_path}: {e}")
        return set()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Liga Argentina stats scraper")
    parser.add_argument("--debug", action="store_true", help="Save raw HTML files")
    parser.add_argument("--dry-run", action="store_true", help="List games, no stats fetch")
    parser.add_argument("--output", default=None, help="Output CSV path")
    parser.add_argument("--full", action="store_true", help="Ignore cache, re-scrape everything")
    args = parser.parse_args()

    if args.debug:
        log.setLevel(logging.DEBUG)

    session = make_session()

    # 1. Load cache from latest existing CSV
    cached_ids: set[str] = set()
    existing_df: pd.DataFrame | None = None

    if not args.full:
        latest_csv = find_latest_csv()
        if latest_csv:
            existing_df = pd.read_csv(latest_csv, encoding="utf-8-sig")
            cached_ids = set(existing_df["IdPartido"].dropna().astype(str).unique())
            log.info(f"Cache: {len(cached_ids)} games already in {latest_csv.name}")

    # 2. Get fixture game list
    all_fixture_games = fetch_fixture_games(session, debug=args.debug)
    if not all_fixture_games:
        log.error("No games found.")
        sys.exit(1)

    if args.dry_run:
        log.info("--- DRY RUN ---")
        for g in all_fixture_games:
            tag = " [cached]" if g["game_id"] in cached_ids else ""
            log.info(f"  {g['date']}  {g.get('home_team','?')} "
                     f"{g.get('home_score','?')}-{g.get('away_score','?')} "
                     f"{g.get('away_team','?')}{tag}")
        return

    # Filter to only games not yet scraped
    # A game is considered "played" when it has scores in the fixture
    new_games = [
        g for g in all_fixture_games
        if g["game_id"] not in cached_ids
        and g.get("home_score") is not None   # played games only
    ]
    log.info(f"{len(new_games)} new games to scrape (skipping {len(cached_ids)} cached)")

    # 3. Scrape new games
    new_rows: list[dict] = []
    for i, game in enumerate(new_games, 1):
        gid = game["game_id"]
        log.info(f"[{i}/{len(new_games)}] {game.get('date','?')}  "
                 f"{game.get('home_team','?')} vs {game.get('away_team','?')}")

        html = fetch_game_stats(session, gid, debug=args.debug)
        if html is None:
            continue

        rows = parse_stats_html(html, game)
        if rows:
            log.info(f"  -> {len(rows)} player rows")
            new_rows.extend(rows)
        else:
            log.debug("  -> no stats (unavailable)")

        if i < len(new_games):
            time.sleep(REQUEST_DELAY)

    if not new_rows and existing_df is None:
        log.warning("No data scraped and no cache. Exiting.")
        sys.exit(0)

    # 4. Merge new data with existing cache
    new_df = pd.DataFrame(new_rows, columns=CSV_COLUMNS) if new_rows else pd.DataFrame(columns=CSV_COLUMNS)

    if existing_df is not None and not existing_df.empty:
        merged_df = pd.concat(
            [existing_df.astype(new_df.dtypes.to_dict(), errors="ignore"), new_df],
            ignore_index=True,
        )
    else:
        merged_df = new_df

    log.info(f"Total rows: {len(merged_df)} ({len(new_rows)} new + {len(merged_df) - len(new_rows)} cached)")

    # 5. Save with date-based filename
    if args.output:
        csv_path = Path(args.output)
    else:
        today = datetime.now().strftime("%d-%m-%Y")
        csv_path = OUTPUT_DIR / f"liga_argentina_todos_partidos_{today}.csv"

    merged_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    log.info(f"Saved -> {csv_path}")


if __name__ == "__main__":
    main()
