# Claude Scouting — Proceso de Generación de Informes (NBA-Grade)

Guía para generar scouting reports al nivel de un asistente de la NBA para series de playoffs de la Liga Argentina.
Cada informe se entrega como archivo **Word (.docx)** con gráficos embebidos generados con matplotlib.

---

## Archivos de datos

| Archivo | Descripción | Filas aprox. |
|---|---|---|
| `liga_argentina/docs/liga_argentina.csv` | Box scores por jugador y totales de equipo | 14.000+ |
| `liga_argentina/docs/liga_argentina_shots.csv` | Ubicación y resultado de cada tiro | 72.000+ |
| `liga_argentina/docs/liga_argentina_pbp.csv` | Play-by-play acción por acción | 321.000+ |

**Python a usar:** `/Library/Developer/CommandLineTools/usr/bin/python3`
**Dependencias:** `python-docx matplotlib seaborn numpy pandas`
→ instalar con `pip3 install python-docx matplotlib seaborn numpy pandas`

---

## Columnas clave

### liga_argentina.csv
- `Apellido == 'TOTALES'` → fila de totales de equipo (una por equipo por partido)
- `Apellido != 'TOTALES'` → filas de jugadores individuales
- `Etapa` → `'regular'` o `'post-temporada'`
- `Condicion equipos` → `'LOCAL'` o `'VISITANTE'`
- `Ganado` → booleano (True/False)
- `IdPartido` → clave para cruzar datasets

### liga_argentina_shots.csv
- `Zona` → formato `Z1-DE`, `Z1-IZ`, `Z11-DE`, etc.
  - Pintura/Corto: prefijo Z1–Z5
  - Medio Rango: prefijo Z6–Z10
  - Triple: prefijo Z11–Z14
- `Resultado` → `'CONVERTIDO'` o `'FALLADO'`
- `Tipo` → `'TIRO2'` o `'TIRO3'`
- `Dorsal` → número de camiseta (mapear a nombres via box score)

### liga_argentina_pbp.csv
- `Tipo` → `CANASTA-1P`, `CANASTA-2P`, `CANASTA-3P`, `TIRO-FALLADO-*`, `REBOTE-*`, `ASISTENCIA`, `PERDIDA`, etc.
- `Equipo_lado` → `'LOCAL'` o `'VISITANTE'`
- `Equipo_local` / `Equipo_visitante` → nombres de equipo del partido
- `Periodo` → 1, 2, 3, 4
- `Minuto` / `Segundo` → tiempo del evento (para splits de clutch, parciales por cuarto, etc.)

---

## Métricas a calcular

### Básicas
```python
# EFG% (Effective Field Goal)
EFG = (T2A + 1.5 * T3A) / (T2I + T3I)

# TS% (True Shooting)
TS = (T2A*2 + T3A*3 + T1A) / (2 * (T2I + T3I + 0.44 * T1I))

# AST/TOV
AST_TOV = Asistencias / Perdidas

# Per 40 minutos
stat_per40 = (stat_total / minutos_totales) * 40

# Foul trouble (% juegos con 4+ faltas)
foul_pct = juegos_con_4_mas_F / total_juegos * 100
```

### Avanzadas (nivel NBA)
```python
# Usage Rate — % de posesiones usadas por el jugador mientras está en cancha
# Approx: (T2I + T3I + 0.44*T1I + TOV) / possessions_while_on_court * 100
USG = ((T2I + T3I) + 0.44 * T1I + TOV) / (MIN / 40 * team_possessions) * 100

# Offensive Rating (ORTG) — puntos anotados por 100 posesiones del equipo
ORTG = (pts_equipo / posesiones_equipo) * 100

# Defensive Rating (DRTG) — puntos recibidos por 100 posesiones del equipo
DRTG = (pts_rival / posesiones_rival) * 100

# Net Rating
NET = ORTG - DRTG

# Pace — posesiones por 40 minutos
# posesiones ≈ T2I + T3I + 0.44*T1I + TOV - OREB_rival
PACE = posesiones / (minutos_jugados / 40)

# Assist Rate — % de canastas del equipo asistidas mientras el jugador está en cancha
AST_RATE = AST / (T2A + T3A) * 100  # individual

# TOV% — % de posesiones que terminan en pérdida
TOV_PCT = TOV / (T2I + T3I + 0.44 * T1I + TOV) * 100

# Rebote Ofensivo % y Defensivo %
OREB_PCT = OREB / (OREB + rival_DREB) * 100
DREB_PCT = DREB / (DREB + rival_OREB) * 100

# Points per Possession (PPP) por tipo de acción (desde PBP)
PPP_transition = pts_transition / posesiones_transition
PPP_halfcourt = pts_halfcourt / posesiones_halfcourt

# Clutch stats: últimos 5 min del Q4 con diferencia ≤ 5 pts
# Filtrar PBP: Periodo==4, tiempo_restante<=5min, abs(marcador_dif)<=5

# Rendimiento en Q4 (scoring run / cierre de partidos)
Q4_scoring = pts_Q4_equipo vs pts_Q4_rival   # desde PBP

# Puntos desde pintura / Puntos desde triples / Puntos en transición
# Puntos de segunda oportunidad (tras rebote ofensivo)
# Puntos tras pérdida del rival (fastbreak)
```

---

## Visualizaciones a generar (guardar como PNG y embeber en .docx)

### 1. Shot Chart (Mapa de tiros) por equipo
```python
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from matplotlib.patches import Circle, Rectangle, Arc
from io import BytesIO

def draw_court(ax, color='black', lw=1.5):
    """Cancha NBA-style en coordenadas reales (pies o zonas normalizadas)."""
    # Tablero y aro
    ax.add_patch(Rectangle((-3, -1), 6, 0.1, linewidth=lw, color=color, fill=False))
    ax.add_patch(Circle((0, 0), 0.75, linewidth=lw, color=color, fill=False))
    # Zona restringida
    ax.add_patch(Arc((0, 0), 4, 4, theta1=0, theta2=180, linewidth=lw, color=color))
    # Pintura
    ax.add_patch(Rectangle((-8, -1), 16, 19, linewidth=lw, color=color, fill=False))
    ax.add_patch(Rectangle((-6, -1), 12, 19, linewidth=lw, color=color, fill=False))
    # Línea de tiro libre
    ax.add_patch(Arc((0, 18), 12, 12, theta1=0, theta2=180, linewidth=lw, color=color))
    # Semicírculo triple
    ax.add_patch(Arc((0, 0), 47.5, 47.5, theta1=22, theta2=158, linewidth=lw, color=color))
    # Líneas de esquina triple
    ax.plot([-23.75, -23.75], [-1, 7.5], linewidth=lw, color=color)
    ax.plot([23.75, 23.75], [-1, 7.5], linewidth=lw, color=color)
    ax.set_xlim(-27, 27)
    ax.set_ylim(-2, 47.5)
    ax.set_aspect('equal')
    ax.axis('off')

def plot_shot_chart(shots_df, team_name, title_suffix="Temporada Regular"):
    """
    Hexbin shot chart con eficiencia por zona.
    shots_df debe tener columnas: x_coord, y_coord, Resultado
    Si las coordenadas no existen, usar zonas (Z1-Z14) para colorear polígonos.
    """
    fig, ax = plt.subplots(figsize=(8, 7.5))
    draw_court(ax)

    made = shots_df[shots_df['Resultado'] == 'CONVERTIDO']
    missed = shots_df[shots_df['Resultado'] == 'FALLADO']

    ax.scatter(missed['x'], missed['y'], c='#E74C3C', alpha=0.4, s=12, label='Fallado')
    ax.scatter(made['x'], made['y'], c='#27AE60', alpha=0.6, s=16, label='Convertido')

    ax.set_title(f"{team_name} — Shot Chart ({title_suffix})", fontsize=13, fontweight='bold', pad=10)
    ax.legend(loc='upper right', fontsize=8)
    return fig

def plot_zone_chart(zone_stats, team_name):
    """
    Mapa de zonas con eficiencia coloreada (heatmap por zona).
    zone_stats: dict {zona: {'fg_pct': float, 'attempts': int}}
    Colorear zonas de Z1–Z14 en gradiente rojo (frío) a verde (caliente).
    """
    fig, ax = plt.subplots(figsize=(8, 7.5))
    draw_court(ax)

    # Coordenadas centrales aproximadas por zona para anotar
    ZONE_CENTERS = {
        'Z1': (0, 5), 'Z2': (-5, 8), 'Z3': (5, 8),
        'Z4': (-9, 12), 'Z5': (9, 12),
        'Z6': (0, 15), 'Z7': (-12, 10), 'Z8': (12, 10),
        'Z9': (-15, 20), 'Z10': (15, 20),
        'Z11': (0, 28), 'Z12': (-20, 22), 'Z13': (20, 22),
        'Z14-IZ': (-24, 5), 'Z14-DE': (24, 5),
    }

    cmap = plt.cm.RdYlGn
    for zona, stats in zone_stats.items():
        pct = stats.get('fg_pct', 0)
        att = stats.get('attempts', 0)
        center = ZONE_CENTERS.get(zona.split('-')[0], None)
        if center and att > 0:
            color = cmap(pct)
            circle = Circle(center, 2.5, color=color, alpha=0.75, zorder=2)
            ax.add_patch(circle)
            ax.text(center[0], center[1]+0.5, f"{pct:.0%}", ha='center', va='center',
                    fontsize=8, fontweight='bold', zorder=3)
            ax.text(center[0], center[1]-1.2, f"{att} att", ha='center', va='center',
                    fontsize=6.5, color='#333333', zorder=3)

    ax.set_title(f"{team_name} — Eficiencia por Zona", fontsize=13, fontweight='bold')
    return fig
```

### 2. Radar Chart — Perfil de jugador
```python
def plot_player_radar(player_stats, player_name, team_color='#1A237E'):
    """
    Spider chart con 8 dimensiones normalizadas contra el promedio de la liga.
    Dimensiones: PPG, EFG%, TS%, USG%, AST/TOV, REB/40, STL/40, BLK/40
    Valores normalizados 0–1 contra el rango de la liga (percentil).
    """
    categories = ['PPG', 'EFG%', 'TS%', 'USG%', 'AST/TOV', 'REB/40', 'STL/40', 'BLK/40']
    N = len(categories)
    values = [player_stats[c] for c in categories]  # valores ya normalizados (0–1)
    values += values[:1]  # cerrar polígono

    angles = [n / float(N) * 2 * np.pi for n in range(N)]
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(5, 5), subplot_kw=dict(polar=True))
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, fontsize=9)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.25, 0.5, 0.75])
    ax.set_yticklabels(['25', '50', '75'], fontsize=7, color='grey')
    ax.plot(angles, values, color=team_color, linewidth=2)
    ax.fill(angles, values, color=team_color, alpha=0.25)
    ax.set_title(player_name, fontsize=11, fontweight='bold', pad=15)
    return fig
```

### 3. Tendencia de forma reciente
```python
def plot_recent_form(game_log, team_name, team_color):
    """
    Línea de puntos anotados y recibidos en los últimos 10 partidos.
    Barras verticales coloreadas (verde=victoria, rojo=derrota).
    game_log: lista de dicts {fecha, pts_favor, pts_contra, ganado}
    """
    fig, ax = plt.subplots(figsize=(10, 4))
    games = game_log[-10:]
    x = range(len(games))

    for i, g in enumerate(games):
        color = '#27AE60' if g['ganado'] else '#E74C3C'
        ax.bar(i, max(g['pts_favor'], g['pts_contra']) + 5, color=color, alpha=0.15)

    ax.plot(x, [g['pts_favor'] for g in games], 'o-', color=team_color, lw=2, ms=7, label='Pts anotados')
    ax.plot(x, [g['pts_contra'] for g in games], 's--', color='#888', lw=2, ms=6, label='Pts recibidos')

    ax.set_xticks(list(x))
    ax.set_xticklabels([f"J{i+1}\n{g.get('rival_short','')}" for i, g in enumerate(games)], fontsize=8)
    ax.set_ylabel('Puntos')
    ax.set_title(f"{team_name} — Forma Reciente (últimos 10)", fontsize=11, fontweight='bold')
    ax.legend(fontsize=9)
    ax.grid(axis='y', alpha=0.3)
    fig.tight_layout()
    return fig
```

### 4. Distribución de puntos por tipo de acción
```python
def plot_scoring_breakdown(team_breakdown, team_name, team_color):
    """
    Barras apiladas: Puntos desde pintura / Triples / TL / MR / Transición.
    """
    categories = ['Pintura', 'Triples', 'Tiros Libres', 'Medio Rango', 'Transición']
    values = [team_breakdown.get(c, 0) for c in categories]
    colors = ['#1A237E', '#F57F17', '#B71C1C', '#4CAF50', '#7B1FA2']

    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(categories, values, color=colors, edgecolor='white', linewidth=0.5)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                f'{val:.1f}', ha='center', va='bottom', fontsize=9, fontweight='bold')
    ax.set_ylabel('Puntos por partido')
    ax.set_title(f"{team_name} — Origen de puntos (PPG)", fontsize=11, fontweight='bold')
    ax.grid(axis='y', alpha=0.3)
    fig.tight_layout()
    return fig
```

### 5. Scoring por cuarto (Q1–Q4) comparativo
```python
def plot_quarter_scoring(team_a_qtrs, team_b_qtrs, name_a, name_b, color_a, color_b):
    """
    Barras agrupadas Q1–Q4 para ambos equipos.
    """
    quarters = ['Q1', 'Q2', 'Q3', 'Q4']
    x = np.arange(len(quarters))
    width = 0.35

    fig, ax = plt.subplots(figsize=(7, 4))
    ax.bar(x - width/2, team_a_qtrs, width, label=name_a, color=color_a, alpha=0.85)
    ax.bar(x + width/2, team_b_qtrs, width, label=name_b, color=color_b, alpha=0.85)

    ax.set_xticks(x)
    ax.set_xticklabels(quarters)
    ax.set_ylabel('Puntos promedio')
    ax.set_title('Scoring por Cuarto', fontsize=11, fontweight='bold')
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    fig.tight_layout()
    return fig
```

### 6. Lineup analysis — Top 5-man units
```python
def plot_lineup_table(lineups, team_name):
    """
    Top 5 lineups más usados con MIN, ORTG, DRTG, NET.
    lineups: lista de dicts {jugadores: str, min: float, ortg, drtg, net}
    Renderizar como tabla con color en NET (verde>0, rojo<0).
    """
    # Generar como tabla en el Word con colores — no como figura matplotlib
    pass
```

---

## Función para embeber gráficos en Word
```python
def fig_to_docx(doc, fig, width_inches=6.0):
    """Guarda figura matplotlib en buffer y la inserta en el documento."""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    doc.add_picture(buf, width=Inches(width_inches))
    plt.close(fig)
```

---

## Estructura del informe (12 secciones — NBA-Grade)

### PORTADA
- Logo / nombre de la serie
- Subtítulo: "Scouting Report — Playoffs Liga Argentina 2026"
- Fecha de generación
- "CONFIDENCIAL — Solo uso interno"

---

### I. Resumen Ejecutivo
Tabla comparativa de alto nivel:

| Métrica | Equipo A | Equipo B |
|---|---|---|
| Record (Reg.) | | |
| PPG / PA | | |
| EFG% / opp EFG% | | |
| TS% | | |
| ORTG / DRTG / NET | | |
| Pace | | |
| AST/TOV | | |
| OREB% | | |
| STL/g / BLK/g | | |
| Record Local | | |
| Record Visitante | | |
| Último 10 | | |
| H2H Temporada Regular | | |

- Narrativa de 3–4 líneas sobre el matchup principal
- Head-to-head directo de temporada regular con resultados y stats clave por partido

---

### II. Identidad de Juego y Estilo Ofensivo

**2.1 Distribución de tiros por zona** → *gráfico: Zone Chart para cada equipo*
- Tabla: zona, freq%, FG%, puntos por intento (PPI = FG% × valor_tiro)
- Comparar con promedio de la liga: ¿Por encima o por debajo en eficiencia?

**2.2 Origen de puntos por partido** → *gráfico: Scoring Breakdown barras*
- Pintura | Triples | Tiros Libres | Medio Rango | Transición
- Incluir % canastas asistidas vs. autocreadas

**2.3 Scoring por cuarto Q1–Q4** → *gráfico: Quarter Scoring comparativo*
- Identificar cuartos de dominio y cuartos débiles de cada equipo
- Parciales de 1ra mitad vs 2da mitad

**2.4 Pace y estilo de juego**
- Pace: posesiones por 40 min
- % posesiones en transición vs. half-court
- Preferencia de inicio de ataque: PnR / post-up / aislamiento / juego de equipo

**2.5 Situaciones especiales**
- Clutch stats: últimos 5 min Q4 con ≤5 de diferencia (ORTG, DRTG, EFG%, TOV%)
- Late & Close: record en partidos cerrados al inicio del Q4 (≤8 pts)

---

### III. Análisis de Jugadores — Equipo A

Por cada jugador con ≥10 MIN promedio, presentar:

**Línea 1 — Box score clásico:**
| Jugador | MIN | PPG | T2% (I/A) | T3% (I/A) | T1% | EFG% | TS% | AST | TOV | REB | STL | BLK | FC | VAL |

**Línea 2 — Avanzado:**
| Jugador | USG% | AST/TOV | TOV% | OREB% | DREB% | Per-40 PTS | Per-40 REB | Per-40 AST | Foul% (4+FC) |

**Línea 3 — Zonas:**
| Jugador | PTS Pintura (I/A/%) | PTS MR (I/A/%) | PTS Triple (I/A/%) | TL (I/A/%) |

**Radar chart** → *gráfico embebido por jugador (5+ MIN/g o rotación clave)*

**Nota Scout NBA-style** (3–4 líneas por jugador):
```
FORTALEZA PRINCIPAL: ...
TENDENCIA: 1ra mitad de temporada (X PPG, Y EFG%) vs 2da mitad (X' PPG, Y' EFG%)
DEBILIDAD EXPLOTABLE: ...
CÓMO DEFENDERLO: ...
```

---

### IV. Análisis de Jugadores — Equipo B
Misma estructura que sección III.

---

### V. Análisis Defensivo

**5.1 Métricas defensivas de equipo**
- DRTG, Opp EFG%, Opp TS%, Opp OREB%, STL/g, BLK/g, Fouls forzados/g

**5.2 ¿Cómo defienden?**
- ¿Presionan o esperan? (robo % de tiro vs robo % de transición)
- ¿Cómo defienden el PnR? (switch / drop / hedge — inferir desde PBP)
- Frecuencia de rotaciones (BLK en zona de pintura vs. perímetro)

**5.3 Vulnerabilidades defensivas**
- Zonas donde el rival convierte mejor contra ellos
- Jugadores que cometen más faltas y cuándo (1ra mitad vs Q4)
- Tabla: foul trouble por jugador — juegos con 4+ FC y impacto en MIN

---

### VI. Análisis Táctico Profundo

**6.1 Matchup table posición por posición**
Tabla con ventaja (▲/▼/=) por categoría: PPG, EFG%, REB, AST, DEF

**6.2 La guerra de triples**
- Equipo A: X triples intentados/partido × Y% = Z puntos esperados/partido
- Equipo B: X' triples intentados/partido × Y'% = Z' puntos esperados/partido
- Análisis: ¿Cuál equipo gana si el ritmo de triples es alto / bajo?

**6.3 Juego interior — La pintura**
- Intentos desde pintura por partido y % conversión
- ¿Quién domina el rebote ofensivo? (OREB% y segundas oportunidades)
- Puntos de segunda oportunidad por partido

**6.4 Turnovers y transición**
- TOV/g de cada equipo, TOV%, AST/TOV
- Puntos en transición (fast break pts/g)
- Jugadores con mayor TOV/g (vulnerabilidades de presión)

**6.5 Foul trouble**
- Top 3 jugadores por foul rate en cada equipo
- Impacto proyectado en minutos en playoffs (partidos más físicos)

**6.6 Lineup analysis — Top 5-man units**
- Top 3 lineups más usados por equipo: MIN, ORTG, DRTG, NET Rating
- Tablas coloreadas: NET > 0 en verde, NET < 0 en rojo

---

### VII. Shot Charts — Visual

*Sección visual dedicada — una página por equipo*

**7.1 Shot chart de equipo** → *gráfico: Shot Chart con dots o hexbin*
**7.2 Zone efficiency chart** → *gráfico: mapa de zonas con FG% coloreado*
**7.3 Shot chart del top scorer** (o del jugador más importante) → *gráfico*

---

### VIII. Forma Reciente

**8.1 Últimos 10 partidos** → *gráfico: Recent Form line chart*

Tabla por partido:
| # | Fecha | Rival | Loc | Result | Pts | Pts Rival | EFG% | TOV | REB |

**8.2 Patrones identificados**
- Record en casa vs. visitante (desglosado, no solo global)
- Rendimiento según días de descanso (back-to-back / 1 día / 2+ días)
- Márgenes de victoria y derrota: ¿ganan cómodo o ajustado?
- Rachas: racha actual, racha máxima ganando/perdiendo

---

### IX. Situaciones Especiales

**9.1 Clutch Performance** (últimos 5 min Q4, dif ≤ 5 pts)
- Record, PPP ofensivo, PPP defensivo, EFG%, TOV%
- ¿Quién toma los tiros importantes? (shots en clutch por jugador)

**9.2 Overtime**
- Record y rendimiento en prórroga (si aplica)

**9.3 Rendimiento tras período de descanso**
- Inicio de Q3 (el cuarto más "frío" estadísticamente en ligas sudamericanas)
- Comparar puntos concedidos en primeros 3 min de Q3 vs resto

---

### X. Fortalezas y Debilidades (SWOT Extendido)

**Equipo A**
- **FORTALEZAS** (verde): bullets concisos con stat de soporte
- **DEBILIDADES** (rojo): bullets concisos con stat de soporte
- **OPORTUNIDADES** (azul): cómo el rival puede explotar sus debilidades
- **AMENAZAS** (naranja): factores externos (físicos, de foul trouble, etc.)

**Equipo B**
- Misma estructura

---

### XI. Factores Clave de la Serie

5–6 factores con narrativa analítica + dato de soporte:

1. **Factor X vs Factor Y**: [stat A] vs [stat B] — ventaja para [equipo]
2. ...

Proyección de resultado con justificación:
- Favorito, por qué, en cuántos partidos
- Escenario que cambia el resultado (el X% de triples, el foul trouble de Z)

---

### XII. Apéndice Estadístico

- Tablas completas de todos los jugadores (sin filtro de MIN)
- Glosario de métricas
- Metodología de cálculo de ORTG/DRTG/Pace

---

## Generación del Word (.docx)

### Setup de documento
```python
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from io import BytesIO

doc = Document()

# Márgenes
for section in doc.sections:
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)
```

### Funciones helper estándar
```python
def set_cell_bg(cell, hex_color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

def add_table(doc, headers, rows, header_color="1A237E", alt_row=True):
    table = doc.add_table(rows=1+len(rows), cols=len(headers))
    table.style = 'Table Grid'
    hdr = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = h
        set_cell_bg(cell, header_color)
        run = cell.paragraphs[0].runs[0]
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(8)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    for ri, row in enumerate(rows):
        tr = table.rows[ri+1]
        for ci, val in enumerate(row):
            cell = tr.cells[ci]
            cell.text = str(val)
            cell.paragraphs[0].runs[0].font.size = Pt(8)
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if alt_row and ri % 2 == 1:
                set_cell_bg(cell, "F5F5F5")

def add_colored_net_table(doc, headers, rows, net_col_idx):
    """Tabla con NET Rating coloreado: verde positivo, rojo negativo."""
    table = doc.add_table(rows=1+len(rows), cols=len(headers))
    table.style = 'Table Grid'
    # ... headers igual que add_table ...
    for ri, row in enumerate(rows):
        tr = table.rows[ri+1]
        for ci, val in enumerate(row):
            cell = tr.cells[ci]
            cell.text = str(val)
            cell.paragraphs[0].runs[0].font.size = Pt(8)
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if ci == net_col_idx:
                try:
                    net = float(val)
                    set_cell_bg(cell, "C8E6C9" if net >= 0 else "FFCDD2")
                except:
                    pass

def add_section_header(doc, text, level=1, color="1A237E"):
    """Encabezado de sección con color de fondo."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(13 if level == 1 else 11)
    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    # Fondo de párrafo
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color)
    pPr.append(shd)

def add_note(doc, text, category="NOTA SCOUT"):
    """Nota scout en itálica con sangría y prefijo de categoría."""
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.3)
    run_cat = p.add_run(f"{category}: ")
    run_cat.bold = True
    run_cat.font.size = Pt(9)
    run_cat.font.color.rgb = RGBColor(0x1A, 0x23, 0x7E)
    run = p.add_run(text)
    run.italic = True
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)

def add_swot_item(doc, text, swot_type):
    """Bullet SWOT coloreado según tipo."""
    colors = {
        'FORTALEZA': ('27AE60', '✓'),
        'DEBILIDAD': ('E74C3C', '✗'),
        'OPORTUNIDAD': ('1565C0', '→'),
        'AMENAZA': ('E65100', '⚠'),
    }
    hex_c, symbol = colors.get(swot_type, ('000000', '•'))
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.2)
    run = p.add_run(f"{symbol} {text}")
    run.font.size = Pt(9)
    r, g, b = tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4))
    run.font.color.rgb = RGBColor(r, g, b)

def fig_to_docx(doc, fig, width_inches=6.0, caption=None):
    """Embebe figura matplotlib en el documento Word."""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    doc.add_picture(buf, width=Inches(width_inches))
    plt.close(fig)
    if caption:
        p = doc.add_paragraph(caption)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.runs[0].font.size = Pt(8)
        p.runs[0].italic = True
        p.runs[0].font.color.rgb = RGBColor(0x66, 0x66, 0x66)
```

### Guardado final
```python
output_path = f"/Users/ramiellero/liga_argentina/scouting_{equipo_a_slug}_vs_{equipo_b_slug}.docx"
doc.save(output_path)
print(f"Informe guardado en: {output_path}")
```

---

## Análisis de Tendencias Temporada Regular → Playoffs

Genera un informe comparativo para **cualquier equipo** que haya disputado una serie de playoffs.
El script detecta automáticamente cuáles son los partidos de playoffs (rafagas de partidos contra el mismo rival en fecha reciente) y los separa de la temporada regular.

### Parámetros de entrada (cambiar solo estas líneas)

```python
# ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
TEAM            = 'DEP. VIEDMA'          # Nombre exacto del equipo (ver df['Equipo'].unique())
TEAM_COLOR      = '#4A148C'              # Color primario del equipo
PLAYOFF_CUTOFF  = pd.Timestamp('2026-04-01')  # Fecha desde la cual los partidos son playoffs
OUTPUT_NAME     = 'scouting_viedma_tendencias_reg_vs_playoffs.docx'
BASE            = '/Users/ramiellero/liga_argentina/liga_argentina/docs/'
# ──────────────────────────────────────────────────────────────────────────────
```

> **Cómo determinar `PLAYOFF_CUTOFF`:**
> ```python
> # Ver el calendario del equipo y encontrar el corte entre fase regular y serie
> df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
> viedma_tot = df[(df['Equipo']==TEAM) & (df['Apellido']=='TOTALES')].sort_values('Fecha')
> print(viedma_tot[['Fecha','Rival','Condicion equipos','Ganado']].to_string())
> # Buscar el punto donde un mismo rival se repite varias veces consecutivas → ahí empieza el playoff
> ```

---

### Patrón de detección de playoffs

Cuando `Etapa` no distingue regular de post-temporada (como ocurre actualmente en los CSVs),
usar la fecha de corte manual como filtro:

```python
viedma_all['Fase'] = np.where(viedma_all['Fecha'] >= PLAYOFF_CUTOFF, 'Playoffs', 'Temporada Regular')
shots_all['Fase']  = np.where(shots_all['Fecha']  >= PLAYOFF_CUTOFF, 'Playoffs', 'Temporada Regular')
pbp_v['Fase']      = np.where(pbp_v['Fecha']      >= PLAYOFF_CUTOFF, 'Playoffs', 'Temporada Regular')
```

---

### Métricas calculadas (equipo)

```python
def team_stats(fase):
    """Devuelve dict con todas las métricas de equipo para una fase dada."""
    tot = viedma_all[(viedma_all['Fase']==fase) & (viedma_all['Apellido']=='TOTALES')]
    n   = len(tot)  # número de partidos

    # Acumulados
    t2a, t2i = tot['T2A'].sum(), tot['T2I'].sum()
    t3a, t3i = tot['T3A'].sum(), tot['T3I'].sum()
    t1a, t1i = tot['T1A'].sum(), tot['T1I'].sum()
    tov = tot['Perdidas'].sum()

    # Eficiencia
    efg = (t2a + 1.5*t3a) / (t2i + t3i)
    ts  = (t2a*2 + t3a*3 + t1a) / (2 * (t2i + t3i + 0.44*t1i))

    # Posesiones del equipo (necesario para USG%)
    team_poss_total = (t2i + t3i) + 0.44*t1i + tov

    return {
        'n': n, 'team_poss_total': team_poss_total,
        'ppg': tot['Puntos'].sum()/n,
        'efg': efg, 'ts': ts,
        't3pct': t3a/t3i, 't2pct': t2a/t2i, 't1pct': t1a/t1i,
        't3i_pg': t3i/n, 't3a_pg': t3a/n,
        'ast_tov': tot['Asistencias'].sum()/tot['Perdidas'].sum(),
        'tov_pg': tov/n, 'reb_pg': tot['TReb'].sum()/n,
        'ast_pg': tot['Asistencias'].sum()/n,
        'stl_pg': tot['Recuperos'].sum()/n,
        'blk_pg': tot['Tapones cometidos'].sum()/n,
        't3_share': t3i/(t2i+t3i) if (t2i+t3i)>0 else 0,
    }

reg_t = team_stats('Temporada Regular')
po_t  = team_stats('Playoffs')
```

---

### USG% — Usage Rate individual

```python
# USG% = (FGA + 0.44×FTA + TOV) / (MIN/40 × posesiones_equipo/partido) × 100
# FGA = T2I + T3I  |  FTA = T1I  |  MIN = minutos jugados por el jugador

def add_usg(player_df, team_st):
    """
    Agrega columna 'usg' al DataFrame de jugadores.
    player_df : resultado de player_stats(fase) — tiene columnas min40, t2i, t3i, t1i, tov
    team_st   : resultado de team_stats(fase) — tiene 'team_poss_total' y 'n'
    """
    n = team_st['n']
    team_poss_pg = team_st['team_poss_total'] / n   # posesiones promedio por partido
    fga  = player_df['t2i'] + player_df['t3i']
    # player MIN/40: cuántos "períodos completos de 40 min" jugó en total el jugador
    # Esto normaliza las posesiones del equipo al tiempo real del jugador en cancha
    player_df['usg'] = (
        (fga + 0.44*player_df['t1i'] + player_df['tov'])
        / ((player_df['min40'] / 40) * team_poss_pg)
        * 100
    ).where(player_df['min40'] > 0)
    return player_df

reg_p = add_usg(player_stats('Temporada Regular'), reg_t)
po_p  = add_usg(player_stats('Playoffs'),          po_t)
```

**Cómo leer el USG%:**
- `< 15%` → rol secundario / especialista
- `15–22%` → rotación estándar
- `22–28%` → jugador de sistema / segundo opción
- `> 28%` → primera opción ofensiva
- Combinar siempre con EFG% o TS% — un USG alto con EFG bajo indica ineficiencia en volumen

---

### Mapeo Dorsal → Jugador (shots dataset)

El dataset de tiros usa `Dorsal` numérico; el box score usa `Número Camiseta` (float).
La conversión correcta para evitar mismatch es:

```python
dorsal_map = (
    viedma_all[viedma_all['Apellido'] != 'TOTALES']
    [['Número Camiseta', 'Apellido', 'Nombre']]
    .drop_duplicates()
    .dropna(subset=['Número Camiseta'])
)
dorsal_map.columns = ['Dorsal', 'Apellido', 'Nombre']
dorsal_map['Dorsal'] = dorsal_map['Dorsal'].astype(float).astype(int).astype(str)

# En shots:
shots['Dorsal'] = shots['Dorsal'].astype(float).astype(int).astype(str)
shots = shots.merge(dorsal_map, on='Dorsal', how='left')
# ⚠ Siempre verificar que el merge no genera NaN masivos antes de continuar
print(shots['Apellido'].isna().sum(), '/', len(shots))
```

---

### Detección de zonas de tiro

```python
# Pintura (Z1–Z5)
mask_paint = shots['Zona'].str.match(r'Z[1-5]-', na=False)

# Medio Rango (Z6–Z10)
mask_mr = shots['Zona'].str.match(r'Z([6-9]|10)-', na=False)

# Triple (Z11–Z14)
mask_t3 = shots['Zona'].str.match(r'Z1[1-4]-|Z14-', na=False)
# También se puede usar: shots['Tipo'] == 'TIRO3'
```

---

### Figuras estándar del análisis Reg→Playoffs

| # | Figura | Función |
|---|--------|---------|
| 1 | Evolución T3% partido a partido + media móvil 5 | Tendencia temporal exterior |
| 2 | Barras: T3 intentados/pg · T3% · T3 anotados/pg | Comparativa cuantitativa exterior |
| 3 | Distribución FGA por zona (pintura / MR / triple) | Cambio de identidad de juego |
| 4 | Merchant (o jugador clave): PPG · T3% · T3 att/pg | Análisis individual |
| 5 | Scoring por cuarto Q1–Q4 comparativo | Rendimiento temporal intrapartido |
| 6 | T3% por jugador (barras horizontales) | Ranking tiradores equipo |
| 7 | USG% por jugador + scatter USG% vs EFG% | Distribución y eficiencia de posesiones |
| 8 | USG% partido a partido top 5 jugadores | Evolución del protagonismo ofensivo |

---

### Estructura del informe generado

```
I.   Resumen Ejecutivo — tabla comparativa de alto nivel
II.  Tiro Exterior — evolución, barras, zonas, detalle por zona
III. Jugador de foco (ej. MERCHANT) — tabla completa + notas scout
IV.  Jugadores clave — box score + T3% por jugador + detalle exterior
V.   USG% — tabla + scatter USG vs EFG + evolución partido a partido
VI.  Scoring por cuarto + Clutch Stats (desde PBP)
VII. Fortalezas y Debilidades (SWOT)
VIII.Forma reciente — últimos partidos
IX.  Conclusiones y factores clave de serie
```

---

### Adaptar a otro equipo — checklist

1. Cambiar `TEAM`, `TEAM_COLOR`, `PLAYOFF_CUTOFF`, `OUTPUT_NAME`
2. Verificar que `TEAM` existe exactamente en `df['Equipo'].unique()`
3. Imprimir el calendario del equipo y confirmar el corte de fecha de playoffs
4. Ajustar `key_players_po = po_p[po_p['mpg'] >= 8]['Apellido'].tolist()` si el umbral de minutos no aplica
5. Cambiar el jugador de foco en la sección III (variable `FOCUS_PLAYER = 'MERCHANT'`)
6. Verificar el merge de dorsales: `shots['Apellido'].isna().sum()` debe ser bajo
7. Actualizar el color del equipo rival en gráficos comparativos (por defecto `'#FF6F00'`)

---

## Colores de equipo sugeridos (para consistencia visual)

```python
TEAM_COLORS = {
    'LA UNIÓN (C)':   '#1A237E',  # azul marino
    'PICO F.C.':      '#B71C1C',  # rojo
    'PROVINCIAL (R)': '#1B5E20',  # verde
    'DEP. VIEDMA':    '#4A148C',  # violeta
}
```

---

## Nombres exactos de equipos (referencia)

Verificar siempre con:
```python
df['Equipo'].unique()
```

Equipos confirmados hasta abril 2026:
- `'PROVINCIAL (R)'`
- `'DEP. VIEDMA'`
- `'LA UNIÓN (C)'`
- `'PICO F.C.'`

---

## Reportes generados

| Archivo | Tipo | Equipo/Serie | Fecha |
|---|---|---|---|
| `scouting_la_union_vs_pico_fc.docx` | Serie playoffs | LA UNIÓN (C) vs PICO F.C. | Abril 2026 |
| `scouting_provincial_vs_viedma.docx` | Serie playoffs | PROVINCIAL (R) vs DEP. VIEDMA | Abril 2026 |
| `scouting_viedma_tendencias_reg_vs_playoffs.docx` | Tendencias Reg→PO | DEP. VIEDMA | Abril 2026 |

> Script reutilizable en `/tmp/viedma_scouting.py` — parametrizar con `TEAM`, `TEAM_COLOR`, `PLAYOFF_CUTOFF`, `OUTPUT_NAME`.
