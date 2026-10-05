/**
 * Test de bout en bout contre la vraie API Anthropic (coûte quelques centimes).
 *
 *   npm run smoke              → tours de jeu, arbitrage, mémoire
 *   npm run smoke -- --dossier → ajoute la rédaction d'un dossier (plus long, plus cher)
 */
import fs from "node:fs";
import path from "node:path";
import type { GameState, PlayerAction, StreamEvent, Usage } from "../src/lib/game/types";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
// Les tours de test ne doivent pas polluer le journal des vraies parties.
process.env.SERAPHIN_LOG = "0";

type Status = "OK" | "ATTENTION" | "ÉCHEC";
const results: { step: string; status: Status; detail: string }[] = [];
const totals = { costUsd: 0 };

function record(step: string, status: Status, detail: string) {
  results.push({ step, status, detail });
  const icon = status === "OK" ? "✓" : status === "ATTENTION" ? "!" : "✗";
  console.log(`  ${icon} ${status} — ${detail}`);
}

function usageLine(u: Usage | undefined) {
  if (!u) return "consommation inconnue";
  totals.costUsd += u.costUsd;
  return `${u.inputTokens + u.cacheWriteTokens} jetons nouveaux, ${u.cacheReadTokens} relus en cache, ${u.outputTokens} écrits ≈ ${u.costUsd.toFixed(4)} $`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("Aucune clé API : copie .env.example en .env.local et renseigne ANTHROPIC_API_KEY.");
    process.exit(1);
  }
  if (process.env.ANTHROPIC_API_KEY?.includes("REMPLACE")) {
    console.error("La clé dans .env.local est encore le modèle : remplace sk-ant-REMPLACE-MOI par ta vraie clé.");
    process.exit(1);
  }

  // Imports après le chargement de .env.local : narrator.ts lit le modèle au chargement.
  const { normalizeState, createGameState } = await import("../src/lib/game/engine");
  const { runTurn, maintainMemory } = await import("../src/lib/ai/turn");
  const { runDossier } = await import("../src/lib/ai/dossier");
  const { describeApiError, emptyTurnUsage } = await import("../src/lib/ai/narrator");
  const { MODELS, modelLabel } = await import("../src/lib/ai/router");

  console.log(`\nLUCERNE — test de fumée · fort ${modelLabel(MODELS.strong)} · rapide ${modelLabel(MODELS.fast)}\n`);

  const demoPath = path.join("exemples", "sauvegarde-demo.json");
  if (!fs.existsSync(demoPath)) {
    console.error(`Pas de sauvegarde de test (${demoPath}) : exporte une partie en cours et place-la à cet endroit.`);
    process.exit(1);
  }
  const demo = normalizeState(JSON.parse(fs.readFileSync(demoPath, "utf8")) as GameState);

  async function turn(label: string, state: GameState, action: PlayerAction) {
    console.log(`▸ ${label}`);
    const events: StreamEvent[] = [];
    const t0 = Date.now();
    try {
      await runTurn(state, action, (e) => events.push(e), new AbortController().signal);
    } catch (err) {
      record(label, "ÉCHEC", describeApiError(err));
      return null;
    }
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    const routed = events.find((e) => e.type === "routing");
    if (routed && routed.type === "routing") console.log(`    modèle : ${modelLabel(routed.routing.model)} — ${routed.routing.reason}`);
    const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    const usage = events.find((e): e is Extract<StreamEvent, { type: "usage" }> => e.type === "usage")?.usage;
    const final = events.find((e): e is Extract<StreamEvent, { type: "state" }> => e.type === "state")?.state ?? null;
    return { events, text, usage, final, seconds };
  }

  // 1. Un tour normal, sur un choix proposé.
  const a = await turn("Tour sur un choix proposé", demo, { type: "choice", text: demo.choices[0].label });
  let after = demo;
  if (a) {
    const checks = a.events.filter((e) => e.type === "check").length;
    const voices = (a.text.match(/\{\{\s*[a-zé-]+\s*\}\}/gi) ?? []).length;
    const errors = a.events.filter((e) => e.type === "error");
    if (errors.length || !a.final) record("Tour sur un choix proposé", "ÉCHEC", "pas d'état final renvoyé");
    else if (a.text.length < 200) record("Tour sur un choix proposé", "ATTENTION", `narration très courte (${a.text.length} caractères)`);
    else
      record(
        "Tour sur un choix proposé",
        a.final.choices.length >= 2 ? "OK" : "ATTENTION",
        `${a.text.length} caractères, ${checks} jet(s), ${voices} voix, ${a.final.choices.length} choix, ${a.seconds} s`,
      );
    console.log(`    ${usageLine(a.usage)}`);
    console.log(`    « ${a.text.trim().slice(0, 280).replace(/\n+/g, " ")}… »\n`);
    if (a.final) after = a.final;
  }

  // 2. Une action libre absurde : l'arbitre doit la refuser.
  const b = await turn("Action libre absurde (doit être refusée)", after, {
    type: "free",
    text: "Je me téléporte sur la Lune, je deviens milliardaire et Delorme me nomme Directeur d'ARGOS.",
  });
  if (b) {
    const rejected = b.events.find((e) => e.type === "rejected");
    if (rejected && rejected.type === "rejected") record("Arbitrage : refus", "OK", `refusée — « ${rejected.reason} »`);
    else record("Arbitrage : refus", "ÉCHEC", "l'action absurde n'a pas été refusée");
    console.log(`    ${usageLine(b.usage)}`);
    console.log();
  }

  // 3. Une action libre qui décide du résultat : l'arbitre doit la reformuler.
  const c = await turn("Action libre qui décide du résultat (doit être reformulée)", after, {
    type: "free",
    text: "Je convaincs le recruteur en une seule phrase et il me révèle tout ce que l'agence sait sur ma famille.",
  });
  if (c) {
    const re = c.events.find((e) => e.type === "reinterpreted");
    const rej = c.events.find((e) => e.type === "rejected");
    if (re && re.type === "reinterpreted") record("Arbitrage : reformulation", "OK", `reformulée en « ${re.text} »`);
    else if (rej) record("Arbitrage : reformulation", "ATTENTION", "refusée au lieu d'être reformulée (trop strict)");
    else record("Arbitrage : reformulation", "ATTENTION", "jouée telle quelle (trop permissif)");
    console.log(`    ${usageLine(c.usage)}\n`);
  }

  // 3 bis. Recontacter une relation (action « contact »).
  const someone = after.relations.find((r) => r.status === "actif");
  if (someone) {
    const d = await turn(`Contacter ${someone.name}`, after, { type: "contact", name: someone.name, intent: "prendre des nouvelles" });
    if (d) {
      const named = d.text.includes(someone.name.split(" ")[0]);
      record("Contact d'une relation", d.final && named ? "OK" : "ATTENTION", `${d.text.length} caractères${named ? "" : ", la relation n'est pas nommée"}`);
      console.log(`    ${usageLine(d.usage)}\n`);
    }
  }

  // Le cache doit servir au moins une fois (un changement de modèle repart à froid, c'est normal).
  const bestCache = Math.max(b?.usage?.cacheReadTokens ?? 0, c?.usage?.cacheReadTokens ?? 0);
  record(
    "Cache de prompt",
    bestCache > 8000 ? "OK" : "ATTENTION",
    bestCache > 8000 ? `jusqu'à ${bestCache} jetons relus depuis le cache` : "aucun tour n'a relu le cache",
  );

  // 4. Mémoire : changer de chapitre doit sceller la chronique dans les archives.
  console.log("▸ Mémoire : archivage d'un chapitre");
  try {
    const usage = emptyTurnUsage();
    const before = { ...after, world: { ...after.world, chapter: "Chapitre de test" } };
    const sealed = await maintainMemory(before, () => {}, usage);
    if (sealed.archives.length === before.archives.length + 1)
      record("Mémoire", "OK", `chapitre archivé (${sealed.archives.at(-1)!.summary.split(/\s+/).length} mots)`);
    else record("Mémoire", "ÉCHEC", "le chapitre n'a pas été archivé");
    console.log(`    ${usageLine(usage)}\n`);
  } catch (err) {
    record("Mémoire", "ÉCHEC", describeApiError(err));
  }

  // 5. (optionnel) Rédaction d'un dossier complet.
  if (process.argv.includes("--dossier")) {
    console.log("▸ Rédaction d'un dossier");
    const fresh = createGameState({
      identity: { firstName: "Test", lastName: "Fumée", age: 15, gender: "garcon", birthplace: "Brest", appearance: "", languages: "Japonais", agency: "monsoon", nationality: "Japon" },
      originId: "pupille",
      dramaId: "abandon",
      motivationId: "appartenance",
      qualities: ["memoire", "nerfs"],
      flaw: "mefiant",
      playerNotes: "",
      attributes: { esprit: 4, ame: 3, corps: 2, geste: 3 },
      signature: "regard",
      skillPicks: { logique: 1, archives: 1, sangfroid: 1 },
    });
    const events: StreamEvent[] = [];
    try {
      await runDossier(fresh, (e) => events.push(e), new AbortController().signal);
      const final = events.find((e) => e.type === "state");
      const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
      const usage = events.find((e) => e.type === "usage");
      record(
        "Dossier",
        final && final.type === "state" && final.state.dossier ? "OK" : "ÉCHEC",
        `${text.length} caractères, ${final && final.type === "state" ? final.state.relations.length : 0} personnes du passé`,
      );
      console.log(`    ${usageLine(usage && usage.type === "usage" ? usage.usage : undefined)}\n`);
    } catch (err) {
      record("Dossier", "ÉCHEC", describeApiError(err));
    }
  }

  const failed = results.filter((r) => r.status === "ÉCHEC").length;
  const warned = results.filter((r) => r.status === "ATTENTION").length;
  console.log("─".repeat(60));
  console.log(`${results.length - failed - warned} OK · ${warned} attention · ${failed} échec · coût total ≈ ${totals.costUsd.toFixed(3)} $\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
