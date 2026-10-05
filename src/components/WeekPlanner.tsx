"use client";

import { useState } from "react";
import { AGENCIES, findSeat } from "@/lib/game/agencies";
import { BRANCH_FAVOR_MIN, skillTotal } from "@/lib/game/engine";
import { branchFavor } from "@/lib/game/command";
import { POSSESSIONS, buyPossession, owns, sellPossession, weeklyUpkeep, type PossessionDef } from "@/lib/game/economy";
import { ALL_LANGUAGES, LEGEND_COST, legendCap, speaksLanguage } from "@/lib/game/field";
import { ACADEMIC_SKILLS, ACTIVITIES, ACTIVITY_IDS, activeRelations, activityBlocker, assetCap, planError } from "@/lib/game/planner";
import { ATTRIBUTE_IDS, ATTRIBUTES, RANKS, SKILLS, formatEuros, skillsOf } from "@/lib/game/rules";
import type { ActivityChoice, ActivityId, AgencyId, GameState, SkillId } from "@/lib/game/types";
import { formatDate } from "@/lib/game/calendar";
import { schedule } from "@/lib/game/schedule";
import { upcoming } from "@/lib/world/agenda";
import { CITIES, REGION_IDS, REGIONS, findCity, findCountry } from "@/lib/world/geo";
import { knownRegions, regionOfCity } from "@/lib/game/intel";

/** Planning d'une semaine : trois créneaux, puis le moteur fait passer sept jours. */
export type Span = number | "auto";

const SPANS: { value: Span; label: string; hint: string }[] = [
  { value: 1, label: "1 sem.", hint: "Une semaine, racontée en détail" },
  { value: 4, label: "1 mois", hint: "Quatre semaines avec le même planning" },
  { value: 13, label: "3 mois", hint: "Une saison : la vie continue, racontée mois par mois (s'arrête sur un temps fort)" },
  { value: "auto", label: "Auto", hint: "Jusqu'au prochain temps fort (six mois au plus) : mission, devoir pressant, anniversaire, Conseil, Jeux, ennemi, promotion, blessure… Les petits événements se racontent en chemin." },
];

export const playLabel = (span: Span) =>
  span === "auto" ? "Laisser filer le temps ▸" : span >= 13 ? "Jouer la saison ▸" : span === 4 ? "Jouer le mois ▸" : span > 1 ? `Jouer ${span} semaines ▸` : "Jouer la semaine ▸";

/** Le rythme : combien de temps faire passer avec ce planning. */
export function SpanPicker({ value, onChange, disabled = false }: { value: Span; onChange?: (s: Span) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex overflow-hidden rounded-sm border border-line" role="radiogroup" aria-label="Durée">
      {SPANS.map((s) => (
        <button
          key={String(s.value)}
          role="radio"
          aria-checked={value === s.value}
          disabled={disabled || !onChange}
          onClick={() => onChange?.(s.value)}
          title={s.hint}
          className={`px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors ${value === s.value ? "bg-brass/20 text-brass-soft" : "text-muted hover:text-ivory"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function WeekSlots({
  state,
  plan,
  setPlan,
  onPlay,
  busy,
  span = 1,
  onSpan,
}: {
  state: GameState;
  plan: ActivityChoice[];
  setPlan: (p: ActivityChoice[]) => void;
  onPlay?: () => void;
  busy: boolean;
  span?: Span;
  onSpan?: (s: Span) => void;
}) {
  const error = planError(state, plan);
  const setSlot = (i: number, choice: ActivityChoice) => setPlan(plan.map((p, j) => (j === i ? choice : p)));
  const [picking, setPicking] = useState<number | null>(null);
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-2xl">{state.character.prison ? "En cellule" : "Ta semaine"}</h3>
        <span className="text-[11px] text-faint">
          Jour {state.world.day} → {span === "auto" ? "…" : state.world.day + 7 * span}
        </span>
      </div>
      <div className="space-y-2">
        {plan.map((slot, i) => (
          <SlotEditor
            key={i}
            index={i}
            state={state}
            slot={slot}
            picking={picking === i}
            onPick={(open) => setPicking(open ? i : null)}
            onChange={(c) => setSlot(i, c)}
          />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <p className={`text-xs ${error ? "text-fail" : "text-muted"}`}>
          {error ??
            (span === "auto"
              ? "Le temps file avec ce planning et s'arrête de lui-même sur ce qui compte."
              : span > 1
                ? `${span} semaines d'affilée avec ce planning ; le temps s'arrête plus tôt si quelque chose compte.`
                : "Sept jours passent, le narrateur raconte. Un événement peut survenir.")}
        </p>
        {onPlay && (
          <span className="flex flex-wrap items-center justify-end gap-2">
            {!state.character.prison && <SpanPicker value={span} onChange={onSpan} disabled={busy} />}
            <button onClick={onPlay} disabled={busy || Boolean(error)} className="btn btn-primary px-6">
              {playLabel(state.character.prison ? 1 : span)}
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

export function PrisonBanner({ state }: { state: GameState }) {
  const p = state.character.prison!;
  const city = findCity(p.cityId);
  const country = findCountry(p.country);
  const weeks = Math.max(0, Math.floor((state.world.day - p.since) / 7));
  return (
    <section className="rounded-sm border border-fail/50 bg-fail/[0.07] p-4">
      <p className="label text-fail">Détenu · {weeks ? `depuis ${weeks} semaine${weeks > 1 ? "s" : ""}` : "depuis cette semaine"}</p>
      <p className="mt-1 font-serif text-xl">
        Retenu à {city?.name ?? "?"} ({country?.name ?? "?"}) — geôliers : {p.captor}
      </p>
      <p className="mt-1 text-xs text-muted">
        Trois issues : tenir face aux interrogatoires, préparer ton évasion, ou attendre que le Conseil des Trois négocie un échange. Pas de mission tant que tu es détenu.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Gauge label="Évasion" value={p.escape} color="var(--color-success)" hint={p.escape >= 100 ? "C'est pour cette semaine" : "À 100, tu sors"} />
        <Gauge label="Secrets livrés" value={p.leaked} color="var(--color-fail)" hint={p.leaked >= 60 ? "Tes aveux coûtent cher à l'agence" : "Au-delà de 60, des sources tombent"} />
      </div>
    </section>
  );
}

export function StatusStrip({ state }: { state: GameState }) {
  const c = state.character;
  const w = state.world;
  const rest = w.restUntil - w.day;
  const informants = state.command.assets.filter((a) => a.status === "actif").reduce((n, a) => n + a.cost, 0);
  const upkeep = weeklyUpkeep(state);
  const injuries = c.injuries ?? [];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <Gauge label="Fatigue" value={c.fatigue} color={c.fatigue >= 60 ? "var(--color-fail)" : "var(--color-partial)"} hint={c.fatigue >= 60 ? "Malus aux jets" : "Repos : −35"} />
      <Gauge label="Couverture civile" value={c.cover} color={c.cover < 30 ? "var(--color-fail)" : "var(--color-success)"} hint={c.cover < 30 ? "Ta famille pose des questions" : "Vie officielle : +30"} />
      <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
        <p className="label">Prochaine mission</p>
        <p className={`mt-1 text-sm ${c.prison || rest > 0 ? "text-partial" : "text-success"}`}>
          {state.mission ? "En cours" : c.prison ? "Impossible (détenu)" : rest > 0 ? `Récupération : ${Math.ceil(rest / 7)} sem.` : c.rank === "prospect" ? "—" : "Disponible"}
        </p>
        {injuries.length > 0 && (
          <p className="text-[10px] text-fail" title={injuries.map((i) => i.name).join(", ")}>
            {injuries.length} blessure{injuries.length > 1 ? "s" : ""} ou séquelle{injuries.length > 1 ? "s" : ""}
          </p>
        )}
      </div>
      <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
        <p className="label">Solde</p>
        <p className="mt-1 font-mono text-sm text-success">{formatEuros(c.money)}</p>
        <p className="text-[10px] text-faint">
          +{formatEuros(RANKS[c.rank].allowance)}/sem.
          {upkeep > 0 && ` · entretien −${formatEuros(upkeep)}`}
          {informants > 0 && ` · informateurs −${formatEuros(informants)}`}
        </p>
      </div>
    </div>
  );
}

function Gauge({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
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

/** Activités cachées plutôt que grisées quand c'est le statut (grade, Académie, détention) qui les ferme. */
const statusBound = (a: ActivityId) => {
  const d = ACTIVITIES[a];
  return Boolean(d.cap || d.officer || d.prison || d.academy !== undefined);
};

function defaultTarget(state: GameState, a: ActivityId): string | undefined {
  const d = ACTIVITIES[a];
  const c = state.character;
  switch (d.target) {
    case "skill":
      return c.signature;
    case "academic":
      return ACADEMIC_SKILLS[0];
    case "relation":
      return activeRelations(state)[0]?.name;
    case "duty":
      return state.duties.find((x) => x.status === "ouvert" && x.activity === "devoir")?.id;
    case "branch":
      return AGENCIES[c.identity.agency].branches[0]?.id;
    case "language":
      return Object.keys(c.learning ?? {})[0] ?? ALL_LANGUAGES.find((l) => !speaksLanguage(c, l));
    case "legend":
      return c.legends.length >= legendCap(c) ? c.legends[0]?.id : undefined;
    case "choice":
      return d.options?.[0]?.id;
    case "region":
      return regionOfCity(c.station ?? state.world.cityId) ?? "europe";
    default:
      return undefined;
  }
}

/** L'effet d'une activité en quelques mots. */
const SHORT: Record<ActivityId, string> = {
  cours: "Examens · compétences académiques",
  entrainement: "+2 xp sur une compétence · fatigant",
  repos: "Santé +3 · moral +2 · fatigue −35",
  loisirs: "Moral +3 · fatigue −15 · rencontres",
  langue: "Une langue apprise à 100",
  relation: "Lien +15 (à distance) ou +30",
  couverture: "Couverture civile +30",
  devoir: "Avancer un devoir",
  branche: "Estime +8 et un coup de pouce",
  legende: "Créer (2 000 €) ou consolider",
  informateurs: "Recruter ou entretenir",
  escouade: "Former tes seconds",
  antenne: "Renseignement régional +2",
  theatre: "Projets +1 · tension −2",
  agence: "Crédit +5 ou diplomatie",
  resister: "Sang-froid face aux aveux",
  evasion: "Préparer l'évasion",
  attendre: "Compter sur l'échange",
  sport: "Corps · compétence physique +1 · moral +1",
  exercice: "Deux compétences de terrain +1",
  veille: "Une région suivie six mois",
  job: "Argent · couverture +10",
  soins: "Guérison plus rapide · santé +2",
  mondanites: "Un contact, ou réputation +1",
  profil_bas: "Notoriété −12 dans deux pays",
  instruire: "Réputation +3 · Tactique +1",
};

const GROUPS: { label: string; ids: ActivityId[] }[] = [
  { label: "Toi", ids: ["entrainement", "sport", "exercice", "cours", "langue", "repos", "soins", "loisirs"] },
  { label: "Ta vie", ids: ["relation", "mondanites", "couverture", "job", "devoir"] },
  { label: "Le métier", ids: ["veille", "profil_bas", "branche", "legende", "informateurs", "escouade", "antenne", "theatre", "agence", "instruire"] },
  { label: "Détention", ids: ["resister", "evasion", "attendre"] },
];

function SlotEditor({
  index,
  state,
  slot,
  picking,
  onPick,
  onChange,
}: {
  index: number;
  state: GameState;
  slot: ActivityChoice;
  picking: boolean;
  onPick: (open: boolean) => void;
  onChange: (c: ActivityChoice) => void;
}) {
  const def = ACTIVITIES[slot.activity];
  const pickActivity = (a: ActivityId) => {
    const target = defaultTarget(state, a);
    onChange({ activity: a, ...(target ? { target } : {}) });
    onPick(false);
  };
  return (
    <div className={`rounded-sm border bg-panel/60 px-3 py-2.5 transition-colors ${picking ? "border-brass" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button onClick={() => onPick(!picking)} className="group flex min-w-[12rem] flex-1 items-center gap-3 text-left" aria-expanded={picking}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-line-strong text-lg text-brass group-hover:border-brass">{def.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="font-serif text-xl leading-tight">{def.label}</span>
              <span className="text-[10px] tracking-[0.15em] text-faint uppercase">créneau {index + 1}</span>
            </span>
            <span className="block truncate text-[11px] text-muted">{SHORT[slot.activity]}</span>
          </span>
        </button>
        {!picking && (
          <div className="w-full sm:w-56">
            <TargetPicker state={state} slot={slot} onChange={onChange} />
          </div>
        )}
        <button onClick={() => onPick(!picking)} className="text-[10px] tracking-[0.12em] text-muted uppercase hover:text-ivory">
          {picking ? "Fermer ✕" : "Changer"}
        </button>
      </div>
      {picking && <ActivityPicker state={state} current={slot.activity} onPick={pickActivity} />}
    </div>
  );
}

function ActivityPicker({ state, current, onPick }: { state: GameState; current: ActivityId; onPick: (a: ActivityId) => void }) {
  return (
    <div className="animate-rise mt-3 grid gap-x-4 gap-y-2.5 border-t border-line pt-3 sm:grid-cols-3">
      {GROUPS.map((g) => {
        const ids = g.ids.filter((a) => ACTIVITY_IDS.includes(a) && !(activityBlocker(state, a) && statusBound(a)));
        if (!ids.length) return null;
        return (
          <div key={g.label}>
            <p className="label mb-1">{g.label}</p>
            <ul className="space-y-0.5">
              {ids.map((a) => {
                const blocker = activityBlocker(state, a);
                const on = a === current;
                return (
                  <li key={a}>
                    <button
                      disabled={Boolean(blocker)}
                      onClick={() => onPick(a)}
                      title={blocker ?? ACTIVITIES[a].description}
                      className={`flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors ${
                        on ? "bg-brass/15 text-brass-soft" : blocker ? "text-faint/50" : "hover:bg-ivory/5"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center text-brass">{ACTIVITIES[a].icon}</span>
                      <span className="shrink-0">{ACTIVITIES[a].label}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-[10px] text-faint">{blocker ?? SHORT[a]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TargetPicker({ state, slot, onChange }: { state: GameState; slot: ActivityChoice; onChange: (c: ActivityChoice) => void }) {
  const def = ACTIVITIES[slot.activity];
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const set = (target: string) => onChange({ ...slot, ...(target ? { target } : { target: undefined }) });
  if (def.target === "choice" && def.options) {
    return (
      <div className="flex flex-wrap gap-1">
        {def.options.map((o) => (
          <button
            key={o.id}
            onClick={() => set(o.id)}
            title={o.hint}
            className={`rounded-sm border px-2 py-1 text-left text-[11px] transition-colors ${slot.target === o.id ? "border-brass bg-brass/15 text-brass-soft" : "border-line text-muted hover:border-line-strong hover:text-ivory"}`}
          >
            {o.label}
            <span className="block text-[9px] text-faint">{o.hint}</span>
          </button>
        ))}
      </div>
    );
  }
  if (def.target === "region") {
    const watched = knownRegions(state);
    return (
      <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
        {REGION_IDS.map((r) => (
          <option key={r} value={r}>
            {REGIONS[r].label}
            {watched.has(r) ? " · déjà suivie" : ""}
          </option>
        ))}
      </select>
    );
  }
  if (def.target === "skill" || def.target === "academic") {
    const seatSkills = new Set(findSeat(c.identity.agency, c.seat)?.specialty ?? []);
    return (
      <>
        <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
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
                      {SKILLS[s].label} ({skillTotal(c, s)}){seatSkills.has(s) ? " ✦" : ""}
                      {s === c.signature ? " ★" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
        </select>
        {seatSkills.size > 0 && def.target === "skill" && <p className="mt-1 text-[10px] text-faint">✦ spécialité de ton siège : +1 d'expérience.</p>}
      </>
    );
  }
  if (def.target === "relation") {
    const here = state.world.cityId;
    return (
      <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
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
      <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
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
  if (def.target === "branch") {
    const b = agency.branches.find((x) => x.id === slot.target);
    const favor = b ? branchFavor(state, b.id) : 0;
    return (
      <>
        <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
          {agency.branches.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} — estime {branchFavor(state, x.id) > 0 ? "+" : ""}
              {branchFavor(state, x.id)}
            </option>
          ))}
        </select>
        {b && (
          <p className="mt-1 text-[10px] leading-snug text-faint">
            {b.chief.name}. {favor < BRANCH_FAVOR_MIN ? <span className="text-fail">Il te refuse son soutien en mission.</span> : `En mission : ${b.support.name}.`}
          </p>
        )}
      </>
    );
  }
  if (def.target === "language") {
    const learning = Object.entries(c.learning ?? {}).sort((a, b) => b[1] - a[1]);
    const rest = ALL_LANGUAGES.filter((l) => !speaksLanguage(c, l) && !(l in (c.learning ?? {})));
    return (
      <>
        <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
          {learning.length > 0 && (
            <optgroup label="En cours">
              {learning.map(([l, v]) => (
                <option key={l} value={l}>
                  {l} — {v}/100
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Commencer">
            {rest.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="mt-1 text-[10px] text-faint">Tu parles : {c.spoken.join(", ") || "—"}.</p>
      </>
    );
  }
  if (def.target === "legend") {
    const cap = legendCap(c);
    const canCreate = c.legends.length < cap;
    return (
      <>
        <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
          {canCreate && <option value="">Construire une nouvelle légende ({formatEuros(LEGEND_COST)})</option>}
          {c.legends.map((l) => (
            <option key={l.id} value={l.id}>
              Consolider {l.name} — crédibilité {l.credibility}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-faint">
          {c.legends.length}/{cap} légendes à ton grade.{!slot.target && c.money < LEGEND_COST ? " Pas assez d'argent." : ""}
        </p>
      </>
    );
  }
  if (def.target === "city") {
    const active = state.command.assets.filter((a) => a.status === "actif").length;
    const cities = CITIES.filter((x) => !x.tags?.includes("secret") && findCountry(x.country)?.bloc !== "hostile").sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return (
      <>
        <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
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
      <select className="field py-1.5 text-xs" value={slot.target ?? ""} onChange={(e) => set(e.target.value)}>
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

export function Duties({ state }: { state: GameState }) {
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

const AGENDA_KIND: Record<string, { label: string; color: string }> = {
  sommet: { label: "Sommet", color: "var(--pole-esprit)" },
  election: { label: "Élection", color: "var(--color-partial)" },
  sport: { label: "Sport", color: "var(--color-success)" },
  concordat: { label: "Concordat", color: "var(--color-brass)" },
};

/** Les grands rendez-vous des quatre prochains mois : calendrier réel et vie du Concordat. */
export function Agenda({ state }: { state: GameState }) {
  const list = upcoming(state, 120).sort((a, b) => a.inDays - b.inDays);
  const birthday = schedule(state, 0).find((i) => i.kind === "perso");
  const bIn = birthday ? birthday.day - state.world.day : 0;
  return (
    <section>
      <h3 className="label mb-2">Grands rendez-vous · 4 mois</h3>
      {birthday && (
        <p className="mb-1.5 flex items-baseline gap-3 rounded-sm border border-[color:var(--pole-ame)]/40 bg-panel/40 px-3 py-1.5">
          <span className="w-16 shrink-0 font-mono text-[10px] text-muted">{bIn <= 0 ? "aujourd'hui" : `J−${bIn}`}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            ♥ Ton anniversaire
            <span className="ml-2 text-[10px] text-faint">
              {formatDate(birthday.date)} · {birthday.detail}
            </span>
          </span>
          <span className="shrink-0 text-[9px] font-semibold tracking-[0.15em] uppercase" style={{ color: "var(--pole-ame)" }}>
            Perso
          </span>
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-xs text-faint italic">Rien d'inscrit au calendrier.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map(({ event, start, inDays }) => {
            const kind = AGENDA_KIND[event.kind];
            const city = findCity(event.cityId);
            return (
              <li key={`${event.id}-${start}`} className="flex items-baseline gap-3 rounded-sm border border-line bg-panel/40 px-3 py-1.5">
                <span className="w-16 shrink-0 font-mono text-[10px] text-muted">{inDays <= 0 ? "en cours" : `J−${inDays}`}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {event.name}
                  <span className="ml-2 text-[10px] text-faint">
                    {formatDate(start)}
                    {city ? ` · ${city.name}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[9px] font-semibold tracking-[0.15em] uppercase" style={{ color: kind.color }}>
                  {kind.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-faint">Les sommets et les élections attirent les menaces : des missions s'y greffent souvent.</p>
    </section>
  );
}

const CATEGORY_LABELS: Record<PossessionDef["category"], string> = {
  logement: "Logement",
  vehicule: "Véhicule",
  style: "Garde-robe",
  formation: "Cours",
  famille: "Famille",
};

/** L'économie personnelle : acheter, entretenir, résilier. */
export function Possessions({ state, onChange, compact = false }: { state: GameState; onChange?: (s: GameState) => void; compact?: boolean }) {
  const c = state.character;
  const [error, setError] = useState<string | null>(null);
  const cadet = c.rank === "prospect" || c.rank === "aspirant";
  const upkeep = weeklyUpkeep(state);
  const run = (fn: () => GameState) => {
    if (!onChange) return;
    try {
      setError(null);
      onChange(fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible.");
    }
  };
  return (
    <section>
      <h3 className="label mb-1 flex flex-wrap justify-between gap-2">
        <span>Patrimoine · économie personnelle</span>
        <span className="font-mono normal-case">entretien {formatEuros(upkeep)}/sem.</span>
      </h3>
      <p className="mb-3 text-xs text-muted">
        Ta solde paie ta vie : logement, véhicule, garde-robe, cours, aide à ta famille. L'entretien est prélevé chaque semaine ; ce que tu ne peux plus payer est perdu. Revendre rend la moitié du prix.
      </p>
      {error && <p className="mb-2 text-xs text-fail">{error}</p>}
      <ul className={`grid gap-2 ${compact ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {POSSESSIONS.map((p) => {
          const mine = owns(state, p.id);
          const locked = Boolean(p.minRank) && cadet;
          const cost = p.price + p.upkeep;
          const replaces = (p.replaces ?? []).filter((id) => owns(state, id));
          return (
            <li key={p.id} className={`flex flex-col rounded-sm border p-3 ${mine ? "border-brass/60 bg-brass/5" : "border-line bg-panel/50"} ${locked ? "opacity-50" : ""}`}>
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span>{p.name}</span>
                <span className="shrink-0 text-[9px] tracking-[0.15em] text-faint uppercase">{CATEGORY_LABELS[p.category]}</span>
              </p>
              <p className="text-[11px] text-muted">{p.description}</p>
              <p className="mt-1 text-[11px] text-brass-soft/90">{p.effect}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[10px]">
                <span className="font-mono text-muted">
                  {p.price ? `${formatEuros(p.price)} · ` : ""}
                  {p.upkeep ? `${formatEuros(p.upkeep)}/sem.` : "sans entretien"}
                </span>
                {onChange &&
                  (mine ? (
                    <button onClick={() => run(() => sellPossession(state, p.id))} className="tracking-[0.12em] text-faint uppercase hover:text-ivory">
                      {p.price ? `Revendre (${formatEuros(Math.round(p.price / 2))})` : "Résilier"}
                    </button>
                  ) : locked ? (
                    <span className="text-faint">après le Brevet</span>
                  ) : (
                    <button
                      disabled={c.money < cost}
                      title={replaces.length ? `Remplace : ${replaces.map((id) => POSSESSIONS.find((x) => x.id === id)?.name).join(", ")}` : `${formatEuros(cost)} avec la première semaine`}
                      onClick={() => run(() => buyPossession(state, p.id))}
                      className="font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline disabled:opacity-40"
                    >
                      {p.price ? "Acheter" : "Souscrire"}
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
