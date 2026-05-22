// ── Auth guard ────────────────────────────────────────────────────────────────
(function() {
  const LOGIN_URL    = '../login.html';
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
  window.location.replace('../login.html');
}

// ============================================================
// ============================================================
// DATA — loaded dynamically from CSV
// ============================================================
const CSV_PATH = 'liga_argentina.csv';
const DOB_PATH = '../shared/players_dob.csv';
let DOB_MAP = {};
function calcAge(dob) {
  if (!dob) return null;
  const [d, m, y] = dob.split('/');
  const birth = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}
let TEAM_MAP = {}, PLAYERS = [], TEAMS = [];
let GAMES_ALL = [];        // all unique games (deduplicated)

// Upcoming fixture — hardcoded; merged into GAMES_ALL, deduped against played games
let GAME_PLAYERS_MAP = {}; // IdPartido → player rows[]
let _partidoMode = false;  // true when modal is opened from sec-partidos

function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += line[i]; }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const rows = [], rawLines = text.split('\n'), headers = parseCSVLine(rawLines[0]);
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim(); if (!line) continue;
    const vals = parseCSVLine(line), row = {};
    headers.forEach((h, j) => row[h] = vals[j] !== undefined ? vals[j] : '');
    rows.push(row);
  }
  return rows;
}

function buildRAW_J(rows) {
  const map = {};
  rows.filter(r => r['Nombre completo'] && r['Nombre completo'] !== 'TOTALES').forEach(r => {
    const key = r['Nombre completo'] + '||' + r['Equipo'];
    if (!map[key]) map[key] = {
      'Nombre completo': r['Nombre completo'], Equipo: r['Equipo'],
      PJ: 0, SEG: 0, PTS: 0, T2A: 0, T2I: 0, T3A: 0, T3I: 0,
      T1A: 0, T1I: 0, RD: 0, RO: 0, RT: 0, AST: 0, REC: 0, PER: 0, TAP: 0, VAL: 0,
      DORSAL: null, _games: []
    };
    const p = map[key], seg = parseFloat(r['Segundos jugados']) || 0;
    p.SEG += seg; if (seg > 0) { p.PJ++; p._games.push(r); }
    if (r['Número Camiseta']) p.DORSAL = r['Número Camiseta'];
    p.PTS += parseFloat(r['Puntos']) || 0;
    p.T2A += parseFloat(r['T2A']) || 0; p.T2I += parseFloat(r['T2I']) || 0;
    p.T3A += parseFloat(r['T3A']) || 0; p.T3I += parseFloat(r['T3I']) || 0;
    p.T1A += parseFloat(r['T1A']) || 0; p.T1I += parseFloat(r['T1I']) || 0;
    p.RD  += parseFloat(r['DReb']) || 0; p.RO  += parseFloat(r['OReb']) || 0;
    p.RT  += parseFloat(r['TReb']) || 0; p.AST += parseFloat(r['Asistencias']) || 0;
    p.REC += parseFloat(r['Recuperos']) || 0; p.PER += parseFloat(r['Perdidas']) || 0;
    p.TAP += parseFloat(r['Tapones cometidos']) || 0; p.VAL += parseFloat(r['Valoracion']) || 0;
  });
  return Object.values(map).filter(p => p.PJ > 0);
}

function buildRAW_T(rows) {
  const map = {}, byGame = {};
  const tots = rows.filter(r => r['Nombre completo'] === 'TOTALES');
  tots.forEach(r => {
    if (!byGame[r['IdPartido']]) byGame[r['IdPartido']] = [];
    byGame[r['IdPartido']].push(r);
  });
  tots.forEach(r => {
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
    if (gr.length === 2) {
      [0, 1].forEach(i => {
        const my = gr[i], opp = gr[1-i];
        if (map[my['Equipo']]) {
          map[my['Equipo']].OPP_PTS += parseFloat(opp['Puntos']) || 0;
          map[my['Equipo']].OPP_DReb += parseFloat(opp['DReb']) || 0;
          map[my['Equipo']].OPP_RO += parseFloat(opp['OReb']) || 0;
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
          map[my['Equipo']]._gamelog.push({
            gameId: my['IdPartido'],
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
let jConf='all';
let tPeriod='all';
let tPhase='all'; // 'all' | 'regular' | 'post'
let tLocVis='all';
let tConf='all';
let lConf='all';
let lPhase='post';
let szcPeriod='all';
let szcLocVis='all';
let szcCurrentIdx=-1;
let szcPlayerAllShots=[];
let szcPlayerGameIds=null; // sorted game IDs the player actually played (from stats CSV)
let tSort='W%', tDir='desc';
let jPts=[], tPts=[];
let jHov=-1, jPin=new Set(), tHov=-1, tPin=-1;

// ── SHOTS DATA ──────────────────────────────────────
const SHOTS_CSV = 'liga_argentina_shots.csv';
let SHOTS_MAP = null; // null=not loaded, Map keyed by gameId
let SHOTS_BY_PLAYER = null; // Map keyed by "Equipo||Dorsal"
let LEAGUE_ZONE_STATS = null;
let tzcPeriod='all';
let tzcLocVis='all';
let tzcCurrentTeam=null;
let tzcTeamAllShots=[];
let tzcTeamGameIds=null;
let _smState = { gameId: null, local: '', visit: '', focusTeam: null, filter: { team: 'all', tipo: 'all', result: 'all' } };

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

function openGroup(group, defaultSection) {
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.remove('active','grp-active'));
  const grpBtn = document.getElementById(group==='equipos'?'grpEquipos':'grpJugadores');
  grpBtn.classList.add('active','grp-active');
  document.getElementById('subEquipos').style.display = group==='equipos' ? '' : 'none';
  document.getElementById('subJugadores').style.display = group==='jugadores' ? '' : 'none';
  switchSection(defaultSection);
}

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
  if(id==='t-tiro') { tzcInit(); }
  if(id==='j-tiro') {
    const main = document.getElementById('szcMain');
    if (main && main.style.display !== 'block') {
      const idx = PLAYERS.findIndex(p => p['Nombre completo'].toUpperCase().includes('OSORES'));
      if (idx >= 0) selectSzcPlayer(idx);
    }
  }
  if(id==='j-chart') setTimeout(drawJChart,30);
  if(id==='j-conexiones') { cnxInit(); setTimeout(drawConnections,30); }
  if(id==='j-radar' && _radarIdxA === null) {
    const _norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const idx = PLAYERS.findIndex(p => _norm(p['Nombre completo']).includes('OSORES'));
    if (idx >= 0) {
      _radarIdxA = idx;
      document.getElementById('radarInputA').value = PLAYERS[idx]['Nombre completo'];
      radarRender();
    }
  }
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
    if (!sel.value && PBP_MAP === null) {
      const loading = document.getElementById('qntLoading');
      const empty = document.getElementById('qntEmpty');
      loading.style.display = ''; empty.style.display = 'none';
      loadPbp().then(() => { if (LINEUP_DATA === null) computeLineups(); renderQuintetos(); });
    }
  }
  if(id==='trios') { trioInit(); }
  if(id==='duplas') { dupInit(); }
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
    if(jConf==='norte'&&!CONF_NORTE.has(p.Equipo))return false;
    if(jConf==='sur'&&!CONF_SUR.has(p.Equipo))return false;
    if(jPhase==='regular'&&!p._regular)return false;
    if(jPhase==='post'&&!p._post)return false;
    if(team&&p.Equipo!==team)return false;
    if(p.PJ<minG)return false;
    if(s&&!p.name.toLowerCase().includes(s)&&!p.Equipo.toLowerCase().includes(s))return false;
    if(ak&&!isNaN(av)&&!chk(p[ak],op,av))return false;
    if(ak2&&!isNaN(av2)&&!chk(p[ak2],op2,av2))return false;
    if(ak3&&!isNaN(av3)&&!chk(p[ak3],op3,av3))return false;
    if(ak4&&!isNaN(av4)&&!chk(p[ak4],op4,av4))return false;
    return true;
  });
}
function clearJFilter(){
  ['jAttr','jAttr2','jAttr3','jAttr4'].forEach(id=>document.getElementById(id).value='');
  ['jAttrVal','jAttrVal2','jAttrVal3','jAttrVal4'].forEach(id=>document.getElementById(id).value='');
  jPin.clear();
  updateJFilterVisibility();
  onJFilter();
}
function onJFilter(){
  updateJFilterVisibility();
  jFiltered=getJFiltered();
  document.getElementById('jCount').textContent=jFiltered.length;
  renderJTable();
  if(document.getElementById('sec-j-chart').classList.contains('active'))drawJChart();
}

function computeStatsFromGames(games, tm) {
  const acc={SEG:0,PTS:0,T2A:0,T2I:0,T3A:0,T3I:0,T1A:0,T1I:0,RD:0,RO:0,RT:0,AST:0,REC:0,PER:0,TAP:0,VAL:0};
  games.forEach(r=>{
    acc.SEG+=parseFloat(r['Segundos jugados'])||0;
    acc.PTS+=parseFloat(r['Puntos'])||0;
    acc.T2A+=parseFloat(r['T2A'])||0; acc.T2I+=parseFloat(r['T2I'])||0;
    acc.T3A+=parseFloat(r['T3A'])||0; acc.T3I+=parseFloat(r['T3I'])||0;
    acc.T1A+=parseFloat(r['T1A'])||0; acc.T1I+=parseFloat(r['T1I'])||0;
    acc.RD+=parseFloat(r['DReb'])||0; acc.RO+=parseFloat(r['OReb'])||0;
    acc.RT+=parseFloat(r['TReb'])||0; acc.AST+=parseFloat(r['Asistencias'])||0;
    acc.REC+=parseFloat(r['Recuperos'])||0; acc.PER+=parseFloat(r['Perdidas'])||0;
    acc.TAP+=parseFloat(r['Tapones cometidos'])||0; acc.VAL+=parseFloat(r['Valoracion'])||0;
  });
  const pj=games.length||1; const d={PJ:games.length};
  Object.entries(MAP_J).forEach(([k,v])=>d[v]=Math.round((acc[k]/pj)*100)/100);
  d.MPG=Math.round((acc.SEG/pj/60)*10)/10;
  d.TCAPG=Math.round(((acc.T2A+acc.T3A)/pj)*100)/100;
  d.TCIPG=Math.round(((acc.T2I+acc.T3I)/pj)*100)/100;
  const tci=acc.T2I+acc.T3I;
  d['TC%']=tci>0?Math.round((acc.T2A+acc.T3A)/tci*1000)/10:null;
  d['T2%']=acc.T2I>0?Math.round(acc.T2A/acc.T2I*1000)/10:null;
  d['T3%']=acc.T3I>0?Math.round(acc.T3A/acc.T3I*1000)/10:null;
  d['T1%']=acc.T1I>0?Math.round(acc.T1A/acc.T1I*1000)/10:null;
  const pos=tci+0.44*(acc.T1I||0)+(acc.PER||0);
  d.POS=Math.round((pos/pj)*10)/10;
  d['PTS/POS']=pos>0?Math.round(acc.PTS/pos*100)/100:null;
  const efgNum=(acc.T2A||0)+1.5*(acc.T3A||0);
  d['EFG%']=tci>0?Math.round(efgNum/tci*1000)/10:null;
  const tsAdj=2*(tci+0.44*(acc.T1I||0));
  d['TS%']=tsAdj>0?Math.round((acc.PTS||0)/tsAdj*1000)/10:null;
  const toPct_denom=tci+0.44*(acc.T1I||0)+(acc.AST||0)+(acc.PER||0);
  d['TO%']=toPct_denom>0?Math.round((acc.PER||0)/toPct_denom*1000)/10:null;
  d['AST/TO']=(acc.PER||0)>0?Math.round((acc.AST||0)/acc.PER*100)/100:null;
  d['3PI/TI']=tci>0?Math.round((acc.T3I||0)/tci*1000)/10:null;
  d['ORtg']=pos>0?Math.round(acc.PTS/pos*100*10)/10:null;
  d['DRtg']=tm?tm.DRtg||null:null;
  d['NetRtg']=(d['ORtg']!=null&&d['DRtg']!=null)?Math.round((d['ORtg']-d['DRtg'])*10)/10:null;
  const tmFGA=tm?(tm.T2I||0)+(tm.T3I||0):0;
  const tmPossUsed=tmFGA+0.44*(tm?tm.T1I||0:0)+(tm?tm.PER||0:0);
  const playerMinTotal=acc.SEG/60;
  const tmMinTotal=(tm?tm.PJ||1:1)*200;
  d['USG%']=(tmPossUsed>0&&playerMinTotal>0)?Math.round(pos*tmMinTotal/(5*playerMinTotal*tmPossUsed)*1000)/10:null;
  const tmRO=tm?tm.RO||0:0;
  const tmOppDReb=tm?tm.OPP_DReb||0:0;
  d['ORB%']=((tmRO+tmOppDReb)>0&&playerMinTotal>0)?Math.round((acc.RO||0)*(tmMinTotal/5)/(playerMinTotal*(tmRO+tmOppDReb))*1000)/10:null;
  const tmRD=tm?tm.RD||0:0;
  const tmOppRO=tm?tm.OPP_RO||0:0;
  d['DRB%']=(playerMinTotal>0&&(tmRD+tmOppRO)>0)?Math.round((acc.RD||0)*(tmMinTotal/5)/(playerMinTotal*(tmRD+tmOppRO))*1000)/10:null;
  d['FTr']=tci>0?Math.round((acc.T1I||0)/tci*1000)/1000:null;
  return d;
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

function setJPeriod(period) {
  jPeriod=period;
  ['jPeriodAll','jPeriodL5','jPeriodL10'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'jPeriodAll',last5:'jPeriodL5',last10:'jPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  renderJTable();
}

function setJPhase(v) {
  jPhase=v;
  ['jPhaseAll','jPhaseReg','jPhasePost'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'jPhaseAll',regular:'jPhaseReg',post:'jPhasePost'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  onJFilter();
}

function setJLocVis(v) {
  jLocVis=v;
  ['jLocVisAll','jLocVisLocal','jLocVisVisit'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'jLocVisAll',local:'jLocVisLocal',visit:'jLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  renderJTable();
}

function setJConf(v) {
  jConf=v;
  ['jConfAll','jConfNorte','jConfSur'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'jConfAll',norte:'jConfNorte',sur:'jConfSur'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  const sel=document.getElementById('jChartConf'); if(sel)sel.value=v;
  onJFilter();
}

function renderJTable() {
  if(document.getElementById('jCardAdv').style.display!=='none'){renderJAdvTable();}
  let rows=[...jFiltered];
  rows.sort((a,b)=>{
    const ad=getPlayerData(a),bd=getPlayerData(b);
    let av=ad[jSort],bv=bd[jSort];
    if(typeof av==='string'){av=av.toLowerCase();bv=bv.toLowerCase();}
    return jDir==='desc'?(bv>av?1:bv<av?-1:0):(av>bv?1:av<bv?-1:0);
  });
  const tbody=document.getElementById('jTbody'); tbody.innerHTML='';
  rows.forEach((p,i)=>{
    const d=getPlayerData(p);
    const tr=document.createElement('tr');
    if(jSort==='PPG'||jSort==='VPG'){if(i===0)tr.className='top1';else if(i===1)tr.className='top2';else if(i===2)tr.className='top3';}
    const vc=d.VPG>=0?'val-pos':'val-neg';
    const tcc=d['TC%'];
    tr.innerHTML=`<td class="rank-cell">${i+1}</td><td>${p.name}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(p.Equipo)}${p.Equipo}</span></td>
      <td style="color:var(--muted)">${p.Edad != null ? p.Edad : '—'}</td>
      <td>${d.PJ}</td>
      <td style="color:var(--muted)">${f1(d.MPG)}</td>
      <td class="${vc}">${f2(d.VPG)}</td>
      <td class="pts-cell">${f2(d.PPG)}</td>
      <td class="tc-group">${f2(d.TCAPG)}</td><td class="tc-group">${f2(d.TCIPG)}</td>
      <td class="tc-group ${tcc>=50?'pct-hi':''}">${tcc!=null?f1(tcc)+'%':'—'}</td>
      <td>${f2(d.T2APG)}</td><td>${f2(d.T2IPG)}</td>
      <td class="${d['T2%']>=60?'pct-hi':''}">${f1(d['T2%'])}%</td>
      <td>${f2(d.T3APG)}</td><td>${f2(d.T3IPG)}</td>
      <td class="${d['T3%']>=40?'pct-hi':''}">${f1(d['T3%'])}%</td>
      <td>${f2(d.T1APG)}</td><td>${f2(d.T1IPG)}</td>
      <td class="${d['T1%']>=80?'pct-hi':''}">${f1(d['T1%'])}%</td>
      <td>${f2(d.RDPG)}</td><td>${f2(d.ROPG)}</td><td>${f2(d.RPG)}</td>
      <td>${f2(d.APG)}</td><td>${f2(d.SPG)}</td><td>${f2(d.TPG)}</td><td>${f2(d.BPG)}</td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll('#sec-j-tabla thead th').forEach(th=>{
    th.classList.remove('sd','sa');
    if(th.dataset.c===jSort)th.classList.add(jDir==='desc'?'sd':'sa');
  });
}

document.querySelectorAll('#sec-j-tabla thead th').forEach(th=>{
  th.addEventListener('click',()=>{
    if(jSort===th.dataset.c)jDir=jDir==='desc'?'asc':'desc';
    else{jSort=th.dataset.c;jDir=th.dataset.d||'desc';}
    renderJTable();
  });
});


// ============================================================
// ADVANCED TABLE
// ============================================================
let jAdvSort='EFG%', jAdvDir='desc';

function toggleCtrl(prefix) {
  const toggle = document.getElementById(prefix + 'CtrlToggle');
  const body = document.getElementById(prefix + 'CtrlBody');
  const isVisible = window.getComputedStyle(body).display !== 'none';
  body.style.display = isVisible ? 'none' : 'block';
  toggle.classList.toggle('cct-open', !isVisible);
}

function toggleJTable(mode) {
  const basic = document.getElementById('jCardBasic');
  const adv = document.getElementById('jCardAdv');
  const btnB = document.getElementById('jToggleBasic');
  const btnA = document.getElementById('jToggleAdv');
  if(mode==='basic'){
    basic.style.display=''; adv.style.display='none';
    btnB.classList.add('active'); btnA.classList.remove('active');
  } else {
    basic.style.display='none'; adv.style.display='';
    btnB.classList.remove('active'); btnA.classList.add('active');
    renderJAdvTable();
  }
  setTimeout(()=>remeasureScroll('jTableWrap'), 30);
}

function renderJAdvTable() {
  let rows=[...jFiltered];
  rows.sort((a,b)=>{
    const ad=getPlayerData(a),bd=getPlayerData(b);
    let av=ad[jAdvSort],bv=bd[jAdvSort];
    if(av==null&&bv==null)return 0;
    if(av==null)return 1; if(bv==null)return -1;
    return jAdvDir==='desc'?(bv-av):(av-bv);
  });
  const tbody=document.getElementById('jTbodyAdv'); tbody.innerHTML='';
  rows.forEach((p,i)=>{
    const d=getPlayerData(p);
    const tr=document.createElement('tr');
    const fPct=v=>v==null||isNaN(v)?'—':v.toFixed(1)+'%';
    const fVal=v=>v==null||isNaN(v)?'—':v.toFixed(2);
    const efg=d['EFG%'], ts=d['TS%'], toP=d['TO%'];
    tr.innerHTML=`<td class="rank-cell">${i+1}</td>
      <td>${p.name}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(p.Equipo)}${p.Equipo}</span></td>
      <td style="color:var(--muted)">${p.Edad != null ? p.Edad : '—'}</td>
      <td>${d.PJ}</td>
      <td style="color:var(--muted)">${f1(d.MPG)}</td>
      <td>${f1(d.POS)}</td>
      <td class="${d['PTS/POS']>=1.1?'adv-hi':d['PTS/POS']<0.85?'adv-lo':''}">${fVal(d['PTS/POS'])}</td>
      <td class="${efg>=55?'adv-hi':efg<45?'adv-lo':''}">${fPct(efg)}</td>
      <td class="${ts>=58?'adv-hi':ts<48?'adv-lo':''}">${fPct(ts)}</td>
      <td class="${toP<=12?'adv-hi':toP>=20?'adv-lo':''}">${fPct(toP)}</td>
      <td class="${d['AST/TO']>=2.5?'adv-hi':''}">${fVal(d['AST/TO'])}</td>
      <td>${fPct(d['3PI/TI'])}</td>
      <td class="${d['ORtg']>=110?'adv-hi':d['ORtg']<90?'adv-lo':''}">${d['ORtg']!=null?d['ORtg'].toFixed(1):'—'}</td>
      <td class="${d['USG%']>=28?'adv-hi':''}">${fPct(d['USG%'])}</td>
      <td class="${d['ORB%']>=12?'adv-hi':''}">${fPct(d['ORB%'])}</td>
      <td class="${d['DRB%']>=75?'adv-hi':d['DRB%']!=null&&d['DRB%']<60?'adv-lo':''}">${fPct(d['DRB%'])}</td>
      <td class="${d['FTr']>=0.35?'adv-hi':''}">${fVal(d['FTr'])}</td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll('#jCardAdv thead th').forEach(th=>{
    th.classList.remove('sd','sa');
    if(th.dataset.ca===jAdvSort)th.classList.add(jAdvDir==='desc'?'sd':'sa');
  });
}

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
    if(tConf==='norte'&&!CONF_NORTE.has(t.Equipo))return false;
    if(tConf==='sur'&&!CONF_SUR.has(t.Equipo))return false;
    if(tPhase==='regular'&&!t._regular)return false;
    if(tPhase==='post'&&!t._post)return false;
    if(ak&&!isNaN(av)&&!chk(t[ak],op,av))return false;
    if(ak2&&!isNaN(av2)&&!chk(t[ak2],op2,av2))return false;
    if(ak3&&!isNaN(av3)&&!chk(t[ak3],op3,av3))return false;
    if(ak4&&!isNaN(av4)&&!chk(t[ak4],op4,av4))return false;
    return true;
  });
}
function clearTFilter(){
  ['tAttr','tAttr2','tAttr3','tAttr4'].forEach(id=>document.getElementById(id).value='');
  ['tAttrVal','tAttrVal2','tAttrVal3','tAttrVal4'].forEach(id=>document.getElementById(id).value='');
  updateTFilterVisibility();
  onTFilter();
}
function onTFilter(){
  updateTFilterVisibility();
  tFiltered=getTFiltered();
  document.getElementById('tCount').textContent=tFiltered.length;
  const sv=document.getElementById('tSort').value;
  if(sv==='DRtg-asc'){tSort='DRtg';tDir='asc';}
  else if(sv==='TOV%-asc'){tSort='TOV%';tDir='asc';}
  else{tSort=sv;tDir='desc';}
  tAdvSort=tSort;tAdvDir=tDir;
  renderTTable();
  if(document.getElementById('sec-t-chart').classList.contains('active'))drawTChart();
}

function toggleTTable(mode) {
  const basic = document.getElementById('tCardBasic');
  const adv = document.getElementById('tCardAdv');
  const btnB = document.getElementById('tToggleBasic');
  const btnA = document.getElementById('tToggleAdv');
  if(mode==='basic'){
    basic.style.display=''; adv.style.display='none';
    btnB.classList.add('active'); btnA.classList.remove('active');
  } else {
    basic.style.display='none'; adv.style.display='';
    btnB.classList.remove('active'); btnA.classList.add('active');
    tAdvSort=tSort; tAdvDir=tDir;
    renderTAdvTable();
  }
  setTimeout(()=>remeasureScroll('tTableWrap'), 30);
}

let tAdvSort='NetRtg', tAdvDir='desc';

function computeTeamStatsFromGames(gamelog) {
  const pj=gamelog.length||1;
  const acc={PTS:0,T2A:0,T2I:0,T3A:0,T3I:0,T1A:0,T1I:0,RD:0,RO:0,RT:0,AST:0,REC:0,PER:0,TAP:0,VAL:0,OPP_PTS:0,OPP_RD:0,OPP_RO:0,Ganados:0};
  gamelog.forEach(g=>{
    const s=g.myS;
    acc.PTS+=s.pts||0; acc.T2A+=s.t2a||0; acc.T2I+=s.t2i||0;
    acc.T3A+=s.t3a||0; acc.T3I+=s.t3i||0; acc.T1A+=s.t1a||0; acc.T1I+=s.t1i||0;
    acc.RD+=s.dreb||0; acc.RO+=s.oreb||0; acc.RT+=s.treb||0;
    acc.AST+=s.ast||0; acc.REC+=s.rec||0; acc.PER+=s.per||0;
    acc.TAP+=s.tap||0; acc.VAL+=s.val||0;
    acc.OPP_PTS+=g.ptsAgainst||0;
    acc.OPP_RD+=(g.oppS&&g.oppS.dreb)||0;
    acc.OPP_RO+=(g.oppS&&g.oppS.oreb)||0;
    if(g.ganado)acc.Ganados++;
  });
  const d={PJ:pj,Ganados:acc.Ganados,Perdidos:pj-acc.Ganados};
  d['W%']=pj>0?acc.Ganados/pj*100:0;
  const tci=acc.T2I+acc.T3I;
  d.PTSPG=Math.round(acc.PTS/pj*100)/100;
  d.T2APG=Math.round(acc.T2A/pj*100)/100; d.T2IPG=Math.round(acc.T2I/pj*100)/100;
  d.T3APG=Math.round(acc.T3A/pj*100)/100; d.T3IPG=Math.round(acc.T3I/pj*100)/100;
  d.T1APG=Math.round(acc.T1A/pj*100)/100; d.T1IPG=Math.round(acc.T1I/pj*100)/100;
  d.RDPG=Math.round(acc.RD/pj*100)/100; d.ROPG=Math.round(acc.RO/pj*100)/100; d.RTPG=Math.round(acc.RT/pj*100)/100;
  d.ASTPG=Math.round(acc.AST/pj*100)/100; d.RECPG=Math.round(acc.REC/pj*100)/100;
  d.PERPG=Math.round(acc.PER/pj*100)/100; d.TAPPG=Math.round(acc.TAP/pj*100)/100; d.VALPG=Math.round(acc.VAL/pj*100)/100;
  d['T2%']=acc.T2I>0?Math.round(acc.T2A/acc.T2I*1000)/10:null;
  d['T3%']=acc.T3I>0?Math.round(acc.T3A/acc.T3I*1000)/10:null;
  d['T1%']=acc.T1I>0?Math.round(acc.T1A/acc.T1I*1000)/10:null;
  const poss=tci+0.44*(acc.T1I||0)+(acc.PER||0);
  d.POSPG=poss>0?Math.round(poss/pj*10)/10:null;
  d.ORtg=poss>0?Math.round(acc.PTS/poss*100*10)/10:null;
  d.DRtg=poss>0?Math.round(acc.OPP_PTS/poss*100*10)/10:null;
  d.NetRtg=(d.ORtg!=null&&d.DRtg!=null)?Math.round((d.ORtg-d.DRtg)*10)/10:null;
  const efgNum=(acc.T2A||0)+1.5*(acc.T3A||0);
  d['EFG%']=tci>0?Math.round(efgNum/tci*1000)/10:null;
  const tsAdj=2*(tci+0.44*(acc.T1I||0));
  d['TS%']=tsAdj>0?Math.round((acc.PTS||0)/tsAdj*1000)/10:null;
  const tovDenom=tci+0.44*(acc.T1I||0)+(acc.PER||0);
  d['TOV%']=tovDenom>0?Math.round((acc.PER||0)/tovDenom*1000)/10:null;
  const orbDenom=(acc.RO||0)+(acc.OPP_RD||0);
  d['ORB%']=orbDenom>0?Math.round((acc.RO||0)/orbDenom*1000)/10:null;
  d['FTr']=tci>0?Math.round((acc.T1I||0)/tci*1000)/1000:null;
  d['PACE']=d.POSPG;
  return d;
}

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

function setTPeriod(period) {
  tPeriod=period;
  ['tPeriodAll','tPeriodL5','tPeriodL10'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'tPeriodAll',last5:'tPeriodL5',last10:'tPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  renderTTable();
}

function setTPhase(v) {
  tPhase=v;
  ['tPhaseAll','tPhaseReg','tPhasePost'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'tPhaseAll',regular:'tPhaseReg',post:'tPhasePost'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  onTFilter();
}

function setTLocVis(v) {
  tLocVis=v;
  ['tLocVisAll','tLocVisLocal','tLocVisVisit'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'tLocVisAll',local:'tLocVisLocal',visit:'tLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  renderTTable();
}

function setTConf(v) {
  tConf=v;
  ['tConfAll','tConfNorte','tConfSur'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const map={all:'tConfAll',norte:'tConfNorte',sur:'tConfSur'};
  const btn=document.getElementById(map[v]); if(btn)btn.classList.add('active');
  const sel=document.getElementById('tChartConf'); if(sel)sel.value=v;
  onTFilter();
}

function setLConf(v) {
  lConf=v;
  const sel=document.getElementById('lConfSelect'); if(sel) sel.value=v;
  buildLeaders();
}

function setLPhase(v) {
  lPhase=v;
  const sel=document.getElementById('lPhaseSelect'); if(sel) sel.value=v;
  const titleEl=document.getElementById('leadersTitle');
  const subEl=document.getElementById('leadersSubtitle');
  if(titleEl) titleEl.innerHTML = v==='post' ? 'Líderes <span>·</span> Post Temporada' : 'Líderes <span>·</span> Temporada Regular';
  if(subEl) subEl.textContent = v==='post'
    ? 'Promedio por partido · mín. 1 partido jugado · porcentajes con mín. 3 intentos'
    : 'Promedio por partido · mín. 5 partidos jugados · porcentajes con mín. 3 intentos';
  LEADERS_DATA = v==='post' ? LEADERS_DATA_POST : LEADERS_DATA_REGULAR;
  buildLeaders();
}

function renderTTable() {
  if(document.getElementById('tCardAdv')&&document.getElementById('tCardAdv').style.display!=='none'){renderTAdvTable();}
  let rows=[...tFiltered];
  rows.sort((a,b)=>{
    const ad=getTeamData(a),bd=getTeamData(b);
    let av=ad[tSort],bv=bd[tSort];
    return tDir==='desc'?(bv>av?1:bv<av?-1:0):(av>bv?1:av<bv?-1:0);
  });
  const tbody=document.getElementById('tTbody'); tbody.innerHTML='';
  rows.forEach((t,i)=>{
    const d=getTeamData(t);
    const tr=document.createElement('tr');
    const selIdx = selectedTeams.indexOf(t.Equipo);
    const selClass = selIdx >= 0 ? ` team-sel-${selIdx}` : '';
    if(i===0)tr.className='top1 team-row-selectable'+selClass;
    else if(i===1)tr.className='top2 team-row-selectable'+selClass;
    else if(i===2)tr.className='top3 team-row-selectable'+selClass;
    else tr.className='team-row-selectable'+selClass;
    tr.addEventListener('click', ()=>toggleTeamSelection(t.Equipo));
    const indicator = selIdx >= 0 ? `<span class="team-sel-indicator" style="background:${CMP_COLORS[selIdx]}">${selIdx+1}</span>` : '';
    const wc=d['W%']>=60?'win-rate-high':d['W%']>=40?'win-rate-mid':'win-rate-low';
    tr.innerHTML=`<td class="rank-cell">${i+1}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${indicator}${teamLogoHtml(t.Equipo)}${t.Equipo}</span></td>
      <td>${d.PJ}</td>
      <td style="color:var(--green);font-weight:700">${d.Ganados}</td>
      <td style="color:var(--red)">${d.Perdidos}</td>
      <td class="${wc}">${d['W%'].toFixed(1)}%</td>
      <td class="pts-cell">${f2(d.PTSPG)}</td>
      <td>${f2(d.T2APG)}</td><td>${f2(d.T2IPG)}</td>
      <td class="pts-cell">${f1(d['T2%'])}%</td>
      <td>${f2(d.T3APG)}</td><td>${f2(d.T3IPG)}</td>
      <td class="pts-cell">${f1(d['T3%'])}%</td>
      <td>${f2(d.T1APG)}</td><td>${f2(d.T1IPG)}</td>
      <td class="pts-cell">${f1(d['T1%'])}%</td>
      <td>${f2(d.RDPG)}</td><td>${f2(d.ROPG)}</td><td class="pts-cell">${f2(d.RTPG)}</td>
      <td>${f2(d.ASTPG)}</td><td>${f2(d.RECPG)}</td><td>${f2(d.PERPG)}</td><td>${f2(d.TAPPG)}</td>
      <td class="${d.VALPG>=0?'val-pos':'val-neg'}">${f2(d.VALPG)}</td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll('#tCardBasic thead th').forEach(th=>{
    th.classList.remove('sd','sa');
    if(th.dataset.c===tSort)th.classList.add(tDir==='desc'?'sd':'sa');
  });
}

function renderTAdvTable() {
  let rows=[...tFiltered];
  rows.sort((a,b)=>{
    const ad=getTeamData(a),bd=getTeamData(b);
    let av=ad[tAdvSort],bv=bd[tAdvSort];
    if(av==null&&bv==null)return 0;
    if(av==null)return 1; if(bv==null)return -1;
    return tAdvDir==='desc'?(bv-av):(av-bv);
  });
  const tbody=document.getElementById('tTbodyAdv'); if(!tbody)return; tbody.innerHTML='';
  const fPct=v=>v==null||isNaN(v)?'—':v.toFixed(1)+'%';
  const fVal=v=>v==null||isNaN(v)?'—':v.toFixed(2);
  rows.forEach((t,i)=>{
    const d=getTeamData(t);
    const tr=document.createElement('tr');
    const selIdx = selectedTeams.indexOf(t.Equipo);
    const selClass = selIdx >= 0 ? ` team-sel-${selIdx}` : '';
    if(i===0)tr.className='top1 team-row-selectable'+selClass;
    else if(i===1)tr.className='top2 team-row-selectable'+selClass;
    else if(i===2)tr.className='top3 team-row-selectable'+selClass;
    else tr.className='team-row-selectable'+selClass;
    tr.addEventListener('click', ()=>toggleTeamSelection(t.Equipo));
    const indicator = selIdx >= 0 ? `<span class="team-sel-indicator" style="background:${CMP_COLORS[selIdx]}">${selIdx+1}</span>` : '';
    const wc=d['W%']>=60?'win-rate-high':d['W%']>=40?'win-rate-mid':'win-rate-low';
    const nc=d.NetRtg>=0?'netrtg-pos':'netrtg-neg';
    tr.innerHTML=`<td class="rank-cell">${i+1}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${indicator}${teamLogoHtml(t.Equipo)}${t.Equipo}</span></td>
      <td>${d.PJ}</td>
      <td style="color:var(--green);font-weight:700">${d.Ganados}</td>
      <td class="${wc}">${d['W%'].toFixed(1)}%</td>
      <td style="color:var(--muted)">${f1(d.PACE||d.POSPG)}</td>
      <td class="ortg-hi">${f1(d.ORtg)}</td>
      <td class="drtg-lo">${f1(d.DRtg)}</td>
      <td class="${nc}">${d.NetRtg>=0?'+':''}${f1(d.NetRtg)}</td>
      <td class="${d['EFG%']>=54?'adv-hi':d['EFG%']<48?'adv-lo':''}">${fPct(d['EFG%'])}</td>
      <td class="${d['TS%']>=57?'adv-hi':d['TS%']<50?'adv-lo':''}">${fPct(d['TS%'])}</td>
      <td class="${d['TOV%']<=12?'adv-hi':d['TOV%']>=18?'adv-lo':''}">${fPct(d['TOV%'])}</td>
      <td class="${d['ORB%']>=30?'adv-hi':d['ORB%']<22?'adv-lo':''}">${fPct(d['ORB%'])}</td>
      <td class="${d['FTr']>=0.28?'adv-hi':d['FTr']<0.18?'adv-lo':''}">${fVal(d['FTr'])}</td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll('#tCardAdv thead th').forEach(th=>{
    th.classList.remove('sd','sa');
    if(th.dataset.ca===tAdvSort)th.classList.add(tAdvDir==='desc'?'sd':'sa');
  });
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
function drawScatter(canvasId, pts_ref, data, xKey, yKey, sizeKey, colorFn, labelFn, hov, pin, lblMap) {
  const canvas=document.getElementById(canvasId);
  const dpr=window.devicePixelRatio||1;
  const cW=canvas.parentElement.clientWidth-40;
  const H=Math.min(540,Math.max(360,window.innerHeight*.54));
  canvas.style.width=cW+'px'; canvas.style.height=H+'px';
  canvas.width=cW*dpr; canvas.height=H*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const W=cW;
  const PAD={left:64,right:22,top:22,bottom:52};
  const plotW=W-PAD.left-PAD.right, plotH=H-PAD.top-PAD.bottom;
  const pts=data.filter(p=>p[xKey]!=null&&p[yKey]!=null);
  if(!pts.length)return;
  const xs=pts.map(p=>p[xKey]),ys=pts.map(p=>p[yKey]);
  let xMin=Math.min(...xs),xMax=Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);
  const xPad=(xMax-xMin)*.08||.5,yPad=(yMax-yMin)*.08||.5;
  xMin-=xPad;xMax+=xPad;yMin-=yPad;yMax+=yPad;
  const toX=v=>PAD.left+(v-xMin)/(xMax-xMin)*plotW;
  const toY=v=>PAD.top+plotH-(v-yMin)/(yMax-yMin)*plotH;
  const sVals=sizeKey!=='none'?pts.map(p=>p[sizeKey]):null;
  const sMin=sVals?Math.min(...sVals):1,sMax=sVals?Math.max(...sVals):1;
  const getR=p=>sizeKey==='none'?6:4+((p[sizeKey]-(sMin||0))/((sMax-sMin)||1))*10;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#18182e';
  if(ctx.roundRect){ctx.beginPath();ctx.roundRect(0,0,W,H,10);ctx.fill();}else ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;
  const nX=6,nY=5;
  for(let i=0;i<=nX;i++){const x=PAD.left+(plotW/nX)*i;ctx.beginPath();ctx.moveTo(x,PAD.top);ctx.lineTo(x,PAD.top+plotH);ctx.stroke();}
  for(let i=0;i<=nY;i++){const y=PAD.top+(plotH/nY)*i;ctx.beginPath();ctx.moveTo(PAD.left,y);ctx.lineTo(PAD.left+plotW,y);ctx.stroke();}
  ctx.font='500 11px Inter,sans-serif';
  for(let i=0;i<=nX;i++){const v=xMin+(xMax-xMin)/nX*i;ctx.fillStyle='#64748b';ctx.textAlign='center';ctx.fillText(v%1===0?Math.round(v):v.toFixed(1),PAD.left+(plotW/nX)*i,H-PAD.bottom+15);}
  for(let i=0;i<=nY;i++){const v=yMin+(yMax-yMin)/nY*(nY-i);ctx.fillStyle='#64748b';ctx.textAlign='right';ctx.fillText(v%1===0?Math.round(v):v.toFixed(1),PAD.left-7,PAD.top+(plotH/nY)*i+4);}
  ctx.font='bold 12px Inter,sans-serif';ctx.textAlign='center';
  ctx.fillStyle='#2dd4bf';ctx.fillText(lblMap[xKey]||xKey,PAD.left+plotW/2,H-7);
  ctx.save();ctx.translate(14,PAD.top+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillStyle='#a78bfa';ctx.fillText(lblMap[yKey]||yKey,0,0);ctx.restore();
  const pinSet = pin instanceof Set ? pin : (pin >= 0 ? new Set([pin]) : new Set());
  pts_ref.length=0;
  pts.forEach(p=>pts_ref.push({cx:toX(p[xKey]),cy:toY(p[yKey]),r:getR(p),d:p}));
  // Draw normal (non-highlighted) dots first
  pts_ref.forEach((pt,i)=>{
    if(i===hov||pinSet.has(i))return;
    const c=colorFn(pt.d);
    ctx.beginPath();ctx.arc(pt.cx,pt.cy,pt.r,0,Math.PI*2);
    ctx.fillStyle=c+'55';ctx.strokeStyle=c+'99';ctx.lineWidth=1;ctx.fill();ctx.stroke();
  });
  // Draw pinned dots with labels
  const drawHighlight=(pt,withLabel)=>{
    const c=colorFn(pt.d);
    ctx.beginPath();ctx.arc(pt.cx,pt.cy,pt.r+3,0,Math.PI*2);
    ctx.fillStyle=c+'cc';ctx.strokeStyle=c;ctx.lineWidth=2;ctx.fill();ctx.stroke();
    if(withLabel){
      const nm=labelFn(pt.d);
      ctx.font='bold 11px Inter,sans-serif';ctx.textAlign='left';
      const tw=ctx.measureText(nm).width;
      const lx=pt.cx+pt.r+5,ly=pt.cy-2;
      ctx.fillStyle='rgba(24,24,46,.92)';ctx.strokeStyle='rgba(139,92,246,.5)';ctx.lineWidth=1;
      ctx.fillRect(lx-2,ly-11,tw+8,16);ctx.strokeRect(lx-2,ly-11,tw+8,16);
      ctx.fillStyle='#f1f5f9';ctx.fillText(nm,lx+2,ly+1);
    }
  };
  [...pinSet].forEach(idx=>{
    const pt=pts_ref[idx]; if(!pt||idx===hov)return;
    drawHighlight(pt,true);
  });
  // Draw hov last (on top), with label only if also pinned
  if(hov>=0){const pt=pts_ref[hov];if(pt)drawHighlight(pt,pinSet.has(hov));}
}

function hitTest(pts, mx, my) {
  let found=-1,minD=16;
  pts.forEach((pt,i)=>{const d=Math.sqrt((pt.cx-mx)**2+(pt.cy-my)**2);if(d<pt.r+8&&d<minD){minD=d;found=i;}});
  return found;
}

function showTooltip(e, d, xKey, yKey, lblMap, extra, title) {
  const tt=document.getElementById('tooltip');
  const xv=d[xKey],yv=d[yKey];
  const fmt=v=>typeof v==='number'&&v%1!==0?v.toFixed(2):v;
  tt.style.display='block';
  tt.style.left=(e.clientX+14)+'px';tt.style.top=(e.clientY-10)+'px';
  tt.innerHTML=`<div class="tn">${title||d.Equipo||d.name}</div>
    <div class="ts">${extra}</div>
    <div class="tr tx"><span>→ ${lblMap[xKey]||xKey}</span><span>${fmt(xv)}</span></div>
    <div class="tr ty"><span>↑ ${lblMap[yKey]||yKey}</span><span>${fmt(yv)}</span></div>`;
}

// ============================================================
// PLAYER CHART
// ============================================================
function drawJChart(){
  const xKey=document.getElementById('jX').value;
  const yKey=document.getElementById('jY').value;
  const sKey=document.getElementById('jSize').value;
  const cBy=document.getElementById('jColor').value;
  const colorFn=p=>cBy==='team'?TEAM_COLORS[p.Equipo]:'#7c3aed';
  const scatterData=jFiltered;
  drawScatter('jCanvas',jPts,scatterData,xKey,yKey,sKey,colorFn,p=>p.name.split(',')[0].trim(),jHov,jPin,LBL_J);
  buildJLegend(cBy);
}
function buildJLegend(cBy){
  const el=document.getElementById('jLegend'); if(cBy!=='team'){el.innerHTML='';return;}
  const teams=[...new Set(jFiltered.map(p=>p.Equipo))].sort();
  el.innerHTML=teams.map(t=>`<span><span class="ldot" style="background:${TEAM_COLORS[t]}"></span>${t}</span>`).join('');
}

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

function drawTChart(){
  const xKey=document.getElementById('tX').value;
  const yKey=document.getElementById('tY').value;
  const sKey=document.getElementById('tSize').value;
  drawScatter('tCanvas',tPts,tFiltered,xKey,yKey,sKey,t=>T_COLORS[t.Equipo],t=>t.Equipo,tHov,tPin,LBL_T);
  buildTLegend();
}
function buildTLegend(){
  const el=document.getElementById('tLegend');
  const teams=tFiltered.map(t=>t.Equipo);
  el.innerHTML=teams.map(t=>`<span><span class="ldot" style="background:${T_COLORS[t]}"></span>${t}</span>`).join('');
}

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

function toggleTeamSelection(teamName) {
  const idx = selectedTeams.indexOf(teamName);
  if (idx >= 0) {
    selectedTeams.splice(idx, 1);
  } else {
    if (selectedTeams.length >= 4) return; // max 4
    selectedTeams.push(teamName);
  }
  updateCmpBtn();
  updateCmpChips();
  renderTTable();
  if (selectedTeams.length >= 2) {
    const panel = document.getElementById('cmpPanel');
    if (panel.style.display === 'none') {
      switchSection('t-tcmp');
    }
    renderCmp();
  } else if (selectedTeams.length < 2) {
    renderCmp();
  }
}

function updateCmpBtn() {
  // cmpToggleBtn removed; count visible in cmpChips
}

function updateCmpChips() {
  const el = document.getElementById('cmpChips');
  if (!el) return;
  if (selectedTeams.length === 0) {
    el.innerHTML = '<span class="cmp-chips-empty">Ningún equipo seleccionado — hacé clic en las filas de la tabla ↓</span>';
    return;
  }
  el.innerHTML = selectedTeams.map((name, i) => {
    const color = CMP_COLORS[i];
    return `<span class="cmp-chip" style="background:${color}" onclick="toggleTeamSelection('${name.replace(/'/g,"\\'")}')">
      <span>${name}</span><span class="cmp-chip-x">×</span>
    </span>`;
  }).join('') + (selectedTeams.length > 0 ? `<span style="font-size:.73rem;color:var(--muted);margin-left:6px;cursor:pointer;text-decoration:underline" onclick="clearCmp()">Limpiar todo</span>` : '');
}


function clearCmp(){
  selectedTeams = [];
  updateCmpBtn();
  updateCmpChips();
  renderTTable();
  renderCmp();
  document.getElementById('cmpPanel').style.display = 'none';
  document.getElementById('tCtrlBody').style.display = '';
  document.querySelectorAll('#subEquipos .sub-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#subEquipos .sub-tab')[0].classList.add('active');
}

function renderCmp(){
  const el = document.getElementById('cmpResult');
  if (selectedTeams.length < 2) {
    el.innerHTML='<p class="cmp-empty-msg">Seleccioná al menos 2 equipos para ver la comparación.</p>';
    return;
  }
  const teams = selectedTeams.map(name=>TEAMS.find(t=>t.Equipo===name)).filter(Boolean);
  const colors = CMP_COLORS;

  const stats = [
    {key:'W%', label:'W%', fmt:v=>v!=null?v.toFixed(1)+'%':'—', higher:true},
    {key:'ORtg', label:'ORtg', fmt:v=>v!=null?v.toFixed(1):'—', higher:true},
    {key:'DRtg', label:'DRtg', fmt:v=>v!=null?v.toFixed(1):'—', higher:false},
    {key:'NetRtg', label:'Net Rtg', fmt:v=>v!=null?(v>=0?'+':'')+v.toFixed(1):'—', higher:true},
    {key:'EFG%', label:'EFG%', fmt:v=>v!=null?v.toFixed(1)+'%':'—', higher:true},
    {key:'TS%', label:'TS%', fmt:v=>v!=null?v.toFixed(1)+'%':'—', higher:true},
    {key:'TOV%', label:'TOV%', fmt:v=>v!=null?v.toFixed(1)+'%':'—', higher:false},
    {key:'ORB%', label:'ORB%', fmt:v=>v!=null?v.toFixed(1)+'%':'—', higher:true},
    {key:'PTSPG', label:'PTS/p', fmt:v=>v!=null?v.toFixed(1):'—', higher:true},
    {key:'ASTPG', label:'AST/p', fmt:v=>v!=null?v.toFixed(1):'—', higher:true},
    {key:'RTPG', label:'REB/p', fmt:v=>v!=null?v.toFixed(1):'—', higher:true},
    {key:'PACE', label:'PACE', fmt:v=>v!=null?v.toFixed(1):'—', higher:true},
  ];

  const cardsHtml = teams.map((t,i)=>{
    const hdr = `<div class="cmp-card-header" style="background:${colors[i]}">${t.Equipo} <span style="font-weight:500;font-size:.72rem;opacity:.85">${t.Ganados}G-${t.Perdidos}P</span></div>`;
    const rows = stats.map(s=>{
      const vals = teams.map(tt=>tt[s.key]);
      const best = s.higher ? Math.max(...vals.filter(v=>v!=null)) : Math.min(...vals.filter(v=>v!=null));
      const isBest = t[s.key] != null && Math.abs(t[s.key] - best) < 0.001;
      return `<div class="cmp-stat-row"><span class="cmp-stat-label">${s.label}</span><span class="cmp-stat-val${isBest?' best':''}">${s.fmt(t[s.key])}</span></div>`;
    }).join('');
    return `<div class="cmp-card">${hdr}<div class="cmp-stat-list">${rows}</div></div>`;
  }).join('');

  const barStats = [
    {key:'ORtg',label:'ORtg'},
    {key:'DRtg',label:'DRtg (↓mejor)'},
    {key:'EFG%',label:'EFG%'},
    {key:'TS%',label:'TS%'},
    {key:'ORB%',label:'ORB%'},
    {key:'PTSPG',label:'PTS/p'},
  ];
  const barsHtml = barStats.map(s=>{
    const vals = teams.map(t=>t[s.key]||0);
    const maxV = Math.max(...vals)||1;
    const chips = teams.map((t,i)=>{
      const w = Math.round((vals[i]/maxV)*100);
      return `<div style="margin-bottom:4px">
        <div style="font-size:.66rem;color:${colors[i]};font-weight:700;margin-bottom:2px">${t.Equipo.split(' ')[0]}: ${vals[i].toFixed(1)}</div>
        <div class="cmp-bar-track"><div class="cmp-bar-fill" style="width:${w}%;background:${colors[i]}"></div></div>
      </div>`;
    }).join('');
    return `<div class="cmp-bar-group"><div class="cmp-bar-lbl">${s.label}</div>${chips}</div>`;
  }).join('');

  el.innerHTML = `
    <div style="overflow-x:auto;margin-bottom:16px"><div class="cmp-cards">${cardsHtml}</div></div>
    <div class="cmp-chart-wrap">
      <div class="cmp-chart-title">Comparación visual de métricas clave</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">${barsHtml}</div>
    </div>`;
}


// ============================================================
// SYNC SCROLLBARS
// ============================================================
const scrollPairs = {};

function setupScrollSync(wrapId, outerBarId, innerBarId) {
  const wrap  = document.getElementById(wrapId);
  const outer = document.getElementById(outerBarId);
  const inner = document.getElementById(innerBarId);
  if (!wrap || !outer || !inner) return;

  scrollPairs[wrapId] = { wrap, outer, inner };

  function measureAndSet() {
    const tbl = wrap.querySelector('table');
    const w = tbl ? tbl.offsetWidth : 0;
    if (w > 0) inner.style.width = w + 'px';
  }

  // Try immediately and after delays (handles hidden sections)
  measureAndSet();
  setTimeout(measureAndSet, 200);
  setTimeout(measureAndSet, 800);
  window.addEventListener('resize', measureAndSet);

  // Re-measure whenever rows change
  new MutationObserver(() => setTimeout(measureAndSet, 50))
    .observe(wrap, { childList: true, subtree: true });

  // Sync: no flags needed — setting scrollLeft to same value won't re-fire scroll
  wrap.addEventListener('scroll',  () => { outer.scrollLeft = wrap.scrollLeft; });
  outer.addEventListener('scroll', () => { wrap.scrollLeft  = outer.scrollLeft; });
}

function remeasureScroll(wrapId) {
  const p = scrollPairs[wrapId];
  if (!p) return;
  const tbl = p.wrap.querySelector('table');
  const w = tbl ? tbl.offsetWidth : 0;
  if (w > 0) p.inner.style.width = w + 'px';
}

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
  const _lConfSet = lConf==='norte' ? CONF_NORTE : lConf==='sur' ? CONF_SUR : null;
  Object.values(LEADERS_DATA).forEach(cat => {
    const card = document.createElement('div');
    card.className = 'leader-card';
    const allEntries = _lConfSet ? cat.entries.filter(e=>_lConfSet.has(e.equipo)) : cat.entries;
    const rows = allEntries.slice(0,5).map((e,i) => {
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
// POSICIONES POR CONFERENCIA
// ============================================================
const PLAYOFF_DATE = new Date(2026, 3, 1);  // 1 de abril de 2026
const PLAYOFF2_DATE = new Date(2026, 3, 15); // 15 de abril de 2026 — inicio Octavos
const CUARTOS_DATE  = new Date(2026, 3, 30); // 30 de abril de 2026 — inicio Cuartos
function isPostSeason(fechaStr) {
  if (!fechaStr) return false;
  const [d,m,y] = fechaStr.split('/');
  return new Date(+y,+m-1,+d) >= PLAYOFF_DATE;
}

const CONF_NORTE = new Set([
  'AMANCAY (LR)','BARRIO PARQUE','BOCHAS (CC)','COLON (SF)','COMUNICACIONES',
  'ESTUDIANTES (T)','FUSION RIOJANA','HINDU (C)','HURACAN (LH)',
  'INDEPENDIENTE (SDE)','JUJUY BASQUET','RIVADAVIA (MZA)','SALTA BASKET',
  'SAN ISIDRO','SANTA PAULA (G)','SP. SUARDI','VILLA SAN MARTIN'
]);
const CONF_SUR = new Set([
  'CENTENARIO (VT)','CENTRAL ENTRERRIANO','CICLISTA (J)','DEP. NORTE',
  'DEP. VIEDMA','EL TALAR','GIMNASIA (LP)','LANÚS','LA UNIÓN (C)',
  'PERGAMINO BASQUET','PICO F.C.','PROVINCIAL (R)','QUILMES (MDP)',
  'RACING (A)','ROCAMORA','UNION (MDP)','VILLA MITRE (BB)'
]);

const LOGOS = {
  // Conferencia Sur
  'PROVINCIAL (R)':     'logos/provincial_r.jpeg',
  'CENTRAL ENTRERRIANO':'logos/central_entrerriano.jpeg',
  'LA UNIÓN (C)':       'logos/la_union_c.jpeg',
  'QUILMES (MDP)':      'logos/quilmes_mdp.jpeg',
  'LANÚS':              'logos/lanus.jpeg',
  'PICO F.C.':          'logos/pico_fc.jpeg',
  'GIMNASIA (LP)':      'logos/gimnasia_lp.jpeg',
  'CENTENARIO (VT)':    'logos/centenario_vt.jpeg',
  'DEP. VIEDMA':        'logos/dep_viedma.jpeg',
  'RACING (A)':         'logos/racing_a.jpeg',
  'VILLA MITRE (BB)':   'logos/villa_mitre_bb.jpeg',
  'EL TALAR':           'logos/el_talar.jpeg',
  'UNION (MDP)':        'logos/union_mdp.jpeg',
  'CICLISTA (J)':       'logos/ciclista_j.jpeg',
  'ROCAMORA':           'logos/rocamora.jpeg',
  'PERGAMINO BASQUET':  'logos/pergamino_basquet.jpeg',
  'DEP. NORTE':         'logos/dep_norte.jpeg',
  // Conferencia Norte
  'AMANCAY (LR)':       'logos/amancay_lr.jpeg',
  'BARRIO PARQUE':      'logos/barrio_parque.jpeg',
  'BOCHAS (CC)':        'logos/bochas_cc.jpeg',
  'COLON (SF)':         'logos/colon_sf.jpeg',
  'COMUNICACIONES':     'logos/comunicaciones.jpeg',
  'ESTUDIANTES (T)':    'logos/estudiantes_t.jpeg',
  'FUSION RIOJANA':     'logos/fusion_riojana.jpeg',
  'HINDU (C)':          'logos/hindu_c.jpeg',
  'HURACAN (LH)':       'logos/huracan_lh.jpeg',
  'INDEPENDIENTE (SDE)':'logos/independiente_sde.jpeg',
  'JUJUY BASQUET':      'logos/jujuy_basquet.jpeg',
  'RIVADAVIA (MZA)':    'logos/rivadavia_mza.jpeg',
  'SALTA BASKET':       'logos/salta_basket.jpeg',
  'SAN ISIDRO':         'logos/san_isidro.jpeg',
  'SANTA PAULA (G)':    'logos/santa_paula_g.jpeg',
  'SP. SUARDI':         'logos/sp_suardi.jpeg',
  'VILLA SAN MARTIN':   'logos/villa_san_martin.jpeg',
};

function teamLogoHtml(teamName, size) {
  size = size || 20;
  const src = LOGOS[teamName];
  if (!src) return '';
  return '<img src="' + src + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;flex-shrink:0" alt="" onerror="this.style.display=\'none\'">';
}

function renderStandings() {
  function fillTable(tbodyId, confSet) {
    // Compute stats from regular season games only (before PLAYOFF_DATE)
    const statsMap = {};
    TEAMS.filter(t => confSet.has(t.Equipo)).forEach(t => {
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
    const tbody = document.getElementById(tbodyId);
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
  fillTable('posNorteTbody', CONF_NORTE);
  fillTable('posSurTbody',   CONF_SUR);
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

  // Group games into series by team pair (key = alphabetically sorted teams)
  const seriesMap = new Map();
  postGames.forEach(g => {
    const key = [g.local, g.visit].sort().join('|');
    if (!seriesMap.has(key)) {
      // teamA = local of first game encountered for this pair
      seriesMap.set(key, { teamA: g.local, teamB: g.visit, games: [] });
    }
    seriesMap.get(key).games.push(g);
  });

  // Compute series wins
  seriesMap.forEach(s => {
    s.winsA = 0; s.winsB = 0;
    s.games.forEach(g => {
      if (g.upcoming || g.ganLocal === null) return;
      const aIsLocal = g.local === s.teamA;
      if ((aIsLocal && g.ganLocal) || (!aIsLocal && !g.ganLocal)) s.winsA++;
      else s.winsB++;
    });
  });

  // Separate into conferences
  const northSeries=[], southSeries=[];
  seriesMap.forEach(s => {
    (CONF_NORTE.has(s.teamA)||CONF_NORTE.has(s.teamB) ? northSeries : southSeries).push(s);
  });

  function seriesCard(s, phase) {
    const logoA = LOGOS[s.teamA]?`<img src="${LOGOS[s.teamA]}" style="width:38px;height:38px;object-fit:contain">`:'<span style="width:38px;height:38px;display:block"></span>';
    const logoB = LOGOS[s.teamB]?`<img src="${LOGOS[s.teamB]}" style="width:38px;height:38px;object-fit:contain">`:'<span style="width:38px;height:38px;display:block"></span>';
    const aLeads = s.winsA > s.winsB, bLeads = s.winsB > s.winsA;
    const gamesPlayed = s.games.filter(g => !g.upcoming).length;

    // Series score or "vs" if not started
    const scoreHtml = gamesPlayed === 0
      ? `<div class="series-score-vs">VS</div>`
      : `<div class="series-score">${s.winsA}<span style="color:var(--muted2);font-weight:400;font-size:1.2rem;margin:0 4px">–</span>${s.winsB}</div>`;

    // Status line
    let statusHtml = '';
    if (gamesPlayed === 0) {
      statusHtml = `<div class="series-status">Serie al mejor de ${phase==='cuartos'?'5':'3'}</div>`;
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

  // Split series into three phases by date of first game
  function seriesPhase(s) {
    const [d,m,y] = s.games[0].fecha.split('/');
    const d0 = new Date(+y,+m-1,+d);
    if (d0 >= CUARTOS_DATE) return 'cuartos';
    if (d0 >= PLAYOFF2_DATE) return 'octavos';
    return 'playin';
  }

  // Renders a phase with Norte/Sur split
  function renderPhaseSplit(phase, phaseTitle) {
    const north = northSeries.filter(s => seriesPhase(s) === phase);
    const south = southSeries.filter(s => seriesPhase(s) === phase);
    if (!north.length && !south.length) return '';
    let h = `<div class="playoff-phase-block">`;
    h += `<div class="playoff-phase-title">${phaseTitle}</div>`;
    if (north.length) {
      h += `<div class="playoff-conf-title">Conferencia Norte</div><div class="playoff-grid">`;
      north.forEach(s => { h += seriesCard(s, phase); });
      h += `</div>`;
    }
    if (south.length) {
      h += `<div class="playoff-conf-title">Conferencia Sur</div><div class="playoff-grid">`;
      south.forEach(s => { h += seriesCard(s, phase); });
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  // Renders a phase without Norte/Sur split (unified grid)
  function renderPhaseUnified(phase, phaseTitle) {
    const all = [...northSeries, ...southSeries].filter(s => seriesPhase(s) === phase);
    if (!all.length) return '';
    let h = `<div class="playoff-phase-block">`;
    h += `<div class="playoff-phase-title">${phaseTitle}</div>`;
    h += `<div class="playoff-grid">`;
    all.forEach(s => { h += seriesCard(s, phase); });
    h += `</div></div>`;
    return h;
  }

  let html = '';
  html += renderPhaseUnified('cuartos', 'Cuartos de Final');
  html += renderPhaseSplit('octavos', 'Octavos de Final');
  html += renderPhaseSplit('playin', 'Play-in');
  document.getElementById('playoffContent').innerHTML = html;
}

function fcsToggle(id){
  const wrap=document.getElementById(id);
  const trigger=wrap.querySelector('.fcs-trigger');
  const dd=wrap.querySelector('.fcs-dropdown');
  const isOpen=dd.classList.contains('open');
  document.querySelectorAll('.fcs-dropdown.open').forEach(d=>{d.classList.remove('open');d.closest('.fsb-custom-select').querySelector('.fcs-trigger').classList.remove('open');});
  if(!isOpen){dd.classList.add('open');trigger.classList.add('open');}
}
function fcsSelect(id,value,name,sub){
  const wrap=document.getElementById(id);
  wrap.querySelector('.fcs-selected .fcs-name').textContent=name;
  wrap.querySelector('.fcs-selected .fcs-sub').textContent=sub;
  wrap.querySelectorAll('.fcs-option').forEach(o=>o.classList.toggle('selected',o.dataset.value===value));
  wrap.querySelector('.fcs-trigger').classList.remove('open');
  wrap.querySelector('.fcs-dropdown').classList.remove('open');
  const sel=document.getElementById(wrap.dataset.select);
  sel.value=value;
  if(sel.onchange)sel.onchange();
}
document.addEventListener('click',function(e){if(!e.target.closest('.fsb-custom-select')){document.querySelectorAll('.fcs-dropdown.open').forEach(d=>{d.classList.remove('open');d.closest('.fsb-custom-select').querySelector('.fcs-trigger').classList.remove('open');});}});
// ============================================================
// SHOT MAP
// ============================================================

async function loadShots() {
  if (SHOTS_MAP !== null) return;
  try {
    const resp = await fetch(SHOTS_CSV + '?v=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    SHOTS_MAP = new Map();
    SHOTS_BY_PLAYER = new Map();
    rows.forEach(r => {
      const gid = r['IdPartido'];
      if (!gid) return;
      if (!SHOTS_MAP.has(gid)) SHOTS_MAP.set(gid, []);
      SHOTS_MAP.get(gid).push(r);
      // Index by player: Equipo||Dorsal (normalised to integer string)
      const dNum = String(Math.round(parseFloat(r['Dorsal']) || 0));
      const pkey = r['Equipo'] + '||' + dNum;
      if (!SHOTS_BY_PLAYER.has(pkey)) SHOTS_BY_PLAYER.set(pkey, []);
      SHOTS_BY_PLAYER.get(pkey).push(r);
    });
  } catch(e) {
    SHOTS_MAP = new Map(); // empty map on error
    SHOTS_BY_PLAYER = new Map();
  }
}

function switchGameTab(tab) {
  document.getElementById('tgmTabStats').classList.toggle('active', tab === 'stats');
  document.getElementById('tgmTabMap').classList.toggle('active', tab === 'map');
  document.getElementById('tgmTabBox').classList.toggle('active', tab === 'box');
  document.getElementById('tgmTabEvol').classList.toggle('active', tab === 'evol');
  document.getElementById('tgmDetailBody').style.display = tab === 'stats' ? '' : 'none';
  document.getElementById('tgmMapPanel').style.display   = tab === 'map'   ? '' : 'none';
  document.getElementById('tgmBoxPanel').style.display   = tab === 'box'   ? '' : 'none';
  document.getElementById('tgmEvolPanel').style.display  = tab === 'evol'  ? '' : 'none';
  if (tab === 'map') {
    const doRender = () => requestAnimationFrame(renderShotMap);
    if (SHOTS_MAP === null) loadShots().then(doRender); else doRender();
  }
  if (tab === 'box')  renderBoxScore(_smState.gameId, _smState.local, _smState.visit);
  if (tab === 'evol') renderScoreDelta(_smState.gameId, _smState.local, _smState.visit);
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

function renderShotMap() {
  const canvas = document.getElementById('shotMapCanvas');
  const noData = document.getElementById('smNoData');
  const legend = document.getElementById('smLegend');
  const { gameId, local, visit, filter } = _smState;

  // Size canvas to match CSS width, derive height from 28:15 aspect ratio
  const W = canvas.offsetWidth || 600;
  const H = Math.round(W * 15 / 28);
  canvas.width = W; canvas.height = H;

  const shots = SHOTS_MAP ? (SHOTS_MAP.get(gameId) || []) : [];

  if (!shots.length) {
    noData.style.display = '';
    canvas.style.display = 'none';
    legend.style.display = 'none';
    return;
  }
  noData.style.display = 'none';
  canvas.style.display = '';
  legend.style.display = '';

  // Filter shots
  const filtered = shots.filter(s => {
    const isLocal = s['Local'] === 'True';
    if (filter.team === 'local' && !isLocal) return false;
    if (filter.team === 'visit' && isLocal) return false;
    if (filter.tipo !== 'all' && s['Tipo'] !== filter.tipo) return false;
    if (filter.result !== 'all' && s['Resultado'] !== filter.result) return false;
    return true;
  });

  const ctx = canvas.getContext('2d');
  drawCourt(ctx, W, H);
  drawShots(ctx, W, H, filtered, local, visit);

  // Legend — matches rendering: filled circle=convertido, empty circle+X=fallado, color=equipo
  const lc = '#a78bfa', vc = '#5eead4';
  const svgMade  = c => `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${c}" opacity=".85"/></svg>`;
  const svgMiss  = c => `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="${c}" stroke-width="1.4" opacity=".75"/><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" stroke="${c}" stroke-width="1.5" opacity=".75"/><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" stroke="${c}" stroke-width="1.5" opacity=".75"/></svg>`;
  legend.innerHTML = `
    <div class="sm-ld">${svgMade(lc)}${svgMiss(lc)}&nbsp;${local}</div>
    <div class="sm-ld">${svgMade(vc)}${svgMiss(vc)}&nbsp;${visit}</div>
    <div style="width:1px;height:12px;background:var(--border2)"></div>
    <div class="sm-ld">${svgMade('#94a3b8')}&nbsp;Convertido</div>
    <div class="sm-ld">${svgMiss('#94a3b8')}&nbsp;Fallado</div>
    <div style="color:var(--muted2);margin-left:2px">${filtered.length} tiros</div>`;
}

function drawCourt(ctx, W, H) {
  // The website embeds the court with ~6.51% horizontal padding on each side.
  // Shots are mapped 1:1 to canvas pixels (Left_pct/100*W, Top_pct/100*H),
  // so court lines must match that same coordinate system.
  const PL = 0.0651 * W;           // left/right padding in pixels
  const my = H / 15;               // pixels per meter (vertical, FIBA 15m wide)
  const mx = (W - 2 * PL) / 28;   // pixels per meter (horizontal, FIBA 28m long)
  // mx ≈ 0.87*my, so we use ctx.scale to draw in uniform meter space

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(139,92,246,.04)';
  ctx.fillRect(0, 0, W, H);

  const lc = 'rgba(139,92,246,.35)';
  const lw = Math.max(1, W / 700);
  ctx.strokeStyle = lc;
  ctx.lineWidth = lw;

  // Enter court coordinate space: origin at left baseline (PL,0), x scaled by mx/my
  // so that 1 pixel in this space = my pixels on canvas (equal vertical/horizontal scale)
  const sx = mx / my; // ≈ 0.8698
  ctx.save();
  ctx.translate(PL, 0);
  ctx.scale(sx, 1);
  // Compensate lineWidth for x-scale so lines look uniform
  ctx.lineWidth = lw / sx;

  const m = my; // 1 meter = m pixels in this scaled context
  const CW = 28 * m; // court width in scaled pixels
  const cy = H / 2;

  // Outer court boundary
  ctx.strokeRect(0, 0.5, CW, H - 1);

  // Center line
  ctx.beginPath(); ctx.moveTo(CW / 2, 0); ctx.lineTo(CW / 2, H); ctx.stroke();

  // Center circle (r=1.8m)
  ctx.beginPath(); ctx.arc(CW / 2, cy, 1.8 * m, 0, Math.PI * 2); ctx.stroke();

  // Both ends: [baseline x in court coords, direction toward court]
  [[0, 1], [CW, -1]].forEach(([bx, dir]) => {
    const basketX = bx + dir * 1.575 * m;
    const paintD  = 5.8 * m;
    const paintH  = 4.9 * m;

    // Paint area
    ctx.strokeRect(bx, cy - paintH / 2, dir * paintD, paintH);

    // Free throw circle — solid half facing court, dashed half facing baseline
    const ftX = bx + dir * 5.8 * m;
    ctx.beginPath();
    ctx.arc(ftX, cy, 1.8 * m, dir > 0 ? Math.PI/2 : -Math.PI/2, dir > 0 ? 3*Math.PI/2 : Math.PI/2, dir < 0);
    ctx.stroke();
    ctx.save(); ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(ftX, cy, 1.8 * m, dir > 0 ? -Math.PI/2 : Math.PI/2, dir > 0 ? Math.PI/2 : 3*Math.PI/2, dir < 0);
    ctx.stroke(); ctx.restore();

    // Restricted area arc (r=1.25m)
    ctx.beginPath();
    ctx.arc(basketX, cy, 1.25 * m, dir > 0 ? Math.PI/2 : -Math.PI/2, dir > 0 ? 3*Math.PI/2 : Math.PI/2, dir < 0);
    ctx.stroke();

    // Basket ring
    ctx.strokeStyle = 'rgba(251,146,60,.7)';
    ctx.beginPath(); ctx.arc(basketX, cy, 0.23 * m, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = lc;

    // 3-point line (FIBA: r=6.75m, corner at 0.9m from sideline)
    const r3     = 6.75 * m;
    const cornerY1 = 0.9 * m;
    const cornerY2 = H - 0.9 * m;
    const dy1 = cornerY1 - cy;
    const dx1 = Math.sqrt(Math.max(0, r3 * r3 - dy1 * dy1));
    const ang1 = Math.atan2(dy1,       dir * dx1);
    const ang2 = Math.atan2(cornerY2 - cy, dir * dx1);

    ctx.beginPath(); ctx.moveTo(bx, cornerY1); ctx.lineTo(basketX + dir * dx1, cornerY1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, cornerY2); ctx.lineTo(basketX + dir * dx1, cornerY2); ctx.stroke();
    ctx.beginPath(); ctx.arc(basketX, cy, r3, ang1, ang2, dir < 0); ctx.stroke();
  });

  ctx.restore();
}

function drawShots(ctx, W, H, shots, local, visit) {
  const r = Math.max(4, W / 100); // dot radius scales with canvas

  shots.forEach(s => {
    const x = parseFloat(s['Left_pct']) / 100 * W;
    const y = parseFloat(s['Top_pct'])  / 100 * H;
    if (isNaN(x) || isNaN(y)) return;

    const isLocal = s['Local'] === 'True';
    const made    = s['Resultado'] === 'CONVERTIDO';
    const baseColor = isLocal ? '#8b5cf6' : '#2dd4bf';
    const fillColor = made
      ? (isLocal ? 'rgba(139,92,246,.85)' : 'rgba(45,212,191,.85)')
      : 'rgba(0,0,0,0)';
    const strokeColor = made
      ? (isLocal ? '#a78bfa' : '#5eead4')
      : (isLocal ? 'rgba(139,92,246,.7)' : 'rgba(45,212,191,.7)');

    ctx.beginPath();
    ctx.arc(x, y, r * (made ? 1 : 0.85), 0, Math.PI*2);
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();

    // X mark for missed shots
    if (!made) {
      const d = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(x-d, y-d); ctx.lineTo(x+d, y+d);
      ctx.moveTo(x+d, y-d); ctx.lineTo(x-d, y+d);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

// ============================================================
// TEAM GAMES MODAL
// ============================================================
// ============================================================
// PARTIDOS SECTION
// ============================================================
function openPartidoModal(game) {
  _partidoMode = true;
  // Set shot map state
  _smState.gameId    = game.gameId;
  _smState.local     = game.local;
  _smState.visit     = game.visit;
  _smState.focusTeam = game.local;
  _smState.filter    = { team: 'all', tipo: 'all', result: 'all' };
  document.getElementById('smBtnLocal').textContent = game.local;
  document.getElementById('smBtnVisit').textContent = game.visit;
  document.querySelectorAll('#smControls .sm-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'all');
  });
  // Reset tabs to stats
  switchGameTab('stats');
  // Load shots in background
  if (SHOTS_MAP === null) loadShots();
  // Header
  const localLogo = LOGOS[game.local];
  const logo = document.getElementById('tgmLogo');
  if (localLogo) { logo.src = localLogo; logo.style.display = ''; }
  else { logo.style.display = 'none'; }
  document.getElementById('tgmTitle').textContent = `${game.local} vs ${game.visit}`;
  document.getElementById('tgmRecord').textContent = game.fecha;
  // Scoreboard
  const lw = game.ganLocal;
  const lLogo = LOGOS[game.local] ? `<img src="${LOGOS[game.local]}" class="tgm-sb-logo" alt="" onerror="this.style.display='none'">` : '';
  const vLogo = LOGOS[game.visit] ? `<img src="${LOGOS[game.visit]}" class="tgm-sb-logo" alt="" onerror="this.style.display='none'">` : '';
  document.getElementById('tgmScoreboard').innerHTML = `
    <div class="tgm-sb-team">${lLogo}<div class="tgm-sb-name">${game.local}</div><div class="tgm-sb-score ${lw?'winner':''}">${game.ptsLocal}</div></div>
    <div class="tgm-sb-divider"><div class="tgm-sb-date">${game.fecha}</div><span class="tgm-sb-cond tgm-cond-l">Local vs Visita</span></div>
    <div class="tgm-sb-team">${vLogo}<div class="tgm-sb-name">${game.visit}</div><div class="tgm-sb-score ${!lw?'winner':''}">${game.ptsVisit}</div></div>`;
  // Stats comparison (reuse row helper)
  const m = game.sLocal, o = game.sVisit;
  const pct = (a,i) => i>0 ? (a/i*100).toFixed(1) : '—';
  function row(label, mD, oD, hiB=true, mC, oC) {
    const mn=parseFloat(mC!==undefined?mC:mD)||0, on=parseFloat(oC!==undefined?oC:oD)||0;
    const mW=mn!==on&&(hiB?mn>on:mn<on), oW=mn!==on&&(hiB?on>mn:on<mn);
    return `<div class="tgm-stat-row"><div class="tgm-val-l ${mW?'tgm-val-winner':''}">${mD}</div><div class="tgm-stat-label">${label}</div><div class="tgm-val-r ${oW?'tgm-val-winner':''}">${oD}</div></div>`;
  }
  const groups=[
    {title:'Tiros',rows:[row('Puntos',m.pts,o.pts),row('Dobles',`${m.t2a}/${m.t2i}`,`${o.t2a}/${o.t2i}`,true,m.t2a,o.t2a),row('% Dobles',pct(m.t2a,m.t2i)+'%',pct(o.t2a,o.t2i)+'%',true,pct(m.t2a,m.t2i),pct(o.t2a,o.t2i)),row('Triples',`${m.t3a}/${m.t3i}`,`${o.t3a}/${o.t3i}`,true,m.t3a,o.t3a),row('% Triples',pct(m.t3a,m.t3i)+'%',pct(o.t3a,o.t3i)+'%',true,pct(m.t3a,m.t3i),pct(o.t3a,o.t3i)),row('Libres',`${m.t1a}/${m.t1i}`,`${o.t1a}/${o.t1i}`,true,m.t1a,o.t1a),row('% Libres',pct(m.t1a,m.t1i)+'%',pct(o.t1a,o.t1i)+'%',true,pct(m.t1a,m.t1i),pct(o.t1a,o.t1i))]},
    {title:'Rebotes',rows:[row('Total rebotes',m.treb,o.treb),row('Reb. ofensivos',m.oreb,o.oreb),row('Reb. defensivos',m.dreb,o.dreb)]},
    {title:'Otros',rows:[row('Asistencias',m.ast,o.ast),row('Recuperos',m.rec,o.rec),row('Pérdidas',m.per,o.per,false),row('Tapones',m.tap,o.tap),row('Valoración',m.val,o.val)]},
  ];
  document.getElementById('tgmDetailBody').innerHTML = groups.map(g=>`<div class="tgm-stat-section"><div class="tgm-stat-group-title">${g.title}</div>${g.rows.join('')}</div>`).join('');
  // Show detail directly (skip game list)
  document.getElementById('tgmBody').style.display = 'none';
  document.getElementById('tgmDetail').classList.add('visible');
  document.getElementById('teamGamesBackdrop').classList.add('open');
}

function renderBoxScore(gameId, localTeam, visitTeam) {
  const panel = document.getElementById('tgmBoxPanel');
  const allRows = GAME_PLAYERS_MAP[gameId] || [];
  if (!allRows.length) {
    panel.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-size:.82rem">No hay datos de box score para este partido.</div>';
    return;
  }
  function teamTable(players, teamName) {
    if (!players.length) return '';
    players.sort((a,b) => (parseFloat(b['Segundos jugados'])||0) - (parseFloat(a['Segundos jugados'])||0));
    const logoSrc = LOGOS[teamName];
    const logoHtml = logoSrc ? `<img src="${logoSrc}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px" onerror="this.style.display='none'">` : '';
    const cols = [
      {k:'name',   l:'Jugador',  al:'left',   tip:'Nombre del jugador (● = titular)'},
      {k:'min',    l:'Min',      al:'center', tip:'Minutos jugados (DNP = no jugó)'},
      {k:'pts',    l:'PTS',      al:'right',  tip:'Puntos anotados'},
      {k:'t2',     l:'Dobles',   al:'right',  tip:'Tiros de 2 pts (convertidos/intentados)'},
      {k:'t3',     l:'Triples',  al:'right',  tip:'Tiros de 3 pts (convertidos/intentados)'},
      {k:'t1',     l:'TL',       al:'right',  tip:'Tiros libres (convertidos/intentados)'},
      {k:'treb',   l:'REB',      al:'right',  tip:'Rebotes totales (RD + RO)'},
      {k:'dreb',   l:'RD',       al:'right',  tip:'Rebotes defensivos'},
      {k:'oreb',   l:'RO',       al:'right',  tip:'Rebotes ofensivos'},
      {k:'ast',    l:'AST',      al:'right',  tip:'Asistencias'},
      {k:'rec',    l:'REC',      al:'right',  tip:'Recuperos (robos de balón)'},
      {k:'per',    l:'PER',      al:'right',  tip:'Pérdidas'},
      {k:'tap',    l:'TAP',      al:'right',  tip:'Tapones'},
      {k:'val',    l:'VAL',      al:'right',  tip:'Valoración del partido'},
    ];
    const thead = cols.map(c=>`<th style="text-align:${c.al}" data-tip="${c.tip}">${c.l}</th>`).join('');
    let tot = { pts:0, t2a:0, t2i:0, t3a:0, t3i:0, t1a:0, t1i:0, treb:0, dreb:0, oreb:0, ast:0, rec:0, per:0, tap:0, val:0 };
    const tbody = players.map(r => {
      const t2a=parseFloat(r['T2A'])||0, t2i=parseFloat(r['T2I'])||0;
      const t3a=parseFloat(r['T3A'])||0, t3i=parseFloat(r['T3I'])||0;
      const t1a=parseFloat(r['T1A'])||0, t1i=parseFloat(r['T1I'])||0;
      const noMin = (parseFloat(r['Segundos jugados'])||0) === 0;
      const starter = r['Titular'] === 'True';
      if (!noMin) {
        tot.pts+=parseFloat(r['Puntos'])||0; tot.t2a+=t2a; tot.t2i+=t2i;
        tot.t3a+=t3a; tot.t3i+=t3i; tot.t1a+=t1a; tot.t1i+=t1i;
        tot.treb+=parseFloat(r['TReb'])||0; tot.dreb+=parseFloat(r['DReb'])||0;
        tot.oreb+=parseFloat(r['OReb'])||0; tot.ast+=parseFloat(r['Asistencias'])||0;
        tot.rec+=parseFloat(r['Recuperos'])||0; tot.per+=parseFloat(r['Perdidas'])||0;
        tot.tap+=parseFloat(r['Tapones cometidos'])||0; tot.val+=parseFloat(r['Valoracion'])||0;
      }
      const vals = {
        name:  `<span class="box-dorsal">#${Math.round(parseFloat(r['Número Camiseta'])||0)}</span>${starter?'<span class="box-starter-dot">●</span>':''}${r['Nombre completo']||'—'}`,
        min:   noMin ? '<span style="color:var(--muted2)">DNP</span>' : (r['Tiempo jugado (mm:ss)']||'—'),
        pts:   parseFloat(r['Puntos'])||0,
        t2:    `${t2a}/${t2i}`,
        t3:    `${t3a}/${t3i}`,
        t1:    `${t1a}/${t1i}`,
        treb:  parseFloat(r['TReb'])||0,
        dreb:  parseFloat(r['DReb'])||0,
        oreb:  parseFloat(r['OReb'])||0,
        ast:   parseFloat(r['Asistencias'])||0,
        rec:   parseFloat(r['Recuperos'])||0,
        per:   parseFloat(r['Perdidas'])||0,
        tap:   parseFloat(r['Tapones cometidos'])||0,
        val:   parseFloat(r['Valoracion'])||0,
      };
      const tds = cols.map(c => {
        const dim = noMin ? ' style="opacity:.45"' : '';
        return `<td style="text-align:${c.al}"${dim}>${vals[c.k]}</td>`;
      }).join('');
      return `<tr class="box-row${noMin?' box-dnp':''}">${tds}</tr>`;
    }).join('');
    const totVals = {
      name: '<strong>TOTALES</strong>', min: '',
      pts: `<strong>${tot.pts}</strong>`,
      t2: `<strong>${tot.t2a}/${tot.t2i}</strong>`,
      t3: `<strong>${tot.t3a}/${tot.t3i}</strong>`,
      t1: `<strong>${tot.t1a}/${tot.t1i}</strong>`,
      treb: `<strong>${tot.treb}</strong>`, dreb: `<strong>${tot.dreb}</strong>`,
      oreb: `<strong>${tot.oreb}</strong>`, ast: `<strong>${tot.ast}</strong>`,
      rec: `<strong>${tot.rec}</strong>`, per: `<strong>${tot.per}</strong>`,
      tap: `<strong>${tot.tap}</strong>`, val: `<strong>${tot.val}</strong>`,
    };
    const totTds = cols.map(c => `<td style="text-align:${c.al}">${totVals[c.k]}</td>`).join('');
    const totRow = `<tr class="box-row box-totals-row" style="border-top:1px solid var(--border2);background:rgba(139,92,246,.08)">${totTds}</tr>`;
    return `<div class="tgm-box-team">
      <div class="tgm-box-team-header">${logoHtml}${teamName}</div>
      <div class="tgm-box-table-wrap"><table class="tgm-box-table">
        <thead><tr>${thead}</tr></thead><tbody>${tbody}${totRow}</tbody>
      </table></div></div>`;
  }
  const localP = allRows.filter(r => r['Equipo'] === localTeam);
  const visitP = allRows.filter(r => r['Equipo'] === visitTeam);
  panel.innerHTML = teamTable(localP, localTeam) + teamTable(visitP, visitTeam);
}

// ── EVOLUCIÓN DE PARTIDO ──────────────────────────────────────
function computeScoreDelta(gameId) {
  if (!PBP_MAP) return null;
  const events = PBP_MAP.get(gameId);
  if (!events || !events.length) return null;

  // Walk events in order, tracking running score at each second-elapsed bucket
  let sLoc = 0, sVis = 0;
  const readings = []; // { elapsed, sLoc, sVis }

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

function renderScoreDelta(gameId, localTeam, visitTeam) {
  const panel = document.getElementById('tgmEvolPanel');
  const focusTeam = _smState.focusTeam || localTeam;
  const invert    = focusTeam === visitTeam;
  const teamA     = focusTeam;
  const teamB     = invert ? localTeam : visitTeam;

  const doRender = () => {
    let data = computeScoreDelta(gameId);
    if (!data || !data.length) {
      panel.innerHTML = `<div class="evol-empty">No hay datos de evolución para este partido.</div>`;
      return;
    }
    if (invert) data = data.map(d => ({ ...d, delta: -d.delta }));
    panel.innerHTML = `<div class="evol-wrap">
      <div class="evol-title">Evolución del marcador · minuto a minuto</div>
      <div class="evol-svg-wrap">${_buildEvolSvg(data)}</div>
      <div class="evol-legend">
        <div class="evol-leg-item"><div class="evol-leg-dot" style="background:#a78bfa"></div>${teamA} arriba</div>
        <div class="evol-leg-item"><div class="evol-leg-dot" style="background:#5eead4"></div>${teamB} arriba</div>
      </div>
    </div>`;

    // Tooltip logic
    const tip = document.getElementById('evolTip');
    panel.querySelectorAll('.evol-bar').forEach(bar => {
      bar.addEventListener('mouseenter', e => {
        const min   = bar.dataset.min;
        const delta = parseInt(bar.dataset.delta, 10);
        const sLoc  = bar.dataset.sloc;
        const sVis  = bar.dataset.svis;
        const leader = delta > 0 ? teamA : delta < 0 ? teamB : null;
        const sign   = delta > 0 ? '+' : '';
        const clr    = delta > 0 ? '#a78bfa' : delta < 0 ? '#5eead4' : 'var(--muted)';
        tip.innerHTML = `<span style="color:var(--muted);font-size:.62rem">MIN ${min}</span><br>
          <span style="font-weight:800;font-size:.92rem;color:#fff">${sLoc} – ${sVis}</span><br>
          <span style="font-size:.66rem;color:${clr}">${leader ? sign+delta+' · '+leader : 'Empate'}</span>`;
        tip.style.display = 'block';
        _evolMoveTip(e);
      });
      bar.addEventListener('mousemove', _evolMoveTip);
      bar.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  };

  if (PBP_MAP === null) {
    panel.innerHTML = `<div class="evol-empty" style="color:var(--muted2)">Cargando datos…</div>`;
    loadPbp().then(doRender);
  } else {
    doRender();
  }
}

function _evolMoveTip(e) {
  const tip = document.getElementById('evolTip');
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - th - 10;
  if (x + tw > window.innerWidth - 8)  x = e.clientX - tw - 14;
  if (y < 8) y = e.clientY + 14;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
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
      const leaderLocal = d.sLoc >= d.sVis;
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

function _partidoFechaToDate(s) {
  const [d,m,y] = s.split('/');
  return new Date(+y, +m-1, +d);
}

function onPartidoFilter() {
  const team    = document.getElementById('pTeam').value;
  const fromStr = document.getElementById('pDateFrom').value;
  const toStr   = document.getElementById('pDateTo').value;
  const fromD   = fromStr ? new Date(fromStr + 'T00:00:00') : null;
  const toD     = toStr   ? new Date(toStr   + 'T23:59:59') : null;
  const filtered = GAMES_ALL.filter(g => {
    if (team && g.local !== team && g.visit !== team) return false;
    if (fromD || toD) {
      const gd = _partidoFechaToDate(g.fecha);
      if (fromD && gd < fromD) return false;
      if (toD   && gd > toD)   return false;
    }
    return true;
  });
  document.getElementById('pCount').textContent = filtered.length;
  renderPartidoList(filtered);
}

function showUpcomingDefault() {
  document.getElementById('pTeam').value = '';
  const toISO = s => { const [d,m,y]=s.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; };
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const todayGames = GAMES_ALL.filter(g => toISO(g.fecha) === todayISO);
  if (todayGames.length) {
    document.getElementById('pDateFrom').value = todayISO;
    document.getElementById('pDateTo').value   = todayISO;
    renderPartidoList(todayGames, true);
  } else {
    const upcoming = GAMES_ALL.filter(g => g.upcoming);
    if (upcoming.length) {
      const nextISO = toISO(upcoming[0].fecha);
      const nextGames = upcoming.filter(g => toISO(g.fecha) === nextISO);
      document.getElementById('pDateFrom').value = nextISO;
      document.getElementById('pDateTo').value   = nextISO;
      renderPartidoList(nextGames, true);
    } else {
      document.getElementById('pDateFrom').value = '';
      document.getElementById('pDateTo').value   = '';
      renderPartidoList([], true);
    }
  }
}

function clearPartidoFilter() {
  showUpcomingDefault();
}

function _formatFechaLarga(s) {
  const date = _partidoFechaToDate(s);
  return date.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

const TEAM_NAME_BREAKS = {'CENTRAL ENTRERRIANO':'CENTRAL<br>ENTRERRIANO'};
function fmtTeamName(name){return TEAM_NAME_BREAKS[name]||name;}

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
    const postBadge = isPostSeason(fecha) ? '<span class="pday-post-badge">Post Temporada</span>' : '';
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

function showTeamGames(teamName) {
  const t = TEAMS.find(t => t.Equipo === teamName);
  if (!t) return;
  _currentTeamName = teamName;
  closeGameDetail();
  const logoSrc = LOGOS[teamName];
  const logo = document.getElementById('tgmLogo');
  logo.src = logoSrc || ''; logo.style.display = logoSrc ? '' : 'none';
  document.getElementById('tgmTitle').textContent = teamName;
  document.getElementById('tgmRecord').textContent = `${t.Ganados}G - ${t.Perdidos}P`;
  const tbody = document.getElementById('tgmTbody');
  tbody.innerHTML = '';
  (t._gamelog || []).slice().reverse().forEach((g, idx) => {
    const rivalLogo = LOGOS[g.rival]
      ? `<img src="${LOGOS[g.rival]}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:5px" onerror="this.style.display='none'">`
      : '';
    const condHtml = g.condicion === 'LOCAL'
      ? '<span class="tgm-cond tgm-cond-l">Local</span>'
      : '<span class="tgm-cond tgm-cond-v">Visita</span>';
    const resHtml = g.ganado
      ? '<span class="tgm-win">V</span>'
      : '<span class="tgm-loss">D</span>';
    const scoreColor = g.ganado ? 'var(--green)' : 'var(--red)';
    const tr = document.createElement('tr');
    tr.className = 'tgm-clickable';
    tr.innerHTML = `
      <td>${g.fecha}</td>
      <td>${condHtml}</td>
      <td>${rivalLogo}${g.rival}</td>
      <td><span style="font-weight:700;color:${scoreColor}">${g.ptsFor}</span><span style="color:var(--muted2);margin:0 4px">—</span><span style="color:var(--muted)">${g.ptsAgainst}</span></td>
      <td>${resHtml}</td>
      <td><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></td>`;
    tr.addEventListener('click', () => showGameDetail(g, teamName));
    tbody.appendChild(tr);
  });
  document.getElementById('teamGamesBackdrop').classList.add('open');
}

function showGameDetail(g, teamName) {
  // Store state for shot map
  const isLocal = g.condicion === 'LOCAL';
  _smState.gameId    = g.gameId || null;
  _smState.local     = isLocal ? teamName : g.rival;
  _smState.visit     = isLocal ? g.rival  : teamName;
  _smState.focusTeam = teamName;
  _smState.filter    = { team: 'all', tipo: 'all', result: 'all' };

  // Update local/visit button labels
  document.getElementById('smBtnLocal').textContent = _smState.local;
  document.getElementById('smBtnVisit').textContent = _smState.visit;

  // Reset toggles to "all"
  document.querySelectorAll('#smControls .sm-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'all');
  });

  // Reset to stats tab
  switchGameTab('stats');

  // Load shots in background
  if (SHOTS_MAP === null) loadShots();

  // Scoreboard
  const myWinner = g.ganado;
  const myLogo  = LOGOS[teamName] ? `<img src="${LOGOS[teamName]}" class="tgm-sb-logo" alt="" onerror="this.style.display='none'">` : '';
  const oppLogo = LOGOS[g.rival]  ? `<img src="${LOGOS[g.rival]}"  class="tgm-sb-logo" alt="" onerror="this.style.display='none'">` : '';
  const condBadge = g.condicion === 'LOCAL'
    ? `<span class="tgm-sb-cond tgm-cond-l">Local vs Visita</span>`
    : `<span class="tgm-sb-cond tgm-cond-v">Visita vs Local</span>`;
  document.getElementById('tgmScoreboard').innerHTML = `
    <div class="tgm-sb-team">
      ${myLogo}
      <div class="tgm-sb-name">${teamName}</div>
      <div class="tgm-sb-score ${myWinner ? 'winner' : ''}">${g.ptsFor}</div>
    </div>
    <div class="tgm-sb-divider">
      <div class="tgm-sb-date">${g.fecha}</div>
      ${condBadge}
    </div>
    <div class="tgm-sb-team">
      ${oppLogo}
      <div class="tgm-sb-name">${g.rival}</div>
      <div class="tgm-sb-score ${!myWinner ? 'winner' : ''}">${g.ptsAgainst}</div>
    </div>`;

  // Stats comparison
  const m = g.myS, o = g.oppS;
  const pct = (a, i) => i > 0 ? (a/i*100).toFixed(1) : '—';

  // row(label, mDisplay, oDisplay, higherBetter, mCmp?, oCmp?)
  // mCmp/oCmp son los valores numéricos para comparar cuando mDisplay es HTML
  function row(label, mDisplay, oDisplay, higherBetter = true, mCmp, oCmp) {
    const mNum = parseFloat(mCmp !== undefined ? mCmp : mDisplay) || 0;
    const oNum = parseFloat(oCmp !== undefined ? oCmp : oDisplay) || 0;
    const mWins = mNum !== oNum && (higherBetter ? mNum > oNum : mNum < oNum);
    const oWins = mNum !== oNum && (higherBetter ? oNum > mNum : oNum < mNum);
    return `<div class="tgm-stat-row">
      <div class="tgm-val-l ${mWins ? 'tgm-val-winner' : ''}">${mDisplay}</div>
      <div class="tgm-stat-label">${label}</div>
      <div class="tgm-val-r ${oWins ? 'tgm-val-winner' : ''}">${oDisplay}</div>
    </div>`;
  }

  const groups = [
    { title: 'Tiros', rows: [
      row('Puntos', m.pts, o.pts),
      row('Dobles', `${m.t2a}/${m.t2i}`, `${o.t2a}/${o.t2i}`, true, m.t2a, o.t2a),
      row('% Dobles', pct(m.t2a,m.t2i)+'%', pct(o.t2a,o.t2i)+'%', true, pct(m.t2a,m.t2i), pct(o.t2a,o.t2i)),
      row('Triples', `${m.t3a}/${m.t3i}`, `${o.t3a}/${o.t3i}`, true, m.t3a, o.t3a),
      row('% Triples', pct(m.t3a,m.t3i)+'%', pct(o.t3a,o.t3i)+'%', true, pct(m.t3a,m.t3i), pct(o.t3a,o.t3i)),
      row('Libres', `${m.t1a}/${m.t1i}`, `${o.t1a}/${o.t1i}`, true, m.t1a, o.t1a),
      row('% Libres', pct(m.t1a,m.t1i)+'%', pct(o.t1a,o.t1i)+'%', true, pct(m.t1a,m.t1i), pct(o.t1a,o.t1i)),
    ]},
    { title: 'Rebotes', rows: [
      row('Total rebotes', m.treb, o.treb),
      row('Reb. ofensivos', m.oreb, o.oreb),
      row('Reb. defensivos', m.dreb, o.dreb),
    ]},
    { title: 'Otros', rows: [
      row('Asistencias', m.ast, o.ast),
      row('Recuperos', m.rec, o.rec),
      row('Pérdidas', m.per, o.per, false),
      row('Tapones', m.tap, o.tap),
      row('Valoración', m.val, o.val),
    ]},
  ];

  document.getElementById('tgmDetailBody').innerHTML = groups.map(g =>
    `<div class="tgm-stat-section">
      <div class="tgm-stat-group-title">${g.title}</div>
      ${g.rows.join('')}
    </div>`
  ).join('');

  document.getElementById('tgmBody').style.display = 'none';
  document.getElementById('tgmDetail').classList.add('visible');
}

function onTgmBack() {
  if (_partidoMode) {
    document.getElementById('teamGamesBackdrop').classList.remove('open');
    document.getElementById('tgmDetail').classList.remove('visible');
    _partidoMode = false;
  } else {
    closeGameDetail();
  }
}

function closeGameDetail() {
  document.getElementById('tgmDetail').classList.remove('visible');
  document.getElementById('tgmBody').style.display = '';
}

function closeTeamGames(e) {
  if (e && e.target !== document.getElementById('teamGamesBackdrop')) return;
  document.getElementById('teamGamesBackdrop').classList.remove('open');
  closeGameDetail();
  _partidoMode = false;
}

async function initApp() {
  document.getElementById('loadingOverlay').style.display = 'flex';
  try {
    const [resp, dobResp] = await Promise.all([
      fetch(CSV_PATH + '?v=' + Date.now(), { cache: 'no-store' }),
      fetch(DOB_PATH + '?v=' + Date.now(), { cache: 'no-store' }).catch(()=>null)
    ]);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    if (dobResp && dobResp.ok) {
      const dobRows = parseCSV(await dobResp.text());
      dobRows.forEach(r => { if (r.liga === 'Liga Argentina') DOB_MAP[r.nombre_abreviado] = r.fecha_nacimiento; });
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

    // Leaders — por fase (Temporada Regular / Post Temporada)
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
    const Lreg = PLAYERS.map(p => p._regular).filter(d => d && d.PJ >= 5);
    const Lpost = PLAYERS.map(p => p._post).filter(d => d && d.PJ >= 1);
    LEADERS_DATA_REGULAR = buildLeadersDataset(Lreg);
    LEADERS_DATA_POST = buildLeadersDataset(Lpost);
    LEADERS_DATA = LEADERS_DATA_POST;

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
    const _playedKeys = new Set(GAMES_ALL.map(g => `${g.fecha}|${g.local}|${g.visit}`));
    try {
      const upResp = await fetch('fixture_upcoming.csv?v=' + Date.now(), { cache: 'no-store' });
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

function szcClassifyCoord(x, y) {
  // x: meters from left baseline (0–14), y: meters from top sideline (0–15)
  if (x < 0 || x > 14 || y < 0 || y > 15) return null;
  const bx = 1.575, by = 7.5;
  // Corner 3pt zones: FIBA corner straight lines at 0.9m from each sideline.
  // These pixels can have dist <= 6.75 yet still be outside the 3pt line.
  // Still apply the 45° diagonal to split CORNER from ABOVE_BREAK.
  const dx = x - bx, dy = y - by;
  if (y < 0.9)       return dy < -dx ? 'CORNER_TOP' : 'ABOVE_BREAK';
  if (y > 15 - 0.9)  return dy >  dx ? 'CORNER_BOT' : 'ABOVE_BREAK';
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > 6.75) {
    if (dy < -dx) return 'CORNER_TOP';
    if (dy >  dx) return 'CORNER_BOT';
    return 'ABOVE_BREAK';
  }
  // 2pt territory
  if (x <= 5.8 && Math.abs(dy) <= 2.45) return 'PAINT';
  if (dist <= 1.25) return 'PAINT';
  if (dy < -1.5) return 'MID_TOP';
  if (dy >  1.5) return 'MID_BOT';
  return 'MID_CENTER';
}

function szcClassifyShot(s) {
  // Use Tipo as source of truth for 2pt/3pt — coordinates only determine sub-zone.
  // This ensures zone totals match T2I/T3I from the stats table.
  const tipo = s['Tipo'];
  if (!tipo || tipo === 'TIRO1') return null;
  const is3 = tipo === 'TIRO3';

  const isLocal = s['Local'] === 'True';
  const lPct = parseFloat(s['Left_pct']);
  const tPct = parseFloat(s['Top_pct']);
  const normLeft = isNaN(lPct) || isNaN(tPct) ? null : (isLocal ? lPct : 100 - lPct);

  if (normLeft !== null && normLeft >= 0 && normLeft <= 53) {
    const x = (normLeft - 6.51) * 0.3219;
    const y = tPct * 0.15;
    const bx = 1.575, by = 7.5;
    const dy = y - by;

    if (is3) {
      const dx = x - bx;
      if (dy < -dx) return 'CORNER_TOP';
      if (dy >  dx) return 'CORNER_BOT';
      return 'ABOVE_BREAK';
    } else {
      const dx = x - bx;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (x <= 5.8 && Math.abs(dy) <= 2.45) return 'PAINT';
      if (dist <= 1.25) return 'PAINT';
      if (dy < -1.5) return 'MID_TOP';
      if (dy >  1.5) return 'MID_BOT';
      return 'MID_CENTER';
    }
  }

  // Fallback for missing/out-of-range coordinates
  return is3 ? 'ABOVE_BREAK' : 'PAINT';
}

function szcComputeStats(shots) {
  const stats = {};
  SZC_ZONES.forEach(z => stats[z] = { makes: 0, att: 0 });
  shots.forEach(s => {
    if (s['Tipo'] === 'TIRO1') return;
    const zone = szcClassifyShot(s);
    if (!zone) return;
    stats[zone].att++;
    if (s['Resultado'] === 'CONVERTIDO') stats[zone].makes++;
  });
  return stats;
}

function szcZoneColor(ps, ls) {
  if (!ps || ps.att === 0) return [55, 58, 90, 220];
  const pPct = ps.makes / ps.att;
  const lPct = ls && ls.att > 0 ? ls.makes / ls.att : 0.44;
  const diff = pPct - lPct;
  // Interpolación continua entre anclas de color (diff en tanto por uno)
  const stops = [
    [-0.12, 29,  78, 216],   // azul oscuro
    [-0.06, 96, 165, 250],   // azul medio
    [-0.02, 147, 197, 253],  // azul muy claro
    [ 0.00, 203, 213, 225],  // gris claro (promedio)
    [ 0.02, 253, 186, 116],  // naranja muy claro
    [ 0.06, 251, 146,  60],  // naranja
    [ 0.12, 220,  38,  38],  // rojo oscuro
  ];
  if (diff <= stops[0][0])   return [...stops[0].slice(1), 220];
  if (diff >= stops[stops.length-1][0]) return [...stops[stops.length-1].slice(1), 220];
  for (let i = 0; i < stops.length - 1; i++) {
    const [d0,r0,g0,b0] = stops[i], [d1,r1,g1,b1] = stops[i+1];
    if (diff >= d0 && diff <= d1) {
      const t = (diff - d0) / (d1 - d0);
      return [Math.round(r0+t*(r1-r0)), Math.round(g0+t*(g1-g0)), Math.round(b0+t*(b1-b0)), 215];
    }
  }
  return [203, 213, 225, 215];
}

function szcDrawZoneColors(ctx, W, H, m, playerStats, leagueStats) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const zone = szcClassifyCoord(col / m, row / m);
      const c = zone
        ? szcZoneColor(playerStats[zone], leagueStats ? leagueStats[zone] : null)
        : [11, 11, 22, 255];
      const i = (row * W + col) * 4;
      d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}

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


function szcRenderZoneCards(statsAll, statsL10, statsL5, lStats, statsPost) {
  const el = document.getElementById('szcZoneCards');
  if (!el) return;
  const aps = szcPeriod === 'all' ? statsAll : szcPeriod === 'last10' ? statsL10 : szcPeriod === 'post' ? (statsPost || statsAll) : statsL5;
  el.innerHTML = SZC_ZONES.map(zone => {
    const ps = aps[zone];
    const hasData = ps && ps.att > 0;
    const hasAny = [statsAll, statsL10, statsL5, statsPost].filter(Boolean).some(s => s[zone] && s[zone].att > 0);
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
  const statsAll  = szcComputeStats(szcFilterByPeriod(_lvShots, 'all', _lvGIds));
  const statsL10  = szcComputeStats(szcFilterByPeriod(_lvShots, 'last10', _lvGIds));
  const statsL5   = szcComputeStats(szcFilterByPeriod(_lvShots, 'last5', _lvGIds));
  const statsPost = szcComputeStats(szcFilterByPeriod(_lvShots, 'post', _lvGIds));
  szcRenderZoneCards(statsAll, statsL10, statsL5, LEAGUE_ZONE_STATS, statsPost);
}

function onSzcInput() {
  const val = document.getElementById('szcInput').value.trim().toLowerCase();
  const ac = document.getElementById('szcAC');
  if (!val || !PLAYERS || val.length < 2) { ac.style.display = 'none'; return; }
  const matches = PLAYERS.filter(p =>
    p['Nombre completo'].toLowerCase().includes(val) || p.Equipo.toLowerCase().includes(val)
  ).slice(0, 10);
  if (!matches.length) { ac.style.display = 'none'; return; }
  ac.innerHTML = matches.map(p => {
    const idx = PLAYERS.indexOf(p);
    return `<div class="szc-ac-item" onmousedown="selectSzcPlayer(${idx})">
      <div class="szc-ac-name">${p['Nombre completo']}</div>
      <div class="szc-ac-team">${p.Equipo}</div>
    </div>`;
  }).join('');
  ac.style.display = 'block';
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
  if (period === 'post') {
    return shots.filter(s => {
      const f = s['Fecha'];
      if (!f) return false;
      const [d, m, y] = f.split('/');
      return new Date(+y, +m - 1, +d) >= PLAYOFF_DATE;
    });
  }
  const n = period === 'last5' ? 5 : 10;
  let lastN;
  if (gameIds && gameIds.length > 0) {
    // Use player's actual played-game list (already sorted by date) for correct "last N"
    lastN = new Set(gameIds.slice(-n));
  } else {
    // Fallback: derive from shot data
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
  ['szcPeriodAll','szcPeriodL5','szcPeriodL10','szcPeriodPost'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = {all:'szcPeriodAll', last5:'szcPeriodL5', last10:'szcPeriodL10', post:'szcPeriodPost'};
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
    const allShots = SHOTS_BY_PLAYER ? (SHOTS_BY_PLAYER.get(key) || []) : [];
    szcPlayerAllShots = allShots;
    szcPlayerGameIds = player._gameIds || null;
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

function updateJFilterVisibility(){
  const chain=[
    {rowId:'jFilterRow2',triggerId:'jAttr', resetAttr:'jAttr2',resetVal:'jAttrVal2'},
    {rowId:'jFilterRow3',triggerId:'jAttr2',resetAttr:'jAttr3',resetVal:'jAttrVal3'},
    {rowId:'jFilterRow4',triggerId:'jAttr3',resetAttr:'jAttr4',resetVal:'jAttrVal4'},
  ];
  let canShow=true;
  chain.forEach(({rowId,triggerId,resetAttr,resetVal})=>{
    const trigger=document.getElementById(triggerId);
    const row=document.getElementById(rowId);
    if(canShow && trigger.value!==''){
      row.style.display='grid';
    } else {
      row.style.display='none';
      canShow=false;
      document.getElementById(resetAttr).value='';
      document.getElementById(resetVal).value='';
    }
  });
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
    const isLiga = teamName === '__LIGA__';
    const allShots = [];
    SHOTS_MAP.forEach(shots => {
      shots.forEach(s => { if (isLiga || s['Equipo'] === teamName) allShots.push(s); });
    });
    const team = isLiga ? null : TEAM_MAP[teamName];
    tzcTeamGameIds = team ? team._gamelog.map(g => g.gameId) : null;
    const gidSet = tzcTeamGameIds ? new Set(tzcTeamGameIds) : null;
    const filteredShots = gidSet ? allShots.filter(s => gidSet.has(s['IdPartido'])) : allShots;
    tzcTeamAllShots = filteredShots;
    const tzcLocVisShots = tzcApplyLocVis(filteredShots);
    const tzcLocVisGameIds = tzcLocVis === 'all' ? tzcTeamGameIds : null;
    const shots = szcFilterByPeriod(tzcLocVisShots, tzcPeriod, tzcLocVisGameIds);
    const t2i = shots.filter(s => s['Tipo'] === 'TIRO2').length;
    const t2a = shots.filter(s => s['Tipo'] === 'TIRO2' && s['Resultado'] === 'CONVERTIDO').length;
    const t3i = shots.filter(s => s['Tipo'] === 'TIRO3').length;
    const t3a = shots.filter(s => s['Tipo'] === 'TIRO3' && s['Resultado'] === 'CONVERTIDO').length;
    document.getElementById('tzcTeamName').textContent = isLiga ? 'Liga Argentina' : teamName;
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
const PBP_CSV = 'liga_argentina_pbp.csv';
let PBP_MAP = null;    // null=not loaded, Map<gameId, rows[]>
let LINEUP_DATA = null; // Map<teamName, Map<lineupKey, {players,secs,pf,pa,games}>>
let qntSort = 'min', qntDir = 'desc';

async function loadPbp() {
  if (PBP_MAP !== null) return;
  try {
    const resp = await fetch(PBP_CSV + '?v=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    PBP_MAP = new Map();
    rows.forEach(r => {
      const gid = r['IdPartido']; if (!gid) return;
      if (!PBP_MAP.has(gid)) PBP_MAP.set(gid, []);
      PBP_MAP.get(gid).push(r);
    });
  } catch(e) { PBP_MAP = new Map(); }
}

// Convert period + time-remaining string "MM:SS" to total elapsed seconds
function pbpElapsed(period, tiempo) {
  if (!tiempo) return null;
  const parts = tiempo.split(':'); if (parts.length < 2) return null;
  const remaining = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  const p = Math.round(parseFloat(period) || 1);
  const periodLen = p <= 4 ? 600 : 300;
  const periodOffset = p <= 4 ? (p - 1) * 600 : 4 * 600 + (p - 5) * 300;
  return periodOffset + (periodLen - remaining);
}

// Possessions = FGA + 0.44*FTA - OReb + TO
function calcPoss(fga, fta, oreb, to) { return fga + 0.44 * fta - oreb + to; }

function computeLineups() {
  if (LINEUP_DATA !== null) return;
  LINEUP_DATA = new Map();
  PBP_MAP.forEach((events, gameId) => {
    events.sort((a, b) => parseInt(a['NumAccion']) - parseInt(b['NumAccion']));
    const localTeam = events[0]['Equipo_local'];
    const visitTeam = events[0]['Equipo_visitante'];
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

function qntSortBy(col) {
  if (qntSort === col) qntDir = qntDir === 'asc' ? 'desc' : 'asc';
  else { qntSort = col; qntDir = col === 'players' ? 'asc' : 'desc'; }
  renderQuintetos();
}

async function onQTeamChange() {
  const loading = document.getElementById('qntLoading');
  const empty = document.getElementById('qntEmpty');
  const content = document.getElementById('qntContent');
  if (PBP_MAP === null) {
    loading.style.display = ''; empty.style.display = 'none'; content.style.display = 'none';
    await loadPbp();
  }
  if (LINEUP_DATA === null) computeLineups();
  renderQuintetos();
}

function formatPlayerShort(name) {
  if (!name) return name;
  const parts = name.split(', ');
  if (parts.length < 2) return name;
  const firstWord = parts[1].split(' ')[0];
  return firstWord[0] + '. ' + parts[0];
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

function renderQuintetos() {
  const team = document.getElementById('qntTeam').value;
  const minMin = parseFloat(document.getElementById('qntMinMin').value) || 5;
  const empty = document.getElementById('qntEmpty');
  const loading = document.getElementById('qntLoading');
  const content = document.getElementById('qntContent');
  const countEl = document.getElementById('qntCount');

  if (!team) {
    if (!LINEUP_DATA) {
      loading.style.display = ''; content.style.display = 'none'; empty.style.display = 'none';
      countEl.textContent = ''; return;
    }
    // League-wide top 20 lineups by minutes
    function lerpRgbL(t, r1,g1,b1, r2,g2,b2) {
      return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
    }
    function heatRGL(val, mn, mx) { if(mn===mx)return''; const t=(val-mn)/(mx-mn); return t>=0.5?lerpRgbL((t-.5)*2,100,116,139,52,211,153):lerpRgbL(t*2,248,113,113,100,116,139); }
    function heatPurL(val, mn, mx) { if(mn===mx)return''; return lerpRgbL((val-mn)/(mx-mn),100,116,139,167,139,250); }
    function heatTealL(val, mn, mx) { if(mn===mx)return''; return lerpRgbL(1-(val-mn)/(mx-mn),100,116,139,94,234,212); }
    function heatWhtL(val, mn, mx) { if(mn===mx)return''; return lerpRgbL((val-mn)/(mx-mn),100,116,139,226,232,240); }
    let allRows = [];
    LINEUP_DATA.forEach((teamMap, teamName) => {
      teamMap.forEach(v => {
        const min = v.secs / 60;
        if (min < minMin) return;
        const offPoss = calcPoss(v.fga, v.fta, v.oreb, v.to);
        const defPoss = calcPoss(v.dfga, v.dfta, v.doreb, v.dto);
        const poss = (offPoss + defPoss) / 2;
        const pm = v.pf - v.pa;
        const offrtg  = offPoss > 0 ? v.pf / offPoss * 100 : 0;
        const defrtg  = defPoss > 0 ? v.pa / defPoss * 100 : 0;
        const net     = offrtg - defrtg;
        const fgpct   = v.fga  > 0 ? v.fgm  / v.fga  * 100 : 0;
        const fg3pct  = v.fg3a > 0 ? v.fg3m / v.fg3a * 100 : 0;
        const ast100  = v.fgm  > 0 ? v.ast / v.fgm  * 100 : 0;
        const tovpct  = (v.fga + 0.44*v.fta + v.to) > 0 ? v.to / (v.fga + 0.44*v.fta + v.to) * 100 : 0;
        const orebpct = (v.oreb + v.ddreb) > 0 ? v.oreb / (v.oreb + v.ddreb) * 100 : 0;
        const drebpct = (v.dreb + v.doreb) > 0 ? v.dreb / (v.dreb + v.doreb) * 100 : 0;
        const fg3rate = v.fga  > 0 ? v.fg3a / v.fga  * 100 : 0;
        const ftr     = v.fga  > 0 ? v.fta  / v.fga        : 0;
        allRows.push({ team: teamName, players: v.players, min, poss, pm, offrtg, defrtg, net, fgpct, fg3pct, ast100, tovpct, orebpct, drebpct, fg3rate, ftr });
      });
    });
    allRows.sort((a, b) => b.min - a.min);
    allRows = allRows.slice(0, 20);
    loading.style.display = 'none'; empty.style.display = 'none'; content.style.display = '';
    countEl.textContent = 'Top 20 · liga';
    const sign = v => v > 0 ? '+' : '';
    const fRtgL = v => v === 0 ? '—' : v.toFixed(1);
    const fPctL = v => v === 0 ? '—' : v.toFixed(1) + '%';
    const fRatL = v => v === 0 ? '—' : v.toFixed(2);
    const vr = allRows.filter(r => r.poss > 0);
    const crL = key => { const vs=vr.map(r=>r[key]).filter(v=>v!==0); return vs.length?[Math.min(...vs),Math.max(...vs)]:[0,0]; };
    const [mnMin,mxMin]=crL('min'), [mnPos,mxPos]=crL('poss'), [mnPm,mxPm]=crL('pm'),
          [mnOff,mxOff]=crL('offrtg'), [mnDef,mxDef]=crL('defrtg'), [mnNet,mxNet]=crL('net'),
          [mnFg,mxFg]=crL('fgpct'), [mnFg3,mxFg3]=crL('fg3pct'), [mnAst,mxAst]=crL('ast100'),
          [mnTov,mxTov]=crL('tovpct'), [mnOreb,mxOreb]=crL('orebpct'), [mnDreb,mxDreb]=crL('drebpct'),
          [mnFg3r,mxFg3r]=crL('fg3rate'), [mnFtr,mxFtr]=crL('ftr');
    const LEAGUE_COLS = [
      { key: 'team',    label: 'Equipo',   align: 'left',  tip: 'Equipo al que pertenece el quinteto' },
      ...QNT_COLS
    ];
    document.getElementById('qntThead').innerHTML = '<tr>' + LEAGUE_COLS.map(c =>
      `<th class="qnt-th" style="text-align:${c.align}" data-tip="${c.tip}">${c.label}</th>`
    ).join('') + '</tr>';
    document.getElementById('qntTbody').innerHTML = allRows.map((r, i) => {
      const playersHtml = r.players.map(p => `<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
      return `<tr style="background:${i%2===0?'rgba(139,92,246,.04)':' rgba(255,255,255,.015)'}">
        <td><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(r.team)}${r.team}</span></td>
        <td><div class="qnt-players">${playersHtml}</div></td>
        <td style="color:${heatWhtL(r.min,mnMin,mxMin)};font-weight:600">${r.min.toFixed(1)}</td>
        <td style="color:${heatWhtL(r.poss,mnPos,mxPos)};font-weight:600">${r.poss>0?Math.round(r.poss):'—'}</td>
        <td style="color:${heatRGL(r.pm,mnPm,mxPm)};font-weight:700">${sign(r.pm)}${r.pm}</td>
        <td style="color:${heatPurL(r.offrtg,mnOff,mxOff)};font-weight:700">${fRtgL(r.offrtg)}</td>
        <td style="color:${heatTealL(r.defrtg,mnDef,mxDef)};font-weight:700">${fRtgL(r.defrtg)}</td>
        <td style="color:${heatRGL(r.net,mnNet,mxNet)};font-weight:700">${sign(r.net)}${fRtgL(r.net)}</td>
        <td style="color:${heatPurL(r.fgpct,mnFg,mxFg)};font-weight:600">${fPctL(r.fgpct)}</td>
        <td style="color:${heatPurL(r.fg3pct,mnFg3,mxFg3)};font-weight:600">${fPctL(r.fg3pct)}</td>
        <td style="color:${heatPurL(r.ast100,mnAst,mxAst)};font-weight:600">${fPctL(r.ast100)}</td>
        <td style="color:${heatTealL(r.tovpct,mnTov,mxTov)};font-weight:600">${fPctL(r.tovpct)}</td>
        <td style="color:${heatPurL(r.orebpct,mnOreb,mxOreb)};font-weight:600">${fPctL(r.orebpct)}</td>
        <td style="color:${heatTealL(r.drebpct,mnDreb,mxDreb)};font-weight:600">${fPctL(r.drebpct)}</td>
        <td style="color:${heatWhtL(r.fg3rate,mnFg3r,mxFg3r)};font-weight:600">${fPctL(r.fg3rate)}</td>
        <td style="color:${heatPurL(r.ftr,mnFtr,mxFtr)};font-weight:600">${fRatL(r.ftr)}</td>
      </tr>`;
    }).join('');
    return;
  }
  if (!LINEUP_DATA) {
    loading.style.display = ''; content.style.display = 'none'; empty.style.display = 'none';
    countEl.textContent = ''; return;
  }

  const teamMap = LINEUP_DATA.get(team);
  if (!teamMap || teamMap.size === 0) {
    empty.textContent = 'No hay datos de jugada a jugada para este equipo.';
    empty.style.display = ''; content.style.display = 'none'; loading.style.display = 'none';
    countEl.textContent = ''; return;
  }

  let rows = [];
  teamMap.forEach(v => {
    const min = v.secs / 60;
    if (min < minMin) return;
    const offPoss = calcPoss(v.fga, v.fta, v.oreb, v.to);
    const defPoss = calcPoss(v.dfga, v.dfta, v.doreb, v.dto);
    const poss = (offPoss + defPoss) / 2;
    const pm = v.pf - v.pa;
    const offrtg  = offPoss > 0 ? v.pf / offPoss * 100 : 0;
    const defrtg  = defPoss > 0 ? v.pa / defPoss * 100 : 0;
    const net     = offrtg - defrtg;
    const fgpct   = v.fga  > 0 ? v.fgm  / v.fga  * 100 : 0;
    const fg3pct  = v.fg3a > 0 ? v.fg3m / v.fg3a * 100 : 0;
    const ast100  = v.fgm  > 0 ? v.ast / v.fgm  * 100 : 0;
    const tovpct  = (v.fga + 0.44*v.fta + v.to) > 0 ? v.to / (v.fga + 0.44*v.fta + v.to) * 100 : 0;
    const orebpct = (v.oreb + v.ddreb) > 0 ? v.oreb / (v.oreb + v.ddreb) * 100 : 0;
    const drebpct = (v.dreb + v.doreb) > 0 ? v.dreb / (v.dreb + v.doreb) * 100 : 0;
    const fg3rate = v.fga  > 0 ? v.fg3a / v.fga  * 100 : 0;
    const ftr     = v.fga  > 0 ? v.fta  / v.fga        : 0;
    rows.push({ players: v.players, min, poss, pm, offrtg, defrtg, net, fgpct, fg3pct, ast100, tovpct, orebpct, drebpct, fg3rate, ftr });
  });

  rows.sort((a, b) => {
    if (qntSort === 'players') {
      const cmp = a.players.join('').localeCompare(b.players.join(''));
      return qntDir === 'asc' ? cmp : -cmp;
    }
    return qntDir === 'asc' ? a[qntSort] - b[qntSort] : b[qntSort] - a[qntSort];
  });

  loading.style.display = 'none'; empty.style.display = 'none'; content.style.display = '';
  countEl.textContent = rows.length + ' quintetos';

  const thead = document.getElementById('qntThead');
  thead.innerHTML = '<tr>' + QNT_COLS.map(c => {
    const sorted = c.key === qntSort;
    const arrow = sorted ? (qntDir === 'asc' ? ' ↑' : ' ↓') : '';
    const cls = sorted ? ' qnt-sorted' : '';
    return `<th class="qnt-th${cls}" style="text-align:${c.align}" onclick="qntSortBy('${c.key}')" data-tip="${c.tip}">${c.label}${arrow}</th>`;
  }).join('') + '</tr>';

  const tbody = document.getElementById('qntTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${QNT_COLS.length}" style="text-align:center;color:var(--muted);padding:32px">No hay quintetos con ${minMin}+ minutos juntos.</td></tr>`;
    return;
  }

  const fRtg = v => v === 0 ? '—' : v.toFixed(1);
  const sign = v => v > 0 ? '+' : '';

  // Interpolate between two RGB colors
  function lerpRgb(t, r1,g1,b1, r2,g2,b2) {
    return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
  }
  // Red→muted→green scale (for +/- and Net)
  function heatRedGreen(val, min, max) {
    if (min === max) return '';
    const t = (val - min) / (max - min);
    // red(248,113,113) → muted(100,116,139) → green(52,211,153)
    if (t >= 0.5) return lerpRgb((t-0.5)*2, 100,116,139, 52,211,153);
    return lerpRgb(t*2, 248,113,113, 100,116,139);
  }
  // Muted→purple scale (OffRtg: higher=better)
  function heatPurple(val, min, max) {
    if (min === max) return '';
    const t = (val - min) / (max - min);
    return lerpRgb(t, 100,116,139, 167,139,250); // muted→purple-l
  }
  // Muted→teal scale (DefRtg: lower=better, so inverted)
  function heatTeal(val, min, max) {
    if (min === max) return '';
    const t = 1 - (val - min) / (max - min); // invert
    return lerpRgb(t, 100,116,139, 94,234,212); // muted→teal-l
  }
  // Muted→white scale (Min, Pos: higher=more used)
  function heatWhite(val, min, max) {
    if (min === max) return '';
    const t = (val - min) / (max - min);
    return lerpRgb(t, 100,116,139, 226,232,240); // muted→text
  }

  const validRows = rows.filter(r => r.poss > 0);
  const colRange = key => {
    const vals = validRows.map(r => r[key]).filter(v => v !== 0);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
  };
  const [minMin2,  maxMin]  = colRange('min');
  const [minPos,   maxPos]  = colRange('poss');
  const [minPm,    maxPm]   = colRange('pm');
  const [minOff,   maxOff]  = colRange('offrtg');
  const [minDef,   maxDef]  = colRange('defrtg');
  const [minNet,   maxNet]  = colRange('net');
  const [minFgpct,  maxFgpct]  = colRange('fgpct');
  const [minFg3pct, maxFg3pct] = colRange('fg3pct');
  const [minAst100, maxAst100] = colRange('ast100');
  const [minTov,    maxTov]    = colRange('tovpct');
  const [minOreb,   maxOreb]   = colRange('orebpct');
  const [minDreb,   maxDreb]   = colRange('drebpct');
  const [minFg3r,   maxFg3r]   = colRange('fg3rate');
  const [minFtr,    maxFtr]    = colRange('ftr');

  const fPct = v => v === 0 ? '—' : v.toFixed(1) + '%';
  const fRat = v => v === 0 ? '—' : v.toFixed(2);

  tbody.innerHTML = rows.map(r => {
    const playersHtml = r.players.map(p => `<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
    return `<tr>
      <td><div class="qnt-players">${playersHtml}</div></td>
      <td style="color:${heatWhite(r.min,       minMin2,  maxMin)};font-weight:600">${r.min.toFixed(1)}</td>
      <td style="color:${heatWhite(r.poss,      minPos,   maxPos)};font-weight:600">${r.poss > 0 ? Math.round(r.poss) : '—'}</td>
      <td style="color:${heatRedGreen(r.pm,     minPm,    maxPm)};font-weight:700">${sign(r.pm)}${r.pm}</td>
      <td style="color:${heatPurple(r.offrtg,   minOff,   maxOff)};font-weight:700">${fRtg(r.offrtg)}</td>
      <td style="color:${heatTeal(r.defrtg,     minDef,   maxDef)};font-weight:700">${fRtg(r.defrtg)}</td>
      <td style="color:${heatRedGreen(r.net,    minNet,   maxNet)};font-weight:700">${sign(r.net)}${fRtg(r.net)}</td>
      <td style="color:${heatPurple(r.fgpct,    minFgpct, maxFgpct)};font-weight:600">${fPct(r.fgpct)}</td>
      <td style="color:${heatPurple(r.fg3pct,   minFg3pct,maxFg3pct)};font-weight:600">${fPct(r.fg3pct)}</td>
      <td style="color:${heatPurple(r.ast100,   minAst100,maxAst100)};font-weight:600">${fPct(r.ast100)}</td>
      <td style="color:${heatTeal(r.tovpct,     minTov,   maxTov)};font-weight:600">${fPct(r.tovpct)}</td>
      <td style="color:${heatPurple(r.orebpct,  minOreb,  maxOreb)};font-weight:600">${fPct(r.orebpct)}</td>
      <td style="color:${heatTeal(r.drebpct,    minDreb,  maxDreb)};font-weight:600">${fPct(r.drebpct)}</td>
      <td style="color:${heatWhite(r.fg3rate,   minFg3r,  maxFg3r)};font-weight:600">${fPct(r.fg3rate)}</td>
      <td style="color:${heatPurple(r.ftr,      minFtr,   maxFtr)};font-weight:600">${fRat(r.ftr)}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// TRÍOS y DUPLAS
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
  { key: 'net',     label: 'Net',    align: 'right', tip: 'OffRtg − DefRtg' },
  { key: 'fgpct',   label: 'TC%',     align: 'right', tip: '% de tiros de campo convertidos atacando' },
  { key: 'fg3pct',  label: '3P%',     align: 'right', tip: '% de triples convertidos' },
  { key: 'ast100',  label: 'AST%',    align: 'right', tip: '% de canastas asistidas. AST / FGM × 100' },
  { key: 'tovpct',  label: 'TOV%',    align: 'right', tip: '% de posesiones terminadas en pérdida (menor = mejor)' },
  { key: 'orebpct', label: 'ORB%',    align: 'right', tip: '% de rebotes ofensivos disponibles capturados' },
  { key: 'drebpct', label: 'DReb%',   align: 'right', tip: '% de rebotes defensivos disponibles capturados' },
  { key: 'fg3rate', label: '3PA Rate',align: 'right', tip: '% de tiros que son intentos de triple' },
  { key: 'ftr',     label: 'FTr',     align: 'right', tip: 'Tiros libres intentados por tiro de campo (FTA / FGA)' },
];

function _renderSublineupTable(dataMap, teamSel, minMin, sortKey, sortDir, ids, leagueLabel) {
  const { emptyEl, loadingEl, contentEl, countEl, theadEl, tbodyEl } = ids;

  function lerpRgb(t, r1,g1,b1, r2,g2,b2) {
    return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
  }
  function heatRG(v,mn,mx){if(mn===mx)return'';const t=(v-mn)/(mx-mn);return t>=.5?lerpRgb((t-.5)*2,100,116,139,52,211,153):lerpRgb(t*2,248,113,113,100,116,139);}
  function heatPur(v,mn,mx){if(mn===mx)return'';return lerpRgb((v-mn)/(mx-mn),100,116,139,167,139,250);}
  function heatTeal(v,mn,mx){if(mn===mx)return'';return lerpRgb(1-(v-mn)/(mx-mn),100,116,139,94,234,212);}
  function heatWht(v,mn,mx){if(mn===mx)return'';return lerpRgb((v-mn)/(mx-mn),100,116,139,226,232,240);}
  const fRtg = v => v === 0 ? '—' : v.toFixed(1);
  const fPct = v => v === 0 ? '—' : v.toFixed(1) + '%';
  const fRat = v => v === 0 ? '—' : v.toFixed(2);
  const sign = v => v > 0 ? '+' : '';

  if (!teamSel) {
    // League-wide top 20
    let allRows = [];
    dataMap.forEach((tmap, teamName) => {
      tmap.forEach(v => {
        const row = _sublineupRowStats(v);
        if (row.min < minMin) return;
        allRows.push({ team: teamName, ...row });
      });
    });
    allRows.sort((a, b) => b.min - a.min);
    allRows = allRows.slice(0, 20);
    loadingEl.style.display = 'none'; emptyEl.style.display = 'none'; contentEl.style.display = '';
    countEl.textContent = 'Top 20 · liga';
    const vr = allRows.filter(r => r.poss > 0);
    const cr = key => { const vs=vr.map(r=>r[key]).filter(v=>v!==0); return vs.length?[Math.min(...vs),Math.max(...vs)]:[0,0]; };
    const [mnMin2,mxMin2]=cr('min'),[mnPos,mxPos]=cr('poss'),[mnPm,mxPm]=cr('pm'),
          [mnOff,mxOff]=cr('offrtg'),[mnDef,mxDef]=cr('defrtg'),[mnNet,mxNet]=cr('net'),
          [mnFg,mxFg]=cr('fgpct'),[mnFg3,mxFg3]=cr('fg3pct'),[mnAst,mxAst]=cr('ast100'),
          [mnTov,mxTov]=cr('tovpct'),[mnOreb,mxOreb]=cr('orebpct'),[mnDreb,mxDreb]=cr('drebpct'),
          [mnFg3r,mxFg3r]=cr('fg3rate'),[mnFtr,mxFtr]=cr('ftr');
    const LEAGUE_COLS = [{ key:'team', label:'Equipo', align:'left', tip:'Equipo al que pertenecen los jugadores' }, ...SUBLINEUP_COLS];
    theadEl.innerHTML = '<tr>' + LEAGUE_COLS.map(c => `<th class="qnt-th" style="text-align:${c.align}" data-tip="${c.tip}">${c.label}</th>`).join('') + '</tr>';
    tbodyEl.innerHTML = allRows.map((r, i) => {
      const ph = r.players.map(p => `<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
      return `<tr style="background:${i%2===0?'rgba(139,92,246,.04)':'rgba(255,255,255,.015)'}">
        <td><span style="display:flex;align-items:center;gap:5px">${teamLogoHtml(r.team)}${r.team}</span></td>
        <td><div class="qnt-players">${ph}</div></td>
        <td style="color:${heatWht(r.min,mnMin2,mxMin2)};font-weight:600">${r.min.toFixed(1)}</td>
        <td style="color:${heatWht(r.poss,mnPos,mxPos)};font-weight:600">${r.poss>0?Math.round(r.poss):'—'}</td>
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

  const tmap = dataMap.get(teamSel);
  if (!tmap || tmap.size === 0) {
    emptyEl.textContent = 'No hay datos de jugada a jugada para este equipo.';
    emptyEl.style.display = ''; contentEl.style.display = 'none'; loadingEl.style.display = 'none';
    countEl.textContent = ''; return;
  }

  let rows = [];
  tmap.forEach(v => {
    const row = _sublineupRowStats(v);
    if (row.min >= minMin) rows.push(row);
  });

  rows.sort((a, b) => {
    if (sortKey === 'players') {
      const cmp = a.players.join('').localeCompare(b.players.join(''));
      return sortDir === 'asc' ? cmp : -cmp;
    }
    return sortDir === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
  });

  loadingEl.style.display = 'none'; emptyEl.style.display = 'none'; contentEl.style.display = '';
  countEl.textContent = rows.length + ' ' + leagueLabel;

  const vr = rows.filter(r => r.poss > 0);
  const cr = key => { const vs=vr.map(r=>r[key]).filter(v=>v!==0); return vs.length?[Math.min(...vs),Math.max(...vs)]:[0,0]; };
  const [mnMin2,mxMin2]=cr('min'),[mnPos,mxPos]=cr('poss'),[mnPm,mxPm]=cr('pm'),
        [mnOff,mxOff]=cr('offrtg'),[mnDef,mxDef]=cr('defrtg'),[mnNet,mxNet]=cr('net'),
        [mnFg,mxFg]=cr('fgpct'),[mnFg3,mxFg3]=cr('fg3pct'),[mnAst,mxAst]=cr('ast100'),
        [mnTov,mxTov]=cr('tovpct'),[mnOreb,mxOreb]=cr('orebpct'),[mnDreb,mxDreb]=cr('drebpct'),
        [mnFg3r,mxFg3r]=cr('fg3rate'),[mnFtr,mxFtr]=cr('ftr');

  theadEl.innerHTML = '<tr>' + SUBLINEUP_COLS.map(c => {
    const sorted = c.key === sortKey;
    const arrow = sorted ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="qnt-th${sorted?' qnt-sorted':''}" style="text-align:${c.align}" onclick="${leagueLabel==='tríos'?'trioSortBy':'dupSortBy'}('${c.key}')" data-tip="${c.tip}">${c.label}${arrow}</th>`;
  }).join('') + '</tr>';

  if (!rows.length) {
    tbodyEl.innerHTML = `<tr><td colspan="${SUBLINEUP_COLS.length}" style="text-align:center;color:var(--muted);padding:32px">No hay ${leagueLabel} con ${minMin}+ minutos juntos.</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = rows.map((r, i) => {
    const ph = r.players.map(p => `<span class="qnt-player">${formatPlayerShort(p)}</span>`).join('');
    return `<tr style="background:${i%2===0?'rgba(139,92,246,.04)':'rgba(255,255,255,.015)'}">
      <td><div class="qnt-players">${ph}</div></td>
      <td style="color:${heatWht(r.min,mnMin2,mxMin2)};font-weight:600">${r.min.toFixed(1)}</td>
      <td style="color:${heatWht(r.poss,mnPos,mxPos)};font-weight:600">${r.poss>0?Math.round(r.poss):'—'}</td>
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
      emptyEl: document.getElementById('trioEmpty'),
      loadingEl: document.getElementById('trioLoading'),
      contentEl: document.getElementById('trioContent'),
      countEl: document.getElementById('trioCount'),
      theadEl: document.getElementById('trioThead'),
      tbodyEl: document.getElementById('trioTbody'),
    },
    'tríos'
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
      emptyEl: document.getElementById('dupEmpty'),
      loadingEl: document.getElementById('dupLoading'),
      contentEl: document.getElementById('dupContent'),
      countEl: document.getElementById('dupCount'),
      theadEl: document.getElementById('dupThead'),
      tbodyEl: document.getElementById('dupTbody'),
    },
    'duplas'
  );
}

// ============================================================
// CONEXIONES
// ============================================================
let _cnxData   = null;  // computed connection data for current selection
let _cnxNodes  = [];    // node positions for hit-test
let _cnxFilter = 'all'; // 'all' | 'given' | 'received'

function cnxInit() {
  const sel = document.getElementById('cnxTeam');
  if (sel.options.length > 1) return;
  [...new Set(TEAMS.map(t => t.Equipo))].sort().forEach(eq => {
    const o = document.createElement('option');
    o.value = eq; o.textContent = eq;
    sel.appendChild(o);
  });
}

async function onCnxTeamChange() {
  const team = document.getElementById('cnxTeam').value;
  const pSel = document.getElementById('cnxPlayer');
  pSel.innerHTML = '<option value="">Seleccioná un jugador</option>';
  pSel.disabled = true;
  document.getElementById('cnxContent').style.display = 'none';
  document.getElementById('cnxEmpty').style.display = '';
  _cnxData = null; _cnxNodes = []; _cnxFilter = 'all';
  const gEl = document.getElementById('cnxLegGiven'), rEl = document.getElementById('cnxLegReceived');
  if (gEl) { gEl.style.background = ''; gEl.style.opacity = '1'; }
  if (rEl) { rEl.style.background = ''; rEl.style.opacity = '1'; }
  if (!team) return;

  if (PBP_MAP === null) {
    document.getElementById('cnxLoading').style.display = '';
    document.getElementById('cnxEmpty').style.display = 'none';
    await loadPbp();
    document.getElementById('cnxLoading').style.display = 'none';
    document.getElementById('cnxEmpty').style.display = '';
  }
  if (LINEUP_DATA === null) computeLineups();

  PLAYERS
    .filter(p => p.Equipo === team)
    .sort((a, b) => b.PPG - a.PPG)
    .forEach(p => {
      const o = document.createElement('option');
      o.value = p['Nombre completo'];
      o.textContent = p['Nombre completo'];
      pSel.appendChild(o);
    });
  pSel.disabled = false;
}

function onCnxPlayerChange() {
  const team   = document.getElementById('cnxTeam').value;
  const player = document.getElementById('cnxPlayer').value;
  if (!team || !player) {
    document.getElementById('cnxContent').style.display = 'none';
    document.getElementById('cnxEmpty').style.display = '';
    return;
  }
  document.getElementById('cnxEmpty').style.display = 'none';
  document.getElementById('cnxContent').style.display = '';
  _cnxData = computeConnections(team, player);
  drawConnections();
}

function computeConnections(team, focusName) {
  const teamObj    = TEAMS.find(t => t.Equipo === team);
  const totalGames = teamObj ? teamObj.PJ : 1;

  // Build dorsal→PBP name map for this team (PBP names differ from stats CSV names)
  const dorsalToPbp = new Map(); // dorsal(int) → PBP Jugador name
  if (PBP_MAP) {
    PBP_MAP.forEach(events => {
      if (!events.length) return;
      const isLocal = events[0]['Equipo_local'] === team;
      const isVisit = events[0]['Equipo_visitante'] === team;
      if (!isLocal && !isVisit) return;
      const side = isLocal ? 'LOCAL' : 'VISITANTE';
      events.forEach(ev => {
        if (ev['Equipo_lado'] !== side) return;
        const d = ev['Dorsal'], j = ev['Jugador'];
        if (d && d !== 'None' && j && j !== 'None' && j !== '') {
          const dk = Math.round(parseFloat(d));
          if (!dorsalToPbp.has(dk)) dorsalToPbp.set(dk, j);
        }
      });
    });
  }

  // Map each stats-CSV player name to their PBP name via dorsal
  const teamPlayers = PLAYERS.filter(p => p.Equipo === team);
  const statsToPbp  = new Map(); // statsName → pbpName
  teamPlayers.forEach(p => {
    const dk     = Math.round(parseFloat(p.DORSAL) || 0);
    const pbpName = dorsalToPbp.get(dk) || p['Nombre completo'];
    statsToPbp.set(p['Nombre completo'], pbpName);
  });
  const focusPbp = statsToPbp.get(focusName) || focusName;

  // 1. Count assist pairs using PBP names
  const assistCounts = new Map(); // "pbpA→pbpB" → count
  if (PBP_MAP) {
    PBP_MAP.forEach(events => {
      if (!events.length) return;
      const localTeam = events[0]['Equipo_local'];
      const visitTeam = events[0]['Equipo_visitante'];
      const side = localTeam === team ? 'LOCAL' : (visitTeam === team ? 'VISITANTE' : null);
      if (!side) return;
      const sorted = [...events].sort((a, b) => parseInt(a['NumAccion']) - parseInt(b['NumAccion']));
      sorted.forEach((ev, i) => {
        if (ev['Tipo'] !== 'ASISTENCIA' || ev['Equipo_lado'] !== side) return;
        const assister = ev['Jugador']; if (!assister) return;
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prev = sorted[j];
          if ((prev['Tipo'] === 'CANASTA-2P' || prev['Tipo'] === 'CANASTA-3P') && prev['Equipo_lado'] === side) {
            const scorer = prev['Jugador']; if (!scorer) break;
            const key = assister + '\u2192' + scorer;
            assistCounts.set(key, (assistCounts.get(key) || 0) + 1);
            break;
          }
        }
      });
    });
  }

  // 2. Points/40 min together from LINEUP_DATA (uses PBP names in data.players)
  const teamLineupMap = LINEUP_DATA ? LINEUP_DATA.get(team) : null;
  const pairStats = new Map(); // "pbpA~pbpB" (sorted) → {pf, secs, games}
  if (teamLineupMap) {
    teamLineupMap.forEach(data => {
      if (!data.players.includes(focusPbp)) return;
      data.players.forEach(p => {
        if (p === focusPbp) return;
        const pairKey = [focusPbp, p].sort().join('~');
        if (!pairStats.has(pairKey)) pairStats.set(pairKey, { pf: 0, secs: 0, games: new Set() });
        const ps = pairStats.get(pairKey);
        ps.pf += data.pf; ps.secs += data.secs;
        data.games.forEach(g => ps.games.add(g));
      });
    });
  }

  // 3. Build connection objects (display with stats names, lookup with PBP names)
  const connections = teamPlayers
    .filter(p => p['Nombre completo'] !== focusName)
    .map(p => {
      const name    = p['Nombre completo'];
      const pbpName = statsToPbp.get(name) || name;
      const astGiven    = assistCounts.get(focusPbp + '\u2192' + pbpName) || 0;
      const astReceived = assistCounts.get(pbpName + '\u2192' + focusPbp) || 0;
      const totalAst    = astGiven + astReceived;
      const apg         = totalAst / totalGames;
      const pairKey     = [focusPbp, pbpName].sort().join('~');
      const ps          = pairStats.get(pairKey);
      const pts40       = ps && ps.secs > 0 ? (ps.pf / (ps.secs / 60)) * 40 : 0;
      const minTog      = ps && ps.games.size > 0 ? (ps.secs / 60) / ps.games.size : 0;
      const gamesTog    = ps ? ps.games.size : 0;
      return { name, apg, astGiven, astReceived, totalAst, pts40, minTog, gamesTog };
    })
    .filter(c => c.gamesTog > 0 || c.totalAst > 0);

  connections.sort((a, b) => (b.apg + b.pts40 / 10) - (a.apg + a.pts40 / 10));
  const focusApgGiven    = connections.reduce((s, c) => s + c.astGiven,    0) / totalGames;
  const focusApgReceived = connections.reduce((s, c) => s + c.astReceived, 0) / totalGames;
  return { focusName, team, totalGames, focusApgGiven, focusApgReceived, connections: connections.slice(0, 14) };
}

function _cnxLerpColor(t) {
  // t=0 → purple #8b5cf6, t=1 → teal #2dd4bf
  const r = Math.round(139 + t * (45  - 139));
  const g = Math.round(92  + t * (212 - 92));
  const b = Math.round(246 + t * (191 - 246));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawConnections() {
  if (!_cnxData) return;
  const svg = document.getElementById('cnxSvg');
  if (!svg) return;
  const wrap = svg.parentElement;
  const W = Math.min(wrap.clientWidth - 4, 780);
  const H = Math.max(Math.round(W * 0.78), 400);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const { focusName, connections, totalGames, focusApgGiven } = _cnxData;
  const cx = W / 2, cy = H / 2;
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  if (!connections.length) {
    svg.innerHTML = '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" fill="rgba(100,116,139,.7)" font-size="13" font-family="Inter,sans-serif">Sin datos suficientes para este jugador</text>';
    _cnxNodes = [];
    return;
  }

  const radius = Math.min(W, H) * 0.36;
  const focusR = 38, nodeR = 22;
  const PURPLE = '#8b5cf6', TEAL = '#2dd4bf';

  const allApg = connections.map(c =>
    _cnxFilter === 'given'    ? c.astGiven   / totalGames :
    _cnxFilter === 'received' ? c.astReceived / totalGames :
    c.apg
  ).filter(v => v > 0);
  const maxApg = allApg.length ? Math.max(...allApg) : 0.01;

  const n = connections.length;
  const nodes = connections.map((c, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r: nodeR, data: c };
  });
  _cnxNodes = [{ x: cx, y: cy, r: focusR, data: { name: focusName, isFocus: true } }, ...nodes];

  const f = v => v.toFixed(1);
  const apgLbl = (_cnxFilter === 'received' ? (_cnxData.focusApgReceived || 0) : (_cnxData.focusApgGiven || 0)).toFixed(1);

  let out = `<defs>
    <radialGradient id="cnxFG" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity=".95"/>
      <stop offset="100%" stop-color="#6d28d9" stop-opacity=".85"/>
    </radialGradient>
    <filter id="cnxShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000" flood-opacity=".45"/>
    </filter>
    <filter id="cnxGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="cnxArP" markerWidth="12" markerHeight="16" refX="11" refY="8" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0.5 L11,8 L0,15.5 L3,8 z" fill="${PURPLE}"/>
    </marker>
    <marker id="cnxArT" markerWidth="12" markerHeight="16" refX="11" refY="8" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0.5 L11,8 L0,15.5 L3,8 z" fill="${TEAL}"/>
    </marker>
  </defs>`;

  // Directed edges
  out += '<g>';
  nodes.forEach((nd) => {
    const c = nd.data;
    const givenApg = c.astGiven  / totalGames;
    const recvApg  = c.astReceived / totalGames;
    const showGiven = _cnxFilter !== 'received' && givenApg > 0.04;
    const showRecv  = _cnxFilter !== 'given'    && recvApg  > 0.04;
    if (!showGiven && !showRecv) return;

    const dx = nd.x - cx, dy = nd.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / dist, uy = dy / dist;
    const px = -uy, py = ux;  // perpendicular unit vector
    const hasBoth = showGiven && showRecv;
    const curve = hasBoth ? dist * 0.14 : 0;  // bezier curve bulge for bidirectional
    const midX = (cx + nd.x) / 2, midY = (cy + nd.y) / 2;

    // Helper: draw one directed arc
    // from (x1,y1) to (x2,y2), bowing in the direction of (qSign * px, qSign * py)
    const drawArc = (x1, y1, x2, y2, color, lw, qSign, apgVal) => {
      const markerId = `url(#cnxAr${color === PURPLE ? 'P' : 'T'})`;
      if (hasBoth) {
        const qx = midX + px * curve * qSign;
        const qy = midY + py * curve * qSign;
        out += `<path d="M${f(x1)},${f(y1)} Q${f(qx)},${f(qy)} ${f(x2)},${f(y2)}" fill="none" stroke="${color}" stroke-width="${lw}" opacity="0.88" marker-end="${markerId}"/>`;
      } else {
        out += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${lw}" stroke-linecap="round" opacity="0.88" marker-end="${markerId}"/>`;
      }
    };

    // Given: center → teammate (purple), bows to +perpendicular side
    if (showGiven) {
      const lw = (0.8 + (givenApg / maxApg) * 5.5).toFixed(1);
      drawArc(cx + ux*(focusR+1), cy + uy*(focusR+1), nd.x - ux*nodeR, nd.y - uy*nodeR, PURPLE, lw, 1, givenApg);
    }
    // Received: teammate → center (teal), bows to −perpendicular side
    if (showRecv) {
      const lw = (0.8 + (recvApg / maxApg) * 5.5).toFixed(1);
      drawArc(nd.x - ux*(nodeR+1), nd.y - uy*(nodeR+1), cx + ux*focusR, cy + uy*focusR, TEAL, lw, -1, recvApg);
    }
  });
  out += '</g>';

  // Teammate nodes
  out += '<g>';
  nodes.forEach((nd, idx) => {
    const c = nd.data;
    const givenApg = c.astGiven  / totalGames;
    const recvApg  = c.astReceived / totalGames;
    const col = _cnxFilter === 'received' ? TEAL : _cnxFilter === 'given' ? PURPLE : (givenApg >= recvApg ? PURPLE : TEAL);
    const apellido = esc(c.name.split(',')[0].trim());
    const lbl = apellido.length > 9 ? apellido.slice(0, 8) + '.' : apellido;
    const nodeApg = _cnxFilter === 'given' ? givenApg : _cnxFilter === 'received' ? recvApg : c.apg;
    const nodeColor = _cnxFilter === 'received' ? 'rgba(45,212,191,.85)' : 'rgba(167,139,250,.85)';
    const astLbl = nodeApg >= 0.08 ? nodeApg.toFixed(2) + ' ast' : '';
    const ndDx = nd.x - cx, ndDy = nd.y - cy, ndDist = Math.sqrt(ndDx*ndDx + ndDy*ndDy) || 1;
    const ndUx = ndDx / ndDist, ndUy = ndDy / ndDist;
    const lblX = nd.x + ndUx * (nodeR + 20), lblY = nd.y + ndUy * (nodeR + 20);
    out += `<g style="cursor:pointer" onmouseover="cnxShowTip(event,${idx+1})" onmouseout="cnxHideTip()">
      <circle cx="${f(nd.x)}" cy="${f(nd.y)}" r="${nodeR}" fill="#1f1f3a" stroke="${col}" stroke-width="2.5" filter="url(#cnxShadow)"/>
      <text x="${f(nd.x)}" y="${f(nd.y)}" text-anchor="middle" dominant-baseline="middle" fill="#e2e8f0" font-size="9" font-weight="600" font-family="Inter,sans-serif" pointer-events="none">${lbl}</text>
      ${astLbl ? `<text x="${f(lblX)}" y="${f(lblY)}" text-anchor="middle" dominant-baseline="middle" fill="${nodeColor}" font-size="8" font-family="Inter,sans-serif" pointer-events="none">${astLbl}</text>` : ''}
    </g>`;
  });
  out += '</g>';

  // Focus node
  const fApellido = esc(focusName.split(',')[0].trim());
  const fLbl = fApellido.length > 11 ? fApellido.slice(0, 10) + '.' : fApellido;
  out += `<g style="cursor:default" onmouseover="cnxShowTip(event,0)" onmouseout="cnxHideTip()">
    <circle cx="${f(cx)}" cy="${f(cy)}" r="${focusR}" fill="url(#cnxFG)" stroke="rgba(167,139,250,.7)" stroke-width="2" filter="url(#cnxGlow)"/>
    <text x="${f(cx)}" y="${f(cy - 7)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="10" font-weight="700" font-family="Inter,sans-serif" pointer-events="none">${fLbl}</text>
    <text x="${f(cx)}" y="${f(cy + 8)}" text-anchor="middle" dominant-baseline="middle" fill="rgba(221,214,254,.8)" font-size="9" font-weight="600" font-family="Inter,sans-serif" pointer-events="none">${apgLbl} ast/p</text>
  </g>`;

  svg.innerHTML = out;
}

function cnxShowTip(event, idx) {
  if (idx >= _cnxNodes.length) return;
  const c = _cnxNodes[idx].data;
  const svg = document.getElementById('cnxSvg');
  const tip = document.getElementById('cnxTooltip');
  let html = '<div class="cnx-tooltip-name">' + c.name + '</div>';
  if (c.isFocus) {
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label">AST dadas/partido</span><span class="cnx-tooltip-val">' + (_cnxData.focusApgGiven || 0).toFixed(2) + '</span></div>';
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label">AST recibidas/partido</span><span class="cnx-tooltip-val">' + (_cnxData.focusApgReceived || 0).toFixed(2) + '</span></div>';
  } else {
    const givenApg = (_cnxData && _cnxData.totalGames) ? (c.astGiven / _cnxData.totalGames).toFixed(2) : c.astGiven;
    const recvApg  = (_cnxData && _cnxData.totalGames) ? (c.astReceived / _cnxData.totalGames).toFixed(2) : c.astReceived;
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label" style="color:#a78bfa">→ AST dadas/partido</span><span class="cnx-tooltip-val">' + givenApg + '</span></div>';
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label" style="color:#5eead4">← AST recibidas/partido</span><span class="cnx-tooltip-val">' + recvApg + '</span></div>';
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label">PTS/40 min juntos</span><span class="cnx-tooltip-val">' + c.pts40.toFixed(1) + '</span></div>';
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label">Min/partido juntos</span><span class="cnx-tooltip-val">' + c.minTog.toFixed(1) + '</span></div>';
    html += '<div class="cnx-tooltip-row"><span class="cnx-tooltip-label">Partidos juntos</span><span class="cnx-tooltip-val">' + c.gamesTog + '</span></div>';
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  const rect = svg.getBoundingClientRect();
  const mx = event.clientX - rect.left, my = event.clientY - rect.top;
  const H = parseFloat(svg.getAttribute('height')) || 400;
  let tx = mx + 16, ty = my - 10;
  if (tx + 210 > svg.parentElement.clientWidth) tx = mx - 226;
  if (ty + 165 > H) ty = my - 175;
  if (ty < 0) ty = 4;
  tip.style.left = tx + 'px';
  tip.style.top  = ty + 'px';
}

function cnxHideTip() {
  const t = document.getElementById('cnxTooltip');
  if (t) t.style.display = 'none';
}

function cnxSetFilter(type) {
  _cnxFilter = (_cnxFilter === type) ? 'all' : type;
  const gEl = document.getElementById('cnxLegGiven');
  const rEl = document.getElementById('cnxLegReceived');
  if (gEl) gEl.style.background = (_cnxFilter === 'given')    ? 'rgba(139,92,246,.18)' : '';
  if (rEl) rEl.style.background = (_cnxFilter === 'received') ? 'rgba(45,212,191,.18)'  : '';
  if (gEl) gEl.style.opacity    = (_cnxFilter === 'received') ? '0.4' : '1';
  if (rEl) rEl.style.opacity    = (_cnxFilter === 'given')    ? '0.4' : '1';
  drawConnections();
}

// ============================================================
// CONEXIONES EQUIPO (t-conexiones)
// ============================================================
let _tCnxSort  = { col: 'apg', asc: false };
let _tCnxRows  = [];
let _tCnxCheck = { pbpAst: 0, csvAst: 0 };

function tCnxInit() {
  const sel = document.getElementById('tCnxTeam');
  if (sel.options.length > 1) return;
  [...new Set(TEAMS.map(t => t.Equipo))].sort().forEach(eq => {
    const o = document.createElement('option');
    o.value = eq; o.textContent = eq;
    sel.appendChild(o);
  });
}

async function onTCnxTeamChange() {
  const team = document.getElementById('tCnxTeam').value;
  document.getElementById('tCnxContent').style.display = 'none';
  document.getElementById('tCnxEmpty').style.display = '';
  _tCnxRows = [];
  if (!team) return;

  if (PBP_MAP === null) {
    document.getElementById('tCnxLoading').style.display = '';
    document.getElementById('tCnxEmpty').style.display = 'none';
    await loadPbp();
    document.getElementById('tCnxLoading').style.display = 'none';
    document.getElementById('tCnxEmpty').style.display = '';
  }
  if (LINEUP_DATA === null) computeLineups();

  const result = computeTeamConnections(team);
  _tCnxRows  = result.rows;
  _tCnxCheck = { pbpAst: result.pbpAst, csvAst: result.csvAst };
  if (!_tCnxRows.length) return;
  document.getElementById('tCnxEmpty').style.display = 'none';
  document.getElementById('tCnxContent').style.display = '';
  _tCnxSort = { col: 'apg', asc: false };
  renderTCnxTable();
}

function computeTeamConnections(team) {
  const teamObj    = TEAMS.find(t => t.Equipo === team);
  const totalGames = teamObj ? teamObj.PJ : 1;
  const csvAst     = teamObj ? (teamObj.AST || 0) : 0;

  // Build dorsal→PBP name map
  const dorsalToPbp = new Map();
  if (PBP_MAP) {
    PBP_MAP.forEach(events => {
      if (!events.length) return;
      const isLocal = events[0]['Equipo_local'] === team;
      const isVisit = events[0]['Equipo_visitante'] === team;
      if (!isLocal && !isVisit) return;
      const side = isLocal ? 'LOCAL' : 'VISITANTE';
      events.forEach(ev => {
        if (ev['Equipo_lado'] !== side) return;
        const d = ev['Dorsal'], j = ev['Jugador'];
        if (d && d !== 'None' && j && j !== 'None' && j !== '') {
          const dk = Math.round(parseFloat(d));
          if (!dorsalToPbp.has(dk)) dorsalToPbp.set(dk, j);
        }
      });
    });
  }

  // Map stats name → PBP name via dorsal
  const teamPlayers = PLAYERS.filter(p => p.Equipo === team);
  const statsToPbp  = new Map();
  const pbpToStats  = new Map();
  teamPlayers.forEach(p => {
    const dk      = Math.round(parseFloat(p.DORSAL) || 0);
    const pbpName = dorsalToPbp.get(dk) || p['Nombre completo'];
    statsToPbp.set(p['Nombre completo'], pbpName);
    pbpToStats.set(pbpName, p['Nombre completo']);
  });

  // Count assist pairs from PBP
  const assistCounts = new Map(); // "pbpA→pbpB" → count
  let pbpAst = 0; // total matched assists (with basket found)
  if (PBP_MAP) {
    PBP_MAP.forEach(events => {
      if (!events.length) return;
      const localTeam = events[0]['Equipo_local'];
      const visitTeam = events[0]['Equipo_visitante'];
      const side = localTeam === team ? 'LOCAL' : (visitTeam === team ? 'VISITANTE' : null);
      if (!side) return;
      const sorted = [...events].sort((a, b) => parseInt(a['NumAccion']) - parseInt(b['NumAccion']));
      sorted.forEach((ev, i) => {
        if (ev['Tipo'] !== 'ASISTENCIA' || ev['Equipo_lado'] !== side) return;
        const assister = ev['Jugador']; if (!assister) return;
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prev = sorted[j];
          if ((prev['Tipo'] === 'CANASTA-2P' || prev['Tipo'] === 'CANASTA-3P') && prev['Equipo_lado'] === side) {
            const scorer = prev['Jugador']; if (!scorer) break;
            const key = assister + '\u2192' + scorer;
            assistCounts.set(key, (assistCounts.get(key) || 0) + 1);
            pbpAst++;
            break;
          }
        }
      });
    });
  }

  // Collect pair stats from LINEUP_DATA
  const teamLineupMap = LINEUP_DATA ? LINEUP_DATA.get(team) : null;
  const pairStats = new Map(); // "pbpA~pbpB" (sorted) → {pf, secs, games}
  if (teamLineupMap) {
    teamLineupMap.forEach(data => {
      const players = data.players;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const pairKey = [players[i], players[j]].sort().join('~');
          if (!pairStats.has(pairKey)) pairStats.set(pairKey, { pf: 0, secs: 0, games: new Set() });
          const ps = pairStats.get(pairKey);
          ps.pf += data.pf; ps.secs += data.secs;
          data.games.forEach(g => ps.games.add(g));
        }
      }
    });
  }

  // Build all unique pairs
  const rows = [];
  for (let i = 0; i < teamPlayers.length; i++) {
    for (let j = i + 1; j < teamPlayers.length; j++) {
      const pA      = teamPlayers[i];
      const pB      = teamPlayers[j];
      const pbpA    = statsToPbp.get(pA['Nombre completo']) || pA['Nombre completo'];
      const pbpB    = statsToPbp.get(pB['Nombre completo']) || pB['Nombre completo'];
      const astAtoB = assistCounts.get(pbpA + '\u2192' + pbpB) || 0;
      const astBtoA = assistCounts.get(pbpB + '\u2192' + pbpA) || 0;
      const totalAst = astAtoB + astBtoA;
      const pairKey = [pbpA, pbpB].sort().join('~');
      const ps      = pairStats.get(pairKey);
      const gamesTog = ps ? ps.games.size : 0;
      const secs    = ps ? ps.secs : 0;
      const pf      = ps ? ps.pf : 0;
      const apg     = totalAst / totalGames;
      const minTog  = gamesTog > 0 ? (secs / 60) / gamesTog : 0;
      const pts40   = secs > 0 ? (pf / (secs / 60)) * 40 : 0;
      if (totalAst === 0 && gamesTog === 0) continue;
      rows.push({
        nameA: pA['Nombre completo'], nameB: pB['Nombre completo'],
        astAtoB, astBtoA, totalAst, apg, gamesTog, minTog, pts40
      });
    }
  }

  rows.sort((a, b) => b.apg - a.apg);
  return { rows: rows.slice(0, 10), pbpAst, csvAst };
}

function onTCnxSort(col) {
  if (_tCnxSort.col === col) {
    _tCnxSort.asc = !_tCnxSort.asc;
  } else {
    _tCnxSort = { col, asc: false };
  }
  renderTCnxTable();
}

function renderTCnxTable() {
  // Data quality check badge
  const { pbpAst, csvAst } = _tCnxCheck;
  const checkEl = document.getElementById('tCnxCheck');
  if (checkEl && csvAst > 0) {
    const pct = Math.round(pbpAst / csvAst * 100);
    const ok  = pct >= 90;
    const warn = pct >= 70 && pct < 90;
    const color = ok ? 'var(--teal-l)' : warn ? '#f59e0b' : '#f87171';
    const icon  = ok ? '✓' : '⚠';
    checkEl.innerHTML =
      `<span style="color:${color};font-weight:600">${icon} Cobertura PBP:</span>` +
      `<span>${pbpAst} de ${csvAst} AST del box score detectadas en jugada a jugada (${pct}%)</span>`;
  } else if (checkEl) {
    checkEl.innerHTML = '';
  }

  const { col, asc } = _tCnxSort;
  const sorted = [..._tCnxRows].sort((a, b) => {
    const va = a[col], vb = b[col];
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return asc ? va - vb : vb - va;
  });

  const cols = [
    { key: 'nameA',    label: 'Jugador A',       fmt: v => v,                    title: 'Jugador que da o recibe asistencias' },
    { key: 'nameB',    label: 'Jugador B',        fmt: v => v,                    title: 'Jugador que da o recibe asistencias' },
    { key: 'astAtoB',  label: 'AST A→B',          fmt: v => v,                    title: 'Asistencias de A a B en toda la temporada' },
    { key: 'astBtoA',  label: 'AST B→A',          fmt: v => v,                    title: 'Asistencias de B a A en toda la temporada' },
    { key: 'totalAst', label: 'Total AST',        fmt: v => v,                    title: 'Total de asistencias entre ambos jugadores' },
    { key: 'apg',      label: 'AST/Partido',      fmt: v => v.toFixed(2),         title: 'Asistencias totales entre la dupla por partido de equipo' },
    { key: 'gamesTog', label: 'PJ juntos',        fmt: v => v,                    title: 'Partidos en que ambos jugaron juntos' },
    { key: 'minTog',   label: 'Min/PJ juntos',    fmt: v => v.toFixed(1),         title: 'Minutos promedio por partido jugando juntos' },
    { key: 'pts40',    label: 'PTS/40 juntos',    fmt: v => v.toFixed(1),         title: 'Puntos del equipo por 40 minutos jugando juntos' },
  ];

  const arrow = c => c === col ? (asc ? ' ↑' : ' ↓') : '';
  const thead = document.getElementById('tCnxThead');
  thead.innerHTML = '<tr>' + cols.map(c =>
    `<th style="cursor:pointer;white-space:nowrap" data-tip="${c.title}" onclick="onTCnxSort('${c.key}')">${c.label}${arrow(c.key)}</th>`
  ).join('') + '</tr>';

  const tbody = document.getElementById('tCnxTbody');
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="' + cols.length + '" style="text-align:center;color:var(--muted);padding:24px">Sin datos suficientes</td></tr>';
    return;
  }
  tbody.innerHTML = sorted.map((row, idx) =>
    '<tr>' + cols.map(c => {
      const v = row[c.key];
      const display = c.fmt(v);
      // Color APG column by value
      let style = '';
      if (c.key === 'apg' && typeof v === 'number') {
        const maxApg = Math.max(..._tCnxRows.map(r => r.apg), 0.01);
        const t = v / maxApg;
        const r2 = Math.round(139 + t * (45  - 139));
        const g2 = Math.round(92  + t * (212 - 92));
        const b2 = Math.round(246 + t * (191 - 246));
        style = ` style="color:rgb(${r2},${g2},${b2});font-weight:600"`;
      }
      return `<td${style}>${display}</td>`;
    }).join('') + '</tr>'
  ).join('');
}

function updateTFilterVisibility(){
  const chain=[
    {rowId:'tFilterRow2',triggerId:'tAttr', resetAttr:'tAttr2',resetVal:'tAttrVal2'},
    {rowId:'tFilterRow3',triggerId:'tAttr2',resetAttr:'tAttr3',resetVal:'tAttrVal3'},
    {rowId:'tFilterRow4',triggerId:'tAttr3',resetAttr:'tAttr4',resetVal:'tAttrVal4'},
  ];
  let canShow=true;
  chain.forEach(({rowId,triggerId,resetAttr,resetVal})=>{
    const trigger=document.getElementById(triggerId);
    const row=document.getElementById(rowId);
    if(canShow && trigger.value!==''){
      row.style.display='grid';
    } else {
      row.style.display='none';
      canShow=false;
      document.getElementById(resetAttr).value='';
      document.getElementById(resetVal).value='';
    }
  });
}

// ── RADAR ────────────────────────────────────────────────────────────────────
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

