// Función serverless única (Vercel) para endpoints admin del dashboard.
// vercel.json redirige /api/:path* -> /api/index, así que todo entra acá y
// rutea a mano según req.url.
//
// Env vars requeridas (Vercel > Project Settings > Environment Variables):
//   SUPABASE_URL     - misma URL pública usada en docs/login.html
//   SUPABASE_ANON_KEY- misma anon key pública usada en docs/login.html
//   ADMIN_EMAILS     - emails admin separados por coma
//   GH_PLACAS_TOKEN  - GitHub PAT fine-grained, permiso "Actions: Read and write"
//                      sobre el repo Lucasellero/liga_argentina únicamente
//   ANTHROPIC_API_KEY- key de console.anthropic.com, para el chat del tab Mercado
//                      (ver api/lib/mercado-chat.js)

const { handleMercadoChat } = require('./lib/mercado-chat');

const GITHUB_OWNER = 'Lucasellero';
const GITHUB_REPO = 'liga_argentina';
const WORKFLOW_FILE = 'placas.yml';
const LIGAS_VALIDAS = new Set(['liga_nacional', 'liga_argentina']);

async function getAuthedEmail(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user.email.toLowerCase() : null;
}

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email);
}

async function handleGeneratePlacas(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const liga = body.liga;
  if (!LIGAS_VALIDAS.has(liga)) {
    res.status(400).json({ error: 'liga_invalida' });
    return;
  }

  // Chequeo de auth desactivado temporalmente: Supabase está caído hasta el
  // 11/08. Reactivar (descomentar) el bloque de abajo cuando vuelva a andar.
  // const email = await getAuthedEmail(req);
  // if (!email) {
  //   res.status(401).json({ error: 'no_autenticado' });
  //   return;
  // }
  // if (!isAdminEmail(email)) {
  //   res.status(403).json({ error: 'no_autorizado' });
  //   return;
  // }

  const ghToken = process.env.GH_PLACAS_TOKEN;
  if (!ghToken) {
    res.status(500).json({ error: 'gh_token_no_configurado' });
    return;
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs: { liga, hours: '24' } }),
    }
  );

  if (!ghRes.ok) {
    const detail = await ghRes.text();
    res.status(502).json({ error: 'github_dispatch_failed', detail });
    return;
  }

  res.status(202).json({ ok: true });
}

module.exports = async (req, res) => {
  const path = (req.url || '').split('?')[0];

  if (path === '/api/placas/generate') {
    try {
      await handleGeneratePlacas(req, res);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', detail: String(err && err.message || err) });
    }
    return;
  }

  if (path === '/api/mercado/chat') {
    await handleMercadoChat(req, res);
    return;
  }

  res.status(404).json({ error: 'not_found' });
};
