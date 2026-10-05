"use client";

import { useState } from "react";
import type { ActivityChoice, GameState, PlayerAction } from "@/lib/game/types";
import { Debrief, MissionsList, MissionTrack, Preparation } from "./Operations";
import { Agenda, Duties, PrisonBanner, StatusStrip, WeekSlots } from "./WeekPlanner";

/**
 * Le QG : tout ce qui se décide entre deux scènes, sur une seule page.
 * La semaine à gauche, les missions à droite ; les obligations et le calendrier en dessous.
 */
export function HQ({
  state,
  plan,
  setPlan,
  busy,
  onAction,
  onChange,
  onBackToStory,
}: {
  state: GameState;
  plan: ActivityChoice[];
  setPlan: (p: ActivityChoice[]) => void;
  busy: boolean;
  onAction: (a: PlayerAction) => void;
  onChange?: (s: GameState) => void;
  onBackToStory: () => void;
}) {
  const [preparing, setPreparing] = useState<string | null>(null);
  const offer = state.offers.find((o) => o.id === preparing) ?? null;
  const atBase = state.world.phase === "base" && !state.mission;
  const prison = state.character.prison;
  const [showLast, setShowLast] = useState(false);

  if (state.mission)
    return (
      <div className="space-y-4">
        <p className="label">Mission en cours</p>
        <h2 className="font-serif text-3xl">{state.mission.name}</h2>
        <MissionTrack mission={state.mission} />
        <p className="text-sm text-muted">{state.mission.objective}</p>
        <button onClick={onBackToStory} className="btn btn-primary">
          Reprendre la mission ▸
        </button>
      </div>
    );

  if (offer && onChange)
    return (
      <Preparation
        state={state}
        offer={offer}
        onBack={() => setPreparing(null)}
        onAction={(a) => {
          setPreparing(null);
          onAction(a);
        }}
        onChange={onChange}
        busy={busy}
      />
    );

  return (
    <div className="space-y-8">
      {prison && <PrisonBanner state={state} />}
      <StatusStrip state={state} />

      <div className={`grid gap-8 ${prison ? "" : "lg:grid-cols-[minmax(0,1fr)_22rem]"}`}>
        <WeekSlots state={state} plan={plan} setPlan={setPlan} busy={busy} onPlay={atBase ? () => onAction({ type: "week", plan }) : undefined} />
        {!prison && (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-serif text-2xl">Missions</h3>
              {state.offers.length > 0 && <span className="text-[11px] text-faint">{state.offers.length} au tableau</span>}
            </div>
            <MissionsList state={state} onOpen={setPreparing} />
          </section>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Duties state={state} />
        <Agenda state={state} />
      </div>

      {(state.lastWeek || state.lastMission) && (
        <section className="border-t border-line pt-4">
          <button onClick={() => setShowLast((s) => !s)} className="label hover:text-ivory" aria-expanded={showLast}>
            {showLast ? "▾" : "▸"} Derniers comptes rendus
          </button>
          {showLast && (
            <div className="mt-3 grid gap-6 lg:grid-cols-2">
              {state.lastWeek && (
                <div>
                  <h4 className="label mb-2">La semaine dernière (jour {state.lastWeek.day})</h4>
                  <ul className="space-y-1 text-xs text-muted">
                    {state.lastWeek.lines.map((l, i) => (
                      <li key={i}>· {l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {state.lastMission && <Debrief state={state} mission={state.lastMission} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
