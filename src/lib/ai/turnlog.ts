import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Journal local des tours (logs/turns.jsonl), pour suivre le routage des
 * modèles et les coûts. Actif en développement ; SERAPHIN_LOG=0 le coupe.
 * Rien n'est envoyé ailleurs.
 */
export async function logTurn(entry: Record<string, unknown>) {
  if (process.env.SERAPHIN_LOG === "0" || process.env.NODE_ENV === "production") return;
  try {
    const dir = path.join(process.cwd(), "logs");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "turns.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch (err) {
    console.warn("[seraphin] journal des tours indisponible", err);
  }
}
