"""
Scraper del Mercado de Pases en vivo de Liga Nacional.
Fuente: https://pickandroll.com.ar/mercado-vivo/

La página embebe un blob JS `window.PNRMV_DATA = {...}` con clubes y jugadores
(competition == "LNB"). Este script lo extrae, lo traduce a los nombres/logos
usados en el dashboard (docs/liga_nacional/logos/) y lo guarda en
docs/liga_nacional/mercado.json.
"""
import json
import re
import sys
from datetime import datetime, timezone

import cloudscraper

SOURCE_URL = "https://pickandroll.com.ar/mercado-vivo/"
OUT_PATH = "docs/liga_nacional/mercado.json"

# pickandroll club_id -> nombre de equipo tal como aparece en LOGOS (liga_nacional.js)
CLUB_ID_TO_TEAM = {
    "argentino_junin": "ARGENTINO (J)",
    "atenas": "ATENAS (C)",
    "boca": "BOCA",
    "ferro": "FERRO",
    "gimnasia_cr": "GIMNASIA (CR)",
    "independiente_o": "INDEPENDIENTE (O)",
    "instituto": "INSTITUTO",
    "la_union": "LA UNION FSA.",
    "obera": "OBERÁ",
    "olimpico": "OLÍMPICO (LB)",
    "penarol": "PEÑAROL (MDP)",
    "platense": "PLATENSE",
    "quimsa": "QUIMSA",
    "racing_ch": "RACING (CH)",
    "regatas": "REGATAS (C)",
    "san_lorenzo": "SAN LORENZO",
    "san_martin": "SAN MARTÍN (C)",
    "union_sf": "UNION (SF)",
    # "lanus" no matchea con ningún equipo de LOGOS (Liga Nacional 2025/26 no
    # incluye Lanús) -> se sirve sin logo (fallback de 3 letras en el frontend)
}


def fetch_pnrmv_data():
    scraper = cloudscraper.create_scraper()
    resp = scraper.get(SOURCE_URL, timeout=30)
    resp.raise_for_status()
    m = re.search(r"window\.PNRMV_DATA\s*=\s*(\{.*?\});", resp.text, re.S)
    if not m:
        raise RuntimeError("No se encontró window.PNRMV_DATA en la página fuente")
    return json.loads(m.group(1))


def transform(raw):
    clubs = []
    for c in raw.get("clubs", []):
        if c.get("competition") != "LNB" or not c.get("active"):
            continue
        team_name = CLUB_ID_TO_TEAM.get(c["id"])
        clubs.append({
            "id": c["id"],
            "name": c["name"],
            "team": team_name,  # None si no matchea con LOGOS -> frontend usa fallback
            "pct": c.get("pct", 0),
            "coach": c.get("coach", ""),
            "market_status": c.get("market_status", ""),
            "target_mayor": c.get("target_mayor", 0),
            "target_u23": c.get("target_u23", 0),
            "order": c.get("order", 0),
        })
    clubs.sort(key=lambda x: x["order"])

    club_ids_ln = {c["id"] for c in clubs}
    players = []
    for p in raw.get("players", []):
        if p.get("competition") != "LNB" or p.get("club_id") not in club_ids_ln:
            continue
        players.append({
            "id": p["id"],
            "club_id": p["club_id"],
            "name": p["name"],
            "position": p.get("position", ""),
            "ficha_type": p.get("ficha_type", ""),
            "status": p.get("status", ""),
            "confidence": p.get("confidence", ""),
            "age": p.get("age", ""),
            "height": p.get("height", ""),
            "last_club": p.get("last_club", ""),
            "source_type": p.get("source_type", ""),
            "image_url": p.get("image_url", ""),
            "updated_at": p.get("updated_at", ""),
        })

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE_URL,
        "clubs": clubs,
        "players": players,
        "statuses": raw.get("statuses", {}),
        "positions": raw.get("positions", {}),
        "ficha_types": raw.get("ficha_types", {}),
        "confidence_levels": raw.get("confidence_levels", {}),
        "market_statuses": raw.get("market_statuses", {}),
    }


def main():
    raw = fetch_pnrmv_data()
    data = transform(raw)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    unmatched = [c["name"] for c in data["clubs"] if not c["team"]]
    print(f"OK: {len(data['clubs'])} clubes, {len(data['players'])} jugadores -> {OUT_PATH}")
    if unmatched:
        print(f"Clubes sin match de logo (revisar CLUB_ID_TO_TEAM): {unmatched}", file=sys.stderr)


if __name__ == "__main__":
    main()
