"""
Genera placas de Instagram Story (1080x1920) para fichajes de Liga Nacional / Liga Argentina,
usando el feed de docs/<liga>/mercado.json. Mantiene la identidad visual de Scouteado
(paleta violeta/teal, fuente Inter) tal como docs/stories/story_jugador.html.

Uso:
    python3 Scraper/gen_fichaje_placas.py --liga liga_nacional --hours 24
    python3 Scraper/gen_fichaje_placas.py --liga liga_nacional --player "Franco Balbi"
    python3 Scraper/gen_fichaje_placas.py --liga liga_argentina --hours 48 --out /ruta/salida

Requiere: pip install playwright && playwright install chromium

Las constantes y el template de la placa (LIGA_CONFIG, CLUB_LOGO, build_card_html, etc.)
viven en placa_common.py, compartidas con el servidor MCP (mcp_server/placas.py).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from placa_common import (
    LIGA_CONFIG, build_card_html, find_matching_club, load_clubs, norm, slugify, b64_file,
)


def write_manifest(out_dir, files):
    """manifest.json: usado por el frontend para saber cuándo terminó una
    corrida disparada desde el botón admin del dashboard (polling)."""
    manifest = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'files': files,
    }
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--liga', default='liga_nacional', choices=list(LIGA_CONFIG.keys()))
    ap.add_argument('--hours', type=float, default=24.0, help='Ventana de fichajes recientes (por updated_at)')
    ap.add_argument('--player', default=None, help='Nombre puntual (ignora la ventana de horas)')
    ap.add_argument('--out', default=None, help='Carpeta de salida (default: docs/<liga>/placas_mercado)')
    args = ap.parse_args()

    cfg = LIGA_CONFIG[args.liga]
    docs_dir = cfg['docs_dir']
    logos_dir = os.path.join(docs_dir, 'logos')
    mercado_path = os.path.join(docs_dir, 'mercado.json')

    with open(mercado_path, encoding='utf-8') as f:
        data = json.load(f)

    clubs = load_clubs(data['clubs'])
    scouteado_logo_b64 = b64_file(os.path.join(logos_dir, 'scouteado_logo.png'))

    if args.player:
        pn = norm(args.player)
        targets = [p for p in data['players'] if pn in norm(p['name'])]
        if not targets:
            print(f'No se encontró ningún jugador que matchee "{args.player}"', file=sys.stderr)
            sys.exit(1)
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=args.hours)
        targets = []
        for p in data['players']:
            if p.get('status') != 'confirmado':
                continue
            ts = p.get('updated_at')
            if not ts:
                continue
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if dt >= cutoff:
                targets.append(p)

    out_dir = args.out or os.path.join(docs_dir, 'placas_mercado')
    os.makedirs(out_dir, exist_ok=True)

    if not targets:
        print(f'Sin fichajes confirmados en las últimas {args.hours:.0f}hs para {args.liga}.')
        if not args.player:
            write_manifest(out_dir, [])
        return

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Falta playwright. Instalar con:\n  pip install playwright\n  playwright install chromium', file=sys.stderr)
        sys.exit(1)

    generated = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 1080, 'height': 1920})
        for p in targets:
            dest_club = clubs.get(p['club_id'])
            origin_club = find_matching_club(p.get('last_club'), data['clubs'])
            is_renewal = bool(origin_club and dest_club and origin_club['id'] == dest_club['id'])
            html = build_card_html(p, dest_club, origin_club, is_renewal, logos_dir,
                                    cfg['label'], scouteado_logo_b64, args.liga)
            page.set_content(html, wait_until='networkidle')
            out_path = os.path.join(out_dir, f'{slugify(p["name"])}.png')
            page.screenshot(path=out_path)
            generated.append(out_path)
            print(f'✓ {p["name"]} → {out_path}')
        browser.close()

    print(f'\n{len(generated)} placa(s) generada(s) en {out_dir}')

    if not args.player:
        write_manifest(out_dir, [os.path.basename(p) for p in generated])


if __name__ == '__main__':
    main()
