#!/usr/bin/env python3
from __future__ import annotations
"""
Liga Nacional Basketball - Shot Map Scraper

Usage:
    python shot_map_scraper_nacional.py               # Scrape all new games
    python shot_map_scraper_nacional.py --full        # Re-scrape everything
    python shot_map_scraper_nacional.py --dry-run     # List games, no fetch
"""

import json
import re
import sys
import time
import logging
import argparse
from pathlib import Path

import cloudscraper
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL   = "https://www.laliganacional.com.ar"
LEAGUE     = "/laliga"

DOCS_DIR   = Path(__file__).parent.parent / "docs" / "liga_nacional"
INPUT_CSV  = DOCS_DIR / "liga_nacional.csv"
OUTPUT_CSV = DOCS_DIR / "liga_nacional_shots.csv"

DELAY   = 1.0
TIMEOUT = 30

# Partidos excluidos explícitamente (ej. supercopa, partido amistoso fuera de la competencia)
BLOCKED_GAME_IDS: set[str] = {
    "7HOd8ZYdbHXIjwhorMzAnQ==",  # Supercopa Boca vs Instituto 05/03/2026
}

CSV_COLUMNS = [
    "IdPartido", "Fecha", "Equipo_local", "Equipo_visitante",
    "Local", "Equipo", "Dorsal", "Periodo", "Tipo",
    "Resultado", "Zona", "Left_pct", "Top_pct",
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
def make_session():
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    s.headers.update({
        "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s


def get_html(session, url, referer=None):
    headers = {"Referer": referer} if referer else {}
    try:
        resp = session.get(url, timeout=TIMEOUT, headers=headers)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except Exception as e:
        log.warning(f"  Error GET {url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Scrape one game
# ---------------------------------------------------------------------------
def scrape_game(session, game_id: str, local: str, visitante: str) -> list[dict]:
    url = f"{BASE_URL}{LEAGUE}/partido/mapa-tiro/{game_id}"
    html = get_html(session, url)
    if not html:
        return []
    return parse_shots(html, game_id, local, visitante)


def parse_shots(html: str, game_id: str, local: str, visitante: str) -> list[dict]:
    # The shot data is embedded as a JS array: tiros = [...];
    m = re.search(r'\btiros\s*=\s*(\[.*?\]);', html, re.DOTALL)
    if not m:
        log.debug("  No tiros array found in HTML")
        return []

    try:
        shots = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        log.warning(f"  JSON parse error: {e}")
        return []

    rows = []
    for shot in shots:
        accion = shot.get("accion_tipo", "")

        # Made shots: CANASTA-2P, CANASTA-3P
        # Missed shots: TIRO2-FALLADO, TIRO3-FALLADO, TIRO1-FALLADO
        canasta_m = re.match(r'CANASTA-(\d)P', accion)
        fallado_m = re.match(r'(TIRO\d+)-FALLADO', accion)
        if canasta_m:
            tipo      = f'TIRO{canasta_m.group(1)}'
            resultado = 'CONVERTIDO'
        elif fallado_m:
            tipo      = fallado_m.group(1)
            resultado = 'FALLADO'
        else:
            continue

        pos_x = shot.get("posicion_x", "")
        pos_y = shot.get("posicion_y", "")
        left_m = re.search(r'([\d.]+)%', pos_x)
        top_m  = re.search(r'([\d.]+)%', pos_y)
        if not left_m or not top_m:
            continue

        is_local = shot.get("local", False)
        equipo   = local if is_local else visitante

        rows.append({
            "IdPartido":        game_id,
            "Fecha":            "",
            "Equipo_local":     local,
            "Equipo_visitante": visitante,
            "Local":            is_local,
            "Equipo":           equipo,
            "Dorsal":           shot.get("dorsal", ""),
            "Periodo":          shot.get("numero_periodo", ""),
            "Tipo":             tipo,
            "Resultado":        resultado,
            "Zona":             shot.get("zona", ""),
            "Left_pct":         float(left_m.group(1)),
            "Top_pct":          float(top_m.group(1)),
        })

    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full",    action="store_true")
    parser.add_argument("--dry-run", action="store_true")
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
    cached_ids: set[str] = set()
    existing_df = None
    if not args.full and OUTPUT_CSV.exists():
        existing_df = pd.read_csv(OUTPUT_CSV, encoding="utf-8-sig")
        cached_ids = set(existing_df["IdPartido"].dropna().astype(str).unique())
        log.info(f"Cache: {len(cached_ids)} partidos ya scrapeados")

    new_game_ids = [gid for gid in games if gid not in cached_ids and gid not in BLOCKED_GAME_IDS]
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
    new_rows = []

    for i, gid in enumerate(new_game_ids, 1):
        g = games[gid]
        log.info(f"[{i}/{len(new_game_ids)}] {g['fecha']}  {g['local']} vs {g['visitante']}")

        rows = scrape_game(session, gid, g["local"], g["visitante"])
        for r in rows:
            r["Fecha"] = g["fecha"]
        new_rows.extend(rows)
        log.info(f"  -> {len(rows)} tiros")

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

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {OUTPUT_CSV}  ({len(merged)} tiros totales)")


if __name__ == "__main__":
    main()
