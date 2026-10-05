"use client";

import { AGENCIES } from "@/lib/game/agencies";
import { useEffect, useRef, useState } from "react";
import { RichText } from "./RichText";
import { Emblem } from "./ui";
import { fromWire, saveGame, toWire } from "@/lib/client/storage";
import { streamEvents } from "@/lib/client/stream";
import { resetDossier } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";

export function DossierScreen({
  state,
  onState,
  onContinue,
}: {
  state: GameState;
  onState: (s: GameState) => void;
  onContinue: () => void;
}) {
  const [text, setText] = useState(state.dossier?.text ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const done = Boolean(state.dossier);
  const c = state.character;
  const fileNo = state.id.replace(/-/g, "").slice(0, 6).toUpperCase();

  useEffect(() => () => abortRef.current?.abort(), []);

  const write = async (base: GameState = state) => {
    setBusy(true);
    setError(null);
    setText("");
    const controller = new AbortController();
    abortRef.current = controller;
    const result: { state: GameState | null } = { state: null };
    try {
      await streamEvents(
        "/api/dossier",
        { state: toWire(base) },
        (e) => {
          if (e.type === "status") setStatus(e.text);
          else if (e.type === "text") {
            setStatus(null);
            setText((t) => t + e.text);
          } else if (e.type === "rollback") {
            setText(e.segments.map((s) => (s.kind === "text" ? s.text : "")).join(""));
          } else if (e.type === "state") result.state = fromWire(base, e.state);
          else if (e.type === "error") throw new Error(e.message);
        },
        controller.signal,
      );
      const next = result.state;
      if (!next) throw new Error("La rédaction du dossier a été interrompue.");
      saveGame(next);
      onState(next);
    } catch (err) {
      // En cas d'échec, on réaffiche le dossier précédent s'il existait.
      setText(state.dossier?.text ?? "");
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const started = busy || text.length > 0;

  return (
    <div className="bg-weave min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <article className="paper relative overflow-hidden rounded-sm px-6 py-10 sm:px-14 sm:py-14">
          <div className="stamp absolute top-8 right-4 px-4 py-1.5 text-sm sm:right-10">Confidentiel</div>
          <header className="border-b-2 border-double border-paper-ink/40 pb-6 font-typewriter">
            <div className="flex items-center gap-3 text-paper-ink/80">
              <Emblem className="h-10 w-10" />
              <div className="text-[11px] tracking-[0.3em] uppercase">
                <p>{AGENCIES[c.identity.agency].name} · Concordat de Lucerne</p>
                <p className="opacity-70">Dossier n° {fileNo}</p>
              </div>
            </div>
            <h1 className="mt-6 text-2xl sm:text-3xl">
              {c.identity.firstName} {c.identity.lastName.toUpperCase()}
            </h1>
            <p className="text-sm opacity-70">
              {c.identity.age} ans · {c.identity.birthplace || "lieu de naissance inconnu"} · signalé par : {c.identity.nationality}
            </p>
          </header>

          {!started && !done && (
            <div className="py-14 text-center font-typewriter">
              <p className="mx-auto max-w-md text-sm leading-relaxed opacity-80">
                Un recruteur t'observe depuis des mois sans que tu le saches. Ce dossier contient tout ce que
                {" "}{AGENCIES[c.identity.agency].name} sait de toi. Peut-être plus que ce que tu sais toi-même.
              </p>
              <button onClick={() => write()} className="mt-8 border-2 border-paper-ink px-6 py-3 text-sm tracking-[0.25em] uppercase transition-colors hover:bg-paper-ink hover:text-paper">
                Ouvrir le dossier
              </button>
            </div>
          )}

          {started && (
            <div className={`prose-narrative mt-6 font-typewriter text-[15px] leading-[1.75] ${busy ? "caret" : ""}`}>
              <RichText text={text} variant="dossier" />
              {status && !text && <p className="animate-pulse opacity-60">{status}</p>}
            </div>
          )}

          {error && (
            <div className="mt-8 border-l-4 border-stamp bg-stamp/10 p-4 font-sans text-sm">
              <p>{error}</p>
              <button onClick={() => write(state.dossier && state.log.length === 0 ? resetDossier(state) : state)} className="mt-2 font-semibold underline">
                Réessayer
              </button>
            </div>
          )}
        </article>

        {done && !busy && (
          <div className="mt-10 flex flex-col items-center gap-4">
            <button onClick={onContinue} className="btn btn-primary px-10 py-4">
              {state.log.length ? "Reprendre le récit →" : "Tourner la page →"}
            </button>
            {state.log.length === 0 && (
              <button
                onClick={() => {
                  if (confirm("Réécrire entièrement le dossier ? L'actuel sera perdu.")) write(resetDossier(state));
                }}
                className="text-xs tracking-[0.15em] text-muted uppercase hover:text-ivory"
              >
                ↺ Réécrire le dossier
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
