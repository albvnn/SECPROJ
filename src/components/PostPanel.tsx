"use client";

import { ACTIVITIES } from "@/lib/game/planner";
import { ECHELON_PERKS, ECHELON_POINTS, currentPost, postOf, responsibilityStatus } from "@/lib/game/post";
import type { ActivityChoice, GameState } from "@/lib/game/types";
import { AGENCIES } from "@/lib/game/agencies";
import { tint } from "@/lib/ui/color";

/**
 * Ton poste, en arrivant au QG : ce qu'on attend de toi cette semaine et ce mois-ci,
 * où en sont tes états de service, et ce que l'échelon suivant t'apportera.
 */
export function PostPanel({ state, plan }: { state: GameState; plan: ActivityChoice[] }) {
  const def = postOf(state);
  const post = currentPost(state);
  if (!def || !post) return null;
  const agency = AGENCIES[state.character.identity.agency];
  const status = responsibilityStatus(state, plan);
  const next = ECHELON_POINTS[post.echelon + 1];
  const floor = ECHELON_POINTS[post.echelon];
  const progress = next === undefined ? 1 : (post.points - floor) / (next - floor);
  const monthLeft = Math.max(0, post.lastReview + 28 - state.world.day);
  return (
    <section className="rounded-sm border p-4" style={{ borderColor: tint(agency.color, 40), background: tint(agency.color, 6) }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="label" style={{ color: agency.color }}>
            Ton poste
          </p>
          <h3 className="font-serif text-2xl leading-tight">{def.title}</h3>
        </div>
        <p className="text-right text-[11px] text-muted">
          Bilan du mois {monthLeft <= 0 ? "cette semaine" : `dans ${monthLeft} j`}
          <br />
          <span className="text-faint">en poste depuis le jour {post.since}</span>
        </p>
      </div>

      {/* Les échelons du poste. */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {def.echelons.map((e, i) => (
          <div key={e} title={ECHELON_PERKS[i]} className={`rounded-sm border px-2 py-1.5 text-center ${i === post.echelon ? "" : i < post.echelon ? "opacity-70" : "opacity-45"}`} style={i <= post.echelon ? { borderColor: agency.color, background: i === post.echelon ? tint(agency.color, 18) : undefined } : { borderColor: "var(--color-line)" }}>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={i <= post.echelon ? { color: agency.color } : undefined}>
              {e}
            </p>
            <p className="truncate text-[9px] text-faint">{i === 0 ? "départ" : ECHELON_PERKS[i]}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span className="font-mono text-ivory/85">{post.points}</span> états de service
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: agency.color }} />
        </span>
        {next !== undefined ? <span>{next - post.points} pour « {def.echelons[post.echelon + 1]} »</span> : <span>échelon maximal</span>}
      </div>

      {/* Les responsabilités. */}
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {status.map((r) => {
          const ok = r.planned || r.done;
          return (
            <li key={r.id} className={`flex items-start gap-2 rounded-sm border px-2.5 py-2 ${ok ? "border-success/40" : "border-partial/40"}`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${ok ? "bg-success/20 text-success" : "bg-partial/15 text-partial"}`}>{r.done ? "✓" : r.planned ? "▸" : "!"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span>{r.label}</span>
                  <span className="shrink-0 text-[9px] tracking-[0.12em] text-faint uppercase">{r.every === "semaine" ? "chaque semaine" : "chaque mois"}</span>
                </span>
                <span className="block text-[10px] text-muted">
                  {r.done ? "fait ce mois-ci" : r.planned ? "prévu dans ta semaine" : r.hint}
                  {!ok && <span className="text-faint"> · {r.activities.map((a) => ACTIVITIES[a].icon).join(" ")}</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-faint">Chaque responsabilité tenue rapporte des états de service ; négligée, elle en coûte, et le bilan du mois entame ta réputation.</p>
    </section>
  );
}
