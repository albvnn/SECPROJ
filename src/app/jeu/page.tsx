"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DossierScreen } from "@/components/DossierScreen";
import { GameScreen } from "@/components/GameScreen";
import { loadSave } from "@/lib/client/storage";
import type { GameState } from "@/lib/game/types";

export default function JeuPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Jeu />
    </Suspense>
  );
}

function Jeu() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<GameState | null | undefined>(undefined);
  const [view, setView] = useState<"dossier" | "game">("dossier");

  useEffect(() => {
    const loaded = id ? loadSave(id) : null;
    setState(loaded);
    // Une partie déjà commencée s'ouvre directement sur le récit.
    if (loaded?.dossier && loaded.log.length > 0) setView("game");
  }, [id]);

  if (state === undefined) return <Loading />;
  if (state === null)
    return (
      <div className="bg-weave grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="font-serif text-3xl">Dossier introuvable.</p>
          <p className="mt-2 text-muted">Il a peut-être été détruit. Ou il n'a jamais existé.</p>
          <Link href="/" className="btn btn-ghost mt-8">
            Retour
          </Link>
        </div>
      </div>
    );

  if (view === "dossier" || !state.dossier)
    return <DossierScreen state={state} onState={setState} onContinue={() => setView("game")} />;

  return <GameScreen key={state.id} initial={state} />;
}

function Loading() {
  return <div className="bg-weave min-h-dvh" />;
}
