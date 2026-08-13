"""
Servidor MCP de Scouteado — data de Liga Argentina y Liga Nacional en vivo,
para uso desde Claude Desktop (community manager).

Transporte: stdio (Claude Desktop lo levanta como subproceso).

Correr a mano para debug:
    python3 mcp_server/server.py
"""
import platform
import subprocess
import sys

from mcp.server.mcpserver import Image, MCPServer

import data
import placas

mcp = MCPServer("scouteado")

LIGAS_TXT = '"liga_argentina" o "liga_nacional"'

# Cuántas placas se devuelven como imagen inline en el chat por llamada. Los
# clientes MCP tienen un límite de tamaño por respuesta de tool (~1MB); con esto
# nos aseguramos de no pasarnos aunque se pida un batch grande de fichajes -- el
# resto de las placas se generan y guardan igual, solo que se listan por ruta.
MAX_PLACAS_INLINE = 6


def _reveal_in_file_manager(path):
    """Abre el Finder/Explorer con el archivo seleccionado, para que sea fácil
    arrastrarlo/copiarlo. Best-effort: si falla o el SO no es Mac/Windows, no hace
    nada (la placa ya quedó guardada en disco de cualquier forma)."""
    try:
        system = platform.system()
        if system == "Darwin":
            subprocess.run(["open", "-R", path], check=False, timeout=5)
        elif system == "Windows":
            subprocess.run(["explorer", "/select,", path], check=False, timeout=5)
    except Exception:
        pass


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
    """Genera placa(s) de Instagram Story (1080x1920) para fichajes del Mercado de
    Pases, con la identidad visual de Scouteado. liga debe ser """ + LIGAS_TXT + """
    (Mercado de Pases solo existe en esas dos ligas).
    Sin `jugador`: genera una placa por cada fichaje CONFIRMADO actualizado en las
    últimas `horas` horas (default 24). Con `jugador`: genera la placa de ese
    jugador puntual, ignorando la ventana de horas.
    Devuelve una vista previa de cada placa en el chat y, en texto, la ruta en
    disco del archivo PNG a resolución completa (1080x1920, listo para postear) —
    ese es el que hay que usar para subir a Instagram, la vista previa del chat
    está reducida para no superar el límite de tamaño de la respuesta."""
    try:
        resultados = placas.generar_placa_fichaje(liga, jugador, horas)
    except ValueError as e:
        return [f"Error: {e}"]
    if not resultados:
        return [f"Sin fichajes confirmados en las últimas {horas:.0f}hs para {liga}."]

    contenido = []
    for r in resultados[:MAX_PLACAS_INLINE]:
        contenido.append(Image(data=r["preview_bytes"], format="jpeg"))

    rutas = "\n".join(f'• {r["nombre"]}: {r["path"]}' for r in resultados)
    resumen = f'{len(resultados)} placa(s) generada(s) en calidad completa:\n{rutas}'
    if len(resultados) > MAX_PLACAS_INLINE:
        resumen += (f'\n\n(se muestran {MAX_PLACAS_INLINE} vistas previas arriba; '
                    f'el resto están guardadas en disco en las rutas de la lista)')
    contenido.append(resumen)

    _reveal_in_file_manager(resultados[0]["path"])

    return contenido


if __name__ == "__main__":
    print("Iniciando servidor MCP de Scouteado (stdio)...", file=sys.stderr)
    mcp.run(transport="stdio")
