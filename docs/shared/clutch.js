// ── Clutch (Jugadores > Clutch y Equipos > Clutch) ──────────────────────────
// Lee clutch.json, generado por scraper/clutch_stats.py. Criterio NBA: últimos
// 5 minutos del 4.º cuarto y prórrogas enteras, con 5 puntos o menos de diferencia.
// La liga que lo use define SEASON_DIR. Opcionales: canonTeam, y CONF_NORTE/CONF_SUR
// si su HTML tiene el selector de conferencia.

let CLUTCH_DATA = null;      // null = sin cargar, false = no disponible
let _clutchPromise = null;

// Intentos mínimos para que un porcentaje cuente al ordenar
const CLUTCH_MIN_ATT = { tc: 5, t3: 3, tl: 4 };

const clutchState = {
  j: { sort: 'pts', dir: 'desc', conf: 'all' },
  t: { sort: 'wpct', dir: 'desc', conf: 'all' },
};
const CLUTCH_FILTERS = 4;   // filtros por estadística encadenados, como en Tabla

function loadClutch() {
  if (!_clutchPromise) {
    _clutchPromise = fetch(SEASON_DIR + 'clutch.json?v=' + new Date().toISOString().slice(0, 10))
      .then(r => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        if (!data) { CLUTCH_DATA = false; return; }
        const canon = typeof canonTeam === 'function' ? canonTeam : name => name;
        data.jugadores.forEach(p => { p.equipo = canon(p.equipo); clutchDerivePlayer(p); });
        data.equipos.forEach(t => { t.equipo = canon(t.equipo); clutchDeriveTeam(t); });
        CLUTCH_DATA = data;
      })
      .catch(err => { _clutchPromise = null; throw err; }); // permite reintentar
  }
  return _clutchPromise;
}

const _clutchPct = (made, att) => att > 0 ? made / att * 100 : null;

function clutchDerivePlayer(p) {
  p.tcc = p.t2c + p.t3c;
  p.tci = p.t2i + p.t3i;
  p.reb = p.rd + p.ro;
  p.tcPct = _clutchPct(p.tcc, p.tci);
  p.t3Pct = _clutchPct(p.t3c, p.t3i);
  p.tlPct = _clutchPct(p.tlc, p.tli);
}

function clutchDeriveTeam(t) {
  clutchDerivePlayer(t);
  const poss = (fga, fta, oreb, to) => fga + 0.44 * fta - oreb + to;
  const off = poss(t.tci, t.tli, t.ro, t.per);
  const def = poss(t.opp_t2i + t.opp_t3i, t.opp_tli, t.opp_ro, t.opp_per);
  t.wpct = _clutchPct(t.g, t.pj);
  t.min = t.secs / 60;
  t.dif = t.pts - t.opp_pts;
  t.ortg = off > 0 ? t.pts / off * 100 : null;
  t.drtg = def > 0 ? t.opp_pts / def * 100 : null;
  t.net = t.ortg != null && t.drtg != null ? t.ortg - t.drtg : null;
}

// ── Columnas ────────────────────────────────────────────────────────────────
const _cEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const _cNum = v => v == null ? '—' : v;
const _cDec = v => v == null ? '—' : v.toFixed(1);
const _cSigned = (v, dec) => v == null ? '—'
  : `<span class="${v > 0 ? 'qnt-stat-pos' : v < 0 ? 'qnt-stat-neg' : ''}">${v > 0 ? '+' : ''}${v.toFixed(dec)}</span>`;

// Mismos umbrales de color que la tabla básica
const _CLUTCH_PCT_HI = { tcPct: 50, t3Pct: 40, tlPct: 80 };

function _cPctCell(key, attKey, minAtt) {
  return r => {
    if (r[key] == null) return '—';
    const cls = minAtt && r[attKey] < minAtt ? 'clutch-low' : r[key] >= _CLUTCH_PCT_HI[key] ? 'pct-hi' : '';
    return `<span class="${cls}">${r[key].toFixed(1)}%</span>`;
  };
}
const _cShots = (key, label, made, att, tip) =>
  ({ key, label, tip, sortKey: made, html: r => `${r[made]}/${r[att]}` });

const CLUTCH_J_COLS = [
  { key: 'pj',  label: 'PJ',  tip: 'Partidos en los que registró al menos una jugada en el clutch', html: r => r.pj },
  { key: 'pts', label: 'PTS', tip: 'Puntos totales en el clutch', html: r => `<span class="pts-cell">${r.pts}</span>` },
  _cShots('tc', 'TC', 'tcc', 'tci', 'Tiros de campo convertidos / intentados'),
  { key: 'tcPct', label: 'TC%', att: 'tci', minAtt: CLUTCH_MIN_ATT.tc,
    tip: `% de tiros de campo. Al ordenar, solo cuentan quienes tienen ${CLUTCH_MIN_ATT.tc} o más intentos`,
    html: _cPctCell('tcPct', 'tci', CLUTCH_MIN_ATT.tc) },
  _cShots('t2', 'Dobles', 't2c', 't2i', 'Dobles convertidos / intentados'),
  _cShots('t3', 'Triples', 't3c', 't3i', 'Triples convertidos / intentados'),
  { key: 't3Pct', label: '3P%', att: 't3i', minAtt: CLUTCH_MIN_ATT.t3,
    tip: `% de triples. Al ordenar, solo cuentan quienes tienen ${CLUTCH_MIN_ATT.t3} o más intentos`,
    html: _cPctCell('t3Pct', 't3i', CLUTCH_MIN_ATT.t3) },
  _cShots('tl', 'Libres', 'tlc', 'tli', 'Tiros libres convertidos / intentados'),
  { key: 'tlPct', label: 'TL%', att: 'tli', minAtt: CLUTCH_MIN_ATT.tl,
    tip: `% de libres. Al ordenar, solo cuentan quienes tienen ${CLUTCH_MIN_ATT.tl} o más intentos`,
    html: _cPctCell('tlPct', 'tli', CLUTCH_MIN_ATT.tl) },
  { key: 'reb', label: 'REB', tip: 'Rebotes totales en el clutch', html: r => r.reb },
  { key: 'ast', label: 'AST', tip: 'Asistencias totales en el clutch', html: r => r.ast },
  { key: 'rec', label: 'REC', tip: 'Recuperos totales en el clutch', html: r => r.rec },
  { key: 'per', label: 'PÉR', tip: 'Pérdidas totales en el clutch', asc: true, html: r => r.per },
];

const CLUTCH_T_COLS = [
  { key: 'pj',   label: 'PJ',  tip: 'Partidos que tuvieron al menos una jugada en el clutch', html: r => r.pj },
  { key: 'g',    label: 'G',   tip: 'Partidos con clutch que terminó ganando', html: r => r.g },
  { key: 'p',    label: 'P',   tip: 'Partidos con clutch que terminó perdiendo', asc: true, html: r => r.p },
  { key: 'wpct', label: 'G%',  tip: '% de victorias en partidos que tuvieron clutch', html: r => `<strong>${_cDec(r.wpct)}%</strong>` },
  { key: 'min',  label: 'MIN', tip: 'Minutos totales jugados en el clutch', html: r => _cDec(r.min) },
  { key: 'pts',  label: 'PF',  tip: 'Puntos a favor en el clutch', html: r => r.pts },
  { key: 'opp_pts', label: 'PC', tip: 'Puntos en contra en el clutch', asc: true, html: r => r.opp_pts },
  { key: 'dif',  label: '+/-', tip: 'Diferencia de puntos en el clutch', html: r => _cSigned(r.dif, 0) },
  { key: 'ortg', label: 'OffRtg', tip: 'Puntos a favor cada 100 posesiones en el clutch', html: r => _cDec(r.ortg) },
  { key: 'drtg', label: 'DefRtg', tip: 'Puntos en contra cada 100 posesiones en el clutch (menor = mejor)', asc: true, html: r => _cDec(r.drtg) },
  { key: 'net',  label: 'Net', tip: 'OffRtg − DefRtg', html: r => _cSigned(r.net, 1) },
  { key: 'tcPct', label: 'TC%', tip: '% de tiros de campo en el clutch', html: _cPctCell('tcPct') },
  { key: 't3Pct', label: '3P%', tip: '% de triples en el clutch', html: _cPctCell('t3Pct') },
  { key: 'tlPct', label: 'TL%', tip: '% de tiros libres en el clutch', html: _cPctCell('tlPct') },
  { key: 'reb',  label: 'REB', tip: 'Rebotes totales en el clutch', html: r => _cNum(r.reb) },
  { key: 'ast',  label: 'AST', tip: 'Asistencias totales en el clutch', html: r => r.ast },
  { key: 'per',  label: 'PÉR', tip: 'Pérdidas totales en el clutch', asc: true, html: r => r.per },
];

// ── Interfaz: mismos componentes que Jugadores/Equipos > Tabla ──────────────
const _CLUTCH_PREFIX = { j: 'clj', t: 'clt' };
const _CLUTCH_CHEVRON = '<svg class="fcs-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';

function _clutchEl(kind, name) { return document.getElementById(_CLUTCH_PREFIX[kind] + name); }
const _clutchCols = kind => kind === 'j' ? CLUTCH_J_COLS : CLUTCH_T_COLS;
const _clutchHasConf = kind => document.getElementById(`sec-${kind}-clutch`).hasAttribute('data-conf');

// Selector desplegable (.fsb-custom-select) respaldado por un <select> oculto
function _clutchSelect(id, onchange) {
  return `<select id="${id}" onchange="${onchange}" style="display:none"></select>
    <div class="fsb-custom-select" id="${id}Custom" data-select="${id}">
      <div class="fcs-trigger" onclick="fcsToggle('${id}Custom')">
        <div class="fcs-selected"><span class="fcs-name"></span><span class="fcs-sub"></span></div>
        ${_CLUTCH_CHEVRON}
      </div>
      <div class="fcs-dropdown"></div>
    </div>`;
}

// options: [value, nombre, descripción]
function _clutchFillSelect(id, options) {
  const sel = document.getElementById(id);
  const wrap = document.getElementById(id + 'Custom');
  const dd = wrap.querySelector('.fcs-dropdown');
  sel.innerHTML = '';
  dd.innerHTML = '';
  options.forEach(([value, name, sub = '']) => {
    sel.add(new Option(name, value));
    const div = document.createElement('div');
    div.className = 'fcs-option';
    div.dataset.value = value;
    div.innerHTML = `<span class="fcs-name">${_cEsc(name)}</span><span class="fcs-sub">${_cEsc(sub)}</span>`;
    div.addEventListener('click', () => fcsSelect(id + 'Custom', String(value), name, sub));
    dd.appendChild(div);
  });
  _clutchResetSelect(id);
}

// Vuelve a la primera opción sin disparar onchange
function _clutchResetSelect(id) {
  const sel = document.getElementById(id);
  sel.selectedIndex = 0;
  const wrap = document.getElementById(id + 'Custom');
  const opts = wrap.querySelectorAll('.fcs-option');
  opts.forEach((o, i) => o.classList.toggle('selected', i === 0));
  wrap.querySelector('.fcs-selected .fcs-name').textContent = opts[0].querySelector('.fcs-name').textContent;
  wrap.querySelector('.fcs-selected .fcs-sub').textContent = opts[0].querySelector('.fcs-sub').textContent;
}

function _clutchBuild(kind) {
  const sec = document.getElementById(`sec-${kind}-clutch`);
  if (sec.childElementCount) return;
  const x = _CLUTCH_PREFIX[kind];
  const change = `onClutchFilter('${kind}')`;

  const players = kind !== 'j' ? '' : `
      <div class="fsb-group">
        <span class="fsb-lbl">Buscar jugador</span>
        <div class="search-wrap">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" id="${x}Search" placeholder="Nombre..." oninput="${change}"/>
        </div>
      </div>
      <div class="fsb-group">
        <span class="fsb-lbl">Equipo</span>
        ${_clutchSelect(x + 'Team', change)}
      </div>`;
  const conf = !_clutchHasConf(kind) ? '' : `
      <div class="fsb-group">
        <span class="fsb-lbl">Conferencia</span>
        <div class="fsb-pills" id="${x}ConfPills">
          <button class="active" data-conf="all" onclick="setClutchConf('${kind}','all')">Todos</button>
          <button data-conf="norte" onclick="setClutchConf('${kind}','norte')">Norte</button>
          <button data-conf="sur" onclick="setClutchConf('${kind}','sur')">Sur</button>
        </div>
      </div>`;
  const filterRows = Array.from({ length: CLUTCH_FILTERS }, (_, i) => i + 1).map(n => `
        <div class="filter-row" id="${x}Row${n}"${n > 1 ? ' style="display:none"' : ''}>
          <span class="ctrl-filter-badge">${n}</span>
          ${_clutchSelect(x + 'Attr' + n, change)}
          <div class="fsb-op-row">
            <select id="${x}Op${n}" class="op-select" aria-label="Operador" onchange="${change}"><option value="gte">≥</option><option value="lte">≤</option><option value="eq">=</option></select>
            <input type="number" id="${x}Val${n}" placeholder="valor" step="0.1" oninput="${change}"/>
          </div>
        </div>`).join('');

  sec.innerHTML = `
  <div id="${x}Msg" class="qnt-empty">Cargando datos del clutch...</div>
  <div id="${x}Content" style="display:none">
    <div class="ctrl-collapse-toggle" id="${x}CtrlToggle" onclick="toggleCtrl('${x}')">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg>
      Filtros
      <svg class="cct-chevron" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </div>
    <div class="sidebar-layout">
      <div class="ctrl-sidebar" id="${x}CtrlBody">${players}${conf}
      <div class="fsb-group">
        <span class="fsb-lbl">Mínimo PJ en clutch</span>
        ${_clutchSelect(x + 'MinG', change)}
      </div>
      <div class="fsb-group">
        <span class="fsb-lbl">Filtrar por estadística</span>${filterRows}
      </div>
      <div class="fsb-footer">
        <div class="stat-count">Mostrando <span id="${x}Count">—</span> ${kind === 'j' ? 'jugadores' : 'equipos'}</div>
        <button class="clear-btn" onclick="clearClutchFilter('${kind}')">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          Limpiar filtros
        </button>
      </div>
      </div>
      <div class="sidebar-main">
        <p class="clutch-note" id="${x}Note"></p>
        <div class="scroll-bar-outer" id="${x}ScrollOuter"><div class="scroll-bar-inner" id="${x}ScrollInner"></div></div>
        <div class="table-wrap" id="${x}TableWrap">
          <div class="table-card clutch-card-${kind}" id="${x}Card">
            <table><thead id="${x}Thead"></thead><tbody id="${x}Tbody"></tbody></table>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  setupScrollSync(x + 'TableWrap', x + 'ScrollOuter', x + 'ScrollInner');
}

// Opciones que dependen de los datos (una sola vez)
function _clutchPopulate(kind) {
  const x = _CLUTCH_PREFIX[kind];
  if (document.getElementById(x + 'MinG').options.length) return;
  const rows = kind === 'j' ? CLUTCH_DATA.jugadores : CLUTCH_DATA.equipos;
  if (kind === 'j') {
    const teams = [...new Set(rows.map(r => r.equipo))].sort();
    _clutchFillSelect(x + 'Team', [['', 'Todos los equipos'], ...teams.map(t => [t, t])]);
  }
  const maxPJ = Math.max(0, ...rows.map(r => r.pj));
  _clutchFillSelect(x + 'MinG', [[0, 'Todos los PJ'],
    ...[2, 3, 5, 8, 10, 15, 20].filter(n => n <= maxPJ).map(n => [n, `${n}+ PJ`, `Mínimo ${n} partidos con clutch`])]);
  const attrs = [['', '— Atributo —'], ..._clutchCols(kind).filter(c => !c.sortKey).map(c => [c.key, c.label, c.tip]),
    ..._clutchCols(kind).filter(c => c.sortKey).map(c => [c.sortKey, c.label + ' convertidos', c.tip])];
  for (let n = 1; n <= CLUTCH_FILTERS; n++) _clutchFillSelect(x + 'Attr' + n, attrs);
}

// Muestra la fila N+1 solo cuando la fila N tiene un atributo elegido
function _clutchFilterRows(kind) {
  const x = _CLUTCH_PREFIX[kind];
  let show = true;
  for (let n = 2; n <= CLUTCH_FILTERS; n++) {
    show = show && document.getElementById(x + 'Attr' + (n - 1)).value !== '';
    document.getElementById(x + 'Row' + n).style.display = show ? '' : 'none';
    if (!show) {
      _clutchResetSelect(x + 'Attr' + n);
      document.getElementById(x + 'Val' + n).value = '';
    }
  }
}

function onClutchFilter(kind) {
  _clutchFilterRows(kind);
  renderClutch(kind);
}

function setClutchConf(kind, conf) {
  clutchState[kind].conf = conf;
  _clutchEl(kind, 'ConfPills').querySelectorAll('button')
    .forEach(b => b.classList.toggle('active', b.dataset.conf === conf));
  renderClutch(kind);
}

function clearClutchFilter(kind) {
  const x = _CLUTCH_PREFIX[kind];
  if (kind === 'j') {
    document.getElementById(x + 'Search').value = '';
    _clutchResetSelect(x + 'Team');
  }
  _clutchResetSelect(x + 'MinG');
  for (let n = 1; n <= CLUTCH_FILTERS; n++) {
    _clutchResetSelect(x + 'Attr' + n);
    document.getElementById(x + 'Op' + n).value = 'gte';
    document.getElementById(x + 'Val' + n).value = '';
  }
  _clutchFilterRows(kind);
  if (_clutchHasConf(kind)) setClutchConf(kind, 'all');
  else renderClutch(kind);
}

function _clutchShow(kind, message) {
  const msg = _clutchEl(kind, 'Msg');
  msg.textContent = message || '';
  msg.style.display = message ? '' : 'none';
  _clutchEl(kind, 'Content').style.display = message ? 'none' : '';
}

// Qué abarcan los datos. Solo las ligas con PLAYOFF_DATE tienen identificados los playoffs.
function clutchScopeNote(data) {
  if (data.desde) return `Desde el ${data.desde} (Segunda Vuelta).`;
  if (!SEASON_DIR) return 'Son muestras chicas.';
  return typeof PLAYOFF_DATE !== 'undefined' ? 'Incluye playoffs.' : 'Temporada completa.';
}

async function openClutch(kind) {
  _clutchBuild(kind);
  try {
    await loadClutch();
  } catch (err) {
    _clutchShow(kind, 'No se pudieron cargar los datos del clutch. Volvé a entrar a la pestaña para reintentar.');
    return;
  }
  if (!CLUTCH_DATA) { _clutchShow(kind, 'No hay datos de clutch para esta temporada.'); return; }
  if (!CLUTCH_DATA.equipos.length) { _clutchShow(kind, 'Todavía no hubo partidos con situaciones de clutch.'); return; }

  _clutchPopulate(kind);
  const p = CLUTCH_DATA.partidos;
  _clutchEl(kind, 'Note').textContent =
    `Últimos 5 minutos del 4.º cuarto y prórrogas completas, con 5 puntos o menos de diferencia antes de cada jugada. ` +
    `${p.clutch} de ${p.validos} partidos tuvieron clutch. ` +
    clutchScopeNote(CLUTCH_DATA);
  _clutchShow(kind, '');
  renderClutch(kind);
}

function clutchSortBy(kind, key) {
  const st = clutchState[kind];
  if (st.sort === key) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
  else { st.sort = key; st.dir = (_clutchCols(kind).find(c => c.key === key) || {}).asc ? 'asc' : 'desc'; }
  renderClutch(kind);
}

function _clutchSortRows(rows, cols, st) {
  const col = cols.find(c => c.key === st.sort);
  const sign = st.dir === 'desc' ? -1 : 1;
  if (!col) { // columnas de nombre / equipo
    const key = st.sort;
    return rows.sort((a, b) => -sign * a[key].localeCompare(b[key], 'es'));
  }
  const sortKey = col.sortKey || col.key;
  const attKey = col.sortKey ? col.key : null; // columnas convertidos/intentados
  const value = r => (col.minAtt && r[col.att] < col.minAtt) ? null : r[sortKey];
  return rows.sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av == null || bv == null) {
      if (av == null && bv == null) return (b.pts - a.pts) || (b.pj - a.pj);
      return av == null ? 1 : -1; // sin dato o sin muestra: siempre al final
    }
    if (av !== bv) return sign * (av - bv);
    // Empates: en tiros, menos intentos es mejor; después más partidos y mejor resultado
    if (attKey) {
      const att = { tc: 'tci', t2: 't2i', t3: 't3i', tl: 'tli' }[attKey];
      if (a[att] !== b[att]) return a[att] - b[att];
    }
    return (b.pj - a.pj) || ((b.dif || 0) - (a.dif || 0)) || (b.pts - a.pts);
  });
}

function _clutchFiltered(kind) {
  const x = _CLUTCH_PREFIX[kind];
  const conf = clutchState[kind].conf;
  const confSet = conf === 'norte' ? CONF_NORTE : conf === 'sur' ? CONF_SUR : null;
  const minG = Number(document.getElementById(x + 'MinG').value) || 0;
  const conditions = [];
  for (let n = 1; n <= CLUTCH_FILTERS; n++) {
    const key = document.getElementById(x + 'Attr' + n).value;
    const val = parseFloat(document.getElementById(x + 'Val' + n).value);
    if (key && !isNaN(val)) conditions.push({ key, val, op: document.getElementById(x + 'Op' + n).value });
  }
  const passes = (v, { op, val }) => v != null &&
    (op === 'gte' ? v >= val : op === 'lte' ? v <= val : Math.abs(v - val) <= 0.01);

  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const q = kind === 'j' ? norm(document.getElementById(x + 'Search').value.trim()) : '';
  const team = kind === 'j' ? document.getElementById(x + 'Team').value : '';

  return (kind === 'j' ? CLUTCH_DATA.jugadores : CLUTCH_DATA.equipos).filter(r =>
    (!confSet || confSet.has(r.equipo)) && r.pj >= minG &&
    (!team || r.equipo === team) && (!q || norm(r.nombre).includes(q) || norm(r.equipo).includes(q)) &&
    conditions.every(c => passes(r[c.key], c)));
}

function renderClutch(kind) {
  if (!CLUTCH_DATA) return;
  const cols = _clutchCols(kind);
  const st = clutchState[kind];
  const rows = _clutchSortRows(_clutchFiltered(kind), cols, st);

  const arrow = key => st.sort === key ? (st.dir === 'desc' ? 'sd' : 'sa') : '';
  const th = (key, label, tip) => `<th data-k="${key}" data-tip="${_cEsc(tip)}" class="${arrow(key)}">${label}</th>`;
  const nameHead = '<th class="rank-th">#</th>' + (kind === 'j'
    ? th('nombre', 'Jugador', 'Nombre del jugador') + th('equipo', 'Equipo', 'Equipo del jugador')
    : th('equipo', 'Equipo', 'Nombre del equipo'));
  const thead = _clutchEl(kind, 'Thead');
  thead.innerHTML = '<tr>' + nameHead + cols.map(c => th(c.key, c.label, c.tip)).join('') + '</tr>';
  thead.querySelectorAll('th[data-k]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.k;
    if ((k === 'nombre' || k === 'equipo') && st.sort !== k) { st.sort = k; st.dir = 'asc'; renderClutch(kind); }
    else clutchSortBy(kind, k);
  }));

  const teamHtml = eq => `<span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(eq)}<span class="team-name-link" data-team="${_cEsc(eq)}">${_cEsc(eq)}</span></span>`;
  // Medallas solo en el orden principal, como en Tabla
  const medals = st.dir === 'desc' && st.sort === (kind === 'j' ? 'pts' : 'wpct');
  const tbody = _clutchEl(kind, 'Tbody');
  tbody.innerHTML = rows.map((r, i) => {
    const lead = kind === 'j'
      ? `<td><span class="p-name-cell">${playerAvatarHtml(r.nombre, r.equipo, 26)}${_cEsc(r.nombre)}</span></td><td style="background:var(--bg)">${teamHtml(r.equipo)}</td>`
      : `<td style="background:var(--bg)">${teamHtml(r.equipo)}</td>`;
    return `<tr class="${medals && i < 3 ? 'top' + (i + 1) : ''}"><td class="rank-cell">${i + 1}</td>${lead}${cols.map(c => `<td>${c.html(r)}</td>`).join('')}</tr>`;
  }).join('') || `<tr><td colspan="${cols.length + 3}" class="clutch-none">Sin resultados para esos filtros</td></tr>`;
  tbody.querySelectorAll('[data-team]').forEach(el =>
    el.addEventListener('click', () => showTeamGames(el.dataset.team)));

  _clutchEl(kind, 'Count').textContent = rows.length;
  setTimeout(() => remeasureScroll(_CLUTCH_PREFIX[kind] + 'TableWrap'), 30);
}
