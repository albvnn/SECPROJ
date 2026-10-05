import { runCorrection } from "@/lib/ai/correct";
import { badRequest, sseResponse } from "@/lib/ai/sse";
import { isGameState } from "@/lib/ai/validate";
import { normalizeState } from "@/lib/game/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { state?: unknown; instruction?: unknown } | null;
  if (!body || !isGameState(body.state)) return badRequest("État de partie invalide.");
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 600) : "";
  if (!instruction) return badRequest("Indique ce qu'il faut corriger.");
  const state = normalizeState(body.state);
  return sseResponse(req.signal, (emit) => runCorrection(state, instruction, emit, req.signal));
}
