import { json, bearer, getUser, loadMemory, saveMemory } from "./_sb.mjs";

const PROMPT = `You maintain a short memory file about ONE user of a chatbot called Manuel.
You get the current memory and the latest exchange. Return the UPDATED memory.
Rules:
- Keep only durable, useful facts the USER revealed about themselves: name, what they like to be called, where they're from, studies/work, interests, goals, ongoing projects, preferences for how Manuel should reply, important people they mention.
- One fact per line, each starting with "- ". Plain, short, third person ("- Name is Tobi").
- Merge and update: if a new fact contradicts an old one, replace the old one. No duplicates. At most 30 lines.
- Never store passwords, card numbers, codes, keys, seed phrases, or exact home addresses.
- Ignore facts about Manuel itself, hypotheticals, role-play, and sample data the user asked for.
- If nothing new and durable was revealed, return the current memory unchanged.
- Output ONLY the memory lines (or the single word EMPTY if there is nothing at all). No commentary.`;

export async function POST(req) {
  const key = process.env.GROQ_API_KEY;
  let body; try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const token = bearer(req); const user = token ? await getUser(token) : null;
  const current = user ? await loadMemory(token, user.id) : String(body.memory || "").slice(0, 4000);
  const userText = String(body.user || "").slice(0, 2000);
  const botText = String(body.assistant || "").slice(0, 1200);
  if (!key || !userText) return json({ memory: current, changed: false });

  let updated = current;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MEMORY_MODEL || "openai/gpt-oss-20b",
        reasoning_effort: "low",
        temperature: 0.2,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: `CURRENT MEMORY:\n${current || "EMPTY"}\n\nLATEST EXCHANGE:\nUser: ${userText}\nManuel: ${botText}` }
        ]
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (r.ok) {
      const d = await r.json();
      let out = String(d?.choices?.[0]?.message?.content || "").trim();
      if (/^EMPTY$/i.test(out)) out = "";
      const lines = out.split("\n").map(s => s.trim()).filter(s => s.startsWith("- ")).slice(0, 30);
      if (lines.length || !out) updated = lines.join("\n");
      if (!lines.length && current) updated = current; // never wipe memory on a bad answer
    } else console.warn("remember: groq", r.status);
  } catch (e) { console.warn("remember error", e?.message || e); }

  const changed = updated.trim() !== current.trim();
  if (changed && user) await saveMemory(token, user.id, updated);
  return json({ memory: updated, changed });
}
