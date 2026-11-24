#!/usr/bin/env python3
from __future__ import annotations
"""
Liga Argentina Basketball - Shot Map Scraper

Usage:
    python shot_map_scraper.py               # Scrape all new games
    python shot_map_scraper.py --full        # Re-scrape everything
    python shot_map_scraper.py --dry-run     # List games, no fetch
"""

import json
import re
import sys
import time
import logging
import argparse
from pathlib import Path

import cloudscraper
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL   = "https://www.laliganacional.com.ar"
LEAGUE     = "/laligaargentina"

DOCS_DIR   = Path(__file__).parent.parent / "docs" / "liga_argentina"
INPUT_CSV  = DOCS_DIR / "liga_argentina.csv"
OUTPUT_CSV = DOCS_DIR / "liga_argentina_shots.csv"

DELAY   = 1.0
TIMEOUT = 30

CSV_COLUMNS = [
    "IdPartido", "Fecha", "Equipo_local", "Equipo_visitante",
    "Local", "Equipo", "Dorsal", "Periodo", "Tipo",
    "Resultado", "Zona", "Left_pct", "Top_pct",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
# Un mapa de tiros con menos de este % de los intentos del box se considera incompleto
SHOTS_MIN_RATIO = 0.9


def make_session():
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    s.headers.update({
        "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s


def get_html(session, url, referer=None):
    headers = {"Referer": referer} if referer else {}
    try:
        resp = session.get(url, timeout=TIMEOUT, headers=headers)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except Exception as e:
        log.warning(f"  Error GET {url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Scrape one game
# ---------------------------------------------------------------------------
def scrape_game(session, game_id: str, local: str, visitante: str) -> list[dict]:
    url = f"{BASE_URL}{LEAGUE}/partido/mapa-tiro/{game_id}"
    html = get_html(session, url)
    if not html:
        return []
    return parse_shots(html, game_id, local, visitante)


def parse_shots(html: str, game_id: str, local: str, visitante: str) -> list[dict]:
    # The shot data is embedded as a JS array: tiros = [...];
    m = re.search(r'\btiros\s*=\s*(\[.*?\]);', html, re.DOTALL)
    if not m:
        log.debug("  No tiros array found in HTML")
        return []

    try:
        shots = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        log.warning(f"  JSON parse error: {e}")
        return []

    rows = []
    for shot in shots:
        accion = shot.get("accion_tipo", "")

        # Made shots: CANASTA-2P, CANASTA-3P
        # Missed shots: TIRO2-FALLADO, TIRO3-FALLADO, TIRO1-FALLADO
        canasta_m = re.match(r'CANASTA-(\d)P', accion)
        fallado_m = re.match(r'(TIRO\d+)-FALLADO', accion)
        if canasta_m:
            tipo      = f'TIRO{canasta_m.group(1)}'
            resultado = 'CONVERTIDO'
        elif fallado_m:
            tipo      = fallado_m.group(1)
            resultado = 'FALLADO'
        else:
            continue

        pos_x = shot.get("posicion_x", "")
        pos_y = shot.get("posicion_y", "")
        left_m = re.search(r'([\d.]+)%', pos_x)
        top_m  = re.search(r'([\d.]+)%', pos_y)
        if not left_m or not top_m:
            continue

        is_local = shot.get("local", False)
        equipo   = local if is_local else visitante

        rows.append({
            "IdPartido":        game_id,
            "Fecha":            "",
            "Equipo_local":     local,
            "Equipo_visitante": visitante,
            "Local":            is_local,
            "Equipo":           equipo,
            "Dorsal":           shot.get("dorsal", ""),
            "Periodo":          shot.get("numero_periodo", ""),
            "Tipo":             tipo,
            "Resultado":        resultado,
            "Zona":             shot.get("zona", ""),
            "Left_pct":         float(left_m.group(1)),
            "Top_pct":          float(top_m.group(1)),
        })

    return rows


def sync_game_ids(df: pd.DataFrame, games: dict) -> tuple[pd.DataFrame, int]:
    """
    Alinea `IdPartido` de los tiros con el del CSV de stats (fila LOCAL TOTALES) por clave
    estable fecha|local|visitante. Los IDs del sitio son dinámicos: si los stats de un partido
    se re-scrapean después de sus tiros (boxes en curso / incompletos), el ID nuevo no cruza con
    el que quedó en este CSV. Devuelve (df, filas_modificadas).
    """
    if df.empty:
        return df, 0
    key = df["Fecha"].astype(str) + "|" + df["Equipo_local"].astype(str) + "|" + df["Equipo_visitante"].astype(str)
    want = key.map(lambda k: games[k]["game_id"] if k in games else None)
    diff = want.notna() & (want != df["IdPartido"].astype(str))
    if not diff.any():
        return df, 0
    df = df.copy()
    df.loc[diff, "IdPartido"] = want[diff]
    return df, int(diff.sum())


def count_out_of_range(rows: list[dict]) -> int:
    """Tiros con coordenadas fuera de la cancha (0-100%): la fuente trae mal el sistema de coordenadas de ese partido."""
    return sum(1 for r in rows if not (0 <= r["Left_pct"] <= 100 and 0 <= r["Top_pct"] <= 100))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full",    action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not INPUT_CSV.exists():
        log.warning(f"CSV no encontrado todavía: {INPUT_CSV} (temporada sin arrancar). Nada que hacer.")
        sys.exit(0)

    # Build game list from TOTALES rows usando clave estable fecha|local|visitante
    # (los IDs del sitio son dinámicos y cambian en cada request)
    df = pd.read_csv(INPUT_CSV, encoding="utf-8-sig")
    totales = df[df["Nombre completo"] == "TOTALES"]

    games: dict[str, dict] = {}  # key: "fecha|local|visitante"
    for _, row in totales.iterrows():
        if str(row.get("Condicion equipos", "")) == "LOCAL":
            key = f"{row['Fecha']}|{row['Equipo']}|{row['Rival']}"
            if key not in games:
                games[key] = {
                    "fecha": row["Fecha"],
                    "local": row["Equipo"],
                    "visitante": row["Rival"],
                    "game_id": str(row["IdPartido"]),
                }

    log.info(f"Total partidos: {len(games)}")

    # Intentos de campo (T2I+T3I) del box score por partido, para detectar mapas de
    # tiro guardados a medias (partido en curso al momento del scrape).
    box_fga: dict[str, int] = {}
    for _, row in totales.iterrows():
        is_loc = str(row.get("Condicion equipos", "")) == "LOCAL"
        k_ = (f"{row['Fecha']}|{row['Equipo']}|{row['Rival']}" if is_loc
              else f"{row['Fecha']}|{row['Rival']}|{row['Equipo']}")
        box_fga[k_] = box_fga.get(k_, 0) + int(row["T2I"]) + int(row["T3I"])

    # Cache: clave estable fecha|equipo_local|equipo_visitante desde el CSV de tiros
    cached_keys: set[str] = set()
    existing_df = None
    n_ids_fixed = 0
    if not args.full and OUTPUT_CSV.exists():
        existing_df = pd.read_csv(OUTPUT_CSV, encoding="utf-8-sig")
        for _, _r in existing_df.drop_duplicates(subset=["Fecha", "Equipo_local", "Equipo_visitante"]).iterrows():
            cached_keys.add(f"{_r['Fecha']}|{_r['Equipo_local']}|{_r['Equipo_visitante']}")
        log.info(f"Cache: {len(cached_keys)} partidos ya scrapeados")
        existing_df, n_ids_fixed = sync_game_ids(existing_df, games)
        if n_ids_fixed:
            log.info(f"IdPartido sincronizado con stats en {n_ids_fixed} filas de tiros")

    # Partidos cacheados cuyos tiros son claramente menos que los intentos del box
    # (< SHOTS_MIN_RATIO): se scrapearon incompletos y hay que rehacerlos. Se tolera
    # un desfase chico (el sitio a veces omite 1-2 tiros) para no re-scrapear siempre.
    old_shot_counts: dict[str, int] = {}
    if existing_df is not None and not existing_df.empty:
        _cnt = (existing_df[existing_df["Tipo"].isin(["TIRO2", "TIRO3"])]
                .groupby(["Fecha", "Equipo_local", "Equipo_visitante"]).size())
        old_shot_counts = {f"{f}|{l}|{v}": int(n) for (f, l, v), n in _cnt.items()}
    incomplete_keys = {
        k for k in games
        if k in cached_keys and box_fga.get(k, 0) > 0
        and old_shot_counts.get(k, 0) < SHOTS_MIN_RATIO * box_fga[k]
    }
    for k in sorted(incomplete_keys):
        log.info(f"  Tiros incompletos: {k} ({old_shot_counts.get(k, 0)} tiros vs {box_fga[k]} intentos en el box) -> se re-scrapea")
    # Sin intentos de campo en el box (ej. partido ganado por defecto) no hay mapa de tiros que scrapear
    new_game_keys = [k for k in games
                     if (k not in cached_keys or k in incomplete_keys) and box_fga.get(k, 0) > 0]
    log.info(f"A scrapear: {len(new_game_keys)} partidos")

    if args.dry_run:
        for k in new_game_keys:
            g = games[k]
            log.info(f"  {g['fecha']}  {g['local']} vs {g['visitante']}")
        return

    if not new_game_keys:
        log.info("Nada nuevo.")
        if existing_df is not None and n_ids_fixed:
            existing_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
            log.info(f"Guardado -> {OUTPUT_CSV} (solo IDs sincronizados)")
        return

    session  = make_session()
    new_rows = []
    replaced_keys: set[str] = set()

    for i, k in enumerate(new_game_keys, 1):
        g = games[k]
        log.info(f"[{i}/{len(new_game_keys)}] {g['fecha']}  {g['local']} vs {g['visitante']}")

        rows = scrape_game(session, g["game_id"], g["local"], g["visitante"])
        for r in rows:
            r["Fecha"] = g["fecha"]
        n_new = sum(1 for r in rows if r.get("Tipo") in ("TIRO2", "TIRO3"))
        n_oor = count_out_of_range(rows)
        if n_oor:
            log.warning(f"  -> {n_oor} tiros con coordenadas fuera de 0-100% (la fuente trae mal las coordenadas de este partido; no se corrigen)")
        if k in incomplete_keys and n_new < old_shot_counts.get(k, 0):
            # La fuente trae menos tiros que lo cacheado: se conserva lo viejo (sin duplicar).
            # Seguirá apareciendo como incompleto en cada corrida (sin estado extra).
            log.warning(f"  -> re-scrape trae {n_new} tiros TIRO2/3 < {old_shot_counts.get(k, 0)} cacheados; "
                        f"se conserva lo cacheado (la fuente no tiene el mapa completo)")
        else:
            new_rows.extend(rows)
            if k in incomplete_keys:
                replaced_keys.add(k)
            log.info(f"  -> {len(rows)} tiros")

        if i < len(new_game_keys):
            time.sleep(DELAY)

    # Merge and save
    new_df = pd.DataFrame(new_rows, columns=CSV_COLUMNS) if new_rows else pd.DataFrame(columns=CSV_COLUMNS)

    if existing_df is not None and not existing_df.empty:
        if replaced_keys:
            _rk = (existing_df["Fecha"].astype(str) + "|" + existing_df["Equipo_local"].astype(str)
                   + "|" + existing_df["Equipo_visitante"].astype(str))
            n_before = len(existing_df)
            existing_df = existing_df[~_rk.isin(replaced_keys)]
            log.info(f"Reemplazo: {n_before - len(existing_df)} tiros viejos de {len(replaced_keys)} partidos descartados")
        merged = pd.concat(
            [existing_df.astype(new_df.dtypes.to_dict(), errors="ignore"), new_df],
            ignore_index=True,
        )
    else:
        merged = new_df

    # Deduplicar por contenido del tiro (no por IdPartido, que es dinámico)
    before_dd = len(merged)
    merged = merged.drop_duplicates(
        subset=["Fecha", "Equipo_local", "Equipo_visitante", "Equipo", "Dorsal",
                "Periodo", "Tipo", "Resultado", "Left_pct", "Top_pct"],
        keep="last",
    )
    if len(merged) < before_dd:
        log.warning(f"drop_duplicates: eliminadas {before_dd - len(merged)} filas duplicadas")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    log.info(f"Guardado -> {OUTPUT_CSV}  ({len(merged)} tiros totales)")


if __name__ == "__main__":
    main()