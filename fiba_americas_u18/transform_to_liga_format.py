# -*- coding: utf-8 -*-
"""
Transforma los 3 CSVs del FIBA U18 AmeriCup 2026 al esquema de Liga Nacional,
generando los CSVs de docs/argentina_formativas/fiba_u18/ listos para el dashboard.

Salida:
  docs/argentina_formativas/fiba_u18/fiba_u18.csv
  docs/argentina_formativas/fiba_u18/fiba_u18_shots.csv
  docs/argentina_formativas/fiba_u18/fiba_u18_pbp.csv

Uso:
  python fiba_americas_u18/transform_to_liga_format.py
"""

import os, sys
import pandas as pd
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "fiba_americas_u18")
OUT  = os.path.join(ROOT, "docs", "argentina_formativas", "fiba_u18")

# ── Fechas (DD/MM/YYYY) ──────────────────────────────────────────────────────
# Grupo A
GAME_DATES = {
    130879: "01/06/2026",  # USA-ARG  R1
    130877: "01/06/2026",  # BRA-MEX  R1
    130878: "02/06/2026",  # MEX-USA  R2
    130880: "02/06/2026",  # ARG-BRA  R2
    130881: "04/06/2026",  # MEX-ARG  R3
    130882: "04/06/2026",  # USA-BRA  R3
    # Grupo B
    130885: "01/06/2026",  # DOM-PUR  R1
    130884: "01/06/2026",  # VEN-CAN  R1
    130888: "02/06/2026",  # CAN-DOM  R2
    130886: "02/06/2026",  # PUR-VEN  R2
    130887: "04/06/2026",  # CAN-PUR  R3
    130883: "04/06/2026",  # DOM-VEN  R3
    # Playoffs (fechas estimadas, se actualizan al conocerse)
    134636: "05/06/2026",
    134637: "05/06/2026",
    134638: "05/06/2026",
    134639: "05/06/2026",
    134640: "06/06/2026",
    134641: "06/06/2026",
    134642: "06/06/2026",
    134643: "06/06/2026",
    134644: "07/06/2026",
    134645: "07/06/2026",
}

# ── Etapas ───────────────────────────────────────────────────────────────────
GAME_ETAPA = {
    130879: "Grupo A", 130877: "Grupo A",
    130878: "Grupo A", 130880: "Grupo A",
    130881: "Grupo A", 130882: "Grupo A",
    130885: "Grupo B", 130884: "Grupo B",
    130888: "Grupo B", 130886: "Grupo B",
    130887: "Grupo B", 130883: "Grupo B",
    134636: "Clasificación",
    134637: "Clasificación",
    134638: "Cuartos de Final",
    134639: "Cuartos de Final",
    134640: "5°-8° Puesto",
    134641: "5°-8° Puesto",
    134642: "Semifinal",
    134643: "Semifinal",
    134644: "Bronce",
    134645: "Final",
}

ESTADIO = "Domo de la Feria, León, México"

PERIOD_MAP = {"Q1": "1", "Q2": "2", "Q3": "3", "Q4": "4",
              "OT1": "5", "OT2": "6"}


def fmt_name(first, last):
    """GOBETTI, B."""
    f = str(first).strip()
    l = str(last).strip().upper()
    return f"{l}, {f[0].upper()}." if f else l


def parse_min_to_secs(mm_ss):
    try:
        parts = str(mm_ss).split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def build_game_teams_from_boxscore(df):
    """
    Deriva GAME_TEAMS (gid → (local, visit)) directamente del boxscore.
    teamA (primer equipo en el slug KNOWN_GAMES) = LOCAL.
    En ausencia de esa info, tomamos el primer y segundo teamCode por gameId.
    """
    from fiba_u18_utils import KNOWN_GAMES
    game_teams = {}
    for gid, slug in KNOWN_GAMES.items():
        if slug:
            parts = slug.split('-')
            if len(parts) == 2:
                game_teams[gid] = (parts[0], parts[1])
    # Para partidos cuyo slug no era conocido (playoffs), inferir del boxscore
    for gid in df['gameId'].unique():
        gid = int(gid)
        if gid not in game_teams:
            teams = df[df['gameId'] == gid]['teamCode'].unique().tolist()
            if len(teams) >= 2:
                game_teams[gid] = (teams[0], teams[1])
    return game_teams


# ── BOXSCORE DESDE PBP ────────────────────────────────────────────────────────

def build_boxscore_from_pbp(df_pbp, game_teams):
    """
    Reconstruye un DataFrame de boxscore (formato fiba_u18_boxscore.csv)
    a partir del PBP, para partidos donde FIBA no publicó el boxscore.

    Stats calculadas por jugador:
      PTS, FG2M, FG2A, FG3M, FG3A, FTM, FTA,
      OREB, DREB, REB, AST, TO, STL, BLK, PF, FD
    Stats no disponibles en PBP (se dejan en 0):
      MIN, BLKR, EFF, PM, isStarter
    """
    rows = []
    # Jugadores presentes por partido: personId → teamCode (via orgId)
    # Necesitamos mapear orgId → teamCode desde el PBP
    for gid, grp in df_pbp.groupby('gameId'):
        gid = int(gid)
        if gid not in game_teams:
            continue
        local, visit = game_teams[gid]

        # Mapear orgId → teamCode: tomamos los orgId de eventos de shot con teamCode conocido
        # El shots CSV ya tiene teamCode; el PBP no. Usamos teamA/teamB del primer evento.
        teamA_code = grp['teamA_code'].iloc[0]
        teamB_code = grp['teamB_code'].iloc[0]

        # orgId → code: en el PBP el orgId viene en eventos de jugadores
        # Derivamos del shots CSV si está disponible, sino usamos posición (A=local, B=visit)
        # En FIBA: teamA es el primer equipo del slug (local en nuestro sistema)
        org_to_code = {}
        for _, ev in grp.iterrows():
            if pd.notna(ev.get('orgId')) and ev.get('orgId') != '':
                oid = ev['orgId']
                # Relacionar org con code vía posición A/B
                # No tenemos org de team A/B directo en PBP, pero podemos inferir
                # comparando los orgIds con los que aparecen con shots de cada código
                org_to_code[oid] = None  # se llena abajo

        # Estrategia: cada personId tiene un único orgId. Agrupamos personId → orgId
        # y luego si el mismo personId aparece en un evento con actionCode que revela equipo…
        # Más simple: usar el scoreA/scoreB final para saber quién es teamA/teamB.
        # En el PBP, teamA_code y teamB_code están en cada fila. El orgId de los jugadores
        # de teamA se puede identificar si busco jugadores que solo aparecen en un orgId
        # y ese orgId es consistente. Como no tenemos mapping directo, usamos los orgIds
        # del shots CSV que sí tiene teamCode.

        shots_path = os.path.join(SRC, "fiba_u18_shots.csv")
        org_to_code = {}
        if os.path.exists(shots_path):
            df_shots = pd.read_csv(shots_path)
            game_shots = df_shots[df_shots['gameId'] == gid]
            for _, s in game_shots.iterrows():
                if pd.notna(s['orgId']) and pd.notna(s['teamCode']):
                    org_to_code[str(int(float(s['orgId'])))] = s['teamCode']

        # Acumular stats por (personId, orgId)
        players = {}  # key=(personId, orgId) → stats dict

        for _, ev in grp.iterrows():
            pid = ev.get('personId')
            oid = ev.get('orgId')
            if pd.isna(pid) or pid == '' or pid is None:
                continue
            pid = str(pid)
            oid = str(int(float(oid))) if pd.notna(oid) and oid != '' else None

            key = (pid, oid)
            if key not in players:
                players[key] = {
                    'personId': pid, 'orgId': oid,
                    'PTS': 0, 'FG2M': 0, 'FG2A': 0, 'FG3M': 0, 'FG3A': 0,
                    'FTM': 0, 'FTA': 0, 'OREB': 0, 'DREB': 0, 'AST': 0,
                    'TO': 0, 'STL': 0, 'BLK': 0, 'PF': 0, 'FD': 0,
                    'firstName': '', 'lastName': '', 'uniformNumber': '',
                }

            s = players[key]
            ac = str(ev.get('actionCode', '')).upper()
            act = str(ev.get('act', '')).lower()
            made = ev.get('made')
            pts = ev.get('pts', 0)
            try:
                pts = int(float(pts)) if pd.notna(pts) and pts != '' else 0
            except Exception:
                pts = 0

            if act == 'shot':
                if ac in ('P2', '2PT'):
                    s['FG2A'] += 1
                    if made:
                        s['FG2M'] += 1
                        s['PTS'] += 2
                elif ac in ('P3', '3PT'):
                    s['FG3A'] += 1
                    if made:
                        s['FG3M'] += 1
                        s['PTS'] += 3
                elif ac == 'FT':
                    s['FTA'] += 1
                    if made:
                        s['FTM'] += 1
                        s['PTS'] += 1
            elif ac == 'TREB':
                # Necesitamos saber si es ofensivo o defensivo.
                # actionText suele decir "Offensive rebound" o "Defensive rebound"
                txt = str(ev.get('actionText', '')).lower()
                if 'offens' in txt:
                    s['OREB'] += 1
                else:
                    s['DREB'] += 1
            elif ac == 'ASS':
                s['AST'] += 1
            elif ac == 'TO':
                s['TO'] += 1
            elif ac == 'ST':
                s['STL'] += 1
            elif ac == 'BS':
                s['BLK'] += 1
            elif ac == 'FOUL':
                s['PF'] += 1
            elif ac == 'RFOUL':
                s['FD'] += 1

        # Enriquecer con nombres desde shots CSV
        if os.path.exists(shots_path):
            df_shots_g = df_shots[df_shots['gameId'] == gid] if 'df_shots' in dir() else pd.DataFrame()
            pid_info = {}
            for _, s in df_shots_g.iterrows():
                pid = str(s['personId']) if pd.notna(s['personId']) else None
                if pid and pid not in pid_info:
                    pid_info[pid] = {
                        'firstName': s.get('firstName', ''),
                        'lastName': s.get('lastName', ''),
                        'uniformNumber': s.get('uniformNumber', ''),
                    }
            for key, pstats in players.items():
                pid = pstats['personId']
                if pid in pid_info:
                    pstats.update(pid_info[pid])

        # Construir filas en formato boxscore
        for key, pstats in players.items():
            oid = pstats['orgId']
            team_code = org_to_code.get(oid, '') if oid else ''
            if not team_code:
                continue  # no podemos asignar equipo, descartamos

            pstats['REB'] = pstats['OREB'] + pstats['DREB']
            pstats['FG2P'] = round(pstats['FG2M'] / pstats['FG2A'] * 100, 1) if pstats['FG2A'] else 0
            pstats['FG3P'] = round(pstats['FG3M'] / pstats['FG3A'] * 100, 1) if pstats['FG3A'] else 0
            pstats['FTP']  = round(pstats['FTM']  / pstats['FTA']  * 100, 1) if pstats['FTA']  else 0

            rows.append({
                'gameId': gid,
                'gameName': grp['gameName'].iloc[0],
                'date': grp['date'].iloc[0],
                'teamA_code': teamA_code,
                'teamB_code': teamB_code,
                'teamCode': team_code,
                'personId': pstats['personId'],
                'firstName': pstats['firstName'],
                'lastName': pstats['lastName'],
                'uniformNumber': pstats['uniformNumber'],
                'isStarter': 0,
                'MIN': '0:00',
                'PTS': pstats['PTS'],
                'FG2M': pstats['FG2M'], 'FG2A': pstats['FG2A'], 'FG2P': pstats['FG2P'],
                'FG3M': pstats['FG3M'], 'FG3A': pstats['FG3A'], 'FG3P': pstats['FG3P'],
                'FTM': pstats['FTM'],   'FTA': pstats['FTA'],   'FTP': pstats['FTP'],
                'OREB': pstats['OREB'], 'DREB': pstats['DREB'], 'REB': pstats['REB'],
                'AST': pstats['AST'],   'TO': pstats['TO'],     'STL': pstats['STL'],
                'BLK': pstats['BLK'],   'BLKR': 0,
                'PF': pstats['PF'],     'FD': pstats['FD'],
                'EFF': 0, 'PM': 0,
            })

    return pd.DataFrame(rows)


# ── BOXSCORE ─────────────────────────────────────────────────────────────────

def transform_boxscore(game_teams):
    df = pd.read_csv(os.path.join(SRC, "fiba_u18_boxscore.csv"))
    df['gameId'] = df['gameId'].astype(int)

    team_scores = df.groupby(["gameId", "teamCode"])["PTS"].sum().reset_index()
    score_map = {(int(r.gameId), r.teamCode): int(r.PTS) for _, r in team_scores.iterrows()}

    rows = []
    totales_rows = []

    for _, r in df.iterrows():
        gid = int(r.gameId)
        team = r.teamCode
        if gid not in game_teams:
            continue
        local, visit = game_teams[gid]
        rival = visit if team == local else local
        condicion = "LOCAL" if team == local else "VISITANTE"
        fecha = GAME_DATES.get(gid, "")
        etapa = GAME_ETAPA.get(gid, "Playoff")

        my_pts  = score_map.get((gid, team), 0)
        opp_pts = score_map.get((gid, rival), 0)
        ganado  = 1 if my_pts > opp_pts else 0

        secs = parse_min_to_secs(r.MIN)
        nombre = fmt_name(r.firstName, r.lastName)

        rows.append({
            "Fecha": fecha,
            "Condicion equipos": condicion,
            "Equipo": team,
            "Rival": rival,
            "Número Camiseta": r.uniformNumber,
            "Apellido": str(r.lastName).upper(),
            "Nombre": str(r.firstName).upper(),
            "Nombre completo": nombre,
            "Segundos jugados": secs,
            "Tiempo jugado (mm:ss)": r.MIN,
            "Puntos": r.PTS,
            "T2A": r.FG2M, "T2I": r.FG2A, "T2%": r.FG2P,
            "T3A": r.FG3M, "T3I": r.FG3A, "T3%": r.FG3P,
            "T1A": r.FTM,  "T1I": r.FTA,  "T1%": r.FTP,
            "DReb": r.DREB, "OReb": r.OREB, "TReb": r.REB,
            "Asistencias": r.AST,
            "Recuperos": r.STL,
            "Perdidas": r.TO,
            "Tapones cometidos": r.BLK,
            "Tapones recibidos": r.BLKR,
            "Faltas Cometidas": r.PF,
            "Faltas Recibidas": r.FD,
            "Valoracion": r.EFF,
            "Ganado": ganado,
            "Estadio": ESTADIO,
            "IdPartido": str(gid),
            "Etapa": etapa,
            "Titular": int(r.isStarter),
            "Plus/minus": r.PM,
        })

    numeric_cols = ["Segundos jugados","Puntos","T2A","T2I","T3A","T3I","T1A","T1I",
                    "DReb","OReb","TReb","Asistencias","Recuperos","Perdidas",
                    "Tapones cometidos","Tapones recibidos","Faltas Cometidas",
                    "Faltas Recibidas","Valoracion","Plus/minus"]

    out_df = pd.DataFrame(rows)

    if out_df.empty:
        print("  [!] Sin filas de boxscore de FIBA — reconstruyendo desde PBP...")
        pbp_path = os.path.join(SRC, "fiba_u18_pbp.csv")
        if os.path.exists(pbp_path):
            df_pbp = pd.read_csv(pbp_path)
            df_pbp['gameId'] = df_pbp['gameId'].astype(int)
            out_df = build_boxscore_from_pbp(df_pbp, game_teams)
            print(f"  → Reconstruidos {out_df['gameId'].nunique() if not out_df.empty else 0} partidos desde PBP ({len(out_df)} jugadores)")
        if out_df.empty:
            print("  [!] PBP también vacío — se omite transform_boxscore")
            return []

        # Recalcular score_map desde el PBP-boxscore reconstruido
        team_scores = out_df.groupby(["gameId", "teamCode"])["PTS"].sum().reset_index()
        score_map = {(int(r.gameId), r.teamCode): int(r.PTS) for _, r in team_scores.iterrows()}

        # out_df ya tiene teamCode pero necesitamos las columnas del schema de liga
        # Rearmar rows desde out_df
        rows = []
        for _, r in out_df.iterrows():
            gid = int(r.gameId)
            team = r.teamCode
            local, visit = game_teams[gid]
            rival = visit if team == local else local
            condicion = "LOCAL" if team == local else "VISITANTE"
            fecha = GAME_DATES.get(gid, "")
            etapa = GAME_ETAPA.get(gid, "Playoff")
            my_pts  = score_map.get((gid, team), 0)
            opp_pts = score_map.get((gid, rival), 0)
            nombre = fmt_name(r.firstName, r.lastName)
            rows.append({
                "Fecha": fecha, "Condicion equipos": condicion,
                "Equipo": team, "Rival": rival,
                "Número Camiseta": r.uniformNumber,
                "Apellido": str(r.lastName).upper(), "Nombre": str(r.firstName).upper(),
                "Nombre completo": nombre,
                "Segundos jugados": 0, "Tiempo jugado (mm:ss)": "0:00",
                "Puntos": r.PTS,
                "T2A": r.FG2M, "T2I": r.FG2A, "T2%": r.FG2P,
                "T3A": r.FG3M, "T3I": r.FG3A, "T3%": r.FG3P,
                "T1A": r.FTM,  "T1I": r.FTA,  "T1%": r.FTP,
                "DReb": r.DREB, "OReb": r.OREB, "TReb": r.REB,
                "Asistencias": r.AST, "Recuperos": r.STL, "Perdidas": r.TO,
                "Tapones cometidos": r.BLK, "Tapones recibidos": 0,
                "Faltas Cometidas": r.PF, "Faltas Recibidas": r.FD,
                "Valoracion": 0, "Ganado": 1 if my_pts > opp_pts else 0,
                "Estadio": ESTADIO, "IdPartido": str(gid), "Etapa": etapa,
                "Titular": 0, "Plus/minus": 0,
            })
        out_df = pd.DataFrame(rows)

    for (gid, team), grp in out_df.groupby(["IdPartido","Equipo"]):
        gid_int = int(gid)
        if gid_int not in game_teams:
            continue
        local, visit = game_teams[gid_int]
        rival = visit if team == local else local
        condicion = "LOCAL" if team == local else "VISITANTE"
        my_pts  = score_map.get((gid_int, team), 0)
        opp_pts = score_map.get((gid_int, rival), 0)
        ganado  = 1 if my_pts > opp_pts else 0

        totales = {c: grp[c].sum() for c in numeric_cols if c in grp.columns}
        totales["T2%"] = round(totales["T2A"] / totales["T2I"] * 100, 1) if totales.get("T2I") else 0
        totales["T3%"] = round(totales["T3A"] / totales["T3I"] * 100, 1) if totales.get("T3I") else 0
        totales["T1%"] = round(totales["T1A"] / totales["T1I"] * 100, 1) if totales.get("T1I") else 0
        totales.update({
            "Fecha": GAME_DATES.get(gid_int, ""),
            "Condicion equipos": condicion,
            "Equipo": team,
            "Rival": rival,
            "Número Camiseta": "",
            "Apellido": "TOTALES",
            "Nombre": "",
            "Nombre completo": "TOTALES",
            "Tiempo jugado (mm:ss)": "",
            "Ganado": ganado,
            "Estadio": ESTADIO,
            "IdPartido": str(gid),
            "Etapa": GAME_ETAPA.get(gid_int, "Playoff"),
            "Titular": 0,
        })
        totales_rows.append(totales)

    totales_df = pd.DataFrame(totales_rows)
    final_df = pd.concat([out_df, totales_df], ignore_index=True)

    cols = ["Fecha","Condicion equipos","Equipo","Rival","Número Camiseta",
            "Apellido","Nombre","Nombre completo","Segundos jugados",
            "Tiempo jugado (mm:ss)","Puntos","T2A","T2I","T2%","T3A","T3I","T3%",
            "T1A","T1I","T1%","DReb","OReb","TReb","Asistencias","Recuperos",
            "Perdidas","Tapones cometidos","Tapones recibidos","Faltas Cometidas",
            "Faltas Recibidas","Valoracion","Ganado","Estadio","IdPartido","Etapa",
            "Titular","Plus/minus"]
    final_df = final_df[[c for c in cols if c in final_df.columns]]

    out_path = os.path.join(OUT, "fiba_u18.csv")
    final_df.to_csv(out_path, index=False)
    print(f"Boxscore: {len(final_df)} filas → {out_path}")


# ── SHOTS ────────────────────────────────────────────────────────────────────

def transform_shots(game_teams):
    df = pd.read_csv(os.path.join(SRC, "fiba_u18_shots.csv"))
    df['gameId'] = df['gameId'].astype(int)

    rows = []
    for _, r in df.iterrows():
        gid = int(r.gameId)
        if gid not in game_teams:
            continue
        local, visit = game_teams[gid]
        is_local = r.teamCode == local

        tipo_map = {"2PT": "TIRO2", "3PT": "TIRO3", "FT": "TIRO1"}
        tipo = tipo_map.get(str(r.shotType), "TIRO2")
        resultado = "CONVERTIDO" if int(r.made) == 1 else "FALLADO"
        periodo = PERIOD_MAP.get(str(r.period), str(r.period))

        rows.append({
            "IdPartido": str(gid),
            "Fecha": GAME_DATES.get(gid, ""),
            "Equipo_local": local,
            "Equipo_visitante": visit,
            "Local": "True" if is_local else "False",
            "Equipo": r.teamCode,
            "personId": r.personId,
            "firstName": r.firstName,
            "lastName": r.lastName,
            "Dorsal": r.uniformNumber,
            "Periodo": periodo,
            "Tipo": tipo,
            "Resultado": resultado,
            "Zona": "",
            "x": r.x,
            "y": r.y,
        })

    out_df = pd.DataFrame(rows)
    out_path = os.path.join(OUT, "fiba_u18_shots.csv")
    out_df.to_csv(out_path, index=False)
    print(f"Shots: {len(out_df)} filas → {out_path}")


# ── PBP ──────────────────────────────────────────────────────────────────────

def transform_pbp(game_teams):
    pbp = pd.read_csv(os.path.join(SRC, "fiba_u18_pbp.csv"))
    box = pd.read_csv(os.path.join(SRC, "fiba_u18_boxscore.csv"))
    pbp['gameId'] = pbp['gameId'].astype(int)
    box['gameId'] = box['gameId'].astype(int)

    player_map = {}
    for _, r in box.iterrows():
        pid = int(r.personId)
        if pid not in player_map:
            player_map[pid] = (str(r.firstName).upper(), str(r.lastName).upper(), str(r.uniformNumber))

    org_to_team = {}
    for gid in box['gameId'].unique():
        game_box = box[box["gameId"] == gid]
        for team_code in game_box["teamCode"].unique():
            for org in game_box[game_box["teamCode"] == team_code]["orgId"].unique():
                org_to_team[(int(gid), int(org))] = team_code

    # Starters per game/team: {(gameId, teamCode): [(jugador, dorsal), ...]}
    starters = {}
    for _, r in box.iterrows():
        if int(r.isStarter) != 1:
            continue
        gid = int(r.gameId)
        tc = r.teamCode
        fn = str(r.firstName).upper()
        ln = str(r.lastName).upper()
        key = (gid, tc)
        if key not in starters:
            starters[key] = []
        starters[key].append((f"{ln}, {fn}", str(r.uniformNumber)))

    has_injected = set()  # gameIds that already had starters injected

    def act_tipo(row):
        ac = str(row.get("actionCode", ""))
        act = str(row.get("act", ""))
        made = row.get("made", "")
        txt = str(row.get("actionText", "")).lower()
        inout = str(row.get("substitution_in_out", ""))

        if ac == "STARTG": return "INICIO-PARTIDO"
        if ac == "ENDG":   return "FINAL-PARTIDO"
        if ac == "STARTP": return "INICIO-PERIODO"
        if ac == "ENDP":   return "FINAL-PERIODO"

        if act == "shot":
            pts = row.get("pts", 0)
            try: pts = int(float(pts))
            except: pts = 0
            if str(made).lower() in ("true", "1", "1.0"):
                return f"CANASTA-{pts}P" if pts else "CANASTA-2P"
            else:
                if ac == "FT":  return "TIRO1-FALLADO"
                if ac == "P3":  return "TIRO3-FALLADO"
                return "TIRO2-FALLADO"

        if ac == "ASS":   return "ASISTENCIA"
        if ac == "REB":
            return "REBOTE-DEFENSIVO" if "defensive" in txt else "REBOTE-OFENSIVO"
        if ac == "TREB":
            return "REBOTE-DEFENSIVO" if "defensive" in txt else "REBOTE-OFENSIVO"
        if ac == "ST":    return "RECUPERACION"
        if ac == "BS":    return "TAPON-COMETIDO"
        if ac == "BSR":   return "TAPON-RECIBIDO"
        if ac == "TO":    return "PERDIDA"
        if ac == "FOUL":  return "FALTA-COMETIDA"
        if ac == "RFOUL": return "FALTA-RECIBIDA"
        if ac == "CFOUL": return "FALTA-COMETIDA"
        if act == "subst":
            return "CAMBIO-JUGADOR-ENTRA" if inout == "IN" else "CAMBIO-JUGADOR-SALE"
        if ac in ("TIMO", "TTO"): return "TIEMPO-MUERTO-SOLICITADO"
        if ac in ("JB", "JS"): return "JUMP-BALL"
        return ac

    rows = []
    num_accion = {}

    for _, r in pbp.iterrows():
        gid = int(r.gameId)
        if gid not in game_teams:
            continue
        local, visit = game_teams[gid]
        num_accion[gid] = num_accion.get(gid, -1) + 1

        row_dict = r.to_dict()
        tipo = act_tipo(row_dict)

        org_id = r.orgId
        equipo_lado = None
        if pd.notna(org_id):
            try:
                tc = org_to_team.get((gid, int(org_id)))
                if tc:
                    equipo_lado = "LOCAL" if tc == local else "VISITANTE"
            except (ValueError, TypeError):
                pass

        pid = r.personId
        jugador = None
        dorsal = None
        if pd.notna(pid):
            try:
                pinfo = player_map.get(int(pid))
                if pinfo:
                    fn, ln, dorsal = pinfo
                    jugador = f"{ln}, {fn}"
            except (ValueError, TypeError):
                pass

        periodo = PERIOD_MAP.get(str(r.period), str(r.period))

        rows.append({
            "IdPartido": str(gid),
            "Fecha": GAME_DATES.get(gid, ""),
            "Equipo_local": local,
            "Equipo_visitante": visit,
            "NumAccion": num_accion[gid],
            "Tipo": tipo,
            "Equipo_lado": equipo_lado,
            "Dorsal": dorsal,
            "Jugador": jugador,
            "Periodo": periodo,
            "Tiempo": r.timeRemaining if pd.notna(r.timeRemaining) else "",
            "Marcador_local": r.scoreA if pd.notna(r.scoreA) else 0,
            "Marcador_visitante": r.scoreB if pd.notna(r.scoreB) else 0,
        })

        # After INICIO-PERIODO of period 1, inject synthetic CAMBIO-JUGADOR-ENTRA
        # for the 5 starters of each team so computeLineups() can track quintetos.
        if tipo == "INICIO-PERIODO" and periodo == "1" and gid not in has_injected:
            has_injected.add(gid)
            for team_code, equipo_lado_s in [(local, "LOCAL"), (visit, "VISITANTE")]:
                for jugador_s, dorsal_s in starters.get((gid, team_code), []):
                    num_accion[gid] += 1
                    rows.append({
                        "IdPartido": str(gid),
                        "Fecha": GAME_DATES.get(gid, ""),
                        "Equipo_local": local,
                        "Equipo_visitante": visit,
                        "NumAccion": num_accion[gid],
                        "Tipo": "CAMBIO-JUGADOR-ENTRA",
                        "Equipo_lado": equipo_lado_s,
                        "Dorsal": dorsal_s,
                        "Jugador": jugador_s,
                        "Periodo": "1",
                        "Tiempo": "10:00",
                        "Marcador_local": 0,
                        "Marcador_visitante": 0,
                    })

    out_df = pd.DataFrame(rows)
    out_df.drop_duplicates(inplace=True)
    out_path = os.path.join(OUT, "fiba_u18_pbp.csv")
    out_df.to_csv(out_path, index=False)
    print(f"PBP: {len(out_df)} filas → {out_path}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Transformando CSVs FIBA U18 → formato Liga Nacional...")

    # Leer boxscore para derivar game_teams
    box_path = os.path.join(SRC, "fiba_u18_boxscore.csv")
    if not os.path.exists(box_path):
        print(f"[ERROR] No existe {box_path}. Correr boxscore_scraper.py primero.")
        sys.exit(1)

    df_box = pd.read_csv(box_path)
    df_box['gameId'] = df_box['gameId'].astype(int)
    game_teams = build_game_teams_from_boxscore(df_box)
    print(f"Partidos en boxscore: {len(game_teams)}")

    transform_boxscore(game_teams)
    transform_shots(game_teams)
    transform_pbp(game_teams)
    print("Listo.")
