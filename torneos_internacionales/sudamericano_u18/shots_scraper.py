# -*- coding: utf-8 -*-
"""
Scraper de tabla de tiros (Shot Chart) — FIBA U17 South American Championship 2025.

Genera: sudamericano_u18_shots.csv
Solo incluye eventos de tipo 'shot' (tiros de campo y tiros libres).

Columnas: gameId, gameName, date, teamA_code, teamB_code,
          period, timeRemaining, scoreA, scoreB,
          orgId, teamCode, personId, firstName, lastName, uniformNumber,
          actionCode, actionText, made, pts, shotType, x, y

Coordenadas (sistema FIBA LiveStats):
  - x: 0–280 (largo de la cancha, en cm/10)
  - y: 0–150 (ancho de la cancha, en cm/10)
  - El aro atacado varía según la mitad del partido; FIBA no normaliza
    automáticamente, el análisis debe tener en cuenta el período.
  - FT (tiros libres): x=0, y=0 (sin coordenada real)

Uso:
    python shots_scraper.py            # solo partidos nuevos
    python shots_scraper.py --full     # re-scrape completo
"""

import sys
import os
import re
import json
import time
import csv
import argparse

sys.path.insert(0, os.path.dirname(__file__))
from fiba_utils import (
    KNOWN_GAMES, GAME_URL_TEMPLATE, make_scraper,
    fetch_page, extract_rsc_data, _unescape_rsc,
    parse_game_meta, parse_players,
)

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "sudamericano_u18_shots.csv")

FIELDNAMES = [
    "gameId", "gameName", "date",
    "teamA_code", "teamB_code",
    "period", "timeRemaining", "scoreA", "scoreB",
    "orgId", "teamCode", "personId", "firstName", "lastName", "uniformNumber",
    "actionCode", "actionText",
    "made", "pts", "shotType", "x", "y",
]

# Mapeo actionCode → tipo de tiro legible
SHOT_TYPE_MAP = {
    'P2': '2PT',
    'P3': '3PT',
    'FT': 'FT',
    'MISSED2': '2PT',
    'MISSED3': '3PT',
}


def _shot_type(action_code: str, pts: int) -> str:
    """Infiere el tipo de tiro desde el actionCode o los puntos."""
    if action_code in SHOT_TYPE_MAP:
        return SHOT_TYPE_MAP[action_code]
    if pts == 1:
        return 'FT'
    if pts == 2:
        return '2PT'
    if pts == 3:
        return '3PT'
    return action_code


def parse_shots(rsc: str, game_meta: dict, players: dict) -> list[dict]:
    """
    Extrae solo los eventos de tiro (act='shot') del playByPlay.
    Cruza con datos de jugador para agregar nombre y dorsal.
    """
    idx = rsc.find('\\"playByPlay\\":{\\"items\\":')
    if idx == -1:
        print("  [!] playByPlay no encontrado en RSC")
        return []

    open_idx = rsc.find('{', idx)
    depth = 0
    for i in range(open_idx, len(rsc)):
        if rsc[i] == '{':
            depth += 1
        elif rsc[i] == '}':
            depth -= 1
            if depth == 0:
                raw = rsc[open_idx:i + 1]
                try:
                    pbp_data = json.loads(_unescape_rsc(raw))
                except json.JSONDecodeError as e:
                    print(f"  [!] Error parseando playByPlay: {e}")
                    return []
                break
    else:
        return []

    # Mapeo orgId → teamCode
    org_to_code = {
        game_meta.get('teamA_orgId'): game_meta.get('teamA_code', ''),
        game_meta.get('teamB_orgId'): game_meta.get('teamB_code', ''),
    }

    rows = []
    for period_name, period_data in pbp_data.get('items', {}).items():
        for ev in period_data.get('items', []):
            if ev.get('act') != 'shot':
                continue

            org_id = ev.get('oId')
            person_id = ev.get('pId')
            if isinstance(org_id, str) and org_id.startswith('$'):
                org_id = None
            if isinstance(person_id, str) and person_id.startswith('$'):
                person_id = None

            pinfo = players.get(person_id, {})
            ac = ev.get('ac', '')
            pts = ev.get('pts', 0)

            row = {
                'gameId': game_meta.get('gameId', ''),
                'gameName': game_meta.get('gameName', ''),
                'date': game_meta.get('date', ''),
                'teamA_code': game_meta.get('teamA_code', ''),
                'teamB_code': game_meta.get('teamB_code', ''),
                'period': period_name,
                'timeRemaining': ev.get('Time', ''),
                'scoreA': ev.get('SA', ''),
                'scoreB': ev.get('SB', ''),
                'orgId': org_id,
                'teamCode': org_to_code.get(org_id, ''),
                'personId': person_id,
                'firstName': pinfo.get('firstName', ''),
                'lastName': pinfo.get('lastName', ''),
                'uniformNumber': pinfo.get('uniformNumber', ''),
                'actionCode': ac,
                'actionText': ev.get('txt', ''),
                'made': 1 if ev.get('made') else 0,
                'pts': pts,
                'shotType': _shot_type(ac, pts),
                'x': ev.get('x', ''),
                'y': ev.get('y', ''),
            }
            rows.append(row)

    return rows


def scrape_game(scraper, game_id: int, slug: str) -> list[dict]:
    url = GAME_URL_TEMPLATE.format(game_slug=f"{game_id}-{slug}")
    print(f"  Fetching {url}")
    html = fetch_page(scraper, url)
    rsc = extract_rsc_data(html)
    game_meta = parse_game_meta(rsc)
    if not game_meta.get('gameId'):
        game_meta['gameId'] = game_id
    players = parse_players(rsc)
    rows = parse_shots(rsc, game_meta, players)
    made = sum(1 for r in rows if r.get('made') == 1)
    print(f"    → {len(rows)} tiros ({made} convertidos)")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scraper de tiros FIBA U17 SA 2025")
    parser.add_argument('--full', action='store_true', help='Re-scrape completo')
    args = parser.parse_args()

    existing_ids = set()
    if not args.full and os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_ids.add(int(row.get('gameId', 0)))
        print(f"CSV existente: {len(existing_ids)} partidos ya procesados")

    scraper = make_scraper()
    all_rows = []

    if not args.full and os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            all_rows = list(reader)

    pending = [(gid, slug) for gid, slug in KNOWN_GAMES.items() if gid not in existing_ids]
    print(f"Partidos a procesar: {len(pending)}")

    for game_id, slug in pending:
        try:
            rows = scrape_game(scraper, game_id, slug)
            all_rows.extend(rows)
            time.sleep(1.5)
        except Exception as e:
            print(f"  [ERROR] {game_id}-{slug}: {e}")

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nCSV guardado: {OUTPUT_CSV} ({len(all_rows)} filas)")


if __name__ == '__main__':
    main()
