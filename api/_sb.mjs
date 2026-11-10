// Shared Supabase helpers (underscore prefix: not exposed as a route).
export const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
export const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export function bearer(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

// Returns the signed-in user ({id,email,...}) for a token, or null.
export async function getUser(token) {
  if (!token || !SB_URL || !SB_ANON) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Row-level-security scoped REST calls, made as the user.
function rest(token, path, init = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(5000)
  });
}

export async function loadMemory(token, userId) {
  try {
    const r = await rest(token, `memories?user_id=eq.${encodeURIComponent(userId)}&select=facts`);
    if (!r.ok) return "";
    const rows = await r.json();
    return rows?.[0]?.facts || "";
  } catch { return ""; }
}

export async function saveMemory(token, userId, facts) {
  const r = await rest(token, "memories?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, facts: String(facts || "").slice(0, 4000), updated_at: new Date().toISOString() })
  });
  return r.ok;
}
