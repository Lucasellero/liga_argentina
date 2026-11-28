#!/usr/bin/env python3
"""
Estadísticas en el clutch → docs/<liga>/clutch.json

Criterio NBA: últimos 5 minutos del 4.º cuarto y las prórrogas enteras, con una
diferencia de 5 puntos o menos ANTES de cada jugada (la situación puede entrar y
salir del clutch).

El marcador NO se toma de la columna Marcador_* del PBP: la fuente a veces inserta
jugadas fuera de orden con un marcador que no corresponde. Se ordena por reloj y se
reconstruye sumando las canastas. Un partido solo entra si el marcador reconstruido
coincide con el del box score.

Los jugadores se identifican por (fecha, equipo, dorsal) contra el CSV de stats,
así los nombres coinciden con los del dashboard.

Usage:
    python clutch_stats.py argentina
    python clutch_stats.py argentina --season 2025-26   # temporada archivada
    python clutch_stats.py argentina --pbp ruta/al/pbp.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

DOCS = Path(__file__).parent.parent / "docs"
LEAGUES = {"argentina": "liga_argentina", "nacional": "liga_nacional", "proximo": "liga_proximo",
           "femenina": "liga_femenina"}

WINDOW_SECS = 300    # últimos N segundos del 4.º cuarto
OT_SECS = 300        # las prórrogas cuentan enteras
MAX_MARGIN = 5
ASSIST_GAP_SECS = 10 # distancia máxima en el reloj entre una canasta y su asistencia
MIN_VALID_RATIO = 0.8  # con menos partidos válidos que esto no se pisa el JSON anterior

# (liga, temporada) -> primera fecha que cuenta. Mismo recorte que el dashboard:
# Femenina 2025/26 solo muestra la Segunda Vuelta (START_DATE en liga_femenina.js).
START_DATES = {("femenina", "2025-26"): "09/01/2026"}

# Tipo de evento -> contadores que suma
EVENTS = {
    "CANASTA-1P": {"pts": 1, "tlc": 1, "tli": 1},
    "CANASTA-2P": {"pts": 2, "t2c": 1, "t2i": 1},
    "CANASTA-3P": {"pts": 3, "t3c": 1, "t3i": 1},
    "TIRO1-FALLADO": {"tli": 1},
    "TIRO2-FALLADO": {"t2i": 1},
    "TIRO3-FALLADO": {"t3i": 1},
    "REBOTE-DEFENSIVO": {"rd": 1},
    "REBOTE-OFENSIVO": {"ro": 1},
    "ASISTENCIA": {"ast": 1},
    "RECUPERACION": {"rec": 1},
    "PERDIDA": {"per": 1},
}
STAT_KEYS = ["pts", "t2c", "t2i", "t3c", "t3i", "tlc", "tli", "rd", "ro", "ast", "rec", "per"]


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def norm(name: str) -> str:
    """Clave de equipo sin tildes, puntos ni espacios (la fuente varía la grafía)."""
    return "".join(c for c in unicodedata.normalize("NFD", name or "") if c.isalnum()).upper()


def to_int(value) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def clock_secs(value: str) -> int | None:
    """'MM:SS' restante -> segundos."""
    parts = (value or "").split(":")
    if len(parts) < 2:
        return None
    m, s = to_int(parts[0]), to_int(parts[1])
    return None if m is None or s is None else m * 60 + s


def load_box(rows: list[dict]):
    """games[key] -> info del box; roster[(fecha, equipo, dorsal)] -> nombre."""
    games, points, roster = {}, {}, {}
    for r in rows:
        team = norm(r["Equipo"])
        if r["Nombre completo"] == "TOTALES":
            points[(r["Fecha"], team)] = to_int(r["Puntos"])
            if r["Condicion equipos"] == "LOCAL":
                games[(r["Fecha"], team, norm(r["Rival"]))] = {
                    "fecha": r["Fecha"], "LOCAL": r["Equipo"], "VISITANTE": r["Rival"],
                }
        elif (to_int(r["Segundos jugados"]) or 0) > 0:
            dorsal = to_int(r["Número Camiseta"])
            key = (r["Fecha"], team, dorsal)
            # Dos jugadores con minutos y el mismo dorsal: no se puede saber cuál es
            roster[key] = None if key in roster and roster[key] != r["Nombre completo"] else r["Nombre completo"]
    for (fecha, loc, vis), g in games.items():
        g["final"] = (points.get((fecha, loc)), points.get((fecha, vis)))
    return games, roster


def ordered_plays(events: list[dict]) -> list[tuple[int, int, int, dict]]:
    """(periodo, segundos_restantes, num, fila) en orden de juego."""
    plays = []
    for r in events:
        if r["Tipo"] not in EVENTS or r["Equipo_lado"] not in ("LOCAL", "VISITANTE"):
            continue
        period, left = to_int(r["Periodo"]), clock_secs(r["Tiempo"])
        if period is None or left is None:
            continue
        plays.append((period, left, to_int(r["NumAccion"]) or 0, r))
    plays.sort(key=lambda p: (p[0], -p[1], p[2]))
    return plays


def dorsal_map(events: list[dict]) -> dict[tuple[str, str], int]:
    """(lado, nombre en el PBP) -> dorsal. La fuente solo informa el dorsal en cambios
    y rebotes; el resto de las jugadas de ese jugador se resuelven con este mapa."""
    seen = defaultdict(Counter)
    for r in events:
        dorsal = to_int(r["Dorsal"])
        if dorsal is not None and (r["Jugador"] or "").strip():
            seen[(r["Equipo_lado"], r["Jugador"])][dorsal] += 1
    return {k: v.most_common(1)[0][0] for k, v in seen.items()}


def analyze_game(plays):
    """Devuelve (marcador_final, jugadas_clutch, segundos_clutch)."""
    score = {"LOCAL": 0, "VISITANTE": 0}
    clutch, secs = [], 0
    last_basket = {}  # lado -> (periodo, segundos, ¿fue en clutch?) de su última canasta
    last_period = max([p[0] for p in plays] + [4])
    by_period = defaultdict(list)
    for p in plays:
        by_period[p[0]].append(p)

    for period in range(1, last_period + 1):
        window = 0 if period < 4 else (WINDOW_SECS if period == 4 else OT_SECS)
        clock = window
        for _, left, _, row in by_period[period]:
            side = row["Equipo_lado"]
            close = abs(score["LOCAL"] - score["VISITANTE"]) <= MAX_MARGIN
            in_window = period >= 4 and left <= window
            is_clutch = in_window and close
            if in_window:
                if close:
                    secs += max(clock - left, 0)
                clock = min(clock, left)
            # La fuente anota la asistencia DESPUÉS de la canasta (con el marcador ya
            # cambiado): cuenta como clutch si lo fue la canasta que asistió.
            if row["Tipo"] == "ASISTENCIA":
                basket = last_basket.get(side)
                if basket and basket[0] == period and 0 <= basket[1] - left <= ASSIST_GAP_SECS:
                    is_clutch = basket[2]
            if is_clutch:
                clutch.append(row)
            made = EVENTS[row["Tipo"]].get("pts", 0)
            if made > 1:
                last_basket[side] = (period, left, is_clutch)
            score[side] += made
        # Tramo desde la última jugada hasta la chicharra
        if period >= 4 and abs(score["LOCAL"] - score["VISITANTE"]) <= MAX_MARGIN:
            secs += clock
    return (score["LOCAL"], score["VISITANTE"]), clutch, secs


def build(box_rows: list[dict], pbp_rows: list[dict]) -> tuple[dict, list[str]]:
    games, roster = load_box(box_rows)
    pbp = defaultdict(list)
    for r in pbp_rows:
        pbp[(r["Fecha"], norm(r["Equipo_local"]), norm(r["Equipo_visitante"]))].append(r)

    players: dict[tuple, Counter] = defaultdict(Counter)
    player_games: dict[tuple, set] = defaultdict(set)
    teams: dict[str, Counter] = defaultdict(Counter)
    warnings, valid, expected, clutch_games, unmatched = [], 0, 0, 0, 0

    for key, game in sorted(games.items()):
        final = game["final"]
        if final[0] is None or final[1] is None or 0 in final:
            continue  # ganado por defecto o box incompleto
        expected += 1
        label = f"{game['fecha']} {game['LOCAL']} vs {game['VISITANTE']}"
        if key not in pbp:
            warnings.append(f"Sin jugada a jugada: {label}")
            continue
        rebuilt, clutch, secs = analyze_game(ordered_plays(pbp[key]))
        if rebuilt != final:
            warnings.append(f"Marcador del PBP {rebuilt} != box {final}: {label}")
            continue
        valid += 1
        if not clutch:
            continue
        clutch_games += 1

        dorsals = dorsal_map(pbp[key])
        side_stats = {"LOCAL": Counter(), "VISITANTE": Counter()}
        for row in clutch:
            side = row["Equipo_lado"]
            inc = EVENTS[row["Tipo"]]
            side_stats[side].update(inc)
            if not (row["Jugador"] or "").strip():
                continue  # rebote o pérdida de equipo
            team = game[side]
            name = roster.get((game["fecha"], norm(team), dorsals.get((side, row["Jugador"]))))
            if not name:
                unmatched += 1
                continue
            players[(name, team)].update(inc)
            player_games[(name, team)].add(key)

        for i, side in enumerate(("LOCAL", "VISITANTE")):
            other = "VISITANTE" if side == "LOCAL" else "LOCAL"
            own, opp = side_stats[side], side_stats[other]
            t = teams[game[side]]
            t["pj"] += 1
            t["g" if final[i] > final[1 - i] else "p"] += 1
            t["secs"] += secs
            for k in STAT_KEYS:
                t[k] += own[k]
                t["opp_" + k] += opp[k]

    if unmatched:
        warnings.append(f"{unmatched} jugadas clutch sin jugador identificado por dorsal")

    data = {
        "criterio": {"ventana_seg": WINDOW_SECS, "margen": MAX_MARGIN, "prorroga": "entera"},
        "partidos": {"total": expected, "validos": valid, "clutch": clutch_games},
        "jugadores": [
            {"nombre": n, "equipo": e, "pj": len(player_games[(n, e)]), **{k: c[k] for k in STAT_KEYS}}
            for (n, e), c in sorted(players.items())
        ],
        "equipos": [
            {"equipo": e, "pj": c["pj"], "g": c["g"], "p": c["p"], "secs": c["secs"],
             **{k: c[k] for k in STAT_KEYS},
             **{"opp_" + k: c["opp_" + k] for k in STAT_KEYS}}
            for e, c in sorted(teams.items())
        ],
    }
    return data, warnings


def main() -> None:
    parser = argparse.ArgumentParser(description="Estadísticas en el clutch")
    parser.add_argument("liga", choices=LEAGUES)
    parser.add_argument("--season", default=None,
                        help="Temporada archivada (ej. 2025-26): lee y escribe en archive/<temporada>/")
    parser.add_argument("--pbp", default=None, help="Ruta alternativa al CSV de jugada a jugada")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    slug = LEAGUES[args.liga]
    season_dir = DOCS / slug / "archive" / args.season if args.season else DOCS / slug
    box_path = season_dir / f"{slug}.csv"
    pbp_path = Path(args.pbp) if args.pbp else season_dir / f"{slug}_pbp.csv"
    output = Path(args.output) if args.output else season_dir / "clutch.json"

    if not box_path.exists() or not pbp_path.exists():
        print(f"Falta {box_path if not box_path.exists() else pbp_path}: no se actualiza {output.name}")
        return

    box_rows = read_csv(box_path)
    start = START_DATES.get((args.liga, args.season))
    if start:
        day = lambda s: datetime.strptime(s, "%d/%m/%Y")
        box_rows = [r for r in box_rows if day(r["Fecha"]) >= day(start)]

    data, warnings = build(box_rows, read_csv(pbp_path))
    if start:
        data["desde"] = start
    for w in warnings:
        print(f"AVISO  {w}")
    p = data["partidos"]
    print(f"Partidos válidos: {p['validos']}/{p['total']} · con clutch: {p['clutch']} · "
          f"jugadores: {len(data['jugadores'])} · equipos: {len(data['equipos'])}")

    if p["total"] and p["validos"] < p["total"] * MIN_VALID_RATIO:
        print("ERROR: demasiados partidos sin PBP válido; se conserva el JSON anterior")
        sys.exit(1)

    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Escrito {output} ({output.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
