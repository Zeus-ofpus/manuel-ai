// Voice input: speech-to-text through Groq Whisper. Audio arrives as a base64 data URL
// (webm/opus on Android and desktop, mp4/aac on iPhone), capped to stay under Vercel's body limit.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "Voice isn't set up." }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const m = /^data:([^;,]+)[^,]*;base64,(.+)$/s.exec(String(body.audio || ""));
  if (!m) return json({ error: "No audio." }, 400);
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 800) return json({ text: "" });
  if (buf.length > 3.5 * 1024 * 1024) return json({ error: "That recording is too long. Keep it under a minute." }, 413);
  const ext = mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
  for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
    try {
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: mime }), `voice.${ext}`);
      fd.append("model", model);
      fd.append("response_format", "json");
      fd.append("temperature", "0");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(20000)
      });
      if (!r.ok) { console.warn("transcribe", model, r.status, (await r.text()).slice(0, 200)); continue; }
      const d = await r.json();
      return json({ text: String(d.text || "").trim() });
    } catch (e) { console.warn("transcribe error", model, e?.message || e); }
  }
  return json({ error: "Couldn't hear that. Try again." }, 502);
}
