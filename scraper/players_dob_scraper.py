#!/usr/bin/env python3
"""
Scraper de nombre completo y fecha de nacimiento de jugadores.
Arma la lista de jugadores de cada liga desde el roster de cada equipo
(/{liga}/equipo/.../roster, equipos tomados de la tabla de posiciones) más la
comparativa de jugadores, y visita cada perfil.

Ninguna de las dos fuentes está completa por sí sola: el roster no incluye a
jugadores que ya dejaron el equipo, y la comparativa no lista a todos los que
sumaron minutos (sobre todo juveniles). Juntas cubren prácticamente todo el CSV
de stats.

La columna `equipo` (nombre tal como aparece en el CSV de stats de la liga) permite
distinguir homónimos: dos jugadores distintos con el mismo nombre abreviado
(ej. "GOMEZ, M.") en equipos diferentes de la misma liga.

Ligas:
  - Liga Nacional     /laliga
  - Liga Argentina    /laligaargentina
  - Liga Femenina     /lfb
  - Liga Desarrollo   /ligaproximo

Uso:
    python scraper/players_dob_scraper.py
    python scraper/players_dob_scraper.py --ligas "Liga Argentina" "Liga Nacional"
    python scraper/players_dob_scraper.py --output mi_archivo.csv

Con --ligas solo se re-scrapean esas ligas; las filas de las demás ligas del CSV
existente se conservan tal cual.
"""

import re
import sys
import time
import logging
import argparse
import unicodedata
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://www.laliganacional.com.ar"
DOCS_DIR = Path(__file__).parent.parent / "docs"

# Una sola fase por liga: usamos la Serie Regular (temporada activa)
# fase_id/grupo_ids son IDs internos del sitio, específicos de cada temporada —
# hay que volver a buscarlos cuando arranca una temporada nueva (ver CLAUDE.md).
# Los rosters no dependen de estos IDs (salen de /{liga}/equipos).
LEAGUES = [
    {
        "nombre":   "Liga Nacional",
        "league":   "laliga",
        "fase_id":  "21871",   # Serie Regular 2026/27 (confirmado vía /api/clasificacion/{faseId}/grupos)
        "grupo_ids": ["41209"],
        "stats_csv": DOCS_DIR / "liga_nacional" / "liga_nacional.csv",
    },
    {
        "nombre":   "Liga Argentina",
        "league":   "laligaargentina",
        "fase_id":  "21986",   # Serie Regular 2026/27 (confirmado vía /api/clasificacion/{faseId}/grupos)
        "grupo_ids": ["41441", "41442"],   # Conf Norte + Conf Sur
        "stats_csv": DOCS_DIR / "liga_argentina" / "liga_argentina.csv",
    },
    {
        "nombre":   "Liga Femenina",
        "league":   "lfb",
        "fase_id":  "18074",
        "grupo_ids": ["34470", "34471"],   # Conf Sur + Conf Norte
        "stats_csv": DOCS_DIR / "liga_femenina" / "liga_femenina.csv",
    },
    {
        "nombre":   "Liga Desarrollo",
        "league":   "ligaproximo",
        "fase_id":  "15790",
        "grupo_ids": ["31359"],
        "stats_csv": DOCS_DIR / "liga_proximo" / "liga_proximo.csv",
    },
]

OUTPUT_PATH = DOCS_DIR / "shared" / "players_dob.csv"
COLUMNS = ["liga", "nombre_completo", "nombre_abreviado", "fecha_nacimiento", "url_perfil", "equipo"]

REQUEST_DELAY = 0.5   # segundos entre requests
REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
}

# /{liga}/jugador/{clubId}/{equipoId}/{jugadorId}/{slug}
PLAYER_URL_RE = re.compile(r"/jugador/(\d+)/(\d+)/(\d+)/")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_scraper() -> cloudscraper.CloudScraper:
    return cloudscraper.create_scraper()


def fetch(scraper: cloudscraper.CloudScraper, url: str, params: dict = None, retries: int = 2) -> str | None:
    for attempt in range(retries + 1):
        try:
            r = scraper.get(url, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            return r.text
        except Exception as e:
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            log.warning("Error fetching %s: %s", url, e)
    return None


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()


def slugify(s: str) -> str:
    """'SAN MARTÍN (C)' → 'san-martin-c' (mismo formato que el slug de equipo del sitio)."""
    return re.sub(r"[^a-z0-9]+", "-", _ascii(s).lower()).strip("-")


def load_stats_names(stats_csv: Path) -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    """
    Del CSV de stats de la liga devuelve:
      - {slug_equipo: nombre de equipo en stats}
      - {(slug_equipo, nombre abreviado normalizado): nombre abreviado tal cual en stats}
        — por equipo, porque el mismo nombre puede figurar con y sin tilde en
        equipos distintos ("PEREZ, M." / "PÉREZ, M.")
    Ambos vacíos si el CSV no existe (los nombres se arman igual, sin ajustar).
    """
    if not stats_csv.exists():
        log.warning("  No existe %s — equipos y nombres sin ajustar al CSV de stats", stats_csv)
        return {}, {}
    st = pd.read_csv(stats_csv, encoding="utf-8-sig", usecols=["Equipo", "Nombre completo"])
    st = st.dropna()
    st = st[st["Nombre completo"] != "TOTALES"].drop_duplicates()
    teams = {slugify(t): t for t in st["Equipo"].unique()}
    names = {
        (slugify(t), _ascii(n).upper()): n
        for t, n in zip(st["Equipo"], st["Nombre completo"])
    }
    return teams, names


def abbreviate(full_name: str, team_slug: str, stats_names: dict[tuple[str, str], str]) -> str:
    """
    'FINETTI LOPEZ, VALENTINO' → el nombre abreviado que use el CSV de stats para ese
    equipo ('FINETTI, V.' o 'FINETTI LOPEZ, V.'); si no matchea ninguno, apellido completo.
    """
    apellido, _, nombres = full_name.partition(",")
    apellido, nombres = apellido.strip(), nombres.strip()
    inicial = f" {nombres[0]}." if nombres else ""
    words = apellido.split()
    candidates = [" ".join(words[:k]) + "," + inicial for k in range(len(words), 0, -1)]
    for c in candidates:
        hit = stats_names.get((team_slug, _ascii(c).upper()))
        if hit:
            return hit
    return candidates[0] if candidates else full_name


def get_rosters(scraper, league: str, stats_names: dict[str, str]) -> tuple[dict, dict[str, str]]:
    """
    Retorna ({player_url: (abbr_name, team_slug)}, {club_id: team_slug}) a partir del
    roster de cada equipo de la liga.
    """
    # /{league}/equipos lista los mismos links pero responde HTTP 404; la tabla de posiciones da 200
    html = fetch(scraper, f"{BASE_URL}/{league}/tabla-posiciones")
    if not html:
        return {}, {}

    team_paths = sorted(set(re.findall(rf'href="(/{league}/equipo/[^"]+?)/inicio"', html)))
    players: dict[str, tuple[str, str]] = {}
    clubs: dict[str, str] = {}
    for path in team_paths:
        club_id, team_slug = path.split("/")[3], path.rsplit("/", 1)[1]
        clubs[club_id] = team_slug
        time.sleep(REQUEST_DELAY)
        roster_html = fetch(scraper, f"{BASE_URL}{path}/roster")
        if not roster_html:
            continue
        soup = BeautifulSoup(roster_html, "lxml")
        for a in soup.select("a[href*='/jugador/']"):
            href = a.get("href", "")
            if not href.startswith("/"):
                continue
            full_url = BASE_URL + href
            if full_url not in players:
                players[full_url] = (abbreviate(a.get_text(" ", strip=True), team_slug, stats_names), team_slug)

    return players, clubs


def get_player_urls_for_grupo(scraper, league: str, fase_id: str, grupo_id: str) -> dict[str, str]:
    """Retorna {player_url: abbreviated_name} para un grupo dado."""
    url = f"{BASE_URL}/{league}/estadisticas/comparativa-jugadores"
    html = fetch(scraper, url, params={"handler": "Comparativa", "faseId": fase_id, "grupoId": grupo_id})
    if not html:
        return {}

    soup = BeautifulSoup(html, "lxml")
    players = {}
    for a in soup.select("a[href*='/jugador/']"):
        href = a.get("href", "")
        if not href.startswith("/"):
            continue
        full_url = BASE_URL + href
        name_el = a.find(class_="nombre-jugador-nowrap")
        abbr_name = name_el.get_text(strip=True) if name_el else a.get("title", "")
        if full_url not in players:
            players[full_url] = abbr_name

    return players


def parse_player_profile(scraper, player_url: str) -> dict | None:
    """Visita el perfil y extrae nombre completo y fecha de nacimiento."""
    html = fetch(scraper, player_url)
    if not html:
        return None

    soup = BeautifulSoup(html, "lxml")

    # Nombre completo desde el <title>: "Juan Tomas Nally | La Liga ..."
    title_tag = soup.find("title")
    full_name = ""
    if title_tag:
        raw = title_tag.get_text(strip=True)
        full_name = raw.split("|")[0].strip().upper()

    # Fallback: buscar el elemento con el nombre en la página
    if not full_name:
        # Patrón: "APELLIDO, NOMBRE NOMBRE" en un elemento de texto
        name_match = re.search(r"([A-ZÁÉÍÓÚÜÑ]+,\s+[A-ZÁÉÍÓÚÜÑ ]+)", html)
        if name_match:
            full_name = name_match.group(1).strip()

    # Fecha de nacimiento desde el <h5> con "Fecha de nacimiento:"
    dob = ""
    strong = soup.find("strong", string=re.compile(r"Fecha de nacimiento", re.I))
    if strong:
        sibling = strong.next_sibling
        if sibling:
            dob = sibling.strip() if isinstance(sibling, str) else sibling.get_text(strip=True)
        # Validar formato DD/MM/YYYY
        if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", dob):
            # Buscar en el texto del padre
            parent_text = strong.parent.get_text()
            m = re.search(r"\d{2}/\d{2}/\d{4}", parent_text)
            dob = m.group(0) if m else ""

    return {"nombre_completo": full_name, "fecha_nacimiento": dob, "url_perfil": player_url}


def collect_league_players(scraper, liga: dict) -> dict[str, tuple[str, str]]:
    """{player_url: (abbr_name, equipo)} combinando roster + comparativa."""
    stats_teams, stats_names = load_stats_names(liga["stats_csv"])

    log.info("  Obteniendo rosters...")
    players, clubs = get_rosters(scraper, liga["league"], stats_names)
    log.info("  → %d jugadores en rosters", len(players))
    seen_ids = {m.group(3) for u in players if (m := PLAYER_URL_RE.search(u))}

    extra = 0
    for grupo_id in liga["grupo_ids"]:
        log.info("  Obteniendo jugadores de la comparativa (grupo %s)...", grupo_id)
        time.sleep(REQUEST_DELAY)
        for url, abbr in get_player_urls_for_grupo(
            scraper, liga["league"], liga["fase_id"], grupo_id
        ).items():
            m = PLAYER_URL_RE.search(url)
            if not m or m.group(3) in seen_ids:
                continue
            seen_ids.add(m.group(3))
            players[url] = (abbr, clubs.get(m.group(1), ""))
            extra += 1
    log.info("  → %d jugadores extra desde la comparativa", extra)

    # slug de equipo → nombre de equipo como figura en el CSV de stats
    return {
        url: (abbr, stats_teams.get(slug, slug.upper().replace("-", " ")) if slug else "")
        for url, (abbr, slug) in players.items()
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(output_path: Path, ligas: list[str] | None = None):
    leagues = [l for l in LEAGUES if not ligas or l["nombre"] in ligas]
    if not leagues:
        log.error("Ninguna liga coincide con %s", ligas)
        sys.exit(1)

    scraper = make_scraper()
    all_rows: list[dict] = []
    seen_urls: set[str] = set()   # evitar scraping duplicado del mismo perfil

    for liga in leagues:
        log.info("=== %s ===", liga["nombre"])
        liga_players = collect_league_players(scraper, liga)
        log.info("  Total jugadores únicos en %s: %d", liga["nombre"], len(liga_players))

        for i, (player_url, (abbr_name, equipo)) in enumerate(liga_players.items(), 1):
            if player_url in seen_urls:
                log.debug("  [dup] %s", abbr_name)
                continue

            seen_urls.add(player_url)
            log.info("  [%d/%d] %s (%s)", i, len(liga_players), abbr_name, equipo)

            profile = parse_player_profile(scraper, player_url)
            if profile:
                profile["liga"] = liga["nombre"]
                profile["nombre_abreviado"] = abbr_name
                profile["equipo"] = equipo
                all_rows.append(profile)
            else:
                log.warning("  No se pudo obtener perfil: %s", player_url)

            time.sleep(REQUEST_DELAY)

    if not all_rows:
        log.error("No se obtuvieron datos.")
        sys.exit(1)

    df = pd.DataFrame(all_rows, columns=COLUMNS)

    # Con --ligas, conservar las filas de las ligas que no se re-scrapearon
    if ligas and output_path.exists():
        prev = pd.read_csv(output_path)
        prev = prev[~prev["liga"].isin([l["nombre"] for l in leagues])]
        df = pd.concat([df, prev.reindex(columns=COLUMNS)], ignore_index=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    log.info("Guardado en %s (%d jugadores)", output_path, len(df))
    print(df.to_string(max_rows=20))


def main():
    parser = argparse.ArgumentParser(description="Scraper DOB jugadores")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="Ruta CSV de salida")
    parser.add_argument("--ligas", nargs="+", metavar="LIGA",
                        help='Solo estas ligas (ej. "Liga Argentina" "Liga Nacional"); el resto se conserva')
    args = parser.parse_args()
    run(args.output, args.ligas)


if __name__ == "__main__":
    main()
