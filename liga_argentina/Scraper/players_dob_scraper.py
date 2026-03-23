#!/usr/bin/env python3
"""
Scraper de nombre completo y fecha de nacimiento de jugadores.
Recorre la comparativa de jugadores de las 4 ligas y visita cada perfil.

Ligas:
  - Liga Nacional     /laliga
  - Liga Argentina    /laligaargentina
  - Liga Femenina     /lfb
  - Liga Desarrollo   /ligaproximo

Uso:
    python Scraper/players_dob_scraper.py
    python Scraper/players_dob_scraper.py --output mi_archivo.csv
"""

import re
import sys
import time
import logging
import argparse
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://www.laliganacional.com.ar"

# Una sola fase por liga: usamos la Serie Regular (temporada activa)
LEAGUES = [
    {
        "nombre":   "Liga Nacional",
        "league":   "laliga",
        "fase_id":  "15789",
        "grupo_ids": ["31358"],
    },
    {
        "nombre":   "Liga Argentina",
        "league":   "laligaargentina",
        "fase_id":  "16077",
        "grupo_ids": ["31807", "31808"],   # Conf Sur + Conf Norte
    },
    {
        "nombre":   "Liga Femenina",
        "league":   "lfb",
        "fase_id":  "18074",
        "grupo_ids": ["34470", "34471"],   # Conf Sur + Conf Norte
    },
    {
        "nombre":   "Liga Desarrollo",
        "league":   "ligaproximo",
        "fase_id":  "15790",
        "grupo_ids": ["31359"],
    },
]

OUTPUT_PATH = Path(__file__).parent.parent / "docs" / "players_dob.csv"

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


def fetch(scraper: cloudscraper.CloudScraper, url: str, params: dict = None) -> str | None:
    try:
        r = scraper.get(url, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.text
    except Exception as e:
        log.warning("Error fetching %s: %s", url, e)
        return None


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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(output_path: Path):
    scraper = make_scraper()
    all_rows: list[dict] = []
    seen_urls: set[str] = set()   # evitar scraping duplicado del mismo perfil

    for liga in LEAGUES:
        log.info("=== %s ===", liga["nombre"])
        liga_urls: dict[str, str] = {}  # url → abbr_name

        for grupo_id in liga["grupo_ids"]:
            log.info("  Obteniendo jugadores (grupo %s)...", grupo_id)
            grupo_players = get_player_urls_for_grupo(
                scraper, liga["league"], liga["fase_id"], grupo_id
            )
            liga_urls.update(grupo_players)
            log.info("  → %d jugadores encontrados", len(grupo_players))
            time.sleep(REQUEST_DELAY)

        log.info("  Total jugadores únicos en %s: %d", liga["nombre"], len(liga_urls))

        for i, (player_url, abbr_name) in enumerate(liga_urls.items(), 1):
            if player_url in seen_urls:
                log.debug("  [dup] %s", abbr_name)
                continue

            seen_urls.add(player_url)
            log.info("  [%d/%d] %s", i, len(liga_urls), abbr_name)

            profile = parse_player_profile(scraper, player_url)
            if profile:
                profile["liga"] = liga["nombre"]
                profile["nombre_abreviado"] = abbr_name
                all_rows.append(profile)
            else:
                log.warning("  No se pudo obtener perfil: %s", player_url)

            time.sleep(REQUEST_DELAY)

    if not all_rows:
        log.error("No se obtuvieron datos.")
        sys.exit(1)

    df = pd.DataFrame(all_rows, columns=[
        "liga", "nombre_completo", "nombre_abreviado",
        "fecha_nacimiento", "url_perfil",
    ])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    log.info("Guardado en %s (%d jugadores)", output_path, len(df))
    print(df.to_string(max_rows=20))


def main():
    parser = argparse.ArgumentParser(description="Scraper DOB jugadores")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="Ruta CSV de salida")
    args = parser.parse_args()
    run(args.output)


if __name__ == "__main__":
    main()
