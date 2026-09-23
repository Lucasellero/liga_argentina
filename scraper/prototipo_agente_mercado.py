"""
Prototipo local del "agente científico de datos" — piloto acotado al Mercado de
Pases (Liga Argentina + Liga Nacional), para validar calidad de respuesta y
costo por pregunta antes de construir la versión web (Vercel Function + chat UI).

v2: en vez de embeber el JSON completo en el system prompt y confiar en que el
modelo "lea" y cuente a mano (probado con Haiku: alucinó un campo directo y se
equivocó en conteos/listas por decenas de jugadores), el modelo ahora recibe
tools de filtrado exacto — Python puro, sin LLM de por medio en el cálculo — y
solo redacta sobre el resultado ya calculado.

No es producción: sin auth, sin streaming.

Requiere ANTHROPIC_API_KEY seteada en el entorno.

Uso:
    python3 scraper/prototipo_agente_mercado.py
    python3 scraper/prototipo_agente_mercado.py --pregunta "..."
    python3 scraper/prototipo_agente_mercado.py --model haiku
"""
import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path

from anthropic import Anthropic

ROOT = Path(__file__).resolve().parent.parent

MERCADO_FILES = {
    "liga_argentina": ROOT / "docs" / "liga_argentina" / "mercado.json",
    "liga_nacional": ROOT / "docs" / "liga_nacional" / "mercado.json",
}

MODELS = {
    "sonnet": "claude-sonnet-4-5",
    "haiku": "claude-haiku-4-5-20251001",
}

PRICING = {
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}

MAX_RESULTADOS = 60  # tope de filas devueltas por tool call, para no inflar tokens

SYSTEM_PROMPT = """Sos un analista de datos especializado en el Mercado de Pases de básquet \
de Liga Argentina y Liga Nacional (temporada 2025/26). Respondés preguntas de asistentes de \
equipos sobre altas, bajas, jugadores pretendidos y vacantes por puesto.

No tenés la data de memoria: usá SIEMPRE las tools (`buscar_jugadores`, `buscar_clubes`, \
`resumen_liga`) para cualquier pregunta que involucre contar, listar o filtrar jugadores/clubes. \
No inventes ni calcules números "de memoria" ni leyendo texto previo — si necesitás un dato, \
llamá a la tool correspondiente. Esto aplica también a cualquier cálculo secundario que decidas \
agregar por tu cuenta aunque no te lo hayan pedido explícitamente (ej. si mencionás cuántos son \
"renovación" vs. "nuevo fichaje" dentro de una respuesta, hacé esa distinción SIEMPRE con el \
parámetro `solo_nuevos` de `buscar_jugadores`, nunca leyendo `last_club` a ojo de una lista ya \
traída). Si una tool devuelve más resultados de los que muestra (`total` > cantidad de \
`jugadores` listados), decilo explícitamente en la respuesta.

Reglas de la data que tenés que conocer:
- Esta data proviene de un feed externo especializado en mercado de pases, no es información \
oficial de la liga — no la presentes como oficial. Nunca menciones el nombre de la fuente ni de \
ningún sitio externo en tus respuestas: referite a ella como "nuestra base de datos del mercado" \
o similar.
- `status`: confirmado (fichaje ya cerrado) | pretendido (interés, no cerrado) | se_queda \
(renovación) | se_va (confirmado que deja el club) | vacante (puesto que el club busca cubrir, \
NO es un jugador real, no tiene nombre).
- `confidence` (certeza, de mayor a menor): oficial > arreglo_verbal > muy_avanzado > interes > \
en_duda > se_cayo.
- `position`: base | escolta | alero | ala_pivote | pivote.
- `ficha_type`: mayor | u21 | juvenil | staff.
- Un jugador `status=confirmado` cuyo `last_club` es el mismo club al que ficha es una \
renovación, no un fichaje nuevo. `buscar_jugadores` ya devuelve esto calculado: cada jugador \
trae `es_renovacion` (true/false) y la respuesta trae `renovaciones`/`nuevos` con los conteos \
exactos. Usá siempre esos campos tal cual — nunca cuentes vos mismo leyendo `last_club` jugador \
por jugador, ni siquiera como aclaración de paso dentro de otra respuesta. Si además querés \
la lista filtrada a solo nuevos, pasá `solo_nuevos=true`.
- No hay datos de todos los equipos de Liga Argentina (la fuente no cubre a todos los clubes \
chicos) — si preguntan por un club que `buscar_clubes` no encuentra, decí que no está cubierto \
por esta base de datos, no asumas que no tiene movimientos.

Respondé en español, directo y conciso (2-4 oraciones salvo que pidan una lista explícita)."""

TOOLS = [
    {
        "name": "buscar_jugadores",
        "description": (
            "Filtra jugadores del mercado de pases de forma exacta. Devuelve el conteo total "
            "de matches, el desglose exacto renovaciones/nuevos ya calculado, y hasta 60 "
            "resultados (cada uno con su flag es_renovacion). Usar para cualquier pregunta de "
            "conteo, listado o filtrado de jugadores."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "liga": {"type": "string", "enum": ["liga_argentina", "liga_nacional", "ambas"]},
                "status": {"type": "string", "enum": ["confirmado", "pretendido", "se_queda", "se_va", "vacante"]},
                "position": {"type": "string", "enum": ["base", "escolta", "alero", "ala_pivote", "pivote"]},
                "confidence": {"type": "string", "enum": ["oficial", "arreglo_verbal", "muy_avanzado", "interes", "en_duda", "se_cayo"]},
                "ficha_type": {"type": "string", "enum": ["mayor", "u21", "juvenil", "staff"]},
                "club": {"type": "string", "description": "Nombre (parcial) del club actual del jugador"},
                "nombre": {"type": "string", "description": "Nombre (parcial) del jugador"},
                "solo_nuevos": {
                    "type": "boolean",
                    "description": "Si true, excluye renovaciones (last_club == club actual) entre los confirmados/se_queda",
                },
            },
            "required": ["liga"],
        },
    },
    {
        "name": "buscar_clubes",
        "description": "Filtra clubes por nombre, % de plantel armado o estado de mercado. Usar para preguntas sobre clubes (entrenador, pct armado, market_status).",
        "input_schema": {
            "type": "object",
            "properties": {
                "liga": {"type": "string", "enum": ["liga_argentina", "liga_nacional", "ambas"]},
                "nombre": {"type": "string"},
                "market_status": {"type": "string", "enum": ["abierto", "avanzado", "cerrado", "cerrado_reserva"]},
                "pct_max": {"type": "number", "description": "Solo clubes con pct <= este valor"},
                "pct_min": {"type": "number", "description": "Solo clubes con pct >= este valor"},
            },
            "required": ["liga"],
        },
    },
    {
        "name": "resumen_liga",
        "description": "Resumen agregado exacto de una liga: cantidad de clubes, de jugadores por status, promedio de pct armado, breakdown de market_status. Usar para preguntas de tipo 'resumen general' o 'estado del mercado'.",
        "input_schema": {
            "type": "object",
            "properties": {"liga": {"type": "string", "enum": ["liga_argentina", "liga_nacional", "ambas"]}},
            "required": ["liga"],
        },
    },
]


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


class Mercado:
    def __init__(self):
        self.data = {liga: json.loads(p.read_text(encoding="utf-8")) for liga, p in MERCADO_FILES.items()}
        self.club_name = {}  # (liga, club_id) -> nombre a mostrar (abreviatura LOGOS)
        self.club_raw_name = {}  # (liga, club_id) -> nombre tal cual lo escribe pickandroll
        for liga, d in self.data.items():
            for c in d["clubs"]:
                self.club_name[(liga, c["id"])] = c.get("team") or c["name"]
                self.club_raw_name[(liga, c["id"])] = c["name"]

    def _ligas(self, liga: str):
        return list(self.data.keys()) if liga == "ambas" else [liga]

    def buscar_jugadores(self, liga, status=None, position=None, confidence=None,
                          ficha_type=None, club=None, nombre=None, solo_nuevos=False):
        out = []
        for lg in self._ligas(liga):
            for p in self.data[lg]["players"]:
                if status and p["status"] != status:
                    continue
                if position and p["position"] != position:
                    continue
                if confidence and p.get("confidence") != confidence:
                    continue
                if ficha_type and p.get("ficha_type") != ficha_type:
                    continue
                club_nombre = self.club_name.get((lg, p["club_id"]), p["club_id"])
                club_raw = self.club_raw_name.get((lg, p["club_id"]), club_nombre)
                if club and _norm(club) not in _norm(club_nombre):
                    continue
                if nombre and _norm(nombre) not in _norm(p["name"]):
                    continue
                last_club_norm = _norm(p.get("last_club") or "")
                es_renovacion = bool(last_club_norm) and last_club_norm == _norm(club_raw)
                if solo_nuevos and es_renovacion:
                    continue
                out.append({
                    "liga": lg, "name": p["name"], "club": club_nombre, "position": p["position"],
                    "status": p["status"], "confidence": p.get("confidence"),
                    "ficha_type": p.get("ficha_type"), "age": p.get("age"), "height": p.get("height"),
                    "last_club": p.get("last_club"), "updated_at": p.get("updated_at"),
                    # Precalculado acá a propósito: no confiar en que el modelo lo infiera leyendo
                    # `last_club` a ojo (probado que se equivoca contando esto "a mano").
                    "es_renovacion": es_renovacion,
                })
        renovaciones = sum(1 for p in out if p["es_renovacion"])
        return {
            "total": len(out),
            "renovaciones": renovaciones,
            "nuevos": len(out) - renovaciones,
            "jugadores": out[:MAX_RESULTADOS],
        }

    def buscar_clubes(self, liga, nombre=None, market_status=None, pct_max=None, pct_min=None):
        out = []
        for lg in self._ligas(liga):
            for c in self.data[lg]["clubs"]:
                if nombre and _norm(nombre) not in _norm(c["name"]):
                    continue
                if market_status and c.get("market_status") != market_status:
                    continue
                if pct_max is not None and c.get("pct", 0) > pct_max:
                    continue
                if pct_min is not None and c.get("pct", 0) < pct_min:
                    continue
                out.append({
                    "liga": lg, "name": c.get("team") or c["name"], "pct": c.get("pct"),
                    "coach": c.get("coach"), "market_status": c.get("market_status"),
                    "target_mayor": c.get("target_mayor"), "target_u23": c.get("target_u23"),
                })
        return {"total": len(out), "clubes": out[:MAX_RESULTADOS]}

    def resumen_liga(self, liga):
        resumen = {}
        for lg in self._ligas(liga):
            d = self.data[lg]
            por_status = {}
            for p in d["players"]:
                por_status[p["status"]] = por_status.get(p["status"], 0) + 1
            por_market = {}
            pcts = []
            for c in d["clubs"]:
                por_market[c.get("market_status")] = por_market.get(c.get("market_status"), 0) + 1
                if c.get("pct") is not None:
                    pcts.append(c["pct"])
            resumen[lg] = {
                "updated_at": d["updated_at"],
                "total_clubes": len(d["clubs"]),
                "total_jugadores": len(d["players"]),
                "por_status": por_status,
                "por_market_status": por_market,
                "pct_promedio_plantel_armado": round(sum(pcts) / len(pcts), 1) if pcts else None,
            }
        return resumen


TOOL_IMPL = {
    "buscar_jugadores": Mercado.buscar_jugadores,
    "buscar_clubes": Mercado.buscar_clubes,
    "resumen_liga": Mercado.resumen_liga,
}

TEST_QUESTIONS = [
    "¿Qué bases están confirmados como refuerzo nuevo (no renovación) en Liga Argentina?",
    "¿Hay algún ala-pívot en Liga Nacional con status pretendido y confianza muy_avanzado?",
    "¿Qué club de Liga Argentina tiene el plantel menos armado (pct más bajo)?",
    "¿San Isidro tiene vacantes en alguna posición?",
    "Dame la lista de jugadores que se van (se_va) de Liga Nacional.",
    "¿Cuántos jugadores en total están con status confirmado en Liga Argentina?",
    "¿Quién es el entrenador de Riachuelo y qué porcentaje de plantel tiene armado?",
    "¿Hay pivots vacantes (puesto buscado, sin jugador) en Liga Argentina?",
    "¿Qué jugadores tienen confidence 'oficial' y status 'pretendido' en Liga Nacional? Eso suena contradictorio, avisame si no hay ninguno.",
    "Resumime en 3 líneas el estado general del mercado de Liga Argentina hoy.",
]

# Set de estrés — casos límite: nombres mal escritos, clubes no cubiertos por la fuente,
# preguntas ambiguas (sin liga), jugadores reales que no están en esta data, filtros que
# la tool no soporta directo (negación), nombres de club ambiguos entre ligas.
EDGE_QUESTIONS = [
    "¿Qué sabés de Nahuel Buchayot en San Isidro?",  # typo: Buchaillot
    "¿Qué jugadores tiene armados Lanús?",  # club no cubierto por pickandroll
    "¿Qué liga tiene mayor porcentaje promedio de plantel armado, Liga Argentina o Liga Nacional?",
    "¿Cómo está el mercado?",  # ambigua, no especifica liga
    "¿Hay novedades de Nicolás Laprovittola en el mercado?",  # jugador real, no está en esta data
    "Dame todos los jugadores confirmados de Liga Argentina que NO tengan confidence oficial.",  # negación, no soportada directo por la tool
    "¿Qué jugadores hay en el club Independiente?",  # nombre ambiguo: existe en LA y LN con sufijos distintos
    "Comparame la cantidad de fichajes confirmados entre San Isidro y Riachuelo.",
]


def preguntar(client: Anthropic, model: str, mercado: Mercado, pregunta: str):
    messages = [{"role": "user", "content": pregunta}]
    usages = []
    tool_calls_log = []

    while True:
        resp = client.messages.create(
            model=model, max_tokens=1024, system=SYSTEM_PROMPT, tools=TOOLS, messages=messages,
        )
        usages.append(resp.usage)

        if resp.stop_reason != "tool_use":
            texto = "".join(b.text for b in resp.content if b.type == "text")
            return texto, usages, tool_calls_log

        messages.append({"role": "assistant", "content": resp.content})
        tool_results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            fn = TOOL_IMPL[block.name]
            result = fn(mercado, **block.input)
            tool_calls_log.append((block.name, block.input, result.get("total")))
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, ensure_ascii=False),
            })
        messages.append({"role": "user", "content": tool_results})


def estimar_costo(model: str, usages) -> float:
    in_price, out_price = PRICING.get(model, (0.0, 0.0))
    costo = 0.0
    for u in usages:
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
        costo += (u.input_tokens * in_price + cache_read * in_price * 0.1 + cache_write * in_price * 1.25) / 1_000_000
        costo += u.output_tokens * out_price / 1_000_000
    return costo


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pregunta")
    parser.add_argument("--model", choices=list(MODELS), default="sonnet")
    parser.add_argument("--edge", action="store_true", help="Corre el set de casos límite en vez del set estándar")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Falta ANTHROPIC_API_KEY en el entorno.", file=sys.stderr)
        sys.exit(1)

    model = MODELS[args.model]
    client = Anthropic(api_key=api_key)
    mercado = Mercado()

    print(f"Modelo: {model} | Jugadores: LA={len(mercado.data['liga_argentina']['players'])} "
          f"LN={len(mercado.data['liga_nacional']['players'])}\n")
    print("=" * 80)

    if args.pregunta:
        preguntas = [args.pregunta]
    elif args.edge:
        preguntas = EDGE_QUESTIONS
    else:
        preguntas = TEST_QUESTIONS
    costo_total = 0.0

    for i, pregunta in enumerate(preguntas, 1):
        print(f"\n[{i}] PREGUNTA: {pregunta}")
        texto, usages, tool_calls_log = preguntar(client, model, mercado, pregunta)
        costo = estimar_costo(model, usages)
        costo_total += costo
        for name, inp, total in tool_calls_log:
            print(f"  → tool: {name}({inp}) => total={total}")
        print(f"RESPUESTA: {texto}")
        in_tot = sum(u.input_tokens for u in usages)
        out_tot = sum(u.output_tokens for u in usages)
        print(f"[llamadas API: {len(usages)} | tokens: in={in_tot} out={out_tot} | costo≈${costo:.4f}]")
        print("-" * 80)

    print(f"\nCosto total: ${costo_total:.4f} ({len(preguntas)} preguntas, "
          f"${costo_total / len(preguntas):.4f}/pregunta promedio)")


if __name__ == "__main__":
    main()
