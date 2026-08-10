// Handler del chat del tab Mercado — /api/mercado/chat (ver api/index.js para el ruteo).
//
// Arquitectura validada en scraper/prototipo_agente_mercado.py: nada de contexto crudo,
// el modelo solo tiene tools de filtrado exacto sobre mercado.json y redacta sobre el
// resultado ya calculado (conteos, desglose renovaciones/nuevos, etc. nunca los hace "a
// ojo" — ver ese script para el porqué, se probó que un modelo chico se equivoca).

const Anthropic = require('@anthropic-ai/sdk');
const { Mercado } = require('./mercado');
const { getAuthedEmail } = require('./auth');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_ROUNDS = 5;
const MAX_MENSAJES = 12; // tope de turnos de historial que acepta el request

const LIGAS_VALIDAS = new Set(['liga_argentina', 'liga_nacional', 'ambas']);

const SYSTEM_PROMPT = `Sos un analista de datos especializado en el Mercado de Pases de básquet \
de Liga Argentina y Liga Nacional (temporada 2025/26). Respondés preguntas de asistentes de \
equipos sobre altas, bajas, jugadores pretendidos y vacantes por puesto.

No tenés la data de memoria: usá SIEMPRE las tools (buscar_jugadores, buscar_clubes, \
resumen_liga) para cualquier pregunta que involucre contar, listar o filtrar jugadores/clubes. \
No inventes ni calcules números "de memoria" ni leyendo texto previo — si necesitás un dato, \
llamá a la tool correspondiente.

Reglas de la data que tenés que conocer:
- Esta data proviene de un feed externo especializado en mercado de pases, no es información \
oficial de la liga — no la presentes como oficial. Nunca menciones el nombre de la fuente ni de \
ningún sitio externo en tus respuestas: referite a ella como "nuestra base de datos del mercado" \
o similar.
- status: confirmado (fichaje ya cerrado) | pretendido (interés, no cerrado) | se_queda \
(renovación) | se_va (confirmado que deja el club) | vacante (puesto que el club busca cubrir, \
NO es un jugador real, no tiene nombre).
- confidence (certeza, de mayor a menor): oficial > arreglo_verbal > muy_avanzado > interes > \
en_duda > se_cayo.
- position: base | escolta | alero | ala_pivote | pivote.
- ficha_type: mayor | u21 | juvenil | staff.
- Un jugador confirmado cuyo last_club es el mismo club al que ficha es una renovación, no un \
fichaje nuevo. buscar_jugadores ya devuelve esto calculado: cada jugador trae es_renovacion \
(true/false) y la respuesta trae renovaciones/nuevos con los conteos exactos. Usá siempre esos \
campos tal cual — nunca cuentes vos mismo leyendo last_club jugador por jugador. Si además \
querés la lista filtrada a solo nuevos, pasá solo_nuevos=true.
- No hay datos de todos los equipos de Liga Argentina (la fuente no cubre a todos los clubes \
chicos) — si preguntan por un club que buscar_clubes no encuentra, decí que no está cubierto \
por esta base de datos, no asumas que no tiene movimientos.

Respondé en español, directo y conciso (2-4 oraciones salvo que pidan una lista explícita).`;

const TOOLS = [
  {
    name: 'buscar_jugadores',
    description:
      'Filtra jugadores del mercado de pases de forma exacta. Devuelve el conteo total de ' +
      'matches, el desglose exacto renovaciones/nuevos ya calculado, y hasta 60 resultados ' +
      '(cada uno con su flag es_renovacion). Usar para cualquier pregunta de conteo, listado ' +
      'o filtrado de jugadores.',
    input_schema: {
      type: 'object',
      properties: {
        liga: { type: 'string', enum: ['liga_argentina', 'liga_nacional', 'ambas'] },
        status: { type: 'string', enum: ['confirmado', 'pretendido', 'se_queda', 'se_va', 'vacante'] },
        position: { type: 'string', enum: ['base', 'escolta', 'alero', 'ala_pivote', 'pivote'] },
        confidence: {
          type: 'string',
          enum: ['oficial', 'arreglo_verbal', 'muy_avanzado', 'interes', 'en_duda', 'se_cayo'],
        },
        ficha_type: { type: 'string', enum: ['mayor', 'u21', 'juvenil', 'staff'] },
        club: { type: 'string', description: 'Nombre (parcial) del club actual del jugador' },
        nombre: { type: 'string', description: 'Nombre (parcial) del jugador' },
        solo_nuevos: {
          type: 'boolean',
          description: 'Si true, excluye renovaciones (last_club == club actual) entre los confirmados/se_queda',
        },
      },
      required: ['liga'],
    },
  },
  {
    name: 'buscar_clubes',
    description:
      'Filtra clubes por nombre, % de plantel armado o estado de mercado. Usar para preguntas ' +
      'sobre clubes (entrenador, pct armado, market_status).',
    input_schema: {
      type: 'object',
      properties: {
        liga: { type: 'string', enum: ['liga_argentina', 'liga_nacional', 'ambas'] },
        nombre: { type: 'string' },
        market_status: { type: 'string', enum: ['abierto', 'avanzado', 'cerrado', 'cerrado_reserva'] },
        pct_max: { type: 'number', description: 'Solo clubes con pct <= este valor' },
        pct_min: { type: 'number', description: 'Solo clubes con pct >= este valor' },
      },
      required: ['liga'],
    },
  },
  {
    name: 'resumen_liga',
    description:
      'Resumen agregado exacto de una liga: cantidad de clubes, de jugadores por status, ' +
      'promedio de pct armado, breakdown de market_status. Usar para preguntas de tipo ' +
      "'resumen general' o 'estado del mercado'.",
    input_schema: {
      type: 'object',
      properties: { liga: { type: 'string', enum: ['liga_argentina', 'liga_nacional', 'ambas'] } },
      required: ['liga'],
    },
  },
];

function buildToolImpl(mercado) {
  return {
    buscar_jugadores: (input) => mercado.buscarJugadores(input),
    buscar_clubes: (input) => mercado.buscarClubes(input),
    resumen_liga: (input) => mercado.resumenLiga(input),
  };
}

async function fetchMercadoData(baseUrl) {
  const [la, ln] = await Promise.all([
    fetch(`${baseUrl}/liga_argentina/mercado.json`).then((r) => r.json()),
    fetch(`${baseUrl}/liga_nacional/mercado.json`).then((r) => r.json()),
  ]);
  return { liga_argentina: la, liga_nacional: ln };
}

async function runChatLoop(client, mercado, mensajes) {
  const toolImpl = buildToolImpl(mercado);
  const messages = mensajes.slice();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (resp.stop_reason !== 'tool_use') {
      return resp.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
    }

    messages.push({ role: 'assistant', content: resp.content });
    const toolResults = [];
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      const fn = toolImpl[block.name];
      const result = fn ? fn(block.input || {}) : { error: `tool desconocida: ${block.name}` };
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return 'No pude terminar de procesar la pregunta (demasiados pasos). Probá reformularla de forma más específica.';
}

async function handleMercadoChat(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // Gate de auth: esta feature paga API de Claude por pregunta, solo para usuarios
  // logueados. El check real vive acá (server-side) — el frontend solo evita mandar el
  // request si sabe de antemano que no hay sesión, es UX, no la protección real.
  const email = await getAuthedEmail(req);
  if (!email) {
    res.status(401).json({ error: 'no_autenticado' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const liga = body.liga;
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.trim() : '';
  const historial = Array.isArray(body.historial) ? body.historial : [];

  if (!LIGAS_VALIDAS.has(liga)) {
    res.status(400).json({ error: 'liga_invalida' });
    return;
  }
  if (!pregunta || pregunta.length > 500) {
    res.status(400).json({ error: 'pregunta_invalida' });
    return;
  }
  if (historial.length > MAX_MENSAJES) {
    res.status(400).json({ error: 'historial_muy_largo' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'anthropic_api_key_no_configurada' });
    return;
  }

  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${req.headers.host}`;
    const data = await fetchMercadoData(baseUrl);
    const mercado = new Mercado(data);
    const client = new Anthropic({ apiKey });

    const mensajes = [
      ...historial.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'),
      { role: 'user', content: pregunta },
    ];

    const respuesta = await runChatLoop(client, mercado, mensajes);
    res.status(200).json({ respuesta });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', detail: String((err && err.message) || err) });
  }
}

module.exports = { handleMercadoChat };
