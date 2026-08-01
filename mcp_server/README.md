# MCP de Scouteado

Servidor MCP para conectar **Claude Desktop** con la data en vivo de
[scouteado.com](https://scouteado.com) (Liga Argentina y Liga Nacional). Pensado para
que el community manager pueda preguntarle a Claude por stats de jugadores/equipos,
líderes de la liga, y generar placas de fichajes del Mercado de Pases — todo desde el
chat, sin depender de que alguien le pase los datos a mano.

No necesitás clonar todo el repo de datos ni mantenerlo actualizado: el servidor lee
en vivo desde `scouteado.com`, así que siempre ves lo último publicado.

## 1. Instalación

Requiere **Python 3.10 o superior** (`python3 --version` para chequear; si tenés una
versión más vieja, instalá una nueva desde [python.org](https://www.python.org/downloads/)).

Desde la carpeta `mcp_server/`:

```bash
pip3 install -r requirements.txt
python3 -m playwright install chromium   # solo necesario para generar placas
```

## 2. Conectar con Claude Desktop

Abrí (o creá) el archivo de configuración de Claude Desktop:

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Agregá esta entrada (ajustando la ruta a donde tengas este repo):

```json
{
  "mcpServers": {
    "scouteado": {
      "command": "python3",
      "args": ["/ruta/a/liga_argentina/mcp_server/server.py"]
    }
  }
}
```

Reiniciá Claude Desktop. Deberías ver "scouteado" en la lista de conectores/MCP
disponibles (ícono de herramientas en el chat).

## 3. Qué le podés preguntar

- *"¿Qué stats tiene Caffaro en Liga Nacional?"* → `buscar_jugador`
- *"Dame las stats de Quimsa esta temporada"* → `buscar_equipo`
- *"¿Quién lidera en rebotes en Liga Argentina?"* → `lideres_liga`
- *"Generame la placa del fichaje de Franco Balbi"* → `generar_placa_fichaje`
- *"Generá las placas de los fichajes confirmados de las últimas 48 horas en Liga Nacional"*
  → `generar_placa_fichaje` con ventana de horas

Las placas también se guardan en `mcp_server/placas_out/` por si las necesitás
descargar directo del disco.

## Notas técnicas

- Los tools de datos (`buscar_jugador`, `buscar_equipo`, `lideres_liga`) leen y
  agregan en vivo los CSVs públicos de `scouteado.com` (misma lógica de cálculo que
  el dashboard: PJ = partidos con minutos jugados, promedios = total/PJ). Cachean en
  memoria 10 minutos para no re-descargar en cada pregunta de una misma sesión.
- `generar_placa_fichaje` reusa el mismo template HTML que `/fichajes-placas`
  (`scraper/placa_common.py`), pero trae los assets (logos, foto del jugador) desde
  `scouteado.com` en vez de leerlos del repo local, porque este servidor corre en tu
  máquina sin el repo clonado.
- Solo hay Mercado de Pases (y por lo tanto placas de fichajes) en Liga Argentina y
  Liga Nacional — Liga Femenina y Liga de Desarrollo no están cubiertas por este MCP.
