"use client";

import { AGENCIES, findDivision } from "@/lib/game/agencies";
import { skillTotal } from "@/lib/game/engine";
import { ACADEMIC_SKILLS, ACTIVITIES, ACTIVITY_IDS, SLOTS, activeRelations, activityBlocker, assetCap, planError } from "@/lib/game/planner";
import { ATTRIBUTE_IDS, ATTRIBUTES, SKILLS, formatEuros, skillsOf } from "@/lib/game/rules";
import type { ActivityChoice, ActivityId, AgencyId, GameState, SkillId } from "@/lib/game/types";
import { CITIES, findCity, findCountry } from "@/lib/world/geo";

const SKILL_TARGETS: ActivityId[] = ["entrainement"];

/** Planning d'une semaine : trois créneaux, puis le moteur fait passer sept jours. */
export function WeekPlanner({
  state,
  plan,
  setPlan,
  onPlay,
  busy,
}: {
  state: GameState;
  plan: ActivityChoice[];
  setPlan: (p: ActivityChoice[]) => void;
  onPlay?: () => void;
  busy: boolean;
}) {
  const error = planError(state, plan);
  const setSlot = (i: number, choice: ActivityChoice) => setPlan(plan.map((p, j) => (j === i ? choice : p)));

  return (
    <div className="space-y-6">
      <StatusStrip state={state} />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="label">Ta semaine · {SLOTS} créneaux</h3>
          <span className="text-[11px] text-faint">Jour {state.world.day} → {state.world.day + 7}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {plan.map((slot, i) => (
            <SlotEditor key={i} index={i} state={state} slot={slot} onChange={(c) => setSlot(i, c)} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${error ? "text-fail" : "text-muted"}`}>{error ?? "Le jeu résout la semaine, puis le narrateur la raconte. Un événement peut survenir."}</p>
          {onPlay && (
            <button onClick={onPlay} disabled={busy || Boolean(error)} className="btn btn-primary px-6">
              Jouer la semaine ▸
            </button>
          )}
        </div>
      </section>

      <Duties state={state} />

      {state.lastWeek && (
        <section>
          <h3 className="label mb-2">La semaine dernière (jour {state.lastWeek.day})</h3>
          <ul className="space-y-1 text-xs text-muted">
            {state.lastWeek.lines.map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function StatusStrip({ state }: { state: GameState }) {
  const c = state.character;
  const w = state.world;
  const rest = w.restUntil - w.day;
  const weeklyCost = state.command.assets.filter((a) => a.status === "actif").reduce((n, a) => n + a.cost, 0);
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Meter label="Fatigue" value={c.fatigue} color={c.fatigue >= 60 ? "var(--color-fail)" : "var(--color-partial)"} hint={c.fatigue >= 60 ? "Malus aux jets" : "Repos : −35"} />
      <Meter label="Couverture civile" value={c.cover} color={c.cover < 30 ? "var(--color-fail)" : "var(--color-success)"} hint={c.cover < 30 ? "Ta famille pose des questions" : "Vie officielle : +30"} />
      <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
        <p className="label">Prochaine mission</p>
        <p className={`mt-1 text-sm ${rest > 0 ? "text-partial" : "text-success"}`}>
          {state.mission ? "En cours" : rest > 0 ? `Récupération : ${Math.ceil(rest / 7)} sem.` : c.rank === "prospect" ? "—" : "Disponible"}
        </p>
      </div>
      <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
        <p className="label">Solde</p>
        <p className="mt-1 font-mono text-sm text-success">{formatEuros(c.money)}</p>
        {weeklyCost > 0 && <p className="text-[10px] text-faint">Informateurs : −{formatEuros(weeklyCost)}/sem.</p>}
      </div>
    </div>
  );
}

function Meter({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
      <p className="flex justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-xs">{value}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <p className="mt-1 text-[10px] text-faint">{hint}</p>
    </div>
  );
}

function SlotEditor({ index, state, slot, onChange }: { index: number; state: GameState; slot: ActivityChoice; onChange: (c: ActivityChoice) => void }) {
  const def = ACTIVITIES[slot.activity];
  const pickActivity = (a: ActivityId) => {
    const d = ACTIVITIES[a];
    const target =
      d.target === "skill"
        ? state.character.signature
        : d.target === "academic"
          ? ACADEMIC_SKILLS[0]
          : d.target === "relation"
            ? activeRelations(state)[0]?.name
            : d.target === "duty"
              ? state.duties.find((x) => x.status === "ouvert" && x.activity === "devoir")?.id
              : d.target === "city"
                ? undefined
                : undefined;
    onChange({ activity: a, ...(target ? { target } : {}) });
  };
  return (
    <div className="rounded-sm border border-line bg-panel/60 p-3">
      <p className="label mb-2">Créneau {index + 1}</p>
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_IDS.map((a) => {
          const blocker = activityBlocker(state, a);
          if (blocker && (ACTIVITIES[a].minRank || ACTIVITIES[a].academy !== undefined)) return null;
          const on = slot.activity === a;
          return (
            <button
              key={a}
              disabled={Boolean(blocker)}
              title={blocker ?? ACTIVITIES[a].description}
              onClick={() => pickActivity(a)}
              className={`rounded-sm border px-2 py-1 text-[11px] transition-colors ${
                on ? "border-brass bg-brass/15 text-brass-soft" : blocker ? "border-line text-faint/50" : "border-line text-muted hover:border-line-strong hover:text-ivory"
              }`}
            >
              {ACTIVITIES[a].icon} {ACTIVITIES[a].label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-faint">{def.description}</p>
      <TargetPicker state={state} slot={slot} onChange={onChange} />
    </div>
  );
}

function TargetPicker({ state, slot, onChange }: { state: GameState; slot: ActivityChoice; onChange: (c: ActivityChoice) => void }) {
  const def = ACTIVITIES[slot.activity];
  const c = state.character;
  const set = (target: string) => onChange({ ...slot, ...(target ? { target } : { target: undefined }) });
  if (def.target === "skill" || def.target === "academic" || SKILL_TARGETS.includes(slot.activity)) {
    const divisionSkills = new Set(c.divisions.flatMap((d) => findDivision(c.identity.agency, d)?.skills ?? []));
    return (
      <select className="field mt-2 py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
        {def.target === "academic"
          ? ACADEMIC_SKILLS.map((s) => (
              <option key={s} value={s}>
                {SKILLS[s].label} ({skillTotal(c, s)})
              </option>
            ))
          : ATTRIBUTE_IDS.map((a) => (
              <optgroup key={a} label={ATTRIBUTES[a].label}>
                {skillsOf(a).map((s: SkillId) => (
                  <option key={s} value={s}>
                    {SKILLS[s].label} ({skillTotal(c, s)}){divisionSkills.has(s) ? " ✦" : ""}
                    {s === c.signature ? " ★" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
      </select>
    );
  }
  if (def.target === "relation") {
    const here = state.world.cityId;
    return (
      <select className="field mt-2 py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
        {activeRelations(state).map((r) => (
          <option key={r.name} value={r.name}>
            {r.name} — lien {r.bond ?? 50} — {r.cityId === here ? "sur place" : r.cityId ? `à distance (${findCity(r.cityId)?.name})` : "à distance"}
          </option>
        ))}
      </select>
    );
  }
  if (def.target === "duty") {
    return (
      <select className="field mt-2 py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
        {state.duties
          .filter((d) => d.status === "ouvert" && d.activity === "devoir")
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} ({d.progress}/{d.required})
            </option>
          ))}
      </select>
    );
  }
  if (def.target === "city") {
    const active = state.command.assets.filter((a) => a.status === "actif").length;
    const cities = CITIES.filter((x) => !x.tags?.includes("secret") && findCountry(x.country)?.bloc !== "hostile").sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return (
      <>
        <select className="field mt-2 py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
          <option value="">Entretenir le réseau ({active} informateur{active > 1 ? "s" : ""})</option>
          {active < assetCap(c.rank) &&
            cities.map((x) => (
              <option key={x.id} value={x.id}>
                Recruter à {x.name}
              </option>
            ))}
        </select>
        <p className="mt-1 text-[10px] text-faint">
          {active}/{assetCap(c.rank)} informateurs à ton grade.
        </p>
      </>
    );
  }
  if (def.target === "agency") {
    const others = (["argos", "meridian", "monsoon"] as AgencyId[]).filter((a) => a !== c.identity.agency);
    return (
      <select className="field mt-2 py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
        <option value="">Rassurer les gouvernements membres</option>
        {others.map((a) => (
          <option key={a} value={a}>
            Ouvrir un canal avec {AGENCIES[a].name}
          </option>
        ))}
      </select>
    );
  }
  return null;
}

function Duties({ state }: { state: GameState }) {
  const open = state.duties.filter((d) => d.status === "ouvert").sort((a, b) => a.dueDay - b.dueDay);
  const recent = state.duties.filter((d) => d.status !== "ouvert").slice(-4).reverse();
  return (
    <section>
      <h3 className="label mb-2">Devoirs</h3>
      {open.length === 0 ? (
        <p className="text-xs text-faint italic">Aucune obligation en cours.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((d) => {
            const left = d.dueDay - state.world.day;
            return (
              <li key={d.id} className="rounded-sm border border-line bg-panel/50 px-3 py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>{d.title}</span>
                  <span className={`font-mono text-[11px] ${left <= 7 ? "text-fail" : "text-muted"}`}>{left > 0 ? `dans ${left} j` : "aujourd'hui"}</span>
                </p>
                <p className="text-xs text-muted">{d.description}</p>
                <p className="mt-1 flex flex-wrap justify-between gap-2 text-[10px] text-faint">
                  <span>
                    Avancer avec : {ACTIVITIES[d.activity].icon} {ACTIVITIES[d.activity].label} · {d.progress}/{d.required}
                  </span>
                  <span>
                    Si manqué :{" "}
                    {[d.penalty.reputation && `réputation ${d.penalty.reputation}`, d.penalty.merit && `mérite ${d.penalty.merit}`, d.penalty.morale && `moral ${d.penalty.morale}`, d.penalty.cover && `couverture ${d.penalty.cover}`]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px]">
          {recent.map((d) => (
            <li key={d.id} className={d.status === "fait" ? "text-success" : "text-fail"}>
              {d.status === "fait" ? "✓" : "✗"} {d.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
