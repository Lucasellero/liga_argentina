# -*- coding: utf-8 -*-
"""
Transforma los 3 CSVs del Sudamericano U17 FIBA 2025 al esquema de Liga Nacional,
generando los CSVs de docs/argentina_formativas/ listos para el dashboard.

Salida:
  docs/argentina_formativas/argentina_formativas.csv
  docs/argentina_formativas/argentina_formativas_shots.csv
  docs/argentina_formativas/argentina_formativas_pbp.csv

Uso:
  python sudamericano_u18/transform_to_liga_format.py
"""

import os, sys
import pandas as pd
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "sudamericano_u18")
OUT  = os.path.join(ROOT, "docs", "argentina_formativas")

# ── Fechas conocidas ────────────────────────────────────────────────────────
GAME_DATES = {
    125521: "10/12/2025", 125522: "10/12/2025",
    125527: "10/12/2025", 125528: "10/12/2025",
    125523: "11/12/2025", 125524: "11/12/2025",
    125529: "11/12/2025", 125530: "11/12/2025",
    125525: "12/12/2025", 125526: "12/12/2025",
    125531: "12/12/2025", 125532: "12/12/2025",
    130826: "13/12/2025", 130827: "13/12/2025",
    130828: "13/12/2025", 130829: "13/12/2025",
    130830: "14/12/2025", 130831: "14/12/2025",
    130832: "14/12/2025", 130833: "14/12/2025",
}

GAME_ETAPA = {
    125521: "Grupo A", 125522: "Grupo A", 125523: "Grupo A",
    125524: "Grupo A", 125525: "Grupo A", 125526: "Grupo A",
    125527: "Grupo B", 125528: "Grupo B", 125529: "Grupo B",
    125530: "Grupo B", 125531: "Grupo B", 125532: "Grupo B",
    130826: "5°-8° puesto", 130827: "5°-8° puesto",
    130828: "Semifinal", 130829: "Semifinal",
    130830: "7° Puesto", 130831: "5° Puesto",
    130832: "Bronce", 130833: "Final",
}

ESTADIO = "Estadio Primero de Marzo, Asunción"

# teamA es LOCAL (primer código del slug)
GAME_TEAMS = {
    125521: ("URU", "ARG"), 125522: ("ECU", "COL"),
    125523: ("COL", "URU"), 125524: ("ARG", "ECU"),
    125525: ("URU", "ECU"), 125526: ("COL", "ARG"),
    125527: ("PAR", "VEN"), 125528: ("BRA", "CHI"),
    125529: ("CHI", "PAR"), 125530: ("VEN", "BRA"),
    125531: ("PAR", "BRA"), 125532: ("CHI", "VEN"),
    130826: ("COL", "PAR"), 130827: ("CHI", "ECU"),
    130828: ("ARG", "VEN"), 130829: ("BRA", "URU"),
    130830: ("COL", "ECU"), 130831: ("PAR", "CHI"),
    130832: ("VEN", "URU"), 130833: ("ARG", "BRA"),
}

PERIOD_MAP = {"Q1": "1", "Q2": "2", "Q3": "3", "Q4": "4",
              "OT1": "5", "OT2": "6"}


def fmt_name(first, last):
    """GOBETTI, B."""
    f = str(first).strip()
    l = str(last).strip().upper()
    return f"{l}, {f[0].upper()}." if f else l


def parse_min_to_secs(mm_ss):
    """'22:33' → 1353"""
    try:
        parts = str(mm_ss).split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


# ── BOXSCORE ─────────────────────────────────────────────────────────────────

def transform_boxscore():
    df = pd.read_csv(os.path.join(SRC, "sudamericano_u18_boxscore.csv"))

    # Final scores per game per team (for Ganado)
    # Load PBP to get final scores — or derive from gameDetails scores stored in boxscore
    # Actually we need final scores. We'll compute from the scoreA/scoreB in shots or PBP.
    # Easier: use a game_scores dict derived from GAME_TEAMS and boxscore itself.
    # Sum PTS per teamCode per gameId → final score
    team_scores = df.groupby(["gameId", "teamCode"])["PTS"].sum().reset_index()
    score_map = {}  # (gameId, teamCode) → total_pts
    for _, row in team_scores.iterrows():
        score_map[(int(row.gameId), row.teamCode)] = int(row.PTS)

    rows = []
    totales_rows = []

    for _, r in df.iterrows():
        gid = int(r.gameId)
        team = r.teamCode
        local, visit = GAME_TEAMS[gid]
        rival = visit if team == local else local
        condicion = "LOCAL" if team == local else "VISITANTE"
        fecha = GAME_DATES[gid]
        etapa = GAME_ETAPA[gid]

        my_pts  = score_map.get((gid, team), 0)
        opp_pts = score_map.get((gid, rival), 0)
        ganado  = 1 if my_pts > opp_pts else 0

        secs = parse_min_to_secs(r.MIN)
        nombre = fmt_name(r.firstName, r.lastName)

        row = {
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
        }
        rows.append(row)

    # Build TOTALES rows (one per team per game)
    numeric_cols = ["Segundos jugados","Puntos","T2A","T2I","T3A","T3I","T1A","T1I",
                    "DReb","OReb","TReb","Asistencias","Recuperos","Perdidas",
                    "Tapones cometidos","Tapones recibidos","Faltas Cometidas",
                    "Faltas Recibidas","Valoracion","Plus/minus"]

    out_df = pd.DataFrame(rows)

    for (gid, team), grp in out_df.groupby(["IdPartido","Equipo"]):
        gid_int = int(gid)
        local, visit = GAME_TEAMS[gid_int]
        rival = visit if team == local else local
        condicion = "LOCAL" if team == local else "VISITANTE"
        my_pts  = score_map.get((gid_int, team), 0)
        opp_pts = score_map.get((gid_int, rival), 0)
        ganado  = 1 if my_pts > opp_pts else 0

        totales = {c: grp[c].sum() for c in numeric_cols if c in grp.columns}
        # Recalculate percentages
        totales["T2%"] = round(totales["T2A"] / totales["T2I"] * 100, 1) if totales.get("T2I") else 0
        totales["T3%"] = round(totales["T3A"] / totales["T3I"] * 100, 1) if totales.get("T3I") else 0
        totales["T1%"] = round(totales["T1A"] / totales["T1I"] * 100, 1) if totales.get("T1I") else 0
        totales.update({
            "Fecha": GAME_DATES[gid_int],
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
            "Etapa": GAME_ETAPA[gid_int],
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

    out_path = os.path.join(OUT, "argentina_formativas.csv")
    final_df.to_csv(out_path, index=False)
    print(f"Boxscore: {len(final_df)} filas → {out_path}")


# ── SHOTS ────────────────────────────────────────────────────────────────────

def transform_shots():
    df = pd.read_csv(os.path.join(SRC, "sudamericano_u18_shots.csv"))

    rows = []
    for _, r in df.iterrows():
        gid = int(r.gameId)
        local, visit = GAME_TEAMS[gid]
        is_local = r.teamCode == local

        # Tipo (TIRO1/2/3)
        tipo_map = {"2PT": "TIRO2", "3PT": "TIRO3", "FT": "TIRO1"}
        tipo = tipo_map.get(str(r.shotType), "TIRO2")

        # Resultado
        resultado = "CONVERTIDO" if int(r.made) == 1 else "FALLADO"

        periodo = PERIOD_MAP.get(str(r.period), str(r.period))

        rows.append({
            "IdPartido": str(gid),
            "Fecha": GAME_DATES[gid],
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
            # Coordenadas nativas FIBA (el renderer del dashboard las usa directamente)
            "x": r.x,
            "y": r.y,
        })

    out_df = pd.DataFrame(rows)
    out_path = os.path.join(OUT, "argentina_formativas_shots.csv")
    out_df.to_csv(out_path, index=False)
    print(f"Shots: {len(out_df)} filas → {out_path}")


# ── PBP ──────────────────────────────────────────────────────────────────────

def transform_pbp():
    pbp = pd.read_csv(os.path.join(SRC, "sudamericano_u18_pbp.csv"))
    box = pd.read_csv(os.path.join(SRC, "sudamericano_u18_boxscore.csv"))

    # Build personId → (firstName, lastName, uniformNumber) lookup
    player_map = {}
    for _, r in box.iterrows():
        pid = int(r.personId)
        if pid not in player_map:
            player_map[pid] = (str(r.firstName).upper(), str(r.lastName).upper(), str(r.uniformNumber))

    # Build orgId → teamCode per game
    org_to_team = {}  # (gameId, orgId) → teamCode
    for gid, (local, visit) in GAME_TEAMS.items():
        # From boxscore: find orgIds
        game_box = box[box["gameId"] == gid]
        for team_code in game_box["teamCode"].unique():
            org_ids = game_box[game_box["teamCode"] == team_code]["orgId"].unique()
            for org in org_ids:
                org_to_team[(gid, int(org))] = team_code

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
            if str(made).lower() in ("true", "1", "1.0"):
                return f"CANASTA-{int(pts)}P" if pts else "CANASTA-2P"
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
        if ac == "JB": return "JUMP-BALL"
        if ac == "JS": return "JUMP-BALL"
        return ac  # fallback

    rows = []
    num_accion = {}  # gameId → counter

    for _, r in pbp.iterrows():
        gid = int(r.gameId)
        local, visit = GAME_TEAMS[gid]
        num_accion[gid] = num_accion.get(gid, -1) + 1

        row_dict = r.to_dict()
        tipo = act_tipo(row_dict)

        # Equipo_lado
        org_id = r.orgId
        equipo_lado = None
        if pd.notna(org_id):
            tc = org_to_team.get((gid, int(org_id)))
            if tc:
                equipo_lado = "LOCAL" if tc == local else "VISITANTE"

        # Jugador y Dorsal
        pid = r.personId
        jugador = None
        dorsal = None
        if pd.notna(pid):
            pinfo = player_map.get(int(pid))
            if pinfo:
                fn, ln, dorsal = pinfo
                jugador = f"{ln}, {fn}"

        # p2Id para sustituciones (el otro jugador en CAMBIO)
        p2id = r.p2Id
        if pd.notna(p2id):
            pinfo2 = player_map.get(int(p2id))
            # p2 es el jugador que sale en CAMBIO-ENTRA (ya está en la otra fila)

        periodo = PERIOD_MAP.get(str(r.period), str(r.period))

        rows.append({
            "IdPartido": str(gid),
            "Fecha": GAME_DATES[gid],
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

    out_df = pd.DataFrame(rows)
    out_df.drop_duplicates(inplace=True)
    out_path = os.path.join(OUT, "argentina_formativas_pbp.csv")
    out_df.to_csv(out_path, index=False)
    print(f"PBP: {len(out_df)} filas → {out_path}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Transformando CSVs FIBA → formato Liga Nacional...")
    transform_boxscore()
    transform_shots()
    transform_pbp()
    print("Listo.")
