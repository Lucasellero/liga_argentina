// Auth compartida para endpoints que requieren usuario logueado.
// Soporta tokens reales de Supabase y el token "bypass" temporal que emite
// login.html mientras Supabase está degradado (ver docs/login.html,
// ADMIN_BYPASS_USERS) — mismo formato: "bypass." + base64(json) + ".bypass".

function decodeBypassToken(token) {
  if (!token.startsWith('bypass.') || !token.endsWith('.bypass')) return null;
  const middle = token.slice('bypass.'.length, -'.bypass'.length);
  try {
    const payload = JSON.parse(Buffer.from(middle, 'base64').toString('utf8'));
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch (e) {
    return null;
  }
}

async function getAuthedEmail(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const bypassEmail = decodeBypassToken(token);
  if (bypassEmail) return bypassEmail;

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.email ? user.email.toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

module.exports = { getAuthedEmail };
