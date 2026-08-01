#!/usr/bin/env python3
from __future__ import annotations
"""
Liga Argentina Basketball - Shot Map Scraper

Usage:
    python shot_map_scraper.py               # Scrape all new games
    python shot_map_scraper.py --full        # Re-scrape everything
    python shot_map_scraper.py --dry-run     # List games, no fetch
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
LEAGUE     = "/laligaargentina"

DOCS_DIR   = Path(__file__).parent.parent / "docs" / "liga_argentina"
INPUT_CSV  = DOCS_DIR / "liga_argentina.csv"
OUTPUT_CSV = DOCS_DIR / "liga_argentina_shots.csv"

DELAY   = 1.0
TIMEOUT = 30

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

    # Build game list from TOTALES rows usando clave estable fecha|local|visitante
    # (los IDs del sitio son dinámicos y cambian en cada request)
    df = pd.read_csv(INPUT_CSV, encoding="utf-8-sig")
    totales = df[df["Nombre completo"] == "TOTALES"]

    games: dict[str, dict] = {}  # key: "fecha|local|visitante"
    for _, row in totales.iterrows():
        if str(row.get("Condicion equipos", "")) == "LOCAL":
            key = f"{row['Fecha']}|{row['Equipo']}|{row['Rival']}"
            if key not in games:
                games[key] = {
                    "fecha": row["Fecha"],
                    "local": row["Equipo"],
                    "visitante": row["Rival"],
                    "game_id": str(row["IdPartido"]),
                }

    log.info(f"Total partidos: {len(games)}")

    # Cache: clave estable fecha|equipo_local|equipo_visitante desde el CSV de tiros
    cached_keys: set[str] = set()
    existing_df = None
    if not args.full and OUTPUT_CSV.exists():
        existing_df = pd.read_csv(OUTPUT_CSV, encoding="utf-8-sig")
        for _, _r in existing_df.drop_duplicates(subset=["Fecha", "Equipo_local", "Equipo_visitante"]).iterrows():
            cached_keys.add(f"{_r['Fecha']}|{_r['Equipo_local']}|{_r['Equipo_visitante']}")
        log.info(f"Cache: {len(cached_keys)} partidos ya scrapeados")

    new_game_keys = [k for k in games if k not in cached_keys]
    log.info(f"A scrapear: {len(new_game_keys)} partidos")

    if args.dry_run:
        for k in new_game_keys:
            g = games[k]
            log.info(f"  {g['fecha']}  {g['local']} vs {g['visitante']}")
        return

    if not new_game_keys:
        log.info("Nada nuevo.")
        return

    session  = make_session()
    new_rows = []

    for i, k in enumerate(new_game_keys, 1):
        g = games[k]
        log.info(f"[{i}/{len(new_game_keys)}] {g['fecha']}  {g['local']} vs {g['visitante']}")

        rows = scrape_game(session, g["game_id"], g["local"], g["visitante"])
        for r in rows:
            r["Fecha"] = g["fecha"]
        new_rows.extend(rows)
        log.info(f"  -> {len(rows)} tiros")

        if i < len(new_game_keys):
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

    # Deduplicar por contenido del tiro (no por IdPartido, que es dinámico)
    before_dd = len(merged)
    merged = merged.drop_duplicates(
        subset=["Fecha", "Equipo_local", "Equipo_visitante", "Equipo", "Dorsal",
                "Periodo", "Tipo", "Resultado", "Left_pct", "Top_pct"],
        keep="last",
    )
    if len(merged) < before_dd:
        log.warning(f"drop_duplicates: eliminadas {before_dd - len(merged)} filas duplicadas")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {OUTPUT_CSV}  ({len(merged)} tiros totales)")


if __name__ == "__main__":
    main()