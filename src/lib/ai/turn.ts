import { randomInt } from "node:crypto";
import { z } from "zod";
import { applyUpdate, performCheck, randomId, recordProgress, resourceAvailable } from "@/lib/game/engine";
import { OUTCOMES, SKILLS, actionLabel, progressKind } from "@/lib/game/rules";
import { describeAction, engineNodeStep, isEngineAction, resolveFreeAttempt, runEngineAction, type EngineStep } from "@/lib/game/actions";
import { currentNode } from "@/lib/game/missions";
import type { Choice, GameState, LogEntry, PlayerAction, Segment, StoryCard, StoryDoc, Usage } from "@/lib/game/types";
import {
  complete,
  contextBlocks,
  effortFromEnv,
  emptyTurnUsage,
  runNarration,
  type ToolOutcome,
} from "./narrator";
import { chroniclePrompt, sagaPrompt, sealPrompt, turnContext } from "./prompts";
import { MODELS, pickModel } from "./router";
import { logTurn } from "./turnlog";
import type { Emit } from "./sse";
import {
  ArbitrateInput,
  CheckInput,
  ChoicesInput,
  GAME_TOOLS,
  NarrateInput,
  PieceInput,
  TOOL_ARBITRATE,
  TOOL_PIECE,
  TOOL_NARRATE,
  TOOL_CHECK,
  TOOL_CHOICES,
  TOOL_UPDATE,
  UpdateInput,
} from "./tools";

/*
 * Mémoire en trois niveaux :
 * - récit récent : les dernières entrées, mot pour mot ;
 * - chronique : résumé glissant du chapitre en cours ;
 * - archives : un résumé par chapitre terminé, elles-mêmes condensées en « saga »
 *   quand elles deviennent nombreuses.
 * Plus, en parallèle : le carnet (faits établis), les relations et les notes
 * secrètes du narrateur, mis à jour par le narrateur lui-même.
 */

/** Au-delà de ce nombre d'entrées non archivées, on condense les plus anciennes. */
const FOLD_THRESHOLD = 30;
/** Entrées gardées mot pour mot dans le contexte du narrateur. */
const KEEP_RECENT = 10;
/** Au-delà de ce nombre de chapitres archivés, les plus anciens rejoignent la saga. */
const MAX_ARCHIVES = 10;
const ARCHIVES_TO_SAGA = 5;

export const FALLBACK_CHOICES: Choice[] = [
  { label: "Observer attentivement les alentours", tone: "prudence" },
  { label: "Prendre l'initiative", tone: "audace" },
];

export function invalidInput(err: z.ZodError): ToolOutcome {
  return {
    isError: true,
    content: `Entrée invalide, corrige et rappelle l'outil : ${err.issues
      .map((i) => `${i.path.join(".") || "(racine)"} ${i.message}`)
      .join(" ; ")}`,
  };
}

/** Segments du tour en cours : le texte est fusionné, les jets et événements s'intercalent. */
export class SegmentBuffer {
  segments: Segment[] = [];
  private snapshot: Segment[] = [];
  constructor(private emit: Emit) {}
  /** Mémorise l'état avant une requête au modèle. */
  mark() {
    this.snapshot = this.segments.map((s) => ({ ...s }));
  }
  /** Annule ce qui a été relayé depuis le dernier `mark()`. */
  rollback() {
    this.segments = this.snapshot.map((s) => ({ ...s }));
    this.emit({ type: "rollback", segments: this.segments });
  }
  text(delta: string) {
    const last = this.segments.at(-1);
    if (last?.kind === "text") last.text += delta;
    else this.segments.push({ kind: "text", text: delta });
    this.emit({ type: "text", text: delta });
  }
  /** Texte relayé depuis l'outil raconter : chaque nouvel appel ouvre un nouveau paragraphe. */
  narration(delta: string, blockStart: boolean) {
    const last = this.segments.at(-1);
    this.text(blockStart && last?.kind === "text" && last.text.trim() ? `\n\n${delta}` : delta);
  }
  /** Carte du jeu ou pièce du narrateur. */
  card(card: StoryCard) {
    const segment = { kind: "card" as const, card };
    this.segments.push(segment);
    this.emit({ type: "segment", segment });
  }
  doc(doc: StoryDoc) {
    const segment = { kind: "doc" as const, doc };
    this.segments.push(segment);
    this.emit({ type: "segment", segment });
  }
  events(texts: string[]) {
    for (const text of texts) {
      this.segments.push({ kind: "event", text });
      this.emit({ type: "event", text });
    }
  }
  cleaned(): Segment[] {
    return this.segments
      .map((s) => (s.kind === "text" ? { ...s, text: s.text.trim() } : s))
      .filter((s) => s.kind !== "text" || s.text.length > 0);
  }
}

/* ------------------------------------------------------------------ */
/* Mémoire                                                             */
/* ------------------------------------------------------------------ */

async function maintainMemory(initial: GameState, emit: Emit, usage: Usage): Promise<GameState> {
  let state = initial;
  // Les résumés utilisent le modèle du tour précédent, pour profiter de son cache.
  const model = state.routing?.model ?? MODELS.fast;
  const summarize = (prompt: string) => complete(model, prompt, "low", GAME_TOOLS, usage);

  try {
    // 1. Le chapitre a changé : on scelle sa chronique dans les archives.
    if (state.chronicle && state.chronicleChapter && state.chronicleChapter !== state.world.chapter) {
      emit({ type: "status", text: "Archivage du chapitre précédent…" });
      const summary = await summarize(sealPrompt(state.chronicleChapter, state.chronicle));
      if (summary) {
        state = {
          ...state,
          archives: [...state.archives, { title: state.chronicleChapter, summary }],
          chronicle: "",
          chronicleChapter: state.world.chapter,
        };
      }
    }

    // 2. Trop d'entrées mot pour mot : les plus anciennes rejoignent la chronique.
    if (state.log.length > FOLD_THRESHOLD) {
      emit({ type: "status", text: "Mise à jour de la chronique…" });
      const old = state.log.slice(0, state.log.length - KEEP_RECENT);
      const chronicle = await summarize(chroniclePrompt(state.chronicle, old));
      if (chronicle) {
        state = {
          ...state,
          chronicle,
          chronicleChapter: state.world.chapter,
          log: state.log.slice(old.length),
          chronicleUpTo: state.chronicleUpTo + old.length,
        };
      }
    }

    // 3. Trop de chapitres archivés : les plus anciens sont fondus dans la saga.
    if (state.archives.length > MAX_ARCHIVES) {
      emit({ type: "status", text: "Les archives rejoignent la saga…" });
      const oldest = state.archives.slice(0, ARCHIVES_TO_SAGA);
      const saga = await summarize(sagaPrompt(state.saga, oldest));
      if (saga) state = { ...state, saga, archives: state.archives.slice(ARCHIVES_TO_SAGA) };
    }
  } catch (err) {
    // Pas bloquant : on garde ce qui a pu être fait et on retentera au tour suivant.
    if (err instanceof Error && err.name === "AbortError") throw err;
    console.warn("[seraphin] maintenance de la mémoire impossible", err);
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Tour                                                                */
/* ------------------------------------------------------------------ */

export { maintainMemory };

export async function runTurn(
  initial: GameState,
  action: PlayerAction,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  const usage = emptyTurnUsage();
  const t0 = Date.now();
  // Actions du moteur (semaine, mission, étapes) : résolues avant que le narrateur ne raconte.
  let engine: EngineStep | null = null;
  if (isEngineAction(action, initial)) {
    if (action.type === "resource" && !resourceAvailable(initial, action.source))
      throw new Error("Ce soutien n'est pas disponible maintenant : une fois par mission, et le coup signature ne vaut que sur les étapes de la spécialité de ton siège.");
    engine = runEngineAction(initial, action, () => randomInt(1, 7));
    if (engine) initial = action.type === "week" ? engine.state : recordProgress(engine.state, engine.notices);
  } else if (action.type === "resource") throw new Error("Les soutiens ne servent qu'en mission.");
  if (action.type === "contact" && !initial.relations.some((r) => r.name === action.name))
    throw new Error(`Relation inconnue : ${action.name}`);
  let state = await maintainMemory(initial, emit, usage);
  const memoryChanged =
    state.chronicle !== initial.chronicle || state.archives.length !== initial.archives.length || state.saga !== initial.saga;
  const routing = pickModel(state, action, memoryChanged);
  emit({ type: "routing", routing });
  const ctx = turnContext(state, state.log, action, engine?.facts);
  // Tours où le jeu a déjà décidé : le narrateur raconte, sans jets ni choix (sauf l'événement d'une semaine).
  const engineTurn = Boolean(engine) || action.type === "node_free" || state.world.phase === "mission";
  const weekTurn = action.type === "week";
  let freeResolved = false;
  let nextIntensity = state.nextIntensity;

  let playerEntry: LogEntry | null = null;
  const label = engine?.label || describeAction(initial, action) || actionLabel(action);
  if (label) {
    playerEntry = {
      id: randomId(),
      role: "player",
      segments: [{ kind: "text", text: label }],
      ts: Date.now(),
    };
  }

  emit({ type: "status", text: action.type === "free" ? "Le narrateur examine ton action…" : "Le narrateur prend la plume…" });
  if (action.type === "contact") emit({ type: "status", text: `Tu contactes ${action.name}…` });
  const buffer = new SegmentBuffer(emit);
  // La carte de l'action (ordre de mission, bilan…) précède le jet et le récit ; le débriefing vient après le jet.
  const [firstCard, ...laterCards] = engine?.cards ?? [];
  if (firstCard && firstCard.type !== "etape") buffer.card(firstCard);
  for (const check of engine?.checks ?? []) {
    buffer.segments.push({ kind: "check", check });
    emit({ type: "check", check });
  }
  if (firstCard?.type === "etape") buffer.card(firstCard);
  for (const card of laterCards) buffer.card(card);
  // Les cartes résument déjà l'essentiel : restent en étiquettes les progrès (ils déclenchent les notifications)
  // et les nouvelles que les cartes ne montrent pas.
  const keep = (re: RegExp) => (n: string) => Boolean(progressKind(n)) || re.test(n);
  if (engine && action.type !== "week") buffer.events(engine.cards.length ? engine.notices.filter(keep(/^Nouvelle|^Blessure|^Séquelle|^Légende|^Tu es/)) : engine.notices);
  else if (engine) buffer.events(engine.notices.filter(keep(/^Nouvelle|^Informateur|^Impayé|^Coup de|se manifeste|^Personne|déjoué/)).slice(0, 8));
  let pieceShown = false;
  let choices: Choice[] = [];
  let rejection: { reason: string; suggestion: string } | null = null;
  let sceneOpened = false;
  let endChecksDone = false;
  let intrigueCheckDone = false;
  let chapterCheckDone = false;

  const onTool = (name: string, input: unknown): ToolOutcome => {
    if (rejection) return { content: "Ignoré : l'action a été refusée.", terminal: true };
    switch (name) {
      case TOOL_NARRATE: {
        // Le texte a déjà été relayé au joueur pendant le streaming.
        const parsed = NarrateInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        return { content: "Affiché au joueur." };
      }
      case TOOL_ARBITRATE: {
        const parsed = ArbitrateInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        if (action.type !== "free" || !playerEntry) return { content: "Pas d'action libre à arbitrer : continue." };
        const a = parsed.data;
        if (a.verdict === "refusee") {
          rejection = {
            reason: a.raison ?? "Cette action ne peut pas être jouée dans cette scène.",
            suggestion: a.suggestion ?? "",
          };
          return { content: "Action refusée : le tour s'arrête ici.", terminal: true };
        }
        if (a.verdict === "reformulee" && a.action_retenue) {
          playerEntry = {
            ...playerEntry,
            original: action.text,
            segments: [{ kind: "text", text: a.action_retenue.slice(0, 400) }],
          };
          emit({ type: "reinterpreted", text: a.action_retenue, reason: a.raison ?? "" });
          return {
            content: `Action retenue : « ${a.action_retenue} ». Si tu n'as pas encore raconté cette tentative, fais-le ; sinon poursuis le tour sans rien répéter.`,
          };
        }
        emit({ type: "status", text: "Le narrateur prend la plume…" });
        return { content: "Action recevable. Si tu ne l'as pas encore racontée, fais-le ; sinon poursuis le tour sans rien répéter." };
      }
      case TOOL_CHECK: {
        const parsed = CheckInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        const req = parsed.data;
        if (engineTurn && !weekTurn && (action.type !== "node_free" || freeResolved))
          return { isError: true, content: "Le jeu a déjà résolu cette action : ne lance pas de jet, raconte le résultat fourni." };
        const r = performCheck(
          state,
          {
            skill: req.competence,
            difficulty: req.difficulte,
            modifier: req.modificateur,
            reason: req.motif,
            red: req.rouge,
            item: req.objet,
          },
          () => randomInt(1, 7),
        );
        state = recordProgress(r.state, r.notices);
        buffer.segments.push({ kind: "check", check: r.check });
        emit({ type: "check", check: r.check });
        buffer.events(r.notices);
        const k = r.check;
        // Improvisation en mission : le jet compte comme une tentative sur l'étape en cours.
        let missionNote = "";
        if (action.type === "node_free" && state.mission?.stage === "terrain") {
          freeResolved = true;
          const node = currentNode(state.mission)!;
          const step = engineNodeStep(state, resolveFreeAttempt(state, req.motif, k.outcome), node.title, "", req.motif);
          state = recordProgress(step.state, step.notices);
          for (const card of step.cards) buffer.card(card);
          missionNote = `\nConséquences dans la mission (décidées par le jeu) :\n${step.facts}`;
        }
        return {
          content: [
            `Résultat : ${OUTCOMES[k.outcome].label.toUpperCase()}${k.red ? " (jet rouge : définitif)" : ""}.`,
            `${SKILLS[k.skill].label} — 2d6 = ${k.dice[0]}+${k.dice[1]}, bonus ${k.bonus} (${k.bonusBreakdown.join(", ")}), total ${k.total} contre seuil ${k.dc}.`,
            OUTCOMES[k.outcome].guidance,
            r.itemNote,
            r.notices.length ? `Progression : ${r.notices.join(" ; ")}.` : "",
            missionNote,
            "Raconte maintenant ce résultat.",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
      case TOOL_UPDATE: {
        const parsed = UpdateInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        let update = parsed.data;
        const ignored: string[] = [];
        if (engineTurn && !weekTurn) {
          // Pendant une mission jouée par le moteur, le narrateur ne touche qu'aux relations, au carnet et à ses notes.
          const allowed = new Set(["relations", "carnet", "carnet_resolus", "notes_mj", "distinction"]);
          for (const k of Object.keys(update)) if (!allowed.has(k)) ignored.push(k);
          update = Object.fromEntries(Object.entries(update).filter(([k]) => allowed.has(k))) as typeof update;
        } else if (state.world.phase === "base" && (update.jours_ecoules ?? 0) > 2) {
          ignored.push("jours_ecoules");
          update = { ...update, jours_ecoules: undefined };
        }
        const r = applyUpdate(state, update);
        state = recordProgress(r.state, r.notices);
        if (parsed.data.scene) sceneOpened = true;
        buffer.events(r.notices);
        return {
          content: [
            r.notices.length ? `Appliqué : ${r.notices.join(" ; ")}.` : "Appliqué.",
            r.rejected.length ? `Refusé par le moteur : ${r.rejected.join(" ; ")}. Adapte le récit en conséquence.` : "",
            ignored.length ? `Ignoré (géré par le jeu) : ${ignored.join(", ")}.` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
      case TOOL_PIECE: {
        const parsed = PieceInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        if (pieceShown) return { isError: true, content: "Une seule pièce par tour : continue le récit." };
        pieceShown = true;
        const p = parsed.data;
        const doc: StoryDoc = {
          type: p.type,
          titre: p.titre,
          contenu: p.contenu,
          ...(p.de ? { de: p.de } : {}),
          ...(p.date ? { date: p.date } : {}),
          ...(p.messages?.length ? { messages: p.messages } : {}),
          ...(p.legende ? { legende: p.legende } : {}),
          day: state.world.day,
        };
        buffer.doc(doc);
        state = { ...state, pieces: [...(state.pieces ?? []), doc].slice(-30) };
        return { content: "Pièce affichée au joueur et rangée dans son carnet. Ne recopie pas son contenu : fais réagir le personnage." };
      }
      case TOOL_CHOICES: {
        const parsed = ChoicesInput.safeParse(input);
        if (!parsed.success) return invalidInput(parsed.error);
        if (engineTurn && !weekTurn) return { content: "Inutile : le jeu propose lui-même la suite au joueur. Le tour est terminé.", terminal: true };
        // Changement de phase : il ouvre un nouveau chapitre et une nouvelle scène (rappel unique).
        if (!chapterCheckDone && state.world.phase !== initial.world.phase && state.world.chapter === initial.world.chapter) {
          chapterCheckDone = true;
          return {
            isError: true,
            content: `La phase a changé (${initial.world.phase} → ${state.world.phase}) : ouvre un nouveau chapitre et une nouvelle scène avec maj_etat (chapitre, scene). Puis rappelle proposer_choix.`,
          };
        }
        // Intrigue au-delà de sa durée : la vérité doit être révélée maintenant (rappel unique).
        const it = state.intrigue;
        if (!intrigueCheckDone && it && it.turns + 1 >= Math.ceil(it.planned * 1.5)) {
          intrigueCheckDone = true;
          return {
            isError: true,
            content: `L'intrigue « ${it.title} » dure depuis ${it.turns + 1} tours pour ${it.planned} prévus : révèle sa vérité DANS CE TOUR (« ${it.answer} »), sans nouveau rebondissement ni nouveau commanditaire, puis maj_etat → intrigue_resolue. Raconte la révélation avec raconter, puis rappelle proposer_choix.`,
          };
        }
        // Vérification de fin de tour (une seule fois) : une ellipse doit être enregistrée.
        const missing = !endChecksDone && !sceneOpened && state.world.phase !== "base" && (action.type === "advance" || !state.scene);
        if (missing) {
          endChecksDone = true;
          return {
            isError: true,
            content:
              action.type === "advance"
                ? "Avant de proposer les choix, enregistre l'ellipse avec maj_etat : scene (la nouvelle scène), jours_ecoules si du temps a passé, lieu si le personnage a changé d'endroit. Puis rappelle proposer_choix."
                : "Avant de proposer les choix, ouvre la scène en cours avec maj_etat → scene. Puis rappelle proposer_choix.",
          };
        }
        choices = parsed.data.choix.map((c) => ({ label: c.texte.slice(0, 140), tone: c.ton, skill: c.competence }));
        nextIntensity = parsed.data.intensite_suivante;
        emit({ type: "choices", choices });
        return { content: "Choix proposés au joueur.", terminal: true };
      }
      default:
        return { content: `Outil inconnu : ${name}`, isError: true };
    }
  };

  const result = await runNarration({
    model: routing.model,
    userContent: contextBlocks(ctx),
    tools: GAME_TOOLS,
    effort: effortFromEnv("TURN_EFFORT", "low"),
    onText: (d) => buffer.text(d),
    streamedToolFields: { [TOOL_NARRATE]: "texte" },
    onToolText: (d, start) => buffer.narration(d, start),
    onTool,
    onAttempt: () => buffer.mark(),
    onRetry: () => buffer.rollback(),
    usage,
    signal,
  });

  emit({ type: "usage", usage });
  const log = (outcome: string) =>
    logTurn({
      game: initial.id,
      character: `${initial.character.identity.firstName} ${initial.character.identity.lastName}`,
      phase: state.world.phase,
      chapter: state.world.chapter,
      action: `${action.type}: ${label ?? "(début)"}`,
      model: routing.model,
      reason: routing.reason,
      outcome,
      nextIntensity,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
      memoryChanged,
      usage,
    });

  if (rejection) {
    await log("refusée");
    // L'action n'est pas jouée : rien n'est enregistré, le joueur peut réécrire.
    const r = rejection as { reason: string; suggestion: string };
    emit({ type: "rejected", reason: r.reason, suggestion: r.suggestion });
    return;
  }

  const segments = buffer.cleaned();
  if (!segments.some((s) => s.kind === "text")) {
    throw new Error(
      result.stopReason === "refusal"
        ? "Le narrateur refuse de poursuivre cette scène. Reformule ton action."
        : "Le narrateur n'a rien écrit. Réessaie.",
    );
  }
  // Hors des tours du moteur et de la base, une scène se termine toujours sur des choix.
  if (!choices.length && !engineTurn && state.world.phase !== "base") {
    choices = FALLBACK_CHOICES;
    emit({ type: "choices", choices });
  }

  const total = state.usage;
  // Rythme : le tour compte pour la scène en cours et pour la phase.
  const phaseChanged = state.world.phase !== initial.world.phase;
  const chapterChanged = state.world.chapter !== initial.world.chapter;
  state = {
    ...state,
    scene: state.scene ? { ...state.scene, turns: state.scene.turns + 1 } : null,
    // Une intrigue ouverte pendant ce tour commence son décompte au tour suivant.
    intrigue: state.intrigue && initial.intrigue ? { ...state.intrigue, turns: state.intrigue.turns + 1 } : state.intrigue,
    phaseTurns: phaseChanged ? 0 : state.phaseTurns + 1,
    chapterTurns: chapterChanged ? 0 : state.chapterTurns + 1,
  };
  state = {
    ...state,
    log: [
      ...state.log,
      ...(playerEntry ? [playerEntry] : []),
      { id: randomId(), role: "narrator", segments, ts: Date.now(), model: routing.model },
    ],
    choices,
    nextIntensity,
    routing,
    updatedAt: Date.now(),
    usage: {
      turns: total.turns + 1,
      inputTokens: total.inputTokens + usage.inputTokens,
      cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + usage.cacheWriteTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      costUsd: total.costUsd + usage.costUsd,
    },
  };
  await log(playerEntry?.original ? "reformulée" : "jouée");
  emit({ type: "state", state });
}
