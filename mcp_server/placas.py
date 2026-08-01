"""
Variante remota de scraper/gen_fichaje_placas.py para el servidor MCP.

Reusa exactamente el mismo template (placa_common.build_card_html) y las mismas
constantes (LIGA_CONFIG, CLUB_LOGO, etc.) que el CLI de /fichajes-placas — la única
diferencia es que los assets (mercado.json, logos, foto del jugador) se traen de
https://scouteado.com/... en vez de leerse del repo local, porque el servidor MCP
corre en la máquina del community manager, que no tiene el repo clonado.
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import requests

SCRAPER_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scraper")
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from placa_common import (  # noqa: E402
    CLUB_LOGO, LIGA_CONFIG, build_card_html, find_matching_club, load_clubs, norm, slugify,
)

BASE_URL = "https://scouteado.com"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "placas_out")


def _fetch_json(liga):
    resp = requests.get(f"{BASE_URL}/{liga}/mercado.json", timeout=20)
    resp.raise_for_status()
    return resp.json()


def _download_logo(liga, filename, dest_dir):
    """Descarga un logo a dest_dir si no está ya ahí. Silencioso si falla (mismo
    criterio degradado de gen_fichaje_placas.py: la placa se genera igual)."""
    if not filename:
        return
    dest_path = os.path.join(dest_dir, filename)
    if os.path.isfile(dest_path):
        return
    try:
        resp = requests.get(f"{BASE_URL}/{liga}/logos/{filename}", timeout=15)
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(resp.content)
    except requests.RequestException:
        pass


def _select_targets(data, liga, jugador, horas):
    if liga not in LIGA_CONFIG:
        raise ValueError(f'Liga inválida: "{liga}". Usar una de: {list(LIGA_CONFIG)}')

    if jugador:
        q = norm(jugador)
        targets = [p for p in data["players"] if q in norm(p["name"])]
        if not targets:
            raise ValueError(f'No se encontró ningún jugador que matchee "{jugador}"')
        return targets

    cutoff = datetime.now(timezone.utc) - timedelta(hours=horas)
    targets = []
    for p in data["players"]:
        if p.get("status") != "confirmado":
            continue
        ts = p.get("updated_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if dt >= cutoff:
            targets.append(p)
    return targets


def generar_placa_fichaje(liga, jugador=None, horas=24.0):
    """Genera placa(s) PNG de fichaje. Devuelve lista de {nombre, path, bytes}."""
    from playwright.sync_api import sync_playwright

    cfg = LIGA_CONFIG[liga]
    data = _fetch_json(liga)
    clubs = load_clubs(data["clubs"])
    targets = _select_targets(data, liga, jugador, horas)

    os.makedirs(OUT_DIR, exist_ok=True)
    resultados = []

    with tempfile.TemporaryDirectory() as tmp_logos:
        _download_logo(liga, "scouteado_logo.png", tmp_logos)
        scouteado_logo_b64 = None
        logo_path = os.path.join(tmp_logos, "scouteado_logo.png")
        if os.path.isfile(logo_path):
            import base64
            with open(logo_path, "rb") as f:
                scouteado_logo_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode()

        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 1920})
            for p in targets:
                dest_club = clubs.get(p["club_id"])
                origin_club = find_matching_club(p.get("last_club"), data["clubs"])
                is_renewal = bool(origin_club and dest_club and origin_club["id"] == dest_club["id"])

                if dest_club:
                    _download_logo(liga, CLUB_LOGO.get(p["club_id"], ""), tmp_logos)
                if origin_club:
                    _download_logo(liga, CLUB_LOGO.get(origin_club["id"], ""), tmp_logos)

                html = build_card_html(p, dest_club, origin_club, is_renewal, tmp_logos,
                                        cfg["label"], scouteado_logo_b64)
                page.set_content(html, wait_until="networkidle")
                out_path = os.path.join(OUT_DIR, f'{slugify(p["name"])}.png')
                page.screenshot(path=out_path)
                with open(out_path, "rb") as f:
                    png_bytes = f.read()
                resultados.append({"nombre": p["name"], "path": out_path, "bytes": png_bytes})
            browser.close()

    return resultados
