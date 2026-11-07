"""
Liga Argentina / Liga Nacional - Fixture de próximos partidos

Regenera docs/<liga>/fixture_upcoming.csv (fecha,hora,local,visitante,estadio)
con los partidos desde hoy hasta FIXTURE_END_DATE, leídos del fixture del sitio.
Los partidos ya jugados que queden en el archivo los descarta el frontend por
clave fecha|local|visitante, y las filas con fecha pasada también.
Misma lógica que fixture_scraper_proximo.py (Liga de Desarrollo).

Usage:
    python scraper/fixture_scraper.py argentina
    python scraper/fixture_scraper.py nacional
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from data_scraper_proximo import BASE_URL, make_session, get  # noqa: E402
from fixture_scraper_proximo import parse_upcoming, CSV_COLUMNS  # noqa: E402

DOCS = Path(__file__).parent.parent / "docs"

FIXTURE_END_DATE = "30/06/2027"  # Fin de temporada 2026/27 (cubre fase regular + playoffs)

# liga -> (path del sitio, carpeta de salida)
LIGAS = {
    "argentina": ("/laligaargentina", DOCS / "liga_argentina"),
    "nacional": ("/laliga", DOCS / "liga_nacional"),
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("liga", choices=LIGAS)
    args = parser.parse_args()
    league_path, out_dir = LIGAS[args.liga]
    output_csv = out_dir / "fixture_upcoming.csv"

    today = datetime.now().strftime("%d/%m/%Y")
    log.info(f"[{args.liga}] Fetching fixture {today} -> {FIXTURE_END_DATE}")
    session = make_session()
    resp = get(session, f"{BASE_URL}{league_path}/fixture", params={
        "handler": "ProximosPartidos",
        "fechaInicio": today,
        "fechaFin": FIXTURE_END_DATE,
    })
    rows = parse_upcoming(resp.text)
    if not rows:
        # Sin partidos (fin de temporada o cambio de estructura): no pisar el archivo existente.
        log.warning("No hay partidos próximos en el fixture. Se conserva el archivo actual.")
        sys.exit(0)

    df = pd.DataFrame(rows, columns=CSV_COLUMNS)
    df["_d"] = pd.to_datetime(df["fecha"], format="%d/%m/%Y")
    df = df.sort_values(["_d", "hora"]).drop(columns="_d")
    df.to_csv(output_csv, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {output_csv}  ({len(df)} partidos)")


if __name__ == "__main__":
    main()
