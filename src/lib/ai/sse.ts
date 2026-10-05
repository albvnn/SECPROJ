import type { StreamEvent } from "@/lib/game/types";
import { describeApiError } from "./narrator";

export type Emit = (event: StreamEvent) => void;

/** Réponse Server-Sent Events : chaque événement est une ligne `data: {json}`. */
export function sseResponse(signal: AbortSignal, run: (emit: Emit) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        await run(emit);
        emit({ type: "done" });
      } catch (err) {
        if (!signal.aborted) {
          console.error("[seraphin]", err);
          emit({ type: "error", message: describeApiError(err) });
        }
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}
