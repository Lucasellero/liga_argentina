#!/usr/bin/env python3
"""
Generador de recaps automáticos por partido.

Lee el CSV de stats + el CSV de PBP de una liga, arma un resumen de hechos
compacto por partido (marcador, goleadores, rachas, cambios de líder, cierre)
y le pide a Claude Haiku que escriba un recap de 2-3 párrafos en español.

Incrementalidad: usa la misma clave estable "fecha|local|visitante" que el
resto de los scrapers (los IdPartido del sitio son dinámicos, ver CLAUDE.md
"IDs dinámicos del sitio"). Solo genera recaps para partidos que todavía no
están en el JSON de salida.

Usage:
    python scraper/recap_generator.py --liga liga_argentina
    python scraper/recap_generator.py --liga liga_nacional
    python scraper/recap_generator.py --liga liga_argentina --full
"""

from __future__ import annotations

import os
import sys
import json
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 450

PROMPT_TEMPLATE = """Sos un cronista deportivo de básquet argentino. Te paso un JSON con los \
hechos de un partido ya jugado. Escribí un recap de 2 a 3 párrafos en español, tono de \
crónica deportiva, directo y sin relleno.

Reglas estrictas:
- Usá ÚNICAMENTE los datos del JSON. No inventes jugadores, cifras ni jugadas que no estén ahí.
- Si falta algún dato (por ejemplo, no hay racha o no hay datos de cierre), simplemente no lo menciones.
- No uses markdown, ni títulos, ni bullets. Texto corrido en párrafos.

Hechos del partido:
{facts}
"""


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generador de recaps automáticos")
    parser.add_argument("--liga", required=True, choices=["liga_argentina", "liga_nacional"])
    parser.add_argument("--full", action="store_true", help="Regenerar todos los recaps")
    parser.add_argument("--limit", type=int, default=None, help="Máximo de recaps nuevos a generar en esta corrida")
    return parser


# ---------------------------------------------------------------------------
# Paso 1 — claves estables + incrementalidad
# ---------------------------------------------------------------------------
def build_game_index(stats_csv: Path) -> dict[str, dict]:
    """Clave 'fecha|local|visitante' -> datos básicos del partido (una entrada por partido)."""
    df = pd.read_csv(stats_csv, encoding="utf-8-sig")
    totales = df[df["Nombre completo"] == "TOTALES"]

    games: dict[str, dict] = {}
    for _, row in totales.iterrows():
        if str(row.get("Condicion equipos", "")) == "LOCAL":
            key = f"{row['Fecha']}|{row['Equipo']}|{row['Rival']}"
            if key not in games:
                games[key] = {
                    "fecha": row["Fecha"],
                    "local": row["Equipo"],
                    "visitante": row["Rival"],
                }
    return games


def load_existing_recaps(output_json: Path) -> dict:
    if output_json.exists():
        try:
            return json.loads(output_json.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning(f"No se pudo leer {output_json}, se arranca desde cero: {e}")
    return {}


# ---------------------------------------------------------------------------
# Paso 2 — extracción de hechos
# ---------------------------------------------------------------------------
def _team_totals(df: pd.DataFrame, fecha: str, equipo: str, rival: str, condicion: str) -> pd.Series | None:
    mask = (
        (df["Fecha"] == fecha)
        & (df["Nombre completo"] == "TOTALES")
        & (df["Equipo"] == equipo)
        & (df["Rival"] == rival)
        & (df["Condicion equipos"] == condicion)
    )
    rows = df[mask]
    return rows.iloc[0] if not rows.empty else None


def _top_scorers(df: pd.DataFrame, fecha: str, equipo: str, rival: str, condicion: str, n: int = 2) -> list[dict]:
    mask = (
        (df["Fecha"] == fecha)
        & (df["Nombre completo"] != "TOTALES")
        & (df["Equipo"] == equipo)
        & (df["Rival"] == rival)
        & (df["Condicion equipos"] == condicion)
    )
    rows = df[mask].sort_values("Puntos", ascending=False).head(n)
    return [
        {
            "jugador": r["Nombre completo"],
            "pts": int(r["Puntos"]) if pd.notna(r["Puntos"]) else 0,
            "reb": int(r["TReb"]) if pd.notna(r.get("TReb")) else 0,
            "ast": int(r["Asistencias"]) if pd.notna(r.get("Asistencias")) else 0,
        }
        for _, r in rows.iterrows()
    ]


def _pbp_insights(pbp_df: pd.DataFrame | None, fecha: str, local: str, visitante: str) -> dict:
    """Racha más grande, cambios de líder, mayor diferencia y resumen de cierre.

    Defensivo: si no hay filas de PBP para esta clave, devuelve un dict vacío
    en vez de fallar — el recap se genera igual solo con marcador + goleadores.
    """
    if pbp_df is None:
        return {}

    mask = (
        (pbp_df["Fecha"] == fecha)
        & (pbp_df["Equipo_local"] == local)
        & (pbp_df["Equipo_visitante"] == visitante)
    )
    game = pbp_df[mask]
    if game.empty:
        return {}

    game = game.sort_values("NumAccion")
    scoring = game[game["Tipo"].astype(str).str.startswith("CANASTA-")].copy()
    if scoring.empty:
        return {}

    scoring["Marcador_local"] = pd.to_numeric(scoring["Marcador_local"], errors="coerce")
    scoring["Marcador_visitante"] = pd.to_numeric(scoring["Marcador_visitante"], errors="coerce")
    scoring = scoring.dropna(subset=["Marcador_local", "Marcador_visitante"])
    if scoring.empty:
        return {}

    prev_local, prev_visit = 0, 0
    run_team, run_pts = None, 0
    best_run_team, best_run_pts, best_run_when = None, 0, None
    lead_changes = 0
    prev_sign = 0
    max_diff, max_diff_team, max_diff_when = 0, None, None

    for _, ev in scoring.iterrows():
        cur_local, cur_visit = int(ev["Marcador_local"]), int(ev["Marcador_visitante"])
        d_local, d_visit = cur_local - prev_local, cur_visit - prev_visit
        scorer = local if d_local > 0 else (visitante if d_visit > 0 else None)

        if scorer:
            if scorer == run_team:
                run_pts += max(d_local, d_visit)
            else:
                run_team, run_pts = scorer, max(d_local, d_visit)
            if run_pts > best_run_pts:
                best_run_pts, best_run_team = run_pts, run_team
                best_run_when = f"P{ev['Periodo']} {ev['Tiempo']}"

        diff = cur_local - cur_visit
        sign = (diff > 0) - (diff < 0)
        if sign != 0 and prev_sign != 0 and sign != prev_sign:
            lead_changes += 1
        if sign != 0:
            prev_sign = sign

        if abs(diff) > max_diff:
            max_diff = abs(diff)
            max_diff_team = local if diff > 0 else visitante
            max_diff_when = f"P{ev['Periodo']} {ev['Tiempo']}"

        prev_local, prev_visit = cur_local, cur_visit

    insights: dict = {}
    if best_run_pts >= 6:
        insights["mayor_racha"] = {"equipo": best_run_team, "puntos": best_run_pts, "momento": best_run_when}
    insights["cambios_de_lider"] = lead_changes
    if max_diff_team:
        insights["mayor_diferencia"] = {"equipo": max_diff_team, "puntos": max_diff, "momento": max_diff_when}

    # Cierre: últimos 2 minutos del último período jugado, solo si el partido fue cerrado
    final_diff = abs(int(scoring.iloc[-1]["Marcador_local"]) - int(scoring.iloc[-1]["Marcador_visitante"]))
    if final_diff <= 8:
        last_period = scoring["Periodo"].max()

        def _secs_left(tiempo: str) -> int:
            try:
                m, s = tiempo.split(":")
                return int(m) * 60 + int(s)
            except Exception:
                return 999

        clutch = scoring[(scoring["Periodo"] == last_period) & (scoring["Tiempo"].apply(_secs_left) <= 120)]
        if not clutch.empty:
            insights["cierre_ajustado"] = {
                "diferencia_final": final_diff,
                "canastas_ultimos_2min": len(clutch),
            }

    return insights


def build_recap_facts(stats_df: pd.DataFrame, pbp_df: pd.DataFrame | None, key: str, game: dict) -> dict | None:
    fecha, local, visit = game["fecha"], game["local"], game["visitante"]

    local_totals = _team_totals(stats_df, fecha, local, visit, "LOCAL")
    visit_totals = _team_totals(stats_df, fecha, visit, local, "VISITANTE")
    if local_totals is None or visit_totals is None:
        log.warning(f"  Sin TOTALES completos para {key}, se salta.")
        return None

    pts_local, pts_visit = int(local_totals["Puntos"]), int(visit_totals["Puntos"])

    facts = {
        "fecha": fecha,
        "local": local,
        "visitante": visit,
        "resultado": f"{local} {pts_local} - {pts_visit} {visit}",
        "ganador": local if pts_local > pts_visit else visit,
        "goleadores_local": _top_scorers(stats_df, fecha, local, visit, "LOCAL"),
        "goleadores_visitante": _top_scorers(stats_df, fecha, visit, local, "VISITANTE"),
    }
    facts.update(_pbp_insights(pbp_df, fecha, local, visit))
    return facts


# ---------------------------------------------------------------------------
# Paso 3 — generación con Claude Haiku
# ---------------------------------------------------------------------------
def generate_text(client, facts: dict) -> str | None:
    prompt = PROMPT_TEMPLATE.format(facts=json.dumps(facts, ensure_ascii=False, indent=2))
    for attempt in range(2):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text.strip()
        except Exception as e:
            log.warning(f"  Error llamando a Claude (intento {attempt + 1}/2): {e}")
            if attempt == 0:
                time.sleep(3)
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    args = build_arg_parser().parse_args()
    liga = args.liga

    docs_dir = Path(__file__).parent.parent / "docs" / liga
    stats_csv = docs_dir / f"{liga}.csv"
    pbp_csv = docs_dir / f"{liga}_pbp.csv"
    output_json = docs_dir / "recaps.json"

    if not stats_csv.exists():
        log.error(f"CSV de stats no encontrado: {stats_csv}")
        sys.exit(1)

    games = build_game_index(stats_csv)
    log.info(f"Total partidos en {liga}: {len(games)}")

    existing = {} if args.full else load_existing_recaps(output_json)
    new_keys = [k for k in games if k not in existing]
    log.info(f"Recaps ya generados: {len(existing)} · A generar: {len(new_keys)}")

    if not new_keys:
        log.info("Nada nuevo.")
        return

    if args.limit:
        new_keys = new_keys[: args.limit]
        log.info(f"Limitado a {len(new_keys)} por --limit")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY no está seteada — no se puede generar ningún recap. Se reintenta en la próxima corrida.")
        return

    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)

    stats_df = pd.read_csv(stats_csv, encoding="utf-8-sig")
    pbp_df = None
    if pbp_csv.exists():
        try:
            pbp_df = pd.read_csv(pbp_csv, encoding="utf-8-sig")
        except Exception as e:
            log.warning(f"No se pudo leer el PBP ({pbp_csv}): {e} — recaps sin datos de racha/cierre.")

    generated = 0
    for i, key in enumerate(new_keys, 1):
        game = games[key]
        log.info(f"[{i}/{len(new_keys)}] {game['fecha']}  {game['local']} vs {game['visitante']}")

        facts = build_recap_facts(stats_df, pbp_df, key, game)
        if facts is None:
            continue

        texto = generate_text(client, facts)
        if texto is None:
            log.warning(f"  Se saltea {key} (falla la API, se reintenta la próxima corrida)")
            continue

        existing[key] = {
            "texto": texto,
            "generado_en": datetime.now(timezone.utc).isoformat(),
        }
        generated += 1

    output_json.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Guardado -> {output_json}  ({generated} recaps nuevos, {len(existing)} totales)")


if __name__ == "__main__":
    main()
