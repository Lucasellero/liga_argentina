# -*- coding: utf-8 -*-
"""
Scraper de box scores — FIBA U17 South American Championship 2025.

Genera: sudamericano_u18_boxscore.csv
Columnas clave: gameId, gameName, date, teamCode, teamName, orgId,
                personId, firstName, lastName, uniformNumber, isStarter,
                MIN, PTS, FG2M, FG2A, FG2P, FG3M, FG3A, FG3P,
                FTM, FTA, FTP, REB, DREB, OREB, AST, STL, BLK, BLKR,
                TO, PF, FD, PM, EFF

Uso:
    python boxscore_scraper.py            # todos los partidos
    python boxscore_scraper.py --full     # re-scrape completo (sobreescribe)
"""

import sys
import os
import re
import json
import time
import csv
import argparse

# Módulo compartido (misma carpeta)
sys.path.insert(0, os.path.dirname(__file__))
from fiba_utils import (
    KNOWN_GAMES, GAME_URL_TEMPLATE, make_scraper,
    fetch_page, extract_rsc_data, _unescape_rsc,
    parse_game_meta, parse_players,
)

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "sudamericano_u18_boxscore.csv")

FIELDNAMES = [
    "gameId", "gameName", "date",
    "teamCode", "teamName", "orgId",
    "personId", "firstName", "lastName", "uniformNumber", "isStarter",
    "MIN", "PTS", "FG2M", "FG2A", "FG2P", "FG3M", "FG3A", "FG3P",
    "FTM", "FTA", "FTP", "REB", "DREB", "OREB",
    "AST", "STL", "BLK", "BLKR", "TO", "PF", "FD", "PM", "EFF",
]


def parse_boxscore(rsc: str, game_meta: dict, players: dict) -> list[dict]:
    """
    Extrae las filas del box score desde el RSC payload.
    Devuelve una lista de dicts (uno por jugador por partido).
    """
    # gameDetails está en el RSC como \"gameDetails\":{...}
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

    # Mapeo orgId → code/name desde game_meta
    org_map = {
        game_meta.get('teamA_orgId'): (game_meta.get('teamA_code', ''), game_meta.get('teamA_name', '')),
        game_meta.get('teamB_orgId'): (game_meta.get('teamB_code', ''), game_meta.get('teamB_name', '')),
    }

    # El Id de equipo en gameDetails tiene formato "T_52" donde 52 es el orgId
    for team in teams_data:
        team_id_str = team.get('Id', '')  # e.g. "T_52"
        team_org_id = None
        m = re.match(r'T_(\d+)', team_id_str)
        if m:
            team_org_id = int(m.group(1))
        team_code, team_name = org_map.get(team_org_id, ('', ''))

        for player in team.get('Children', []):
            player_id_str = player.get('Id', '')  # e.g. "P_409013"
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
                'MIN': st.get('TP', ''),        # formato "MM:SS"
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


def scrape_game(scraper, game_id: int, slug: str) -> list[dict]:
    url = GAME_URL_TEMPLATE.format(game_slug=f"{game_id}-{slug}")
    print(f"  Fetching {url}")
    html = fetch_page(scraper, url)
    rsc = extract_rsc_data(html)
    game_meta = parse_game_meta(rsc)
    if not game_meta.get('gameId'):
        game_meta['gameId'] = game_id
    players = parse_players(rsc)
    rows = parse_boxscore(rsc, game_meta, players)
    print(f"    → {len(rows)} filas de jugadores")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scraper de box scores FIBA U17 SA 2025")
    parser.add_argument('--full', action='store_true', help='Re-scrape completo (sobreescribe)')
    args = parser.parse_args()

    # IDs ya scrapeados (para modo incremental)
    existing_ids = set()
    if not args.full and os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_ids.add(int(row.get('gameId', 0)))
        print(f"CSV existente: {len(existing_ids)} partidos ya procesados")

    scraper = make_scraper()
    all_rows = []

    # Leer CSV existente si modo incremental
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
