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


def format_height(height):
    h = str(height).strip()
    if not h:
        return None
    return h.replace('.', ',')


def build_card_html(player, dest_club, origin_club, is_renewal, logos_dir, scouteado_logo_b64, liga):
    club_logo = CLUB_LOGO.get(liga, {})
    liga_label = liga.replace('_', ' ').upper()

    name = player['name']
    parts = name.strip().split(' ')
    first = ' '.join(parts[:-1]) if len(parts) > 1 else ''
    last = parts[-1] if parts else name

    position = POSITIONS.get(player.get('position'), player.get('position', '') or '')
    age = player.get('age')
    height = format_height(player.get('height'))
    photo = player.get('image_url') or ''

    dest_name = dest_club['name'] if dest_club else '—'
    dest_logo = b64_file(os.path.join(logos_dir, club_logo.get(player['club_id'], ''))) if dest_club else None

    meta_parts = []
    if age:
        meta_parts.append(f'{age} años')
    if height:
        meta_parts.append(f'{height} m')
    meta_line = ' · '.join(meta_parts)

    if is_renewal:
        status_text = 'RENUEVA CONTRATO'
        transfer_block = f'''
        <div class="ph-transfer-single">
          <div class="ph-club-logo">{f'<img src="{dest_logo}">' if dest_logo else ''}</div>
          <div class="ph-club-name">{dest_name}</div>
        </div>'''
    else:
        status_text = 'FICHAJE CONFIRMADO'
        origin_name = origin_club['name'] if origin_club else (player.get('last_club') or 'Agente libre')
        origin_logo_path = os.path.join(logos_dir, club_logo.get(origin_club['id'], '')) if origin_club else None
        origin_logo = b64_file(origin_logo_path) if origin_logo_path else None
        transfer_block = f'''
        <div class="ph-club">
          <div class="ph-club-logo">{f'<img src="{origin_logo}">' if origin_logo else '<span class="ph-club-fallback">◐</span>'}</div>
          <div class="ph-club-name origin">{origin_name}</div>
        </div>
        <div class="ph-arrow">→</div>
        <div class="ph-club">
          <div class="ph-club-logo">{f'<img src="{dest_logo}">' if dest_logo else ''}</div>
          <div class="ph-club-name">{dest_name}</div>
        </div>'''

    return f'''<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
:root {{
  --bg:#0b0b16; --surface:#18182e; --border:rgba(139,92,246,.22); --border2:rgba(255,255,255,.09);
  --purple:#8b5cf6; --purple-d:#6d28d9; --purple-l:#a78bfa; --teal:#2dd4bf; --teal-l:#5eead4;
  --sky:#38bdf8; --text:#e2e8f0; --text-bright:#f8fafc; --muted:#94a3b8; --muted2:#64748b;
}}
html,body {{ width:1080px; height:1920px; background:var(--bg); font-family:'Inter',sans-serif; color:var(--text); overflow:hidden; }}
.story {{
  width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; background:var(--bg);
  background-image:
    radial-gradient(ellipse 110% 40% at 50% -2%, rgba(139,92,246,.4) 0%, transparent 55%),
    radial-gradient(ellipse 60% 35% at 88% 92%, rgba(45,212,191,.12) 0%, transparent 55%);
}}
.ph-header {{ display:flex; align-items:center; justify-content:space-between; padding:54px 64px 0; }}
.ph-logo img {{ width:78px; height:78px; object-fit:contain; display:block; }}
.ph-badge-live {{ font-size:.85rem; font-weight:800; color:var(--text); background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.16); border-radius:30px; padding:14px 30px; letter-spacing:.06em; }}

.ph-liga-label {{ margin-top:44px; text-align:center; font-size:1.05rem; font-weight:800; letter-spacing:.16em;
  color:var(--teal-l); text-transform:uppercase; }}
.ph-eyebrow {{ margin-top:14px; text-align:center; font-size:1.3rem; font-weight:700; letter-spacing:.14em;
  color:var(--muted); text-transform:uppercase; }}

.ph-hero {{ display:flex; flex-direction:column; align-items:center; padding:40px 64px 0; }}
.ph-photo {{ width:500px; height:480px; border-radius:36px; background:#fff center top/cover no-repeat;
  box-shadow:0 30px 70px rgba(0,0,0,.35); }}
.ph-name-block {{ width:100%; text-align:center; box-sizing:border-box; }}
.ph-name {{ margin-top:34px; font-size:3.6rem; font-weight:900; letter-spacing:-.03em; color:var(--text-bright); line-height:1.06; }}
.ph-position {{ margin-top:12px; font-size:1.5rem; font-weight:800; letter-spacing:.08em; color:var(--sky); text-transform:uppercase; }}
.ph-meta {{ margin-top:6px; font-size:1.2rem; font-weight:500; color:var(--muted); }}

.ph-transfer-box {{ margin:56px 64px 0; background:var(--surface); border:1px solid var(--border2); border-radius:28px;
  padding:36px 44px; display:flex; align-items:center; justify-content:center; gap:44px; }}
.ph-club {{ display:flex; flex-direction:column; align-items:center; gap:14px; width:230px; }}
.ph-club-logo {{ width:120px; height:120px; border-radius:26px; background:var(--bg); border:1px solid var(--border2);
  display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }}
.ph-club-logo img {{ width:100%; height:100%; object-fit:contain; padding:14px; }}
.ph-club-fallback {{ font-size:2.2rem; color:var(--muted2); }}
.ph-club-name {{ font-size:1.15rem; font-weight:700; color:var(--text-bright); text-align:center; letter-spacing:-.01em; }}
.ph-club-name.origin {{ font-weight:500; color:var(--muted); }}
.ph-arrow {{ font-size:1.9rem; color:var(--purple-l); }}
.ph-transfer-single {{ display:flex; flex-direction:column; align-items:center; gap:14px; }}

.ph-status-pill {{ margin:44px auto 0; width:fit-content; font-size:1.05rem; font-weight:800; letter-spacing:.06em;
  color:var(--purple-l); background:rgba(139,92,246,.14); border:1.5px solid rgba(139,92,246,.45);
  border-radius:40px; padding:18px 40px; }}

.ph-footer {{ margin-top:auto; padding:0 64px 90px; text-align:center; }}
.ph-footer-line1 {{ font-size:1.05rem; font-weight:500; color:var(--muted); }}
.ph-footer-line2 {{ margin-top:8px; font-size:1.8rem; font-weight:800; letter-spacing:-.01em; color:var(--text-bright); }}
</style></head>
<body>
<div class="story">
  <div class="ph-header">
    <div class="ph-logo">{f'<img src="{scouteado_logo_b64}">' if scouteado_logo_b64 else ''}</div>
    <div class="ph-badge-live">MERCADO EN VIVO</div>
  </div>

  {f'<div class="ph-liga-label">{liga_label}</div>' if liga_label else ''}
  <div class="ph-eyebrow">{status_text}</div>

  <div class="ph-hero">
    <div class="ph-photo" style="{f"background-image:url('{photo}');" if photo else ''}"></div>
    <div class="ph-name-block">
      <div class="ph-name">{first.upper()}<br>{last.upper()}</div>
      {f'<div class="ph-position">{position.upper()}</div>' if position else ''}
      {f'<div class="ph-meta">{meta_line}</div>' if meta_line else ''}
    </div>
  </div>

  <div class="ph-transfer-box">{transfer_block}</div>

  <div class="ph-status-pill">{status_text}</div>

  <div class="ph-footer">
    <div class="ph-footer-line1">Seguí el mercado completo en</div>
    <div class="ph-footer-line2">scouteado.com</div>
  </div>
</div>
</body></html>'''


def slugify(name):
    s = norm(name)
    return s or 'jugador'
