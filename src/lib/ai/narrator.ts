import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "@/lib/game/types";
import { SYSTEM_PROMPT } from "./lore";
import type { TurnContext } from "./prompts";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function effortFromEnv(name: string, fallback: Effort): Effort {
  const v = process.env[name];
  return v === "low" || v === "medium" || v === "high" || v === "xhigh" || v === "max" ? v : fallback;
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  // Une clé d'organisation (non rattachée à un workspace) exige l'en-tête anthropic-workspace-id.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  client ??= new Anthropic({
    // ANTHROPIC_BASE_URL peut être hérité d'un autre outil : le jeu ne le suit que via SERAPHIN_API_BASE_URL.
    baseURL: process.env.SERAPHIN_API_BASE_URL || "https://api.anthropic.com",
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  });
  return client;
}

/**
 * Préfixe stable : outils + bible de l'univers + règles du narrateur (~12 000 jetons).
 * Mis en cache pour 1 h (écriture 2× au lieu de 1,25×) : il survit aux pauses de
 * lecture entre deux tours, alors que le cache par défaut expire après 5 minutes.
 */
const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [
  { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
];

const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
};

/* ------------------------------------------------------------------ */
/* Coûts                                                               */
/* ------------------------------------------------------------------ */

/** Tarifs en $ par million de jetons : entrée, sortie, lecture de cache. L'écriture de cache coûte 1,25 × l'entrée. */
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-haiku-4-5": [1, 5, 0.1],
  "claude-fable-5-1": [10, 50, 0.25],
};

export function emptyTurnUsage(): Usage {
  return { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0 };
}

function addUsage(total: Usage, u: Anthropic.Beta.BetaUsage, model: string) {
  const [input, output, read] = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  // Écriture en cache : 1,25× l'entrée pour 5 minutes, 2× pour 1 heure.
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = cacheWrite - write1h;
  total.calls = (total.calls ?? 0) + 1;
  total.inputTokens += u.input_tokens;
  total.cacheReadTokens += cacheRead;
  total.cacheWriteTokens += cacheWrite;
  total.outputTokens += u.output_tokens;
  total.costUsd +=
    (u.input_tokens * input + write5m * input * 1.25 + write1h * input * 2 + cacheRead * read + u.output_tokens * output) /
    1_000_000;
}

/* ------------------------------------------------------------------ */
/* Contexte                                                            */
/* ------------------------------------------------------------------ */

/**
 * Points de cache : après la mémoire + le récit récent (relus au tour suivant,
 * puisque le récit ne fait que s'allonger ; 1 h), et après le contexte courant
 * (relu par les itérations suivantes de la boucle d'outils ; 5 min).
 * Les points à 1 h doivent précéder ceux à 5 min.
 */
export function contextBlocks(ctx: TurnContext): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: ctx.memory },
    ...ctx.entries.map((text) => ({ type: "text" as const, text })),
  ];
  // 1 h aussi pour la mémoire et le récit : une pause de lecture ne force pas à tout réécrire.
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral", ttl: "1h" } };
  blocks.push({ type: "text", text: ctx.current, cache_control: { type: "ephemeral" } });
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Boucle de narration                                                 */
/* ------------------------------------------------------------------ */

export interface ToolOutcome {
  /** Contenu renvoyé au modèle dans le tool_result. */
  content: string;
  isError?: boolean;
  /** Si vrai, le tour s'arrête après ce lot d'outils. */
  terminal?: boolean;
}

export type ToolHandler = (name: string, input: unknown) => ToolOutcome;

export interface NarrationOptions {
  model: string;
  /** Prompt système de remplacement (par défaut : la bible de l'univers, mise en cache). */
  system?: string;
  userContent: string | Anthropic.Beta.BetaContentBlockParam[];
  tools: Anthropic.Beta.BetaTool[];
  effort: Effort;
  onText: (delta: string) => void;
  onTool: ToolHandler;
  /**
   * Outils dont un champ texte est relayé au joueur pendant qu'il s'écrit
   * (nom de l'outil → nom du champ). Sur Claude Opus 5.5 / Sonnet 5.5, le texte
   * écrit entre deux appels d'outils revient sous forme de notes internes
   * vides : toute la narration passe donc par un outil.
   */
  streamedToolFields?: Record<string, string>;
  /** Fragment de texte d'un outil relayé ; `blockStart` vaut vrai pour le premier fragment d'un nouvel appel. */
  onToolText?: (delta: string, blockStart: boolean) => void;
  /** Appelé avant chaque requête au modèle. */
  onAttempt?: () => void;
  /** Appelé quand une requête ratée va être relancée : le texte déjà relayé doit être annulé. */
  onRetry?: () => void;
  usage: Usage;
  maxIterations?: number;
  signal?: AbortSignal;
}

export interface NarrationResult {
  /** Vrai si un outil terminal a été appelé. */
  completed: boolean;
  stopReason: string | null;
}

/**
 * Boucle d'outils manuelle en streaming : le texte est relayé au fil de l'eau,
 * les outils sont exécutés par le moteur de jeu, et la boucle s'arrête quand un
 * outil terminal a été appelé ou que le modèle a fini.
 */
export async function runNarration(opts: NarrationOptions): Promise<NarrationResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.userContent }];
  const maxIterations = opts.maxIterations ?? 8;
  let jsonRetries = 0;

  for (let i = 0; i < maxIterations; i++) {
    opts.onAttempt?.();
    const stream = anthropic().beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 32000,
        system: opts.system ?? SYSTEM,
        tools: opts.tools,
        messages,
        output_config: { effort: opts.effort },
        // Met aussi en cache la fin de la boucle (résultats d'outils) pour l'itération suivante.
        cache_control: { type: "ephemeral" },
        ...FALLBACK,
      },
      { signal: opts.signal },
    );
    stream.on("text", opts.onText);

    // Relais en direct des champs texte des outils de narration.
    const relayed = new Map<number, number>();
    const relay = (index: number, value: unknown) => {
      if (typeof value !== "string") return;
      const sent = relayed.get(index);
      if (sent === undefined) {
        if (!value) return;
        relayed.set(index, value.length);
        opts.onToolText?.(value, true);
      } else if (value.length > sent) {
        relayed.set(index, value.length);
        opts.onToolText?.(value.slice(sent), false);
      }
    };
    const fields = opts.streamedToolFields ?? {};
    stream.on("streamEvent", (event, snapshot) => {
      if (event.type !== "content_block_delta" || event.delta.type !== "input_json_delta") return;
      const block = snapshot.content[event.index];
      if (block?.type !== "tool_use" || !(block.name in fields)) return;
      relay(event.index, (block.input as Record<string, unknown> | null)?.[fields[block.name]]);
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Avec eager_input_streaming, une entrée d'outil illisible fait échouer
      // finalMessage() : on relance le même tour (les erreurs d'API remontent).
      if (err instanceof Anthropic.APIError || opts.signal?.aborted || jsonRetries++ >= 2) throw err;
      opts.onRetry?.();
      i--;
      continue;
    }
    addUsage(opts.usage, message.usage, opts.model);
    // Complète ce que le flux partiel n'aurait pas encore relayé.
    message.content.forEach((block, index) => {
      if (block.type === "tool_use" && block.name in fields)
        relay(index, (block.input as Record<string, unknown> | null)?.[fields[block.name]]);
    });

    if (message.stop_reason === "refusal") return { completed: false, stopReason: "refusal" };

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (!toolUses.length) return { completed: false, stopReason: message.stop_reason };
    // Une entrée tronquée peut sembler valide : on n'exécute rien.
    if (message.stop_reason === "max_tokens") return { completed: false, stopReason: "max_tokens" };

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let terminal = false;
    for (const use of toolUses) {
      const out = opts.onTool(use.name, use.input);
      terminal ||= Boolean(out.terminal && !out.isError);
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: out.content,
        is_error: out.isError,
      });
    }
    if (terminal) return { completed: true, stopReason: message.stop_reason };
    messages.push({ role: "user", content: results });
  }
  return { completed: false, stopReason: "max_iterations" };
}

/**
 * Appel simple, non streamé, pour les résumés de mémoire. Il déclare les mêmes
 * outils que le jeu (sans pouvoir les appeler) pour réutiliser le préfixe déjà
 * en cache (outils + système) au lieu de le réécrire.
 */
export async function complete(
  model: string,
  userContent: string,
  effort: Effort,
  tools: Anthropic.Beta.BetaTool[],
  usage: Usage,
): Promise<string> {
  const message = await anthropic().beta.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    tools,
    tool_choice: { type: "none" },
    messages: [{ role: "user", content: userContent }],
    output_config: { effort },
    ...FALLBACK,
  });
  addUsage(usage, message.usage, model);
  if (message.stop_reason === "refusal") throw new Error("refusal");
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError)
    return "Clé API Anthropic invalide ou absente. Renseigne ANTHROPIC_API_KEY dans .env.local puis relance le serveur.";
  if (err instanceof Anthropic.RateLimitError)
    return "Limite de requêtes atteinte. Patiente quelques secondes puis réessaie.";
  if (err instanceof Anthropic.BadRequestError && /workspace/i.test(err.message))
    return "Ta clé API n'est rattachée à aucun workspace : ajoute ANTHROPIC_WORKSPACE_ID=wrkspc_… dans .env.local (Console → Settings → Workspaces), ou crée une clé directement dans un workspace.";
  if (err instanceof Anthropic.BadRequestError) return `Requête refusée par l'API : ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError)
    return "Impossible de joindre l'API Anthropic. Vérifie ta connexion.";
  if (err instanceof Anthropic.APIError) return `Erreur API (${err.status ?? "?"}) : ${err.message}`;
  if (err instanceof Error && err.name === "AbortError") return "Requête annulée.";
  if (err instanceof Error && /authentication method/i.test(err.message))
    return "Aucune clé API Anthropic trouvée. Copie .env.example en .env.local, renseigne ANTHROPIC_API_KEY puis relance le serveur.";
  if (err instanceof Error) return err.message;
  return "Erreur inconnue.";
}
