// docs/shared/common.js
// Funciones byte-identicas compartidas entre las 4 ligas (Argentina, Nacional, Femenina, Desarrollo).
// Generado extrayendo funciones 100% identicas de los 4 *.js de liga — no editar a mano sin volver a verificar
// contra los 4 archivos de liga. Debe cargarse ANTES del <script> especifico de cada liga.

// ── Utilidades base (CSV, edad) ──
function calcAge(dob) {
  if (!dob) return null;
  const [d, m, y] = dob.split('/');
  const birth = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

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

// ── Jugadores — tabla ──
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

function openGroup(group, defaultSection) {
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.remove('active','grp-active'));
  const grpBtn = document.getElementById(group==='equipos'?'grpEquipos':'grpJugadores');
  grpBtn.classList.add('active','grp-active');
  document.getElementById('subEquipos').style.display = group==='equipos' ? '' : 'none';
  document.getElementById('subJugadores').style.display = group==='jugadores' ? '' : 'none';
  switchSection(defaultSection);
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

function setJPeriod(period) {
  jPeriod=period;
  ['jPeriodAll','jPeriodL5','jPeriodL10'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'jPeriodAll',last5:'jPeriodL5',last10:'jPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  renderJTable();
}

function setJLocVis(v) {
  jLocVis=v;
  ['jLocVisAll','jLocVisLocal','jLocVisVisit'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'jLocVisAll',local:'jLocVisLocal',visit:'jLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  renderJTable();
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

// ── Equipos — tabla ──
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

function setTPeriod(period) {
  tPeriod=period;
  ['tPeriodAll','tPeriodL5','tPeriodL10'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'tPeriodAll',last5:'tPeriodL5',last10:'tPeriodL10'};
  document.getElementById(map[period]).classList.add('active');
  renderTTable();
}

function setTLocVis(v) {
  tLocVis=v;
  ['tLocVisAll','tLocVisLocal','tLocVisVisit'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const map={all:'tLocVisAll',local:'tLocVisLocal',visit:'tLocVisVisit'};
  document.getElementById(map[v]).classList.add('active');
  renderTTable();
}

function renderTTable() {
  if(document.getElementById('tCardAdv')&&document.getElementById('tCardAdv').style.display!=='none'){renderTAdvTable();}
  let rows=[...tFiltered];
  rows.sort((a,b)=>{
    let av,bv;
    if(tSort==='KM'){av=a.KM==null?-1:a.KM;bv=b.KM==null?-1:b.KM;}
    else{const ad=getTeamData(a),bd=getTeamData(b);av=ad[tSort];bv=bd[tSort];}
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
    tr.innerHTML=`<td class="rank-cell">${i+1}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${indicator}${teamLogoHtml(t.Equipo)}<span class="team-name-link" onclick="event.stopPropagation();showTeamGames('${t.Equipo.replace(/'/g,"\\'")}')">${t.Equipo}</span></span></td>
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
      <td class="${d.VALPG>=0?'val-pos':'val-neg'}">${f2(d.VALPG)}</td>
      <td class="km-cell">${t.KM!=null?t.KM.toLocaleString('es-AR'):'—'}</td>`;
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
    tr.innerHTML=`<td class="rank-cell">${i+1}</td><td style="background:var(--bg)"><span style="display:flex;align-items:center;gap:5px">${indicator}${teamLogoHtml(t.Equipo)}<span class="team-name-link" onclick="event.stopPropagation();showTeamGames('${t.Equipo.replace(/'/g,"\\'")}')">${t.Equipo}</span></span></td>
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

// ── Comparar — scatter plots (jugadores y equipos) ──
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

// ── Scroll sync / helpers UI ──
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

// ── KM recorridos (giras) ──────────────────────────────────
// CITY_COORDS: coordenadas del centro de cada ciudad sede (40 ciudades,
// Liga Argentina + Liga Nacional, obtenidas con investigación dirigida
// septiembre 2026 — ver CLAUDE.md sección "KM recorridos" para el detalle
// de casos ambiguos). CITY_DIST_KM: matriz de distancia real por ruta
// (no línea recta) entre esas 40 ciudades, en km redondeados, obtenida en
// una sola consulta al OSRM Table Service (router.project-osrm.org,
// perfil "driving") — generada una vez y congelada acá como dato estático,
// no se vuelve a pedir en cada carga de página. Clave de CITY_DIST_KM:
// las dos ciudades ordenadas alfabéticamente y unidas con "|" (getRouteKm
// arma esa clave, no hace falta buscar ambos órdenes).
const CITY_COORDS = {
  'La Rioja': {lat:-29.4131, lon:-66.8558},
  'Córdoba': {lat:-31.4201, lon:-64.1888},
  'Colonia Caroya': {lat:-31.1667, lon:-63.9667},
  'Santa Fe': {lat:-31.6333, lon:-60.7},
  'Mercedes': {lat:-34.65, lon:-59.4333},
  'San Miguel de Tucumán': {lat:-26.8241, lon:-65.2226},
  'Las Heras': {lat:-32.85, lon:-68.8228},
  'Santiago del Estero': {lat:-27.7834, lon:-64.2642},
  'San Salvador de Jujuy': {lat:-24.1858, lon:-65.2995},
  'Rivadavia': {lat:-33.1833, lon:-68.4667},
  'Salta': {lat:-24.7859, lon:-65.4117},
  'San Francisco': {lat:-31.4287, lon:-62.0836},
  'Gálvez': {lat:-32.0333, lon:-61.3667},
  'Suardi': {lat:-30.1833, lon:-61.9333},
  'Resistencia': {lat:-27.4514, lon:-58.9867},
  'Venado Tuerto': {lat:-33.75, lon:-61.9667},
  'Gualeguaychú': {lat:-33.0094, lon:-58.5172},
  'Junín': {lat:-34.5833, lon:-60.95},
  'Armstrong': {lat:-32.7833, lon:-61.6},
  'Viedma': {lat:-40.8135, lon:-62.9967},
  'El Talar (Tigre)': {lat:-34.4833, lon:-58.6667},
  'La Plata': {lat:-34.9215, lon:-57.9545},
  'Lanús': {lat:-34.7061, lon:-58.3931},
  'Colón': {lat:-32.2222, lon:-58.14},
  'Pergamino': {lat:-33.8969, lon:-60.5717},
  'General Pico': {lat:-35.6667, lon:-63.75},
  'Rosario': {lat:-32.9468, lon:-60.6393},
  'Mar del Plata': {lat:-38.0055, lon:-57.5426},
  'Avellaneda': {lat:-34.6626, lon:-58.3652},
  'Concepción del Uruguay': {lat:-32.4833, lon:-58.2333},
  'Bahía Blanca': {lat:-38.7183, lon:-62.2663},
  'Comodoro Rivadavia': {lat:-45.8641, lon:-67.4966},
  'Oliva': {lat:-32.0333, lon:-63.5667},
  'Formosa': {lat:-26.1849, lon:-58.1731},
  'Oberá': {lat:-27.4876, lon:-55.1199},
  'Corrientes': {lat:-27.4692, lon:-58.8306},
  'Buenos Aires (CABA)': {lat:-34.6037, lon:-58.3816},
  'La Banda': {lat:-27.7333, lon:-64.2333},
  'Vicente López': {lat:-34.5267, lon:-58.4726},
  'Chivilcoy': {lat:-34.8167, lon:-60.0167},
};const CITY_DIST_KM = {
  'Córdoba|La Rioja': 465,
  'Colonia Caroya|La Rioja': 441,
  'La Rioja|Santa Fe': 800,
  'La Rioja|Mercedes': 1104,
  'La Rioja|San Miguel de Tucumán': 377,
  'La Rioja|Las Heras': 602,
  'La Rioja|Santiago del Estero': 385,
  'La Rioja|San Salvador de Jujuy': 714,
  'La Rioja|Rivadavia': 736,
  'La Rioja|Salta': 684,
  'La Rioja|San Francisco': 646,
  'Gálvez|La Rioja': 805,
  'La Rioja|Suardi': 691,
  'La Rioja|Resistencia': 995,
  'La Rioja|Venado Tuerto': 853,
  'Gualeguaychú|La Rioja': 1111,
  'Junín|La Rioja': 1026,
  'Armstrong|La Rioja': 773,
  'La Rioja|Viedma': 1596,
  'El Talar (Tigre)|La Rioja': 1122,
  'La Plata|La Rioja': 1211,
  'La Rioja|Lanús': 1166,
  'Colón|La Rioja': 1156,
  'La Rioja|Pergamino': 936,
  'General Pico|La Rioja': 900,
  'La Rioja|Rosario': 863,
  'La Rioja|Mar del Plata': 1567,
  'Avellaneda|La Rioja': 1161,
  'Concepción del Uruguay|La Rioja': 1127,
  'Bahía Blanca|La Rioja': 1343,
  'Comodoro Rivadavia|La Rioja': 2219,
  'La Rioja|Oliva': 558,
  'Formosa|La Rioja': 1149,
  'La Rioja|Oberá': 1413,
  'Corrientes|La Rioja': 1010,
  'Buenos Aires (CABA)|La Rioja': 1153,
  'La Banda|La Rioja': 393,
  'La Rioja|Vicente López': 1143,
  'Chivilcoy|La Rioja': 1120,
  'Colonia Caroya|Córdoba': 46,
  'Córdoba|Santa Fe': 363,
  'Córdoba|Mercedes': 646,
  'Córdoba|San Miguel de Tucumán': 557,
  'Córdoba|Las Heras': 691,
  'Córdoba|Santiago del Estero': 436,
  'Córdoba|San Salvador de Jujuy': 896,
  'Córdoba|Rivadavia': 648,
  'Córdoba|Salta': 866,
  'Córdoba|San Francisco': 217,
  'Córdoba|Gálvez': 368,
  'Córdoba|Suardi': 343,
  'Córdoba|Resistencia': 901,
  'Córdoba|Venado Tuerto': 395,
  'Córdoba|Gualeguaychú': 653,
  'Córdoba|Junín': 568,
  'Armstrong|Córdoba': 316,
  'Córdoba|Viedma': 1189,
  'Córdoba|El Talar (Tigre)': 664,
  'Córdoba|La Plata': 753,
  'Córdoba|Lanús': 708,
  'Colón|Córdoba': 698,
  'Córdoba|Pergamino': 479,
  'Córdoba|General Pico': 530,
  'Córdoba|Rosario': 406,
  'Córdoba|Mar del Plata': 1109,
  'Avellaneda|Córdoba': 703,
  'Concepción del Uruguay|Córdoba': 669,
  'Bahía Blanca|Córdoba': 936,
  'Comodoro Rivadavia|Córdoba': 1809,
  'Córdoba|Oliva': 101,
  'Córdoba|Formosa': 1068,
  'Córdoba|Oberá': 1169,
  'Corrientes|Córdoba': 921,
  'Buenos Aires (CABA)|Córdoba': 696,
  'Córdoba|La Banda': 443,
  'Córdoba|Vicente López': 686,
  'Chivilcoy|Córdoba': 662,
  'Colonia Caroya|Santa Fe': 361,
  'Colonia Caroya|Mercedes': 681,
  'Colonia Caroya|San Miguel de Tucumán': 532,
  'Colonia Caroya|Las Heras': 702,
  'Colonia Caroya|Santiago del Estero': 410,
  'Colonia Caroya|San Salvador de Jujuy': 870,
  'Colonia Caroya|Rivadavia': 658,
  'Colonia Caroya|Salta': 840,
  'Colonia Caroya|San Francisco': 216,
  'Colonia Caroya|Gálvez': 367,
  'Colonia Caroya|Suardi': 341,
  'Colonia Caroya|Resistencia': 900,
  'Colonia Caroya|Venado Tuerto': 431,
  'Colonia Caroya|Gualeguaychú': 689,
  'Colonia Caroya|Junín': 603,
  'Armstrong|Colonia Caroya': 351,
  'Colonia Caroya|Viedma': 1241,
  'Colonia Caroya|El Talar (Tigre)': 699,
  'Colonia Caroya|La Plata': 789,
  'Colonia Caroya|Lanús': 743,
  'Colonia Caroya|Colón': 734,
  'Colonia Caroya|Pergamino': 514,
  'Colonia Caroya|General Pico': 581,
  'Colonia Caroya|Rosario': 441,
  'Colonia Caroya|Mar del Plata': 1145,
  'Avellaneda|Colonia Caroya': 738,
  'Colonia Caroya|Concepción del Uruguay': 704,
  'Bahía Blanca|Colonia Caroya': 990,
  'Colonia Caroya|Comodoro Rivadavia': 1861,
  'Colonia Caroya|Oliva': 136,
  'Colonia Caroya|Formosa': 1066,
  'Colonia Caroya|Oberá': 1168,
  'Colonia Caroya|Corrientes': 920,
  'Buenos Aires (CABA)|Colonia Caroya': 731,
  'Colonia Caroya|La Banda': 418,
  'Colonia Caroya|Vicente López': 721,
  'Chivilcoy|Colonia Caroya': 697,
  'Mercedes|Santa Fe': 416,
  'San Miguel de Tucumán|Santa Fe': 789,
  'Las Heras|Santa Fe': 912,
  'Santa Fe|Santiago del Estero': 629,
  'San Salvador de Jujuy|Santa Fe': 1072,
  'Rivadavia|Santa Fe': 869,
  'Salta|Santa Fe': 1042,
  'San Francisco|Santa Fe': 141,
  'Gálvez|Santa Fe': 104,
  'Santa Fe|Suardi': 263,
  'Resistencia|Santa Fe': 546,
  'Santa Fe|Venado Tuerto': 322,
  'Gualeguaychú|Santa Fe': 313,
  'Junín|Santa Fe': 392,
  'Armstrong|Santa Fe': 257,
  'Santa Fe|Viedma': 1207,
  'El Talar (Tigre)|Santa Fe': 434,
  'La Plata|Santa Fe': 524,
  'Lanús|Santa Fe': 478,
  'Colón|Santa Fe': 319,
  'Pergamino|Santa Fe': 304,
  'General Pico|Santa Fe': 637,
  'Rosario|Santa Fe': 171,
  'Mar del Plata|Santa Fe': 880,
  'Avellaneda|Santa Fe': 473,
  'Concepción del Uruguay|Santa Fe': 289,
  'Bahía Blanca|Santa Fe': 939,
  'Comodoro Rivadavia|Santa Fe': 2023,
  'Oliva|Santa Fe': 346,
  'Formosa|Santa Fe': 712,
  'Oberá|Santa Fe': 807,
  'Corrientes|Santa Fe': 566,
  'Buenos Aires (CABA)|Santa Fe': 466,
  'La Banda|Santa Fe': 626,
  'Santa Fe|Vicente López': 456,
  'Chivilcoy|Santa Fe': 432,
  'Mercedes|San Miguel de Tucumán': 1159,
  'Las Heras|Mercedes': 960,
  'Mercedes|Santiago del Estero': 998,
  'Mercedes|San Salvador de Jujuy': 1442,
  'Mercedes|Rivadavia': 917,
  'Mercedes|Salta': 1412,
  'Mercedes|San Francisco': 511,
  'Gálvez|Mercedes': 395,
  'Mercedes|Suardi': 633,
  'Mercedes|Resistencia': 943,
  'Mercedes|Venado Tuerto': 303,
  'Gualeguaychú|Mercedes': 240,
  'Junín|Mercedes': 172,
  'Armstrong|Mercedes': 339,
  'Mercedes|Viedma': 881,
  'El Talar (Tigre)|Mercedes': 84,
  'La Plata|Mercedes': 159,
  'Lanús|Mercedes': 106,
  'Colón|Mercedes': 334,
  'Mercedes|Pergamino': 161,
  'General Pico|Mercedes': 496,
  'Mercedes|Rosario': 252,
  'Mar del Plata|Mercedes': 464,
  'Avellaneda|Mercedes': 109,
  'Concepción del Uruguay|Mercedes': 305,
  'Bahía Blanca|Mercedes': 613,
  'Comodoro Rivadavia|Mercedes': 1697,
  'Mercedes|Oliva': 554,
  'Formosa|Mercedes': 1111,
  'Mercedes|Oberá': 1038,
  'Corrientes|Mercedes': 925,
  'Buenos Aires (CABA)|Mercedes': 106,
  'La Banda|Mercedes': 996,
  'Mercedes|Vicente López': 104,
  'Chivilcoy|Mercedes': 70,
  'Las Heras|San Miguel de Tucumán': 955,
  'San Miguel de Tucumán|Santiago del Estero': 160,
  'San Miguel de Tucumán|San Salvador de Jujuy': 335,
  'Rivadavia|San Miguel de Tucumán': 1071,
  'Salta|San Miguel de Tucumán': 305,
  'San Francisco|San Miguel de Tucumán': 702,
  'Gálvez|San Miguel de Tucumán': 793,
  'San Miguel de Tucumán|Suardi': 568,
  'Resistencia|San Miguel de Tucumán': 768,
  'San Miguel de Tucumán|Venado Tuerto': 946,
  'Gualeguaychú|San Miguel de Tucumán': 1100,
  'Junín|San Miguel de Tucumán': 1119,
  'Armstrong|San Miguel de Tucumán': 866,
  'San Miguel de Tucumán|Viedma': 1754,
  'El Talar (Tigre)|San Miguel de Tucumán': 1176,
  'La Plata|San Miguel de Tucumán': 1265,
  'Lanús|San Miguel de Tucumán': 1220,
  'Colón|San Miguel de Tucumán': 1106,
  'Pergamino|San Miguel de Tucumán': 1029,
  'General Pico|San Miguel de Tucumán': 1095,
  'Rosario|San Miguel de Tucumán': 913,
  'Mar del Plata|San Miguel de Tucumán': 1621,
  'Avellaneda|San Miguel de Tucumán': 1215,
  'Concepción del Uruguay|San Miguel de Tucumán': 1076,
  'Bahía Blanca|San Miguel de Tucumán': 1501,
  'Comodoro Rivadavia|San Miguel de Tucumán': 2374,
  'Oliva|San Miguel de Tucumán': 651,
  'Formosa|San Miguel de Tucumán': 923,
  'Oberá|San Miguel de Tucumán': 1187,
  'Corrientes|San Miguel de Tucumán': 783,
  'Buenos Aires (CABA)|San Miguel de Tucumán': 1207,
  'La Banda|San Miguel de Tucumán': 164,
  'San Miguel de Tucumán|Vicente López': 1197,
  'Chivilcoy|San Miguel de Tucumán': 1174,
  'Las Heras|Santiago del Estero': 887,
  'Las Heras|San Salvador de Jujuy': 1297,
  'Las Heras|Rivadavia': 62,
  'Las Heras|Salta': 1267,
  'Las Heras|San Francisco': 778,
  'Gálvez|Las Heras': 840,
  'Las Heras|Suardi': 925,
  'Las Heras|Resistencia': 1453,
  'Las Heras|Venado Tuerto': 729,
  'Gualeguaychú|Las Heras': 1123,
  'Junín|Las Heras': 794,
  'Armstrong|Las Heras': 786,
  'Las Heras|Viedma': 1256,
  'El Talar (Tigre)|Las Heras': 1064,
  'La Plata|Las Heras': 1109,
  'Lanús|Las Heras': 1056,
  'Colón|Las Heras': 1168,
  'Las Heras|Pergamino': 871,
  'General Pico|Las Heras': 687,
  'Las Heras|Rosario': 876,
  'Las Heras|Mar del Plata': 1354,
  'Avellaneda|Las Heras': 1059,
  'Concepción del Uruguay|Las Heras': 1139,
  'Bahía Blanca|Las Heras': 1031,
  'Comodoro Rivadavia|Las Heras': 1803,
  'Las Heras|Oliva': 650,
  'Formosa|Las Heras': 1620,
  'Las Heras|Oberá': 1824,
  'Corrientes|Las Heras': 1473,
  'Buenos Aires (CABA)|Las Heras': 1097,
  'La Banda|Las Heras': 895,
  'Las Heras|Vicente López': 1087,
  'Chivilcoy|Las Heras': 899,
  'San Salvador de Jujuy|Santiago del Estero': 461,
  'Rivadavia|Santiago del Estero': 1002,
  'Salta|Santiago del Estero': 431,
  'San Francisco|Santiago del Estero': 543,
  'Gálvez|Santiago del Estero': 634,
  'Santiago del Estero|Suardi': 409,
  'Resistencia|Santiago del Estero': 610,
  'Santiago del Estero|Venado Tuerto': 822,
  'Gualeguaychú|Santiago del Estero': 941,
  'Junín|Santiago del Estero': 974,
  'Armstrong|Santiago del Estero': 742,
  'Santiago del Estero|Viedma': 1630,
  'El Talar (Tigre)|Santiago del Estero': 1017,
  'La Plata|Santiago del Estero': 1106,
  'Lanús|Santiago del Estero': 1061,
  'Colón|Santiago del Estero': 947,
  'Pergamino|Santiago del Estero': 887,
  'General Pico|Santiago del Estero': 971,
  'Rosario|Santiago del Estero': 754,
  'Mar del Plata|Santiago del Estero': 1463,
  'Avellaneda|Santiago del Estero': 1056,
  'Concepción del Uruguay|Santiago del Estero': 918,
  'Bahía Blanca|Santiago del Estero': 1377,
  'Comodoro Rivadavia|Santiago del Estero': 2250,
  'Oliva|Santiago del Estero': 527,
  'Formosa|Santiago del Estero': 764,
  'Oberá|Santiago del Estero': 1028,
  'Corrientes|Santiago del Estero': 625,
  'Buenos Aires (CABA)|Santiago del Estero': 1049,
  'La Banda|Santiago del Estero': 8,
  'Santiago del Estero|Vicente López': 1039,
  'Chivilcoy|Santiago del Estero': 1015,
  'Rivadavia|San Salvador de Jujuy': 1404,
  'Salta|San Salvador de Jujuy': 119,
  'San Francisco|San Salvador de Jujuy': 986,
  'Gálvez|San Salvador de Jujuy': 1078,
  'San Salvador de Jujuy|Suardi': 852,
  'Resistencia|San Salvador de Jujuy': 847,
  'San Salvador de Jujuy|Venado Tuerto': 1280,
  'Gualeguaychú|San Salvador de Jujuy': 1385,
  'Junín|San Salvador de Jujuy': 1418,
  'Armstrong|San Salvador de Jujuy': 1200,
  'San Salvador de Jujuy|Viedma': 2088,
  'El Talar (Tigre)|San Salvador de Jujuy': 1460,
  'La Plata|San Salvador de Jujuy': 1550,
  'Lanús|San Salvador de Jujuy': 1504,
  'Colón|San Salvador de Jujuy': 1391,
  'Pergamino|San Salvador de Jujuy': 1330,
  'General Pico|San Salvador de Jujuy': 1429,
  'Rosario|San Salvador de Jujuy': 1197,
  'Mar del Plata|San Salvador de Jujuy': 1906,
  'Avellaneda|San Salvador de Jujuy': 1499,
  'Concepción del Uruguay|San Salvador de Jujuy': 1361,
  'Bahía Blanca|San Salvador de Jujuy': 1835,
  'Comodoro Rivadavia|San Salvador de Jujuy': 2708,
  'Oliva|San Salvador de Jujuy': 985,
  'Formosa|San Salvador de Jujuy': 938,
  'Oberá|San Salvador de Jujuy': 1266,
  'Corrientes|San Salvador de Jujuy': 862,
  'Buenos Aires (CABA)|San Salvador de Jujuy': 1492,
  'La Banda|San Salvador de Jujuy': 451,
  'San Salvador de Jujuy|Vicente López': 1482,
  'Chivilcoy|San Salvador de Jujuy': 1458,
  'Rivadavia|Salta': 1384,
  'Rivadavia|San Francisco': 734,
  'Gálvez|Rivadavia': 796,
  'Rivadavia|Suardi': 881,
  'Resistencia|Rivadavia': 1409,
  'Rivadavia|Venado Tuerto': 685,
  'Gualeguaychú|Rivadavia': 1079,
  'Junín|Rivadavia': 750,
  'Armstrong|Rivadavia': 742,
  'Rivadavia|Viedma': 1201,
  'El Talar (Tigre)|Rivadavia': 1020,
  'La Plata|Rivadavia': 1065,
  'Lanús|Rivadavia': 1012,
  'Colón|Rivadavia': 1124,
  'Pergamino|Rivadavia': 827,
  'General Pico|Rivadavia': 643,
  'Rivadavia|Rosario': 832,
  'Mar del Plata|Rivadavia': 1310,
  'Avellaneda|Rivadavia': 1015,
  'Concepción del Uruguay|Rivadavia': 1095,
  'Bahía Blanca|Rivadavia': 976,
  'Comodoro Rivadavia|Rivadavia': 1748,
  'Oliva|Rivadavia': 606,
  'Formosa|Rivadavia': 1576,
  'Oberá|Rivadavia': 1779,
  'Corrientes|Rivadavia': 1429,
  'Buenos Aires (CABA)|Rivadavia': 1053,
  'La Banda|Rivadavia': 1012,
  'Rivadavia|Vicente López': 1043,
  'Chivilcoy|Rivadavia': 855,
  'Salta|San Francisco': 956,
  'Gálvez|Salta': 1048,
  'Salta|Suardi': 822,
  'Resistencia|Salta': 817,
  'Salta|Venado Tuerto': 1250,
  'Gualeguaychú|Salta': 1355,
  'Junín|Salta': 1387,
  'Armstrong|Salta': 1170,
  'Salta|Viedma': 2058,
  'El Talar (Tigre)|Salta': 1430,
  'La Plata|Salta': 1520,
  'Lanús|Salta': 1474,
  'Colón|Salta': 1360,
  'Pergamino|Salta': 1300,
  'General Pico|Salta': 1398,
  'Rosario|Salta': 1167,
  'Mar del Plata|Salta': 1876,
  'Avellaneda|Salta': 1469,
  'Concepción del Uruguay|Salta': 1331,
  'Bahía Blanca|Salta': 1805,
  'Comodoro Rivadavia|Salta': 2678,
  'Oliva|Salta': 955,
  'Formosa|Salta': 971,
  'Oberá|Salta': 1236,
  'Corrientes|Salta': 832,
  'Buenos Aires (CABA)|Salta': 1462,
  'La Banda|Salta': 421,
  'Salta|Vicente López': 1452,
  'Chivilcoy|Salta': 1428,
  'Gálvez|San Francisco': 147,
  'San Francisco|Suardi': 153,
  'Resistencia|San Francisco': 680,
  'San Francisco|Venado Tuerto': 342,
  'Gualeguaychú|San Francisco': 454,
  'Junín|San Francisco': 487,
  'Armstrong|San Francisco': 202,
  'San Francisco|Viedma': 1215,
  'El Talar (Tigre)|San Francisco': 529,
  'La Plata|San Francisco': 619,
  'Lanús|San Francisco': 573,
  'Colón|San Francisco': 460,
  'Pergamino|San Francisco': 399,
  'General Pico|San Francisco': 613,
  'Rosario|San Francisco': 266,
  'Mar del Plata|San Francisco': 975,
  'Avellaneda|San Francisco': 568,
  'Concepción del Uruguay|San Francisco': 430,
  'Bahía Blanca|San Francisco': 947,
  'Comodoro Rivadavia|San Francisco': 1892,
  'Oliva|San Francisco': 207,
  'Formosa|San Francisco': 846,
  'Oberá|San Francisco': 948,
  'Corrientes|San Francisco': 700,
  'Buenos Aires (CABA)|San Francisco': 561,
  'La Banda|San Francisco': 542,
  'San Francisco|Vicente López': 551,
  'Chivilcoy|San Francisco': 527,
  'Gálvez|Suardi': 269,
  'Gálvez|Resistencia': 642,
  'Gálvez|Venado Tuerto': 301,
  'Gualeguaychú|Gálvez': 387,
  'Gálvez|Junín': 370,
  'Armstrong|Gálvez': 140,
  'Gálvez|Viedma': 1186,
  'El Talar (Tigre)|Gálvez': 413,
  'Gálvez|La Plata': 503,
  'Gálvez|Lanús': 457,
  'Colón|Gálvez': 432,
  'Gálvez|Pergamino': 283,
  'General Pico|Gálvez': 616,
  'Gálvez|Rosario': 150,
  'Gálvez|Mar del Plata': 859,
  'Avellaneda|Gálvez': 452,
  'Concepción del Uruguay|Gálvez': 403,
  'Bahía Blanca|Gálvez': 918,
  'Comodoro Rivadavia|Gálvez': 2002,
  'Gálvez|Oliva': 270,
  'Formosa|Gálvez': 809,
  'Gálvez|Oberá': 910,
  'Corrientes|Gálvez': 662,
  'Buenos Aires (CABA)|Gálvez': 445,
  'Gálvez|La Banda': 631,
  'Gálvez|Vicente López': 435,
  'Chivilcoy|Gálvez': 411,
  'Resistencia|Suardi': 546,
  'Suardi|Venado Tuerto': 504,
  'Gualeguaychú|Suardi': 576,
  'Junín|Suardi': 609,
  'Armstrong|Suardi': 340,
  'Suardi|Viedma': 1425,
  'El Talar (Tigre)|Suardi': 651,
  'La Plata|Suardi': 741,
  'Lanús|Suardi': 696,
  'Colón|Suardi': 582,
  'Pergamino|Suardi': 521,
  'General Pico|Suardi': 820,
  'Rosario|Suardi': 389,
  'Mar del Plata|Suardi': 1097,
  'Avellaneda|Suardi': 691,
  'Concepción del Uruguay|Suardi': 552,
  'Bahía Blanca|Suardi': 1156,
  'Comodoro Rivadavia|Suardi': 2039,
  'Oliva|Suardi': 354,
  'Formosa|Suardi': 713,
  'Oberá|Suardi': 970,
  'Corrientes|Suardi': 566,
  'Buenos Aires (CABA)|Suardi': 683,
  'La Banda|Suardi': 406,
  'Suardi|Vicente López': 673,
  'Chivilcoy|Suardi': 650,
  'Resistencia|Venado Tuerto': 860,
  'Gualeguaychú|Resistencia': 712,
  'Junín|Resistencia': 929,
  'Armstrong|Resistencia': 794,
  'Resistencia|Viedma': 1745,
  'El Talar (Tigre)|Resistencia': 902,
  'La Plata|Resistencia': 991,
  'Lanús|Resistencia': 946,
  'Colón|Resistencia': 631,
  'Pergamino|Resistencia': 842,
  'General Pico|Resistencia': 1175,
  'Resistencia|Rosario': 709,
  'Mar del Plata|Resistencia': 1348,
  'Avellaneda|Resistencia': 941,
  'Concepción del Uruguay|Resistencia': 652,
  'Bahía Blanca|Resistencia': 1477,
  'Comodoro Rivadavia|Resistencia': 2561,
  'Oliva|Resistencia': 883,
  'Formosa|Resistencia': 173,
  'Oberá|Resistencia': 424,
  'Corrientes|Resistencia': 20,
  'Buenos Aires (CABA)|Resistencia': 934,
  'La Banda|Resistencia': 608,
  'Resistencia|Vicente López': 924,
  'Chivilcoy|Resistencia': 970,
  'Gualeguaychú|Venado Tuerto': 449,
  'Junín|Venado Tuerto': 154,
  'Armstrong|Venado Tuerto': 153,
  'Venado Tuerto|Viedma': 904,
  'El Talar (Tigre)|Venado Tuerto': 337,
  'La Plata|Venado Tuerto': 428,
  'Lanús|Venado Tuerto': 383,
  'Colón|Venado Tuerto': 469,
  'Pergamino|Venado Tuerto': 145,
  'General Pico|Venado Tuerto': 324,
  'Rosario|Venado Tuerto': 176,
  'Mar del Plata|Venado Tuerto': 704,
  'Avellaneda|Venado Tuerto': 378,
  'Concepción del Uruguay|Venado Tuerto': 440,
  'Bahía Blanca|Venado Tuerto': 636,
  'Comodoro Rivadavia|Venado Tuerto': 1659,
  'Oliva|Venado Tuerto': 303,
  'Formosa|Venado Tuerto': 1027,
  'Oberá|Venado Tuerto': 1124,
  'Corrientes|Venado Tuerto': 880,
  'Buenos Aires (CABA)|Venado Tuerto': 370,
  'La Banda|Venado Tuerto': 830,
  'Venado Tuerto|Vicente López': 360,
  'Chivilcoy|Venado Tuerto': 254,
  'Gualeguaychú|Junín': 362,
  'Armstrong|Gualeguaychú': 346,
  'Gualeguaychú|Viedma': 1116,
  'El Talar (Tigre)|Gualeguaychú': 199,
  'Gualeguaychú|La Plata': 288,
  'Gualeguaychú|Lanús': 243,
  'Colón|Gualeguaychú': 102,
  'Gualeguaychú|Pergamino': 307,
  'General Pico|Gualeguaychú': 686,
  'Gualeguaychú|Rosario': 261,
  'Gualeguaychú|Mar del Plata': 644,
  'Avellaneda|Gualeguaychú': 238,
  'Concepción del Uruguay|Gualeguaychú': 73,
  'Bahía Blanca|Gualeguaychú': 848,
  'Comodoro Rivadavia|Gualeguaychú': 1932,
  'Gualeguaychú|Oliva': 560,
  'Formosa|Gualeguaychú': 879,
  'Gualeguaychú|Oberá': 806,
  'Corrientes|Gualeguaychú': 693,
  'Buenos Aires (CABA)|Gualeguaychú': 231,
  'Gualeguaychú|La Banda': 938,
  'Gualeguaychú|Vicente López': 220,
  'Chivilcoy|Gualeguaychú': 306,
  'Armstrong|Junín': 260,
  'Junín|Viedma': 817,
  'El Talar (Tigre)|Junín': 250,
  'Junín|La Plata': 321,
  'Junín|Lanús': 268,
  'Colón|Junín': 457,
  'Junín|Pergamino': 89,
  'General Pico|Junín': 328,
  'Junín|Rosario': 227,
  'Junín|Mar del Plata': 555,
  'Avellaneda|Junín': 271,
  'Concepción del Uruguay|Junín': 428,
  'Bahía Blanca|Junín': 548,
  'Comodoro Rivadavia|Junín': 1632,
  'Junín|Oliva': 475,
  'Formosa|Junín': 1096,
  'Junín|Oberá': 1161,
  'Corrientes|Junín': 949,
  'Buenos Aires (CABA)|Junín': 268,
  'Junín|La Banda': 970,
  'Junín|Vicente López': 273,
  'Chivilcoy|Junín': 111,
  'Armstrong|Viedma': 1047,
  'Armstrong|El Talar (Tigre)': 357,
  'Armstrong|La Plata': 446,
  'Armstrong|Lanús': 401,
  'Armstrong|Colón': 391,
  'Armstrong|Pergamino': 171,
  'Armstrong|General Pico': 467,
  'Armstrong|Rosario': 98,
  'Armstrong|Mar del Plata': 802,
  'Armstrong|Avellaneda': 396,
  'Armstrong|Concepción del Uruguay': 362,
  'Armstrong|Bahía Blanca': 779,
  'Armstrong|Comodoro Rivadavia': 1802,
  'Armstrong|Oliva': 222,
  'Armstrong|Formosa': 949,
  'Armstrong|Oberá': 1046,
  'Armstrong|Corrientes': 803,
  'Armstrong|Buenos Aires (CABA)': 388,
  'Armstrong|La Banda': 750,
  'Armstrong|Vicente López': 378,
  'Armstrong|Chivilcoy': 355,
  'El Talar (Tigre)|Viedma': 969,
  'La Plata|Viedma': 913,
  'Lanús|Viedma': 942,
  'Colón|Viedma': 1210,
  'Pergamino|Viedma': 906,
  'General Pico|Viedma': 718,
  'Rosario|Viedma': 1044,
  'Mar del Plata|Viedma': 743,
  'Avellaneda|Viedma': 949,
  'Concepción del Uruguay|Viedma': 1181,
  'Bahía Blanca|Viedma': 278,
  'Comodoro Rivadavia|Viedma': 867,
  'Oliva|Viedma': 1146,
  'Formosa|Viedma': 1913,
  'Oberá|Viedma': 1914,
  'Corrientes|Viedma': 1766,
  'Buenos Aires (CABA)|Viedma': 946,
  'La Banda|Viedma': 1639,
  'Vicente López|Viedma': 953,
  'Chivilcoy|Viedma': 833,
  'El Talar (Tigre)|La Plata': 92,
  'El Talar (Tigre)|Lanús': 46,
  'Colón|El Talar (Tigre)': 292,
  'El Talar (Tigre)|Pergamino': 197,
  'El Talar (Tigre)|General Pico': 576,
  'El Talar (Tigre)|Rosario': 271,
  'El Talar (Tigre)|Mar del Plata': 448,
  'Avellaneda|El Talar (Tigre)': 41,
  'Concepción del Uruguay|El Talar (Tigre)': 263,
  'Bahía Blanca|El Talar (Tigre)': 681,
  'Comodoro Rivadavia|El Talar (Tigre)': 1784,
  'El Talar (Tigre)|Oliva': 572,
  'El Talar (Tigre)|Formosa': 1069,
  'El Talar (Tigre)|Oberá': 996,
  'Corrientes|El Talar (Tigre)': 883,
  'Buenos Aires (CABA)|El Talar (Tigre)': 34,
  'El Talar (Tigre)|La Banda': 1014,
  'El Talar (Tigre)|Vicente López': 24,
  'Chivilcoy|El Talar (Tigre)': 151,
  'La Plata|Lanús': 56,
  'Colón|La Plata': 381,
  'La Plata|Pergamino': 286,
  'General Pico|La Plata': 645,
  'La Plata|Rosario': 359,
  'La Plata|Mar del Plata': 369,
  'Avellaneda|La Plata': 52,
  'Concepción del Uruguay|La Plata': 352,
  'Bahía Blanca|La Plata': 635,
  'Comodoro Rivadavia|La Plata': 1728,
  'La Plata|Oliva': 661,
  'Formosa|La Plata': 1158,
  'La Plata|Oberá': 1085,
  'Corrientes|La Plata': 972,
  'Buenos Aires (CABA)|La Plata': 58,
  'La Banda|La Plata': 1103,
  'La Plata|Vicente López': 71,
  'Chivilcoy|La Plata': 226,
  'Colón|Lanús': 336,
  'Lanús|Pergamino': 241,
  'General Pico|Lanús': 591,
  'Lanús|Rosario': 315,
  'Lanús|Mar del Plata': 411,
  'Avellaneda|Lanús': 7,
  'Concepción del Uruguay|Lanús': 307,
  'Bahía Blanca|Lanús': 655,
  'Comodoro Rivadavia|Lanús': 1759,
  'Lanús|Oliva': 616,
  'Formosa|Lanús': 1113,
  'Lanús|Oberá': 1040,
  'Corrientes|Lanús': 927,
  'Buenos Aires (CABA)|Lanús': 13,
  'La Banda|Lanús': 1058,
  'Lanús|Vicente López': 26,
  'Chivilcoy|Lanús': 172,
  'Colón|Pergamino': 402,
  'Colón|General Pico': 781,
  'Colón|Rosario': 306,
  'Colón|Mar del Plata': 739,
  'Avellaneda|Colón': 333,
  'Colón|Concepción del Uruguay': 44,
  'Bahía Blanca|Colón': 943,
  'Colón|Comodoro Rivadavia': 2027,
  'Colón|Oliva': 606,
  'Colón|Formosa': 798,
  'Colón|Oberá': 726,
  'Colón|Corrientes': 613,
  'Buenos Aires (CABA)|Colón': 326,
  'Colón|La Banda': 944,
  'Colón|Vicente López': 315,
  'Chivilcoy|Colón': 400,
  'General Pico|Pergamino': 414,
  'Pergamino|Rosario': 141,
  'Mar del Plata|Pergamino': 640,
  'Avellaneda|Pergamino': 237,
  'Concepción del Uruguay|Pergamino': 373,
  'Bahía Blanca|Pergamino': 637,
  'Comodoro Rivadavia|Pergamino': 1721,
  'Oliva|Pergamino': 387,
  'Formosa|Pergamino': 1010,
  'Oberá|Pergamino': 1106,
  'Corrientes|Pergamino': 863,
  'Buenos Aires (CABA)|Pergamino': 230,
  'La Banda|Pergamino': 884,
  'Pergamino|Vicente López': 219,
  'Chivilcoy|Pergamino': 147,
  'General Pico|Rosario': 492,
  'General Pico|Mar del Plata': 723,
  'Avellaneda|General Pico': 593,
  'Concepción del Uruguay|General Pico': 750,
  'Bahía Blanca|General Pico': 428,
  'Comodoro Rivadavia|General Pico': 1338,
  'General Pico|Oliva': 487,
  'Formosa|General Pico': 1342,
  'General Pico|Oberá': 1483,
  'Corrientes|General Pico': 1196,
  'Buenos Aires (CABA)|General Pico': 590,
  'General Pico|La Banda': 980,
  'General Pico|Vicente López': 595,
  'Chivilcoy|General Pico': 433,
  'Mar del Plata|Rosario': 717,
  'Avellaneda|Rosario': 311,
  'Concepción del Uruguay|Rosario': 276,
  'Bahía Blanca|Rosario': 777,
  'Comodoro Rivadavia|Rosario': 1861,
  'Oliva|Rosario': 313,
  'Formosa|Rosario': 876,
  'Oberá|Rosario': 960,
  'Corrientes|Rosario': 730,
  'Buenos Aires (CABA)|Rosario': 304,
  'La Banda|Rosario': 751,
  'Rosario|Vicente López': 293,
  'Chivilcoy|Rosario': 270,
  'Avellaneda|Mar del Plata': 407,
  'Concepción del Uruguay|Mar del Plata': 707,
  'Bahía Blanca|Mar del Plata': 465,
  'Comodoro Rivadavia|Mar del Plata': 1562,
  'Mar del Plata|Oliva': 1016,
  'Formosa|Mar del Plata': 1513,
  'Mar del Plata|Oberá': 1440,
  'Corrientes|Mar del Plata': 1327,
  'Buenos Aires (CABA)|Mar del Plata': 413,
  'La Banda|Mar del Plata': 1458,
  'Mar del Plata|Vicente López': 426,
  'Chivilcoy|Mar del Plata': 500,
  'Avellaneda|Concepción del Uruguay': 302,
  'Avellaneda|Bahía Blanca': 662,
  'Avellaneda|Comodoro Rivadavia': 1765,
  'Avellaneda|Oliva': 610,
  'Avellaneda|Formosa': 1107,
  'Avellaneda|Oberá': 1035,
  'Avellaneda|Corrientes': 922,
  'Avellaneda|Buenos Aires (CABA)': 7,
  'Avellaneda|La Banda': 1052,
  'Avellaneda|Vicente López': 21,
  'Avellaneda|Chivilcoy': 174,
  'Bahía Blanca|Concepción del Uruguay': 913,
  'Comodoro Rivadavia|Concepción del Uruguay': 1997,
  'Concepción del Uruguay|Oliva': 576,
  'Concepción del Uruguay|Formosa': 821,
  'Concepción del Uruguay|Oberá': 748,
  'Concepción del Uruguay|Corrientes': 635,
  'Buenos Aires (CABA)|Concepción del Uruguay': 296,
  'Concepción del Uruguay|La Banda': 914,
  'Concepción del Uruguay|Vicente López': 285,
  'Chivilcoy|Concepción del Uruguay': 371,
  'Bahía Blanca|Comodoro Rivadavia': 1094,
  'Bahía Blanca|Oliva': 863,
  'Bahía Blanca|Formosa': 1645,
  'Bahía Blanca|Oberá': 1646,
  'Bahía Blanca|Corrientes': 1498,
  'Bahía Blanca|Buenos Aires (CABA)': 660,
  'Bahía Blanca|La Banda': 1388,
  'Bahía Blanca|Vicente López': 667,
  'Bahía Blanca|Chivilcoy': 565,
  'Comodoro Rivadavia|Oliva': 1766,
  'Comodoro Rivadavia|Formosa': 2729,
  'Comodoro Rivadavia|Oberá': 2729,
  'Comodoro Rivadavia|Corrientes': 2582,
  'Buenos Aires (CABA)|Comodoro Rivadavia': 1762,
  'Comodoro Rivadavia|La Banda': 2259,
  'Comodoro Rivadavia|Vicente López': 1769,
  'Chivilcoy|Comodoro Rivadavia': 1649,
  'Formosa|Oliva': 1050,
  'Oberá|Oliva': 1260,
  'Corrientes|Oliva': 903,
  'Buenos Aires (CABA)|Oliva': 603,
  'La Banda|Oliva': 535,
  'Oliva|Vicente López': 592,
  'Chivilcoy|Oliva': 569,
  'Formosa|Oberá': 592,
  'Corrientes|Formosa': 188,
  'Buenos Aires (CABA)|Formosa': 1102,
  'Formosa|La Banda': 761,
  'Formosa|Vicente López': 1091,
  'Chivilcoy|Formosa': 1136,
  'Corrientes|Oberá': 404,
  'Buenos Aires (CABA)|Oberá': 1029,
  'La Banda|Oberá': 1026,
  'Oberá|Vicente López': 1019,
  'Chivilcoy|Oberá': 1104,
  'Buenos Aires (CABA)|Corrientes': 915,
  'Corrientes|La Banda': 621,
  'Corrientes|Vicente López': 905,
  'Chivilcoy|Corrientes': 990,
  'Buenos Aires (CABA)|La Banda': 1045,
  'Buenos Aires (CABA)|Vicente López': 14,
  'Buenos Aires (CABA)|Chivilcoy': 172,
  'La Banda|Vicente López': 1036,
  'Chivilcoy|La Banda': 1012,
  'Chivilcoy|Vicente López': 169,
};

// getRouteKm usa CITY_DIST_KM cuando el par de ciudades está en la matriz,
// y cae a línea recta (Haversine) * factor de sinuosidad cuando no — para
// no romper si aparece un equipo nuevo en una ciudad todavía no relevada.
const _ROUTE_CIRCUITY_FACTOR = 1.3;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRouteKm(cityA, cityB) {
  if (!cityA || !cityB || cityA === cityB) return 0;
  const dist = (typeof CITY_DIST_KM !== 'undefined') ? CITY_DIST_KM : null;
  const coords = (typeof CITY_COORDS !== 'undefined') ? CITY_COORDS : null;
  if (dist) {
    const key = [cityA, cityB].sort().join('|');
    if (dist[key] != null) return dist[key];
  }
  if (coords && coords[cityA] && coords[cityB]) {
    const a = coords[cityA], b = coords[cityB];
    return haversineKm(a.lat, a.lon, b.lat, b.lon) * _ROUTE_CIRCUITY_FACTOR;
  }
  return null;
}

// Recorrido secuencial real: sigue el fixture jugado en orden cronológico
// (t._gamelog ya viene ordenado) en vez de asumir ida-y-vuelta a la sede en
// cada partido de visitante — así una gira (varios partidos de visitante
// seguidos sin volver a la sede) suma ciudad→ciudad→ciudad, no
// sede→ciudad→sede→ciudad→sede.
function computeTeamTravelKm(team) {
  const teamCity = (typeof TEAM_CITY !== 'undefined') ? TEAM_CITY : null;
  if (!teamCity) return null;
  const homeCity = teamCity[team.Equipo];
  if (!homeCity) return null;
  let km = 0, currentCity = homeCity, hasAny = false;
  (team._gamelog || []).forEach(g => {
    const gameCity = g.condicion === 'LOCAL' ? homeCity : teamCity[g.rival];
    if (!gameCity) return; // rival sin ciudad mapeada: se ignora ese tramo, no rompe el total
    const d = getRouteKm(currentCity, gameCity);
    if (d != null) { km += d; hasAny = true; }
    currentCity = gameCity;
  });
  return hasAny ? Math.round(km) : null;
}

function teamLogoHtml(teamName, size) {
  size = size || 20;
  const src = LOGOS[teamName];
  if (!src) return '';
  return '<img src="' + src + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;flex-shrink:0" alt="" onerror="this.style.display=\'none\'">';
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

// ── Modal de partido — mapa de tiro / box score / evolución ──
async function loadShots() {
  if (SHOTS_MAP !== null) return;
  try {
    const resp = await fetch(SHOTS_CSV + '?v=' + new Date().toISOString().slice(0, 10));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    SHOTS_MAP = new Map();
    SHOTS_STABLE_MAP = new Map();
    SHOTS_BY_PLAYER = new Map();
    rows.forEach(r => {
      const gid = r['IdPartido'];
      if (!gid) return;
      if (!SHOTS_MAP.has(gid)) SHOTS_MAP.set(gid, []);
      SHOTS_MAP.get(gid).push(r);
      // Stable cross-CSV key: IdPartido is dynamic; use fecha|local|visit instead
      const skey = r['Fecha'] + '|' + r['Equipo_local'] + '|' + r['Equipo_visitante'];
      if (!SHOTS_STABLE_MAP.has(skey)) SHOTS_STABLE_MAP.set(skey, []);
      SHOTS_STABLE_MAP.get(skey).push(r);
      // Index by player: Equipo||Dorsal (normalised to integer string)
      const dNum = String(Math.round(parseFloat(r['Dorsal']) || 0));
      const pkey = r['Equipo'] + '||' + dNum;
      if (!SHOTS_BY_PLAYER.has(pkey)) SHOTS_BY_PLAYER.set(pkey, []);
      SHOTS_BY_PLAYER.get(pkey).push(r);
    });
  } catch(e) {
    SHOTS_MAP = new Map(); // empty map on error
    SHOTS_STABLE_MAP = new Map();
    SHOTS_BY_PLAYER = new Map();
  }
}

function renderShotMap() {
  const canvas = document.getElementById('shotMapCanvas');
  const noData = document.getElementById('smNoData');
  const legend = document.getElementById('smLegend');
  const { fecha, local, visit, filter } = _smState;

  // Size canvas to match CSS width, derive height from 28:15 aspect ratio
  const W = canvas.offsetWidth || 600;
  const H = Math.round(W * 15 / 28);
  canvas.width = W; canvas.height = H;

  // Use stable key (fecha|local|visit) — IdPartido is dynamic between CSVs
  const _smSkey = fecha + '|' + local + '|' + visit;
  const shots = SHOTS_STABLE_MAP ? (SHOTS_STABLE_MAP.get(_smSkey) || []) : [];

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

function openPartidoModal(game) {
  _partidoMode = true;
  // Set shot map state
  _smState.gameId    = game.gameId;
  _smState.fecha     = game.fecha || null;
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
  document.getElementById('tgmMainTabs').style.display = 'none';
  document.getElementById('tgmStanding').style.display = 'none';
  document.getElementById('tgmGamesPanel').style.display = 'none';
  document.getElementById('tgmRosterPanel').style.display = 'none';
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

function renderScoreDelta(gameId, localTeam, visitTeam) {
  const panel = document.getElementById('tgmEvolPanel');
  const focusTeam = _smState.focusTeam || localTeam;
  const invert    = focusTeam === visitTeam;
  const teamA     = focusTeam;
  const teamB     = invert ? localTeam : visitTeam;

  const doRender = () => {
    const _evolSkey = _smState.fecha ? _smState.fecha + '|' + localTeam + '|' + visitTeam : null;
    let data = computeScoreDelta(gameId, _evolSkey);
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

function _partidoFechaToDate(s) {
  const [d,m,y] = s.split('/');
  return new Date(+y, +m-1, +d);
}

// ── Fixture / lista de partidos ──
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

function fmtTeamName(name){return TEAM_NAME_BREAKS[name]||name;}

let _teamModalTab = 'games';

function switchTeamMainTab(tab) {
  _teamModalTab = tab;
  const tabGames = document.getElementById('tgmMainTabGames');
  const tabRoster = document.getElementById('tgmMainTabRoster');
  if (tabGames) tabGames.classList.toggle('active', tab === 'games');
  if (tabRoster) tabRoster.classList.toggle('active', tab === 'roster');
  const panelGames = document.getElementById('tgmGamesPanel');
  const panelRoster = document.getElementById('tgmRosterPanel');
  if (panelGames) panelGames.style.display = tab === 'games' ? '' : 'none';
  if (panelRoster) panelRoster.style.display = tab === 'roster' ? '' : 'none';
}

function renderTeamStanding(teamName) {
  const el = document.getElementById('tgmStanding');
  if (!el) return;
  el.textContent = typeof getTeamStandingLabel === 'function' ? (getTeamStandingLabel(teamName) || '') : '';
}

function renderTeamUpcoming(teamName) {
  const el = document.getElementById('tgmUpcoming');
  if (!el) return;
  const next = (typeof GAMES_ALL !== 'undefined' ? GAMES_ALL : [])
    .filter(g => g.upcoming && (g.local === teamName || g.visit === teamName))
    .sort((a, b) => _partidoFechaToDate(a.fecha) - _partidoFechaToDate(b.fecha))
    .slice(0, 2);
  if (!next.length) { el.innerHTML = ''; return; }
  el.innerHTML = next.map(g => {
    const rival = g.local === teamName ? g.visit : g.local;
    const cond = g.local === teamName ? 'Local' : 'Visitante';
    return `<div class="tgm-upcoming-row">
      <span class="tgm-upcoming-label">Próximo · ${cond}</span>
      <span class="tgm-upcoming-vs">${teamLogoHtml(rival, 16)}vs ${rival}</span>
      <span class="tgm-upcoming-date">${g.fecha}${g.hora ? ' · ' + g.hora : ''}${g.estadio ? ' · ' + g.estadio : ''}</span>
    </div>`;
  }).join('');
}

function renderTeamRoster(teamName) {
  const tbody = document.getElementById('tgmRosterTbody');
  if (!tbody) return;
  const roster = (typeof PLAYERS !== 'undefined' ? PLAYERS : [])
    .filter(p => p.Equipo === teamName)
    .slice()
    .sort((a, b) => (b.PPG || 0) - (a.PPG || 0));
  if (!roster.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">Sin datos de plantel disponibles.</td></tr>';
    return;
  }
  tbody.innerHTML = roster.map(p => {
    const dorsal = p.DORSAL != null && p.DORSAL !== '' && !isNaN(parseFloat(p.DORSAL)) ? '#' + Math.round(parseFloat(p.DORSAL)) : '—';
    const edad = p.Edad != null ? p.Edad : '—';
    return `<tr>
      <td>${dorsal}</td>
      <td style="text-align:left;color:var(--text-bright)">${p['Nombre completo']}</td>
      <td>${edad}</td>
      <td>${p.PJ || 0}</td>
      <td>${(p.PPG || 0).toFixed(1)}</td>
      <td>${(p.RPG || 0).toFixed(1)}</td>
      <td>${(p.APG || 0).toFixed(1)}</td>
      <td>${(p.SPG || 0).toFixed(1)}</td>
      <td>${(p.BPG || 0).toFixed(1)}</td>
    </tr>`;
  }).join('');
}

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
  renderTeamStanding(teamName);
  renderTeamUpcoming(teamName);
  renderTeamRoster(teamName);
  switchTeamMainTab('games');
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
  _smState.fecha     = g.fecha  || null;
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

  document.getElementById('tgmMainTabs').style.display = 'none';
  document.getElementById('tgmStanding').style.display = 'none';
  document.getElementById('tgmGamesPanel').style.display = 'none';
  document.getElementById('tgmRosterPanel').style.display = 'none';
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
  document.getElementById('tgmMainTabs').style.display = '';
  document.getElementById('tgmStanding').style.display = '';
  switchTeamMainTab(_teamModalTab || 'games');
}

function closeTeamGames(e) {
  if (e && e.target !== document.getElementById('teamGamesBackdrop')) return;
  document.getElementById('teamGamesBackdrop').classList.remove('open');
  closeGameDetail();
  _partidoMode = false;
}

// ── Zonas de tiro (j-tiro) — clasificación y color ──
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

// ── PBP / Quintetos ──
async function loadPbp() {
  if (PBP_MAP !== null) return;
  try {
    const resp = await fetch(PBP_CSV + '?v=' + new Date().toISOString().slice(0, 10));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    PBP_MAP = new Map();
    PBP_STABLE_MAP = new Map();
    rows.forEach(r => {
      const gid = r['IdPartido']; if (!gid) return;
      if (!PBP_MAP.has(gid)) PBP_MAP.set(gid, []);
      PBP_MAP.get(gid).push(r);
      // Stable cross-CSV key: IdPartido is dynamic; use fecha|local|visit instead
      const skey = r['Fecha'] + '|' + r['Equipo_local'] + '|' + r['Equipo_visitante'];
      if (!PBP_STABLE_MAP.has(skey)) PBP_STABLE_MAP.set(skey, []);
      PBP_STABLE_MAP.get(skey).push(r);
    });
  } catch(e) { PBP_MAP = new Map(); PBP_STABLE_MAP = new Map(); }
}

function pbpElapsed(period, tiempo) {
  if (!tiempo) return null;
  const parts = tiempo.split(':'); if (parts.length < 2) return null;
  const remaining = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  const p = Math.round(parseFloat(period) || 1);
  const periodLen = p <= 4 ? 600 : 300;
  const periodOffset = p <= 4 ? (p - 1) * 600 : 4 * 600 + (p - 5) * 300;
  return periodOffset + (periodLen - remaining);
}

function calcPoss(fga, fta, oreb, to) { return fga + 0.44 * fta - oreb + to; }

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

// ── Conexiones — jugador ──
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

// ── Conexiones — equipo ──
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
