// ── Clutch (Jugadores > Clutch y Equipos > Clutch) ──────────────────────────
// Lee clutch.json, generado por scraper/clutch_stats.py. Criterio NBA: últimos
// 5 minutos del 4.º cuarto y prórrogas enteras, con 5 puntos o menos de diferencia.
// La liga que lo use define SEASON_DIR, canonTeam, CONF_NORTE y CONF_SUR (si tiene).

let CLUTCH_DATA = null;      // null = sin cargar, false = no disponible
let _clutchPromise = null;

// Intentos mínimos para que un porcentaje cuente al ordenar
const CLUTCH_MIN_ATT = { tc: 5, t3: 3, tl: 4 };

const clutchState = {
  j: { sort: 'pts', dir: 'desc' },
  t: { sort: 'wpct', dir: 'desc' },
};

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
        data.jugadores.forEach(p => { p.equipo = canonTeam(p.equipo); clutchDerivePlayer(p); });
        data.equipos.forEach(t => { t.equipo = canonTeam(t.equipo); clutchDeriveTeam(t); });
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

function _cPctCell(key, attKey, minAtt) {
  return r => r[key] == null ? '—'
    : `<span class="${minAtt && r[attKey] < minAtt ? 'clutch-low' : ''}">${r[key].toFixed(1)}%</span>`;
}
const _cShots = (key, label, made, att, tip) =>
  ({ key, label, tip, sortKey: made, html: r => `${r[made]}/${r[att]}` });

const CLUTCH_J_COLS = [
  { key: 'pj',  label: 'PJ',  tip: 'Partidos en los que registró al menos una jugada en el clutch', html: r => r.pj },
  { key: 'pts', label: 'PTS', tip: 'Puntos totales en el clutch', html: r => `<strong>${r.pts}</strong>` },
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

// ── Render ──────────────────────────────────────────────────────────────────
const _CLUTCH_PREFIX = { j: 'clj', t: 'clt' };

function _clutchEl(kind, name) { return document.getElementById(_CLUTCH_PREFIX[kind] + name); }

function _clutchShow(kind, message) {
  const msg = _clutchEl(kind, 'Msg');
  msg.textContent = message || '';
  msg.style.display = message ? '' : 'none';
  _clutchEl(kind, 'Content').style.display = message ? 'none' : '';
}

async function openClutch(kind) {
  if (CLUTCH_DATA === null) _clutchShow(kind, 'Cargando datos del clutch...');
  try {
    await loadClutch();
  } catch (err) {
    _clutchShow(kind, 'No se pudieron cargar los datos del clutch. Volvé a entrar a la pestaña para reintentar.');
    return;
  }
  if (!CLUTCH_DATA) { _clutchShow(kind, 'No hay datos de clutch para esta temporada.'); return; }
  if (!CLUTCH_DATA.equipos.length) { _clutchShow(kind, 'Todavía no hubo partidos con situaciones de clutch.'); return; }

  const teamSel = _clutchEl(kind, 'Team');
  if (teamSel && teamSel.options.length <= 1) {
    [...new Set(CLUTCH_DATA.jugadores.map(p => p.equipo))].sort().forEach(eq => teamSel.add(new Option(eq, eq)));
  }
  const p = CLUTCH_DATA.partidos;
  _clutchEl(kind, 'Note').textContent =
    `Últimos 5 minutos del 4.º cuarto y prórrogas completas, con 5 puntos o menos de diferencia antes de cada jugada. ` +
    `${p.clutch} de ${p.validos} partidos tuvieron clutch. ` +
    (SEASON_DIR ? 'Incluye playoffs.' : 'Son muestras chicas.');
  renderClutch(kind);
}

function clutchSortBy(kind, key) {
  const cols = kind === 'j' ? CLUTCH_J_COLS : CLUTCH_T_COLS;
  const st = clutchState[kind];
  if (st.sort === key) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
  else { st.sort = key; st.dir = (cols.find(c => c.key === key) || {}).asc ? 'asc' : 'desc'; }
  renderClutch(kind);
}

function _clutchSortRows(rows, cols, st) {
  const col = cols.find(c => c.key === st.sort);
  const sortKey = col.sortKey || col.key;
  const attKey = col.sortKey ? col.key : null; // columnas convertidos/intentados
  const value = r => (col.minAtt && r[col.att] < col.minAtt) ? null : r[sortKey];
  const sign = st.dir === 'desc' ? -1 : 1;
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

function renderClutch(kind) {
  if (!CLUTCH_DATA) return;
  const cols = kind === 'j' ? CLUTCH_J_COLS : CLUTCH_T_COLS;
  const st = clutchState[kind];
  const conf = _clutchEl(kind, 'Conf') ? _clutchEl(kind, 'Conf').value : '';
  const confSet = conf === 'norte' ? CONF_NORTE : conf === 'sur' ? CONF_SUR : null;

  let rows = (kind === 'j' ? CLUTCH_DATA.jugadores : CLUTCH_DATA.equipos)
    .filter(r => !confSet || confSet.has(r.equipo));
  if (kind === 'j') {
    const team = _clutchEl(kind, 'Team').value;
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const q = norm(_clutchEl(kind, 'Search').value.trim());
    rows = rows.filter(r => (!team || r.equipo === team) && (!q || norm(r.nombre).includes(q)));
  }
  rows = _clutchSortRows([...rows], cols, st);

  const nameHead = kind === 'j'
    ? '<th class="clutch-rank">#</th><th class="clutch-name">Jugador</th><th class="clutch-team">Equipo</th>'
    : '<th class="clutch-rank">#</th><th class="clutch-name">Equipo</th>';
  _clutchEl(kind, 'Thead').innerHTML = '<tr>' + nameHead + cols.map(c =>
    `<th data-k="${c.key}" data-tip="${_cEsc(c.tip)}" class="${st.sort === c.key ? 'qnt-sorted' : ''}">` +
    `${c.label}${st.sort === c.key ? (st.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>`).join('') + '</tr>';
  _clutchEl(kind, 'Thead').querySelectorAll('th[data-k]').forEach(th =>
    th.addEventListener('click', () => clutchSortBy(kind, th.dataset.k)));

  const teamHtml = eq => `<span class="clutch-cell">${teamLogoHtml(eq)}<span class="team-name-link" data-team="${_cEsc(eq)}">${_cEsc(eq)}</span></span>`;
  _clutchEl(kind, 'Tbody').innerHTML = rows.map((r, i) => {
    const lead = kind === 'j'
      ? `<td class="clutch-name"><span class="clutch-cell">${playerAvatarHtml(r.nombre, r.equipo, 26)}${_cEsc(r.nombre)}</span></td><td class="clutch-team">${teamHtml(r.equipo)}</td>`
      : `<td class="clutch-name">${teamHtml(r.equipo)}</td>`;
    return `<tr><td class="clutch-rank">${i + 1}</td>${lead}${cols.map(c => `<td>${c.html(r)}</td>`).join('')}</tr>`;
  }).join('') || `<tr><td colspan="${cols.length + 3}" class="qnt-empty">Sin resultados para esos filtros</td></tr>`;
  _clutchEl(kind, 'Tbody').querySelectorAll('[data-team]').forEach(el =>
    el.addEventListener('click', () => showTeamGames(el.dataset.team)));

  _clutchEl(kind, 'Count').textContent = `${rows.length} ${kind === 'j' ? 'jugadores' : 'equipos'}`;
  _clutchShow(kind, '');
}
