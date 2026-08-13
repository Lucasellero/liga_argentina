"""
Fetch + agregación de datos de scouteado.com para el servidor MCP.

Los CSVs se leen en vivo desde https://scouteado.com/<liga>/<archivo> (los mismos
que sirve Vercel desde docs/). La agregación de stats replica la misma lógica que
usa el frontend (buildRAW_J / buildRAW_T, documentada en CLAUDE.md): PJ = partidos
con "Segundos jugados" > 0, promedios = total / PJ.

Los CSVs se sirven con Cache-Control: no-store (para que el dashboard siempre vea
datos frescos), pero el origin sí honra pedidos condicionales (ETag/If-None-Match):
un archivo sin cambios responde 304 con 0 bytes en vez de los ~300KB comprimidos
(2-4MB sin comprimir) que pesa cada CSV completo. Por eso el cache acá no es por
tiempo (TTL) sino por revalidación — siempre se pregunta al servidor, pero solo se
paga el download completo cuando el archivo realmente cambió (una vez al día para
los CSVs de stats, unas pocas veces al día para mercado.json).

El ETag se persiste en disco (mcp_server/.cache/data/), no solo en memoria: así,
aunque el community manager cierre y reabra Claude Desktop varias veces en el día
(cada reinicio = proceso nuevo), sigue revalidando contra el ETag guardado en vez
de volver a pagar la descarga completa desde cero.
"""
import io
import json
import os
import re
import unicodedata

import pandas as pd
import requests

BASE_URL = "https://scouteado.com"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "data")

LIGAS = {
    "liga_argentina": {"csv": "liga_argentina.csv", "label": "Liga Argentina"},
    "liga_nacional": {"csv": "liga_nacional.csv", "label": "Liga Nacional"},
}

# categoria -> (columna, tipo, mínimo de intentos para categorías de %)
CATEGORIAS = {
    "puntos": ("Puntos", "sum_per_game", None),
    "rebotes": ("TReb", "sum_per_game", None),
    "asistencias": ("Asistencias", "sum_per_game", None),
    "recuperos": ("Recuperos", "sum_per_game", None),
    "tapones": ("Tapones cometidos", "sum_per_game", None),
    "valoracion": ("Valoracion", "sum_per_game", None),
    "t2_pct": (("T2A", "T2I"), "pct", 30),
    "t3_pct": (("T3A", "T3I"), "pct", 20),
    "tl_pct": (("T1A", "T1I"), "pct", 15),
}

MIN_PJ_LEADERS = 5  # partidos mínimos para entrar al ranking de líderes

_mem_cache = {}  # (liga, filename) -> valor ya parseado, para esta corrida del proceso


def _norm(s):
    if not s:
        return ""
    s = re.sub(r"\([^)]*\)", "", str(s))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _disk_cache_paths(liga, filename):
    key = f"{liga}__{filename}".replace("/", "_")
    return (os.path.join(CACHE_DIR, key + ".etag"), os.path.join(CACHE_DIR, key + ".body"))


def _cached_get(liga, filename, parser):
    """GET con revalidación condicional en dos niveles:
    1) memoria del proceso — si ya se pidió este archivo en esta sesión, no vuelve
       a tocar la red.
    2) ETag persistido en disco — si no hay hit en memoria (proceso recién
       arrancado), manda el ETag de la última descarga; si el archivo no cambió,
       el servidor responde 304 sin body y se reusa el texto ya guardado en disco.
    Solo se paga la descarga completa cuando el archivo realmente cambió.
    `parser` recibe el texto de la respuesta (str), no el objeto Response.
    """
    key = (liga, filename)
    if key in _mem_cache:
        return _mem_cache[key]

    os.makedirs(CACHE_DIR, exist_ok=True)
    etag_path, body_path = _disk_cache_paths(liga, filename)

    headers = {}
    if os.path.isfile(etag_path):
        etag = open(etag_path, encoding="utf-8").read().strip()
        if etag:
            headers["If-None-Match"] = etag

    url = f"{BASE_URL}/{liga}/{filename}"
    resp = requests.get(url, headers=headers, timeout=20)

    if resp.status_code == 304 and os.path.isfile(body_path):
        text = open(body_path, encoding="utf-8").read()
    else:
        resp.raise_for_status()
        text = resp.text
        with open(body_path, "w", encoding="utf-8") as f:
            f.write(text)
        new_etag = resp.headers.get("ETag")
        if new_etag:
            with open(etag_path, "w", encoding="utf-8") as f:
                f.write(new_etag)

    value = parser(text)
    _mem_cache[key] = value
    return value


def _validate_liga(liga):
    if liga not in LIGAS:
        raise ValueError(f'Liga inválida: "{liga}". Usar una de: {list(LIGAS)}')


def stats_df(liga):
    _validate_liga(liga)
    return _cached_get(liga, LIGAS[liga]["csv"], lambda text: pd.read_csv(io.StringIO(text)))


def fetch_json(liga, filename):
    """Fetch de un JSON de scouteado.com con la misma revalidación condicional."""
    return _cached_get(liga, filename, json.loads)


def _round(v, nd=1):
    return None if v is None else round(float(v), nd)


def _pct(made, att):
    return _round(made / att * 100) if att else None


def _player_row_stats(sub):
    """sub: filas del CSV de un solo jugador (un equipo). Devuelve dict de stats."""
    pj = int((sub["Segundos jugados"] > 0).sum())
    n = pj or 1  # evita división por cero si por algún motivo PJ==0

    puntos = sub["Puntos"].sum()
    t2a, t2i = sub["T2A"].sum(), sub["T2I"].sum()
    t3a, t3i = sub["T3A"].sum(), sub["T3I"].sum()
    t1a, t1i = sub["T1A"].sum(), sub["T1I"].sum()
    dreb, oreb, treb = sub["DReb"].sum(), sub["OReb"].sum(), sub["TReb"].sum()
    ast, rec, per = sub["Asistencias"].sum(), sub["Recuperos"].sum(), sub["Perdidas"].sum()
    tap = sub["Tapones cometidos"].sum()
    val = sub["Valoracion"].sum()
    tci = t2i + t3i

    return {
        "pj": pj,
        "basicas": {
            "puntos_pp": _round(puntos / n),
            "rebotes_pp": _round(treb / n),
            "reb_ofensivo_pp": _round(oreb / n),
            "reb_defensivo_pp": _round(dreb / n),
            "asistencias_pp": _round(ast / n),
            "recuperos_pp": _round(rec / n),
            "perdidas_pp": _round(per / n),
            "tapones_pp": _round(tap / n),
            "valoracion_pp": _round(val / n),
            "t2": f"{int(t2a)}/{int(t2i)}", "t2_pct": _pct(t2a, t2i),
            "t3": f"{int(t3a)}/{int(t3i)}", "t3_pct": _pct(t3a, t3i),
            "tl": f"{int(t1a)}/{int(t1i)}", "tl_pct": _pct(t1a, t1i),
        },
        "avanzadas": {
            "efg_pct": _pct(t2a + 1.5 * t3a, tci),
            "ts_pct": _round(puntos / (2 * (tci + 0.44 * t1i)) * 100) if (tci + 0.44 * t1i) else None,
        },
    }


def stats_jugador(liga, nombre):
    """Busca jugador(es) por substring de nombre (sin distinguir acentos/mayúsculas)."""
    df = stats_df(liga)
    jugadores = df[df["Nombre completo"] != "TOTALES"].copy()
    q = _norm(nombre)
    mask = jugadores["Nombre completo"].apply(lambda s: q in _norm(s))
    matches = jugadores[mask]
    if matches.empty:
        return []

    resultados = []
    for (nombre_completo, equipo), sub in matches.groupby(["Nombre completo", "Equipo"]):
        stats = _player_row_stats(sub)
        resultados.append({
            "nombre": nombre_completo,
            "equipo": equipo,
            **stats,
        })
    resultados.sort(key=lambda r: r["basicas"]["puntos_pp"] or 0, reverse=True)
    return resultados


def stats_equipo(liga, nombre):
    """Busca equipo(s) por substring de nombre; agrega las filas TOTALES."""
    df = stats_df(liga)
    totales = df[df["Nombre completo"] == "TOTALES"].copy()
    q = _norm(nombre)
    mask = totales["Equipo"].apply(lambda s: q in _norm(s))
    matches = totales[mask]
    if matches.empty:
        return []

    resultados = []
    for equipo, sub in matches.groupby("Equipo"):
        pj = len(sub)
        ganados = int(sub["Ganado"].sum())
        perdidos = pj - ganados
        t2a, t2i = sub["T2A"].sum(), sub["T2I"].sum()
        t3a, t3i = sub["T3A"].sum(), sub["T3I"].sum()
        t1a, t1i = sub["T1A"].sum(), sub["T1I"].sum()

        # puntos recibidos: busca en el CSV la fila TOTALES del rival en la misma fecha
        opp_pts = []
        for _, row in sub.iterrows():
            rival_row = totales[(totales["Fecha"] == row["Fecha"]) & (totales["Equipo"] == row["Rival"])]
            if not rival_row.empty:
                opp_pts.append(rival_row.iloc[0]["Puntos"])
        pts_recibidos_pp = _round(sum(opp_pts) / len(opp_pts)) if opp_pts else None

        resultados.append({
            "equipo": equipo,
            "pj": pj,
            "ganados": ganados,
            "perdidos": perdidos,
            "puntos_pp": _round(sub["Puntos"].sum() / pj),
            "puntos_recibidos_pp": pts_recibidos_pp,
            "rebotes_pp": _round(sub["TReb"].sum() / pj),
            "asistencias_pp": _round(sub["Asistencias"].sum() / pj),
            "t2": f"{int(t2a)}/{int(t2i)}", "t2_pct": _pct(t2a, t2i),
            "t3": f"{int(t3a)}/{int(t3i)}", "t3_pct": _pct(t3a, t3i),
            "tl": f"{int(t1a)}/{int(t1i)}", "tl_pct": _pct(t1a, t1i),
        })
    return resultados


def lideres_liga(liga, categoria, n=5):
    if categoria not in CATEGORIAS:
        raise ValueError(f'Categoría inválida: "{categoria}". Usar una de: {list(CATEGORIAS)}')

    df = stats_df(liga)
    jugadores = df[df["Nombre completo"] != "TOTALES"]
    col, tipo, min_att = CATEGORIAS[categoria]

    filas = []
    for (nombre_completo, equipo), sub in jugadores.groupby(["Nombre completo", "Equipo"]):
        pj = int((sub["Segundos jugados"] > 0).sum())
        if pj < MIN_PJ_LEADERS:
            continue
        if tipo == "sum_per_game":
            valor = _round(sub[col].sum() / pj)
        else:
            made_col, att_col = col
            made, att = sub[made_col].sum(), sub[att_col].sum()
            if att < min_att:
                continue
            valor = _pct(made, att)
        if valor is None:
            continue
        filas.append({"jugador": nombre_completo, "equipo": equipo, "pj": pj, "valor": valor})

    filas.sort(key=lambda r: r["valor"], reverse=True)
    return filas[:n]
