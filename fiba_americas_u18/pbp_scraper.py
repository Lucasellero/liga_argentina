# -*- coding: utf-8 -*-
"""
Scraper de jugada a jugada (Play by Play) — FIBA U18 AmeriCup 2026.

Genera: fiba_u18_pbp.csv
Uso:
    python pbp_scraper.py            # solo partidos nuevos
    python pbp_scraper.py --full     # re-scrape completo
"""

import sys
import os
import json
import time
import csv
import argparse

sys.path.insert(0, os.path.dirname(__file__))
from fiba_u18_utils import (
    KNOWN_GAMES, GAME_URL_TEMPLATE, make_scraper,
    fetch_page, extract_rsc_data, _unescape_rsc,
    parse_game_meta, discover_game_slug, check_game_status,
)

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "fiba_u18_pbp.csv")

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
    for period_name, period_data in pbp_data.get('items', {}).items():
        for ev in period_data.get('items', []):
            org_id = ev.get('oId')
            person_id = ev.get('pId')
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
                'made': ev.get('made', '') if ev.get('act') == 'shot' else '',
                'pts': ev.get('pts', '') if ev.get('act') == 'shot' else '',
                'x': ev.get('x', '') if ev.get('act') == 'shot' else '',
                'y': ev.get('y', '') if ev.get('act') == 'shot' else '',
                'substitution_in_out': ev.get('in', '') if ev.get('act') == 'subst' else '',
                'p2Id': p2_id if ev.get('act') == 'subst' else '',
            }
            rows.append(row)

    return rows


def scrape_game(scraper, game_id: int, slug: str):
    url = GAME_URL_TEMPLATE.format(game_slug=f"{game_id}-{slug}")
    print(f"  Fetching {url}")
    html = fetch_page(scraper, url)
    rsc = extract_rsc_data(html)

    status = check_game_status(rsc)
    if status == 'live':
        print(f"    🔴 {game_id}-{slug} EN JUEGO — se omite hasta que termine")
        return None
    if status == 'not_started':
        print(f"    ⏳ {game_id}-{slug} no ha empezado — se omite")
        return None

    game_meta = parse_game_meta(rsc)
    game_meta['gameId'] = game_id  # siempre usar el ID real, no el del RSC
    rows = parse_pbp(rsc, game_meta)
    shots = sum(1 for r in rows if r['act'] == 'shot')
    print(f"    → {len(rows)} eventos ({shots} tiros)")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scraper de PBP FIBA U18 Americas 2026")
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

    pending = []
    for gid, slug in KNOWN_GAMES.items():
        if gid in existing_ids:
            continue
        if slug is None:
            slug = discover_game_slug(scraper, gid)
            if slug is None:
                continue
        pending.append((gid, slug))

    print(f"Partidos a procesar: {len(pending)}")

    for game_id, slug in pending:
        try:
            rows = scrape_game(scraper, game_id, slug)
            if rows is not None:
                all_rows.extend(rows)
            time.sleep(1.5)
        except Exception as e:
            print(f"  [ERROR] {game_id}-{slug}: {e}")

    out_df_rows = all_rows
    # Dedup
    seen = set()
    deduped = []
    for r in out_df_rows:
        key = (r['gameId'], r['eventId'], r['order'])
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    if len(deduped) < len(out_df_rows):
        print(f"  [!] Eliminados {len(out_df_rows) - len(deduped)} duplicados")

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(deduped)

    print(f"\nCSV guardado: {OUTPUT_CSV} ({len(deduped)} filas)")


if __name__ == '__main__':
    main()
