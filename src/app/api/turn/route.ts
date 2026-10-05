import { badRequest, sseResponse } from "@/lib/ai/sse";
import { runTurn } from "@/lib/ai/turn";
import { normalizeState } from "@/lib/game/engine";
import { isGameState, parseAction } from "@/lib/ai/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { state?: unknown; action?: unknown } | null;
  if (!body || !isGameState(body.state)) return badRequest("État de partie invalide.");
  const action = parseAction(body.action);
  if (!action) return badRequest("Action invalide.");
  if (body.state.world.phase === "dossier") return badRequest("Le dossier doit d'abord être rédigé.");
  const state = normalizeState(body.state);
  return sseResponse(req.signal, (emit) => runTurn(state, action, emit, req.signal));
}
