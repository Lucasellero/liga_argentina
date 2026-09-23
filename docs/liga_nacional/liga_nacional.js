// ── Auth guard ────────────────────────────────────────────────────────────────
(function() {
  const LOGIN_URL    = '../login.html?returnTo=liga_nacional/';
  const REGISTER_URL = '../register.html';
  const token = localStorage.getItem('auth_token');
  let isAuthed = false;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp || Date.now() / 1000 <= payload.exp) {
        isAuthed = true;
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    } catch(e) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  }
  if (isAuthed) {
    try {
      const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
      if (user.nombre) {
        const el = document.getElementById('headerUser');
        if (el) {
          document.getElementById('headerUserName').textContent = user.nombre + ' ' + (user.apellido || '');
          el.style.display = 'flex';
        }
      }
      const ADMIN_EMAILS = ['ramiellero@gmail.com', 'nachodacunda08@gmail.com', 'lucasellero05@gmail.com'];
      if (user.email && ADMIN_EMAILS.includes(String(user.email).toLowerCase())) {
        const adminWrap = document.getElementById('mktAdminWrap');
        if (adminWrap) adminWrap.style.display = 'flex';
      }
    } catch(e) {}
    const loginEl = document.getElementById('headerLogin');
    if (loginEl) loginEl.style.display = 'none';
  } else {
    const delay = 300000; // 5 min
    const SK = 'scouteado_session_start';
    if (!sessionStorage.getItem(SK)) sessionStorage.setItem(SK, Date.now());
    const elapsed = Date.now() - parseInt(sessionStorage.getItem(SK));
    const remaining = Math.max(0, delay - elapsed);
    setTimeout(function() {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(11,11,22,.93);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;';
      ov.innerHTML = '<div style="background:#18182e;border:1px solid rgba(139,92,246,.25);border-radius:18px;padding:40px 36px;width:100%;max-width:400px;text-align:center;box-shadow:0 8px 48px rgba(0,0,0,.65);">'
        + '<div style="width:80px;height:80px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><img src="logos/scouteado_logo.png" alt="Scouteado" style="width:130px;height:130px;object-fit:contain;"></div>'
        + '<h2 style="color:#f8fafc;font-size:1.3rem;font-weight:700;margin-bottom:8px;">¡Seguí explorando!</h2>'
        + '<p style="color:#64748b;font-size:.88rem;margin-bottom:28px;line-height:1.55;">Creá tu cuenta gratis para continuar navegando las estadísticas de la liga.</p>'
        + '<a href="' + LOGIN_URL + '" style="display:block;padding:13px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;font-weight:600;font-size:.92rem;border-radius:10px;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 18px rgba(139,92,246,.4);">Iniciar sesión</a>'
        + '<a href="' + REGISTER_URL + '" style="display:block;padding:13px;background:transparent;color:#a78bfa;font-weight:600;font-size:.92rem;border-radius:10px;text-decoration:none;border:1.5px solid rgba(139,92,246,.38);">Registrarme gratis</a>'
        + '<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(139,92,246,.15);display:flex;align-items:center;justify-content:center;gap:18px;">'
        + '<a href="mailto:scoutea2@gmail.com" style="color:#64748b;text-decoration:none;font-size:.76rem;display:inline-flex;align-items:center;gap:5px;transition:color .2s;" onmouseover="this.style.color=\'#a78bfa\'" onmouseout="this.style.color=\'#64748b\'">✉ scoutea2@gmail.com</a>'
        + '<a href="https://instagram.com/scouteado" target="_blank" rel="noopener noreferrer" style="color:#64748b;text-decoration:none;font-size:.76rem;display:inline-flex;align-items:center;gap:5px;transition:color .2s;" onmouseover="this.style.color=\'#5eead4\'" onmouseout="this.style.color=\'#64748b\'"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><rect x=\'2\' y=\'2\' width=\'20\' height=\'20\' rx=\'5\' ry=\'5\'/><circle cx=\'12\' cy=\'12\' r=\'4.5\'/><circle cx=\'17.5\' cy=\'6.5\' r=\'1\' fill=\'currentColor\' stroke=\'none\'/></svg> @scouteado</a>'
        + '</div>'
        + '</div>';
      document.body.appendChild(ov);
    }, remaining);
  }
})();

function authLogout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.location.replace('../login.html?returnTo=liga_nacional/');
}

// ============================================================
// ============================================================
// DATA — loaded dynamically from CSV
// ============================================================
const SEASON = new URLSearchParams(location.search).get('season') === '2025-26' ? '2025-26' : 'live';
const SEASON_DIR = SEASON === '2025-26' ? 'archive/2025-26/' : '';
const CSV_PATH = SEASON_DIR + 'liga_nacional.csv';
const DOB_PATH = '../shared/players_dob.csv';

(function renderSeasonToggle() {
  const pillBase = 'display:inline-flex;align-items:center;justify-content:center;gap:5px;font-size:0.68rem;font-weight:700;padding:3px 10px;border-radius:20px;min-width:120px;';
  const activeStyle = pillBase + 'color:var(--teal-l,#5eead4);border:1.5px solid rgba(45,212,191,.7);background:rgba(45,212,191,.22);cursor:default;';
  const linkStyle = pillBase + 'font-weight:600;color:var(--purple-l,#a78bfa);text-decoration:none;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.08);';
  const seasons = [
    { key: 'live', label: 'Temporada 2026/27' },
    { key: '2025-26', label: 'Temporada 2025/26' },
  ];
  const html = seasons.map(s => {
    const isActive = s.key === SEASON;
    if (isActive) return '<span style="' + activeStyle + '">' + s.label + '</span>';
    const href = s.key === 'live' ? location.pathname : location.pathname + '?season=' + s.key;
    return '<a href="' + href + '" style="' + linkStyle + '" onmouseover="this.style.background=\'rgba(139,92,246,.18)\'" onmouseout="this.style.background=\'rgba(139,92,246,.08)\'">' + s.label + '</a>';
  }).join('');
  const el = document.getElementById('seasonToggle');
  if (el) el.innerHTML = html;
  const sub = document.getElementById('seasonSubtitle');
  if (sub) sub.textContent = 'Liga Nacional · ' + (SEASON === '2025-26' ? 'Temporada 2025/26 (archivada)' : 'Temporada Regular 2026/2027');
})();
let DOB_MAP = {};
let TEAM_MAP = {}, PLAYERS = [], TEAMS = [];
let GAMES_ALL = [];        // all unique games (deduplicated)

// Upcoming fixture — hardcoded; merged into GAMES_ALL, deduped against played games
let GAME_PLAYERS_MAP = {}; // IdPartido → player rows[]
let _partidoMode = false;  // true when modal is opened from sec-partidos


function buildRAW_T(rows) {
  const map = {}, byGame = {};
  const tots = rows.filter(r => r['Nombre completo'] === 'TOTALES');

  // Build player-row sums per game per team — used as fallback when a team's
  // TOTALES row is missing (the CSV only has 1 TOTALES row per game).
  const playerSums = {};
  rows.filter(r => r['Nombre completo'] !== 'TOTALES').forEach(r => {
    const key = r['IdPartido'] + '||' + r['Equipo'];
    if (!playerSums[key]) playerSums[key] = {
      pts:0, t2a:0, t2i:0, t3a:0, t3i:0, t1a:0, t1i:0,
      dreb:0, oreb:0, treb:0, ast:0, rec:0, per:0, tap:0, val:0
    };
    const s = playerSums[key];
    s.pts  += parseFloat(r['Puntos'])||0;
    s.t2a  += parseFloat(r['T2A'])||0;   s.t2i  += parseFloat(r['T2I'])||0;
    s.t3a  += parseFloat(r['T3A'])||0;   s.t3i  += parseFloat(r['T3I'])||0;
    s.t1a  += parseFloat(r['T1A'])||0;   s.t1i  += parseFloat(r['T1I'])||0;
    s.dreb += parseFloat(r['DReb'])||0;  s.oreb += parseFloat(r['OReb'])||0;
    s.treb += parseFloat(r['TReb'])||0;  s.ast  += parseFloat(r['Asistencias'])||0;
    s.rec  += parseFloat(r['Recuperos'])||0; s.per += parseFloat(r['Perdidas'])||0;
    s.tap  += parseFloat(r['Tapones cometidos'])||0; s.val += parseFloat(r['Valoracion'])||0;
  });

  const extractS = r => ({
    pts:  parseFloat(r['Puntos'])||0,
    t2a:  parseFloat(r['T2A'])||0,   t2i: parseFloat(r['T2I'])||0,
    t3a:  parseFloat(r['T3A'])||0,   t3i: parseFloat(r['T3I'])||0,
    t1a:  parseFloat(r['T1A'])||0,   t1i: parseFloat(r['T1I'])||0,
    dreb: parseFloat(r['DReb'])||0,  oreb: parseFloat(r['OReb'])||0,
    treb: parseFloat(r['TReb'])||0,  ast:  parseFloat(r['Asistencias'])||0,
    rec:  parseFloat(r['Recuperos'])||0, per: parseFloat(r['Perdidas'])||0,
    tap:  parseFloat(r['Tapones cometidos'])||0, val: parseFloat(r['Valoracion'])||0,
  });
  const extractSFromSums = s => ({
    pts: s.pts||0, t2a: s.t2a||0, t2i: s.t2i||0,
    t3a: s.t3a||0, t3i: s.t3i||0, t1a: s.t1a||0, t1i: s.t1i||0,
    dreb: s.dreb||0, oreb: s.oreb||0, treb: s.treb||0,
    ast: s.ast||0, rec: s.rec||0, per: s.per||0, tap: s.tap||0, val: s.val||0,
  });

  // Deduplicate: same physical game scraped multiple times with different IdPartido values.
  // Keep one row per (Fecha, Equipo, Rival) combination.
  const _seenTot = new Set();
  const totsDeduped = tots.filter(r => {
    const k = r['Fecha'] + '||' + r['Equipo'] + '||' + r['Rival'];
    if (_seenTot.has(k)) return false;
    _seenTot.add(k); return true;
  });

  // Group by physical game: (Fecha, sorted teams). This pairs LOCAL and VISITANTE rows
  // that may have different IdPartido values but represent the same real game.
  totsDeduped.forEach(r => {
    const teams = [r['Equipo'], r['Rival']].sort().join('|');
    const key = r['Fecha'] + '||' + teams;
    if (!byGame[key]) byGame[key] = [];
    byGame[key].push(r);
  });
  totsDeduped.forEach(r => {
    const eq = r['Equipo'];
    if (!map[eq]) map[eq] = {
      Equipo: eq, PJ: 0, Ganados: 0, Perdidos: 0, OPP_PTS: 0,
      LocalG: 0, LocalP: 0, VisitG: 0, VisitP: 0, OPP_DReb: 0, OPP_RO: 0,
      _games: [], _gamelog: [],
      PTS: 0, T2A: 0, T2I: 0, T3A: 0, T3I: 0,
      T1A: 0, T1I: 0, RD: 0, RO: 0, RT: 0, AST: 0, REC: 0, PER: 0, TAP: 0, VAL: 0
    };
    const t = map[eq];
    const ganado = r['Ganado'] === 'True';
    const esLocal = r['Condicion equipos'] === 'LOCAL';
    t.PJ++; if (ganado) t.Ganados++; else t.Perdidos++;
    if (esLocal) { if (ganado) t.LocalG++; else t.LocalP++; }
    else         { if (ganado) t.VisitG++; else t.VisitP++; }
    t._games.push({ fecha: r['Fecha'], ganado });
    t.PTS += parseFloat(r['Puntos']) || 0;
    t.T2A += parseFloat(r['T2A']) || 0; t.T2I += parseFloat(r['T2I']) || 0;
    t.T3A += parseFloat(r['T3A']) || 0; t.T3I += parseFloat(r['T3I']) || 0;
    t.T1A += parseFloat(r['T1A']) || 0; t.T1I += parseFloat(r['T1I']) || 0;
    t.RD  += parseFloat(r['DReb']) || 0; t.RO  += parseFloat(r['OReb']) || 0;
    t.RT  += parseFloat(r['TReb']) || 0; t.AST += parseFloat(r['Asistencias']) || 0;
    t.REC += parseFloat(r['Recuperos']) || 0; t.PER += parseFloat(r['Perdidas']) || 0;
    t.TAP += parseFloat(r['Tapones cometidos']) || 0; t.VAL += parseFloat(r['Valoracion']) || 0;
  });
  Object.values(byGame).forEach(gr => {
    const localRow = gr.find(r => r['Condicion equipos'] === 'LOCAL');
    const visitRow = gr.find(r => r['Condicion equipos'] === 'VISITANTE');
    if (localRow && visitRow) {
      // Both sides present. Use LOCAL's IdPartido as canonical gameId.
      const canonId = localRow['IdPartido'];
      [localRow, visitRow].forEach(my => {
        const opp = my === localRow ? visitRow : localRow;
        if (map[my['Equipo']]) {
          map[my['Equipo']].OPP_PTS += parseFloat(opp['Puntos']) || 0;
          map[my['Equipo']].OPP_DReb += parseFloat(opp['DReb']) || 0;
          map[my['Equipo']].OPP_RO += parseFloat(opp['OReb']) || 0;
          map[my['Equipo']]._gamelog.push({
            gameId: canonId,
            fecha: my['Fecha'],
            rival: opp['Equipo'],
            condicion: my['Condicion equipos'],
            ptsFor: parseFloat(my['Puntos']) || 0,
            ptsAgainst: parseFloat(opp['Puntos']) || 0,
            ganado: my['Ganado'] === 'True',
            estadio: my['Estadio'] || '',
            myS: extractS(my), oppS: extractS(opp),
          });
        }
      });
    } else {
      // Only one team's TOTALES row present — derive rival stats from player sums.
      const my = gr[0];
      const rivalKey = my['IdPartido'] + '||' + my['Rival'];
      const opp = playerSums[rivalKey] || {};
      const myGanado = my['Ganado'] === 'True';
      const myCond   = my['Condicion equipos'];
      const oppCond  = myCond === 'LOCAL' ? 'VISITANTE' : 'LOCAL';
      const myPts    = parseFloat(my['Puntos']) || 0;
      const oppPts   = opp.pts || 0;
      const myS      = extractS(my);
      const oppS     = extractSFromSums(opp);
      const canonId  = my['IdPartido'];
      if (map[my['Equipo']]) {
        map[my['Equipo']].OPP_PTS  += oppPts;
        map[my['Equipo']].OPP_DReb += opp.dreb || 0;
        map[my['Equipo']].OPP_RO   += opp.oreb || 0;
        map[my['Equipo']]._gamelog.push({
          gameId: canonId, fecha: my['Fecha'],
          rival: my['Rival'], condicion: myCond,
          ptsFor: myPts, ptsAgainst: oppPts,
          ganado: myGanado, estadio: my['Estadio'] || '',
          myS, oppS,
        });
      }
      if (map[my['Rival']]) {
        map[my['Rival']].OPP_PTS  += myPts;
        map[my['Rival']].OPP_DReb += myS.dreb;
        map[my['Rival']].OPP_RO   += myS.oreb;
        map[my['Rival']]._gamelog.push({
          gameId: canonId, fecha: my['Fecha'],
          rival: my['Equipo'], condicion: oppCond,
          ptsFor: oppPts, ptsAgainst: myPts,
          ganado: !myGanado, estadio: my['Estadio'] || '',
          myS: oppS, oppS: myS,
        });
      }
    }
  });
  Object.values(map).forEach(t => {
    const pj = t.PJ || 1;
    t['W%'] = t.PJ > 0 ? (t.Ganados / t.PJ) * 100 : 0;
    const tci = (t.T2I||0) + (t.T3I||0);
    const poss = tci + 0.44*(t.T1I||0) + (t.PER||0);
    t.POSPG  = poss > 0 ? Math.round(poss/pj*10)/10 : null;
    t.ORtg   = poss > 0 ? Math.round(t.PTS/poss*100*10)/10 : null;
    t.DRtg   = poss > 0 ? Math.round(t.OPP_PTS/poss*100*10)/10 : null;
    t.NetRtg = (t.ORtg!=null&&t.DRtg!=null) ? Math.round((t.ORtg-t.DRtg)*10)/10 : null;
    t['T2%'] = t.T2I > 0 ? Math.round(t.T2A/t.T2I*1000)/10 : null;
    t['T3%'] = t.T3I > 0 ? Math.round(t.T3A/t.T3I*1000)/10 : null;
    t['T1%'] = t.T1I > 0 ? Math.round(t.T1A/t.T1I*1000)/10 : null;
    const sortByFecha = (a, b) => {
      const [ad,am,ay] = a.fecha.split('/'); const [bd,bm,by] = b.fecha.split('/');
      return new Date(ay,am-1,ad) - new Date(by,bm-1,bd);
    };
    t.last5 = t._games.sort(sortByFecha).slice(-5).map(g => g.ganado);
    t._gamelog.sort(sortByFecha);
  });
  return Object.values(map);
}


const MAP_J = {T2A:'T2APG',T2I:'T2IPG',T3A:'T3APG',T3I:'T3IPG',T1A:'T1APG',T1I:'T1IPG',
               RD:'RDPG',RO:'ROPG',RT:'RPG',AST:'APG',REC:'SPG',PER:'TPG',TAP:'BPG',VAL:'VPG',PTS:'PPG'};
// (PLAYERS and TEAMS declared at top with TEAM_MAP)

// Team per-game
// (TEAMS declared at top with TEAM_MAP)

// Colors
const PALETTE=['#7c3aed','#0d9488','#d97706','#dc2626','#2563eb','#db2777',
  '#059669','#9333ea','#0891b2','#ea580c','#65a30d','#7c3aed',
  '#be123c','#0f766e','#b45309','#1d4ed8','#6d28d9','#047857',
  '#c2410c','#0369a1','#4d7c0f','#7e22ce','#0e7490','#92400e',
  '#1e40af','#166534','#9d174d','#075985','#365314','#581c87',
  '#7f1d1d','#134e4a','#1c1917','#312e81'];
const TEAM_COLORS={};

const LBL_J={PPG:'PTS/p',VPG:'VAL/p',RPG:'REB/p',APG:'AST/p',SPG:'REC/p',BPG:'TAP/p',TPG:'PÉR/p',ORtg:'ORtg',DRtg:'DRtg',NetRtg:'NetRtg','USG%':'USG%','ORB%':'ORB%',
  T2APG:'T2C/p',T3APG:'T3C/p',T1APG:'T1C/p','T2%':'% T2','T3%':'% T3','T1%':'% T1',
  RDPG:'RD/p',ROPG:'RO/p',MPG:'MIN/p',PJ:'PJ',T2IPG:'T2I/p',T3IPG:'T3I/p'};
const LBL_T={ORtg:'ORtg',DRtg:'DRtg',NetRtg:'NetRtg','W%':'W%',PTSPG:'PTS/p',POSPG:'POS/p',PACE:'PACE',
  RTPG:'REB/p',ASTPG:'AST/p',RECPG:'REC/p',PERPG:'PÉR/p','T2%':'% T2','T3%':'% T3','T1%':'% T1',
  T3IPG:'T3I/p',TAPPG:'TAP/p',VALPG:'VAL/p',PJ:'PJ',
  'EFG%':'EFG%','TS%':'TS%','TOV%':'TOV%','ORB%':'ORB%'};

// ============================================================
// STATE
// ============================================================
let jFiltered=[], tFiltered=[];
let jSort='PPG', jDir='desc';
let jPeriod='all';
let jPhase='all'; // 'all' | 'regular' | 'post'
let jLocVis='all';
let tPeriod='all';
let tPhase='all'; // 'all' | 'regular' | 'post'
let tLocVis='all';
let lPhase='post';
let szcPeriod='all';
let szcLocVis='all';
let szcCurrentIdx=-1;
let szcPlayerAllShots=[];
let szcPlayerGameIds=null;
let tzcPeriod='all';
let tzcLocVis='all';
let tzcCurrentTeam=null;
let tzcTeamAllShots=[];
let tzcTeamGameIds=null;
let tSort='W%', tDir='desc';
let jPts=[], tPts=[];
let jHov=-1, jPin=new Set(), tHov=-1, tPin=-1;

// ── SHOTS DATA ──────────────────────────────────────
const SHOTS_CSV = SEASON_DIR + 'liga_nacional_shots.csv';
let SHOTS_MAP = null;        // null=not loaded, Map keyed by shots CSV IdPartido
let SHOTS_STABLE_MAP = null; // Map keyed by "fecha|local|visit" (cross-CSV stable key)
let PRED_MAP  = {};   // keyed by "fecha|local|visitante" → {prob_local, prob_visit}
let SHOTS_BY_PLAYER = null; // Map keyed by "Equipo||Dorsal"
let LEAGUE_ZONE_STATS = null;
let _smState = { gameId: null, fecha: null, local: '', visit: '', focusTeam: null, filter: { team: 'all', tipo: 'all', result: 'all' } };

const f2=v=>v==null||isNaN(v)?'—':v.toFixed(2);
const f1=v=>v==null||isNaN(v)?'—':v.toFixed(1);

// ============================================================
// NAV
// ============================================================
const _SUB_GROUP = {
  't-tabla':'equipos','t-tcmp':'equipos','t-chart':'equipos','quintetos':'equipos','trios':'equipos','duplas':'equipos','t-tiro':'equipos','t-conexiones':'equipos',
  'j-tabla':'jugadores','j-tiro':'jugadores','j-chart':'jugadores','j-conexiones':'jugadores','j-radar':'jugadores'
};
const _SUB_IDX = {
  't-tabla':0,'t-tcmp':1,'t-chart':2,'quintetos':3,'trios':4,'duplas':5,'t-tiro':6,'t-conexiones':7,
  'j-tabla':0,'j-tiro':1,'j-chart':2,'j-conexiones':3,'j-radar':4
};


function switchSection(id) {
  const isTcmp = id === 't-tcmp';
  const domId = isTcmp ? 't-tabla' : id;
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.remove('active','grp-active'));
  document.querySelectorAll('.sub-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+domId).classList.add('active');
  const grp = _SUB_GROUP[id];
  if (grp) {
    const grpBtn = document.getElementById(grp==='equipos'?'grpEquipos':'grpJugadores');
    grpBtn.classList.add('active','grp-active');
    document.getElementById('subEquipos').style.display = grp==='equipos' ? '' : 'none';
    document.getElementById('subJugadores').style.display = grp==='jugadores' ? '' : 'none';
    const subId = grp==='equipos' ? 'subEquipos' : 'subJugadores';
    document.querySelectorAll('#'+subId+' .sub-tab')[_SUB_IDX[id]].classList.add('active');
  } else {
    document.getElementById('subEquipos').style.display = 'none';
    document.getElementById('subJugadores').style.display = 'none';
    const _btn = Array.from(document.querySelectorAll('.main-tab')).find(b => b.getAttribute('onclick') === "switchSection('"+id+"')");
    if (_btn) _btn.classList.add('active');
    else if (event && event.currentTarget) event.currentTarget.classList.add('active');
  }
  const _grpName = _SUB_GROUP[id];
  history.replaceState(null, '', '#' + (_grpName ? _grpName + '/' + id : id));
  // t-tcmp: show cmpPanel full-width, hide sidebar; t-tabla: hide cmpPanel, show sidebar
  if (domId === 't-tabla') {
    document.getElementById('cmpPanel').style.display = isTcmp ? 'block' : 'none';
    document.getElementById('tCtrlBody').style.display = isTcmp ? 'none' : '';
  }
  if(id==='partidos') showUpcomingDefault();
  if(id==='j-tiro') {
    const main = document.getElementById('szcMain');
    if (main && main.style.display !== 'block') {
      const _norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      const idx = PLAYERS.findIndex(p => _norm(p['Nombre completo']).includes('BARRALES') && _norm(p.Equipo).includes('OBERA'));
      if (idx >= 0) selectSzcPlayer(idx);
    }
  }
  if(id==='j-radar' && _radarIdxA === null) {
    const _norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const idx = PLAYERS.findIndex(p => _norm(p['Nombre completo']).includes('CAFFARO'));
    if (idx >= 0) {
      _radarIdxA = idx;
      document.getElementById('radarInputA').value = PLAYERS[idx]['Nombre completo'];
      radarRender();
    }
  }
  if(id==='j-chart') setTimeout(drawJChart,30);
  if(id==='j-conexiones') { cnxInit(); setTimeout(drawConnections,30); }
  if(id==='trios') { trioInit(); }
  if(id==='duplas') { dupInit(); }
  if(id==='t-tiro') { tzcInit(); }
  if(id==='t-conexiones') { tCnxInit(); }
  if(id==='t-chart') setTimeout(drawTChart,30);
  if(id==='j-tabla') setTimeout(()=>remeasureScroll('jTableWrap'), 50);
  if(id==='t-tabla'||isTcmp) setTimeout(()=>remeasureScroll('tTableWrap'), 50);
  if(id==='quintetos') {
    const sel = document.getElementById('qntTeam');
    if (sel.options.length <= 1) {
      [...new Set(TEAMS.map(t=>t.Equipo))].sort().forEach(eq => {
        const o = document.createElement('option'); o.value = eq; o.textContent = eq;
        sel.appendChild(o);
      });
    }
    if (PBP_MAP === null) {
      const loading = document.getElementById('qntLoading');
      const empty = document.getElementById('qntEmpty');
      loading.style.display = ''; empty.style.display = 'none';
      loadPbp().then(() => { if (LINEUP_DATA === null) computeLineups(); renderQuintetos(); });
    } else {
      if (LINEUP_DATA === null) computeLineups();
      renderQuintetos();
    }
  }
}

// ============================================================
// PLAYER FILTERS
// ============================================================
function getJFiltered() {
  const s=document.getElementById('jSearch').value.toLowerCase();
  const team=document.getElementById('jTeam').value;
  const minG=parseInt(document.getElementById('jMinG').value)||0;
  const ak=document.getElementById('jAttr').value;
  const op=document.getElementById('jOp').value;
  const av=parseFloat(document.getElementById('jAttrVal').value);
  const ak2=document.getElementById('jAttr2').value;
  const op2=document.getElementById('jOp2').value;
  const av2=parseFloat(document.getElementById('jAttrVal2').value);
  const ak3=document.getElementById('jAttr3').value;
  const op3=document.getElementById('jOp3').value;
  const av3=parseFloat(document.getElementById('jAttrVal3').value);
  const ak4=document.getElementById('jAttr4').value;
  const op4=document.getElementById('jOp4').value;
  const av4=parseFloat(document.getElementById('jAttrVal4').value);
  function chk(v,op,av){if(op==='gte'&&v<av)return false;if(op==='lte'&&v>av)return false;if(op==='eq'&&Math.abs(v-av)>0.01)return false;return true;}
  return PLAYERS.filter(p=>{
    if(team&&p.Equipo!==team)return false;
    if(p.PJ<minG)return false;
    if(s&&!p.name.toLowerCase().includes(s)&&!p.Equipo.toLowerCase().includes(s))return false;
    if(jPhase==='regular'&&!p._regular)return false;
    if(jPhase==='post'&&!p._post)return false;
    if(ak&&!isNaN(av)&&!chk(p[ak],op,av))return false;
    if(ak2&&!isNaN(av2)&&!chk(p[ak2],op2,av2))return false;
    if(ak3&&!isNaN(av3)&&!chk(p[ak3],op3,av3))return false;
    if(ak4&&!isNaN(av4)&&!chk(p[ak4],op4,av4))return false;
    return true;
  });
}


function getPlayerData(p) {
  if(jPhase==='regular'){
    if(jLocVis==='local') return p._regularLocal||p._regular||p;
    if(jLocVis==='visit') return p._regularVisit||p._regular||p;
    return p._regular||p;
  }
  if(jPhase==='post'){
    if(jLocVis==='local') return p._postLocal||p._post||p;
    if(jLocVis==='visit') return p._postVisit||p._post||p;
    return p._post||p;
  }
  if(jLocVis==='local'){
    if(jPeriod==='last5'&&p._last5Local)return p._last5Local;
    if(jPeriod==='last10'&&p._last10Local)return p._last10Local;
    if(p._local)return p._local;
  }
  if(jLocVis==='visit'){
    if(jPeriod==='last5'&&p._last5Visit)return p._last5Visit;
    if(jPeriod==='last10'&&p._last10Visit)return p._last10Visit;
    if(p._visit)return p._visit;
  }
  if(jPeriod==='last5'&&p._last5)return p._last5;
  if(jPeriod==='last10'&&p._last10)return p._last10;
  return p;
}


function setJPhase(v) {
  jPhase=v;
  ['jPhaseAll','jPhaseReg','jPhasePost'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'jPhaseAll',regular:'jPhaseReg',post:'jPhasePost'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  onJFilter();
}


document.querySelectorAll('#sec-j-tabla thead th').forEach(th=>{
  th.addEventListener('click',()=>{
    if(jSort===th.dataset.c)jDir=jDir==='desc'?'asc':'desc';
    else{jSort=th.dataset.c;jDir=th.dataset.d||'desc';}
    renderJTable();
  });
});


function toggleCtrl(prefix) {
  const toggle = document.getElementById(prefix + 'CtrlToggle');
  const body = document.getElementById(prefix + 'CtrlBody');
  const isVisible = window.getComputedStyle(body).display !== 'none';
  body.style.display = isVisible ? 'none' : 'flex';
  toggle.classList.toggle('cct-open', !isVisible);
}

// ============================================================
// ADVANCED TABLE
// ============================================================
let jAdvSort='EFG%', jAdvDir='desc';


document.querySelectorAll('#jCardAdv thead th').forEach(th=>{
  th.addEventListener('click',()=>{
    if(jAdvSort===th.dataset.ca)jAdvDir=jAdvDir==='desc'?'asc':'desc';
    else{jAdvSort=th.dataset.ca;jAdvDir=th.dataset.da||'desc';}
    renderJAdvTable();
  });
});
// ============================================================
// TEAM FILTERS
// ============================================================
function getTFiltered() {
  const ak=document.getElementById('tAttr').value;
  const op=document.getElementById('tOp').value;
  const av=parseFloat(document.getElementById('tAttrVal').value);
  const ak2=document.getElementById('tAttr2').value;
  const op2=document.getElementById('tOp2').value;
  const av2=parseFloat(document.getElementById('tAttrVal2').value);
  const ak3=document.getElementById('tAttr3').value;
  const op3=document.getElementById('tOp3').value;
  const av3=parseFloat(document.getElementById('tAttrVal3').value);
  const ak4=document.getElementById('tAttr4').value;
  const op4=document.getElementById('tOp4').value;
  const av4=parseFloat(document.getElementById('tAttrVal4').value);
  function chk(v,op,av){if(op==='gte'&&v<av)return false;if(op==='lte'&&v>av)return false;if(op==='eq'&&Math.abs(v-av)>0.01)return false;return true;}
  return TEAMS.filter(t=>{
    if(tPhase==='regular'&&!t._regular)return false;
    if(tPhase==='post'&&!t._post)return false;
    if(ak&&!isNaN(av)&&!chk(t[ak],op,av))return false;
    if(ak2&&!isNaN(av2)&&!chk(t[ak2],op2,av2))return false;
    if(ak3&&!isNaN(av3)&&!chk(t[ak3],op3,av3))return false;
    if(ak4&&!isNaN(av4)&&!chk(t[ak4],op4,av4))return false;
    return true;
  });
}


let tAdvSort='NetRtg', tAdvDir='desc';


function getTeamData(t) {
  if(tPhase==='regular'){
    if(tLocVis==='local') return t._regularLocal||t._regular||t;
    if(tLocVis==='visit') return t._regularVisit||t._regular||t;
    return t._regular||t;
  }
  if(tPhase==='post'){
    if(tLocVis==='local') return t._postLocal||t._post||t;
    if(tLocVis==='visit') return t._postVisit||t._post||t;
    return t._post||t;
  }
  if(tLocVis==='local'){
    if(tPeriod==='last5'&&t._last5Local)return t._last5Local;
    if(tPeriod==='last10'&&t._last10Local)return t._last10Local;
    if(t._local)return t._local;
  }
  if(tLocVis==='visit'){
    if(tPeriod==='last5'&&t._last5Visit)return t._last5Visit;
    if(tPeriod==='last10'&&t._last10Visit)return t._last10Visit;
    if(t._visit)return t._visit;
  }
  if(tPeriod==='last5'&&t._last5)return t._last5;
  if(tPeriod==='last10'&&t._last10)return t._last10;
  return t;
}


function setTPhase(v) {
  tPhase=v;
  ['tPhaseAll','tPhaseReg','tPhasePost'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'tPhaseAll',regular:'tPhaseReg',post:'tPhasePost'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  onTFilter();
}

function setLPhase(v) {
  lPhase=v;
  const sel=document.getElementById('lPhaseSelect'); if(sel) sel.value=v;
  const titleEl=document.getElementById('leadersTitle');
  const subEl=document.getElementById('leadersSubtitle');
  if(titleEl) titleEl.innerHTML = v==='post' ? 'Líderes <span>·</span> Post Temporada' : 'Líderes <span>·</span> Últimos 5 Partidos';
  if(subEl) subEl.textContent = v==='post'
    ? 'Promedio por partido · mín. 1 partido jugado · porcentajes con mín. 3 intentos'
    : 'Promedio por partido · mín. 1 partido jugado · porcentajes con mín. 3 intentos';
  LEADERS_DATA = v==='post' ? LEADERS_DATA_POST : LEADERS_DATA_REGULAR;
  buildLeaders();
}


document.querySelectorAll('#tCardBasic thead th').forEach(th=>{
  th.addEventListener('click',()=>{
    if(tSort===th.dataset.c)tDir=tDir==='desc'?'asc':'desc';
    else{tSort=th.dataset.c;tDir=th.dataset.d||'desc';}
    renderTTable();
  });
});

document.querySelectorAll('#tCardAdv thead th').forEach(th=>{
  th.addEventListener('click',()=>{
    if(tAdvSort===th.dataset.ca)tAdvDir=tAdvDir==='desc'?'asc':'desc';
    else{tAdvSort=th.dataset.ca;tAdvDir=th.dataset.da||'desc';}
    renderTAdvTable();
  });
});

// ============================================================
// GENERIC CHART DRAW
// ============================================================


// ============================================================
// PLAYER CHART
// ============================================================

const jCv=document.getElementById('jCanvas');
jCv.addEventListener('mousemove',e=>{
  const r=jCv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const found=hitTest(jPts,mx,my);
  if(found!==jHov){jHov=found;drawJChart();}
  if(found>=0){
    const p=jPts[found].d;
    const playerName=p.name.split(',')[0].trim();
    showTooltip(e,p,document.getElementById('jX').value,document.getElementById('jY').value,LBL_J,`${p.Equipo} · ${p.PJ} PJ`,playerName);
  }else document.getElementById('tooltip').style.display='none';
});
jCv.addEventListener('mouseleave',()=>{jHov=-1;document.getElementById('tooltip').style.display='none';drawJChart();});
jCv.addEventListener('click',e=>{
  const r=jCv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const found=hitTest(jPts,mx,my);
  if(found>=0){if(jPin.has(found))jPin.delete(found);else jPin.add(found);}
  drawJChart();
});

// ============================================================
// TEAM CHART
// ============================================================
const T_PALETTE=['#7c3aed','#0d9488','#d97706','#dc2626','#2563eb','#db2777',
  '#059669','#0891b2','#ea580c','#9333ea','#65a30d','#be123c','#1d4ed8','#c2410c',
  '#166534','#0369a1','#92400e','#6d28d9','#0f766e','#7f1d1d',
  '#134e4a','#1c1917','#312e81','#4d7c0f','#b45309','#047857',
  '#581c87','#1e40af','#075985','#365314','#7e22ce','#9d174d','#0e7490','#3730a3'];
const T_COLORS={};


const tCv=document.getElementById('tCanvas');
tCv.addEventListener('mousemove',e=>{
  const r=tCv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const found=hitTest(tPts,mx,my);
  if(found!==tHov){tHov=found;drawTChart();}
  if(found>=0){
    const t=tPts[found].d;
    const xk=document.getElementById('tX').value,yk=document.getElementById('tY').value;
    showTooltip(e,t,xk,yk,LBL_T,`${t.Ganados}G - ${t.Perdidos}P · ORtg ${t.ORtg} · DRtg ${t.DRtg} · Net ${t.NetRtg>=0?'+':''}${t.NetRtg}`);
  }else document.getElementById('tooltip').style.display='none';
});
tCv.addEventListener('mouseleave',()=>{tHov=-1;document.getElementById('tooltip').style.display='none';drawTChart();});
tCv.addEventListener('click',e=>{
  const r=tCv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const found=hitTest(tPts,mx,my);
  tPin=(found===tPin)?-1:found; drawTChart();
});

window.addEventListener('resize',()=>{
  if(document.getElementById('sec-j-chart').classList.contains('active'))drawJChart();
  if(document.getElementById('sec-t-chart').classList.contains('active'))drawTChart();
  if(document.getElementById('sec-j-conexiones').classList.contains('active') && _cnxData)drawConnections();
});

// ============================================================
// TEAM COMPARISON
// ============================================================
// TEAM COMPARISON — click-to-select
// ============================================================
const CMP_COLORS = ['#7c3aed','#0d9488','#d97706','#dc2626'];
let selectedTeams = []; // array of team names, max 4


// ============================================================
// SYNC SCROLLBARS
// ============================================================
const scrollPairs = {};


// ============================================================
// INIT
// ============================================================
setupScrollSync('jTableWrap','jScrollOuter','jScrollInner');
setupScrollSync('tTableWrap','tScrollOuter','tScrollInner');
// ============================================================
// LEADERS
// ============================================================
let LEADERS_DATA = {};
let LEADERS_DATA_REGULAR = {};
let LEADERS_DATA_POST = {};

const LEADER_ICONS = {};
const LEADER_COLORS = ['r1','r2','r3','',''];

function buildLeaders() {
  const grid = document.getElementById('leadersGrid');
  if(!grid) return;
  grid.innerHTML = '';
  Object.values(LEADERS_DATA).forEach(cat => {
    const card = document.createElement('div');
    card.className = 'leader-card';
    const rows = cat.entries.slice(0,5).map((e,i) => {
      const isPct = cat.key.endsWith('PCT');
      const displayVal = isPct ? e.val.toFixed(1)+'%' : (e.val % 1 === 0 ? e.val.toFixed(0) : e.val.toFixed(1));
      const initials = e.name.split(',')[0].trim().slice(0,2);
      return `<div class="leader-row ${i===0?'rank-1':''}">
        <span class="leader-rank ${LEADER_COLORS[i]||''}">${i+1}</span>
        <div class="leader-avatar ${i===0?'av1':''}">${initials}</div>
        <div class="leader-info">
          <div class="leader-name">${e.name}</div>
          <div class="leader-team" style="display:flex;align-items:center;gap:4px">${teamLogoHtml(e.equipo,14)}${e.equipo}</div>
        </div>
        <div class="leader-val-wrap">
          <div class="leader-val">${displayVal}</div>
          <div class="leader-gp">${e.gp} PJ</div>
        </div>
      </div>`;
    }).join('');
    card.innerHTML = `<div class="leader-card-header">
      <h3>${cat.label}</h3>
      <div class="lc-bar"></div>
    </div>
    <div class="leader-card-body">${rows}</div>`;
    grid.appendChild(card);
  });
}

// ============================================================
// POSICIONES
// ============================================================

const PLAYOFF_DATE = new Date(2026, 3, 23); // 23 de abril de 2026
function isPostSeason(fechaStr) {
  if (!fechaStr) return false;
  const [d,m,y] = fechaStr.split('/');
  return new Date(+y,+m-1,+d) >= PLAYOFF_DATE;
}

const CONF_NORTE = new Set(['ARGENTINO (J)','ATENAS (C)','GIMNASIA (CR)','INDEPENDIENTE (O)','INSTITUTO','LA UNION FSA.','OBERÁ','QUIMSA','REGATAS (C)','SAN MARTÍN (C)']);
const CONF_SUR   = new Set(['BOCA','FERRO','OLÍMPICO (LB)','OBRAS','PEÑAROL (MDP)','PLATENSE','RACING (CH)','SAN LORENZO','UNION (SF)']);

const LOGOS = {
  // Conferencia Norte
  'ARGENTINO (J)':  'logos/argentino_j.jpeg',
  'ATENAS (C)':     'logos/atenas_c.jpeg',
  'GIMNASIA (CR)':  'logos/gimnasia_cr.jpeg',
  'INDEPENDIENTE (O)':'logos/independiente_o.jpeg',
  'INSTITUTO':      'logos/instituto.jpeg',
  'LA UNION FSA.':  'logos/la_union_fsa.jpeg',
  'OBERÁ':          'logos/obera.jpeg',
  'QUIMSA':         'logos/quimsa.jpeg',
  'REGATAS (C)':    'logos/regatas_c.jpeg',
  'SAN MARTÍN (C)': 'logos/san_martin_c.jpeg',
  // Conferencia Sur
  'BOCA':           'logos/boca.jpeg',
  'FERRO':          'logos/ferro.jpeg',
  'OLÍMPICO (LB)':  'logos/olimpico_lb.jpeg',
  'OBRAS':          'logos/obras.jpeg',
  'PEÑAROL (MDP)':  'logos/peñarol_mdp.jpeg',
  'PLATENSE':       'logos/platense.jpeg',
  'RACING (CH)':    'logos/racing_ch.jpeg',
  'SAN LORENZO':    'logos/san_lorenzo.jpeg',
  'UNION (SF)':     'logos/union_sf.jpeg',
  'LANUS':          'logos/lanus.jpeg',
};


// ============================================================


function renderStandings() {
  const statsMap = {};
  TEAMS.forEach(t => {
    let PJ=0,G=0,P=0,ptsFor=0,ptsAgainst=0,localG=0,localP=0,visitG=0,visitP=0;
    const results=[];
    (t._gamelog||[]).forEach(g => {
      const [fd,fm,fy]=g.fecha.split('/');
      if (new Date(+fy,+fm-1,+fd) >= PLAYOFF_DATE) return;
      PJ++; ptsFor+=g.ptsFor||0; ptsAgainst+=g.ptsAgainst||0;
      if (g.ganado) { G++; if(g.condicion==='LOCAL') localG++; else visitG++; }
      else          { P++; if(g.condicion==='LOCAL') localP++; else visitP++; }
      results.push(g.ganado);
    });
    statsMap[t.Equipo]={Equipo:t.Equipo,PJ,G,P,ptsFor,ptsAgainst,localG,localP,visitG,visitP,last5:results.slice(-5)};
  });
  const rows = Object.values(statsMap).sort((a,b) => {
    const wa=a.PJ?a.G/a.PJ:0, wb=b.PJ?b.G/b.PJ:0;
    if(wb!==wa) return wb-wa;
    if(b.PJ!==a.PJ) return b.PJ-a.PJ;
    return (b.PJ?b.ptsFor/b.PJ:0)-(a.PJ?a.ptsFor/a.PJ:0);
  });
  const tbody = document.getElementById('posAllTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const cutoff = Math.ceil(rows.length / 2);
  rows.forEach((t, i) => {
    const pos = i + 1;
    const wpct = t.PJ ? t.G/t.PJ*100 : 0;
    const ptspg = t.PJ ? t.ptsFor/t.PJ : 0;
    const ptsapg = t.PJ ? t.ptsAgainst/t.PJ : 0;
    const dif = ptspg - ptsapg;
    const wc = wpct >= 60 ? 'win-rate-high' : wpct >= 40 ? 'win-rate-mid' : 'win-rate-low';
    const difClass = dif >= 0 ? 'pos-diff-pos' : 'pos-diff-neg';
    const topClass = pos <= cutoff ? ' pos-top8' : '';
    const logoSrc = LOGOS[t.Equipo];
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" class="pos-logo" alt="" onerror="this.style.visibility='hidden'">`
      : '<span class="pos-logo-ph"></span>';
    tbody.innerHTML += `<tr class="${topClass}" onclick="showTeamGames('${t.Equipo.replace(/'/g,"\\'")}')">
      <td>${pos}</td>
      <td>${logoHtml}${t.Equipo}</td>
      <td>${t.PJ}</td>
      <td style="color:var(--green);font-weight:700">${t.G}</td>
      <td style="color:var(--red)">${t.P}</td>
      <td class="${wc}">${wpct.toFixed(1)}%</td>
      <td class="pos-pts-f">${ptspg.toFixed(1)}</td>
      <td class="pos-pts-a">${ptsapg.toFixed(1)}</td>
      <td class="${difClass}">${(dif>=0?'+':'')+dif.toFixed(1)}</td>
      <td style="color:var(--muted);font-size:.78rem">${t.localG}-${t.localP}</td>
      <td style="color:var(--muted);font-size:.78rem">${t.visitG}-${t.visitP}</td>
      <td style="text-align:center">${t.last5.map(g=>g
        ? `<span style="color:var(--green);font-weight:700;font-size:.72rem">V</span>`
        : `<span style="color:var(--red);font-weight:700;font-size:.72rem">D</span>`
      ).join('<span style="color:var(--muted);opacity:.3;margin:0 1px">·</span>')}</td>
      <td class="pos-row-chevron">›</td>
    </tr>`;
  });
}

function switchPosTab(tab) {
  const isReg = tab === 'regular';
  document.getElementById('posTabReg').classList.toggle('active', isReg);
  document.getElementById('posTabPost').classList.toggle('active', !isReg);
  document.getElementById('posRegPanel').style.display = isReg ? '' : 'none';
  document.getElementById('posPostPanel').style.display = isReg ? 'none' : '';
  if (!isReg && !document.getElementById('playoffContent').innerHTML.trim()) {
    renderPostSeason();
  }
}

function renderPostSeason() {
  const postGames = GAMES_ALL.filter(g => {
    const [d,m,y]=g.fecha.split('/');
    return new Date(+y,+m-1,+d) >= PLAYOFF_DATE;
  }).sort((a,b)=>{
    const [ad,am,ay]=a.fecha.split('/'); const [bd,bm,by]=b.fecha.split('/');
    return new Date(+ay,+am-1,+ad)-new Date(+by,+bm-1,+bd);
  });

  if (!postGames.length) {
    document.getElementById('playoffContent').innerHTML =
      '<div style="text-align:center;color:var(--muted);padding:40px 20px">No hay partidos de post temporada disponibles aún.</div>';
    return;
  }

  const seriesMap = new Map();
  postGames.forEach(g => {
    const key = [g.local, g.visit].sort().join('|');
    if (!seriesMap.has(key)) seriesMap.set(key, { teamA: g.local, teamB: g.visit, games: [] });
    seriesMap.get(key).games.push(g);
  });

  seriesMap.forEach(s => {
    s.winsA = 0; s.winsB = 0;
    s.games.forEach(g => {
      if (g.upcoming || g.ganLocal === null) return;
      const aIsLocal = g.local === s.teamA;
      if ((aIsLocal && g.ganLocal) || (!aIsLocal && !g.ganLocal)) s.winsA++;
      else s.winsB++;
    });
  });

  function seriesCard(s) {
    const logoA = LOGOS[s.teamA]?`<img src="${LOGOS[s.teamA]}" style="width:38px;height:38px;object-fit:contain">`:'<span style="width:38px;height:38px;display:block"></span>';
    const logoB = LOGOS[s.teamB]?`<img src="${LOGOS[s.teamB]}" style="width:38px;height:38px;object-fit:contain">`:'<span style="width:38px;height:38px;display:block"></span>';
    const aLeads = s.winsA > s.winsB, bLeads = s.winsB > s.winsA;
    const gamesPlayed = s.games.filter(g => !g.upcoming).length;
    const scoreHtml = gamesPlayed === 0
      ? `<div class="series-score-vs">VS</div>`
      : `<div class="series-score">${s.winsA}<span style="color:var(--muted2);font-weight:400;font-size:1.2rem;margin:0 4px">–</span>${s.winsB}</div>`;
    let statusHtml = '';
    if (gamesPlayed === 0) {
      statusHtml = `<div class="series-status">Serie al mejor de 3</div>`;
    } else if (aLeads) {
      statusHtml = `<div class="series-status">Gana <span class="lead-name">${s.teamA}</span></div>`;
    } else if (bLeads) {
      statusHtml = `<div class="series-status">Gana <span class="lead-name">${s.teamB}</span></div>`;
    } else {
      statusHtml = `<div class="series-status">Serie igualada</div>`;
    }
    const gamesHtml = s.games.map((g, idx) => {
      if (g.upcoming) {
        return `<div class="series-game sg-next">
          <span class="sg-label">J${idx+1}</span>
          <span class="sg-hora">${g.hora} hs</span>
          <span class="sg-date">${g.fecha}</span>
          <span class="sg-next-pill">Próximo</span>
        </div>`;
      }
      const aIsLocal = g.local === s.teamA;
      const aScore = aIsLocal ? g.ptsLocal : g.ptsVisit;
      const bScore = aIsLocal ? g.ptsVisit : g.ptsLocal;
      const aWin = (aIsLocal && g.ganLocal) || (!aIsLocal && !g.ganLocal);
      const safeId = (g.gameId||'').replace(/'/g, "\\'");
      return `<div class="series-game sg-played">
        <span class="sg-label">J${idx+1}</span>
        <div class="sg-scores">
          <span class="sg-pts${aWin?' w':''}">${aScore}</span>
          <span class="sg-sep">–</span>
          <span class="sg-pts${aWin?'':' w'}">${bScore}</span>
        </div>
        <span class="sg-date">${g.fecha}</span>
        <button class="sg-stats-btn" onclick="openPartidoModal(GAMES_ALL.find(x=>x.gameId==='${safeId}'))">Stats</button>
      </div>`;
    }).join('');
    return `<div class="series-card">
      <div class="series-card-top">
        <div class="series-header">
          <div class="series-team">${logoA}<div class="series-team-name${aLeads?' lead':''}">${s.teamA}</div></div>
          <div class="series-score-wrap">${scoreHtml}</div>
          <div class="series-team">${logoB}<div class="series-team-name${bLeads?' lead':''}">${s.teamB}</div></div>
        </div>
        ${statusHtml}
      </div>
      <div class="series-games">${gamesHtml}</div>
    </div>`;
  }

  let html = '<div class="playoff-phase-block"><div class="playoff-phase-title">Playoffs</div><div class="playoff-grid">';
  seriesMap.forEach(s => { html += seriesCard(s); });
  html += '</div></div>';
  document.getElementById('playoffContent').innerHTML = html;
}

document.addEventListener('click',function(e){if(!e.target.closest('.fsb-custom-select')){document.querySelectorAll('.fcs-dropdown.open').forEach(d=>{d.classList.remove('open');d.closest('.fsb-custom-select').querySelector('.fcs-trigger').classList.remove('open');});}});
// SHOT MAP
// ============================================================


function switchGameTab(tab) {
  document.getElementById('tgmTabStats').classList.toggle('active', tab === 'stats');
  document.getElementById('tgmTabMap').classList.toggle('active', tab === 'map');
  document.getElementById('tgmTabBox').classList.toggle('active', tab === 'box');
  document.getElementById('tgmTabEvol').classList.toggle('active', tab === 'evol');
  document.getElementById('tgmTabRecap').classList.toggle('active', tab === 'recap');
  document.getElementById('tgmDetailBody').style.display = tab === 'stats' ? '' : 'none';
  document.getElementById('tgmMapPanel').style.display   = tab === 'map'   ? '' : 'none';
  document.getElementById('tgmBoxPanel').style.display   = tab === 'box'   ? '' : 'none';
  document.getElementById('tgmEvolPanel').style.display  = tab === 'evol'  ? '' : 'none';
  document.getElementById('tgmRecapPanel').style.display = tab === 'recap' ? '' : 'none';
  if (tab === 'map') {
    const doRender = () => requestAnimationFrame(renderShotMap);
    if (SHOTS_MAP === null) loadShots().then(doRender); else doRender();
  }
  if (tab === 'box')   renderBoxScore(_smState.gameId, _smState.local, _smState.visit);
  if (tab === 'evol')  renderScoreDelta(_smState.gameId, _smState.local, _smState.visit);
  if (tab === 'recap') renderRecap(_smState.fecha, _smState.local, _smState.visit);
}

document.getElementById('smControls').addEventListener('click', function(e) {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  const filter = btn.dataset.filter, val = btn.dataset.val;
  _smState.filter[filter] = val;
  // Update active state within the toggle group
  btn.closest('.sm-toggle').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  renderShotMap();
});


// ============================================================
// TEAM GAMES MODAL
// ============================================================
// ============================================================
// PARTIDOS SECTION
// ============================================================


// ── EVOLUCIÓN DE PARTIDO ──────────────────────────────────────
function computeScoreDelta(gameId, stableKey) {
  if (!PBP_MAP && !PBP_STABLE_MAP) return null;
  // Prefer stable key (fecha|local|visit) to avoid cross-CSV dynamic ID mismatch
  const events = (PBP_STABLE_MAP && stableKey ? PBP_STABLE_MAP.get(stableKey) : null)
              || (PBP_MAP ? PBP_MAP.get(gameId) : null);
  if (!events || !events.length) return null;
  let sLoc = 0, sVis = 0;
  const readings = [];
  events.forEach(ev => {
    const ml = ev['Marcador_local'], mv = ev['Marcador_visitante'];
    const hasScore = (ml !== '' && ml !== undefined && ml !== 'None') ||
                     (mv !== '' && mv !== undefined && mv !== 'None');
    if (!hasScore) return;
    if (ml !== '' && ml !== undefined && ml !== 'None') sLoc = parseInt(ml) || sLoc;
    if (mv !== '' && mv !== undefined && mv !== 'None') sVis = parseInt(mv) || sVis;
    const periodo = parseFloat(ev['Periodo']) || 1;
    const tiempo  = ev['Tiempo'];
    if (!tiempo || tiempo === 'None') return;
    const elapsed = pbpElapsed(periodo, tiempo);
    if (elapsed === null) return;
    readings.push({ elapsed, sLoc, sVis });
  });
  if (!readings.length) return null;
  readings.sort((a, b) => a.elapsed - b.elapsed);
  const totalMinutes = Math.ceil(readings[readings.length - 1].elapsed / 60);
  const result = [];
  let prevSLoc = 0, prevSVis = 0;
  for (let m = 1; m <= totalMinutes; m++) {
    const lo = (m - 1) * 60, hi = m * 60;
    for (let i = 0; i < readings.length; i++) {
      if (readings[i].elapsed > lo && readings[i].elapsed <= hi) {
        prevSLoc = readings[i].sLoc;
        prevSVis = readings[i].sVis;
      }
    }
    result.push({ minute: m, delta: prevSLoc - prevSVis, sLoc: prevSLoc, sVis: prevSVis });
  }
  return result;
}


function _buildEvolSvg(data) {
  const W = 600, H = 230;
  const padL = 36, padR = 10, padT = 28, padB = 46;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const n      = data.length;
  const deltas = data.map(d => d.delta);
  const rawMax = Math.max(Math.abs(Math.min(...deltas)), Math.abs(Math.max(...deltas)), 1);
  const yMax   = Math.ceil(rawMax / 5) * 5 || 5;
  const step   = yMax <= 10 ? 5 : yMax <= 25 ? 10 : 15;
  const yScale = (chartH / 2) / yMax;
  const zeroY  = padT + chartH / 2;
  const slot   = chartW / n;

  const POS_CLR = '#a78bfa';
  const NEG_CLR = '#5eead4';
  const MUTED   = '#475569';
  const MUTED2  = '#334155';
  const ZERO_LN = 'rgba(255,255,255,.2)';
  const GRID    = 'rgba(255,255,255,.04)';

  // Build points (center of each minute slot)
  const pts = data.map((d, i) => ({
    x: padL + i * slot + slot / 2,
    y: zeroY - d.delta * yScale
  }));

  const firstX = pts[0].x.toFixed(1);
  const lastX  = pts[pts.length - 1].x.toFixed(1);
  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPts = `${firstX},${zeroY} ${polyPts} ${lastX},${zeroY}`;

  let s = '';

  // Clip paths: upper half (positive/local) and lower half (negative/visit)
  s += `<defs>
    <clipPath id="cpPos"><rect x="${padL-1}" y="${padT}" width="${chartW+2}" height="${(chartH/2+1).toFixed(1)}"/></clipPath>
    <clipPath id="cpNeg"><rect x="${padL-1}" y="${(zeroY-.5).toFixed(1)}" width="${chartW+2}" height="${(chartH/2+1).toFixed(1)}"/></clipPath>
  </defs>`;

  // Grid lines + Y labels
  for (let v = -yMax; v <= yMax; v += step) {
    const y = (zeroY - v * yScale).toFixed(1);
    s += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="${v===0 ? ZERO_LN : GRID}" stroke-width="${v===0 ? '1' : '.5'}"/>`;
    s += `<text x="${padL-4}" y="${parseFloat(y)+3.5}" text-anchor="end" fill="${MUTED}" font-size="8.5" font-family="Inter,sans-serif">${v>0?'+':''}${v===0?'0':v}</text>`;
  }

  // Filled areas
  s += `<polygon points="${areaPts}" fill="${POS_CLR}" opacity=".18" clip-path="url(#cpPos)"/>`;
  s += `<polygon points="${areaPts}" fill="${NEG_CLR}" opacity=".18" clip-path="url(#cpNeg)"/>`;

  // Lines colored by side (clipped)
  s += `<polyline points="${polyPts}" fill="none" stroke="${POS_CLR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#cpPos)"/>`;
  s += `<polyline points="${polyPts}" fill="none" stroke="${NEG_CLR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#cpNeg)"/>`;

  // Period separators
  const qMins = [10, 20, 30, 40];
  const otMins = [];
  for (let ot = 45; ot <= n; ot += 5) otMins.push(ot);

  [...qMins, ...otMins].forEach(p => {
    if (p >= n) return;
    const x = (padL + p * slot).toFixed(1);
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H-padB}" stroke="rgba(255,255,255,.08)" stroke-width=".8" stroke-dasharray="3,3"/>`;
    // Score badge at quarter end
    const d = data[p - 1];
    if (d && d.sLoc !== undefined) {
      const bw = 40, bh = 13, bx = parseFloat(x) - bw/2, by = H - padB + 18;
      s += `<rect x="${bx.toFixed(1)}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(255,255,255,.06)" stroke="${MUTED2}" stroke-width=".5"/>`;
      s += `<text x="${parseFloat(x).toFixed(1)}" y="${by+9}" text-anchor="middle" fill="#94a3b8" font-size="7.5" font-family="Inter,sans-serif" font-weight="600">${d.sLoc}–${d.sVis}</text>`;
    }
  });

  // Quarter labels above chart
  const qLabels = ['Q1','Q2','Q3','Q4'];
  [0,10,20,30].forEach((start, qi) => {
    if (start >= n) return;
    const end  = Math.min(start + 10, n);
    const midX = padL + (start + end) / 2 * slot;
    s += `<text x="${midX.toFixed(1)}" y="${padT-10}" text-anchor="middle" fill="${MUTED}" font-size="7.5" font-family="Inter,sans-serif" letter-spacing=".5">${qLabels[qi]}</text>`;
  });
  otMins.forEach((start, i) => {
    const end  = Math.min(start + 5, n);
    const midX = padL + (start - 5 + (end - start + 5) / 2) * slot;
    s += `<text x="${midX.toFixed(1)}" y="${padT-10}" text-anchor="middle" fill="${MUTED}" font-size="7.5" font-family="Inter,sans-serif">OT${i+1}</text>`;
  });

  // X-axis labels every 5 min
  data.forEach((d, i) => {
    if (d.minute % 5 !== 0) return;
    const x = padL + i * slot + slot / 2;
    s += `<text x="${x.toFixed(1)}" y="${H-padB+12}" text-anchor="middle" fill="${MUTED}" font-size="8.5" font-family="Inter,sans-serif">${d.minute}'</text>`;
  });

  // Invisible hover rects (full chart height) for tooltip
  data.forEach((d, i) => {
    const x = (padL + i * slot).toFixed(2);
    s += `<rect class="evol-bar" data-min="${d.minute}" data-delta="${d.delta}" data-sloc="${d.sLoc}" data-svis="${d.sVis}" x="${x}" y="${padT}" width="${slot.toFixed(2)}" height="${chartH}" fill="transparent" style="cursor:default"/>`;
  });

  return `<svg class="evol-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}


const TEAM_NAME_BREAKS = {'CENTRAL ENTRERRIANO':'CENTRAL<br>ENTRERRIANO'};

function renderPartidoList(games, ascending=false) {
  const el = document.getElementById('pGameList');
  document.getElementById('pCount').textContent = games.length;
  if (!games.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:48px 0;font-size:.88rem">No hay partidos para los filtros seleccionados.</div>';
    return;
  }
  // Group by fecha
  const byDate = {};
  games.forEach(g => { if (!byDate[g.fecha]) byDate[g.fecha]=[]; byDate[g.fecha].push(g); });
  const sortedDates = Object.keys(byDate).sort((a,b) => ascending
    ? _partidoFechaToDate(a) - _partidoFechaToDate(b)
    : _partidoFechaToDate(b) - _partidoFechaToDate(a));

  let html = '';
  sortedDates.forEach(fecha => {
    const dayGames = byDate[fecha];
    const label = _formatFechaLarga(fecha);
    const cards  = dayGames.map(g => {
      const ll = LOGOS[g.local]  ? `<img src="${LOGOS[g.local]}"  class="pcard-logo" alt="" onerror="this.style.display='none'">` : '';
      const vl = LOGOS[g.visit]  ? `<img src="${LOGOS[g.visit]}"  class="pcard-logo" alt="" onerror="this.style.display='none'">` : '';
      if (g.upcoming) {
        const pred = PRED_MAP[`${g.fecha}|${g.local}|${g.visit}`];
        const predBar = pred ? `
          <div class="pcard-pred">
            <span class="pcard-pred-label">prob. victoria</span>
            <span class="pcard-pred-pct local">${Math.round(pred.prob_local*100)}%</span>
            <div class="pcard-pred-bar"><div class="pcard-pred-fill" style="width:${Math.round(pred.prob_local*100)}%"></div></div>
            <span class="pcard-pred-pct visit">${Math.round(pred.prob_visit*100)}%</span>
          </div>` : '';
        return `<div class="partido-card upcoming" data-gid="${g.gameId}">
          <div class="pcard-side local">
            ${ll}
            <span class="pcard-name">${fmtTeamName(g.local)}</span>
          </div>
          <div class="pcard-center">
            <div class="pcard-hora">${g.hora}</div>
            <div class="pcard-estadio">${g.estadio}</div>
            <div class="pcard-badges">
              <span class="pcard-badge-l">L</span>
              <span style="font-size:.55rem;color:var(--muted2)">vs</span>
              <span class="pcard-badge-v">V</span>
            </div>
          </div>
          <div class="pcard-side visit">
            ${vl}
            <span class="pcard-name">${fmtTeamName(g.visit)}</span>
          </div>
          ${predBar}
        </div>`;
      }
      const lw = g.ganLocal;
      return `<div class="partido-card" data-gid="${g.gameId}">
        <div class="pcard-side local">
          ${ll}
          <span class="pcard-name${lw?' winner':''}">${fmtTeamName(g.local)}</span>
        </div>
        <div class="pcard-center">
          <div class="pcard-scores">
            <span class="pcard-score${lw?' winner':''}">${g.ptsLocal}</span>
            <span class="pcard-dash">–</span>
            <span class="pcard-score${!lw?' winner':''}">${g.ptsVisit}</span>
          </div>
          <div class="pcard-badges">
            <span class="pcard-badge-l">L</span>
            <span style="font-size:.55rem;color:var(--muted2)">vs</span>
            <span class="pcard-badge-v">V</span>
          </div>
          ${g.estadio ? `<div class="pcard-estadio">${g.estadio}</div>` : ''}
        </div>
        <div class="pcard-side visit">
          ${vl}
          <span class="pcard-name${!lw?' winner':''}">${fmtTeamName(g.visit)}</span>
        </div>
      </div>`;
    }).join('');
    const postBadge = isPostSeason(label) ? '<span class="pday-post-badge">Post Temporada</span>' : '';
    html += `<div class="pday-group"><div class="pday-label">${label}${postBadge}</div><div class="pday-games">${cards}</div></div>`;
  });
  el.innerHTML = html;

  // Build fast lookup map and attach listeners (played games only)
  const gmap = {};
  games.forEach(g => { gmap[g.gameId] = g; });
  el.querySelectorAll('.partido-card:not(.upcoming)').forEach(card => {
    const game = gmap[card.dataset.gid];
    if (game) card.addEventListener('click', () => openPartidoModal(game));
  });
}

let _currentTeamName = '';


async function initApp() {
  document.getElementById('loadingOverlay').style.display = 'flex';
  try {
    const [resp, dobResp] = await Promise.all([
      fetch(CSV_PATH + '?v=' + new Date().toISOString().slice(0, 10)),
      fetch(DOB_PATH + '?v=' + new Date().toISOString().slice(0, 10)).catch(()=>null)
    ]);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    if (dobResp && dobResp.ok) {
      const dobRows = parseCSV(await dobResp.text());
      dobRows.forEach(r => { if (r.liga === 'Liga Nacional') DOB_MAP[r.nombre_abreviado] = r.fecha_nacimiento; });
    }
    const rows = parseCSV(text);
    const RAW_J = buildRAW_J(rows);
    const RAW_T = buildRAW_T(rows);

    // Team lookup for advanced per-player ratings
    TEAM_MAP = {};
    RAW_T.forEach(t => { TEAM_MAP[t.Equipo] = t; });

    // Player per-game averages
    PLAYERS = RAW_J.map(p=>{
      const pj=p.PJ||1; const d={...p, name:p['Nombre completo']};
      Object.entries(MAP_J).forEach(([k,v])=>d[v]=Math.round((p[k]/pj)*100)/100);
      d.MPG=Math.round((p.SEG/pj/60)*10)/10;
      d.TCAPG = Math.round(((p.T2A+p.T3A)/pj)*100)/100;
      d.TCIPG = Math.round(((p.T2I+p.T3I)/pj)*100)/100;
      const tci = p.T2I+p.T3I;
      d['TC%'] = tci>0 ? Math.round((p.T2A+p.T3A)/tci*1000)/10 : null;
      d['T2%'] = p.T2I>0 ? Math.round(p.T2A/p.T2I*1000)/10 : null;
      d['T3%'] = p.T3I>0 ? Math.round(p.T3A/p.T3I*1000)/10 : null;
      d['T1%'] = p.T1I>0 ? Math.round(p.T1A/p.T1I*1000)/10 : null;
      const tm = TEAM_MAP[p.Equipo] || {};
      const pos = tci + 0.44*(p.T1I||0) + (p.PER||0);
      d.POS = Math.round((pos/pj)*10)/10;
      d['PTS/POS'] = pos>0 ? Math.round(p.PTS/pos*100)/100 : null;
      const efgNum = (p.T2A||0) + 1.5*(p.T3A||0);
      d['EFG%'] = tci>0 ? Math.round(efgNum/tci*1000)/10 : null;
      const tsAdj = 2*(tci + 0.44*(p.T1I||0));
      d['TS%'] = tsAdj>0 ? Math.round((p.PTS||0)/tsAdj*1000)/10 : null;
      const toPct_denom = tci + 0.44*(p.T1I||0) + (p.AST||0) + (p.PER||0);
      d['TO%'] = toPct_denom>0 ? Math.round((p.PER||0)/toPct_denom*1000)/10 : null;
      d['AST/TO'] = (p.PER||0)>0 ? Math.round((p.AST||0)/(p.PER)*100)/100 : null;
      d['3PI/TI'] = tci>0 ? Math.round((p.T3I||0)/tci*1000)/10 : null;
      d['ORtg'] = pos>0 ? Math.round(p.PTS/pos*100*10)/10 : null;
      d['DRtg'] = tm.DRtg || null;
      d['NetRtg'] = (d['ORtg']!=null && d['DRtg']!=null) ? Math.round((d['ORtg']-d['DRtg'])*10)/10 : null;
      const tmFGA = (tm.T2I||0)+(tm.T3I||0);
      const tmPossUsed = tmFGA + 0.44*(tm.T1I||0) + (tm.PER||0);
      const playerMinTotal = p.SEG/60;
      const tmMinTotal = (tm.PJ||1)*200;
      d['USG%'] = (tmPossUsed>0 && playerMinTotal>0) ? Math.round(pos*tmMinTotal/(5*playerMinTotal*tmPossUsed)*1000)/10 : null;
      const tmRO = tm.RO||0;
      const tmOppDReb = tm.OPP_DReb||0;
      d['ORB%'] = ((tmRO+tmOppDReb)>0 && playerMinTotal>0) ? Math.round((p.RO||0)*(tmMinTotal/5)/(playerMinTotal*(tmRO+tmOppDReb))*1000)/10 : null;
      const tmRD = tm.RD||0;
      const tmOppRO = tm.OPP_RO||0;
      d['DRB%'] = (playerMinTotal>0 && (tmRD+tmOppRO)>0) ? Math.round((p.RD||0)*(tmMinTotal/5)/(playerMinTotal*(tmRD+tmOppRO))*1000)/10 : null;
      d['FTr'] = tci>0 ? Math.round((p.T1I||0)/tci*1000)/1000 : null;
      d.Edad = calcAge(DOB_MAP[p['Nombre completo']]);
      return d;
    });

    // Precompute last5 / last10 stats per player
    const sortByFecha=(a,b)=>{
      if(!a.Fecha||!b.Fecha)return 0;
      const [ad,am,ay]=a.Fecha.split('/');const [bd,bm,by]=b.Fecha.split('/');
      return new Date(ay,am-1,ad)-new Date(by,bm-1,bd);
    };
    RAW_J.forEach(rawP=>rawP._games.sort(sortByFecha));
    PLAYERS.forEach((player,i)=>{
      const rawP=RAW_J[i]; const tm=TEAM_MAP[player.Equipo]||{};
      const games=rawP._games;
      const mkPeriod=(n)=>{
        const g=games.slice(-n);
        if(!g.length)return null;
        const s=computeStatsFromGames(g,tm);
        s.name=player.name; s.Equipo=player.Equipo; s.Edad=player.Edad;
        return s;
      };
      player._last5=mkPeriod(5);
      player._last10=mkPeriod(10);
      player._gameIds=games.map(r=>String(r['IdPartido']));
      const gamesLocal=games.filter(r=>r['Condicion equipos']==='LOCAL');
      const gamesVisit=games.filter(r=>r['Condicion equipos']==='VISITANTE');
      const mkLocVisPeriod=(g,n)=>{
        const slice=n?g.slice(-n):g;
        if(!slice.length)return null;
        const s=computeStatsFromGames(slice,tm);
        s.name=player.name; s.Equipo=player.Equipo; s.Edad=player.Edad;
        return s;
      };
      player._local=mkLocVisPeriod(gamesLocal,0);
      player._visit=mkLocVisPeriod(gamesVisit,0);
      player._last5Local=mkLocVisPeriod(gamesLocal,5);
      player._last10Local=mkLocVisPeriod(gamesLocal,10);
      player._last5Visit=mkLocVisPeriod(gamesVisit,5);
      player._last10Visit=mkLocVisPeriod(gamesVisit,10);
      // Phase (regular season vs post season)
      const gamesReg=games.filter(r=>!isPostSeason(r['Fecha']));
      const gamesPost=games.filter(r=>isPostSeason(r['Fecha']));
      player._regular=mkLocVisPeriod(gamesReg,0);
      player._post=mkLocVisPeriod(gamesPost,0);
      player._regularLocal=mkLocVisPeriod(gamesReg.filter(r=>r['Condicion equipos']==='LOCAL'),0);
      player._regularVisit=mkLocVisPeriod(gamesReg.filter(r=>r['Condicion equipos']==='VISITANTE'),0);
      player._postLocal=mkLocVisPeriod(gamesPost.filter(r=>r['Condicion equipos']==='LOCAL'),0);
      player._postVisit=mkLocVisPeriod(gamesPost.filter(r=>r['Condicion equipos']==='VISITANTE'),0);
    });

    // Team per-game
    TEAMS = RAW_T.map(t=>{
      const pj=t.PJ||1; const d={...t};
      const cols=['PTS','T2A','T2I','T3A','T3I','T1A','T1I','RD','RO','RT','AST','PER','REC','TAP','VAL'];
      cols.forEach(k=>d[k+'PG']=Math.round((t[k]/pj)*100)/100);
      d.RTPG=d['RTPG']||Math.round((t.RT/pj)*100)/100;
      d.ASTPG=d['ASTPG']||Math.round((t.AST/pj)*100)/100;
      d.RECPG=d['RECPG']||Math.round((t.REC/pj)*100)/100;
      d.PERPG=d['PERPG']||Math.round((t.PER/pj)*100)/100;
      d.TAPPG=d['TAPPG']||Math.round((t.TAP/pj)*100)/100;
      d.VALPG=d['VALPG']||Math.round((t.VAL/pj)*100)/100;
      d.RDPG=Math.round((t.RD/pj)*100)/100;
      d.ROPG=Math.round((t.RO/pj)*100)/100;
      const tci = (t.T2I||0)+(t.T3I||0);
      const efgNum = (t.T2A||0)+1.5*(t.T3A||0);
      d['EFG%'] = tci>0 ? Math.round(efgNum/tci*1000)/10 : null;
      const tsAdj = 2*(tci+0.44*(t.T1I||0));
      d['TS%'] = tsAdj>0 ? Math.round((t.PTS||0)/tsAdj*1000)/10 : null;
      const tovDenom = tci+0.44*(t.T1I||0)+(t.PER||0);
      d['TOV%'] = tovDenom>0 ? Math.round((t.PER||0)/tovDenom*1000)/10 : null;
      const orbDenom = (t.RO||0)+(t.OPP_DReb||0);
      d['ORB%'] = orbDenom>0 ? Math.round((t.RO||0)/orbDenom*1000)/10 : null;
      d['FTr'] = tci>0 ? Math.round((t.T1I||0)/tci*1000)/1000 : null;
      d['PACE'] = d.POSPG || (tovDenom>0 ? Math.round(tovDenom/pj*10)/10 : null);
      d.PTSOPP_PG = Math.round((t.OPP_PTS/pj)*100)/100;
      return d;
    });

    // Precompute last5 / last10 / local / visitante stats per team
    const RAW_T_MAP={};
    RAW_T.forEach(r=>RAW_T_MAP[r.Equipo]=r);
    TEAMS.forEach(team=>{
      const rawT=RAW_T_MAP[team.Equipo];
      const gl=rawT&&rawT._gamelog?rawT._gamelog:[];
      const mkTPeriod=(n)=>{
        const g=gl.slice(-n);
        if(!g.length)return null;
        const s=computeTeamStatsFromGames(g);
        s.Equipo=team.Equipo; return s;
      };
      team._last5=mkTPeriod(5);
      team._last10=mkTPeriod(10);
      const glLocal=gl.filter(g=>g.condicion==='LOCAL');
      const glVisit=gl.filter(g=>g.condicion==='VISITANTE');
      const mkTLocVisPeriod=(g,n)=>{
        const slice=n?g.slice(-n):g;
        if(!slice.length)return null;
        const s=computeTeamStatsFromGames(slice);
        s.Equipo=team.Equipo; return s;
      };
      team._local=mkTLocVisPeriod(glLocal,0);
      team._visit=mkTLocVisPeriod(glVisit,0);
      team._last5Local=mkTLocVisPeriod(glLocal,5);
      team._last10Local=mkTLocVisPeriod(glLocal,10);
      team._last5Visit=mkTLocVisPeriod(glVisit,5);
      team._last10Visit=mkTLocVisPeriod(glVisit,10);
      // Phase (regular season vs post season)
      const glReg=gl.filter(g=>!isPostSeason(g.fecha));
      const glPost=gl.filter(g=>isPostSeason(g.fecha));
      team._regular=mkTLocVisPeriod(glReg,0);
      team._post=mkTLocVisPeriod(glPost,0);
      team._regularLocal=mkTLocVisPeriod(glReg.filter(g=>g.condicion==='LOCAL'),0);
      team._regularVisit=mkTLocVisPeriod(glReg.filter(g=>g.condicion==='VISITANTE'),0);
      team._postLocal=mkTLocVisPeriod(glPost.filter(g=>g.condicion==='LOCAL'),0);
      team._postVisit=mkTLocVisPeriod(glPost.filter(g=>g.condicion==='VISITANTE'),0);
    });

    // Colors
    [...new Set(PLAYERS.map(p=>p.Equipo))].sort().forEach((t,i)=>TEAM_COLORS[t]=PALETTE[i%PALETTE.length]);
    TEAMS.forEach((t,i)=>T_COLORS[t.Equipo]=T_PALETTE[i%T_PALETTE.length]);

    // Populate team dropdown dynamically
    const jTeamSel = document.getElementById('jTeam');
    const jTeamDD = document.getElementById('jTeamDropdown');
    while (jTeamSel.options.length > 1) jTeamSel.remove(1);
    while (jTeamDD && jTeamDD.children.length > 1) jTeamDD.removeChild(jTeamDD.lastChild);
    [...new Set(PLAYERS.map(p=>p.Equipo))].sort().forEach(eq => {
      const opt = document.createElement('option'); opt.value = eq; opt.textContent = eq;
      jTeamSel.appendChild(opt);
      if (jTeamDD) {
        const div = document.createElement('div');
        div.className = 'fcs-option'; div.dataset.value = eq;
        div.setAttribute('onclick', `fcsSelect('jTeamCustom','${eq.replace(/'/g,"\\'")}','${eq.replace(/'/g,"\\'")}','')`);
        div.innerHTML = `<span class="fcs-name">${eq}</span><span class="fcs-sub"></span>`;
        jTeamDD.appendChild(div);
      }
    });

    // Leaders — últimos 5 partidos
    function top5(arr, keyFn) {
      return [...arr].sort((a,b)=>keyFn(b)-keyFn(a))
        .map(d=>({name:d.name,equipo:d.Equipo,val:Math.round(keyFn(d)*10)/10,gp:d.PJ}));
    }
    function top5Pct(arr, filterFn, pctFn) {
      return [...arr].filter(filterFn)
        .sort((a,b)=>pctFn(b)-pctFn(a))
        .map(d=>({name:d.name,equipo:d.Equipo,val:Math.round(pctFn(d)*10)/10,gp:d.PJ}));
    }
    function buildLeadersDataset(arr) {
      return {
        VAL:   {label:'Valoración',  key:'VAL',   entries:top5(arr, d=>d.VPG)},
        PTS:   {label:'Puntos',      key:'PTS',   entries:top5(arr, d=>d.PPG)},
        REB:   {label:'Rebotes',     key:'REB',   entries:top5(arr, d=>d.RPG)},
        AST:   {label:'Asistencias', key:'AST',   entries:top5(arr, d=>d.APG)},
        REC:   {label:'Robos',       key:'REC',   entries:top5(arr, d=>d.SPG)},
        TAP:   {label:'Tapones',     key:'TAP',   entries:top5(arr, d=>d.BPG)},
        PER:   {label:'Pérdidas',    key:'PER',   entries:top5(arr, d=>d.TPG)},
        T3PCT: {label:'% Triple',    key:'T3PCT', entries:top5Pct(arr, d=>d.T3IPG>=1, d=>d['T3%']||0)},
        T2PCT: {label:'% Doble',     key:'T2PCT', entries:top5Pct(arr, d=>d.T2IPG>=2, d=>d['T2%']||0)},
        T1PCT: {label:'% Libre',     key:'T1PCT', entries:top5Pct(arr, d=>d.T1IPG>=2, d=>d['T1%']||0)},
      };
    }
    const L5 = PLAYERS.map(p => p._last5).filter(d => d && d.PJ >= 1);
    const Lreg = PLAYERS.map(p => p._regular).filter(d => d && d.PJ >= 5);
    const Lpost = PLAYERS.map(p => p._post).filter(d => d && d.PJ >= 1);
    LEADERS_DATA_REGULAR = buildLeadersDataset(Lreg);
    LEADERS_DATA_POST = buildLeadersDataset(Lpost);
    LEADERS_DATA = Lpost.length ? LEADERS_DATA_POST : buildLeadersDataset(L5);

    // Last update: max Fecha from rows
    const maxFecha = rows.reduce((max, r) => {
      if (!r.Fecha) return max;
      const [d,m,y] = r.Fecha.split('/');
      const t = new Date(+y, +m-1, +d);
      return t > max ? t : max;
    }, new Date(0));
    if (maxFecha.getFullYear() > 2000) {
      const opts = { day: '2-digit', month: 'short', year: 'numeric' };
      document.getElementById('lastUpdate').textContent =
        'Actualizado al ' + maxFecha.toLocaleDateString('es-AR', opts);
    }

    // Build GAMES_ALL (unique games from all team gamelogs)
    const _gamesSeen = new Set();
    GAMES_ALL = [];
    TEAMS.forEach(t => {
      (t._gamelog || []).forEach(g => {
        if (!_gamesSeen.has(g.gameId)) {
          _gamesSeen.add(g.gameId);
          const isLocal = g.condicion === 'LOCAL';
          GAMES_ALL.push({
            gameId:   g.gameId,
            fecha:    g.fecha,
            local:    isLocal ? t.Equipo : g.rival,
            visit:    isLocal ? g.rival  : t.Equipo,
            ptsLocal: isLocal ? g.ptsFor : g.ptsAgainst,
            ptsVisit: isLocal ? g.ptsAgainst : g.ptsFor,
            ganLocal: isLocal ? g.ganado : !g.ganado,
            estadio:  g.estadio || '',
            sLocal:   isLocal ? g.myS : g.oppS,
            sVisit:   isLocal ? g.oppS : g.myS,
          });
        }
      });
    });
    GAMES_ALL.sort((a,b)=>{
      const [ad,am,ay]=a.fecha.split('/'); const [bd,bm,by]=b.fecha.split('/');
      return new Date(+ay,+am-1,+ad)-new Date(+by,+bm-1,+bd);
    });

    // Merge upcoming fixture from CSV (skip any game already played/scraped)
    // Temporadas archivadas no tienen partidos "próximos" ni predicciones vigentes.
    if (SEASON !== '2025-26') {
    const _playedKeys = new Set(GAMES_ALL.map(g => `${g.fecha}|${g.local}|${g.visit}`));
    try {
      const upResp = await fetch('fixture_upcoming.csv?v=' + new Date().toISOString().slice(0, 10));
      if (upResp.ok) {
        const upRows = parseCSV(await upResp.text());
        upRows.forEach(u => {
          const local = u['local'], visit = u['visitante'];
          if (local && visit && !_playedKeys.has(`${u['fecha']}|${local}|${visit}`)) {
            GAMES_ALL.push({
              gameId:   `upcoming_${(local+visit+u['fecha']).replace(/\W/g,'')}`,
              fecha:    u['fecha'], local, visit,
              ptsLocal: null, ptsVisit: null, ganLocal: null,
              upcoming: true, hora: u['hora'], estadio: u['estadio'] || '',
            });
          }
        });
      }
    } catch(e) { /* fixture_upcoming.csv no disponible, se ignora */ }

    // Cargar predicciones del modelo
    try {
      const prResp = await fetch('predicciones_upcoming.csv?v=' + new Date().toISOString().slice(0, 10));
      if (prResp.ok) {
        const prRows = parseCSV(await prResp.text());
        prRows.forEach(r => {
          const k = `${r['fecha']}|${r['local']}|${r['visitante']}`;
          PRED_MAP[k] = { prob_local: parseFloat(r['prob_local']), prob_visit: parseFloat(r['prob_visit']) };
        });
      }
    } catch(e) { /* predicciones no disponibles, se ignoran */ }
    }

    GAMES_ALL.sort((a,b)=>{
      const [ad,am,ay]=a.fecha.split('/'); const [bd,bm,by]=b.fecha.split('/');
      return new Date(+ay,+am-1,+ad)-new Date(+by,+bm-1,+bd);
    });

    // Build GAME_PLAYERS_MAP for box score
    GAME_PLAYERS_MAP = {};
    rows.forEach(r => {
      if (!r['IdPartido'] || r['Nombre completo'] === 'TOTALES') return;
      const id = r['IdPartido'];
      if (!GAME_PLAYERS_MAP[id]) GAME_PLAYERS_MAP[id] = [];
      GAME_PLAYERS_MAP[id].push(r);
    });

    // Populate pTeam select (all teams from played + upcoming games)
    const pTeamSel = document.getElementById('pTeam');
    while (pTeamSel.options.length > 1) pTeamSel.remove(1);
    const _allTeams = new Set(GAMES_ALL.flatMap(g => [g.local, g.visit]));
    [..._allTeams].sort().forEach(eq => {
      const o = document.createElement('option'); o.value = eq; o.textContent = eq;
      pTeamSel.appendChild(o);
    });

    // Set date input min/max from available data
    if (GAMES_ALL.length) {
      const first = GAMES_ALL[0].fecha, last = GAMES_ALL[GAMES_ALL.length-1].fecha;
      const toISO = s => { const [d,m,y]=s.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; };
      document.getElementById('pDateFrom').min = toISO(first);
      document.getElementById('pDateFrom').max = toISO(last);
      document.getElementById('pDateTo').min   = toISO(first);
      document.getElementById('pDateTo').max   = toISO(last);
    }
    showUpcomingDefault();

    onJFilter();
    onTFilter();
    buildLeaders();
    renderStandings();

  } catch(err) {
    console.error('Error cargando CSV:', err);
    document.getElementById('loadingOverlay').innerHTML =
      '<div style="color:#ef4444;font-size:1rem;text-align:center">⚠ Error al cargar los datos<br>' +
      '<small style="color:#9ca3af">' + err.message + '</small></div>';
    return;
  }
  document.getElementById('loadingOverlay').style.display = 'none';
}

initApp().then(() => {
  const _h = window.location.hash.slice(1);
  if (_h) {
    const _sid = _h.includes('/') ? _h.split('/')[1] : _h;
    if (document.getElementById('sec-' + (_sid === 't-tcmp' ? 't-tabla' : _sid))) switchSection(_sid);
  }
});

// ============================================================
// SHOT ZONE CHART
// ============================================================
const SZC_ZONES = ['PAINT','MID_TOP','MID_CENTER','MID_BOT','CORNER_TOP','CORNER_BOT','ABOVE_BREAK'];

// Approximate label centers in court meters [x, y] (basket at x=1.575, y=7.5)
const SZC_CENTERS = {
  PAINT:       [3.0,  7.5 ],
  MID_TOP:     [3.0,  3.2 ],
  MID_CENTER:  [7.5,  7.5 ],
  MID_BOT:     [3.0, 11.8 ],
  CORNER_TOP:  [6.5,  1.5 ],
  CORNER_BOT:  [6.5, 13.5 ],
  ABOVE_BREAK: [12.0, 7.5 ],
};


function szcUpdateSvg(pStats, leagueStats, svgId='szcSvg') {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const bx = 1.575, by = 7.5, R3 = 6.75;
  const dy1 = 0.9 - by; // -6.6
  const dx1 = Math.sqrt(R3*R3 - dy1*dy1); // ≈ 1.4151
  const arcX = bx + dx1;
  const arcMidX = bx + Math.sqrt(R3*R3 - 2.25);
  const diagArcX = bx + R3 / Math.SQRT2;
  const diagArcDY = R3 / Math.SQRT2;
  const diagEdgeX = bx + by; // 9.075
  const f = n => n.toFixed(4);
  const sw = 0.04;
  const lc = 'rgba(255,255,255,.75)';
  const sep = 'rgba(255,255,255,.45)';

  let defs = `<defs>
    <filter id="lblShadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0.07" stdDeviation="0.14" flood-color="rgba(0,0,0,.85)"/>
    </filter>`;
  let labels = '';
  SZC_ZONES.forEach(zone => {
    const ps = pStats[zone];
    if (!ps || ps.att === 0) return;
    const ls = leagueStats ? leagueStats[zone] : null;
    const [cx, cy] = SZC_CENTERS[zone];
    const pct = (ps.makes / ps.att * 100).toFixed(1) + '%';
    const att = `${ps.makes}/${ps.att}`;
    const zc = szcZoneColor(ps, ls);
    const bc = `rgb(${zc[0]},${zc[1]},${zc[2]})`;
    defs += `<linearGradient id="lbg_${zone}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bc}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${bc}" stop-opacity="0.03"/>
    </linearGradient>`;
    labels += `<g filter="url(#lblShadow)">
      <rect x="${cx-0.75}" y="${cy-0.425}" width="1.5" height="0.85" rx="0.14" fill="rgba(6,8,22,.92)"/>
      <rect x="${cx-0.75}" y="${cy-0.425}" width="1.5" height="0.85" rx="0.14" fill="url(#lbg_${zone})"/>
      <rect x="${cx-0.75}" y="${cy-0.425}" width="1.5" height="0.85" rx="0.14" fill="none" stroke="${bc}" stroke-width="0.045"/>
      <text x="${cx}" y="${cy-0.06}" text-anchor="middle" dominant-baseline="auto" font-family="Inter,sans-serif" font-size="0.43" font-weight="800" fill="#fff">${pct}</text>
      <text x="${cx}" y="${cy+0.34}" text-anchor="middle" dominant-baseline="auto" font-family="Inter,sans-serif" font-size="0.28" font-weight="600" fill="rgba(200,212,228,.8)">${att}</text>
    </g>`;
  });
  defs += '</defs>';

  svg.innerHTML = `
    ${defs}
    <rect x="0" y="0" width="14" height="15" fill="none" stroke="${lc}" stroke-width="${sw}"/>
    <rect x="0" y="${by-2.45}" width="5.8" height="4.9" fill="none" stroke="${lc}" stroke-width="${sw}"/>
    <path d="M 5.8 ${by-1.8} A 1.8 1.8 0 0 1 5.8 ${by+1.8}" fill="none" stroke="${lc}" stroke-width="${sw}"/>
    <path d="M 5.8 ${by+1.8} A 1.8 1.8 0 0 0 5.8 ${by-1.8}" fill="none" stroke="${lc}" stroke-width="${sw}" stroke-dasharray="0.18 0.18"/>
    <path d="M ${bx} ${by-1.25} A 1.25 1.25 0 0 1 ${bx} ${by+1.25}" fill="none" stroke="${lc}" stroke-width="${sw}"/>
    <circle cx="${bx}" cy="${by}" r="0.23" fill="none" stroke="rgba(251,146,60,.95)" stroke-width="${sw*1.5}"/>
    <line x1="0" y1="0.9" x2="${f(arcX)}" y2="0.9" stroke="${lc}" stroke-width="${sw}"/>
    <line x1="0" y1="14.1" x2="${f(arcX)}" y2="14.1" stroke="${lc}" stroke-width="${sw}"/>
    <path d="M ${f(arcX)} 0.9 A ${R3} ${R3} 0 0 1 ${f(arcX)} 14.1" fill="none" stroke="${lc}" stroke-width="${sw}"/>
    <line x1="5.8" y1="${by-1.5}" x2="${f(arcMidX)}" y2="${by-1.5}" stroke="${sep}" stroke-width="${sw}" stroke-dasharray="0.2 0.17"/>
    <line x1="5.8" y1="${by+1.5}" x2="${f(arcMidX)}" y2="${by+1.5}" stroke="${sep}" stroke-width="${sw}" stroke-dasharray="0.2 0.17"/>
    <line x1="${f(diagArcX)}" y1="${f(by-diagArcDY)}" x2="${f(diagEdgeX)}" y2="0" stroke="${sep}" stroke-width="${sw}" stroke-dasharray="0.2 0.17"/>
    <line x1="${f(diagArcX)}" y1="${f(by+diagArcDY)}" x2="${f(diagEdgeX)}" y2="15" stroke="${sep}" stroke-width="${sw}" stroke-dasharray="0.2 0.17"/>
    ${labels}
  `;
}

const SZC_ZONE_LABELS = {
  PAINT: 'Pintura', MID_TOP: 'Mid Arr.', MID_CENTER: 'Mid Cen.',
  MID_BOT: 'Mid Ab.', CORNER_TOP: 'Corner ↑', CORNER_BOT: 'Corner ↓',
  ABOVE_BREAK: 'Arco',
};


function szcRenderZoneCards(statsAll, statsL10, statsL5, lStats) {
  const el = document.getElementById('szcZoneCards');
  if (!el) return;
  const aps = szcPeriod === 'all' ? statsAll : szcPeriod === 'last10' ? statsL10 : statsL5;
  el.innerHTML = SZC_ZONES.map(zone => {
    const ps = aps[zone];
    const hasData = ps && ps.att > 0;
    const hasAny = [statsAll, statsL10, statsL5].some(s => s[zone] && s[zone].att > 0);
    let borderColor = '#1e293b';
    let pctText = '—';
    let shotsText = '';
    let ligaHTML = '';
    if (hasData) {
      const ls = lStats ? lStats[zone] : null;
      const zc = szcZoneColor(ps, ls);
      borderColor = `rgb(${zc[0]},${zc[1]},${zc[2]})`;
      pctText = (ps.makes / ps.att * 100).toFixed(1) + '%';
      shotsText = `${ps.makes}/${ps.att}`;
      if (ls && ls.att > 0) {
        const diff = ps.makes / ps.att - ls.makes / ls.att;
        const cls = diff >= 0.02 ? 'pos' : diff <= -0.02 ? 'neg' : 'neu';
        ligaHTML = `<span class="szc-zone-card-diff ${cls}">Liga ${(ls.makes / ls.att * 100).toFixed(1)}%</span>`;
      }
    }
    return `<div class="szc-zone-card${hasAny ? '' : ' szc-no-data'}" style="border-left-color:${borderColor}">
      <div class="szc-zone-card-info">
        <div class="szc-zone-card-name">${SZC_ZONE_LABELS[zone]}</div>
        <div class="szc-zone-card-att">${shotsText}</div>
      </div>
      <div class="szc-zone-card-right">
        <div class="szc-zone-card-pct">${pctText}</div>
        ${ligaHTML}
      </div>
    </div>`;
  }).join('');
}

function renderZoneChart(canvas, playerShots) {
  const W = canvas.offsetWidth || 400;
  const H = Math.round(W * 15 / 14);
  canvas.width = W; canvas.height = H;
  const svg = document.getElementById('szcSvg');
  if (svg) svg.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  const m = W / 14;

  if (!LEAGUE_ZONE_STATS && SHOTS_MAP) {
    const all = [];
    SHOTS_MAP.forEach(v => all.push(...v));
    LEAGUE_ZONE_STATS = szcComputeStats(all);
  }

  const pStats = szcComputeStats(playerShots);
  szcDrawZoneColors(ctx, W, H, m, pStats, LEAGUE_ZONE_STATS);
  szcUpdateSvg(pStats, LEAGUE_ZONE_STATS);
  const _lvShots = szcApplyLocVis(szcPlayerAllShots);
  const _lvGIds = szcLocVis === 'all' ? szcPlayerGameIds : null;
  const statsAll = szcComputeStats(szcFilterByPeriod(_lvShots, 'all', _lvGIds));
  const statsL10 = szcComputeStats(szcFilterByPeriod(_lvShots, 'last10', _lvGIds));
  const statsL5  = szcComputeStats(szcFilterByPeriod(_lvShots, 'last5', _lvGIds));
  szcRenderZoneCards(statsAll, statsL10, statsL5, LEAGUE_ZONE_STATS);
}


// Close autocomplete on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.szc-search-wrap')) {
    const ac = document.getElementById('szcAC');
    if (ac) ac.style.display = 'none';
  }
});

function szcFilterByPeriod(shots, period, gameIds) {
  if (period === 'all') return shots;
  const n = period === 'last5' ? 5 : 10;
  let lastN;
  if (gameIds && gameIds.length > 0) {
    lastN = new Set(gameIds.slice(-n));
  } else {
    const gameMap = new Map();
    shots.forEach(s => { if (!gameMap.has(s['IdPartido'])) gameMap.set(s['IdPartido'], s['Fecha']); });
    const sorted = [...gameMap.entries()].sort((a, b) => {
      const [ad,am,ay]=a[1].split('/'); const [bd,bm,by]=b[1].split('/');
      return new Date(ay,am-1,ad)-new Date(by,bm-1,bd);
    });
    lastN = new Set(sorted.slice(-n).map(g => g[0]));
  }
  return shots.filter(s => lastN.has(s['IdPartido']));
}

function setSzcPeriod(period) {
  szcPeriod = period;
  ['szcPeriodAll','szcPeriodL5','szcPeriodL10'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = {all:'szcPeriodAll', last5:'szcPeriodL5', last10:'szcPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  if (szcCurrentIdx >= 0) selectSzcPlayer(szcCurrentIdx);
}

function szcApplyLocVis(shots) {
  if (szcLocVis === 'all') return shots;
  const val = szcLocVis === 'local' ? 'True' : 'False';
  return shots.filter(s => s['Local'] === val);
}

function setSzcLocVis(v) {
  szcLocVis = v;
  ['szcLocVisAll','szcLocVisLocal','szcLocVisVisit'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = {all:'szcLocVisAll', local:'szcLocVisLocal', visit:'szcLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  if (szcCurrentIdx >= 0) selectSzcPlayer(szcCurrentIdx);
}

function selectSzcPlayer(idx) {
  szcCurrentIdx = idx;
  const player = PLAYERS[idx];
  document.getElementById('szcInput').value = player['Nombre completo'];
  document.getElementById('szcAC').style.display = 'none';
  document.getElementById('szcEmpty').style.display = 'none';
  document.getElementById('szcMain').style.display = 'none';
  document.getElementById('szcLoading').style.display = 'block';
  document.getElementById('szcPlayerName').textContent = player['Nombre completo'];
  document.getElementById('szcPlayerTeam').textContent = player.Equipo + (player.DORSAL ? ` · #${Math.round(parseFloat(player.DORSAL))}` : '');

  const doRender = () => {
    const dNum = String(Math.round(parseFloat(player.DORSAL) || 0));
    const key = player.Equipo + '||' + dNum;
    const rawShots = SHOTS_BY_PLAYER ? (SHOTS_BY_PLAYER.get(key) || []) : [];
    // Use stable key (fecha|local|visit) to match shots — IdPartido is dynamic and may
    // differ between stats CSV and shots CSV scraped at different times.
    const _pStableKeys = new Set(player._games.map(r => {
      const local = r['Condicion equipos'] === 'LOCAL' ? r['Equipo'] : r['Rival'];
      const visit = r['Condicion equipos'] === 'LOCAL' ? r['Rival'] : r['Equipo'];
      return r['Fecha'] + '|' + local + '|' + visit;
    }));
    const allShots = _pStableKeys.size ? rawShots.filter(s =>
      _pStableKeys.has(s['Fecha'] + '|' + s['Equipo_local'] + '|' + s['Equipo_visitante'])
    ) : rawShots;
    // Build szcPlayerGameIds using shots CSV IDs in chronological order
    const _pShotsIdByStable = new Map();
    rawShots.forEach(s => {
      const k = s['Fecha'] + '|' + s['Equipo_local'] + '|' + s['Equipo_visitante'];
      if (!_pShotsIdByStable.has(k)) _pShotsIdByStable.set(k, s['IdPartido']);
    });
    szcPlayerGameIds = player._games.map(r => {
      const local = r['Condicion equipos'] === 'LOCAL' ? r['Equipo'] : r['Rival'];
      const visit = r['Condicion equipos'] === 'LOCAL' ? r['Rival'] : r['Equipo'];
      return _pShotsIdByStable.get(r['Fecha'] + '|' + local + '|' + visit) || null;
    }).filter(Boolean);
    szcPlayerAllShots = allShots;
    const locVisShots = szcApplyLocVis(allShots);
    const locVisGameIds = szcLocVis === 'all' ? szcPlayerGameIds : null;
    const shots = szcFilterByPeriod(locVisShots, szcPeriod, locVisGameIds);
    // Shot summary badges
    const t2i = shots.filter(s => s['Tipo'] === 'TIRO2').length;
    const t2a = shots.filter(s => s['Tipo'] === 'TIRO2' && s['Resultado'] === 'CONVERTIDO').length;
    const t3i = shots.filter(s => s['Tipo'] === 'TIRO3').length;
    const t3a = shots.filter(s => s['Tipo'] === 'TIRO3' && s['Resultado'] === 'CONVERTIDO').length;
    const shotsEl = document.getElementById('szcPlayerShots');
    if (shotsEl) {
      shotsEl.innerHTML = [
        t2i ? `<span class="szc-pstat">2PT <b>${t2a}/${t2i}</b> ${(t2a/t2i*100).toFixed(0)}%</span>` : '',
        t3i ? `<span class="szc-pstat">3PT <b>${t3a}/${t3i}</b> ${(t3a/t3i*100).toFixed(0)}%</span>` : '',
      ].join('');
    }
    document.getElementById('szcLoading').style.display = 'none';
    document.getElementById('szcMain').style.display = 'block';
    requestAnimationFrame(() => renderZoneChart(document.getElementById('szcCanvas'), shots));
  };

  if (SHOTS_MAP === null) loadShots().then(doRender); else doRender();
}

// ============================================================
// TIRO POR ZONAS — EQUIPOS
// ============================================================

function tzcRenderZoneCards(statsAll, statsL10, statsL5, lStats) {
  const el = document.getElementById('tzcZoneCards');
  if (!el) return;
  const aps = tzcPeriod === 'all' ? statsAll : tzcPeriod === 'last10' ? statsL10 : statsL5;
  el.innerHTML = SZC_ZONES.map(zone => {
    const ps = aps[zone];
    const hasData = ps && ps.att > 0;
    const hasAny = [statsAll, statsL10, statsL5].some(s => s[zone] && s[zone].att > 0);
    let borderColor = '#1e293b';
    let pctText = '—';
    let shotsText = '';
    let ligaHTML = '';
    if (hasData) {
      const ls = lStats ? lStats[zone] : null;
      const zc = szcZoneColor(ps, ls);
      borderColor = `rgb(${zc[0]},${zc[1]},${zc[2]})`;
      pctText = (ps.makes / ps.att * 100).toFixed(1) + '%';
      shotsText = `${ps.makes}/${ps.att}`;
      if (ls && ls.att > 0) {
        const diff = ps.makes / ps.att - ls.makes / ls.att;
        const cls = diff >= 0.02 ? 'pos' : diff <= -0.02 ? 'neg' : 'neu';
        ligaHTML = `<span class="szc-zone-card-diff ${cls}">Liga ${(ls.makes / ls.att * 100).toFixed(1)}%</span>`;
      }
    }
    return `<div class="szc-zone-card${hasAny ? '' : ' szc-no-data'}" style="border-left-color:${borderColor}">
      <div class="szc-zone-card-info">
        <div class="szc-zone-card-name">${SZC_ZONE_LABELS[zone]}</div>
        <div class="szc-zone-card-att">${shotsText}</div>
      </div>
      <div class="szc-zone-card-right">
        <div class="szc-zone-card-pct">${pctText}</div>
        ${ligaHTML}
      </div>
    </div>`;
  }).join('');
}

function renderTzcZoneChart(canvas, teamShots) {
  const W = canvas.offsetWidth || 400;
  const H = Math.round(W * 15 / 14);
  canvas.width = W; canvas.height = H;
  const svg = document.getElementById('tzcSvg');
  if (svg) svg.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  const m = W / 14;

  if (!LEAGUE_ZONE_STATS && SHOTS_MAP) {
    const all = [];
    SHOTS_MAP.forEach(v => all.push(...v));
    LEAGUE_ZONE_STATS = szcComputeStats(all);
  }

  const isLiga = tzcCurrentTeam === '__LIGA__';
  const pStats = szcComputeStats(teamShots);
  szcDrawZoneColors(ctx, W, H, m, pStats, isLiga ? null : LEAGUE_ZONE_STATS);
  szcUpdateSvg(pStats, isLiga ? null : LEAGUE_ZONE_STATS, 'tzcSvg');
  const _tlvShots = tzcApplyLocVis(tzcTeamAllShots);
  const _tlvGIds = tzcLocVis === 'all' ? tzcTeamGameIds : null;
  const statsAll = szcComputeStats(szcFilterByPeriod(_tlvShots, 'all', _tlvGIds));
  const statsL10 = szcComputeStats(szcFilterByPeriod(_tlvShots, 'last10', _tlvGIds));
  const statsL5  = szcComputeStats(szcFilterByPeriod(_tlvShots, 'last5', _tlvGIds));
  tzcRenderZoneCards(statsAll, statsL10, statsL5, isLiga ? null : LEAGUE_ZONE_STATS);
}

function setTzcPeriod(period) {
  tzcPeriod = period;
  ['tzcPeriodAll','tzcPeriodL5','tzcPeriodL10'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = {all:'tzcPeriodAll', last5:'tzcPeriodL5', last10:'tzcPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  if (tzcCurrentTeam) onTzcTeamChange();
}

function tzcApplyLocVis(shots) {
  if (tzcLocVis === 'all') return shots;
  const val = tzcLocVis === 'local' ? 'True' : 'False';
  return shots.filter(s => s['Local'] === val);
}

function setTzcLocVis(v) {
  tzcLocVis = v;
  ['tzcLocVisAll','tzcLocVisLocal','tzcLocVisVisit'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = {all:'tzcLocVisAll', local:'tzcLocVisLocal', visit:'tzcLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  if (tzcCurrentTeam) onTzcTeamChange();
}

function tzcInit() {
  const sel = document.getElementById('tzcTeam');
  if (!sel || sel.options.length > 1) return;
  const ligaOpt = document.createElement('option');
  ligaOpt.value = '__LIGA__';
  ligaOpt.textContent = '— Liga —';
  sel.appendChild(ligaOpt);
  [...TEAMS].sort((a,b) => a.Equipo.localeCompare(b.Equipo)).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.Equipo;
    opt.textContent = t.Equipo;
    sel.appendChild(opt);
  });
  if (tzcCurrentTeam) sel.value = tzcCurrentTeam;
}

function onTzcTeamChange() {
  const sel = document.getElementById('tzcTeam');
  const teamName = sel ? sel.value : '';
  if (!teamName) {
    document.getElementById('tzcEmpty').style.display = '';
    document.getElementById('tzcMain').style.display = 'none';
    document.getElementById('tzcLoading').style.display = 'none';
    tzcCurrentTeam = null;
    return;
  }
  tzcCurrentTeam = teamName;
  document.getElementById('tzcEmpty').style.display = 'none';
  document.getElementById('tzcMain').style.display = 'none';
  document.getElementById('tzcLoading').style.display = 'block';

  const doRender = () => {
    // Collect all shots for this team
    const allShots = [];
    const isLiga = teamName === '__LIGA__';
    SHOTS_MAP.forEach(shots => {
      shots.forEach(s => { if (isLiga || s['Equipo'] === teamName) allShots.push(s); });
    });
    const team = isLiga ? null : TEAM_MAP[teamName];
    // Use stable key (fecha|local|visit) to match shots — IdPartido is dynamic and may
    // differ between stats CSV and shots CSV scraped at different times.
    let filteredShots = allShots;
    if (!isLiga && team) {
      const _tStableKeys = new Set(team._gamelog.map(g => {
        const local = g.condicion === 'LOCAL' ? teamName : g.rival;
        const visit = g.condicion === 'LOCAL' ? g.rival : teamName;
        return g.fecha + '|' + local + '|' + visit;
      }));
      filteredShots = allShots.filter(s =>
        _tStableKeys.has(s['Fecha'] + '|' + s['Equipo_local'] + '|' + s['Equipo_visitante'])
      );
      const _tShotsIdByStable = new Map();
      filteredShots.forEach(s => {
        const k = s['Fecha'] + '|' + s['Equipo_local'] + '|' + s['Equipo_visitante'];
        if (!_tShotsIdByStable.has(k)) _tShotsIdByStable.set(k, s['IdPartido']);
      });
      tzcTeamGameIds = team._gamelog.map(g => {
        const local = g.condicion === 'LOCAL' ? teamName : g.rival;
        const visit = g.condicion === 'LOCAL' ? g.rival : teamName;
        return _tShotsIdByStable.get(g.fecha + '|' + local + '|' + visit) || null;
      }).filter(Boolean);
    } else {
      tzcTeamGameIds = null;
    }
    tzcTeamAllShots = filteredShots;
    const tzcLocVisShots = tzcApplyLocVis(filteredShots);
    const tzcLocVisGameIds = tzcLocVis === 'all' ? tzcTeamGameIds : null;
    const shots = szcFilterByPeriod(tzcLocVisShots, tzcPeriod, tzcLocVisGameIds);
    // Shot summary badges
    const t2i = shots.filter(s => s['Tipo'] === 'TIRO2').length;
    const t2a = shots.filter(s => s['Tipo'] === 'TIRO2' && s['Resultado'] === 'CONVERTIDO').length;
    const t3i = shots.filter(s => s['Tipo'] === 'TIRO3').length;
    const t3a = shots.filter(s => s['Tipo'] === 'TIRO3' && s['Resultado'] === 'CONVERTIDO').length;
    document.getElementById('tzcTeamName').textContent = isLiga ? 'Liga Nacional' : teamName;
    const shotsEl = document.getElementById('tzcTeamShots');
    if (shotsEl) {
      shotsEl.innerHTML = [
        t2i ? `<span class="szc-pstat">2PT <b>${t2a}/${t2i}</b> ${(t2a/t2i*100).toFixed(0)}%</span>` : '',
        t3i ? `<span class="szc-pstat">3PT <b>${t3a}/${t3i}</b> ${(t3a/t3i*100).toFixed(0)}%</span>` : '',
      ].join('');
    }
    document.getElementById('tzcLoading').style.display = 'none';
    document.getElementById('tzcMain').style.display = 'block';
    requestAnimationFrame(() => renderTzcZoneChart(document.getElementById('tzcCanvas'), shots));
  };

  if (SHOTS_MAP === null) loadShots().then(doRender); else doRender();
}

// ============================================================
// QUINTETOS
// ============================================================
const PBP_CSV = SEASON === '2025-26'
  ? SEASON_DIR + 'liga_nacional_pbp.csv'
  : 'https://repsndqhmyklxukffovf.supabase.co/storage/v1/object/public/pbp/liga_nacional_pbp.csv';
let PBP_MAP = null;        // null=not loaded, Map<gameId, rows[]> keyed by PBP CSV IdPartido
let PBP_STABLE_MAP = null; // Map keyed by "fecha|local|visit" (cross-CSV stable key)
let LINEUP_DATA = null; // Map<teamName, Map<lineupKey, {players,secs,pf,pa,games}>>
let qntSort = 'min', qntDir = 'desc';


// ============================================================
// RECAP AUTOMÁTICO
// ============================================================
let RECAP_MAP = null; // null=not loaded, Map<"fecha|local|visit", texto>

async function loadRecaps() {
  if (RECAP_MAP !== null) return;
  try {
    const resp = await fetch('recaps.json?v=' + new Date().toISOString().slice(0, 10));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    RECAP_MAP = new Map(Object.entries(data).map(([k, v]) => [k, v.texto]));
  } catch (e) { RECAP_MAP = new Map(); }
}

function renderRecap(fecha, local, visit) {
  const panel = document.getElementById('tgmRecapPanel');

  const doRender = () => {
    const skey = fecha + '|' + local + '|' + visit;
    const texto = RECAP_MAP.get(skey);
    if (!texto) {
      panel.innerHTML = `<div style="padding:28px;text-align:center;color:var(--muted);font-size:.82rem">No hay recap disponible para este partido.</div>`;
      return;
    }
    panel.innerHTML = `<div style="padding:18px 4px;line-height:1.65;font-size:.86rem;color:var(--text)">
      ${texto.split(/\n+/).map(p => `<p style="margin:0 0 12px">${p}</p>`).join('')}
    </div>`;
  };

  if (RECAP_MAP === null) {
    panel.innerHTML = `<div style="padding:28px;text-align:center;color:var(--muted);font-size:.82rem">Cargando recap…</div>`;
    loadRecaps().then(doRender);
  } else {
    doRender();
  }
}

// Convert period + time-remaining string "MM:SS" to total elapsed seconds

// Possessions = FGA + 0.44*FTA - OReb + TO

function computeLineups() {
  if (LINEUP_DATA !== null) return;
  LINEUP_DATA = new Map();
  const _lastNameToTeam = new Map();
  PLAYERS.forEach(p => {
    const ln = (p['Nombre completo'] || '').split(',')[0].trim().toUpperCase();
    if (!_lastNameToTeam.has(ln)) _lastNameToTeam.set(ln, new Set());
    _lastNameToTeam.get(ln).add(p.Equipo);
  });
  PBP_MAP.forEach((events, gameId) => {
    events.sort((a, b) => parseInt(a['NumAccion']) - parseInt(b['NumAccion']));
    let localTeam = (events.find(e => e['Equipo_local'])     || {})['Equipo_local']     || '';
    const visitTeam = (events.find(e => e['Equipo_visitante']) || {})['Equipo_visitante'] || '';
    if (!localTeam && visitTeam) {
      const votes = new Map();
      events.forEach(ev => {
        if (ev['Equipo_lado'] !== 'LOCAL' || !ev['Jugador']) return;
        const ln = ev['Jugador'].split(',')[0].trim().toUpperCase();
        const teams = _lastNameToTeam.get(ln);
        if (teams) teams.forEach(t => { if (t !== visitTeam) votes.set(t, (votes.get(t) || 0) + 1); });
      });
      let best = '', bestCount = 0;
      votes.forEach((cnt, t) => { if (cnt > bestCount) { best = t; bestCount = cnt; } });
      localTeam = best;
    }
    if (!localTeam || !visitTeam) return;
    let localCourt = new Set(), visitCourt = new Set();
    let localSeg = null, visitSeg = null;
    // Possession counters for the active segment of each side
    let localPoss = null, visitPoss = null; // {fga,fta,oreb,to, dfga,dfta,doreb,dto}
    let scoreLoc = 0, scoreVis = 0;
    // Period-boundary buffers: null = not in boundary mode, [] = collecting ENTRA events
    let localBndEntras = null, visitBndEntras = null;

    function lineupKey(court) { return [...court].sort().join('~'); }
    function emptyPoss() { return { fga:0,fgm:0,fg3a:0,fg3m:0,fta:0,ast:0,oreb:0,dreb:0,to:0, dfga:0,dfgm:0,dfg3a:0,dfg3m:0,dfta:0,doreb:0,ddreb:0,dto:0 }; }

    function recordSeg(side, court, seg, poss, endElapsed) {
      if (!seg || court.size !== 5 || endElapsed === null) return;
      const secs = endElapsed - seg.elapsed;
      if (secs <= 0) return;
      const isLocal = side === 'LOCAL';
      const pf = isLocal ? (scoreLoc - seg.scoreLoc) : (scoreVis - seg.scoreVis);
      const pa = isLocal ? (scoreVis - seg.scoreVis) : (scoreLoc - seg.scoreLoc);
      const teamName = isLocal ? localTeam : visitTeam;
      const key = seg.key;
      if (!LINEUP_DATA.has(teamName)) LINEUP_DATA.set(teamName, new Map());
      const teamMap = LINEUP_DATA.get(teamName);
      if (!teamMap.has(key)) teamMap.set(key, {
        players: [...court].sort(), secs: 0, pf: 0, pa: 0, games: new Set(),
        fga:0,fgm:0,fg3a:0,fg3m:0,fta:0,ast:0,oreb:0,dreb:0,to:0,
        dfga:0,dfgm:0,dfg3a:0,dfg3m:0,dfta:0,doreb:0,ddreb:0,dto:0
      });
      const e = teamMap.get(key);
      e.secs += secs; e.pf += Math.max(0, pf); e.pa += Math.max(0, pa);
      e.games.add(gameId);
      if (poss) {
        e.fga+=poss.fga; e.fgm+=poss.fgm; e.fg3a+=poss.fg3a; e.fg3m+=poss.fg3m;
        e.fta+=poss.fta; e.ast+=poss.ast; e.oreb+=poss.oreb; e.dreb+=poss.dreb; e.to+=poss.to;
        e.dfga+=poss.dfga; e.dfgm+=poss.dfgm; e.dfg3a+=poss.dfg3a; e.dfg3m+=poss.dfg3m;
        e.dfta+=poss.dfta; e.doreb+=poss.doreb; e.ddreb+=poss.ddreb; e.dto+=poss.dto;
      }
    }

    function startSeg(court, elapsed) {
      if (court.size !== 5 || elapsed === null) return null;
      return { elapsed, scoreLoc, scoreVis, key: lineupKey(court) };
    }

    events.forEach(ev => {
      const tipo = ev['Tipo'], lado = ev['Equipo_lado'], jugador = ev['Jugador'];
      const periodo = parseFloat(ev['Periodo']) || 1, tiempo = ev['Tiempo'];
      const ml = ev['Marcador_local'], mv = ev['Marcador_visitante'];
      if (ml !== '' && ml !== undefined && ml !== 'None') scoreLoc = parseInt(ml) || scoreLoc;
      if (mv !== '' && mv !== undefined && mv !== 'None') scoreVis = parseInt(mv) || scoreVis;
      const elapsed = pbpElapsed(periodo, tiempo);

      // Accumulate possession events into both active segments simultaneously
      const isLoc = lado === 'LOCAL';
      const offP = isLoc ? localPoss : visitPoss;  // attacker's offense counters
      const defP = isLoc ? visitPoss : localPoss;  // defender's defense counters
      if (tipo==='CANASTA-2P'||tipo==='TIRO2-FALLADO'||tipo==='CANASTA-3P'||tipo==='TIRO3-FALLADO') {
        if(offP){offP.fga++;} if(defP){defP.dfga++;}
        if(tipo==='CANASTA-2P'||tipo==='CANASTA-3P'){ if(offP){offP.fgm++;} if(defP){defP.dfgm++;} }
        if(tipo==='CANASTA-3P'||tipo==='TIRO3-FALLADO'){ if(offP){offP.fg3a++;} if(defP){defP.dfg3a++;} }
        if(tipo==='CANASTA-3P'){ if(offP){offP.fg3m++;} if(defP){defP.dfg3m++;} }
      } else if (tipo==='CANASTA-1P'||tipo==='TIRO1-FALLADO') {
        if(offP){offP.fta++;} if(defP){defP.dfta++;}
      } else if (tipo==='REBOTE-OFENSIVO') {
        if(offP){offP.oreb++;} if(defP){defP.doreb++;}
      } else if (tipo==='REBOTE-DEFENSIVO') {
        if(offP){offP.dreb++;} if(defP){defP.ddreb++;}
      } else if (tipo==='PERDIDA') {
        if(offP){offP.to++;} if(defP){defP.dto++;}
      } else if (tipo==='ASISTENCIA') {
        if(offP){offP.ast++;}
      }

      if (tipo === 'CAMBIO-JUGADOR-ENTRA' || tipo === 'CAMBIO-JUGADOR-SALE') {
        if (!jugador) return;
        const isLocal = lado === 'LOCAL';
        // In boundary mode, buffer ENTRA events instead of processing them normally.
        // They will be applied as a fresh lineup when INICIO-PERIODO fires.
        if (tipo === 'CAMBIO-JUGADOR-ENTRA') {
          const arr = isLocal ? localBndEntras : visitBndEntras;
          if (arr !== null) { arr.push(jugador); return; }
        }
        const court = isLocal ? localCourt : visitCourt;
        const seg = isLocal ? localSeg : visitSeg;
        const poss = isLocal ? localPoss : visitPoss;
        recordSeg(lado, court, seg, poss, elapsed);
        if (tipo === 'CAMBIO-JUGADOR-ENTRA') court.add(jugador); else court.delete(jugador);
        const newSeg = startSeg(court, elapsed);
        const newPoss = court.size === 5 ? emptyPoss() : null;
        if (isLocal) { localSeg = newSeg; localPoss = newPoss; }
        else { visitSeg = newSeg; visitPoss = newPoss; }
      }

      if (tipo === 'INICIO-PERIODO') {
        // Apply buffered lineups: if >=5 players collected, replace the court with the new lineup.
        // If no ENTRA events were buffered (some games omit period-start subs), keep the old court.
        const applyBnd = (court, seg, poss, entras) => {
          if (entras !== null && entras.length >= 5) {
            const nc = new Set(entras);
            const ns = (nc.size === 5 && seg) ? { elapsed: seg.elapsed, scoreLoc, scoreVis, key: lineupKey(nc) } : null;
            return [nc, ns, nc.size === 5 ? emptyPoss() : null];
          }
          return [court, seg, poss];
        };
        [localCourt, localSeg, localPoss] = applyBnd(localCourt, localSeg, localPoss, localBndEntras);
        [visitCourt, visitSeg, visitPoss] = applyBnd(visitCourt, visitSeg, visitPoss, visitBndEntras);
        localBndEntras = null; visitBndEntras = null;
      }

      if (tipo === 'FINAL-PERIODO' || tipo === 'FINAL-PARTIDO') {
        const endE = pbpElapsed(periodo, '00:00');
        recordSeg('LOCAL',    localCourt, localSeg, localPoss, endE);
        recordSeg('VISITANTE',visitCourt, visitSeg, visitPoss, endE);
        if (tipo === 'FINAL-PARTIDO') {
          localCourt = new Set(); visitCourt = new Set();
          localSeg = null; visitSeg = null; localPoss = null; visitPoss = null;
        } else {
          // Keep courts so games without period-start CAMBIO events continue tracking.
          // Enter boundary mode: CAMBIO-ENTRA events before INICIO-PERIODO are buffered.
          localSeg = startSeg(localCourt, endE); localPoss = localCourt.size === 5 ? emptyPoss() : null;
          visitSeg = startSeg(visitCourt, endE); visitPoss = visitCourt.size === 5 ? emptyPoss() : null;
          localBndEntras = []; visitBndEntras = [];
        }
      }
    });
  });
}


const QNT_COLS = [
  { key: 'players', label: 'Quinteto', align: 'left',  tip: 'Los 5 jugadores que compartieron cancha en este quinteto' },
  { key: 'min',    label: 'Min',    align: 'right', tip: 'Minutos totales jugados juntos' },
  { key: 'poss',    label: 'Pos',    align: 'right', tip: 'Posesiones estimadas mientras el quinteto estuvo en cancha (promedio de ofensivas y defensivas). Fórmula: FGA + 0,44×FTA − Reb-Of + Pérdidas' },
  { key: 'pm',      label: '+/-',    align: 'right', tip: 'Diferencial de puntos (PF − PC) mientras el quinteto estuvo en cancha' },
  { key: 'offrtg',  label: 'OffRtg', align: 'right', tip: 'Puntos anotados por cada 100 posesiones ofensivas del quinteto' },
  { key: 'defrtg',  label: 'DefRtg', align: 'right', tip: 'Puntos recibidos por cada 100 posesiones defensivas del quinteto (menor = mejor)' },
  { key: 'net',     label: 'Net',    align: 'right', tip: 'OffRtg − DefRtg: diferencial de rating por 100 posesiones' },
  { key: 'fgpct',   label: 'TC%',     align: 'right', tip: '% de tiros de campo convertidos (2P + 3P) mientras el quinteto atacaba' },
  { key: 'fg3pct',  label: '3P%',     align: 'right', tip: '% de triples convertidos mientras el quinteto atacaba' },
  { key: 'ast100',  label: 'AST%',    align: 'right', tip: '% de canastas de campo convertidas que fueron asistidas por el quinteto. Fórmula: AST / FGM × 100' },
  { key: 'tovpct',  label: 'TOV%',    align: 'right', tip: '% de posesiones terminadas en pérdida. Fórmula: TO / (FGA + 0,44×FTA + TO) × 100 (menor = mejor)' },
  { key: 'orebpct', label: 'ORB%',    align: 'right', tip: '% de rebotes ofensivos disponibles capturados por el quinteto' },
  { key: 'drebpct', label: 'DReb%',   align: 'right', tip: '% de rebotes defensivos disponibles capturados por el quinteto' },
  { key: 'fg3rate', label: '3PA Rate',align: 'right', tip: '% de tiros de campo que son intentos de triple (3PA / FGA × 100)' },
  { key: 'ftr',     label: 'FTr',     align: 'right', tip: 'Tiros libres intentados por tiro de campo (FTA / FGA). Mide cuánto llega el quinteto a la línea' },
];


// ============================================================
// CONEXIONES
// ============================================================
let _cnxData   = null;  // computed connection data for current selection
let _cnxNodes  = [];    // node positions for hit-test
let _cnxFilter = 'all'; // 'all' | 'given' | 'received'


// ============================================================
// TRÍOS Y DUPLAS
// ============================================================
let TRIO_DATA  = null; // Map<teamName, Map<trioKey, stats>>
let DUPLA_DATA = null; // Map<teamName, Map<duplaKey, stats>>
let trioSort = 'min', trioDir = 'desc';
let dupSort  = 'min', dupDir  = 'desc';

function _combinations(arr, k) {
  if (k === arr.length) return [arr.slice()];
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const sub = _combinations(arr.slice(i + 1), k - 1);
    sub.forEach(c => result.push([arr[i], ...c]));
  }
  return result;
}

function computeSublineups(size) {
  const map = new Map();
  LINEUP_DATA.forEach((teamMap, teamName) => {
    teamMap.forEach(v => {
      const combos = _combinations(v.players, size);
      combos.forEach(combo => {
        const key = combo.join('~');
        if (!map.has(teamName)) map.set(teamName, new Map());
        const tmap = map.get(teamName);
        if (!tmap.has(key)) tmap.set(key, {
          players: combo, secs: 0, pf: 0, pa: 0, games: new Set(),
          fga:0,fgm:0,fg3a:0,fg3m:0,fta:0,ast:0,oreb:0,dreb:0,to:0,
          dfga:0,dfgm:0,dfg3a:0,dfg3m:0,dfta:0,doreb:0,ddreb:0,dto:0
        });
        const e = tmap.get(key);
        e.secs += v.secs; e.pf += v.pf; e.pa += v.pa;
        v.games.forEach(g => e.games.add(g));
        e.fga+=v.fga; e.fgm+=v.fgm; e.fg3a+=v.fg3a; e.fg3m+=v.fg3m;
        e.fta+=v.fta; e.ast+=v.ast; e.oreb+=v.oreb; e.dreb+=v.dreb; e.to+=v.to;
        e.dfga+=v.dfga; e.dfgm+=v.dfgm; e.dfg3a+=v.dfg3a; e.dfg3m+=v.dfg3m;
        e.dfta+=v.dfta; e.doreb+=v.doreb; e.ddreb+=v.ddreb; e.dto+=v.dto;
      });
    });
  });
  return map;
}

function _sublineupRowStats(v) {
  const min = v.secs / 60;
  const offPoss = calcPoss(v.fga, v.fta, v.oreb, v.to);
  const defPoss = calcPoss(v.dfga, v.dfta, v.doreb, v.dto);
  const poss    = (offPoss + defPoss) / 2;
  const pm      = v.pf - v.pa;
  const offrtg  = offPoss > 0 ? v.pf / offPoss * 100 : 0;
  const defrtg  = defPoss > 0 ? v.pa / defPoss * 100 : 0;
  const net     = offrtg - defrtg;
  const fgpct   = v.fga  > 0 ? v.fgm  / v.fga  * 100 : 0;
  const fg3pct  = v.fg3a > 0 ? v.fg3m / v.fg3a * 100 : 0;
  const ast100  = v.fgm  > 0 ? v.ast  / v.fgm  * 100 : 0;
  const tovpct  = (v.fga + 0.44*v.fta + v.to) > 0 ? v.to / (v.fga + 0.44*v.fta + v.to) * 100 : 0;
  const orebpct = (v.oreb + v.ddreb) > 0 ? v.oreb / (v.oreb + v.ddreb) * 100 : 0;
  const drebpct = (v.dreb + v.doreb) > 0 ? v.dreb / (v.dreb + v.doreb) * 100 : 0;
  const fg3rate = v.fga  > 0 ? v.fg3a / v.fga  * 100 : 0;
  const ftr     = v.fga  > 0 ? v.fta  / v.fga        : 0;
  return { players: v.players, min, poss, pm, offrtg, defrtg, net, fgpct, fg3pct, ast100, tovpct, orebpct, drebpct, fg3rate, ftr };
}

const SUBLINEUP_COLS = [
  { key: 'players', label: 'Jugadores', align: 'left',  tip: 'Los jugadores que compartieron cancha' },
  { key: 'min',    label: 'Min',    align: 'right', tip: 'Minutos totales jugados juntos' },
  { key: 'poss',    label: 'Pos',    align: 'right', tip: 'Posesiones estimadas (promedio de ofensivas y defensivas)' },
  { key: 'pm',      label: '+/-',    align: 'right', tip: 'Diferencial de puntos mientras estuvieron en cancha juntos' },
  { key: 'offrtg',  label: 'OffRtg', align: 'right', tip: 'Puntos anotados por cada 100 posesiones ofensivas' },
  { key: 'defrtg',  label: 'DefRtg', align: 'right', tip: 'Puntos recibidos por cada 100 posesiones defensivas (menor = mejor)' },
  { key: 'net',     label: 'Net',    align: 'right', tip: 'OffRtg \u2212 DefRtg' },
  { key: 'fgpct',   label: 'TC%',     align: 'right', tip: '% de tiros de campo convertidos atacando' },
  { key: 'fg3pct',  label: '3P%',     align: 'right', tip: '% de triples convertidos' },
  { key: 'ast100',  label: 'AST%',    align: 'right', tip: '% de canastas asistidas. AST / FGM \u00d7 100' },
  { key: 'tovpct',  label: 'TOV%',    align: 'right', tip: '% de posesiones terminadas en p\u00e9rdida (menor = mejor)' },
  { key: 'orebpct', label: 'ORB%',    align: 'right', tip: '% de rebotes ofensivos disponibles capturados' },
  { key: 'drebpct', label: 'DReb%',   align: 'right', tip: '% de rebotes defensivos disponibles capturados' },
  { key: 'fg3rate', label: '3PA Rate',align: 'right', tip: '% de tiros que son intentos de triple' },
  { key: 'ftr',     label: 'FTr',     align: 'right', tip: 'Tiros libres intentados por tiro de campo (FTA / FGA)' },
];

function _renderSublineupTable(dataMap, teamSel, minMin, sortKey, sortDir, ids, leagueLabel) {
  const { emptyEl, loadingEl, contentEl, countEl, theadEl, tbodyEl } = ids;
  function lerpRgb(t,r1,g1,b1,r2,g2,b2){return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;}
  function heatRG(v,mn,mx){if(mn===mx)return'';const t=(v-mn)/(mx-mn);return t>=.5?lerpRgb((t-.5)*2,100,116,139,52,211,153):lerpRgb(t*2,248,113,113,100,116,139);}
  function heatPur(v,mn,mx){if(mn===mx)return'';return lerpRgb((v-mn)/(mx-mn),100,116,139,167,139,250);}
  function heatTeal(v,mn,mx){if(mn===mx)return'';return lerpRgb(1-(v-mn)/(mx-mn),100,116,139,94,234,212);}
  function heatWht(v,mn,mx){if(mn===mx)return'';return lerpRgb((v-mn)/(mx-mn),100,116,139,226,232,240);}
  const fRtg = v => v===0?'\u2014':v.toFixed(1);
  const fPct = v => v===0?'\u2014':v.toFixed(1)+'%';
  const fRat = v => v===0?'\u2014':v.toFixed(2);
  const sign = v => v>0?'+':'';

  if (!teamSel) {
    let allRows = [];
    dataMap.forEach((tmap,teamName)=>{tmap.forEach(v=>{const row=_sublineupRowStats(v);if(row.min<minMin)return;allRows.push({team:teamName,...row});});});
    allRows.sort((a,b)=>b.min-a.min); allRows=allRows.slice(0,20);
    loadingEl.style.display='none'; emptyEl.style.display='none'; contentEl.style.display='';
    countEl.textContent='Top 20 \u00b7 liga';
    const vr=allRows.filter(r=>r.poss>0);
    const cr=key=>{const vs=vr.map(r=>r[key]).filter(v=>v!==0);return vs.length?[Math.min(...vs),Math.max(...vs)]:[0,0];};
    const[mnMin2,mxMin2]=cr('min'),[mnPos,mxPos]=cr('poss'),[mnPm,mxPm]=cr('pm'),
         [mnOff,mxOff]=cr('offrtg'),[mnDef,mxDef]=cr('defrtg'),[mnNet,mxNet]=cr('net'),
         [mnFg,mxFg]=cr('fgpct'),[mnFg3,mxFg3]=cr('fg3pct'),[mnAst,mxAst]=cr('ast100'),
         [mnTov,mxTov]=cr('tovpct'),[mnOreb,mxOreb]=cr('orebpct'),[mnDreb,mxDreb]=cr('drebpct'),
         [mnFg3r,mxFg3r]=cr('fg3rate'),[mnFtr,mxFtr]=cr('ftr');
    const LEAGUE_COLS=[{key:'team',label:'Equipo',align:'left',tip:'Equipo al que pertenecen los jugadores'},...SUBLINEUP_COLS];
    theadEl.innerHTML='<tr>'+LEAGUE_COLS.map(c=>`<th class="qnt-th" style="text-align:${c.align}" data-tip="${c.tip}">${c.label}</th>`).join('')+'</tr>';
    tbodyEl.innerHTML=allRows.map((r,i)=>{
      const ph=r.players.map(p=>`<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
      return `<tr style="background:${i%2===0?'rgba(139,92,246,.04)':'rgba(255,255,255,.015)'}">
        <td><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(r.team)}${r.team}</span></td>
        <td><div class="qnt-players">${ph}</div></td>
        <td style="color:${heatWht(r.min,mnMin2,mxMin2)};font-weight:600">${r.min.toFixed(1)}</td>
        <td style="color:${heatWht(r.poss,mnPos,mxPos)};font-weight:600">${r.poss>0?Math.round(r.poss):'\u2014'}</td>
        <td style="color:${heatRG(r.pm,mnPm,mxPm)};font-weight:700">${sign(r.pm)}${r.pm}</td>
        <td style="color:${heatPur(r.offrtg,mnOff,mxOff)};font-weight:700">${fRtg(r.offrtg)}</td>
        <td style="color:${heatTeal(r.defrtg,mnDef,mxDef)};font-weight:700">${fRtg(r.defrtg)}</td>
        <td style="color:${heatRG(r.net,mnNet,mxNet)};font-weight:700">${sign(r.net)}${fRtg(r.net)}</td>
        <td style="color:${heatPur(r.fgpct,mnFg,mxFg)};font-weight:600">${fPct(r.fgpct)}</td>
        <td style="color:${heatPur(r.fg3pct,mnFg3,mxFg3)};font-weight:600">${fPct(r.fg3pct)}</td>
        <td style="color:${heatPur(r.ast100,mnAst,mxAst)};font-weight:600">${fPct(r.ast100)}</td>
        <td style="color:${heatTeal(r.tovpct,mnTov,mxTov)};font-weight:600">${fPct(r.tovpct)}</td>
        <td style="color:${heatPur(r.orebpct,mnOreb,mxOreb)};font-weight:600">${fPct(r.orebpct)}</td>
        <td style="color:${heatTeal(r.drebpct,mnDreb,mxDreb)};font-weight:600">${fPct(r.drebpct)}</td>
        <td style="color:${heatWht(r.fg3rate,mnFg3r,mxFg3r)};font-weight:600">${fPct(r.fg3rate)}</td>
        <td style="color:${heatPur(r.ftr,mnFtr,mxFtr)};font-weight:600">${fRat(r.ftr)}</td>
      </tr>`;
    }).join('');
    return;
  }

  const tmap=dataMap.get(teamSel);
  if(!tmap||tmap.size===0){emptyEl.textContent='No hay datos de jugada a jugada para este equipo.';emptyEl.style.display='';contentEl.style.display='none';loadingEl.style.display='none';countEl.textContent='';return;}

  let rows=[];
  tmap.forEach(v=>{const row=_sublineupRowStats(v);if(row.min>=minMin)rows.push(row);});
  rows.sort((a,b)=>{if(sortKey==='players'){const cmp=a.players.join('').localeCompare(b.players.join(''));return sortDir==='asc'?cmp:-cmp;}return sortDir==='asc'?a[sortKey]-b[sortKey]:b[sortKey]-a[sortKey];});

  loadingEl.style.display='none'; emptyEl.style.display='none'; contentEl.style.display='';
  countEl.innerHTML=`${rows.length} ${leagueLabel} <span style="display:inline-flex;align-items:center;gap:4px;color:var(--purple-l)">&middot; ${teamLogoHtml(teamSel)}${teamSel}</span>`;

  const vr=rows.filter(r=>r.poss>0);
  const cr=key=>{const vs=vr.map(r=>r[key]).filter(v=>v!==0);return vs.length?[Math.min(...vs),Math.max(...vs)]:[0,0];};
  const[mnMin2,mxMin2]=cr('min'),[mnPos,mxPos]=cr('poss'),[mnPm,mxPm]=cr('pm'),
       [mnOff,mxOff]=cr('offrtg'),[mnDef,mxDef]=cr('defrtg'),[mnNet,mxNet]=cr('net'),
       [mnFg,mxFg]=cr('fgpct'),[mnFg3,mxFg3]=cr('fg3pct'),[mnAst,mxAst]=cr('ast100'),
       [mnTov,mxTov]=cr('tovpct'),[mnOreb,mxOreb]=cr('orebpct'),[mnDreb,mxDreb]=cr('drebpct'),
       [mnFg3r,mxFg3r]=cr('fg3rate'),[mnFtr,mxFtr]=cr('ftr');

  const TEAM_COLS=[{key:'team',label:'Equipo',align:'left',tip:'Equipo al que pertenecen los jugadores'},...SUBLINEUP_COLS];
  theadEl.innerHTML='<tr>'+TEAM_COLS.map(c=>{
    const sorted=c.key===sortKey;
    const arrow=sorted?(sortDir==='asc'?' \u2191':' \u2193'):'';
    const onclick=c.key==='team'?'':` onclick="${leagueLabel==='tr\u00edos'?'trioSortBy':'dupSortBy'}('${c.key}')"`;
    return `<th class="qnt-th${sorted?' qnt-sorted':''}" style="text-align:${c.align}"${onclick} data-tip="${c.tip}">${c.label}${arrow}</th>`;
  }).join('')+'</tr>';

  if(!rows.length){tbodyEl.innerHTML=`<tr><td colspan="${TEAM_COLS.length}" style="text-align:center;color:var(--muted);padding:32px">No hay ${leagueLabel} con ${minMin}+ minutos juntos.</td></tr>`;return;}

  tbodyEl.innerHTML=rows.map((r,i)=>{
    const ph=r.players.map(p=>`<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
    return `<tr style="background:${i%2===0?'rgba(139,92,246,.04)':'rgba(255,255,255,.015)'}">
      <td><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(teamSel)}${teamSel}</span></td>
      <td><div class="qnt-players">${ph}</div></td>
      <td style="color:${heatWht(r.min,mnMin2,mxMin2)};font-weight:600">${r.min.toFixed(1)}</td>
      <td style="color:${heatWht(r.poss,mnPos,mxPos)};font-weight:600">${r.poss>0?Math.round(r.poss):'\u2014'}</td>
      <td style="color:${heatRG(r.pm,mnPm,mxPm)};font-weight:700">${sign(r.pm)}${r.pm}</td>
      <td style="color:${heatPur(r.offrtg,mnOff,mxOff)};font-weight:700">${fRtg(r.offrtg)}</td>
      <td style="color:${heatTeal(r.defrtg,mnDef,mxDef)};font-weight:700">${fRtg(r.defrtg)}</td>
      <td style="color:${heatRG(r.net,mnNet,mxNet)};font-weight:700">${sign(r.net)}${fRtg(r.net)}</td>
      <td style="color:${heatPur(r.fgpct,mnFg,mxFg)};font-weight:600">${fPct(r.fgpct)}</td>
      <td style="color:${heatPur(r.fg3pct,mnFg3,mxFg3)};font-weight:600">${fPct(r.fg3pct)}</td>
      <td style="color:${heatPur(r.ast100,mnAst,mxAst)};font-weight:600">${fPct(r.ast100)}</td>
      <td style="color:${heatTeal(r.tovpct,mnTov,mxTov)};font-weight:600">${fPct(r.tovpct)}</td>
      <td style="color:${heatPur(r.orebpct,mnOreb,mxOreb)};font-weight:600">${fPct(r.orebpct)}</td>
      <td style="color:${heatTeal(r.drebpct,mnDreb,mxDreb)};font-weight:600">${fPct(r.drebpct)}</td>
      <td style="color:${heatWht(r.fg3rate,mnFg3r,mxFg3r)};font-weight:600">${fPct(r.fg3rate)}</td>
      <td style="color:${heatPur(r.ftr,mnFtr,mxFtr)};font-weight:600">${fRat(r.ftr)}</td>
    </tr>`;
  }).join('');
}

function _sublineupInit(prefix, renderFn) {
  const sel = document.getElementById(prefix + 'Team');
  if (sel.options.length <= 1) {
    [...new Set(TEAMS.map(t=>t.Equipo))].sort().forEach(eq => {
      const o = document.createElement('option'); o.value = eq; o.textContent = eq;
      sel.appendChild(o);
    });
  }
  if (PBP_MAP === null) {
    document.getElementById(prefix + 'Loading').style.display = '';
    document.getElementById(prefix + 'Empty').style.display = 'none';
    loadPbp().then(() => {
      if (LINEUP_DATA === null) computeLineups();
      if (TRIO_DATA === null)   TRIO_DATA  = computeSublineups(3);
      if (DUPLA_DATA === null)  DUPLA_DATA = computeSublineups(2);
      renderFn();
    });
  } else {
    if (LINEUP_DATA === null) computeLineups();
    if (TRIO_DATA === null)   TRIO_DATA  = computeSublineups(3);
    if (DUPLA_DATA === null)  DUPLA_DATA = computeSublineups(2);
    renderFn();
  }
}

function trioInit()  { _sublineupInit('trio', renderTrios);  }
function dupInit()   { _sublineupInit('dup',  renderDuplas); }

function trioSortBy(col) {
  if (trioSort === col) trioDir = trioDir === 'asc' ? 'desc' : 'asc';
  else { trioSort = col; trioDir = col === 'players' ? 'asc' : 'desc'; }
  renderTrios();
}
function dupSortBy(col) {
  if (dupSort === col) dupDir = dupDir === 'asc' ? 'desc' : 'asc';
  else { dupSort = col; dupDir = col === 'players' ? 'asc' : 'desc'; }
  renderDuplas();
}

async function onTrioTeamChange() {
  if (PBP_MAP === null) {
    document.getElementById('trioLoading').style.display = '';
    document.getElementById('trioEmpty').style.display = 'none';
    document.getElementById('trioContent').style.display = 'none';
    await loadPbp();
  }
  if (LINEUP_DATA === null) computeLineups();
  if (TRIO_DATA === null) TRIO_DATA = computeSublineups(3);
  renderTrios();
}

async function onDupTeamChange() {
  if (PBP_MAP === null) {
    document.getElementById('dupLoading').style.display = '';
    document.getElementById('dupEmpty').style.display = 'none';
    document.getElementById('dupContent').style.display = 'none';
    await loadPbp();
  }
  if (LINEUP_DATA === null) computeLineups();
  if (DUPLA_DATA === null) DUPLA_DATA = computeSublineups(2);
  renderDuplas();
}

function renderTrios() {
  if (!TRIO_DATA) return;
  _renderSublineupTable(
    TRIO_DATA,
    document.getElementById('trioTeam').value,
    parseFloat(document.getElementById('trioMinMin').value) || 5,
    trioSort, trioDir,
    {
      emptyEl:   document.getElementById('trioEmpty'),
      loadingEl: document.getElementById('trioLoading'),
      contentEl: document.getElementById('trioContent'),
      countEl:   document.getElementById('trioCount'),
      theadEl:   document.getElementById('trioThead'),
      tbodyEl:   document.getElementById('trioTbody'),
    },
    'tr\u00edos'
  );
}

function renderDuplas() {
  if (!DUPLA_DATA) return;
  _renderSublineupTable(
    DUPLA_DATA,
    document.getElementById('dupTeam').value,
    parseFloat(document.getElementById('dupMinMin').value) || 5,
    dupSort, dupDir,
    {
      emptyEl:   document.getElementById('dupEmpty'),
      loadingEl: document.getElementById('dupLoading'),
      contentEl: document.getElementById('dupContent'),
      countEl:   document.getElementById('dupCount'),
      theadEl:   document.getElementById('dupThead'),
      tbodyEl:   document.getElementById('dupTbody'),
    },
    'duplas'
  );
}

// ============================================================
// CONEXIONES EQUIPO (t-conexiones)
// ============================================================
let _tCnxSort  = { col: 'apg', asc: false };
let _tCnxRows  = [];
let _tCnxCheck = { pbpAst: 0, csvAst: 0 };


// ============================================================
// RADAR CHART — Perfil Estadístico de Jugador
// ============================================================
let _radarPct = null;   // percentile arrays per feature, computed once
let _radarIdxA = null;
let _radarIdxB = null;

const RADAR_MIN_SEG = 12000; // 200 min × 60 s

const RADAR_AXES = [
  { key: 'SCORING',    label: 'SCORING',    metrics: ['PTS/40', 'TCI/40'],           desc: 'Volumen anotador: puntos y tiros de campo intentados por 40 min' },
  { key: 'SHOOTING',   label: 'SHOOTING',   metrics: ['3PA Rate', '3P%'],             desc: 'Perfil de tiro exterior: frecuencia e impacto del triple' },
  { key: 'DEFENSE',    label: 'DEFENSE',    metrics: ['REC/40', 'TAP/40'],            desc: 'Impacto defensivo: recuperos y tapones por 40 min' },
  { key: 'REBOUNDING', label: 'REBOUNDING', metrics: ['REB/40', 'ORB%', 'DRB%'],     desc: 'Dominio en el tablero: volumen, rebote ofensivo y defensivo' },
  { key: 'PLAYMAKING', label: 'PLAYMAKING', metrics: ['AST/40', 'AST/PER'],          desc: 'Creación de juego: asistencias por 40 min y ratio AST/pérdida' },
  { key: 'EFFICIENCY', label: 'EFFICIENCY', metrics: ['TS%', 'EFG%'],                desc: 'Eficiencia anotadora: True Shooting % y Effective FG%' },
];
// Clockwise from top: SCORING, SHOOTING, DEFENSE, REBOUNDING, PLAYMAKING, EFFICIENCY
const RADAR_COLORS = {
  A: { fill: 'rgba(139,92,246,.25)', stroke: '#8b5cf6' },
  B: { fill: 'rgba(45,212,191,.18)', stroke: '#2dd4bf' },
};

function radarGetRaw(p) {
  const seg = p.SEG || 0;
  if (seg < 1) return null;
  const min = seg / 60;
  const tci = (p.T2I || 0) + (p.T3I || 0);
  const per40 = v => v / min * 40;
  const astTov = (p.PER || 0) > 0 ? (p.AST || 0) / p.PER : (p.AST > 0 ? 10 : 0);
  const tsAdj = tci * 2 + 0.44 * 2 * (p.T1I || 0);
  const ts = tsAdj > 0 ? (p.PTS || 0) / tsAdj * 100 : null;
  const efg = tci > 0 ? ((p.T2A || 0) + 1.5 * (p.T3A || 0)) / tci * 100 : null;
  const t3rate = tci > 0 ? (p.T3I || 0) / tci * 100 : null;
  const t3pct = (p.T3I || 0) > 0 ? (p.T3A || 0) / p.T3I * 100 : null;
  const t1i = p.T1I || 0;
  const ftPct = t1i > 0 ? (p.T1A || 0) / t1i : null;
  const ftaRate = tci > 0 ? t1i / tci : null;
  return {
    pts_per40:    per40(p.PTS || 0),
    fga_per40:    per40(tci),
    ast_per40:    per40(p.AST || 0),
    ast_tov:      astTov,
    trb_per40:    per40(p.RT || 0),
    orb_pct:      p['ORB%'] != null ? p['ORB%'] : null,
    drb_pct:      p['DRB%'] != null ? p['DRB%'] : null,
    stl_per40:    per40(p.REC || 0),
    blk_per40:    per40(p.TAP || 0),
    ts_pct:       ts,
    efg_pct:      efg,
    t3pa_rate:    t3rate,
    t3p_pct:      t3pct,
    ft_pct:       ftPct,
    fta_rate:     ftaRate,
  };
}

function radarComputePercentiles() {
  if (_radarPct) return;
  // qualifying players: >= 200 min
  const qualified = PLAYERS.filter(p => (p.SEG || 0) >= RADAR_MIN_SEG);
  const features = ['pts_per40','fga_per40','ast_per40','ast_tov','trb_per40',
                    'orb_pct','drb_pct','stl_per40','blk_per40','ts_pct','efg_pct','t3pa_rate','t3p_pct'];
  const rawAll = qualified.map(p => radarGetRaw(p));

  // For each feature build sorted array of non-null values
  _radarPct = {};
  for (const feat of features) {
    const vals = rawAll.map(r => r ? r[feat] : null).filter(v => v != null && !isNaN(v));
    vals.sort((a, b) => a - b);
    _radarPct[feat] = vals;
  }
}

function radarPercentile(feat, val) {
  if (val == null || isNaN(val) || !_radarPct) return 0;
  const arr = _radarPct[feat];
  if (!arr || arr.length === 0) return 0;
  // count how many are strictly below val
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1; else hi = mid;
  }
  return Math.round(lo / arr.length * 100);
}

function radarGetScores(p) {
  radarComputePercentiles();
  const r = radarGetRaw(p);
  if (!r) return null;
  const pct = feat => radarPercentile(feat, r[feat]);

  const scoring    = (pct('pts_per40') + pct('fga_per40')) / 2;
  const efficiency = (pct('ts_pct') + pct('efg_pct')) / 2;
  const playmaking = (pct('ast_per40') + pct('ast_tov')) / 2;
  const rebounding = (pct('trb_per40') + (r.orb_pct != null ? pct('orb_pct') : 0) + (r.drb_pct != null ? pct('drb_pct') : 0)) /
                     (1 + (r.orb_pct != null ? 1 : 0) + (r.drb_pct != null ? 1 : 0));
  const defense    = (pct('stl_per40') + pct('blk_per40')) / 2;
  const shooting   = (pct('t3pa_rate') + (r.t3p_pct != null ? pct('t3p_pct') : pct('t3pa_rate'))) / 2;

  return {
    SCORING:    Math.round(scoring),
    SHOOTING:   Math.round(shooting),
    DEFENSE:    Math.round(defense),
    REBOUNDING: Math.round(rebounding),
    PLAYMAKING: Math.round(playmaking),
    EFFICIENCY: Math.round(efficiency),
  };
}

function radarBuildSvg(scoresA, nameA, scoresB, nameB) {
  const W = 460, H = 460;
  const cx = W / 2, cy = H / 2;
  const R = 148;
  const N = 6;
  const angles = RADAR_AXES.map((_, i) => -Math.PI / 2 + (2 * Math.PI / N) * i);
  const refs = [20, 40, 60, 80, 100];

  function pt(val, i) {
    const r = (val / 100) * R;
    return [cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i])];
  }
  function polygon(scores, col) {
    const pts = RADAR_AXES.map((ax, i) => pt(scores[ax.key] || 0, i));
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' Z';
    return `<path d="${d}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="2" stroke-linejoin="round" opacity=".9"/>`;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">
<defs>
  <filter id="rdrGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
`;

  // Reference rings
  for (const ref of refs) {
    const pts = angles.map(a => {
      const r = (ref / 100) * R;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    const isMax = ref === 100;
    svg += `<polygon points="${pts}" fill="none" stroke="${isMax ? 'rgba(139,92,246,.35)' : 'rgba(255,255,255,.08)'}" stroke-width="${isMax ? 1.5 : 1}" stroke-dasharray="${isMax ? 'none' : '3,4'}"/>`;
    // Ring label
    const labelPt = [cx, cy - (ref / 100) * R];
    svg += `<text x="${labelPt[0].toFixed(1)}" y="${(labelPt[1] - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.25)" font-family="Inter,sans-serif">${ref}</text>`;
  }

  // Axis lines
  for (let i = 0; i < N; i++) {
    const [x, y] = pt(100, i);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`;
  }

  // Polygons
  if (scoresB) svg += polygon(scoresB, RADAR_COLORS.B);
  svg += polygon(scoresA, RADAR_COLORS.A);

  // Dots + value labels on axes
  for (let i = 0; i < N; i++) {
    const ax = RADAR_AXES[i];
    const valA = scoresA[ax.key] || 0;
    const [xA, yA] = pt(valA, i);
    svg += `<circle cx="${xA.toFixed(1)}" cy="${yA.toFixed(1)}" r="4" fill="${RADAR_COLORS.A.stroke}" stroke="#0b0b16" stroke-width="1.5"/>`;
    if (scoresB) {
      const valB = scoresB[ax.key] || 0;
      const [xB, yB] = pt(valB, i);
      svg += `<circle cx="${xB.toFixed(1)}" cy="${yB.toFixed(1)}" r="4" fill="${RADAR_COLORS.B.stroke}" stroke="#0b0b16" stroke-width="1.5"/>`;
    }
  }

  // Axis labels
  for (let i = 0; i < N; i++) {
    const ax = RADAR_AXES[i];
    const offset = 18;
    const [xE, yE] = pt(100 + offset * 100 / R, i);
    const anchor = Math.abs(xE - cx) < 8 ? 'middle' : xE < cx ? 'end' : 'start';
    const score = scoresA[ax.key] || 0;
    svg += `<text x="${xE.toFixed(1)}" y="${(yE - 7).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" font-weight="700" fill="#a78bfa" font-family="Inter,sans-serif" letter-spacing=".4">${ax.label}</text>`;
    svg += `<text x="${xE.toFixed(1)}" y="${(yE + 6).toFixed(1)}" text-anchor="${anchor}" font-size="11" font-weight="800" fill="#f8fafc" font-family="Inter,sans-serif">${score}</text>`;
    if (scoresB) {
      const scoreB = scoresB[ax.key] || 0;
      svg += `<text x="${xE.toFixed(1)}" y="${(yE + 18).toFixed(1)}" text-anchor="${anchor}" font-size="10" font-weight="700" fill="${RADAR_COLORS.B.stroke}" font-family="Inter,sans-serif">${scoreB}</text>`;
    }
  }

  svg += '</svg>';
  return svg;
}

// ── Similarity (cosine, weighted z-score — mirrors Python model) ─────────────
let _radarSim = null;

const _SIM_FEATS = [
  { k: 'pts_per40',  w: 0.125  },
  { k: 'fga_per40',  w: 0.125  },
  { k: 'ts_pct',     w: 0.0625 },
  { k: 'efg_pct',    w: 0.0625 },
  { k: 't3p_pct',    w: 0.0625 },
  { k: 'ft_pct',     w: 0.0625 },
  { k: 'ast_per40',  w: 0.10   },
  { k: 'ast_tov',    w: 0.10   },
  { k: 'trb_per40',  w: 0.05   },
  { k: 'orb_pct',    w: 0.05   },
  { k: 'drb_pct',    w: 0.05   },
  { k: 'stl_per40',  w: 0.05   },
  { k: 'blk_per40',  w: 0.05   },
  { k: 't3pa_rate',  w: 0.025  },
  { k: 'fta_rate',   w: 0.025  },
];

function radarBuildSimVectors() {
  if (_radarSim) return;
  radarComputePercentiles();
  const pool = PLAYERS
    .map((p, i) => ({ p, i, raw: radarGetRaw(p) }))
    .filter(x => x.raw && (x.p.SEG || 0) >= RADAR_MIN_SEG);

  // Compute mean/std per feature
  const stats = {};
  _SIM_FEATS.forEach(({ k }) => {
    const vals = pool.map(x => x.raw[k]).filter(v => v != null && !isNaN(v));
    if (!vals.length) { stats[k] = { mean: 0, std: 1 }; return; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    stats[k] = { mean, std: Math.sqrt(variance) || 1 };
  });

  // Build weighted z-score vectors
  pool.forEach(x => {
    x.vec = _SIM_FEATS.map(({ k, w }) => {
      const v = x.raw[k];
      const z = (v != null && !isNaN(v)) ? (v - stats[k].mean) / stats[k].std : 0;
      return z * Math.sqrt(w);
    });
  });

  _radarSim = pool;
}

function radarGetSimilar(pA, n = 5) {
  radarBuildSimVectors();
  const ref = _radarSim.find(x => x.p === pA);
  if (!ref) return [];
  const vecA = ref.vec;
  const normA = Math.sqrt(vecA.reduce((s, v) => s + v * v, 0));
  if (!normA) return [];

  return _radarSim
    .filter(x => x.p !== pA)
    .map(x => {
      const normB = Math.sqrt(x.vec.reduce((s, v) => s + v * v, 0));
      if (!normB) return { p: x.p, sim: 0 };
      const dot = vecA.reduce((s, v, j) => s + v * x.vec[j], 0);
      return { p: x.p, sim: dot / (normA * normB) };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, n);
}

function radarRender() {
  const empty = document.getElementById('radarEmpty');
  const content = document.getElementById('radarContent');
  const svgWrap = document.getElementById('radarSvgWrap');
  const cards = document.getElementById('radarCards');
  const similar = document.getElementById('radarSimilar');
  const axisDefs = document.getElementById('radarAxisDefs');

  if (_radarIdxA === null) {
    empty.style.display = '';
    content.style.display = 'none';
    return;
  }

  const pA = PLAYERS[_radarIdxA];
  const scoresA = radarGetScores(pA);
  if (!scoresA) { empty.style.display = ''; content.style.display = 'none'; return; }

  let scoresB = null, pB = null;
  if (_radarIdxB !== null) {
    pB = PLAYERS[_radarIdxB];
    scoresB = radarGetScores(pB);
  }

  empty.style.display = 'none';
  content.style.display = '';

  // SVG
  svgWrap.innerHTML = radarBuildSvg(scoresA, pA['Nombre completo'], scoresB, pB ? pB['Nombre completo'] : null);

  // FIFA-style percentile cards
  let cardsHtml = '';
  for (const ax of RADAR_AXES) {
    const vA = scoresA[ax.key];
    const vB = scoresB ? scoresB[ax.key] : null;
    cardsHtml += `<div class="radar-card">
      <div class="radar-card-lbl">${ax.label}</div>
      <div class="radar-card-val">${vA}</div>
      ${vB !== null ? `<div class="radar-card-val-b">${vB}</div>` : ''}
      <div class="radar-card-bar-wrap"><div class="radar-card-bar" style="width:${vA}%"></div></div>
    </div>`;
  }
  cards.innerHTML = cardsHtml;

  // Similar players panel
  const simTitle = `<div class="radar-similar-title">Jugadores similares</div>`;
  const sims = radarGetSimilar(pA);
  let simHtml = simTitle;
  if (sims.length) {
    for (const { p, sim } of sims) {
      const pct = Math.round(sim * 100);
      simHtml += `<div class="radar-sim-item">
        <div class="radar-sim-header">
          <span class="radar-sim-name">${p['Nombre completo']}</span>
          <span class="radar-sim-score">${pct}%</span>
        </div>
        <div class="radar-sim-meta">${p.Equipo}</div>
        <div class="radar-sim-bar-wrap"><div class="radar-sim-bar" style="width:${pct}%"></div></div>
      </div>`;
    }
  } else {
    simHtml += `<div style="color:var(--muted);font-size:.8rem">Sin datos suficientes</div>`;
  }
  similar.innerHTML = simHtml;

  // Axis definitions (bottom)
  let defsHtml = `<div class="radar-axis-defs-title">Composición de ejes</div><div class="radar-axis-grid">`;
  for (const ax of RADAR_AXES) {
    const score = scoresA[ax.key] ?? 0;
    const metricsHtml = ax.metrics.map(m => `<span class="radar-axis-metric">${m}</span>`).join('');
    defsHtml += `<div class="radar-axis-card" title="${ax.desc}">
      <div class="radar-axis-card-header">
        <span class="radar-axis-card-label">${ax.label}</span>
        <span class="radar-axis-card-score">${score}</span>
      </div>
      <div class="radar-axis-card-bar-wrap"><div class="radar-axis-card-bar" style="width:${score}%"></div></div>
      <div class="radar-axis-card-metrics">${metricsHtml}</div>
    </div>`;
  }
  defsHtml += '</div>';
  axisDefs.innerHTML = defsHtml;
}

// ── Autocomplete helpers ─────────────────────────────────────────────────────
let _radarAcFocusIdx = { A: -1, B: -1 };

function radarAcBuildList(query) {
  if (!query || query.length < 2) return [];
  const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const matched = PLAYERS
    .map((p, i) => ({ i, name: p['Nombre completo'], team: p.Equipo }))
    .filter(x => x.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(q));
  // Francisco Caffaro siempre primero
  matched.sort((a, b) => {
    const aIsCaffaro = a.name.toUpperCase().includes('CAFFARO') ? -1 : 0;
    const bIsCaffaro = b.name.toUpperCase().includes('CAFFARO') ? -1 : 0;
    return aIsCaffaro - bIsCaffaro;
  });
  return matched.slice(0, 12);
}

function radarAcInput(side) {
  const input = document.getElementById('radarInput' + side);
  const ac = document.getElementById('radarAc' + side);
  _radarAcFocusIdx[side] = -1;
  const results = radarAcBuildList(input.value);
  if (!results.length) { ac.classList.remove('open'); ac.innerHTML = ''; return; }
  ac.innerHTML = results.map((r, j) =>
    `<div class="radar-ac-item" data-idx="${r.i}" data-j="${j}" onmousedown="radarAcSelect('${side}',${r.i},'${r.name.replace(/'/g,"\\'")}')">
      <span class="radar-ac-name">${r.name}</span>
      <span class="radar-ac-team">${r.team}</span>
    </div>`).join('');
  ac.classList.add('open');
}

function radarAcOpen(side) { radarAcInput(side); }
function radarAcClose(side) {
  document.getElementById('radarAc' + side).classList.remove('open');
}

function radarAcKey(e, side) {
  const ac = document.getElementById('radarAc' + side);
  const items = ac.querySelectorAll('.radar-ac-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _radarAcFocusIdx[side] = Math.min(_radarAcFocusIdx[side] + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _radarAcFocusIdx[side] = Math.max(_radarAcFocusIdx[side] - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const fi = _radarAcFocusIdx[side];
    if (fi >= 0 && items[fi]) items[fi].dispatchEvent(new MouseEvent('mousedown'));
    return;
  } else { return; }
  items.forEach((el, j) => el.classList.toggle('focused', j === _radarAcFocusIdx[side]));
}

function radarAcSelect(side, idx, name) {
  document.getElementById('radarInput' + side).value = name;
  document.getElementById('radarAc' + side).classList.remove('open');
  if (side === 'A') _radarIdxA = idx; else _radarIdxB = idx;
  radarRender();
}

function radarToggleCmp() {
  const on = document.getElementById('radarCmpCheck').checked;
  document.getElementById('radarSearchB').style.display = on ? '' : 'none';
  if (!on) { _radarIdxB = null; document.getElementById('radarInputB').value = ''; radarRender(); }
}

// ── Tooltip encabezados ──────────────────────────────────────────────────────
(function(){
  const tip = document.getElementById('thTip');
  document.addEventListener('mouseover', function(e){
    const th = e.target.closest('thead th[data-tip]');
    if (!th){ tip.style.display='none'; return; }
    tip.textContent = th.dataset.tip;
    tip.style.display = 'block';
  });
  document.addEventListener('mousemove', function(e){
    if (tip.style.display==='none') return;
    const tw=tip.offsetWidth, th2=tip.offsetHeight;
    const vw=window.innerWidth, vh=window.innerHeight;
    let left=e.clientX+14, top=e.clientY-th2-10;
    if (left+tw>vw-8) left=e.clientX-tw-14;
    if (top<8) top=e.clientY+18;
    tip.style.left=left+'px'; tip.style.top=top+'px';
  });
  document.addEventListener('mouseout', function(e){
    if (e.target.closest('thead th[data-tip]')) tip.style.display='none';
  });
})();
