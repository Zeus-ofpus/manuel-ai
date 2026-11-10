import { SB_URL, SB_SERVICE, json } from "./_sb.mjs";

// Creates an already-confirmed account so people can sign in straight away
// (Supabase's built-in email sender is limited to a few emails an hour).
export async function POST(req) {
  if (!SB_URL || !SB_SERVICE) return json({ error: "Accounts aren't set up yet." }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Enter a valid email." }, 400);
  if (password.length < 8) return json({ error: "Use a password of at least 8 characters." }, 400);

  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: name ? { name } : {} }),
    signal: AbortSignal.timeout(8000)
  });
  if (r.ok) return json({ ok: true });
  const t = await r.text();
  if (r.status === 422 || /already|registered|exists/i.test(t)) return json({ error: "That email already has an account. Sign in instead." }, 409);
  console.warn("signup failed", r.status, t.slice(0, 200));
  return json({ error: "Couldn't create the account. Try again." }, 502);
}
