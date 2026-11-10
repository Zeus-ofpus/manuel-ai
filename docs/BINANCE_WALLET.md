# Binance Agentic Wallet — what MANUEL AI can now do

This is the skill Manuel uses when a user talks about a wallet, a mint,
an Agent ID, or a contract call. It mirrors the workflow of the Binance
Agentic Wallet skill (v1.15.0, CLI `@binance/agentic-wallet` 1.12.0).

## The rule that never changes

**Never execute a transaction without an explicit confirmation.**
Check first, show a preview, then wait for the user to say so. The web
app itself never signs anything — see "What runs where" below.

## 1. Set up the wallet (agent environment, e.g. Claude Code / Muse)

This is the flow for an agent that runs on the user's own machine, where
the `baw` CLI can live. It does **not** run on Vercel serverless.

```bash
# Install the skill (non-interactive — the plain command stalls on a prompt)
npx -y skills add binance/binance-skills-hub --skill binance-agentic-wallet --yes --global

# Install / check the CLI
npm install -g @binance/agentic-wallet@1.12.0
baw skill-check
baw cli-check
```

## 2. Sign in

```bash
baw auth signin        # returns a pairing code + sign-in URL
baw auth verify        # after the user confirms in the Binance App
baw wallet status      # must be CONNECTED before anything else
```

- Prefer a QR code over a typed pairing code when the user is on mobile.
- Pairing codes expire in a few minutes. If `auth verify` returns
  `AUTH_REJECTED: QR code does not exist or expired`, run `auth signin`
  again for a fresh code. Never reuse an expired one.
- Check Developer Mode before any contract call:
  `baw wallet settings` — Developer Mode must be on. It expires after
  use; re-check it every time, do not assume it is still on.

Useful reads (no signing):

```bash
baw wallet address
baw wallet balance
baw wallet agent-id        # claimed .ai Agent ID, e.g. manuelsolx.ai
baw wallet tx-history
baw wallet gas-price
```

## 3. Check a mint before mentioning it

Never quote a price, a reward or a "sold out" from memory. Read the
site's own machine-readable docs and the chain, live:

1. Fetch `<site>/llms.txt` (and `<site>/skill.md` if it exists).
   - AGC: https://agcc.fun/llms.txt
   - Ptah: https://ptah.trade/llms.txt
2. Check the wallet: address, BNB balance, token balances, Agent ID.
3. Check the mint itself on-chain / via the site's API:
   - **AGC Mode A** — mint contract
     `0x6288DFe86f22B53eEB6886aE2D78941de7483743`, token
     `0x63dea5aCdbE1F27c968907D08610A5f0A0284bA6`. Read `quota()` and
     `pending()` for the user's address (see `lib/bsc.mjs`). Mode A is
     `mintFree(shares, referrer)`, 0.002 BNB per share, refunded in full
     after 24h together with the AGC; claim with `claimFree([])`.
     Daily quota is per Agent ID, resets 00:00 UTC, does not roll over.
     The per-share AGC reward is fixed at mint entry and falls by half
     each epoch as total shares grow — so quote the live
     `aAgcPerShare`, and say when it was checked.
   - **Ptah Genesis** — the public mint has ended
     (https://ptah.trade/llms.txt). There is nothing left to mint, even
     with an Agent ID. Check the Proof-of-Agent card for a wallet with
     `GET https://ptah.trade/api/poa/agents?owner=0x...` — an empty list
     means no card / no Agent ID.
4. Say plainly if the user cannot afford it, has no Agent ID, or the
   mint is sold out — and what would fix it (top up, claim an Agent ID,
   wait for the next sale).

## 4. Preview, then execute (agent environment only)

```bash
# Preview first — shows the exact contract, function, value and calldata.
baw contract-call preview --chain bsc --to <contract> --function <fn> --args ... --value <bnb>

# Only after the user confirms that exact preview:
baw contract-call execute --chain bsc --to <contract> --function <fn> --args ... --value <bnb>
```

- The preview must match the execution exactly: same contract, same
  function, same shares, same value, referrer `0x0000…0000` unless the
  user named one.
- Report the transaction hash, block, gas used, and what was received.
  Then re-check `pending()` / balances to confirm it landed.

## 5. Claim

- AGC Mode A positions mature 24h after mint. Before claiming, read
  `pending()` — positions younger than 24h are skipped, not reverted.
- Claim with `claimFree([])` (preview first, same as above). The BNB
  comes back in full, plus the AGC. Gas is the only cost and is not
  refunded.

## What runs where

| Feature | Where it runs | How |
|---|---|---|
| Wallet / mint **checks** (balances, quota, pending, Agent ID, sold-out) | Vercel, in this repo | `GET /api/wallet`, `GET /api/mint-check`, `lib/bsc.mjs` — read-only BSC RPC + public site APIs. No keys, no signing. |
| Manuel **knowing** the workflow | Vercel, in this repo | `WALLET_SKILL` in `api/chat.mjs` + live data injected into the prompt before Gemini answers. |
| Wallet **sign-in** (`baw auth signin`) and **executing** a mint/claim | The user's own machine only | `baw` CLI, as above. Vercel serverless has no persistent machine to keep a wallet session on, and no safe place to hold one. Do not try to run `baw` on Vercel, and never send a private key or seed phrase to this app. |

## Safety notes

- AGC has no utility and no promise of value. Never present a reward
  as guaranteed income, and never give investment advice — present the
  live numbers and let the user decide.
- "Guaranteed BNB back" means the Mode A contract returns the locked
  BNB in full on `claimFree` after 24h, as verified on-chain. It is
  enforced by the contract, not by a person, and the claim still has
  to be run. Gas is not refunded.
- Never ask for, store, or paste a private key, seed phrase, password
  or OTP in chat. Wallet sign-in is by QR / pairing code in the
  Binance App only.
