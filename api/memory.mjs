import { json, bearer, getUser, loadMemory, saveMemory } from "./_sb.mjs";

export async function GET(req) {
  const token = bearer(req); const user = await getUser(token);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json({ memory: await loadMemory(token, user.id) });
}

export async function PUT(req) {
  const token = bearer(req); const user = await getUser(token);
  if (!user) return json({ error: "Sign in first." }, 401);
  let body; try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const ok = await saveMemory(token, user.id, String(body.memory || ""));
  return ok ? json({ ok: true }) : json({ error: "Couldn't save memory." }, 502);
}
