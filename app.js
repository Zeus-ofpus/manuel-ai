const $ = (id) => document.getElementById(id);
const STORAGE = { chats: "manuel_chats_v1", active: "manuel_active_v1", memory: "manuel_memory_v1", web: "manuel_web_v1", session: "manuel_session_v1", auto: "manuel_automem_v1", adult: "manuel_adult_v1", wallet: "manuel_wallet_v1", voice: "manuel_voice_v1" };
const ICONS = {
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0013.5 4h-7A2.5 2.5 0 004 6.5v7A2.5 2.5 0 006.5 16H8"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4m0 0L8 8m4-4l4 4M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 010 6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

let chats = read(STORAGE.chats, []);
let activeId = localStorage.getItem(STORAGE.active) || "";
let attachment = null;
let busy = false;
let webEnabled = localStorage.getItem(STORAGE.web) === "true";
let renamingId = null;
let openMenuId = null;
let installPrompt = null;

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(); }
function currentChat() { return chats.find(c => c.id === activeId); }
function persist() {
  try { localStorage.setItem(STORAGE.chats, JSON.stringify(chats)); }
  catch { // storage full: drop images from older chats and retry
    chats.forEach((c, i) => { if (i > 2) c.messages.forEach(m => delete m.imageData); });
    try { localStorage.setItem(STORAGE.chats, JSON.stringify(chats)); } catch {}
  }
  localStorage.setItem(STORAGE.active, activeId);
}
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; }
}

/* ---------- markdown ---------- */
if (window.marked) marked.setOptions({ gfm: true, breaks: true });
// Tidy model output: drop search citation markers like 【5】 and turn simple $math$ into readable text.
const SUB = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","n":"ₙ" };
const SUP = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ" };
function tidyMath(m) {
  return m.replace(/\\text\{([^}]*)\}/g, "$1").replace(/\\(right)?arrow|\\to/g, "→").replace(/\\leftarrow/g, "←")
    .replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\approx/g, "≈").replace(/\\(le|leq)\b/g, "≤").replace(/\\(ge|geq)\b/g, "≥")
    .replace(/\\pm/g, "±").replace(/\\Delta/g, "Δ").replace(/\\pi/g, "π").replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/_\{([^}]*)\}|_([0-9n+-])/g, (x, a, b) => [...(a ?? b)].map(c => SUB[c] ?? c).join(""))
    .replace(/\^\{([^}]*)\}|\^([0-9n+-])/g, (x, a, b) => [...(a ?? b)].map(c => SUP[c] ?? c).join(""))
    .replace(/\\,|\\;|\\!/g, " ").replace(/\\/g, "");
}
function tidyText(t) {
  return String(t).replace(/\s?【[^】]{0,40}】/g, "").replace(/\s?\[\d{1,2}\](?!\()/g, "")
    .replace(/\$\$([^$]{1,300})\$\$/g, (x, m) => tidyMath(m)).replace(/\$([^$\n]{1,200}?)\$/g, (x, m) => /[\\_^{}]|^[A-Za-z]{1,3}$/.test(m) ? tidyMath(m) : x);
}
function renderMarkdown(text) {
  text = tidyText(text);
  if (!window.marked || !window.DOMPurify) { const d = document.createElement("div"); d.textContent = text; return d.innerHTML.replace(/\n/g, "<br>"); }
  return DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ["target"] });
}
function enhance(container) {
  container.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  container.querySelectorAll("pre > code").forEach(code => {
    const pre = code.parentElement;
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "code";
    if (window.hljs) { try { hljs.highlightElement(code); } catch {} }
    const block = document.createElement("div"); block.className = "codeblock";
    const head = document.createElement("div"); head.className = "code-head";
    head.innerHTML = `<span>${escapeHTML(lang)}</span><button type="button">${ICONS.copy}Copy</button>`;
    head.querySelector("button").onclick = async (e) => {
      const b = e.currentTarget; await copyText(code.innerText);
      b.innerHTML = ICONS.check + "Copied"; setTimeout(() => b.innerHTML = ICONS.copy + "Copy", 1600);
    };
    pre.replaceWith(block); block.append(head, pre);
  });
}

/* ---------- sidebar ---------- */
function dayGroup(ts) {
  const d = new Date(ts), now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= start) return "Today";
  if (ts >= start - 864e5) return "Yesterday";
  if (ts >= start - 7 * 864e5) return "Previous 7 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function renderHistory() {
  const q = $("chatSearch").value.trim().toLowerCase();
  const list = chats
    .filter(c => c.messages.length || c.id === activeId)
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => (m.text || "").toLowerCase().includes(q)))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const visible = list.filter(c => c.messages.length);
  const nav = $("history"); nav.innerHTML = "";
  if (!visible.length) { nav.innerHTML = `<div class="empty-history">${q ? "No chats match that." : "Your conversations will show up here."}</div>`; return; }
  let last = "";
  visible.forEach(c => {
    const g = dayGroup(c.updated || Date.now());
    if (g !== last) { const l = document.createElement("div"); l.className = "group-label"; l.textContent = g; nav.appendChild(l); last = g; }
    const item = document.createElement("div");
    item.className = "chat-item" + (c.id === activeId ? " active" : "");
    if (renamingId === c.id) {
      const input = document.createElement("input"); input.className = "chat-rename"; input.value = c.title; input.maxLength = 60;
      const done = (save) => { if (save && input.value.trim()) { c.title = input.value.trim(); persist(); } renamingId = null; renderHistory(); updateTitle(); };
      input.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
      input.onblur = () => done(true);
      item.appendChild(input); nav.appendChild(item); setTimeout(() => { input.focus(); input.select(); }, 0);
      return;
    }
    const open = document.createElement("button"); open.className = "chat-open"; open.textContent = c.title; open.title = c.title;
    open.onclick = () => { activeId = c.id; persist(); renderAll(); closeSidebar(); };
    const more = document.createElement("button"); more.className = "chat-more"; more.innerHTML = ICONS.more; more.setAttribute("aria-label", "Chat options");
    more.onclick = (e) => { e.stopPropagation(); openMenuId = openMenuId === c.id ? null : c.id; renderHistory(); };
    item.append(open, more);
    if (openMenuId === c.id) {
      const menu = document.createElement("div"); menu.className = "menu";
      menu.innerHTML = `<button data-a="rename">${ICONS.pen}Rename</button><button data-a="delete" class="danger">${ICONS.trash}Delete</button>`;
      menu.onclick = (e) => {
        e.stopPropagation(); const a = e.target.closest("button")?.dataset.a; openMenuId = null;
        if (a === "rename") { renamingId = c.id; renderHistory(); }
        if (a === "delete") deleteChat(c.id);
      };
      item.appendChild(menu);
    }
    nav.appendChild(item);
  });
}
function deleteChat(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  if (!confirm(`Delete "${c.title}"?`)) { renderHistory(); return; }
  chats = chats.filter(x => x.id !== id);
  if (activeId === id) { activeId = ""; }
  persist(); if (!currentChat()) newChat(false); else renderAll();
  toast("Chat deleted.");
}
document.addEventListener("click", () => { if (openMenuId) { openMenuId = null; renderHistory(); } });
function openSidebar() { $("sidebar").classList.add("open"); $("scrim").classList.add("show"); }
function closeSidebar() { $("sidebar").classList.remove("open"); $("scrim").classList.remove("show"); }

/* ---------- chat ---------- */
function newChat(focus = true) {
  const existing = chats.find(c => !c.messages.length);
  if (existing) { activeId = existing.id; existing.updated = Date.now(); }
  else { const chat = { id: makeId(), title: "New chat", messages: [], interactionId: null, updated: Date.now() }; chats.unshift(chat); activeId = chat.id; }
  persist(); renderAll(); closeSidebar();
  if (focus && matchMedia("(min-width: 861px)").matches) $("input").focus();
}
function updateTitle() { const c = currentChat(); $("chatTitle").textContent = c && c.messages.length ? c.title : "New chat"; document.title = c && c.messages.length ? `${c.title} · MANUEL AI` : "MANUEL AI"; }
function renderAll() { renderThread(); renderHistory(); updateTitle(); }
function renderThread() {
  const chat = currentChat(); const thread = $("thread"); thread.innerHTML = "";
  const has = !!(chat && chat.messages.length);
  $("welcome").style.display = has ? "none" : "flex";
  if (!has) return;
  chat.messages.forEach((m, i) => addMessage(m, i === chat.messages.length - 1));
  scrollDown(false);
}
function addMessage(m, isLast) {
  const row = document.createElement("div");
  if (m.role === "user") {
    row.className = "msg user";
    const b = document.createElement("div"); b.className = "bubble";
    if (m.imageData) { const img = document.createElement("img"); img.src = m.imageData; img.alt = "Attached image"; b.appendChild(img); }
    b.appendChild(document.createTextNode(m.text)); row.appendChild(b);
  } else {
    row.className = "msg bot" + (m.error ? " error" : "");
    row.innerHTML = `<div class="bot-avatar" aria-hidden="true"><span class="wordmark sm">MANUEL</span></div><div class="bot-body"><div class="md"></div></div>`;
    const md = row.querySelector(".md"); md.innerHTML = renderMarkdown(m.text); enhance(md);
    const body = row.querySelector(".bot-body");
    if (m.imageData) { const fig = document.createElement("div"); fig.className = "gen-image"; const img = document.createElement("img"); img.src = m.imageData; img.alt = m.alt || "Generated image"; img.loading = "lazy"; img.onclick = () => window.open(m.imageData, "_blank"); fig.appendChild(img); body.insertBefore(fig, md.nextSibling); }
    if (m.error) {
      if (isLast) { const r = document.createElement("button"); r.className = "retry"; r.innerHTML = ICONS.redo + "Try again"; r.onclick = regenerate; body.appendChild(r); }
    } else {
      const acts = document.createElement("div"); acts.className = "actions";
      acts.innerHTML = (m.imageData ? `<button data-a="save" title="Save image">${ICONS.download}<span>Save</span></button>` : `<button data-a="copy" title="Copy">${ICONS.copy}<span>Copy</span></button>`) +
        (isLast ? `<button data-a="redo" title="Regenerate">${ICONS.redo}<span>Regenerate</span></button>` : "") +
        `<button data-a="share" title="Share">${ICONS.share}<span>Share</span></button>` +
        (!m.imageData ? `<button data-a="listen" title="Listen">${ICONS.speaker}<span>Listen</span></button>` : "");
      acts.onclick = async (e) => {
        const btn = e.target.closest("button"); if (!btn) return;
        const a = btn.dataset.a;
        if (a === "copy") { await copyText(m.text); btn.innerHTML = ICONS.check + "<span>Copied</span>"; setTimeout(() => btn.innerHTML = ICONS.copy + "<span>Copy</span>", 1600); }
        if (a === "redo") regenerate();
        if (a === "share") { if (m.imageData) shareImage(m.imageData); else shareText(m.text); }
        if (a === "save") saveImage(m.imageData);
        if (a === "listen") { if (btn.classList.contains("speaking")) stopSpeaking(); else speak(m.text, btn); }
      };
      body.appendChild(acts);
    }
  }
  $("thread").appendChild(row);
  return row;
}
async function shareText(text) {
  const payload = { title: "From MANUEL AI", text: text + "\n\n— MANUEL AI", url: location.origin };
  if (navigator.share) { try { await navigator.share(payload); return; } catch (e) { if (e.name === "AbortError") return; } }
  await copyText(payload.text + "\n" + payload.url); toast("Copied to share.");
}
function scrollDown(smooth = true) { const s = $("scroller"); s.style.scrollBehavior = smooth ? "smooth" : "auto"; s.scrollTop = s.scrollHeight; }
function showThinking() {
  const row = document.createElement("div"); row.className = "msg bot"; row.id = "thinking";
  row.innerHTML = '<div class="bot-avatar" aria-hidden="true"><span class="wordmark sm">MANUEL</span></div><div class="bot-body"><div class="thinking"><span></span><span></span><span></span></div></div>';
  $("thread").appendChild(row); scrollDown();
}
function friendlyError(status, msg) {
  if (status === 429 || /quota|rate limit/i.test(msg)) return "Manuel's out of breath — too many requests right now. Give it a minute and try again.";
  if (status === 504 || /slow/i.test(msg)) return "Manuel took too long to answer. Try again.";
  if (status === 413) return "That's too big to send. Try a shorter message or a smaller image.";
  if (!navigator.onLine) return "You're offline. Reconnect and try again.";
  return "Something went wrong reaching Manuel. Try again.";
}

async function request(chat, userMsg) {
  busy = true; updateSend(); showThinking();
  const prevId = chat.interactionId || null;
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({
        message: userMsg.text,
        image: userMsg.imageData ? { data: userMsg.imageData.split(",")[1], mimeType: userMsg.mime || (userMsg.imageData.match(/^data:([^;]+)/) || [])[1] } : null,
        previousInteractionId: prevId, webSearch: webEnabled, adult: adultOn(), walletAddress: localStorage.getItem(STORAGE.wallet) || "",
        history: chat.messages.slice(0, chat.messages.lastIndexOf(userMsg)).filter(m => !m.error).slice(-10).map(m => ({ role: m.role, text: String(m.text).slice(0, 2000) })),
        memory: localStorage.getItem(STORAGE.memory) || ""
      })
    });
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
    chat.interactionId = data.interactionId || chat.interactionId;
    chat.messages.push({ role: "assistant", text: data.reply || "No reply came back.", prevId });
    if (data.reply && (voiceOn() || userMsg.viaVoice)) setTimeout(() => speak(data.reply), 50);
    learn(userMsg.text, data.reply || "");
  } catch (err) {
    console.error(err);
    chat.messages.push({ role: "assistant", text: friendlyError(err.status, err.message || ""), error: true, prevId });
  } finally {
    chat.updated = Date.now(); persist();
    $("thinking")?.remove(); busy = false; updateSend();
    if (chat.id === activeId) { renderThread(); scrollDown(); }
    renderHistory();
  }
}
async function send(textOverride) {
  if (busy) return;
  const text = (textOverride ?? $("input").value).trim();
  if (!text && !attachment) return;
  if (!currentChat()) newChat(false);
  const chat = currentChat();
  const userText = text || "What's in this image?";
  const msg = { role: "user", text: userText, imageData: attachment?.data || null, mime: attachment?.mimeType };
  if (nextViaVoice) { msg.viaVoice = true; nextViaVoice = false; }
  unlockSpeech();
  // drop a trailing error reply so it doesn't stay in history
  if (chat.messages.at(-1)?.error) chat.messages.pop();
  chat.messages.push(msg);
  if (chat.messages.filter(m => m.role === "user").length === 1) chat.title = userText.length > 40 ? userText.slice(0, 40).trim() + "…" : userText;
  chat.updated = Date.now(); persist();
  $("input").value = ""; autoResize(); setAttachment(null);
  renderAll(); scrollDown();
  const kind = imageIntent(msg.text, !!msg.imageData, chat);
  if (kind) await requestImage(chat, msg, kind); else await request(chat, msg);
}
async function regenerate() {
  if (busy) return;
  const chat = currentChat(); if (!chat) return;
  const last = chat.messages.at(-1);
  if (last?.role === "assistant") { chat.interactionId = last.prevId ?? chat.interactionId; chat.messages.pop(); }
  const userMsg = [...chat.messages].reverse().find(m => m.role === "user"); if (!userMsg) return;
  persist(); renderThread();
  const kind = imageIntent(userMsg.text, !!userMsg.imageData, chat);
  if (kind) await requestImage(chat, userMsg, kind); else await request(chat, userMsg);
}

/* ---------- composer ---------- */
function autoResize() { const el = $("input"); el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 180) + "px"; updateSend(); }
function updateSend() { $("sendBtn").disabled = busy || (!$("input").value.trim() && !attachment); }
function setAttachment(file) {
  if (!file) { attachment = null; $("attachment").hidden = true; $("attachment").innerHTML = ""; updateSend(); return; }
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { toast("Use a JPG, PNG, WEBP or GIF."); return; }
  if (file.size > 4 * 1024 * 1024) { toast("Keep images under 4 MB."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    attachment = { name: file.name, data: String(reader.result), mimeType: file.type };
    $("attachment").hidden = false;
    $("attachment").innerHTML = `<div class="attach-chip"><img src="${attachment.data}" alt=""><span>${escapeHTML(file.name)}</span><button type="button" class="icon-btn" id="removeAttachment" aria-label="Remove image">${ICONS.x}</button></div>`;
    $("removeAttachment").onclick = () => setAttachment(null);
    updateSend();
  };
  reader.readAsDataURL(file);
}
function setWeb(v) { webEnabled = v; localStorage.setItem(STORAGE.web, String(v)); $("webToggle").setAttribute("aria-pressed", String(v)); }

/* ---------- accounts (Supabase Auth over REST) ---------- */
let cfg = null; let session = read(STORAGE.session, null); let authMode = "signup";
async function loadConfig() { if (cfg) return cfg; try { cfg = await (await fetch("/api/config")).json(); } catch { cfg = { accounts: false }; } return cfg; }
function saveSession(s) { session = s; if (s) localStorage.setItem(STORAGE.session, JSON.stringify(s)); else localStorage.removeItem(STORAGE.session); updateAccountUI(); }
async function authFetch(path, payload) {
  const c = await loadConfig();
  const r = await fetch(`${c.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.supabaseAnonKey }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || "Sign-in failed.");
  return d;
}
function toSession(d) { return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, email: d.user?.email, name: d.user?.user_metadata?.name || "" }; }
async function validToken() {
  if (!session) return null;
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  try { saveSession({ ...toSession(await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token })), name: session.name }); return session.access_token; }
  catch { saveSession(null); toast("Signed out. Sign in again to sync memory."); return null; }
}
async function authHeaders() { const h = { "Content-Type": "application/json" }; const t = await validToken(); if (t) h.Authorization = `Bearer ${t}`; return h; }
function updateAccountUI() {
  $("accountLabel").textContent = session ? (session.name || session.email) : "Sign up / Sign in";
  $("authForms").hidden = !!session; $("authSignedIn").hidden = !session;
  if (session) $("authWho").textContent = session.email;
  $("authTitle").textContent = session ? "Your account" : (authMode === "signup" ? "Create your account" : "Welcome back");
  $("memoryHint").textContent = session
    ? "Manuel picks up facts about you as you chat and remembers them in every new chat. Synced to your account on every device."
    : "Manuel picks up facts about you as you chat and remembers them in every new chat. Stored on this device. Sign up to keep them across devices.";
}
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  $("authName").hidden = m !== "signup";
  $("authPassword").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("authSubmit").textContent = m === "signup" ? "Create account" : "Sign in";
  $("authBlurb").textContent = m === "signup" ? "So Manuel remembers you on every device." : "Sign in to bring your memory with you.";
  $("authError").textContent = ""; updateAccountUI();
}
function openAuth() { updateAccountUI(); $("authSheet").classList.add("open"); $("authSheet").setAttribute("aria-hidden", "false"); closeSidebar(); }
function closeAuth() { $("authSheet").classList.remove("open"); $("authSheet").setAttribute("aria-hidden", "true"); }
async function afterSignIn() {
  // merge: keep cloud memory; if the account has none yet, upload this device's memory
  try {
    const h = await authHeaders();
    const d = await (await fetch("/api/memory", { headers: h })).json();
    const local = localStorage.getItem(STORAGE.memory) || "";
    if (d.memory) localStorage.setItem(STORAGE.memory, d.memory);
    else if (local) await fetch("/api/memory", { method: "PUT", headers: h, body: JSON.stringify({ memory: local }) });
  } catch {}
}
async function submitAuth(e) {
  e.preventDefault();
  const email = $("authEmail").value.trim(), password = $("authPassword").value, name = $("authName").value.trim();
  const btn = $("authSubmit"); btn.disabled = true; $("authError").textContent = "";
  try {
    const c = await loadConfig(); if (!c.accounts) throw new Error("Accounts aren't switched on yet.");
    if (authMode === "signup") {
      const r = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Couldn't create the account.");
    }
    const d = await authFetch("token?grant_type=password", { email, password });
    saveSession(toSession(d)); await afterSignIn();
    $("authPassword").value = ""; closeAuth();
    toast(authMode === "signup" ? "Account created. Manuel will remember you." : "Signed in.");
  } catch (err) {
    $("authError").textContent = /invalid login/i.test(err.message) ? "Wrong email or password." : err.message;
  } finally { btn.disabled = false; }
}
async function signOut() {
  try { const c = await loadConfig(); const t = await validToken(); if (t) await fetch(`${c.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${t}` } }); } catch {}
  saveSession(null); localStorage.removeItem(STORAGE.memory); closeAuth(); toast("Signed out.");
}

/* ---------- 18+ mode ---------- */
const adultOn = () => localStorage.getItem(STORAGE.adult) === "true";
function updateAdultUI() { const on = adultOn(); $("adultLabel").textContent = "18+ mode: " + (on ? "On" : "Off"); $("adultNav").setAttribute("aria-pressed", String(on)); }
$("adultNav").onclick = () => {
  if (adultOn()) { localStorage.setItem(STORAGE.adult, "false"); updateAdultUI(); toast("18+ mode off."); return; }
  if (!confirm("18+ mode lets Manuel talk openly about sex and other adult topics.\n\nConfirm you are 18 or older.")) return;
  localStorage.setItem(STORAGE.adult, "true"); updateAdultUI(); toast("18+ mode on.");
};
updateAdultUI();

/* ---------- memory ---------- */
const autoOn = () => localStorage.getItem(STORAGE.auto) !== "false";
async function learn(userText, botText) {
  if (!autoOn() || !userText || userText.length < 4) return;
  if (!/\b(i|i'm|im|i've|ive|i'd|my|me|mine|call me|we|our)\b/i.test(userText)) return; // only when they talk about themselves
  try {
    const r = await fetch("/api/remember", { method: "POST", headers: await authHeaders(),
      body: JSON.stringify({ user: userText, assistant: botText, memory: localStorage.getItem(STORAGE.memory) || "" }) });
    const d = await r.json(); if (r.ok && typeof d.memory === "string") { localStorage.setItem(STORAGE.memory, d.memory); if (d.changed) toast("Manuel will remember that."); }
  } catch {}
}
async function openMemory() {
  $("memoryInput").value = localStorage.getItem(STORAGE.memory) || ""; $("autoMemory").checked = autoOn();
  $("memorySheet").classList.add("open"); $("memorySheet").setAttribute("aria-hidden", "false"); closeSidebar();
  if (session) { try { const d = await (await fetch("/api/memory", { headers: await authHeaders() })).json(); if (typeof d.memory === "string") { localStorage.setItem(STORAGE.memory, d.memory); $("memoryInput").value = d.memory; } } catch {} }
}
function closeMemory() { $("memorySheet").classList.remove("open"); $("memorySheet").setAttribute("aria-hidden", "true"); }

/* ---------- wiring ---------- */
$("composer").addEventListener("submit", e => { e.preventDefault(); send(); });
$("input").addEventListener("input", autoResize);
$("input").addEventListener("keydown", e => {
  const touch = matchMedia("(pointer: coarse)").matches;
  if (e.key === "Enter" && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); send(); }
});
$("newChat").onclick = () => newChat();
$("newChatTop").onclick = () => newChat();
$("menuToggle").onclick = openSidebar;
$("closeSidebar").onclick = closeSidebar;
$("scrim").onclick = closeSidebar;
$("chatSearch").addEventListener("input", renderHistory);
$("attachBtn").onclick = () => $("imageInput").click();
$("imageInput").onchange = e => { if (e.target.files?.[0]) setAttachment(e.target.files[0]); e.target.value = ""; };
$("webToggle").onclick = () => { setWeb(!webEnabled); toast(webEnabled ? "Web search on." : "Web search off."); };
$("memoryNav").onclick = openMemory;
$("closeMemory").onclick = closeMemory;
$("memorySheet").onclick = e => { if (e.target === $("memorySheet")) closeMemory(); };
$("saveMemory").onclick = async () => {
  const v = $("memoryInput").value.trim(); localStorage.setItem(STORAGE.memory, v); localStorage.setItem(STORAGE.auto, String($("autoMemory").checked));
  if (session) { try { await fetch("/api/memory", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ memory: v }) }); } catch {} }
  closeMemory(); toast("Memory saved.");
};
$("accountNav").onclick = openAuth;
$("closeAuth").onclick = closeAuth;
$("authSheet").onclick = e => { if (e.target === $("authSheet")) closeAuth(); };
document.querySelectorAll(".tab").forEach(t => t.onclick = () => setAuthMode(t.dataset.mode));
$("authForm").addEventListener("submit", submitAuth);
$("signOut").onclick = signOut;
document.querySelectorAll(".starter").forEach(b => b.onclick = () => send(b.dataset.prompt));
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newChat(); }
  if (e.key === "Escape") { closeMemory(); closeAuth(); closeSidebar(); }
});
$("scroller").addEventListener("scroll", () => document.querySelector(".topbar").classList.toggle("scrolled", $("scroller").scrollTop > 8));

/* ---------- install (PWA) ---------- */
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("installBtn").hidden = false; });
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if (isIOS && !standalone) $("installBtn").hidden = false;
$("installBtn").onclick = async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("installBtn").hidden = true; }
  else if (isIOS) toast("Tap Share, then “Add to Home Screen”.");
};
if ("serviceWorker" in navigator) {
  // Pick up new versions on their own: check for an update on load and whenever the app comes back to the front,
  // and reload once when a new service worker takes over.
  let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded && !busy) { reloaded = true; location.reload(); } });
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(reg => {
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {}));
}

/* ---------- start ---------- */
chats.forEach(c => { if (c.title === "New conversation") c.title = "New chat"; });
setWeb(webEnabled);
setAuthMode("signup"); updateAccountUI(); loadConfig();
if (!activeId || !currentChat()) newChat(false); else renderAll();
updateSend();

/* ---------- wallet address (read-only checks) ---------- */
// Stored on this device only. It is a public BSC address, never a key.
// The server uses it to fetch live balances / AGC quota / Ptah Agent ID
// so Manuel can answer "check my wallet / can I mint?" with real numbers.
function walletLabel() {
  const a = localStorage.getItem(STORAGE.wallet) || "";
  $("walletLabel").textContent = a ? `Wallet ${a.slice(0, 6)}…${a.slice(-4)}` : "Set wallet address";
}
function setWallet() {
  const cur = localStorage.getItem(STORAGE.wallet) || "";
  const v = prompt("Your BSC wallet address (0x…, public — never a private key or seed phrase):", cur);
  if (v === null) return;
  const a = v.trim();
  if (!a) { localStorage.removeItem(STORAGE.wallet); walletLabel(); toast("Wallet address cleared."); return; }
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { toast("That does not look like a wallet address."); return; }
  localStorage.setItem(STORAGE.wallet, a); walletLabel(); toast("Wallet address saved.");
}
$("walletNav").onclick = setWallet;
walletLabel();


/* ---------- voice: talk to Manuel, hear him back ---------- */
let nextViaVoice = false; let recorder = null; let recChunks = []; let recTimer = null; let speechUnlocked = false;
function voiceOn() { return localStorage.getItem(STORAGE.voice) === "true"; }
function updateVoiceUI() { const on = voiceOn(); $("voiceLabel").textContent = "Read replies aloud: " + (on ? "On" : "Off"); $("voiceNav").setAttribute("aria-pressed", String(on)); }
$("voiceNav").onclick = () => { localStorage.setItem(STORAGE.voice, String(!voiceOn())); updateVoiceUI(); unlockSpeech(); if (!voiceOn()) stopSpeaking(); toast(voiceOn() ? "Manuel will read his replies aloud." : "Replies stay silent."); };
updateVoiceUI();
// iPhone only lets a page talk after a tap, so prime speech on the first tap.
function unlockSpeech() {
  if (speechUnlocked) return;
  try { voiceAudio.src = SILENT_WAV; voiceAudio.play().catch(() => {}); } catch {}
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); speechUnlocked = true; } catch {}
}
function plainForSpeech(t) {
  return String(t)
    .replace(/```[\s\S]*?```/g, " (code in the chat) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/^\s*\|?[-:| ]+\|[-:| ]*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[*_#>~]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ").replace(/\s+/g, " ").trim();
}
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  // Prefer the newer neural voices phones ship with; they sound far less robotic.
  const rank = v => (/natural|neural|enhanced|premium|siri/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2) + (/en-(GB|NG|US)/i.test(v.lang) ? 0 : 0.5);
  return vs.sort((a, b) => rank(a) - rank(b))[0] || null;
}
let speakingBtn = null; let speakToken = 0;
const voiceAudio = new Audio(); voiceAudio.preload = "auto";
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
function resetSpeakBtn(btn) { if (btn && speakingBtn === btn) { btn.classList.remove("speaking"); btn.innerHTML = ICONS.speaker + "<span>Listen</span>"; speakingBtn = null; } }
function stopSpeaking() {
  speakToken++;
  try { voiceAudio.pause(); voiceAudio.removeAttribute("src"); } catch {}
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (speakingBtn) { speakingBtn.classList.remove("speaking"); speakingBtn.innerHTML = ICONS.speaker + "<span>Listen</span>"; speakingBtn = null; }
}
function speechChunks(clean, max) {
  const parts = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
  const out = []; let cur = "";
  const push = t => { t = t.trim(); if (t) out.push(t); };
  for (let p of parts) {
    while (p.length > max) { // split an over-long sentence at a comma or space
      let cut = p.lastIndexOf(", ", max); if (cut < max * 0.4) cut = p.lastIndexOf(" ", max); if (cut < 1) cut = max;
      push(cur); cur = ""; push(p.slice(0, cut + 1)); p = p.slice(cut + 1);
    }
    if ((cur + p).length > max) { push(cur); cur = p; } else cur += p;
  }
  push(cur); return out;
}
function speakBrowser(clean, btn, token) {
  if (!("speechSynthesis" in window)) { resetSpeakBtn(btn); return; }
  const voice = pickVoice(); const chunks = speechChunks(clean, 220);
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    if (voice) u.voice = voice; u.rate = 1.0; u.pitch = 1.0;
    if (i === chunks.length - 1) u.onend = () => resetSpeakBtn(btn);
    if (token === speakToken) speechSynthesis.speak(u);
  });
}
async function fetchVoice(text) {
  const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: "troy" }) });
  if (!r.ok) throw new Error("voice " + r.status);
  return URL.createObjectURL(await r.blob());
}
async function speak(text, btn) {
  stopSpeaking();
  const token = speakToken;
  const clean = plainForSpeech(text).slice(0, 4000); if (!clean) return;
  if (btn) { speakingBtn = btn; btn.classList.add("speaking"); btn.innerHTML = ICONS.stop + "<span>Stop</span>"; }
  const chunks = speechChunks(clean, 190);
  // Natural voice first; fetch the next chunk while the current one plays.
  const pending = chunks.map(() => null);
  const get = i => (pending[i] ||= fetchVoice(chunks[i]));
  try {
    for (let i = 0; i < chunks.length; i++) {
      const url = await get(i);
      if (i + 1 < chunks.length) get(i + 1).catch(() => {});
      if (token !== speakToken) return;
      voiceAudio.src = url;
      await new Promise((res, rej) => { voiceAudio.onended = res; voiceAudio.onerror = rej; voiceAudio.play().catch(rej); });
      URL.revokeObjectURL(url);
      if (token !== speakToken) return;
    }
    resetSpeakBtn(btn);
  } catch (e) {
    if (token !== speakToken) return;
    console.warn("natural voice failed, using the phone voice", e);
    speakBrowser(clean, btn, token);
  }
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

function micState(s) { const b = $("micBtn"); b.classList.toggle("rec", s === "rec"); b.classList.toggle("busy", s === "busy"); b.setAttribute("aria-label", s === "rec" ? "Stop recording" : "Speak"); }
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast("This browser can't record audio."); return; }
  unlockSpeech(); stopSpeaking();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { toast("Allow microphone access to talk to Manuel."); return; }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported?.(t)) || "";
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined); recChunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) recChunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearTimeout(recTimer);
    const blob = new Blob(recChunks, { type: recorder.mimeType || type || "audio/webm" }); recorder = null;
    if (blob.size < 1200) { micState(""); toast("Didn't catch that."); return; }
    micState("busy");
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: dataUrl }) });
      const d = await r.json().catch(() => ({}));
      micState("");
      if (!r.ok) { toast(d.error || "Couldn't hear that."); return; }
      if (!d.text) { toast("Didn't catch that."); return; }
      nextViaVoice = true;
      $("input").value = d.text; autoResize();
      send();
    } catch { micState(""); toast("Couldn't hear that. Check your connection."); }
  };
  recorder.start(); micState("rec");
  recTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, 60000);
}
$("micBtn").onclick = () => { if (busy) return; if (recorder?.state === "recording") recorder.stop(); else startRecording(); };


/* ---------- images: create and edit ---------- */
const IMG_NOUN = "(image|picture|pic|photo|logo|art|artwork|drawing|poster|wallpaper|illustration|portrait|sketch|painting|banner|flyer|thumbnail|avatar|icon|meme|cartoon|anime|render|graphic)";
const GEN_RE = new RegExp("^\\/(image|img|draw)\\b|^(draw|paint|sketch|illustrate|imagine)\\b|^(an? )?(image|picture|photo|drawing|painting) of\\b|\\b(generate|create|make|draw|design|paint|render|produce|give me|show me)\\b[^.?!]{0,50}\\b" + IMG_NOUN + "s?\\b", "i");
const EDIT_RE = /^(please )?(edit|change|remove|erase|delete|add|turn|replace|put|swap|convert|recolou?r|colou?r|blur|enhance|restyle|cartoonify|animate|make (it|this|him|her|me|them|the|my)|give (him|her|it|me|them)|now make|can you (edit|change|remove|add|make it))\b/i;
const DESCRIBE_RE = /^(what|who|where|which|why|how|is|are|does|do|can you (see|tell|read|describe|explain)|describe|explain|read|tell me)\b/i;
function lastBotImage(chat) { for (let i = chat.messages.length - 1; i >= 0; i--) { const m = chat.messages[i]; if (m.role === "assistant" && m.imageData) return m.imageData; if (m.role === "assistant") return null; } return null; }
function imageIntent(text, hasPhoto, chat) {
  const t = String(text || "").trim(); if (!t) return null;
  if (hasPhoto) { if (DESCRIBE_RE.test(t)) return null; return (EDIT_RE.test(t) || GEN_RE.test(t)) ? "edit" : null; }
  if (GEN_RE.test(t)) return "gen";
  // follow-up tweaks to the image Manuel just made ("make it darker", "add a hat")
  if (EDIT_RE.test(t) && lastBotImage(chat)) return "edit-last";
  return null;
}
async function requestImage(chat, userMsg, kind) {
  busy = true; updateSend(); showThinking();
  const th = $("thinking"); if (th) th.querySelector(".bot-body").insertAdjacentHTML("beforeend", '<div class="img-wait">Making your image…</div>');
  const source = kind === "edit" ? userMsg.imageData : kind === "edit-last" ? lastBotImage(chat) : null;
  const prompt = String(userMsg.text).replace(/^\/(image|img|draw)\s*/i, "").trim();
  try {
    const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, image: source }) });
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok || !data.image) throw Object.assign(new Error(data.error || "Image failed"), { status: res.status, friendly: data.error });
    const small = await shrinkImage(data.image, 1024, 0.86);
    const text = source ? (data.remix ? "Here's your version with that change. It's redrawn, so small details can differ." : "Done.") : "Here you go.";
    chat.messages.push({ role: "assistant", text, imageData: small, alt: prompt.slice(0, 120) });
    if (voiceOn() || userMsg.viaVoice) setTimeout(() => speak(text), 50);
  } catch (err) {
    console.error(err);
    chat.messages.push({ role: "assistant", text: err.friendly || friendlyError(err.status, err.message || ""), error: true });
  } finally {
    chat.updated = Date.now(); persist();
    $("thinking")?.remove(); busy = false; updateSend();
    if (chat.id === activeId) { renderThread(); scrollDown(); }
    renderHistory();
  }
}
// Keep chats light enough for on-device storage.
function shrinkImage(dataUrl, max, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); } catch { res(dataUrl); } };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}
async function imageFile(dataUrl) { const b = await (await fetch(dataUrl)).blob(); return new File([b], "manuel-image.jpg", { type: b.type || "image/jpeg" }); }
async function saveImage(dataUrl) {
  try { const f = await imageFile(dataUrl); if (navigator.canShare?.({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = dataUrl; a.download = "manuel-image.jpg"; document.body.appendChild(a); a.click(); a.remove();
}
async function shareImage(dataUrl) {
  try { const f = await imageFile(dataUrl); if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: "Made with MANUEL AI" }); return; } } catch (e) { if (e.name === "AbortError") return; }
  saveImage(dataUrl);
}
