// Shared read-only BSC helpers for MANUEL AI's wallet / mint features.
//
// READ-ONLY ONLY. Nothing in here signs a transaction, holds a private
// key, or talks to the Binance Agentic Wallet CLI. It only reads public
// on-chain data (balances, quotas, pending claims) over public BSC RPCs
// and public mint-site pages/APIs, so it is safe to run on Vercel
// serverless functions, where `baw` cannot run persistently.
//
// A real mint / claim still has to be signed by the user's own wallet:
// either the Binance Agentic Wallet CLI (`baw`) on the user's own
// machine, or the user's wallet app. See docs/BINANCE_WALLET.md.

export const BSC_RPCS = [
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed.bnbchain.org",
];

export const TOKENS = {
  AGC: { address: "0x63dea5aCdbE1F27c968907D08610A5f0A0284bA6", decimals: 18, symbol: "AGC" },
  PTAH: { address: "0x999980FB8Dff1799C7E9D7F71bCA899e43D39999", decimals: 18, symbol: "PTAH" },
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, symbol: "USDT" },
};

export const AGC_MINTER = "0x6288DFe86f22B53eEB6886aE2D78941de7483743";
// Mode A: mintFree(shares, referrer), 0.002 BNB per share, refunded in
// full after 24h together with the AGC. Claim with claimFree([]).
export const AGC_BNB_PER_SHARE = "0.002";

export function isAddress(v) {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export function fmtWei(weiStr, decimals = 18) {
  // Exact-ish decimal formatting without floating point for the integer part.
  try {
    const n = BigInt(weiStr);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = (n % base).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch { return "0"; }
}

async function rpcCall(method, params, timeoutMs = 8000) {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
  let lastErr = null;
  for (const rpc of BSC_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`RPC ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message || "RPC error");
      return d.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("All BSC RPCs failed");
}

export async function ethCall(to, data) {
  return rpcCall("eth_call", [{ to, data }, "latest"]);
}

export function words(hex) {
  const h = String(hex || "").replace(/^0x/, "");
  const out = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
}

export async function getBnbBalance(address) {
  const hex = await rpcCall("eth_getBalance", [address, "latest"]);
  return fmtWei(BigInt(hex).toString(), 18);
}

export async function getTokenBalance(tokenAddress, address) {
  const pad = address.slice(2).toLowerCase().padStart(64, "0");
  const hex = await ethCall(tokenAddress, "0x70a08231" + pad); // balanceOf(address)
  return fmtWei(BigInt(hex || "0x0").toString(), 18);
}

export async function getWallet(address) {
  const [bnb, agc, ptah, usdt] = await Promise.all([
    getBnbBalance(address),
    getTokenBalance(TOKENS.AGC.address, address),
    getTokenBalance(TOKENS.PTAH.address, address),
    getTokenBalance(TOKENS.USDT.address, address),
  ]);
  return { address, chain: "BNB Smart Chain (56)", bnb, agc, ptah, usdt };
}

// quota(address, mode) -> [refCount, aCap, aUsed, aLeft, bCap, bUsed,
//   bLeft, stage, aAgcPerShare, bRewardPerShare, bMultiplier, reserveLeft,
//   totalShares, sharesLeftInStage, sharesLeftTotal, open, paused]
// Per https://agcc.fun/skill.md v2.0.0. Selector 0xe58f661c, mode 1 = Mode A.
export async function getAgcQuota(address) {
  const pad = address.slice(2).toLowerCase().padStart(64, "0");
  const data = "0xe58f661c" + pad + "0".repeat(63) + "1";
  const q = words(await ethCall(AGC_MINTER, data));
  const num = (i) => (q[i] !== undefined ? q[i].toString() : "0");
  return {
    refCount: Number(num(0)),
    aCap: Number(num(1)),
    aUsed: Number(num(2)),
    aLeft: Number(num(3)),
    bCap: Number(num(4)),
    bUsed: Number(num(5)),
    bLeft: Number(num(6)),
    epoch: Number(num(7)),
    aAgcPerShare: fmtWei(num(8), 18),
    bRewardPerShare: fmtWei(num(9), 18),
    totalShares: num(12),
    sharesLeftInStage: num(13),
    sharesLeftTotal: num(14),
    open: num(15) === "1",
    paused: num(16) === "1",
  };
}

// pending(address) -> [freeBnb, freeAgc, rewardVested, lpWithdrawable]
// Selector 0x5eebea20.
export async function getAgcPending(address) {
  const pad = address.slice(2).toLowerCase().padStart(64, "0");
  const p = words(await ethCall(AGC_MINTER, "0x5eebea20" + pad));
  const v = (i) => (p[i] !== undefined ? fmtWei(p[i].toString(), 18) : "0");
  return { freeBnb: v(0), freeAgc: v(1), rewardVested: v(2), lpWithdrawable: v(3) };
}

export async function getPtahAgent(owner) {
  // Public Ptah Proof-of-Agent API. Returns the card (Agent #) for a wallet,
  // or an empty list when the wallet holds no card / has no Agent ID.
  const r = await fetch(
    `https://ptah.trade/api/poa/agents?owner=${encodeURIComponent(owner)}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) throw new Error(`Ptah API ${r.status}`);
  return r.json();
}
