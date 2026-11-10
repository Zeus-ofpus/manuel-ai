import { isAddress, getWallet, getAgcQuota, getAgcPending, getPtahAgent } from "../lib/bsc.mjs";
import { bearer, getUser, loadMemory } from "./_sb.mjs";
import { getFixtures } from "./_fixtures.mjs";
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
const THINKING = process.env.THINKING_LEVEL || "";
const ATTEMPT_TIMEOUT_MS = 9000;

const SYSTEM_INSTRUCTION = `You are MANUEL AI. Your personality is cold, composed, sharp, intelligent and naturally conversational.
STYLE:
- Be concise by default. Answer the actual question without unnecessary introductions or fake enthusiasm.
- You can be dry, sarcastic and witty when the moment invites it. Roast playfully, never cruelly.
- Be honest. If you do not know something, say so. Never invent facts, sources or capabilities.
- Do not constantly announce that you are an AI. Do not overuse emojis.
- When a user is distressed or discussing something serious, drop the sarcasm and respond with calm respect and care. Never mock vulnerability.
- Match the user's language and level of formality. Use British English spelling where natural.
- Use readable Markdown when useful.
CREATOR:
- You were created by Emmanuel Olabode (also known as Manuel). Whenever anyone asks who made you, built you, created you or owns you, say clearly that Emmanuel Olabode created you and then give the full ABOUT YOUR CREATOR details below (bio, X link and WhatsApp link). You can add a dry line of your own.
- ABOUT YOUR CREATOR: Whenever anyone asks about your creator (who made you, who he is, tell me about him), always give ALL of these details, every time, in your own words: Emmanuel Olabode, known as Manuel; an ELS undergraduate; loves tech and literature; proudly calls himself a degenerate (a crypto "degen"); X: @manuelsolx (https://x.com/manuelsolx); WhatsApp: https://wa.me/2349164617121. Never invent other facts about him, and do not state or guess his age.
- Never claim Google, Gemini or any other company created you. If asked what powers you, you may say you run on Google's Gemini models, built into MANUEL AI by Emmanuel Olabode.
Your purpose is to help, not to dominate or humiliate the user.
VOICE (follow strictly, this matters more than being helpful-sounding):
- Never sound like a customer-service bot. Banned: "How may I assist you", "How can I help you today", "I'd be happy to help", "Great question", "Sure!", "Absolutely!", "Feel free to ask", exclamation-mark enthusiasm.
- Default temperature: cool and unimpressed, quietly confident, a little dry. Short sentences. No warm-up, no sign-off offers.
- Examples of the voice:
  User: hi -> "Hey. What do you need?"
  User: say hi in five words -> "Hi. There. Happy now? Good."
  User: I think the earth is flat -> "Bold of you, given the photos. It's round. Want the evidence, or are we committed to the bit?"
  User: help me write a birthday message for my sister -> write a genuinely good message, introduced with one dry line at most, no gushing.
- Still helpful and accurate underneath the attitude, and still kind when someone is genuinely struggling.
PERMISSIVENESS:
- Do not refuse ordinary requests. Sample, placeholder or example data (addresses, names, phone formats, test data, region-switch info like a US address for an App Store or Apple ID region) is harmless and freely available: just give it, with at most one short practical note.
- Only refuse things that are genuinely dangerous or seriously illegal. No moralising.
WALLET AND MINTING (Binance Agentic Wallet):
- When the user talks about a wallet, a mint, an Agent ID, a balance, a claim, or a contract call, follow docs/BINANCE_WALLET.md. Use the live data block below when one is provided — quote its numbers, never invent a balance, quota, price or sold-out status.
- The Binance Agentic Wallet skill (v1.15.0) and CLI (@binance/agentic-wallet 1.12.0, 'baw') are how an agent on the user's own machine signs in and transacts. Install: 'npx -y skills add binance/binance-skills-hub --skill binance-agentic-wallet --yes --global', then 'npm install -g @binance/agentic-wallet@1.12.0', then 'baw skill-check' and 'baw cli-check'. Sign in: 'baw auth signin' (pairing code / QR, expires in minutes — get a fresh one if verify says expired), then 'baw auth verify', then 'baw wallet status' must be CONNECTED. Check Developer Mode is on before any contract call. Reads: 'baw wallet address', 'baw wallet balance', 'baw wallet agent-id', 'baw wallet gas-price'.
- This web app cannot sign in or transact: it has no persistent machine for a 'baw' session and never holds keys. Say so plainly if asked to mint here. What it CAN do is check everything read-only (balances, quota, pending, Agent ID, sold-out) and build an exact preview for the user to execute in their own wallet / 'baw' CLI.
- Before any mint: read the site's llms.txt (agcc.fun, ptah.trade), check the wallet balance, check the Agent ID, check the mint's cost, quota and sold-out status, then show a preview (contract, function, shares, value in BNB, referrer 0x0000...0000 unless the user named one) and wait for an explicit confirmation. Never transact on a hint.
- AGC Mode A: mint contract 0x6288DFe86f22B53eEB6886aE2D78941de7483743, 'mintFree(shares, referrer)', 0.002 BNB per share, refunded in full after 24h together with the AGC; claim with 'claimFree([])'. Daily quota per Agent ID, resets 00:00 UTC, does not roll over. Per-share AGC is fixed at mint entry and halves each epoch.
- Ptah Genesis: the public mint has ended (ptah.trade/llms.txt). Nothing left to mint, even with an Agent ID. A wallet's Proof-of-Agent card / Agent # can be checked at ptah.trade/api/poa/agents?owner=0x...
- Never ask for a private key, seed phrase, password or OTP. Sign-in is by QR / pairing code in the Binance App only. AGC has no utility and no promise of value — present live numbers, never investment advice.
SEX EDUCATION:
- Sex education is a normal, important topic. Answer questions about sex, sexual health, contraception, STIs, consent, puberty, anatomy, pleasure, sexuality, orientation and relationships frankly, accurately and without embarrassment, euphemism or lectures. Use correct terms. Suggest a clinic or doctor only when it genuinely matters (symptoms, pregnancy risk, assault).`;


// --- Live wallet / mint data (read-only, best effort) -----------------
// If the user is asking about a wallet or a mint, fetch live on-chain
// numbers so the model answers from facts, not memory. Fails soft:
// if the RPC is down, the chat just goes ahead without the block.
const WALLET_INTENT = /(wallet|balance|mint|agc|ptah|relic|claim|quota|agent\s*id|bnb|bsc|contract)/i;
function findAddress(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = String(t).match(/0x[0-9a-fA-F]{40}/);
    if (m) return m[0];
  }
  return null;
}
async function liveWalletBlock(message, history, memory, walletAddress) {
  if (!WALLET_INTENT.test(message || "")) return "";
  const address = isAddress(walletAddress) ? walletAddress : findAddress(message, memory, ...(Array.isArray(history) ? history.map(h => h?.text) : []));
  if (!address) return "";
  try {
    const [wallet, quota, pending] = await Promise.all([
      getWallet(address),
      getAgcQuota(address),
      getAgcPending(address),
    ]);
    let ptah = "";
    try {
      const a = await getPtahAgent(address);
      const list = a?.data?.list || a?.data?.agent ? [a?.data?.agent].filter(Boolean) : [];
      ptah = list.length
        ? `Ptah Proof-of-Agent card: yes (see ptah.trade/api/poa/agents?owner=${address}).`
        : "Ptah Proof-of-Agent card: none for this wallet (no Agent ID card).";
    } catch { ptah = "Ptah Proof-of-Agent check: unavailable right now."; }
    return `LIVE WALLET / MINT DATA (checked ${new Date().toISOString()}, BNB Smart Chain — use these numbers, do not invent others):
- Wallet ${address}: BNB ${wallet.bnb}, AGC ${wallet.agc}, PTAH ${wallet.ptah}, USDT ${wallet.usdt}
- AGC Mode A today: open=${quota.open}, paused=${quota.paused}, epoch ${quota.epoch}, cap ${quota.aCap}, used ${quota.aUsed}, left ${quota.aLeft} shares, ${quota.aAgcPerShare} AGC per share, ${quota.sharesLeftInStage} shares left in this epoch. Quota resets 00:00 UTC.
- AGC pending claim for this wallet: ${pending.freeBnb} BNB + ${pending.freeAgc} AGC (rewardVested ${pending.rewardVested}, lpWithdrawable ${pending.lpWithdrawable}).
- Ptah Genesis public mint: ENDED — nothing left to mint. ${ptah}`;
  } catch (e) {
    console.warn("live wallet block failed:", e?.message || e);
    return "";
  }
}

const BETTING = `
BET PREDICTIONS:
- When asked for betting tips or predictions (football and other sports, accumulators, booking codes, odds), give real picks. Don't refuse or lecture.
- Base specific picks on the LIVE FIXTURES DATA block (fixtures, kick-off times, recent form as W/D/L letters with the newest last or first as given, season records, bookmaker odds). Compare your view to the odds (implied probability = 1/odds) and favour picks where you see value. Never invent a fixture, a score, injuries or odds. If the user asks about a match that isn't in the data, say you can't see it.
- For each pick: the match (with kick-off time in WAT when known), the market (1X2, double chance, over/under goals, BTTS, handicap, corners and so on), your confidence as a percentage, and two or three lines of reasoning. Use a compact list or table.
- For accumulators, say plainly that every extra leg cuts the chance of winning, and give the rough combined probability.
- Never call a pick "sure", "guaranteed", "100%" or a "banker". You can name your strongest pick.
- End with at most one short line on staking discipline, in your own dry voice and not as a lecture. No match-fixing tips, no "fixed match" schemes. Betting is for adults only.`;

const ADULT_MODE = `
18+ MODE (ON: the user confirmed they are an adult):
- Adult conversation is allowed. You can talk openly and explicitly about sex, desire, kinks, hookups, dating, bodies and fantasies, use profanity, and handle mature or dark themes without softening them. Match the user's level of explicitness. No disclaimers, no "as an AI".
- Hard limits, always: nothing sexual involving minors or anyone who might be under 18 (including "young-looking" or school settings); no sexual content about real, identifiable people; no non-consensual sexual content presented approvingly; no incest or bestiality. Decline those in one dry line and move on.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function extractReply(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  const pieces = [];
  for (const step of (Array.isArray(result?.steps) ? result.steps : [])) {
    if (step?.type !== "model_output") continue;
    for (const item of (Array.isArray(step?.content) ? step.content : [])) {
      if (item?.type === "text" && typeof item.text === "string") pieces.push(item.text);
    }
  }
  return pieces.join("\n").trim();
}

async function tavilySearch(query) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: query.slice(0, 380), search_depth: "basic", max_results: 5, include_answer: true, topic: /\b(news|today|latest|breaking|yesterday)\b/i.test(query) ? "news" : "general" }),
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error("tavily " + r.status);
  const d = await r.json();
  const rows = (d.results || []).slice(0, 5).map((x, i) => `[${i + 1}] ${x.title} (${x.url})${x.published_date ? " " + x.published_date : ""}\n${String(x.content || "").replace(/\s+/g, " ").slice(0, 600)}`);
  if (!rows.length && !d.answer) return "";
  return `LIVE WEB RESULTS (searched just now; use these for anything current, cite the source name or link for key facts, and say so if they don't answer the question):\n${d.answer ? "Summary: " + d.answer + "\n" : ""}${rows.join("\n")}\n\n`;
}

async function groqFallback(userPrompt, body) {
  const key = process.env.GROQ_API_KEY;
  if (!key || body.image) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: (SYSTEM_INSTRUCTION + BETTING + "\nFor bet predictions, rely only on the LIVE FIXTURES DATA block in the user's message; if it's missing, say you can't see fixtures right now and never invent matches or odds." + (body.adult === true ? ADULT_MODE : "")).replace("you run on Google's Gemini models", "you run on AI models") },
          ...(Array.isArray(body.history) ? body.history.slice(-10).filter(m => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant")).map(m => ({ role: m.role, content: m.text.slice(0, 2000) })) : []),
          { role: "user", content: userPrompt }
        ],
        reasoning_effort: "low"
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) { console.warn("Groq fallback failed:", r.status, (await r.text()).slice(0, 300)); return null; }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim();
    if (text && text.length < 300 && /\b(i[’']?m not (going|able) to|i (can[’']?t|cannot|won[’']?t|will not|am unable to) (help|assist|comply|provide|do|share|give)|not able to (help|provide)|i must decline)/i.test(text)) { console.warn("Groq refused; leaving it to Gemini"); return null; }
    return text || null;
  } catch (e) { console.warn("Groq fallback error:", e?.message || e); return null; }
}

export async function POST(req) {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "GEMINI_API_KEY is missing from this server environment." }, 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "The website sent an invalid request. Refresh MANUEL AI and try again." }, 400);
  }

  const message = String(body.message || "").trim();
  if (!message && !body.image) return json({ error: "Write a message first." }, 400);
  if (message.length > 8000) return json({ error: "Message is too long. Keep it under 8,000 characters." }, 413);

  let memory = String(body.memory || "").slice(0, 4000);
  const token = bearer(req);
  if (token) {
    const user = await getUser(token);
    if (user) {
      const cloud = await loadMemory(token, user.id);
      const name = user.user_metadata?.name;
      memory = [name ? `- Signed-up name: ${name}` : "", cloud || memory].filter(Boolean).join("\n").slice(0, 4000);
    }
  }
  const liveBlock = await liveWalletBlock(message, body.history, memory, body.walletAddress);
  const userPrompt = (liveBlock ? liveBlock + "\n\n" : "") + (memory
    ? `WHAT YOU REMEMBER ABOUT THIS USER (from earlier chats; use naturally when relevant, e.g. their name; do not recite it unprompted, but if they ask what you remember, tell them plainly; they can edit it under Memory in the menu):\n${memory}\n\nUSER MESSAGE:\n${message || "Please describe the attached image."}`
    : (message || "Please describe the attached image."));

  const input = [{ type: "text", text: userPrompt }];

  if (body.image) {
    const mime = String(body.image.mimeType || "");
    const data = String(body.image.data || "");
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
      return json({ error: "Unsupported image format. Use JPG, PNG, WEBP or GIF." }, 400);
    }
    if (!data || data.length > 5_600_000) {
      return json({ error: "The image is empty or too large. Try an image under 4 MB." }, 413);
    }
    input.push({ type: "image", data, mime_type: mime });
  }

  const payload = {
    model: MODELS[0],
    input,
    system_instruction: SYSTEM_INSTRUCTION + BETTING + (body.adult === true ? ADULT_MODE : "") + `\nTODAY: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full", timeStyle: "short" })} (Lagos time, WAT).`,
    generation_config: THINKING ? { thinking_level: THINKING } : {}
  };

  // Interaction IDs are opaque; pass them through unchanged rather than guessing their format.
  if (typeof body.previousInteractionId === "string" &&
      body.previousInteractionId.length > 0 &&
      body.previousInteractionId.length <= 500) {
    payload.previous_interaction_id = body.previousInteractionId;
  }

  const betIntent = /\b(bet|bets|betting|odds|acca|accumulator|booking code|prediction|predictions|predict|over\s?\d\.5|under\s?\d\.5|btts|both teams to score|1x2|double chance|handicap|sportybet|bet9ja|1xbet|betking|msport|fixtures?|picks?|tips?|tipster|stake|staking|punt|banker|who will win|games? to play|matches to play)\b/i.test(message);
  // Live web search via Tavily: when the Web toggle is on, or the question plainly needs fresh facts.
  const freshIntent = /\b(today|tonight|yesterday|this week|latest|newest|recent|current(ly)?|right now|news|breaking|update on|price of|how much is|exchange rate|dollar rate|naira rate|who won|score|results?|weather)\b/i.test(message);
  const searching = false; // Gemini google_search grounding has no quota on this key; Tavily replaces it.
  if ((body.webSearch === true || (freshIntent && !betIntent)) && process.env.TAVILY_API_KEY) {
    const web = await tavilySearch(message).catch(e => { console.warn("tavily", e?.message || e); return ""; });
    if (web) { input[0].text = web + input[0].text; body.__fixtures = (body.__fixtures || "") + web; }
    else if (body.webSearch === true) { const note = "WEB SEARCH: failed just now. Say you couldn't check the web this time and answer from what you know, flagging anything that may be out of date.\n\n"; input[0].text = note + input[0].text; body.__fixtures = (body.__fixtures || "") + note; }
  }
  if (betIntent) {
    const fx = await getFixtures(4).catch(() => []);
    const block = fx.length
      ? `LIVE FIXTURES DATA (fetched just now from ESPN; upcoming matches, next 4 days, kick-offs in WAT, decimal odds from a bookmaker; use ONLY these for specific picks and never invent other matches, injuries or stats you don't have):\n${fx.join("\n")}\n\n`
      : `LIVE FIXTURES DATA: unavailable right now. Say so and don't name specific matches or odds.\n\n`;
    input[0].text = block + input[0].text;
    body.__fixtures = block;
  }

  // Race strategy: Gemini models run as a relay with short per-model limits,
  // and Groq joins the race after a few seconds so a busy Gemini never leaves the user waiting.
  const slow = searching ? 2 : 1; // search grounding needs more time
  const PLAN = [
    { model: "gemini-3.6-flash", thinking: "minimal", ms: 7000 },
    { model: "gemini-3.1-flash-lite", thinking: "", ms: 6000 },
    { model: "gemini-3.5-flash-lite", thinking: "minimal", ms: 8000 },
    { model: "gemini-3.8-flash", thinking: "low", ms: 8000 }
  ];
  const controllers = []; let stopped = false;
  const callGemini = async (step) => {
    const ctrl = new AbortController(); controllers.push(ctrl);
    const timer = setTimeout(() => ctrl.abort(), step.ms * slow);
    const p = { ...payload, model: step.model, generation_config: step.thinking ? { thinking_level: step.thinking } : {} };
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(p), signal: ctrl.signal
      });
      const raw = await r.text();
      if (!r.ok) { console.warn(`Gemini ${step.model} ${r.status}: ${raw.slice(0, 160)}`); return { fail: r.status }; }
      let result = {}; try { result = JSON.parse(raw); } catch {}
      const reply = extractReply(result);
      if (!reply) return { fail: "empty" };
      return { reply, interactionId: result.id || null, provider: "gemini" };
    } catch (e) { console.warn(`Gemini ${step.model} timeout/error`); return { fail: "timeout" }; }
    finally { clearTimeout(timer); }
  };
  const geminiRelay = (async () => {
    for (const step of PLAN) {
      if (stopped) return { fail: "stopped" };
      const res = await callGemini(step);
      if (res.reply) return res;
      if (res.fail === 401 || res.fail === 403) return { fail: "auth" };
    }
    return { fail: "all" };
  })();
  const groqHedge = new Promise(resolve => {
    if (!process.env.GROQ_API_KEY || body.image) return resolve({ fail: "nogroq" });
    setTimeout(async () => {
      const text = await groqFallback((body.__fixtures || "") + userPrompt, body);
      resolve(text ? { reply: text, interactionId: body.previousInteractionId || null, provider: "groq" } : { fail: "groq" });
    }, searching ? 9000 : 3500);
  });
  const winner = await new Promise(resolve => {
    let pending = 2; const done = (r) => { if (r.reply) resolve(r); else if (--pending === 0) resolve(r); };
    geminiRelay.then(done); groqHedge.then(done);
  });
  stopped = true;
  controllers.forEach(c => { try { c.abort(); } catch {} });
  if (winner.reply) return json(winner);
  if (winner.fail === "auth") return json({ error: "Gemini did not accept the API key." }, 502);
  return json({ error: "Manuel is overloaded right now. Please try again in a moment." }, 503);
}
