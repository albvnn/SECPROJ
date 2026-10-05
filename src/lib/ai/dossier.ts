import { applyUpdate } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { effortFromEnv, emptyTurnUsage, runNarration, type ToolOutcome } from "./narrator";
import { dossierPrompt } from "./prompts";
import { MODELS } from "./router";
import type { Emit } from "./sse";
import { DOSSIER_TOOLS, DossierInput, TOOL_DOSSIER } from "./tools";
import { invalidInput } from "./turn";

export async function runDossier(initial: GameState, emit: Emit, signal: AbortSignal): Promise<void> {
  let state = initial;
  let text = "";
  let textAtAttempt = "";
  let closed = false;
  const usage = emptyTurnUsage();

  emit({ type: "status", text: "Ouverture des archives…" });

  const onTool = (name: string, input: unknown): ToolOutcome => {
    if (name !== TOOL_DOSSIER) return { content: `Outil inconnu : ${name}`, isError: true };
    const parsed = DossierInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const d = parsed.data;
    const r = applyUpdate(state, {
      relations: d.relations.map((p) => ({ nom: p.nom, role: p.role, type: p.type, affinite: p.affinite, lieu: p.lieu, note: p.note })),
      carnet: d.carnet,
      lieu: d.lieu,
    });
    // Le texte complet de l'outil fait foi (le flux partiel peut être en retard d'un fragment).
    if (d.texte.length > text.length) {
      emit({ type: "text", text: d.texte.slice(text.length) });
      text = d.texte;
    }
    state = { ...r.state, dossier: { text: d.texte.trim(), summary: d.resume.trim() } };
    closed = true;
    return { content: "Dossier archivé.", terminal: true };
  };

  // Le dossier est la première impression du jeu, et il a son propre cache : toujours le modèle fort.
  const result = await runNarration({
    model: MODELS.strong,
    userContent: dossierPrompt(state),
    tools: DOSSIER_TOOLS,
    effort: effortFromEnv("DOSSIER_EFFORT", "medium"),
    onText: (d) => {
      text += d;
      emit({ type: "text", text: d });
    },
    streamedToolFields: { [TOOL_DOSSIER]: "texte" },
    onToolText: (d) => {
      text += d;
      emit({ type: "text", text: d });
    },
    onTool,
    onAttempt: () => {
      textAtAttempt = text;
    },
    onRetry: () => {
      text = textAtAttempt;
      emit({ type: "rollback", segments: text ? [{ kind: "text", text }] : [] });
    },
    usage,
    signal,
  });
  emit({ type: "usage", usage });

  if (!text.trim()) {
    throw new Error(
      result.stopReason === "refusal"
        ? "Le narrateur a refusé de rédiger ce dossier. Modifie les souhaits de ton personnage et réessaie."
        : "Le dossier est vide. Réessaie.",
    );
  }
  if (!closed) {
    // Le texte existe mais l'outil n'a pas été appelé : on archive quand même.
    state = { ...state, dossier: { text: text.trim(), summary: text.trim().slice(0, 2500) } };
  }

  const advanced = applyUpdate(state, { phase: "recrutement", chapitre: "Le repérage" });
  const u = advanced.state.usage;
  state = {
    ...advanced.state,
    updatedAt: Date.now(),
    usage: {
      ...u,
      inputTokens: u.inputTokens + usage.inputTokens,
      cacheReadTokens: u.cacheReadTokens + usage.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens + usage.cacheWriteTokens,
      outputTokens: u.outputTokens + usage.outputTokens,
      costUsd: u.costUsd + usage.costUsd,
    },
  };
  emit({ type: "state", state });
}
