#!/usr/bin/env python3
"""
Liga de Desarrollo (Liga Próximo) - Play-by-Play Scraper

Scrapes jugada-a-jugada data from the "En vivo" section.

Usage:
    python pbp_scraper_proximo.py               # Scrape all new games
    python pbp_scraper_proximo.py --full        # Re-scrape everything
    python pbp_scraper_proximo.py --dry-run     # List games, no fetch
    python pbp_scraper_proximo.py --output path.csv
"""

from __future__ import annotations

import re
import sys
import time
import logging
import argparse
from pathlib import Path

import cloudscraper
import pandas as pd
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://www.laliganacional.com.ar"
LEAGUE   = "/ligaproximo"

DOCS_DIR   = Path(__file__).parent.parent / "docs" / "liga_proximo"
INPUT_CSV  = DOCS_DIR / "liga_proximo.csv"
OUTPUT_CSV = DOCS_DIR / "liga_proximo_pbp.csv"

DELAY   = 1.0
TIMEOUT = 30

CSV_COLUMNS = [
    "IdPartido", "Fecha", "Equipo_local", "Equipo_visitante",
    "NumAccion", "Tipo", "Equipo_lado",
    "Dorsal", "Jugador",
    "Periodo", "Tiempo",
    "Marcador_local", "Marcador_visitante",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def make_session() -> cloudscraper.CloudScraper:
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    s.headers.update({
        "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s


def get_html(session, url: str) -> str | None:
    try:
        resp = session.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except Exception as e:
        log.warning(f"  Error GET {url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

# Neutral events (no team, no player — the titulo <span> holds the period number)
PERIOD_BOUNDARY_TYPES = {"INICIO-PARTIDO", "FINAL-PARTIDO", "INICIO-PERIODO", "FINAL-PERIODO"}

# Classes that are not the event type
_NON_EVENT_CLASSES = {"accion", "local", "visitante"}


def _extract_event_type(li_classes: list[str]) -> str:
    """Return the event-type class from a <li>'s class list."""
    for cls in li_classes:
        if cls in _NON_EVENT_CLASSES or cls.startswith("accion-"):
            continue
        return cls
    return ""


def _extract_accion_num(li_classes: list[str]) -> int | None:
    for cls in li_classes:
        if cls.startswith("accion-"):
            try:
                return int(cls[7:])
            except ValueError:
                pass
    return None


def _parse_li(li) -> dict:
    """Parse a single <li class='accion ...'> element into a flat dict."""
    classes = li.get("class", [])
    tipo = _extract_event_type(classes)
    num_accion = _extract_accion_num(classes)
    equipo_lado = "LOCAL" if "local" in classes else ("VISITANTE" if "visitante" in classes else None)

    is_boundary = tipo in PERIOD_BOUNDARY_TYPES

    div = li.find("div", class_="informacion")
    if not div:
        return {
            "NumAccion": num_accion, "Tipo": tipo, "Equipo_lado": equipo_lado,
            "Dorsal": None, "Jugador": None, "Periodo": None, "Tiempo": None,
            "Marcador_local": None, "Marcador_visitante": None,
        }

    titulo = div.find("strong", class_="titulo")
    titulo_span_val = None
    if titulo:
        span = titulo.find("span")
        if span:
            raw = span.get_text(strip=True)
            m = re.match(r"#?(\d+)", raw)
            if m:
                titulo_span_val = int(m.group(1))

    # For INICIO/FINAL-PERIODO the titulo <span> is the period number, not a dorsal.
    # For INICIO/FINAL-PARTIDO the <span> doesn't exist or is meaningless.
    if is_boundary:
        periodo = titulo_span_val if tipo in {"INICIO-PERIODO", "FINAL-PERIODO"} else None
        return {
            "NumAccion":          num_accion,
            "Tipo":               tipo,
            "Equipo_lado":        None,
            "Dorsal":             None,
            "Jugador":            None,
            "Periodo":            periodo,
            "Tiempo":             None,
            "Marcador_local":     None,
            "Marcador_visitante": None,
        }

    # --- Dorsal from titulo <span>#N
    dorsal = titulo_span_val  # may be None

    # --- Player name: first <span class="informacion"> inside div
    jugador = None
    info_spans = div.find_all("span", class_="informacion")
    if info_spans:
        text = info_spans[0].get_text(strip=True)
        if text:
            jugador = text

    # --- Period + clock from second <span class="informacion">
    periodo = None
    tiempo = None
    if len(info_spans) >= 2:
        time_text = info_spans[1].get_text(" ", strip=True)
        # Pattern: "Cuarto 4 - 00:01:33" or "Cuarto 4 - 01:33"
        m = re.search(r"[Cc]uarto\s+(\d+)\s*[-–]\s*(\d{2}:\d{2}:\d{2}|\d{1,2}:\d{2})", time_text)
        if m:
            periodo = int(m.group(1))
            raw_time = m.group(2)
            # Normalize to MM:SS (drop leading HH:00: if present)
            parts = raw_time.split(":")
            if len(parts) == 3:
                tiempo = f"{parts[1]}:{parts[2]}"
            else:
                tiempo = raw_time

    # --- Score: <strong class="informacionAdicional">121 - 118</strong>
    marcador_local = None
    marcador_visitante = None
    score_el = div.find("strong", class_="informacionAdicional")
    if score_el:
        score_text = score_el.get_text(strip=True)
        m = re.match(r"(\d+)\s*[-–]\s*(\d+)", score_text)
        if m:
            marcador_local = int(m.group(1))
            marcador_visitante = int(m.group(2))

    return {
        "NumAccion":          num_accion,
        "Tipo":               tipo,
        "Equipo_lado":        equipo_lado,
        "Dorsal":             dorsal,
        "Jugador":            jugador,
        "Periodo":            periodo,
        "Tiempo":             tiempo,
        "Marcador_local":     marcador_local,
        "Marcador_visitante": marcador_visitante,
    }


def parse_pbp(html: str, game_id: str, local: str, visitante: str) -> list[dict]:
    """Parse the en-vivo HTML page and return a list of action rows."""
    soup = BeautifulSoup(html, "html.parser")
    ul = soup.find("ul", class_="listadoAccionesPartido")
    if not ul:
        log.debug("  No listadoAccionesPartido found")
        return []

    items = ul.find_all("li", class_="accion")
    if not items:
        log.debug("  No <li class='accion'> elements found")
        return []

    # The page lists events newest-first; reverse for chronological order
    rows = []
    for li in reversed(items):
        action = _parse_li(li)
        rows.append({
            "IdPartido":          game_id,
            "Fecha":              "",      # filled in by caller
            "Equipo_local":       local,
            "Equipo_visitante":   visitante,
            **action,
        })

    # Forward-fill score: propagate last known score to events without one
    last_local = 0
    last_visit = 0
    for r in rows:
        if r["Marcador_local"] is None:
            r["Marcador_local"]     = last_local
            r["Marcador_visitante"] = last_visit
        else:
            last_local = r["Marcador_local"]
            last_visit = r["Marcador_visitante"]

    return rows


# ---------------------------------------------------------------------------
# Scrape one game
# ---------------------------------------------------------------------------
def scrape_game(session, game_id: str, local: str, visitante: str) -> list[dict]:
    url = f"{BASE_URL}{LEAGUE}/partido/en-vivo/{game_id}"
    html = get_html(session, url)
    if not html:
        return []
    return parse_pbp(html, game_id, local, visitante)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Liga Próximo play-by-play scraper")
    parser.add_argument("--full",    action="store_true", help="Ignore cache, re-scrape all")
    parser.add_argument("--dry-run", action="store_true", help="List games, no fetch")
    parser.add_argument("--output",  default=None,        help="Output CSV path")
    args = parser.parse_args()

    if not INPUT_CSV.exists():
        log.error(f"CSV no encontrado: {INPUT_CSV}")
        sys.exit(1)

    # Build game list from TOTALES rows
    df = pd.read_csv(INPUT_CSV, encoding="utf-8-sig")
    totales = df[df["Nombre completo"] == "TOTALES"]

    games: dict[str, dict] = {}
    for _, row in totales.iterrows():
        gid = str(row["IdPartido"])
        if gid not in games:
            games[gid] = {"fecha": row["Fecha"], "local": "", "visitante": ""}
        if row["Condicion equipos"] == "LOCAL":
            games[gid]["local"] = row["Equipo"]
        else:
            games[gid]["visitante"] = row["Equipo"]

    log.info(f"Total partidos: {len(games)}")

    # Cache
    output_csv = Path(args.output) if args.output else OUTPUT_CSV
    cached_ids: set[str] = set()
    existing_df: pd.DataFrame | None = None
    if not args.full and output_csv.exists():
        existing_df = pd.read_csv(output_csv, encoding="utf-8-sig")
        cached_ids = set(existing_df["IdPartido"].dropna().astype(str).unique())
        log.info(f"Cache: {len(cached_ids)} partidos ya scrapeados")

    new_game_ids = [gid for gid in games if gid not in cached_ids]
    log.info(f"A scrapear: {len(new_game_ids)} partidos")

    if args.dry_run:
        for gid in new_game_ids:
            g = games[gid]
            log.info(f"  {g['fecha']}  {g['local']} vs {g['visitante']}  [{gid}]")
        return

    if not new_game_ids:
        log.info("Nada nuevo.")
        return

    session  = make_session()
    new_rows: list[dict] = []

    for i, gid in enumerate(new_game_ids, 1):
        g = games[gid]
        log.info(f"[{i}/{len(new_game_ids)}] {g['fecha']}  {g['local']} vs {g['visitante']}")

        rows = scrape_game(session, gid, g["local"], g["visitante"])
        for r in rows:
            r["Fecha"] = g["fecha"]
        new_rows.extend(rows)
        log.info(f"  -> {len(rows)} acciones")

        if i < len(new_game_ids):
            time.sleep(DELAY)

    # Merge and save
    new_df = pd.DataFrame(new_rows, columns=CSV_COLUMNS) if new_rows else pd.DataFrame(columns=CSV_COLUMNS)

    if existing_df is not None and not existing_df.empty:
        merged = pd.concat(
            [existing_df.astype(new_df.dtypes.to_dict(), errors="ignore"), new_df],
            ignore_index=True,
        )
    else:
        merged = new_df

    before = len(merged)
    merged = merged.drop_duplicates()
    removed = before - len(merged)
    if removed:
        log.warning(f"  Eliminadas {removed} filas duplicadas")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output_csv, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {output_csv}  ({len(merged)} acciones totales)")


if __name__ == "__main__":
    main()
