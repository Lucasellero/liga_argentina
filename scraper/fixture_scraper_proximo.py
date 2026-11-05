"""
Liga de Desarrollo (Liga Próximo) - Fixture de próximos partidos

Regenera docs/liga_proximo/fixture_upcoming.csv (fecha,hora,local,visitante,estadio)
con los partidos desde hoy hasta FIXTURE_END_DATE, leídos del fixture del sitio.
Los partidos ya jugados que queden en el archivo los descarta el frontend por
clave fecha|local|visitante, y las filas con fecha pasada también.

Usage:
    python scraper/fixture_scraper_proximo.py
"""

from __future__ import annotations

import re
import sys
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from data_scraper_proximo import BASE_URL, LEAGUE_PATH, OUTPUT_DIR, make_session, get  # noqa: E402

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
FIXTURE_END_DATE = "30/06/2027"  # Fin de temporada 2026/27 (cubre fase regular + playoffs)
OUTPUT_CSV = OUTPUT_DIR / "fixture_upcoming.csv"
CSV_COLUMNS = ["fecha", "hora", "local", "visitante", "estadio"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def parse_upcoming(html: str) -> list[dict]:
    """Misma estructura de tabla que parse_fixture_html de data_scraper_proximo.py:
    TD[1] local, TD[4] visitante, TD[6] '{DD/MM/YYYY HH:MM}{ESTADIO}'."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        if not re.search(r"/partido/[^/?#\s]+/[^/?#\s]+-vs-[^/?#\s]+", a["href"]):
            continue
        tr = a.find_parent("tr")
        if tr is None:
            continue
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        m = re.match(r"(\d{2}/\d{2}/\d{4})\s*(\d{2}:\d{2})(.*)", tds[6].get_text(strip=True))
        local, visit = tds[1].get_text(strip=True), tds[4].get_text(strip=True)
        if not m or not local or not visit:
            continue
        key = f"{m.group(1)}|{local}|{visit}"
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "fecha": m.group(1), "hora": m.group(2),
            "local": local, "visitante": visit, "estadio": m.group(3).strip(),
        })
    return rows


def main():
    today = datetime.now().strftime("%d/%m/%Y")
    log.info(f"Fetching fixture {today} -> {FIXTURE_END_DATE}")
    session = make_session()
    resp = get(session, f"{BASE_URL}{LEAGUE_PATH}/fixture", params={
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
    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {OUTPUT_CSV}  ({len(df)} partidos)")


if __name__ == "__main__":
    main()
