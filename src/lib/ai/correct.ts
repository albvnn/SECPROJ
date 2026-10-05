import { applyUpdate, randomId, renameEverywhere } from "@/lib/game/engine";
import type { GameState, Segment } from "@/lib/game/types";
import { characterSheet } from "./prompts";
import { emptyTurnUsage, runNarration, type ToolOutcome } from "./narrator";
import { MODELS } from "./router";
import type { Emit } from "./sse";
import { CORRECTION_TOOLS, CorrectionInput, TOOL_CORRECT, TOOL_UPDATE, UpdateInput } from "./tools";
import { invalidInput } from "./turn";

const SYSTEM = `Tu es le correcteur du jeu de rôle LUCERNE. Le joueur signale une erreur dans le dernier passage du narrateur.
Le passage est découpé en morceaux [T1], [T2]… ; les repères <<jet de dés>> ne font pas partie du texte et ne doivent jamais être recopiés.
Corrige le passage en appliquant la demande du joueur, en changeant le moins de choses possible : même style, même longueur, mêmes événements, mêmes voix intérieures (format {{competence}} …), même langue. Ne réécris pas ce qui n'est pas concerné.
Si la correction porte sur un fait enregistré dans le jeu (nom de code, lieu, nom ou rôle d'un personnage…), appelle aussi maj_etat avec la valeur corrigée.
Si la demande est hors sujet, contraire aux règles ou ne concerne pas le passage, renvoie le passage tel quel.
Termine toujours par corriger_passage.`;

export async function runCorrection(initial: GameState, instruction: string, emit: Emit, signal: AbortSignal) {
  const index = initial.log.findLastIndex((e) => e.role === "narrator");
  if (index < 0) throw new Error("Aucun passage du narrateur à corriger.");
  const entry = initial.log[index];
  const texts = entry.segments.filter((s): s is Extract<Segment, { kind: "text" }> => s.kind === "text");
  if (!texts.length) throw new Error("Ce passage ne contient pas de texte.");

  // Seuls les morceaux de texte sont envoyés ; les jets apparaissent comme simples repères.
  const numbered = entry.segments
    .flatMap((s) => {
      if (s.kind === "text") return [`[T${texts.indexOf(s) + 1}]\n${s.text}`];
      if (s.kind === "check") return [`<<jet de dés : ${s.check.reason}>>`];
      return [];
    })
    .join("\n\n");

  emit({ type: "status", text: "Correction du passage…" });
  const usage = emptyTurnUsage();
  let state = initial;
  let corrected: string[] | null = null;
  const oldCodename = initial.character.codename;

  const onTool = (name: string, input: unknown): ToolOutcome => {
    if (name === TOOL_UPDATE) {
      const parsed = UpdateInput.safeParse(input);
      if (!parsed.success) return invalidInput(parsed.error);
      // Une correction ne compte pas comme une progression : pas d'entrée dans le parcours.
      const r = applyUpdate(state, parsed.data, { correction: true });
      state = r.state;
      return { content: r.notices.join(" ; ") || "Appliqué." };
    }
    if (name === TOOL_CORRECT) {
      const parsed = CorrectionInput.safeParse(input);
      if (!parsed.success) return invalidInput(parsed.error);
      if (parsed.data.passages.length !== texts.length)
        return { isError: true, content: `Il faut exactement ${texts.length} morceaux ([T1] à [T${texts.length}]).` };
      // Filet de sécurité : on retire tout repère technique recopié par erreur.
      corrected = parsed.data.passages.map((t) =>
        t
          .split("\n")
          .filter((line) => !/^\s*(<<.*>>|\[T\d+\]|\((événement|jet de dés)\s*:.*\))\s*$/.test(line))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim(),
      );
      return { content: "Passage corrigé.", terminal: true };
    }
    return { isError: true, content: `Outil inconnu : ${name}` };
  };

  await runNarration({
    model: MODELS.fast,
    system: SYSTEM,
    userContent: [
      `<fiche_personnage>\n${characterSheet(initial)}\n</fiche_personnage>`,
      `<passage>\n${numbered}\n</passage>`,
      `<correction_demandee>\n${instruction}\n</correction_demandee>`,
    ].join("\n\n"),
    tools: CORRECTION_TOOLS,
    effort: "low",
    onText: () => {},
    onTool,
    usage,
    signal,
    maxIterations: 4,
  });
  emit({ type: "usage", usage });

  const fixed = corrected as string[] | null;
  if (!fixed) throw new Error("Le correcteur n'a pas renvoyé de passage. Réessaie en reformulant ta demande.");

  let i = 0;
  const segments = entry.segments.map((s) => (s.kind === "text" ? { kind: "text" as const, text: fixed[i++] } : s));
  const log = [...state.log];
  log[index] = { ...entry, id: randomId(), segments };
  state = { ...state, log, updatedAt: Date.now() };

  // Un nouveau nom de code est répercuté dans toute la mémoire de la partie.
  const newCodename = state.character.codename;
  if (oldCodename && newCodename && oldCodename !== newCodename) state = renameEverywhere(state, oldCodename, newCodename);

  state = {
    ...state,
    usage: {
      ...state.usage,
      inputTokens: state.usage.inputTokens + usage.inputTokens,
      cacheReadTokens: state.usage.cacheReadTokens + usage.cacheReadTokens,
      cacheWriteTokens: state.usage.cacheWriteTokens + usage.cacheWriteTokens,
      outputTokens: state.usage.outputTokens + usage.outputTokens,
      costUsd: state.usage.costUsd + usage.costUsd,
    },
  };
  emit({ type: "state", state });
}
