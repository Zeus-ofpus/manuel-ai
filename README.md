# Manuel AI — Victory State of Mind

**Free AI chat assistant built in Nigeria, for students and everyday people on mobile data.**

Live: **https://manuel.qd.je** (mirror: https://manuel-ai.vercel.app)

Built by **Emmanuel Olabode** (@manuelsolx), English & Literary Studies student, Ekiti State University (EKSU), Nigeria.
STEM2Connect AI Hackathon 2026 — primary track: **Community Impact** (secondary: Education).

---

## The problem

Most Nigerians reach the internet through a phone and pay for every megabyte. The best AI assistants often need paid plans, foreign cards, or heavy apps, and they don't know local context. Students at Nigerian universities need help with notes, essays, research and everyday questions, but many can't pay $20 a month for it.

## What Manuel does

- **Chat** with a sharp, honest personality (dry wit, but calm and kind when someone is struggling). British English spelling, answers in the user's language and register.
- **Live web search** for current events and facts (Tavily), with sources folded into the answer.
- **Voice**: speak to it (speech-to-text) and have replies read aloud (text-to-speech).
- **Image generation** from a prompt.
- **Football data**: fixtures, odds and form from 12 leagues, with honest, non-guaranteed analysis (never "sure wins").
- **Accounts and memory**: optional sign-up so Manuel remembers what you tell it (Supabase with row-level security).
- **Installable app (PWA)**: works like an app from the home screen, light on data (whole interface ~100 KB of our own front-end code).
- **Welcome intro**: Zeus summons lightning with a thunder crack. "Victory State of Mind" (V.S.O.M).
- **Read-only crypto wallet checks** (BNB Chain): balances and mint status; Manuel never signs transactions or holds keys.

Early analytics (Vercel, first week): 96% of visitors from Nigeria, 96% on mobile.

## How it uses AI

| Feature | AI service |
|---|---|
| Chat (primary) | Google Gemini (flash models), raced against a fallback |
| Chat (fallback, fast) | Groq — `openai/gpt-oss-120b` |
| Web search grounding | Tavily Search API |
| Voice in | Groq Whisper |
| Voice out | Groq Orpheus TTS |
| Images | Gemini image models, Pollinations fallback |

The chat function sends the request to a chain of Gemini models and starts Groq after ~3.5 s; the first good answer wins. This keeps replies around 4 seconds even when a free tier is congested.

## Run it yourself

Requirements: Node 18+, a free Vercel account, and free API keys from Google AI Studio, Groq and Tavily.

```bash
git clone https://github.com/Zeus-ofpus/manuel-ai.git
cd manuel-ai
npm i -g vercel
cp .env.example .env    # fill in your keys
vercel dev              # runs the static site + /api functions on http://localhost:3000
```

Deploy: `vercel --prod`, then add the same variables under Project → Settings → Environment Variables.
Supabase is optional; without it, sign-up and memory are switched off and chat still works.

## Project structure

```
index.html, app.js, styles.css, aurora.css   front end (vanilla JS, no framework)
vsom.js, zeus.webp, thunder.mp3              welcome intro animation
sw.js, manifest.webmanifest                  installable PWA
api/chat.mjs        chat: Gemini relay + Groq fallback, search, football, memory
api/speak.mjs       text-to-speech
api/transcribe.mjs  speech-to-text
api/image.mjs       image generation
api/signup.mjs, memory.mjs, remember.mjs, _sb.mjs   accounts and memory (Supabase)
api/wallet.mjs, mint-check.mjs, lib/bsc.mjs         read-only BNB Chain checks
vendor/             marked, DOMPurify, highlight.js
```

## AI tools used to build it (disclosure)

Manuel was built with heavy help from an AI coding agent, **Hark** (hark.com). I directed the product: the idea, the personality, the features, the look ("Aurora Glass", the Zeus intro), and I tested every change on my phone and asked for fixes. Hark wrote most of the code, deployed it, and generated the Zeus artwork and the original thunder and trailer audio. The trailer voice uses Gemini TTS.

What I learned: how a web app talks to AI models through serverless functions, why you keep API keys on the server, how to fall back between providers when free tiers run out, how domains and DNS work (I set up `manuel.qd.je` for free), and how much the small things (speed, voice, personality) matter to whether people actually use it.

## Credits

Open-source libraries: [marked](https://github.com/markedjs/marked), [DOMPurify](https://github.com/cure53/DOMPurify), [highlight.js](https://highlightjs.org/). Fonts: Geist (Vercel).
APIs: Google Gemini, Groq, Tavily, Supabase, ESPN public scoreboard feed (football data), Pollinations, BNB Chain public RPC.
Hosting: Vercel; custom domain via DigitalPlat and Render.

## Safety

- No API keys in this repo; all secrets live in environment variables.
- Betting analysis is informational and never promises a win.
- The wallet feature is read-only; it never asks for or stores seed phrases or private keys.

© 2026 Emmanuel Olabode
