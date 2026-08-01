"""
Servidor MCP de Scouteado — data de Liga Argentina y Liga Nacional en vivo,
para uso desde Claude Desktop (community manager).

Transporte: stdio (Claude Desktop lo levanta como subproceso).

Correr a mano para debug:
    python3 mcp_server/server.py
"""
import sys

from mcp.server.mcpserver import Image, MCPServer

import data
import placas

mcp = MCPServer("scouteado")

LIGAS_TXT = '"liga_argentina" o "liga_nacional"'


@mcp.tool()
def buscar_jugador(liga: str, nombre: str) -> dict:
    """Busca un jugador por nombre (parcial, sin distinguir mayúsculas/acentos) en
    Liga Argentina o Liga Nacional y devuelve sus stats de temporada regular:
    básicas (puntos, rebotes, asistencias, recuperos, tapones, valoración, % de tiro)
    y avanzadas (EFG%, TS%). liga debe ser """ + LIGAS_TXT + """.
    Si hay más de un jugador que matchea, devuelve todos (ej. mismo apellido)."""
    try:
        resultados = data.stats_jugador(liga, nombre)
    except ValueError as e:
        return {"error": str(e)}
    if not resultados:
        return {"error": f'No se encontró ningún jugador que matchee "{nombre}" en {liga}.'}
    return {"jugadores": resultados}


@mcp.tool()
def buscar_equipo(liga: str, nombre: str) -> dict:
    """Busca un equipo por nombre (parcial) en Liga Argentina o Liga Nacional y
    devuelve sus stats de temporada regular: PJ, ganados/perdidos, puntos a favor
    y en contra por partido, rebotes, asistencias, % de tiro. liga debe ser """ + LIGAS_TXT + """."""
    try:
        resultados = data.stats_equipo(liga, nombre)
    except ValueError as e:
        return {"error": str(e)}
    if not resultados:
        return {"error": f'No se encontró ningún equipo que matchee "{nombre}" en {liga}.'}
    return {"equipos": resultados}


@mcp.tool()
def lideres_liga(liga: str, categoria: str, n: int = 5) -> dict:
    """Top N de líderes estadísticos de la liga en una categoría, considerando solo
    jugadores con al menos 5 partidos jugados. liga debe ser """ + LIGAS_TXT + """.
    categoria debe ser una de: "puntos", "rebotes", "asistencias", "recuperos",
    "tapones", "valoracion" (promedio por partido), o "t2_pct", "t3_pct", "tl_pct"
    (porcentaje de tiro, con un mínimo de intentos en la temporada para evitar
    outliers de muestra chica)."""
    try:
        resultados = data.lideres_liga(liga, categoria, n)
    except ValueError as e:
        return {"error": str(e)}
    return {"liga": liga, "categoria": categoria, "lideres": resultados}


@mcp.tool()
def generar_placa_fichaje(liga: str, jugador: str | None = None, horas: float = 24.0) -> list:
    """Genera placa(s) de Instagram Story (1080x1920 PNG) para fichajes del Mercado
    de Pases, con la identidad visual de Scouteado. liga debe ser """ + LIGAS_TXT + """
    (Mercado de Pases solo existe en esas dos ligas).
    Sin `jugador`: genera una placa por cada fichaje CONFIRMADO actualizado en las
    últimas `horas` horas (default 24). Con `jugador`: genera la placa de ese
    jugador puntual, ignorando la ventana de horas. Devuelve las imágenes generadas
    (visibles en el chat) y también las guarda en mcp_server/placas_out/."""
    try:
        resultados = placas.generar_placa_fichaje(liga, jugador, horas)
    except ValueError as e:
        return [f"Error: {e}"]
    if not resultados:
        return [f"Sin fichajes confirmados en las últimas {horas:.0f}hs para {liga}."]

    return [Image(data=r["bytes"], format="png") for r in resultados]


if __name__ == "__main__":
    print("Iniciando servidor MCP de Scouteado (stdio)...", file=sys.stderr)
    mcp.run(transport="stdio")
