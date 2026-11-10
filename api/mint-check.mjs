// GET /api/mint-check?site=agc|ptah&address=0x...&shares=N
// Build a mint PREVIEW from live on-chain data. It never mints anything.
//
//   site=agc&address=0x...&shares=6
//     -> Mode A quota left today, AGC per share, expected AGC, BNB locked
//        (0.002 per share, refunded in full after 24h with the AGC),
//        whether the wallet can afford it, and the exact mintFree preview.
//   site=ptah&address=0x...
//     -> Genesis public mint has ended, so there is nothing to mint.
//        Still reports the wallet's Proof-of-Agent card / Agent #.
//
// A real mint must be signed by the user's own wallet afterwards — see
// docs/BINANCE_WALLET.md. Manuel must show this preview and get an
// explicit "yes, mint it" before anyone executes it.

import { isAddress, getWallet, getAgcQuota, getAgcPending, getPtahAgent, AGC_MINTER } from "../lib/bsc.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(req) {
  const url = new URL(req.url);
  const site = (url.searchParams.get("site") || "agc").trim().toLowerCase();
  const address = (url.searchParams.get("address") || "").trim();
  const shares = Math.max(1, Math.min(6, parseInt(url.searchParams.get("shares") || "1", 10) || 1));
  if (!isAddress(address)) {
    return json({ error: "Give a valid BSC wallet address, starting 0x and 40 hex characters." }, 400);
  }

  try {
    if (site === "ptah") {
      let agent = null;
      try { agent = await getPtahAgent(address); } catch (e) { agent = { error: String(e?.message || e) }; }
      return json({
        site: "ptah",
        mintable: false,
        reason: "Ptah Genesis public mint has ended. All public Relics are gone; Relics now trade on the secondary market.",
        mintPage: "https://ptah.trade/mint",
        source: "https://ptah.trade/llms.txt",
        agent,
        checkedAt: new Date().toISOString(),
      });
    }

    if (site !== "agc") return json({ error: "Unknown site. Use site=agc or site=ptah." }, 400);

    const [wallet, quota, pending] = await Promise.all([
      getWallet(address),
      getAgcQuota(address),
      getAgcPending(address),
    ]);
    const perShare = Number(quota.aAgcPerShare);
    const canMint = quota.open && !quota.paused && quota.aLeft >= shares;
    const bnbNeeded = (shares * 0.002).toFixed(3);
    const affordable = Number(wallet.bnb) >= Number(bnbNeeded);
    return json({
      site: "agc",
      mintable: canMint && affordable,
      shares,
      expectedAgc: canMint ? shares * perShare : 0,
      agcPerShare: perShare,
      epoch: quota.epoch,
      quota: { cap: quota.aCap, used: quota.aUsed, left: quota.aLeft },
      bnbLocked: bnbNeeded,
      bnbBalance: wallet.bnb,
      affordable,
      open: quota.open,
      paused: quota.paused,
      sharesLeftInStage: quota.sharesLeftInStage,
      pending,
      // Exact preview for the user (or their `baw` CLI) to execute later.
      // This endpoint does not execute it.
      preview: {
        chain: "BNB Smart Chain (56)",
        contract: AGC_MINTER,
        function: `mintFree(${shares}, 0x0000000000000000000000000000000000000000)`,
        valueBnb: bnbNeeded,
        referrer: "0x0000000000000000000000000000000000000000",
        claimAfterHours: 24,
        claimFunction: "claimFree([])",
        note: "BNB is refunded in full after 24h, together with the AGC. Gas is not refunded.",
      },
      quotaExpires: "Today's quota resets at 00:00 UTC and does not roll over.",
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("mint-check failed:", e?.message || e);
    return json({ error: "Could not check the mint on-chain right now. Try again in a moment." }, 503);
  }
}
