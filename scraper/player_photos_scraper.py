#!/usr/bin/env python3
"""
Scraper de fotos de jugadores desde laliganacional.com.ar.

La foto de cada jugador se sirve en /fotos/{jugadorId} (el mismo endpoint que usa
el <img> del perfil). El jugadorId ya está en `url_perfil` de players_dob.csv
(/{liga}/jugador/{clubId}/{equipoId}/{jugadorId}/{slug}), así que no hace falta
visitar los perfiles: se lee ese CSV y se baja directo cada foto.

Respuestas del endpoint:
  - image/jpeg (162x200 px, ~5KB)  → foto real, se guarda como {jugadorId}.jpg
  - image/svg+xml                  → silueta genérica (jugador sin foto), no se guarda

Salida:
  - docs/shared/fotos/{jugadorId}.jpg
  - docs/shared/players_photos.csv  (una fila por jugador/liga de players_dob.csv)
      liga, nombre_abreviado, equipo, jugador_id, foto
    `foto` es la ruta relativa a docs/shared/ ("fotos/88719.jpg") o vacía si el
    jugador no tiene foto en el sitio. Matchear igual que DOB: nombre_abreviado + equipo.

Es incremental: las fotos que ya existen en disco no se vuelven a bajar
(usar --force para refrescarlas todas). Correr players_dob_scraper.py antes
si cambiaron los rosters.

Uso:
    python scraper/player_photos_scraper.py
    python scraper/player_photos_scraper.py --ligas "Liga Argentina" "Liga Nacional"
    python scraper/player_photos_scraper.py --force
    python scraper/player_photos_scraper.py --limit 20     # prueba rápida
"""

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
BASE_URL = "https://www.laliganacional.com.ar"
SHARED_DIR = Path(__file__).parent.parent / "docs" / "shared"
DOB_CSV = SHARED_DIR / "players_dob.csv"
PHOTOS_DIR = SHARED_DIR / "fotos"
OUTPUT_CSV = SHARED_DIR / "players_photos.csv"
COLUMNS = ["liga", "nombre_abreviado", "equipo", "jugador_id", "foto"]

REQUEST_DELAY = 0.3   # segundos entre requests
REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8",
}

PLAYER_URL_RE = re.compile(r"/jugador/\d+/\d+/(\d+)/")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch_photo(scraper, jugador_id: str, retries: int = 2) -> bytes | None:
    """
    Bytes del JPEG, b"" si el jugador no tiene foto (el sitio devuelve la silueta SVG),
    None si falló la descarga.
    """
    url = f"{BASE_URL}/fotos/{jugador_id}"
    for attempt in range(retries + 1):
        try:
            r = scraper.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "jpeg" in ctype or "jpg" in ctype:
                return r.content
            if "svg" in ctype:
                return b""
            log.warning("  Content-Type inesperado para %s: %s", jugador_id, ctype)
            return b""
        except Exception as e:
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            log.warning("  Error bajando %s: %s", url, e)
    return None


def load_players(ligas: list[str] | None) -> pd.DataFrame:
    if not DOB_CSV.exists():
        log.error("No existe %s — correr primero scraper/players_dob_scraper.py", DOB_CSV)
        sys.exit(1)
    df = pd.read_csv(DOB_CSV, dtype=str).fillna("")
    if ligas:
        df = df[df["liga"].isin(ligas)]
        if df.empty:
            log.error("Ninguna liga coincide con %s", ligas)
            sys.exit(1)
    df["jugador_id"] = df["url_perfil"].str.extract(PLAYER_URL_RE, expand=False).fillna("")
    sin_id = df["jugador_id"] == ""
    if sin_id.any():
        log.warning("%d filas sin jugadorId en url_perfil (se omiten)", sin_id.sum())
    return df[~sin_id]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(ligas: list[str] | None, force: bool, limit: int | None):
    players = load_players(ligas)
    ids = list(dict.fromkeys(players["jugador_id"]))   # únicos, orden estable
    if limit:
        ids = ids[:limit]
        players = players[players["jugador_id"].isin(ids)]
    log.info("%d jugadores únicos a procesar (%d filas)", len(ids), len(players))

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    scraper = cloudscraper.create_scraper()

    has_photo: dict[str, bool] = {}
    nuevas = existentes = sin_foto = errores = 0

    for i, jid in enumerate(ids, 1):
        dest = PHOTOS_DIR / f"{jid}.jpg"
        if dest.exists() and not force:
            has_photo[jid] = True
            existentes += 1
            continue

        content = fetch_photo(scraper, jid)
        time.sleep(REQUEST_DELAY)

        if content is None:
            errores += 1
            has_photo[jid] = dest.exists()   # con --force, conservar la que había
            continue
        if not content:
            sin_foto += 1
            has_photo[jid] = False
            if dest.exists():                # el sitio le sacó la foto
                dest.unlink()
            continue

        dest.write_bytes(content)
        has_photo[jid] = True
        nuevas += 1
        if i % 50 == 0 or i == len(ids):
            log.info("  [%d/%d] fotos procesadas", i, len(ids))

    out = players[["liga", "nombre_abreviado", "equipo", "jugador_id"]].copy()
    out["foto"] = out["jugador_id"].map(lambda j: f"fotos/{j}.jpg" if has_photo.get(j) else "")

    # Con --ligas (o --limit), conservar las filas del manifest que no se procesaron
    if (ligas or limit) and OUTPUT_CSV.exists():
        prev = pd.read_csv(OUTPUT_CSV, dtype=str).fillna("")
        prev = prev[~prev["jugador_id"].isin(ids) & ~prev["liga"].isin(ligas or [])]
        out = pd.concat([out, prev.reindex(columns=COLUMNS)], ignore_index=True)

    out.to_csv(OUTPUT_CSV, index=False, columns=COLUMNS)

    log.info("Nuevas: %d | ya existentes: %d | sin foto en el sitio: %d | errores: %d",
             nuevas, existentes, sin_foto, errores)
    log.info("Manifest guardado en %s (%d filas, %d con foto)",
             OUTPUT_CSV, len(out), (out["foto"] != "").sum())


def main():
    parser = argparse.ArgumentParser(description="Scraper de fotos de jugadores")
    parser.add_argument("--ligas", nargs="+", metavar="LIGA",
                        help='Solo estas ligas (ej. "Liga Argentina" "Liga Nacional"); el resto del manifest se conserva')
    parser.add_argument("--force", action="store_true", help="Volver a bajar fotos que ya existen en disco")
    parser.add_argument("--limit", type=int, help="Procesar solo los primeros N jugadores (prueba)")
    args = parser.parse_args()
    run(args.ligas, args.force, args.limit)


if __name__ == "__main__":
    main()
