import { SB_URL, SB_ANON, json } from "./_sb.mjs";

// Public values only: the project URL and the anon/publishable key are meant for browsers.
export function GET() {
  return json({ supabaseUrl: SB_URL, supabaseAnonKey: SB_ANON, accounts: !!(SB_URL && SB_ANON) });
}
