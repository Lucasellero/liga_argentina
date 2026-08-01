"""
Variante remota de scraper/gen_fichaje_placas.py para el servidor MCP.

Reusa exactamente el mismo template (placa_common.build_card_html) y las mismas
constantes (LIGA_CONFIG, CLUB_LOGO, etc.) que scraper/gen_fichaje_placas.py — la única
diferencia es que los assets (mercado.json, logos, foto del jugador) se traen de
https://scouteado.com/... en vez de leerse del repo local, porque el servidor MCP
corre en la máquina del community manager, que no tiene el repo clonado.

Los logos de club (y el logo de Scouteado) se cachean en disco de forma persistente
en mcp_server/.cache/logos/<liga>/ — no cambian nunca en la práctica, así que una
vez descargados no se vuelven a pedir. mercado.json se trae vía data.fetch_json,
que ya revalida por ETag en vez de re-descargar el JSON completo en cada llamada.

Cada placa se guarda a disco en PNG a resolución completa (1080x1920, calidad de
posteo) en placas_out/. Además se genera un preview JPEG reducido para devolver
inline en el chat de Claude Desktop -- los clientes MCP tienen un límite de tamaño
por respuesta de tool (~1MB); el PNG completo en base64 puede superarlo, sobre todo
si se generan varias placas en una sola llamada.
"""
import base64
import io
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from PIL import Image as PILImage

SCRAPER_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scraper")
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from placa_common import (  # noqa: E402
    CLUB_LOGO, LIGA_CONFIG, build_card_html, find_matching_club, load_clubs, norm, slugify,
)

import data as data_mod  # módulo data.py de este mismo paquete (fetch con ETag)

BASE_URL = "https://scouteado.com"
MCP_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(MCP_DIR, "placas_out")
LOGOS_CACHE_DIR = os.path.join(MCP_DIR, ".cache", "logos")

PREVIEW_MAX_WIDTH = 480  # ~1/2.25 del ancho original (1080px) -> jpeg queda bien liviano
PREVIEW_JPEG_QUALITY = 82


def _download_logo(liga, filename, dest_dir):
    """Descarga un logo a dest_dir si no está ya cacheado ahí. Silencioso si falla
    (mismo criterio degradado de gen_fichaje_placas.py: la placa se genera igual)."""
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


def _make_preview_jpeg(png_path):
    """Reduce el PNG de 1080x1920 a un JPEG liviano para mandar inline en el chat.
    El archivo completo (calidad de posteo) queda intacto en disco en png_path."""
    with PILImage.open(png_path) as img:
        img = img.convert("RGB")
        ratio = PREVIEW_MAX_WIDTH / img.width
        img = img.resize((PREVIEW_MAX_WIDTH, round(img.height * ratio)))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
        return buf.getvalue()


def _select_targets(mercado, jugador, horas):
    if jugador:
        q = norm(jugador)
        targets = [p for p in mercado["players"] if q in norm(p["name"])]
        if not targets:
            raise ValueError(f'No se encontró ningún jugador que matchee "{jugador}"')
        return targets

    cutoff = datetime.now(timezone.utc) - timedelta(hours=horas)
    targets = []
    for p in mercado["players"]:
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
    """Genera placa(s) de fichaje. Devuelve lista de:
    {nombre, path (PNG completo en disco), preview_bytes (JPEG liviano para el chat)}."""
    from playwright.sync_api import sync_playwright

    if liga not in LIGA_CONFIG:
        raise ValueError(f'Liga inválida: "{liga}". Usar una de: {list(LIGA_CONFIG)}')

    club_logo = CLUB_LOGO.get(liga, {})
    mercado = data_mod.fetch_json(liga, "mercado.json")
    clubs = load_clubs(mercado["clubs"])
    targets = _select_targets(mercado, jugador, horas)

    os.makedirs(OUT_DIR, exist_ok=True)
    logos_dir = os.path.join(LOGOS_CACHE_DIR, liga)
    os.makedirs(logos_dir, exist_ok=True)
    resultados = []

    _download_logo(liga, "scouteado_logo.png", logos_dir)
    scouteado_logo_b64 = None
    logo_path = os.path.join(logos_dir, "scouteado_logo.png")
    if os.path.isfile(logo_path):
        with open(logo_path, "rb") as f:
            scouteado_logo_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode()

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1920})
        for p in targets:
            dest_club = clubs.get(p["club_id"])
            origin_club = find_matching_club(p.get("last_club"), mercado["clubs"])
            is_renewal = bool(origin_club and dest_club and origin_club["id"] == dest_club["id"])

            if dest_club:
                _download_logo(liga, club_logo.get(p["club_id"], ""), logos_dir)
            if origin_club:
                _download_logo(liga, club_logo.get(origin_club["id"], ""), logos_dir)

            html = build_card_html(p, dest_club, origin_club, is_renewal, logos_dir, scouteado_logo_b64, liga)
            page.set_content(html, wait_until="networkidle")
            out_path = os.path.join(OUT_DIR, f'{slugify(p["name"])}.png')
            page.screenshot(path=out_path)
            resultados.append({
                "nombre": p["name"],
                "path": out_path,
                "preview_bytes": _make_preview_jpeg(out_path),
            })
        browser.close()

    return resultados
