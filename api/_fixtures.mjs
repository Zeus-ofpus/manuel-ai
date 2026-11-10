// Free public ESPN scoreboard feed: upcoming fixtures, recent form, records and bookmaker odds.
const LEAGUES = {
  "eng.1": "Premier League", "esp.1": "La Liga", "ita.1": "Serie A", "ger.1": "Bundesliga", "fra.1": "Ligue 1",
  "uefa.champions": "Champions League", "uefa.europa": "Europa League", "uefa.europa.conf": "Conference League",
  "eng.2": "Championship", "ned.1": "Eredivisie", "por.1": "Primeira Liga", "sco.1": "Scottish Prem"
};
const dec = (a) => { const n = parseInt(String(a || "").replace("+", ""), 10); if (!n || isNaN(n)) return ""; return (n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)).toFixed(2); };
const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }).replace(/-/g, "");

export async function getFixtures(days = 4) {
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => ymd(new Date(now + i * 864e5)));
  const jobs = [];
  for (const [code, name] of Object.entries(LEAGUES)) for (const d of dates) jobs.push({ code, name, d });
  const results = await Promise.all(jobs.map(async ({ code, name, d }) => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${d}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.events || []).map(e => ({ e, name }));
    } catch { return []; }
  }));
  const seen = new Set(); const lines = [];
  for (const { e, name } of results.flat().sort((a, b) => new Date(a.e.date) - new Date(b.e.date))) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    const c = e.competitions?.[0]; if (!c) continue;
    const st = c.status?.type?.name || "";
    if (st !== "STATUS_SCHEDULED" || new Date(e.date).getTime() < Date.now()) continue; // only matches still to play
    const team = (side) => { const t = c.competitors.find(x => x.homeAway === side); if (!t) return "?"; const rec = t.records?.[0]?.summary; return `${t.team.displayName}${t.form ? ` form ${t.form}` : ""}${rec ? ` W-D-L ${rec}` : ""}`; };
    const when = new Date(e.date).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const o = (c.odds || [])[0] || {}; const ml = o.moneyline || {};
    const odds = [ml.home?.close?.odds, ml.draw?.close?.odds, ml.away?.close?.odds].map(dec);
    const oddsTxt = odds.some(Boolean) ? ` | odds 1:${odds[0] || "-"} X:${odds[1] || "-"} 2:${odds[2] || "-"}` : "";
    lines.push(`${when} WAT | ${name} | ${team("home")} vs ${team("away")}${oddsTxt}${o.overUnder ? ` | O/U line ${o.overUnder}` : ""}`);
    if (lines.length >= 70) break;
  }
  return lines;
}
