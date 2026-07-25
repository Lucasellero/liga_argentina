"""
Scraper del Mercado de Pases en vivo de Liga Argentina.
Fuente: https://pickandroll.com.ar/mercado-vivo-liga-argentina/

La página embebe un blob JS `window.PNRMV_DATA = {...}` con clubes y jugadores.
Este script lo extrae, lo traduce a los nombres/logos usados en el dashboard
(docs/liga_argentina/logos/) y lo guarda en docs/liga_argentina/mercado.json.
"""
import json
import re
import sys
from datetime import datetime, timezone

import cloudscraper

SOURCE_URL = "https://pickandroll.com.ar/mercado-vivo-liga-argentina/"
OUT_PATH = "docs/liga_argentina/mercado.json"

# pickandroll club_id -> nombre de equipo tal como aparece en LOGOS (liga_argentina.js)
CLUB_ID_TO_TEAM = {
    "amancay": "AMANCAY (LR)",
    "barrio_parque": "BARRIO PARQUE",
    "bochas_sport_club": "BOCHAS (CC)",
    "centenario_vt": "CENTENARIO (VT)",
    "central_entrerriano": "CENTRAL ENTRERRIANO",
    "ciclista_juninense": "CICLISTA (J)",
    "comunicaciones": "COMUNICACIONES",
    "deportivo_norte": "DEP. NORTE",
    "deportivo_viedma": "DEP. VIEDMA",
    "estudiantes_tucuman": "ESTUDIANTES (T)",
    "gimnasia_lp": "GIMNASIA (LP)",
    "hindu_club": "HINDU (C)",
    "independiente_bbc": "INDEPENDIENTE (SDE)",
    "jujuy_basquet": "JUJUY BASQUET",
    "la_union_colon": "LA UNIÓN (C)",
    "pico_fc": "PICO F.C.",
    "provincial_rosario": "PROVINCIAL (R)",
    "quilmes_mdp": "QUILMES (MDP)",
    "racing_avellaneda": "RACING (A)",
    "rivadavia_mendoza": "RIVADAVIA (MZA)",
    "salta_basket": "SALTA BASKET",
    "san_isidro": "SAN ISIDRO",
    "santa_paula": "SANTA PAULA (G)",
    "sportivo_suardi": "SP. SUARDI",
    "tomas_de_rocamora": "ROCAMORA",
    "union_mdp": "UNION (MDP)",
    "villa_mitre": "VILLA MITRE (BB)",
    "villa_san_martin": "VILLA SAN MARTIN",
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
        if c.get("competition") != "LA" or not c.get("active"):
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

    club_ids_la = {c["id"] for c in clubs}
    players = []
    for p in raw.get("players", []):
        if p.get("competition") != "LA" or p.get("club_id") not in club_ids_la:
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
