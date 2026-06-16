# -*- coding: utf-8 -*-
"""
Scraper de box scores — FIBA U18 AmeriCup 2026.

Genera: fiba_u18_boxscore.csv
Uso:
    python boxscore_scraper.py            # partidos nuevos (incremental)
    python boxscore_scraper.py --full     # re-scrape completo
"""

import sys
import os
import re
import json
import time
import csv
import argparse

sys.path.insert(0, os.path.dirname(__file__))
from fiba_u18_utils import (
    KNOWN_GAMES, GAME_URL_TEMPLATE, make_scraper,
    fetch_page, extract_rsc_data, _unescape_rsc,
    parse_game_meta, parse_players, discover_game_slug, check_game_status,
)

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "fiba_u18_boxscore.csv")

FIELDNAMES = [
    "gameId", "gameName", "date",
    "teamCode", "teamName", "orgId",
    "personId", "firstName", "lastName", "uniformNumber", "isStarter",
    "MIN", "PTS", "FG2M", "FG2A", "FG2P", "FG3M", "FG3A", "FG3P",
    "FTM", "FTA", "FTP", "REB", "DREB", "OREB",
    "AST", "STL", "BLK", "BLKR", "TO", "PF", "FD", "PM", "EFF",
]


def parse_boxscore(rsc: str, game_meta: dict, players: dict) -> list[dict]:
    idx = rsc.find('\\"gameDetails\\":')
    if idx == -1:
        print("  [!] gameDetails no encontrado en RSC")
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
                    details = json.loads(_unescape_rsc(raw))
                except json.JSONDecodeError as e:
                    print(f"  [!] Error parseando gameDetails: {e}")
                    return []
                break
    else:
        return []

    rows = []
    teams_data = details.get('c', [])

    org_map = {
        game_meta.get('teamA_orgId'): (game_meta.get('teamA_code', ''), game_meta.get('teamA_name', '')),
        game_meta.get('teamB_orgId'): (game_meta.get('teamB_code', ''), game_meta.get('teamB_name', '')),
    }

    for team in teams_data:
        team_id_str = team.get('Id', '')
        team_org_id = None
        m = re.match(r'T_(\d+)', team_id_str)
        if m:
            team_org_id = int(m.group(1))
        team_code, team_name = org_map.get(team_org_id, ('', ''))

        for player in team.get('Children', []):
            player_id_str = player.get('Id', '')
            pm = re.match(r'P_(\d+)', player_id_str)
            if not pm:
                continue
            person_id = int(pm.group(1))
            st = player.get('Stats', {})
            if not st:
                continue
            pinfo = players.get(person_id, {})

            row = {
                'gameId': game_meta.get('gameId', ''),
                'gameName': game_meta.get('gameName', ''),
                'date': game_meta.get('date', ''),
                'teamCode': team_code,
                'teamName': team_name,
                'orgId': team_org_id,
                'personId': person_id,
                'firstName': pinfo.get('firstName', ''),
                'lastName': pinfo.get('lastName', ''),
                'uniformNumber': pinfo.get('uniformNumber', ''),
                'isStarter': 1 if st.get('Starter') else 0,
                'MIN': st.get('TP', ''),
                'PTS': st.get('PTS', 0),
                'FG2M': st.get('FG2M', 0),
                'FG2A': st.get('FG2A', 0),
                'FG2P': st.get('FG2P', 0),
                'FG3M': st.get('FG3M', 0),
                'FG3A': st.get('FG3A', 0),
                'FG3P': st.get('FG3P', 0),
                'FTM': st.get('FTM', 0),
                'FTA': st.get('FTA', 0),
                'FTP': st.get('FTP', 0),
                'REB': st.get('REB', 0),
                'DREB': st.get('DR', 0),
                'OREB': st.get('OR', 0),
                'AST': st.get('AS', 0),
                'STL': st.get('ST', 0),
                'BLK': st.get('BS', 0),
                'BLKR': st.get('BSR', 0),
                'TO': st.get('TO', 0),
                'PF': st.get('PF', 0),
                'FD': st.get('FD', 0),
                'PM': st.get('PM', 0),
                'EFF': st.get('EFF', 0),
            }
            rows.append(row)

    return rows


def scrape_game(scraper, game_id: int, slug: str):
    """
    Retorna lista de filas, o None si el partido está en juego o no empezó.
    """
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
    game_meta['gameId'] = game_id  # siempre usar el ID real, no el del RSC (puede ser incorrecto)
    players = parse_players(rsc)
    rows = parse_boxscore(rsc, game_meta, players)
    print(f"    → {len(rows)} filas de jugadores")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scraper de box scores FIBA U18 Americas 2026")
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

    # Construir lista de partidos a procesar (solo los que tienen slug conocido o descubrible)
    pending = []
    for gid, slug in KNOWN_GAMES.items():
        if gid in existing_ids:
            continue
        if slug is None:
            # Intentar descubrir el slug (playoffs TBD)
            print(f"  Descubriendo slug para {gid}...")
            slug = discover_game_slug(scraper, gid)
            if slug is None:
                print(f"    → Partido {gid} aún no programado, se omite")
                continue
            print(f"    → Slug encontrado: {slug}")
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

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nCSV guardado: {OUTPUT_CSV} ({len(all_rows)} filas)")


if __name__ == '__main__':
    main()
