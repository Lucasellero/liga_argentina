"""
Re-scrapea los escudos de equipos de Liga Argentina y Liga Nacional desde
laliganacional.com.ar (endpoint /escudos/{club_id}/{version}) y los guarda
sobre los archivos existentes en docs/<liga>/logos/.

El sitio solo sirve los escudos en 200x200px (~7KB JPEG) — no hay una
versión de mayor resolución disponible. Este script sirve para refrescar
los logos (por si un club cambió su escudo en el sitio oficial), no para
mejorar la calidad.

Matching por nombre normalizado (sin tildes, sin puntuación) contra el
mapeo Equipo -> archivo ya definido en cada LOGOS de los JS de liga. Si un
equipo no aparece en las páginas del sitio (fase 2026/27 todavía no
publicada, etc.) se deja el archivo existente sin tocar y se reporta.

Uso:
    python3 scraper/logo_scraper.py --liga liga_argentina
    python3 scraper/logo_scraper.py --liga liga_nacional
    python3 scraper/logo_scraper.py --liga liga_argentina --dry-run
"""
import argparse
import html
import re
import unicodedata
from pathlib import Path

import cloudscraper

BASE_URL = "https://www.laliganacional.com.ar"
REPO_ROOT = Path(__file__).resolve().parent.parent

LEAGUES = {
    "liga_argentina": {
        "path": "/laligaargentina",
        "logos_dir": REPO_ROOT / "docs" / "liga_argentina" / "logos",
        "js_file": REPO_ROOT / "docs" / "liga_argentina" / "liga_argentina.js",
    },
    "liga_nacional": {
        "path": "/laliga",
        "logos_dir": REPO_ROOT / "docs" / "liga_nacional" / "logos",
        "js_file": REPO_ROOT / "docs" / "liga_nacional" / "liga_nacional.js",
    },
}

# Páginas del sitio que listan escudos de equipo (se prueban todas, se
# combinan los resultados; la primera aparición de un nombre gana).
CANDIDATE_PATHS = ["/tabla-posiciones", "/fixture", "/estadisticas/comparativa-jugadores"]

ESCUDO_RE = re.compile(r'<img src="(/escudos/[^"]+)" alt="Logo Club" title="=([^"]+)"')
LOGOS_ENTRY_RE = re.compile(r"'([^']+)':\s*'logos/([^']+)'")


def norm(name: str) -> str:
    s = html.unescape(name)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.upper().replace(".", "").replace(",", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_team_filename_map(js_file: Path) -> dict[str, str]:
    text = js_file.read_text(encoding="utf-8")
    start = text.index("const LOGOS = {")
    end = text.index("\n};", start)
    block = text[start:end]
    return {team: fname for team, fname in LOGOS_ENTRY_RE.findall(block)}


def fetch_escudos(scraper, league_path: str) -> dict[str, str]:
    """Retorna {nombre_normalizado: escudo_url}, primera aparición gana."""
    found: dict[str, str] = {}
    for suffix in CANDIDATE_PATHS:
        url = f"{BASE_URL}{league_path}{suffix}"
        try:
            resp = scraper.get(url, timeout=30)
        except Exception as e:
            print(f"  [warn] {url}: {e}")
            continue
        for escudo_url, title in ESCUDO_RE.findall(resp.text):
            key = norm(title)
            if key not in found:
                found[key] = escudo_url
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--liga", required=True, choices=LEAGUES.keys())
    ap.add_argument("--dry-run", action="store_true", help="No escribe archivos, solo reporta")
    args = ap.parse_args()

    cfg = LEAGUES[args.liga]
    team_filename = load_team_filename_map(cfg["js_file"])
    print(f"Equipos mapeados en {cfg['js_file'].name}: {len(team_filename)}")

    scraper = cloudscraper.create_scraper()
    site_escudos = fetch_escudos(scraper, cfg["path"])
    print(f"Escudos encontrados en el sitio: {len(site_escudos)}")

    updated, unchanged, not_found = [], [], []

    for team, fname in sorted(team_filename.items()):
        key = norm(team)
        escudo_url = site_escudos.get(key)
        if not escudo_url:
            not_found.append(team)
            continue

        dest = cfg["logos_dir"] / fname
        try:
            resp = scraper.get(BASE_URL + escudo_url, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"  [warn] no se pudo bajar {team} ({escudo_url}): {e}")
            not_found.append(team)
            continue

        new_bytes = resp.content
        old_bytes = dest.read_bytes() if dest.exists() else b""
        if new_bytes == old_bytes:
            unchanged.append(team)
            continue

        updated.append(team)
        if not args.dry_run:
            dest.write_bytes(new_bytes)

    print(f"\nActualizados: {len(updated)}")
    for t in updated:
        print(f"  ~ {t}")
    print(f"Sin cambios: {len(unchanged)}")
    print(f"No encontrados en el sitio (sin tocar): {len(not_found)}")
    for t in not_found:
        print(f"  ? {t}")

    if args.dry_run:
        print("\n(dry-run: no se escribió ningún archivo)")


if __name__ == "__main__":
    main()
