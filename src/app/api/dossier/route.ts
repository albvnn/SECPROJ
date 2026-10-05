import { runDossier } from "@/lib/ai/dossier";
import { badRequest, sseResponse } from "@/lib/ai/sse";
import { normalizeState } from "@/lib/game/engine";
import { isGameState } from "@/lib/ai/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { state?: unknown } | null;
  if (!body || !isGameState(body.state)) return badRequest("État de partie invalide.");
  if (body.state.world.phase !== "dossier") return badRequest("Le dossier a déjà été rédigé.");
  const state = normalizeState(body.state);
  return sseResponse(req.signal, (emit) => runDossier(state, emit, req.signal));
}
