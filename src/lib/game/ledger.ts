/** Le relevé de compte : chaque mouvement d'argent, daté et motivé. */
import type { LedgerEntry } from "./types";

const KEEP = 80;

export function pushLedger(ledger: LedgerEntry[] | undefined, day: number, label: string, amount: number): LedgerEntry[] {
  if (!amount) return ledger ?? [];
  return [...(ledger ?? []), { day, label, amount: Math.round(amount) }].slice(-KEEP);
}
