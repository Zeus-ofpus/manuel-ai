// Natural voice: text-to-speech through Groq Orpheus (max 200 characters per call).
// The client splits replies into short chunks and plays them in order.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const VOICES = new Set(["troy", "austin", "daniel", "autumn", "diana", "hannah"]);

function wavFromPcm(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function geminiSpeak(text, voice, style) {
  const key = process.env.GEMINI_API_KEY; if (!key) return { err: "no key" };
  const errs = [];
  for (const model of ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: style ? `${style}: ${text}` : text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
      signal: AbortSignal.timeout(40000)
    });
    if (!r.ok) { errs.push(model + " " + r.status + " " + (await r.text()).slice(0, 160)); continue; }
    const d = await r.json();
    const part = d?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) { errs.push(model + " no audio"); continue; }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || 24000);
    return { wav: wavFromPcm(Buffer.from(part.inlineData.data, "base64"), rate) };
  }
  return { err: errs.join(" | ") };
}

export async function POST(req) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "Voice isn't set up." }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (body.provider === "gemini") {
    const t = String(body.text || "").trim().slice(0, 1500);
    if (!t) return json({ error: "No text." }, 400);
    const g = await geminiSpeak(t, String(body.voice || "Charon").replace(/[^A-Za-z]/g, ""), String(body.style || "").slice(0, 300));
    if (g.wav) return new Response(g.wav, { status: 200, headers: { "Content-Type": "audio/wav" } });
    return json({ error: "gemini-unavailable", detail: g.err }, 502);
  }
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) return json({ error: "No text." }, 400);
  const voice = VOICES.has(body.voice) ? body.voice : "troy";
  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", voice, input: text, response_format: "wav" }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) { console.warn("speak", r.status, (await r.text()).slice(0, 200)); return json({ error: "voice-unavailable" }, 502); }
    const buf = await r.arrayBuffer();
    return new Response(buf, { status: 200, headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.warn("speak error", e?.message || e);
    return json({ error: "voice-unavailable" }, 502);
  }
}
