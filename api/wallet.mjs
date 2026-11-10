// GET /api/wallet?address=0x... [&action=agc|ptah]
// Read-only wallet + mint-status checks. No signing, no private keys,
// no Binance Agentic Wallet session is ever stored here.
//
//   ?address=0x...            -> BNB, AGC, PTAH and USDT balances on BSC
//   ?address=0x...&action=agc  -> + AGC Mode A quota and pending claim
//   ?address=0x...&action=ptah -> + Ptah Proof-of-Agent card (Agent #) for
//                                  that wallet, and the Genesis mint status
//                                  (the public sale has ended — see
//                                  https://ptah.trade/llms.txt)
//
// The chat endpoint (/api/chat) calls the same helpers in lib/bsc.mjs so
// Manuel can answer "check my wallet / can I mint?" with live numbers
// instead of guessing.

import { isAddress, getWallet, getAgcQuota, getAgcPending, getPtahAgent } from "../lib/bsc.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(req) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").trim();
  const action = (url.searchParams.get("action") || "").trim().toLowerCase();
  if (!isAddress(address)) {
    return json({ error: "Give a valid BSC wallet address, starting 0x and 40 hex characters." }, 400);
  }

  try {
    const wallet = await getWallet(address);
    const out = { ...wallet, checkedAt: new Date().toISOString() };

    if (action === "agc") {
      const [quota, pending] = await Promise.all([getAgcQuota(address), getAgcPending(address)]);
      out.agc = { quota, pending };
    }

    if (action === "ptah") {
      // Genesis public mint has ended (ptah.trade/llms.txt). The PoA card
      // is the live check for whether this wallet has a Binance Agent ID.
      let agent = null;
      try { agent = await getPtahAgent(address); } catch (e) { agent = { error: String(e?.message || e) }; }
      out.ptah = {
        genesisPublicMint: "ended",
        mintPage: "https://ptah.trade/mint",
        agent,
      };
    }

    return json(out);
  } catch (e) {
    console.warn("wallet check failed:", e?.message || e);
    return json({ error: "Could not read the wallet on-chain right now. Try again in a moment." }, 503);
  }
}
