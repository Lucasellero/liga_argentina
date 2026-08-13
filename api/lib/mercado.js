// Lógica de filtrado exacto sobre mercado.json (Liga Argentina + Liga Nacional), para el
// tab "Mercado" > chat del dashboard. Port 1:1 de scraper/prototipo_agente_mercado.py
// (Mercado class) — mismo comportamiento validado ahí, incluido el desglose
// renovaciones/nuevos precalculado (no dejar que el LLM lo cuente a mano, ver ese script
// para el porqué).

const MAX_RESULTADOS = 60;

function norm(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

class Mercado {
  constructor(data) {
    // data: { liga_argentina: {...}, liga_nacional: {...} }
    this.data = data;
    this.clubName = {}; // "liga|club_id" -> nombre a mostrar (abreviatura LOGOS)
    this.clubRawName = {}; // "liga|club_id" -> nombre tal cual lo escribe la fuente
    for (const [liga, d] of Object.entries(data)) {
      for (const c of d.clubs) {
        const key = `${liga}|${c.id}`;
        this.clubName[key] = c.team || c.name;
        this.clubRawName[key] = c.name;
      }
    }
  }

  _ligas(liga) {
    return liga === 'ambas' ? Object.keys(this.data) : [liga];
  }

  buscarJugadores({ liga, status, position, confidence, ficha_type, club, nombre, solo_nuevos }) {
    const out = [];
    for (const lg of this._ligas(liga)) {
      for (const p of this.data[lg].players) {
        if (status && p.status !== status) continue;
        if (position && p.position !== position) continue;
        if (confidence && p.confidence !== confidence) continue;
        if (ficha_type && p.ficha_type !== ficha_type) continue;
        const clubKey = `${lg}|${p.club_id}`;
        const clubNombre = this.clubName[clubKey] || p.club_id;
        const clubRaw = this.clubRawName[clubKey] || clubNombre;
        if (club && !norm(clubNombre).includes(norm(club))) continue;
        if (nombre && !norm(p.name).includes(norm(nombre))) continue;
        const lastClubNorm = norm(p.last_club);
        const esRenovacion = Boolean(lastClubNorm) && lastClubNorm === norm(clubRaw);
        if (solo_nuevos && esRenovacion) continue;
        out.push({
          liga: lg,
          name: p.name,
          club: clubNombre,
          position: p.position,
          status: p.status,
          confidence: p.confidence || null,
          ficha_type: p.ficha_type || null,
          age: p.age || null,
          height: p.height || null,
          last_club: p.last_club || null,
          updated_at: p.updated_at || null,
          es_renovacion: esRenovacion,
        });
      }
    }
    const renovaciones = out.filter((p) => p.es_renovacion).length;
    return {
      total: out.length,
      renovaciones,
      nuevos: out.length - renovaciones,
      jugadores: out.slice(0, MAX_RESULTADOS),
    };
  }

  buscarClubes({ liga, nombre, market_status, pct_max, pct_min }) {
    const out = [];
    for (const lg of this._ligas(liga)) {
      for (const c of this.data[lg].clubs) {
        if (nombre && !norm(c.name).includes(norm(nombre))) continue;
        if (market_status && c.market_status !== market_status) continue;
        if (pct_max !== undefined && pct_max !== null && (c.pct || 0) > pct_max) continue;
        if (pct_min !== undefined && pct_min !== null && (c.pct || 0) < pct_min) continue;
        out.push({
          liga: lg,
          name: c.team || c.name,
          pct: c.pct,
          coach: c.coach || null,
          market_status: c.market_status || null,
          target_mayor: c.target_mayor,
          target_u23: c.target_u23,
        });
      }
    }
    return { total: out.length, clubes: out.slice(0, MAX_RESULTADOS) };
  }

  resumenLiga({ liga }) {
    const resumen = {};
    for (const lg of this._ligas(liga)) {
      const d = this.data[lg];
      const porStatus = {};
      for (const p of d.players) porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      const porMarket = {};
      const pcts = [];
      for (const c of d.clubs) {
        porMarket[c.market_status] = (porMarket[c.market_status] || 0) + 1;
        if (c.pct !== undefined && c.pct !== null) pcts.push(c.pct);
      }
      resumen[lg] = {
        updated_at: d.updated_at,
        total_clubes: d.clubs.length,
        total_jugadores: d.players.length,
        por_status: porStatus,
        por_market_status: porMarket,
        pct_promedio_plantel_armado: pcts.length
          ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10
          : null,
      };
    }
    return resumen;
  }
}

module.exports = { Mercado, norm, MAX_RESULTADOS };
