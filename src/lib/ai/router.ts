import type { GameState, PlayerAction, Routing } from "@/lib/game/types";

export const MODELS = {
  strong: process.env.NARRATOR_MODEL_STRONG || process.env.NARRATOR_MODEL || "claude-opus-5-5",
  fast: process.env.NARRATOR_MODEL_FAST || "claude-sonnet-5-5",
};

/** Le contexte (lore, mémoire, récit) est mis en cache pour 1 heure. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Choisit le modèle narrateur du tour.
 *
 * Le cache de prompt est propre à chaque modèle : changer de modèle oblige à
 * réécrire tout le contexte en cache (≈ 0,15 à 0,30 $). Le mode hybride monte
 * donc vers le modèle fort dès qu'une scène l'exige, mais ne redescend vers le
 * modèle rapide qu'aux moments où le cache est perdu de toute façon : mémoire
 * réarchivée (le contexte change) ou pause de plus d'une heure.
 */
export function pickModel(state: GameState, action: PlayerAction, memoryChanged: boolean): Routing {
  const phase = state.world.phase;
  const strong = (reason: string): Routing => ({ model: MODELS.strong, tier: "strong", reason, phase });
  const fast = (reason: string): Routing => ({ model: MODELS.fast, tier: "fast", reason, phase });

  const mode = state.settings.narration;
  if (mode === "prestige") return strong("mode prestige");
  if (mode === "eco") return fast("mode économique");

  const prev = state.routing;
  if (action.type === "start") return strong("ouverture de la partie");
  if (action.type === "promotion") return strong("cérémonie de Division");
  if (state.nextIntensity === "forte") return strong("scène forte annoncée par le narrateur");
  if (prev && prev.phase !== phase) return strong("changement de phase");

  const cacheCold = memoryChanged || Date.now() - state.updatedAt > CACHE_TTL_MS;
  if (prev?.tier === "strong" && !cacheCold) return strong("fin de scène forte (cache encore chaud)");
  return fast("scène courante");
}

export function modelLabel(model: string): string {
  const m = model.match(/claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (!m) return model;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}
