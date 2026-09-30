"""
scouting_common.py — helpers compartidos para reportes de scouting de Liga Argentina / Liga Nacional
(y, por extensión, Liga Femenina / Liga de Desarrollo, que comparten el mismo esquema de CSVs).

No ejecutar directamente. Importado por scouting/gen_team_scouting.py y futuras skills de scouting
(matchup entre 2 equipos, tendencias pre/post técnico, etc.).
"""
import itertools
import warnings
from collections import defaultdict
from io import BytesIO

import numpy as np
import pandas as pd
from matplotlib.patches import Arc, Circle, Rectangle
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

warnings.filterwarnings('ignore')

# ── Rutas por liga ──────────────────────────────────────────────────────────────
LIGAS = {
    'liga_argentina': {
        'stats': 'docs/liga_argentina/liga_argentina.csv',
        'shots': 'docs/liga_argentina/liga_argentina_shots.csv',
        'pbp_url': 'https://repsndqhmyklxukffovf.supabase.co/storage/v1/object/public/pbp/liga_argentina_pbp.csv',
        'playoff_cutoff': pd.Timestamp('2026-04-01'),
        'label': 'Liga Argentina',
    },
    'liga_nacional': {
        'stats': 'docs/liga_nacional/liga_nacional.csv',
        'shots': 'docs/liga_nacional/liga_nacional_shots.csv',
        'pbp_url': 'https://repsndqhmyklxukffovf.supabase.co/storage/v1/object/public/pbp/liga_nacional_pbp.csv',
        'playoff_cutoff': pd.Timestamp('2026-04-01'),
        'label': 'Liga Nacional',
    },
    'liga_femenina': {
        'stats': 'docs/liga_femenina/liga_femenina.csv',
        'shots': 'docs/liga_femenina/liga_femenina_shots.csv',
        'pbp_url': 'https://repsndqhmyklxukffovf.supabase.co/storage/v1/object/public/pbp/liga_femenina_pbp.csv',
        'playoff_cutoff': None,
        'label': 'Liga Femenina',
    },
    'liga_proximo': {
        'stats': 'docs/liga_proximo/liga_proximo.csv',
        'shots': 'docs/liga_proximo/liga_proximo_shots.csv',
        'pbp_url': 'https://repsndqhmyklxukffovf.supabase.co/storage/v1/object/public/pbp/liga_proximo_pbp.csv',
        'playoff_cutoff': None,
        'label': 'Liga de Desarrollo',
    },
}

# Clutch: solo field goals reales. NO usar 'TIRO-FALLADO*' (nunca matchea) ni CANASTA-1P (tiro libre).
CLUTCH_FG_TYPES = {'CANASTA-2P', 'CANASTA-3P', 'TIRO2-FALLADO', 'TIRO3-FALLADO'}


# ── Carga de datos ───────────────────────────────────────────────────────────────
def load_stats(liga):
    """Carga el CSV de stats de una liga con fechas parseadas (dayfirst)."""
    df = pd.read_csv(LIGAS[liga]['stats'])
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    return df


def load_shots(liga):
    df = pd.read_csv(LIGAS[liga]['shots'])
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    return df


def load_pbp(liga, timeout=15):
    """
    Intenta cargar el PBP desde Supabase Storage (mismo origen que usa el frontend).
    El PBP no vive en este repo (ver CLAUDE.md — "Incidente: Supabase egress excedido").
    Devuelve None si falla (red, proyecto restringido, etc.) — el caller debe degradar
    las secciones que dependen de PBP en vez de romper.
    """
    url = LIGAS[liga]['pbp_url'] + '?v=' + pd.Timestamp.now().strftime('%Y-%m-%d')
    try:
        df = pd.read_csv(url, storage_options={'User-Agent': 'scouting-liga/1.0'})
    except Exception as e:
        print(f"  [aviso] No se pudo cargar PBP de {liga}: {e}")
        return None
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    return df


def detect_liga(team_name, ligas=('liga_argentina', 'liga_nacional', 'liga_femenina', 'liga_proximo')):
    """Busca team_name en el CSV de stats de cada liga (en orden) y devuelve la primera que matchea."""
    for liga in ligas:
        try:
            df = pd.read_csv(LIGAS[liga]['stats'], usecols=['Equipo'])
        except Exception:
            continue
        if team_name in df['Equipo'].values:
            return liga
    return None


def list_teams(ligas=('liga_argentina', 'liga_nacional')):
    """Para mensajes de error: equipos disponibles por liga."""
    out = {}
    for liga in ligas:
        try:
            df = pd.read_csv(LIGAS[liga]['stats'], usecols=['Equipo'])
            out[liga] = sorted(df['Equipo'].unique())
        except Exception:
            out[liga] = []
    return out


# ── Métricas ──────────────────────────────────────────────────────────────────────
def calc_efg(t2a, t3a, t2i, t3i):
    fga = t2i + t3i
    return (t2a + 1.5 * t3a) / fga if fga > 0 else 0.0


def calc_ts(pts, t2i, t3i, t1i):
    denom = 2 * (t2i + t3i + 0.44 * t1i)
    return pts / denom if denom > 0 else 0.0


def calc_poss(t2i, t3i, t1i, oreb, tov):
    """Posesiones ~= FGA + 0.44*FTA - OREB + TOV"""
    return (t2i + t3i) + 0.44 * t1i - oreb + tov


def calc_usg(player_t2i, player_t3i, player_t1i, player_tov, player_min, team_poss_pg, team_min_per_game=200):
    """USG% = (FGA + 0.44*FTA + TOV) / (MIN/40 * posesiones_equipo/partido) * 100"""
    fga = player_t2i + player_t3i
    denom = (player_min / 40) * team_poss_pg
    return (fga + 0.44 * player_t1i + player_tov) / denom * 100 if denom > 0 else 0.0


def calc_oreb_pct(oreb, opp_dreb):
    denom = oreb + opp_dreb
    return oreb / denom * 100 if denom > 0 else None


def calc_dreb_pct(dreb, opp_oreb):
    denom = dreb + opp_oreb
    return dreb / denom * 100 if denom > 0 else None


# ── Dorsal → jugador ─────────────────────────────────────────────────────────────
def map_dorsal_to_player(team_df):
    """
    team_df: filas de jugadores (Apellido != 'TOTALES') de un equipo.
    Devuelve DataFrame ['Dorsal','Apellido','Nombre'] con Dorsal como string entero,
    listo para mergear contra el shots CSV (que también trae Dorsal numérico).
    """
    dm = (
        team_df[team_df['Apellido'] != 'TOTALES']
        [['Número Camiseta', 'Apellido', 'Nombre']]
        .drop_duplicates()
        .dropna(subset=['Número Camiseta'])
        .copy()
    )
    dm.columns = ['Dorsal', 'Apellido', 'Nombre']
    dm['Dorsal'] = dm['Dorsal'].astype(float).astype(int).astype(str)
    return dm


def attach_player_names_to_shots(shots_team, team_df):
    """Mergea nombre de jugador en shots_team via dorsal. Devuelve copia con columna 'Apellido'."""
    dm = map_dorsal_to_player(team_df)
    shots = shots_team.copy()
    shots['Dorsal'] = shots['Dorsal'].astype(float).astype(int).astype(str)
    shots = shots.merge(dm, on='Dorsal', how='left')
    return shots


# ── Shot chart (Left_pct / Top_pct, cancha 14x15m media cancha) ─────────────────
def draw_court_half(ax, color='#cccccc', lw=1.2):
    ax.add_patch(Rectangle((-7.5, -1.2), 15, 14.4, linewidth=lw, edgecolor=color, fill=False))
    ax.add_patch(Rectangle((-2.45, -1.2), 4.9, 5.8, linewidth=lw, edgecolor=color, fill=False))
    ax.add_patch(Circle((0, 0), 0.45, linewidth=lw, edgecolor=color, fill=False))
    ax.add_patch(Arc((0, 0), 2 * 1.25, 2 * 1.25, theta1=0, theta2=180, linewidth=lw, color=color))
    ax.add_patch(Arc((0, 0), 2 * 6.75, 2 * 6.75, theta1=12, theta2=168, linewidth=lw, color=color))
    ax.plot([-2.2, -2.2], [-1.2, 0.9], color=color, lw=lw)
    ax.plot([2.2, 2.2], [-1.2, 0.9], color=color, lw=lw)
    ax.set_xlim(-8, 8)
    ax.set_ylim(-2, 9)
    ax.set_aspect('equal')
    ax.axis('off')


def shot_xy(row):
    """Left_pct/Top_pct (0-100, canvas 14x15m) -> coordenadas en metros centradas para draw_court_half."""
    W, H = 14, 15
    x = float(row['Left_pct']) / 100 * W - W / 2
    y = (1 - float(row['Top_pct']) / 100) * H - 2
    return x, y


def plot_team_shot_chart(shots_df, team_name, facecolor='#1a1a2e'):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7, 6), facecolor=facecolor)
    ax.set_facecolor(facecolor)
    draw_court_half(ax)
    for _, s in shots_df.iterrows():
        x, y = shot_xy(s)
        made = s['Resultado'] == 'CONVERTIDO'
        ax.scatter(x, y, c='#00ff88' if made else '#ff4444', s=8,
                   alpha=0.55 if made else 0.35, linewidths=0)
    made_n = (shots_df['Resultado'] == 'CONVERTIDO').sum()
    att_n = len(shots_df)
    pct = made_n / att_n * 100 if att_n > 0 else 0
    ax.set_title(f"{team_name} — Shot Chart\n{made_n}/{att_n} ({pct:.1f}%)",
                 color='white', fontsize=11, fontweight='bold', pad=8)
    fig.tight_layout()
    return fig


# ── Lineups (quintetos / tríos / dúos) desde PBP ─────────────────────────────────
def compute_lineups(pbp_team, team_side_col_value_map, team_name):
    """
    pbp_team: filas de PBP donde el equipo participa (Equipo_local == team_name o Equipo_visitante == team_name).
    team_name: nombre exacto del equipo (para resolver Equipo_lado -> 'LOCAL'/'VISITANTE' por partido).

    Devuelve dict con:
      lineup_secs, duo_secs, trio_secs -> Counter-like dict {tuple(jugadores): segundos}
    Replica el algoritmo boundary-buffering documentado en index.html/computeLineups()
    para no perder tracking en partidos sin CAMBIO-JUGADOR-ENTRA al inicio del período.
    """
    lineup_secs = defaultdict(float)
    duo_secs = defaultdict(float)
    trio_secs = defaultdict(float)

    for game_id, g in pbp_team.groupby('IdPartido'):
        g = g.sort_index()
        is_local = (g['Equipo_local'].iloc[0] == team_name)
        side = 'LOCAL' if is_local else 'VISITANTE'
        g_side = g[g['Equipo_lado'] == side].copy()
        if g_side.empty:
            continue

        court = set()
        seg_start = None
        boundary_buf = set()
        in_boundary = False
        prev_time = None

        def close_segment(end_marker):
            nonlocal seg_start
            if len(court) == 5 and seg_start is not None:
                secs = max(0.0, float(end_marker - seg_start))
                key5 = tuple(sorted(court))
                lineup_secs[key5] += secs
                for duo in itertools.combinations(key5, 2):
                    duo_secs[duo] += secs
                for trio in itertools.combinations(key5, 3):
                    trio_secs[trio] += secs
            seg_start = None

        counter = 0
        for _, ev in g.iterrows():
            counter += 1
            tipo = str(ev.get('Tipo', ''))
            side_ev = str(ev.get('Equipo_lado', ''))
            jugador = ev.get('Jugador', None)

            if tipo == 'INICIO-PERIODO':
                if len(boundary_buf) >= 5:
                    court = set(boundary_buf)
                boundary_buf = set()
                in_boundary = False
                seg_start = counter
                continue

            if tipo == 'FINAL-PERIODO':
                close_segment(counter)
                in_boundary = True
                continue

            if tipo == 'FINAL-PARTIDO':
                close_segment(counter)
                court = set()
                seg_start = None
                in_boundary = False
                boundary_buf = set()
                continue

            if side_ev != side or pd.isna(jugador):
                continue

            if tipo == 'CAMBIO-JUGADOR-ENTRA':
                if in_boundary:
                    boundary_buf.add(jugador)
                else:
                    court.add(jugador)
                    if len(court) == 5:
                        seg_start = counter
            elif tipo == 'CAMBIO-JUGADOR-SALE':
                if not in_boundary:
                    close_segment(counter)
                    court.discard(jugador)

        close_segment(counter)

    return {'lineup': lineup_secs, 'duo': duo_secs, 'trio': trio_secs}


def secs_to_min(counters_dict, seconds_per_unit=1.0):
    """Convierte segundos acumulados a minutos, ordenado descendente."""
    out = []
    for players, secs in counters_dict.items():
        out.append({'players': list(players), 'min': secs * seconds_per_unit / 60})
    out.sort(key=lambda x: x['min'], reverse=True)
    return out


# ── Clutch (Q4, últimos 5 min, diferencia <= 5) ──────────────────────────────────
def parse_mmss(t):
    try:
        m, s = str(t).split(':')
        return int(m) * 60 + int(s)
    except Exception:
        return None


def compute_clutch(pbp_team, team_name):
    """
    Filtra eventos de field goal (CLUTCH_FG_TYPES) en Q4/OT con tiempo restante <= 5min
    y diferencia de marcador <= 5 puntos al momento del evento. Devuelve dict con
    intentos/conversiones propios y del rival.
    """
    rows = []
    for game_id, g in pbp_team.groupby('IdPartido'):
        is_local = (g['Equipo_local'].iloc[0] == team_name)
        my_col = 'Marcador_local' if is_local else 'Marcador_visitante'
        opp_col = 'Marcador_visitante' if is_local else 'Marcador_local'
        my_side = 'LOCAL' if is_local else 'VISITANTE'

        for _, ev in g.iterrows():
            tipo = str(ev.get('Tipo', ''))
            if tipo not in CLUTCH_FG_TYPES:
                continue
            periodo = ev.get('Periodo', None)
            try:
                periodo = int(periodo)
            except Exception:
                continue
            if periodo < 4:
                continue
            secs_left = parse_mmss(ev.get('Tiempo'))
            if secs_left is None or secs_left > 300:
                continue
            try:
                diff = abs(int(ev.get(my_col, 0)) - int(ev.get(opp_col, 0)))
            except Exception:
                continue
            if diff > 5:
                continue
            made = tipo.startswith('CANASTA')
            is_mine = (str(ev.get('Equipo_lado', '')) == my_side)
            rows.append({'made': made, 'is_mine': is_mine, 'tipo': tipo})

    if not rows:
        return None

    my_att = sum(1 for r in rows if r['is_mine'])
    my_made = sum(1 for r in rows if r['is_mine'] and r['made'])
    opp_att = sum(1 for r in rows if not r['is_mine'])
    opp_made = sum(1 for r in rows if not r['is_mine'] and r['made'])
    return {
        'my_att': my_att, 'my_made': my_made,
        'my_pct': my_made / my_att * 100 if my_att else 0,
        'opp_att': opp_att, 'opp_made': opp_made,
        'opp_pct': opp_made / opp_att * 100 if opp_att else 0,
    }


# ── Asistencias (pares asistente -> anotador) ────────────────────────────────────
def compute_assist_pairs(pbp_team, team_name):
    """Busca hacia atrás (máx 5 filas) desde cada ASISTENCIA la CANASTA-* previa del mismo lado."""
    pairs = []
    for game_id, g in pbp_team.groupby('IdPartido'):
        is_local = (g['Equipo_local'].iloc[0] == team_name)
        side = 'LOCAL' if is_local else 'VISITANTE'
        g = g.reset_index(drop=True)
        for i, row in g.iterrows():
            if row.get('Tipo') != 'ASISTENCIA' or row.get('Equipo_lado') != side:
                continue
            for j in range(i - 1, max(i - 5, -1), -1):
                prev = g.iloc[j]
                if prev.get('Equipo_lado') == side and str(prev.get('Tipo', '')).startswith('CANASTA'):
                    pairs.append((row.get('Jugador'), prev.get('Jugador')))
                    break
    return pairs


# ── Helpers de .docx ──────────────────────────────────────────────────────────────
def set_cell_bg(cell, hex_color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)


def add_table(doc, headers, rows, header_color="1A237E", alt_row=True):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Table Grid'
    hdr = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = str(h)
        set_cell_bg(cell, header_color)
        run = cell.paragraphs[0].runs[0]
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(8)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    for ri, row in enumerate(rows):
        tr = table.rows[ri + 1]
        for ci, val in enumerate(row):
            cell = tr.cells[ci]
            cell.text = str(val)
            cell.paragraphs[0].runs[0].font.size = Pt(8)
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if alt_row and ri % 2 == 1:
                set_cell_bg(cell, "F5F5F5")
    return table


def add_colored_net_table(doc, headers, rows, net_col_idx, header_color="1A237E"):
    table = add_table(doc, headers, rows, header_color=header_color, alt_row=False)
    for ri, row in enumerate(rows):
        tr = table.rows[ri + 1]
        cell = tr.cells[net_col_idx]
        try:
            net = float(row[net_col_idx])
            set_cell_bg(cell, "C8E6C9" if net >= 0 else "FFCDD2")
        except (ValueError, TypeError):
            pass
    return table


def add_section_header(doc, text, level=1, color="1A237E"):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(13 if level == 1 else 11)
    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color)
    pPr.append(shd)
    return p


def add_note(doc, text, category="NOTA SCOUT"):
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
    return p


SWOT_STYLE = {
    'FORTALEZA': ('27AE60', '+'),
    'DEBILIDAD': ('E74C3C', '-'),
    'OPORTUNIDAD': ('1565C0', '>'),
    'AMENAZA': ('E65100', '!'),
}


def add_swot_item(doc, text, swot_type):
    hex_c, symbol = SWOT_STYLE.get(swot_type, ('000000', '*'))
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.2)
    run = p.add_run(f"{symbol} {text}")
    run.font.size = Pt(9)
    r, g, b = tuple(int(hex_c[i:i + 2], 16) for i in (0, 2, 4))
    run.font.color.rgb = RGBColor(r, g, b)
    return p


def fig_to_docx(doc, fig, width_inches=6.0, caption=None):
    import matplotlib.pyplot as plt
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
