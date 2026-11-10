// Image generation and editing.
// 1) Gemini image models (generate + edit an uploaded photo), discovered from the key's model list.
// 2) If Gemini has no quota, new images fall back to Pollinations (free, no key). Edits need Gemini.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const BASE = "https://generativelanguage.googleapis.com/v1beta";
let cachedModels = null;

async function imageModels(key) {
  if (cachedModels) return cachedModels;
  try {
    const r = await fetch(`${BASE}/models?pageSize=200&key=${key}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const names = (d.models || [])
      .filter(m => /image/i.test(m.name) && !/imagen|embed|preview-tts/i.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""));
    // newest first, flash before pro (cheaper / more free quota)
    names.sort((a, b) => (/pro/.test(a) - /pro/.test(b)) || b.localeCompare(a, undefined, { numeric: true }));
    cachedModels = names.length ? names : ["gemini-2.5-flash-image"];
  } catch { cachedModels = ["gemini-2.5-flash-image"]; }
  return cachedModels;
}

async function gemini(key, prompt, image) {
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.b64 } });
  const tried = [];
  for (const model of (await imageModels(key)).slice(0, 4)) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
        signal: AbortSignal.timeout(45000)
      });
      if (!r.ok) { tried.push(`${model}:${r.status}`); console.warn("image gemini", model, r.status, (await r.text()).slice(0, 160)); if (r.status === 400 || r.status === 401 || r.status === 403) continue; continue; }
      const d = await r.json();
      const out = d?.candidates?.[0]?.content?.parts || [];
      const img = out.find(p => p.inlineData || p.inline_data);
      const text = out.filter(p => p.text).map(p => p.text).join(" ").trim();
      if (img) { const i = img.inlineData || img.inline_data; return { image: `data:${i.mimeType || i.mime_type || "image/png"};base64,${i.data}`, text, provider: model }; }
      tried.push(`${model}:noimage`);
    } catch (e) { tried.push(`${model}:err`); console.warn("image gemini error", model, e?.message || e); }
  }
  return { tried };
}

async function pollinations(prompt) {
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(50000) });
  if (r.status === 402 || r.status === 429) { const wait = parseInt(r.headers.get("retry-after") || "45", 10) || 45; throw Object.assign(new Error("busy"), { busy: Math.min(wait, 120) }); }
  if (!r.ok) throw new Error("pollinations " + r.status);
  const type = r.headers.get("content-type") || "image/jpeg";
  if (!type.startsWith("image/")) throw new Error("pollinations not image");
  const buf = Buffer.from(await r.arrayBuffer());
  return { image: `data:${type};base64,${buf.toString("base64")}`, provider: "pollinations" };
}

async function describeForRemix(key, image, change) {
  const ask = `Write one detailed image-generation prompt (max 120 words) that recreates this picture as closely as possible (subject, pose, clothing, colours, setting, lighting, framing, style) but with this change applied: "${change}". Output only the prompt.`;
  for (const model of ["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ask }, { inline_data: { mime_type: image.mime, data: image.b64 } }] }] }),
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) { console.warn("remix describe", model, r.status); continue; }
      const d = await r.json();
      const t = (d?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join(" ").trim();
      if (t) return t.slice(0, 900);
    } catch (e) { console.warn("remix describe error", model, e?.message || e); }
  }
  return "";
}

export async function GET(req) {
  const key = process.env.GEMINI_API_KEY;
  if (new URL(req.url).searchParams.get("models") === "1" && key) return json({ models: await imageModels(key) });
  return json({ ok: true });
}

export async function POST(req) {
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const prompt = String(body.prompt || "").trim().slice(0, 2000);
  if (!prompt) return json({ error: "Say what you want to see." }, 400);
  let image = null;
  if (body.image) {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(body.image));
    if (!m) return json({ error: "That image couldn't be read." }, 400);
    image = { mime: m[1], b64: m[2] };
  }
  const key = process.env.GEMINI_API_KEY;
  const instruction = image
    ? `Edit the attached image as asked, keeping everything else the same. Request: ${prompt}`
    : `Create an image: ${prompt}`;
  if (key) {
    const g = await gemini(key, instruction, image);
    if (g.image) return json(g);
    console.warn("gemini image failed", g.tried?.join(","));
  }
  let genPrompt = prompt; let remix = false;
  if (image) {
    // No free image-editing model: describe the photo with a text model, fold the change in, and redraw it.
    genPrompt = key ? await describeForRemix(key, image, prompt) : "";
    if (!genPrompt) return json({ error: "Photo editing isn't available right now. Ask me to make a new image instead." }, 503);
    remix = true;
  }
  try { return json({ ...(await pollinations(genPrompt)), remix }); }
  catch (e) {
    console.warn("pollinations", e?.message || e);
    if (e.busy) return json({ error: `Manuel's image studio is busy. Try again in about ${e.busy} seconds.` }, 429);
    return json({ error: "Couldn't make that image right now. Try again in a minute." }, 502);
  }
}
