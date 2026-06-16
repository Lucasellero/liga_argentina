# -*- coding: utf-8 -*-
"""
Scraper de jugada a jugada (Play by Play) — FIBA U17 South American Championship 2025.

Genera: sudamericano_u18_pbp.csv
Columnas: gameId, gameName, date, teamA_code, teamB_code, period,
          timeRemaining, scoreA, scoreB, eventId, order,
          act, actionCode, actionText, orgId, personId,
          made, pts, x, y, substitution_in_out, p2Id

Uso:
    python pbp_scraper.py            # solo partidos nuevos
    python pbp_scraper.py --full     # re-scrape completo
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
    parse_game_meta,
)

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "sudamericano_u18_pbp.csv")

FIELDNAMES = [
    "gameId", "gameName", "date",
    "teamA_code", "teamB_code",
    "period", "timeRemaining", "scoreA", "scoreB",
    "eventId", "order",
    "act", "actionCode", "actionText",
    "orgId", "personId",
    "made", "pts", "x", "y",
    "substitution_in_out", "p2Id",
]


def parse_pbp(rsc: str, game_meta: dict) -> list[dict]:
    """
    Extrae los eventos del play-by-play desde el RSC payload.

    Estructura en el RSC:
        "playByPlay":{
            "items":{
                "Q1":{"name":"Q1","scoreA":N,"scoreB":N,"items":[...]},
                "Q2":{...},
                ...
            }
        }
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

    rows = []
    items_by_period = pbp_data.get('items', {})

    for period_name, period_data in items_by_period.items():
        events = period_data.get('items', [])
        for ev in events:
            org_id = ev.get('oId')
            person_id = ev.get('pId')

            # Filtra valores "$undefined"
            if isinstance(org_id, str) and org_id.startswith('$'):
                org_id = None
            if isinstance(person_id, str) and person_id.startswith('$'):
                person_id = None

            p2_id = ev.get('p2Id')
            if isinstance(p2_id, str) and p2_id.startswith('$'):
                p2_id = None

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
                'eventId': ev.get('Id', ''),
                'order': ev.get('order', ''),
                'act': ev.get('act', ''),
                'actionCode': ev.get('ac', ''),
                'actionText': ev.get('txt', ''),
                'orgId': org_id,
                'personId': person_id,
                # Solo en shots
                'made': ev.get('made', '') if ev.get('act') == 'shot' else '',
                'pts': ev.get('pts', '') if ev.get('act') == 'shot' else '',
                'x': ev.get('x', '') if ev.get('act') == 'shot' else '',
                'y': ev.get('y', '') if ev.get('act') == 'shot' else '',
                # Solo en sustituciones
                'substitution_in_out': ev.get('in', '') if ev.get('act') == 'subst' else '',
                'p2Id': p2_id if ev.get('act') == 'subst' else '',
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
    rows = parse_pbp(rsc, game_meta)
    shots = sum(1 for r in rows if r['act'] == 'shot')
    print(f"    → {len(rows)} eventos ({shots} tiros)")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scraper de PBP FIBA U17 SA 2025")
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
