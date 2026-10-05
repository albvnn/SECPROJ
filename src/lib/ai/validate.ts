import type { GameState, PlayerAction } from "@/lib/game/types";

/** Vérification structurelle minimale de l'état envoyé par le client. */
export function isGameState(v: unknown): v is GameState {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<GameState>;
  return (
    ((s.version as number) === 3 || s.version === 4) &&
    typeof s.character === "object" &&
    s.character !== null &&
    typeof s.character.attributes === "object" &&
    typeof s.character.skills === "object" &&
    typeof s.world === "object" &&
    s.world !== null &&
    Array.isArray(s.log) &&
    Array.isArray(s.relations) &&
    Array.isArray(s.journal)
  );
}

export function parseAction(v: unknown): PlayerAction | null {
  if (!v || typeof v !== "object") return null;
  const a = v as { type?: unknown; text?: unknown };
  if (a.type === "start") return { type: "start" };
  if (a.type === "advance") return { type: "advance" };
  const o = v as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
  if (a.type === "contact" && str("name", 80)) return { type: "contact", name: str("name", 80), intent: str("intent", 400) || "prendre des nouvelles" };
  if (a.type === "use" && str("item", 80)) return { type: "use", item: str("item", 80), how: str("how", 400) };
  if (a.type === "promotion" && str("rank", 20))
    return { type: "promotion", rank: str("rank", 20) as never, ...(str("seat", 40) ? { seat: str("seat", 40) } : {}), ...(str("station", 40) ? { station: str("station", 40) } : {}) };
  if (a.type === "resource" && str("source", 40)) return { type: "resource", source: str("source", 40) };
  if (a.type === "week" && Array.isArray(o.plan))
    return {
      type: "week",
      plan: (o.plan as unknown[]).slice(0, 3).map((p) => {
        const x = (p ?? {}) as Record<string, unknown>;
        return { activity: String(x.activity ?? "repos") as never, ...(typeof x.target === "string" ? { target: x.target.slice(0, 80) } : {}) };
      }),
      ...(o.span === "auto" ? { span: "auto" as const } : typeof o.span === "number" && o.span >= 1 && o.span <= 26 ? { span: Math.round(o.span) } : {}),
    };
  if (a.type === "mission_start" && str("offer", 40)) {
    const ids = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6) : []);
    return { type: "mission_start", offer: str("offer", 40), team: ids("team"), gadgets: ids("gadgets") };
  }
  if (a.type === "node" && str("approach", 80))
    return { type: "node", approach: str("approach", 80), intel: Math.max(0, Math.min(3, Math.round(Number(o.intel) || 0))) };
  if (a.type === "node_free" && str("text", 600)) return { type: "node_free", text: str("text", 600) };
  if ((a.type === "choice" || a.type === "free") && typeof a.text === "string") {
    const text = a.text.trim().slice(0, 1500);
    return text ? { type: a.type, text } : null;
  }
  return null;
}
