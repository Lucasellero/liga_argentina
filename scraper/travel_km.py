#!/usr/bin/env python3
"""
Kilómetros viajados por equipo durante la temporada regular.
Liga Argentina y Liga Nacional — análisis por separado.

Incluye optimización de "Giras": si un equipo juega 2+ partidos de visitante
consecutivos con menos de 7 días de diferencia entre ellos (sin partido de local
en el medio), no regresa a su ciudad entre juegos.
  - Gira de 2: home → cityA → cityB → home
  - Partido suelto: home → city → home  (ida y vuelta simple)

Ejecutar desde la carpeta liga_argentina/:
    python travel_km.py
"""

import pandas as pd
from math import radians, sin, cos, sqrt, atan2

# ── Configuración ──────────────────────────────────────────────────────────────
CITIES_CSV = "docs/ciudades_equipos.csv"
GIRA_MAX_DAYS = 7  # días máximos entre dos partidos fuera para considerarlos gira

LIGAS = {
    "Liga Nacional": {
        "csv": "docs/liga_nacional/liga_nacional.csv",
        "liga_key": "liga_nacional",
        "cutoff": "2026-04-24",
    },
    "Liga Argentina": {
        "csv": "docs/liga_argentina/liga_argentina.csv",
        "liga_key": "liga_argentina",
        "cutoff": "2026-03-30",
    },
}

# ── Haversine ──────────────────────────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

# ── KM de un segmento de viaje (gira o partido suelto) ────────────────────────
def segment_km(home_lat, home_lon, city_coords):
    """
    Calcula km de un viaje que sale de home, visita cada ciudad en orden y vuelve.
    city_coords: lista de (lat, lon) en orden cronológico.
    """
    if not city_coords:
        return 0
    if len(city_coords) == 1:
        lat, lon = city_coords[0]
        return haversine_km(home_lat, home_lon, lat, lon) * 2

    # home → c1 → c2 → ... → cn → home
    prev_lat, prev_lon = home_lat, home_lon
    total = 0.0
    for lat, lon in city_coords:
        total += haversine_km(prev_lat, prev_lon, lat, lon)
        prev_lat, prev_lon = lat, lon
    total += haversine_km(prev_lat, prev_lon, home_lat, home_lon)
    return total

# ── Análisis ───────────────────────────────────────────────────────────────────
def analyze_liga(name, cfg, city_map, cities_df):
    df = pd.read_csv(cfg["csv"])

    # Solo filas TOTALES (una por equipo por partido)
    totales = df[df["Nombre completo"] == "TOTALES"].copy()

    # Filtrar temporada regular si hay fecha de corte
    totales["fecha_dt"] = pd.to_datetime(totales["Fecha"], format="%d/%m/%Y")
    if cfg["cutoff"]:
        cutoff = pd.Timestamp(cfg["cutoff"])
        totales = totales[totales["fecha_dt"] < cutoff]

    league_teams = set(cities_df[cities_df["liga"] == cfg["liga_key"]]["equipo"].tolist())
    stats = {t: {"km": 0, "home": 0, "away": 0, "giras": 0} for t in league_teams}
    unknown = set()

    for team in league_teams:
        if team not in city_map:
            unknown.add(team)
            continue

        home_lat, home_lon, _ = city_map[team]

        # Cronograma del equipo ordenado por fecha
        schedule = (
            totales[totales["Equipo"] == team]
            .sort_values("fecha_dt")
            .to_dict("records")
        )

        i = 0
        while i < len(schedule):
            game = schedule[i]

            # Partido de local: no genera km
            if game["Condicion equipos"] == "LOCAL":
                stats[team]["home"] += 1
                i += 1
                continue

            # Partido de visitante: intentar extender a gira
            rival = game["Rival"]
            if rival not in city_map:
                unknown.add(rival)
                stats[team]["away"] += 1
                i += 1
                continue

            # Acumular ciudades del segmento (gira o partido suelto)
            gira_games = [(game["fecha_dt"], rival)]

            j = i + 1
            while j < len(schedule):
                ng = schedule[j]
                if ng["Condicion equipos"] != "VISITANTE":
                    break  # partido de local corta la gira
                days_gap = (ng["fecha_dt"] - gira_games[-1][0]).days
                if days_gap >= GIRA_MAX_DAYS:
                    break  # demasiados días entre partidos
                next_rival = ng["Rival"]
                if next_rival not in city_map:
                    break  # ciudad desconocida, no extender
                gira_games.append((ng["fecha_dt"], next_rival))
                j += 1

            n = len(gira_games)
            coords = [city_map[r][:2] for _, r in gira_games]  # (lat, lon)
            km = segment_km(home_lat, home_lon, coords)

            stats[team]["km"] += round(km)
            stats[team]["away"] += n
            if n >= 2:
                stats[team]["giras"] += 1

            i = j  # avanzar más allá de todos los juegos de esta gira

    # Armar DataFrame
    rows_out = []
    for team, s in stats.items():
        _, _, ciudad = city_map.get(team, (None, None, "—"))
        total_games = s["home"] + s["away"]
        rows_out.append({
            "Equipo":            team,
            "Ciudad":            ciudad,
            "PJ":                total_games,
            "Local":             s["home"],
            "Visitante":         s["away"],
            "Giras":             s["giras"],
            "KM total":          s["km"],
            "KM/part. visit.":   round(s["km"] / s["away"]) if s["away"] else 0,
        })

    df_out = (
        pd.DataFrame(rows_out)
        .sort_values("KM total", ascending=False)
        .reset_index(drop=True)
    )
    df_out.index += 1

    # Imprimir resultado
    corte = f"corte: {cfg['cutoff']}" if cfg["cutoff"] else "temporada completa"
    sep = "=" * 78
    print(f"\n{sep}")
    print(f"  {name} — KM viajados en temporada regular ({corte})")
    print(f"  (Giras = viajes de 2+ partidos fuera consecutivos, <{GIRA_MAX_DAYS} días entre sí)")
    print(sep)
    print(df_out.to_string())

    total_km = df_out["KM total"].sum()
    print(f"\n  KM totales (todos los equipos): {total_km:,}")
    print(f"  Más viaja:  {df_out.iloc[0]['Equipo']} ({df_out.iloc[0]['KM total']:,} km)")
    print(f"  Menos viaja: {df_out.iloc[-1]['Equipo']} ({df_out.iloc[-1]['KM total']:,} km)")
    print(f"  Total giras detectadas: {df_out['Giras'].sum()}")

    if unknown:
        print(f"\n  ⚠  Equipos sin ciudad registrada (ignorados): {', '.join(sorted(unknown))}")

    return df_out

# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cities_df = pd.read_csv(CITIES_CSV)
    city_map = {
        row["equipo"]: (row["lat"], row["lng"], row["ciudad"])
        for _, row in cities_df.iterrows()
    }

    for name, cfg in LIGAS.items():
        analyze_liga(name, cfg, city_map, cities_df)

    print()
