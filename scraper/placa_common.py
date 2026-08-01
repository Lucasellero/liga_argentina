"""
Constantes y helpers compartidos para generar placas de Instagram Story con la
identidad visual de Scouteado (paleta violeta/teal, fuente Inter).

Extraído de gen_fichaje_placas.py para que tanto el CLI (que lee logos/mercado.json
de disco) como el servidor MCP (que los trae de scouteado.com) reusen exactamente
el mismo template — build_card_html() no sabe ni le importa de dónde salió cada
imagen, solo recibe un logos_dir con los archivos ya presentes.
"""
import base64
import os
import re
import unicodedata
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIGA_CONFIG = {
    'liga_nacional': {
        'label': 'Liga Nacional 2025/26',
        'docs_dir': os.path.join(BASE_DIR, 'docs', 'liga_nacional'),
    },
    'liga_argentina': {
        'label': 'Liga Argentina 2025/26',
        'docs_dir': os.path.join(BASE_DIR, 'docs', 'liga_argentina'),
    },
}

# club_id (mercado.json) -> nombre de archivo en docs/<liga>/logos/, por liga
# (los club_id no son únicos entre ligas -- ej. distintos "ferro" -- por eso va
# anidado y no en un único dict global). Regenerar con el script de matching
# (norm(team/name/id) contra los archivos de logos/) si se agregan clubes nuevos.
CLUB_LOGO = {
    'liga_nacional': {
        'argentino_junin':   'argentino_j.jpeg',
        'atenas':            'atenas_c.jpeg',
        'boca':              'boca.jpeg',
        'ferro':              'ferro.jpeg',
        'gimnasia_cr':       'gimnasia_cr.jpeg',
        'independiente_o':   'independiente_o.jpeg',
        'instituto':          'instituto.jpeg',
        'la_union':          'la_union_fsa.jpeg',
        'lanus':              'lanus.jpeg',
        'obera':              'obera.jpeg',
        'olimpico':           'olimpico_lb.jpeg',
        'penarol':            'peñarol_mdp.jpeg',
        'platense':           'platense.jpeg',
        'quimsa':             'quimsa.jpeg',
        'racing_ch':          'racing_ch.jpeg',
        'regatas':            'regatas_c.jpeg',
        'san_lorenzo':        'san_lorenzo.jpeg',
        'san_martin':         'san_martin_c.jpeg',
        'union_sf':           'union_sf.jpeg',
    },
    'liga_argentina': {
        'amancay':               'amancay_lr.jpeg',
        'san_isidro':            'san_isidro.jpeg',
        'barrio_parque':         'barrio_parque.jpeg',
        'sportivo_suardi':       'sp_suardi.jpeg',
        'santa_paula':           'santa_paula_g.jpeg',
        'comunicaciones':        'comunicaciones.jpeg',
        'salta_basket':          'salta_basket.jpeg',
        'jujuy_basquet':         'jujuy_basquet.jpeg',
        'villa_san_martin':      'villa_san_martin.jpeg',
        'estudiantes_tucuman':   'estudiantes_t.jpeg',
        'bochas_sport_club':     'bochas_cc.jpeg',
        'independiente_bbc':     'independiente_sde.jpeg',
        'rivadavia_mendoza':     'rivadavia_mza.jpeg',
        'hindu_club':            'hindu_c.jpeg',
        'provincial_rosario':    'provincial_r.jpeg',
        'central_entrerriano':   'central_entrerriano.jpeg',
        'la_union_colon':        'la_union_c.jpeg',
        'pico_fc':               'pico_fc.jpeg',
        'quilmes_mdp':           'quilmes_mdp.jpeg',
        'gimnasia_lp':           'gimnasia_lp.jpeg',
        'deportivo_viedma':      'dep_viedma.jpeg',
        'centenario_vt':         'centenario_vt.jpeg',
        'racing_avellaneda':     'racing_a.jpeg',
        'villa_mitre':           'villa_mitre_bb.jpeg',
        'union_mdp':             'union_mdp.jpeg',
        'ciclista_juninense':    'ciclista_j.jpeg',
        'tomas_de_rocamora':     'rocamora.jpeg',
        'deportivo_norte':       'dep_norte.jpeg',
        # 'riachuelo' no tiene logo disponible en docs/liga_argentina/logos/ todavía
        # -- degrada al ícono genérico '◐' en build_card_html, no rompe la placa.
    },
}

POSITIONS = {'base': 'Base', 'escolta': 'Escolta', 'alero': 'Alero',
             'ala_pivote': 'Ala-pivote', 'pivote': 'Pivote'}
FICHA_TYPES = {'mayor': 'Ficha mayor', 'u21': 'Ficha U21',
               'juvenil': 'Ficha juvenil', 'staff': 'Cuerpo técnico'}
CONFIDENCE = {'oficial': 'OFICIAL', 'arreglo_verbal': 'ARREGLO VERBAL',
              'muy_avanzado': 'MUY AVANZADO', 'interes': 'INTERÉS / RUMOR',
              'en_duda': 'EN DUDA', 'se_cayo': 'SE CAYÓ'}


def norm(s):
    if not s:
        return ''
    s = re.sub(r'\([^)]*\)', '', s)  # saca "(MDP)", "(J)", etc.
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', s.lower())


def b64_file(path):
    if not path or not os.path.isfile(path):
        return None
    ext = os.path.splitext(path)[1].lstrip('.').lower()
    mime = 'jpeg' if ext in ('jpg', 'jpeg') else ext
    with open(path, 'rb') as f:
        return f'data:image/{mime};base64,' + base64.b64encode(f.read()).decode()


def find_matching_club(text, clubs):
    """Busca si `text` (last_club) corresponde a un club de la propia liga."""
    t = norm(text)
    if not t:
        return None
    for c in clubs:
        if norm(c['name']) == t or norm(c['team']) == t:
            return c
    for c in clubs:
        cn = norm(c['name'])
        if cn and (cn in t or t in cn):
            return c
    return None


def load_clubs(club_list):
    return {c['id']: c for c in club_list}


def build_card_html(player, dest_club, origin_club, is_renewal, logos_dir, liga_label, scouteado_logo_b64, liga):
    club_logo = CLUB_LOGO.get(liga, {})
    name = player['name']
    parts = name.strip().split(' ')
    first = ' '.join(parts[:-1]) if len(parts) > 1 else ''
    last = parts[-1] if parts else name

    position = POSITIONS.get(player.get('position'), player.get('position', '') or '')
    ficha = FICHA_TYPES.get(player.get('ficha_type'), '')
    age = player.get('age')
    height = player.get('height')
    confidence = CONFIDENCE.get(player.get('confidence'), '')
    photo = player.get('image_url') or ''

    dest_name = dest_club['name'] if dest_club else '—'
    dest_logo = b64_file(os.path.join(logos_dir, club_logo.get(player['club_id'], ''))) if dest_club else None

    meta_line = position.upper() if position else ''

    stat_defs = [
        ('EDAD', f'{age}' if age else '—', 'purple'),
        ('ALTURA', f'{height} m' if height else '—', 'teal'),
        ('FICHA', ficha.replace('Ficha ', '').upper() if ficha else '—', ''),
    ]
    stats_row = ''.join(
        f'<div class="s-stat-card {cls}"><div class="s-stat-value {cls}">{val}</div>'
        f'<div class="s-stat-label">{lbl}</div></div>'
        for lbl, val, cls in stat_defs
    )

    if is_renewal:
        transfer_block = f'''
        <div class="s-transfer-single">
          <div class="s-club-circle">{f'<img src="{dest_logo}">' if dest_logo else ''}</div>
          <div class="s-renew-label">RENUEVA CONTRATO</div>
          <div class="s-club-name">{dest_name}</div>
        </div>'''
        status_pill = '<div class="s-status-pill renew">🔄 RENOVACIÓN</div>'
    else:
        origin_name = origin_club['name'] if origin_club else (player.get('last_club') or 'Agente libre')
        origin_logo_path = os.path.join(logos_dir, club_logo.get(origin_club['id'], '')) if origin_club else None
        origin_logo = b64_file(origin_logo_path) if origin_logo_path else None
        transfer_block = f'''
        <div class="s-transfer-pair">
          <div class="s-transfer-side">
            <div class="s-club-circle small">{f'<img src="{origin_logo}">' if origin_logo else '<span class="s-club-fallback">◐</span>'}</div>
            <div class="s-club-name small">{origin_name}</div>
          </div>
          <div class="s-transfer-arrow">→</div>
          <div class="s-transfer-side">
            <div class="s-club-circle">{f'<img src="{dest_logo}">' if dest_logo else ''}</div>
            <div class="s-club-name">{dest_name}</div>
          </div>
        </div>'''
        status_pill = '<div class="s-status-pill">✅ FICHAJE CONFIRMADO</div>'

    today = datetime.now().strftime('%d · %m · %Y')

    return f'''<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
:root {{
  --bg:#0b0b16; --surface:#18182e; --border:rgba(139,92,246,.22); --border2:rgba(255,255,255,.07);
  --purple:#8b5cf6; --purple-d:#6d28d9; --purple-l:#a78bfa; --teal:#2dd4bf; --teal-l:#5eead4;
  --text:#e2e8f0; --text-bright:#f8fafc; --muted:#64748b; --muted2:#475569;
}}
html,body {{ width:1080px; height:1920px; background:var(--bg); font-family:'Inter',sans-serif; color:var(--text); overflow:hidden; }}
.story {{
  width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; background:var(--bg);
  background-image:
    radial-gradient(ellipse 110% 40% at 50% -2%, rgba(139,92,246,.4) 0%, transparent 55%),
    radial-gradient(ellipse 60% 35% at 88% 92%, rgba(45,212,191,.12) 0%, transparent 55%);
}}
.s-main {{ flex:1; display:flex; flex-direction:column; justify-content:center; }}
.s-header {{ display:flex; align-items:center; justify-content:space-between; padding:54px 64px 0; }}
.s-logo {{ display:flex; align-items:center; gap:14px; }}
.s-logo img {{ width:52px; height:52px; object-fit:contain; }}
.s-logo-text {{ font-size:1.5rem; font-weight:800; letter-spacing:-.02em; color:var(--text-bright); }}
.s-badge-liga {{ font-size:.85rem; font-weight:600; color:var(--teal-l); background:rgba(45,212,191,.12);
  border:1px solid rgba(45,212,191,.3); border-radius:20px; padding:8px 22px; letter-spacing:.04em; }}

.s-status-row {{ display:flex; justify-content:center; margin-top:48px; }}
.s-status-pill {{ font-size:1.05rem; font-weight:800; letter-spacing:.06em; color:var(--teal-l);
  background:rgba(45,212,191,.12); border:1.5px solid rgba(45,212,191,.4); border-radius:30px; padding:14px 34px; }}
.s-status-pill.renew {{ color:var(--purple-l); background:rgba(139,92,246,.14); border-color:rgba(139,92,246,.45); }}
.s-confidence {{ text-align:center; margin-top:14px; font-size:.85rem; font-weight:700; letter-spacing:.12em; color:var(--muted); }}

.s-hero {{ display:flex; flex-direction:column; align-items:center; padding:44px 64px 0; }}
.s-player-avatar {{ width:340px; height:340px; border-radius:50%; border:5px solid rgba(139,92,246,.5);
  background:var(--surface) center/cover no-repeat; box-shadow:0 20px 60px rgba(139,92,246,.25); }}
.s-player-name {{ margin-top:34px; font-size:3.4rem; font-weight:900; letter-spacing:-.03em; text-align:center;
  color:var(--text-bright); line-height:1.05; }}
.s-player-name b {{ color:var(--purple-l); }}
.s-player-meta {{ margin-top:12px; font-size:1.05rem; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }}

.s-stats-row {{ display:flex; justify-content:center; gap:16px; padding:38px 64px 0; }}
.s-stat-card {{ background:var(--surface); border:1px solid var(--border); border-radius:18px;
  padding:20px 34px; text-align:center; position:relative; overflow:hidden; }}
.s-stat-card::before {{ content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg, var(--purple-d), var(--purple)); opacity:.6; }}
.s-stat-card.teal::before {{ background:linear-gradient(90deg, #0d9488, var(--teal)); }}
.s-stat-value {{ font-size:1.7rem; font-weight:900; color:var(--text-bright); letter-spacing:-.03em; line-height:1; margin-bottom:6px; }}
.s-stat-value.purple {{ color:var(--purple-l); }}
.s-stat-value.teal {{ color:var(--teal-l); }}
.s-stat-label {{ font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }}

.s-divider {{ height:1px; margin:40px 64px 0; background:linear-gradient(90deg, transparent, var(--border), transparent); }}

.s-transfer-pair {{ display:flex; align-items:center; justify-content:center; gap:40px; padding:44px 64px 0; }}
.s-transfer-side {{ display:flex; flex-direction:column; align-items:center; gap:16px; width:280px; }}
.s-club-circle {{ width:150px; height:150px; border-radius:50%; background:var(--surface); border:2px solid var(--border2);
  display:flex; align-items:center; justify-content:center; overflow:hidden; }}
.s-club-circle.small {{ width:110px; height:110px; }}
.s-club-circle img {{ width:100%; height:100%; object-fit:contain; padding:14px; }}
.s-club-fallback {{ font-size:2.4rem; color:var(--muted2); }}
.s-club-name {{ font-size:1.3rem; font-weight:800; color:var(--text-bright); text-align:center; letter-spacing:-.01em; }}
.s-club-name.small {{ font-size:1.05rem; font-weight:600; color:var(--muted); }}
.s-transfer-arrow {{ font-size:2.6rem; font-weight:900; color:var(--teal-l); }}

.s-transfer-single {{ display:flex; flex-direction:column; align-items:center; gap:16px; padding:44px 64px 0; }}
.s-renew-label {{ font-size:1.15rem; font-weight:800; letter-spacing:.1em; color:var(--purple-l); margin-top:6px; }}

.s-footer {{ margin-top:auto; padding:24px 64px 48px; display:flex; align-items:center; justify-content:space-between;
  border-top:1px solid rgba(255,255,255,.05); }}
.s-footer-brand {{ font-size:.95rem; font-weight:600; color:var(--muted2); }}
.s-footer-brand span {{ background:linear-gradient(90deg, var(--purple-l), var(--teal-l)); -webkit-background-clip:text;
  -webkit-text-fill-color:transparent; font-weight:800; }}
.s-footer-date {{ font-size:.9rem; color:var(--muted2); }}
</style></head>
<body>
<div class="story">
  <div class="s-header">
    <div class="s-logo">{f'<img src="{scouteado_logo_b64}">' if scouteado_logo_b64 else ''}<div class="s-logo-text">Scouteado</div></div>
    <div class="s-badge-liga">{liga_label}</div>
  </div>

  <div class="s-main">
  <div class="s-status-row">{status_pill}</div>
  {f'<div class="s-confidence">{confidence}</div>' if confidence else ''}

  <div class="s-hero">
    <div class="s-player-avatar" style="{f"background-image:url('{photo}');" if photo else ''}"></div>
    <div class="s-player-name">{first.upper()}<br><b>{last.upper()}</b></div>
    <div class="s-player-meta">{meta_line}</div>
  </div>

  <div class="s-stats-row">{stats_row}</div>

  <div class="s-divider"></div>

  {transfer_block}
  </div>

  <div class="s-footer">
    <div class="s-footer-brand">análisis por <span>Scouteado</span></div>
    <div class="s-footer-date">{today}</div>
  </div>
</div>
</body></html>'''


def slugify(name):
    s = norm(name)
    return s or 'jugador'
