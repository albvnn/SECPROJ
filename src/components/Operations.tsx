"use client";

import { useState } from "react";
import { AGENCIES, findSeat } from "@/lib/game/agencies";
import { delegateOffer } from "@/lib/game/command";
import { resourceAvailable } from "@/lib/game/engine";
import { heatLabel, heatOf, languageBonus, languagesOf, legendUsableIn, trip } from "@/lib/game/field";
import {
  approachOdds,
  availableGadgets,
  canStartMission,
  chooseRoute,
  currentNode,
  difficultyLabel,
  maxGadgets,
  maxTeam,
  nodeOptions,
  offersAreAssigned,
  regionLabel,
  requisitionBudget,
  suggestedTeam,
} from "@/lib/game/missions";
import { isAvailable, OPERATIVE_TRAITS, bestSkill, operativeTitle } from "@/lib/game/roster";
import { MISSION_IMPORTANCE, MISSION_RESULTS, SKILLS, can, formatEuros } from "@/lib/game/rules";
import type { Approach, GameState, Mission, MissionOffer, NodeStatus, Operative, PlayerAction } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { findCity, findCountry } from "@/lib/world/geo";
import { findFaction } from "@/lib/world/factions";
import { fundingFactor } from "@/lib/world/threats";
import { SkillGlyph } from "./glyphs";

const IMPORTANCE_COLOR: Record<string, string> = {
  locale: "var(--color-muted)",
  regionale: "var(--pole-esprit)",
  continentale: "var(--color-partial)",
  mondiale: "var(--color-fail)",
};

/* ------------------------------------------------------------------ */
/* Tableau des missions                                                */
/* ------------------------------------------------------------------ */

export function OpsBoard({
  state,
  onAction,
  onChange,
  busy,
}: {
  state: GameState;
  onAction: (a: PlayerAction) => void;
  onChange: (s: GameState) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const offer = state.offers.find((o) => o.id === selected) ?? null;
  const blocker = canStartMission(state);
  const w = state.world;

  if (state.mission) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-2xl">{state.mission.name}</h2>
        <MissionTrack mission={state.mission} />
        <p className="text-sm text-muted">La mission se joue dans le récit : choisis tes approches dans la console, en bas.</p>
      </div>
    );
  }

  if (offer) return <Preparation state={state} offer={offer} onBack={() => setSelected(null)} onAction={onAction} onChange={onChange} busy={busy} />;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="label mb-2">Tableau des missions</h3>
        {state.character.rank === "prospect" ? (
          <p className="text-sm text-faint italic">Tu ne sais même pas encore qu'il existe.</p>
        ) : state.offers.length === 0 ? (
          <p className="text-sm text-muted">
            {w.day < w.restUntil
              ? `Récupération obligatoire : aucune mission avant le jour ${w.restUntil} (dans ${Math.ceil((w.restUntil - w.day) / 7)} semaine${w.restUntil - w.day > 7 ? "s" : ""}).`
              : state.character.rank === "aspirant"
                ? state.character.armband === "blanc"
                  ? "Les Opérations Jeunesse se méritent : il faut d'abord le brassard gris."
                  : "Pas d'Opération Jeunesse pour l'instant. Les instructeurs choisissent leurs cadets semaine après semaine."
                : "La hiérarchie n'a rien pour toi cette semaine. Joue une semaine : les dossiers tombent vite."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {state.offers.map((o) => (
              <OfferCard key={o.id} state={state} offer={o} onOpen={() => setSelected(o.id)} />
            ))}
          </ul>
        )}
        {blocker && state.offers.length > 0 && <p className="mt-2 text-xs text-partial">Départ impossible : {blocker}.</p>}
      </section>

      {state.command.delegated.length > 0 && (
        <section>
          <h3 className="label mb-2">Missions confiées</h3>
          <ul className="space-y-1 text-sm">
            {state.command.delegated.map((d) => (
              <li key={d.offerId} className="flex justify-between gap-2">
                <span>{d.title}</span>
                <span className="text-xs text-muted">
                  retour jour {d.returnDay} · {Math.round(d.chance * 100)} %
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.lastMission && <Debrief state={state} mission={state.lastMission} />}
    </div>
  );
}

function OfferCard({ state, offer, onOpen }: { state: GameState; offer: MissionOffer; onOpen: () => void }) {
  const city = findCity(offer.cityId);
  const country = findCountry(city?.country ?? "");
  const left = offer.expiresDay - state.world.day;
  const nemesis = offer.nemesis ? state.world.geo.nemeses.find((n) => n.id === offer.nemesis) : undefined;
  const capstone = offer.threat && state.world.geo.threats.find((t) => t.id === offer.threat)?.capstone;
  const heat = heatOf(state.character, city?.country ?? "");
  return (
    <li>
      <button onClick={onOpen} className="group flex h-full w-full flex-col rounded-sm border border-line bg-panel/60 p-4 text-left transition-colors hover:border-brass/60">
        <p className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.15em] uppercase">
          <span style={{ color: IMPORTANCE_COLOR[offer.importance] }}>{offer.kind === "jeunesse" ? "Opération Jeunesse" : MISSION_IMPORTANCE[offer.importance].label}</span>
          {offer.assigned && <span className="rounded-sm bg-fail/15 px-1 text-fail">Assignée</span>}
          {offer.kind === "conjointe" && offer.other && <span style={{ color: AGENCIES[offer.other].color }}>Conjointe · {AGENCIES[offer.other].name}</span>}
          {offer.kind === "contre_espionnage" && offer.other && <span style={{ color: AGENCIES[offer.other].color }}>Contre-espionnage</span>}
          {capstone && <span className="rounded-sm bg-brass/20 px-1 text-brass-soft">Opération décisive</span>}
          {nemesis && <span className="text-fail">Némésis · {nemesis.name}</span>}
        </p>
        <p className="mt-1 font-serif text-xl leading-tight group-hover:text-brass-soft">{offer.title}</p>
        <p className="mt-1 text-xs text-muted">
          {city?.name}, {country?.name} · {regionLabel(offer.region)}
          {heat >= 30 && <span className="text-fail"> · tu y es {heatLabel(heat)}</span>}
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-ivory/80">{offer.summary}</p>
        <p className="mt-auto pt-2 text-[10px] text-faint">{left > 0 ? `${offer.assigned ? "À partir sous" : "Expire dans"} ${left} jours` : "Expire aujourd'hui"}</p>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Préparation                                                         */
/* ------------------------------------------------------------------ */

function Preparation({
  state,
  offer,
  onBack,
  onAction,
  onChange,
  busy,
}: {
  state: GameState;
  offer: MissionOffer;
  onBack: () => void;
  onAction: (a: PlayerAction) => void;
  onChange: (s: GameState) => void;
  busy: boolean;
}) {
  const c = state.character;
  const assigned = offersAreAssigned(c.rank) || offer.kind === "jeunesse";
  const suggested = suggestedTeam(state, offer);
  const [team, setTeam] = useState<string[]>(suggested);
  const [gadgets, setGadgets] = useState<string[]>([]);
  const [legend, setLegend] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const city = findCity(offer.cityId);
  const country = findCountry(city?.country ?? "");
  const faction = findFaction(offer.faction);
  const catalog = availableGadgets(state);
  const funding = fundingFactor(state.world.geo, c.identity.agency);
  const budget = Math.round(requisitionBudget(state) * funding);
  const spent = gadgets.reduce((n, id) => n + (catalog.find((g) => g.id === id)?.cost ?? 0), 0);
  const slots = maxGadgets(state);
  const pool = state.roster.filter((o) => o.agency === c.identity.agency && o.role !== "cadet" && isAvailable(o, state.world.day));
  const limit = offer.kind === "jeunesse" ? 1 : maxTeam(c.rank);
  const blocker = canStartMission(state);
  const canDelegate = can(c.rank, "delegate") && offer.kind !== "jeunesse";

  const toggleGadget = (id: string) =>
    setGadgets((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length < slots ? [...g, id] : g));
  const toggleMate = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < limit ? [...t, id] : t));

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-[10px] tracking-[0.15em] text-faint uppercase hover:text-ivory">
        ← Tableau des missions
      </button>
      <header>
        <p className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: IMPORTANCE_COLOR[offer.importance] }}>
          {offer.kind === "jeunesse" ? "Opération Jeunesse" : `Mission ${MISSION_IMPORTANCE[offer.importance].label.toLowerCase()}`}
        </p>
        <h2 className="font-serif text-3xl leading-tight">{offer.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {city?.name}, {country?.name}
          {country?.note ? ` — ${country.note}` : ""}
        </p>
        <p className="mt-3 text-ivory/85">{offer.summary}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="label">Objectif</dt>
            <dd>{offer.objective}</dd>
          </div>
          <div>
            <dt className="label">Adversaire</dt>
            <dd>
              {faction?.name} <span className="text-xs text-muted">— {faction?.style}</span>
            </dd>
          </div>
        </dl>
      </header>

      <FieldBrief state={state} offer={offer} />

      {c.legends.length > 0 && (
        <section>
          <h3 className="label mb-2">Légende · identité de couverture</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <LegendOption on={legend === ""} onClick={() => setLegend("")} title="Sous ton vrai nom" text="Aucune protection : chaque faux pas t'expose en plein." />
            {c.legends.map((l) => {
              const usable = legendUsableIn(l, city?.country ?? "");
              return (
                <LegendOption
                  key={l.id}
                  on={legend === l.id}
                  disabled={!usable}
                  onClick={() => setLegend(l.id)}
                  title={`${l.name} · crédibilité ${l.credibility}`}
                  text={usable ? `${l.profession} (${l.nationality}). Exposition −${Math.floor(l.credibility / 20)} par faux pas.` : `Grillée en ${country?.name}.`}
                />
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">Une couverture grillée en mission l'est dans tout le pays, et perd 40 de crédibilité.</p>
        </section>
      )}

      <section>
        <h3 className="label mb-2">
          Équipe {assigned ? "· désignée par la hiérarchie" : `· ${team.length}/${limit}`}
        </h3>
        {assigned ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {suggested.map((id) => {
              const o = state.roster.find((x) => x.id === id);
              return o ? <MateCard key={id} o={o} on /> : null;
            })}
            {suggested.length === 0 && <p className="text-sm text-faint italic">Personne de disponible : tu pars seul.</p>}
          </ul>
        ) : (
          <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {pool.map((o) => (
              <MateCard key={o.id} o={o} on={team.includes(o.id)} onClick={() => toggleMate(o.id)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="label mb-1">
          Réquisition · {gadgets.length}/{slots} gadgets · {formatEuros(spent)} sur {formatEuros(budget)}
          {funding < 0.98 || funding > 1.02 ? <span className={funding < 1 ? "text-fail" : "text-success"}> (budget ×{funding.toFixed(2)} selon la satisfaction des gouvernements)</span> : null}
        </h3>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brass" style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((g) => {
            const on = gadgets.includes(g.id);
            const tooExpensive = !on && spent + g.cost > budget;
            const full = !on && gadgets.length >= slots;
            return (
              <li key={g.id}>
                <button
                  disabled={tooExpensive || full}
                  onClick={() => toggleGadget(g.id)}
                  className={`flex h-full w-full flex-col rounded-sm border p-2.5 text-left transition-colors ${
                    on ? "border-brass bg-brass/10" : "border-line bg-panel/50 hover:border-line-strong"
                  } ${tooExpensive || full ? "opacity-40" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    {g.name}
                    <span className="shrink-0 font-mono text-[10px] text-muted">{formatEuros(g.cost)}</span>
                  </span>
                  <span className="mt-0.5 text-[11px] text-muted">{g.description}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-brass/90">
                    <span className="inline-flex items-center gap-1">
                      <SkillGlyph skill={g.skill} className="h-3 w-3" />
                      {SKILLS[g.skill].label} +{g.bonus}
                    </span>
                    {g.charges && <span>{g.charges} util.</span>}
                    {g.effect?.alert && <span>alerte {g.effect.alert}</span>}
                    {g.effect?.exposure && <span>exposition {g.effect.exposure}</span>}
                    {g.effect?.intel && <span>renseignement +{g.effect.intel}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-faint">
          Le matériel de {AGENCIES[c.identity.agency].lab.name} est rendu au retour ; le perdre coûte du mérite. Certains prototypes se débloquent par la recherche (Contrôleur).
        </p>
      </section>

      {error && <p className="text-sm text-fail">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          disabled={busy || Boolean(blocker)}
          onClick={() => onAction({ type: "mission_start", offer: offer.id, team: assigned ? suggested : team, gadgets, ...(legend ? { legend } : {}) })}
          className="btn btn-primary px-8"
        >
          Partir en mission ✈
        </button>
        {canDelegate && (
          <button
            disabled={busy || team.length === 0}
            onClick={() => {
              try {
                onChange(delegateOffer(state, offer.id, team));
                onBack();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Impossible.");
              }
            }}
            className="btn btn-ghost"
            title="Confier cette mission à l'équipe sélectionnée, sans y aller toi-même"
          >
            Déléguer à l'équipe
          </button>
        )}
        {!offer.assigned && (
          <button
            onClick={() => {
              onChange({ ...state, offers: state.offers.filter((o) => o.id !== offer.id), updatedAt: Date.now() });
              onBack();
            }}
            className="text-[11px] tracking-[0.15em] text-faint uppercase hover:text-ivory"
          >
            Écarter ce dossier
          </button>
        )}
        {blocker && <span className="text-xs text-partial">{blocker}</span>}
      </div>
    </div>
  );
}

/** Ce qui attend sur place : voyage, langue, notoriété, adversaire nommé. */
function FieldBrief({ state, offer }: { state: GameState; offer: MissionOffer }) {
  const c = state.character;
  const city = findCity(offer.cityId);
  const country = findCountry(city?.country ?? "");
  const t = trip(state.world.cityId, offer.cityId);
  const lang = languageBonus(c, city?.country ?? "");
  const heat = heatOf(c, city?.country ?? "");
  const nemesis = offer.nemesis ? state.world.geo.nemeses.find((n) => n.id === offer.nemesis) : undefined;
  const threat = offer.threat ? state.world.geo.threats.find((x) => x.id === offer.threat) : undefined;
  const hostile = country?.bloc === "hostile";
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Brief label="Voyage">
        {t.km ? (
          <>
            {findCity(state.world.cityId)?.name} → {city?.name} : {t.km.toLocaleString("fr-FR")} km, {t.hours} h
            {t.jetlag ? `, décalage ${t.jetlag} h` : ""}. <span className={t.fatigue >= 20 ? "text-partial" : ""}>Fatigue +{t.fatigue}.</span>
          </>
        ) : (
          "Tu es déjà sur place."
        )}
        {hostile && <span className="block text-fail">Territoire hostile : insertion clandestine, sans visa ni soutien local.</span>}
      </Brief>
      <Brief label="Langue">
        {languagesOf(city?.country ?? "").join(", ")}.{" "}
        {lang > 0 ? <span className="text-success">Tu la parles : +1 au contact des gens.</span> : <span className="text-fail">Barrière de la langue : −1 au contact des gens.</span>}
      </Brief>
      <Brief label={`Notoriété · ${country?.name ?? "?"}`}>
        <span className={heat >= 60 ? "text-fail" : heat >= 30 ? "text-partial" : "text-success"}>
          {heatLabel(heat)} ({heat}/100)
        </span>
        . {heat >= 60 ? "On t'attendra à l'arrivée, sauf si ta légende tient (crédibilité 60+)." : heat >= 30 ? `L'alerte partira de ${Math.round(heat / 3)}.` : "Personne ne te connaît ici."}
      </Brief>
      <Brief label={nemesis ? "Némésis" : "Menace"}>
        {nemesis ? (
          <>
            <span className="text-fail">{nemesis.name}</span>, {nemesis.title} — niveau {nemesis.level}, rancune {nemesis.grudge}. {nemesis.history}
          </>
        ) : threat ? (
          <>
            {threat.title} : avancement {threat.progress}/100{threat.capstone ? " — l'opération décisive contre la tête de la faction." : "."}
          </>
        ) : (
          "Aucun ennemi nommé dans ce dossier."
        )}
      </Brief>
    </section>
  );
}

function Brief({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
      <p className="label mb-1">{label}</p>
      <p className="text-xs leading-snug text-ivory/85">{children}</p>
    </div>
  );
}

function LegendOption({ on, disabled, onClick, title, text }: { on: boolean; disabled?: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-sm border p-2.5 text-left transition-colors ${on ? "border-brass bg-brass/10" : "border-line bg-panel/50 hover:border-line-strong"} ${disabled ? "opacity-40" : ""}`}
    >
      <span className="block text-sm">{title}</span>
      <span className="text-[11px] text-muted">{text}</span>
    </button>
  );
}

function MateCard({ o, on, onClick }: { o: Operative; on: boolean; onClick?: () => void }) {
  const trait = OPERATIVE_TRAITS[o.trait];
  const skills = Object.entries(o.skills)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3);
  const Tag = onClick ? "button" : "div";
  return (
    <li>
      <Tag
        onClick={onClick}
        className={`flex w-full flex-col rounded-sm border p-2.5 text-left ${on ? "border-brass bg-brass/10" : "border-line bg-panel/50"} ${onClick ? "hover:border-line-strong" : ""}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm">
            {o.codename ? <span className="font-mono text-[11px] tracking-[0.15em] text-brass uppercase">« {o.codename} » </span> : null}
            {o.name}
          </span>
          <span className={`text-[10px] ${o.affinity >= 20 ? "text-success" : o.affinity <= -20 ? "text-fail" : "text-muted"}`}>{o.affinity > 0 ? `+${o.affinity}` : o.affinity}</span>
        </span>
        <span className="text-[11px] text-muted">
          {o.nationality} · {operativeTitle(o)}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-ivory/80">
          {skills.map(([k, v]) => (
            <span key={k}>
              {SKILLS[k as keyof typeof SKILLS].label} {v}
            </span>
          ))}
        </span>
        <span className="mt-0.5 text-[10px] text-faint" title={trait?.description}>
          {trait?.label}
          {o.fatigue >= 50 ? ` · fatigué (${o.fatigue})` : ""}
        </span>
      </Tag>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Suivi et bilan                                                      */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<NodeStatus, string> = {
  a_venir: "border-line text-faint",
  en_cours: "border-brass text-brass-soft",
  reussi: "border-success/70 bg-success/15 text-success",
  partiel: "border-partial/70 bg-partial/15 text-partial",
  echoue: "border-fail/60 bg-fail/10 text-fail",
};

export function MissionTrack({ mission }: { mission: Mission }) {
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {mission.nodes.map((n, i) => (
        <li key={i} className="flex items-center gap-1" title={`${n.title}${n.key ? " (objectif)" : n.type === "secondaire" ? " (objectif secondaire, facultatif)" : ""}${n.alt ? ` — ou : ${n.alt.title}` : ""}`}>
          <span
            className={`grid h-6 min-w-6 place-items-center rounded-sm border px-1 text-[10px] font-semibold ${STATUS_STYLE[n.status]} ${n.key ? "ring-1 ring-brass/50" : ""} ${n.type === "secondaire" ? "border-dashed" : ""}`}
          >
            {n.type === "dilemme" ? "?" : n.key ? "★" : n.type === "secondaire" ? "◇" : i + 1}
            {n.alt && n.status === "a_venir" ? <sup className="ml-px text-[8px] text-brass">⑂</sup> : null}
          </span>
          {i < mission.nodes.length - 1 && <span className="h-px w-2 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

function Debrief({ state, mission }: { state: GameState; mission: Mission }) {
  const r = mission.result!;
  const color = r === "eclatant" || r === "reussite" ? "var(--color-success)" : r === "partiel" ? "var(--color-partial)" : "var(--color-fail)";
  return (
    <section className="rounded-sm border p-4" style={{ borderColor: tint(color, 45), background: tint(color, 6) }}>
      <p className="label" style={{ color }}>
        Dernière mission · {MISSION_RESULTS[r].label}
      </p>
      <p className="mt-1 font-serif text-xl">{mission.name}</p>
      <p className="text-xs text-muted">
        {findCity(mission.cityId)?.name} · {mission.objective}
      </p>
      <div className="mt-3">
        <MissionTrack mission={mission} />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ivory/80">
        {mission.history.map((h, i) => (
          <li key={i}>
            <span className="text-faint">{mission.nodes[h.node]?.title} — </span>
            {h.summary.split(" Exposition")[0].split(" MISSION TERMINÉE")[0]}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-faint">
        Équipe :{" "}
        {mission.team
          .map((id) => state.roster.find((o) => o.id === id))
          .filter(Boolean)
          .map((o) => o!.codename || o!.name)
          .join(", ") || "seul"}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Console de mission (dans le récit)                                  */
/* ------------------------------------------------------------------ */

export function MissionConsole({
  state,
  onAction,
  onChange,
  busy,
}: {
  state: GameState;
  onAction: (a: PlayerAction) => void;
  /** Décisions sans tour de jeu (changer d'itinéraire). */
  onChange?: (s: GameState) => void;
  busy: boolean;
}) {
  const m = state.mission!;
  const node = currentNode(m);
  const [spend, setSpend] = useState(0);
  const [free, setFree] = useState("");
  const options = nodeOptions(state);
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const seat = findSeat(c.identity.agency, c.seat);
  const resources = [
    ...(seat && resourceAvailable(state, "seat") ? [{ id: "seat", name: seat.signature.name, title: `${seat.name} : ${seat.signature.description} (une fois par mission : l'étape est emportée)` }] : []),
    ...agency.branches.filter((b) => resourceAvailable(state, b.id)).map((b) => ({ id: b.id, name: b.support.name, title: `${b.name} : ${b.support.description} (une fois par mission)` })),
  ];
  const maxSpend = Math.min(2, m.intel);
  const intel = Math.min(spend, maxSpend);
  if (!node) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">
            {m.name} · étape {m.current + 1}/{m.nodes.length}
          </p>
          <MissionTrack mission={m} />
        </div>
        <div className="flex gap-3">
          <Gauge label="Exposition" value={m.exposure} color="var(--color-fail)" />
          <Gauge label="Alerte" value={m.alert} color="var(--color-partial)" />
          <div className="text-center">
            <p className="text-[9px] tracking-[0.15em] text-faint uppercase">Renseign.</p>
            <p className="font-mono text-sm text-brass-soft">{m.intel}</p>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-line bg-panel/60 p-3">
        <p className="font-serif text-lg leading-tight">
          {node.type === "dilemme" ? "Dilemme — " : node.key ? "★ " : ""}
          {node.title}
        </p>
        <p className="text-sm text-muted">{node.situation}</p>
        {node.type === "secondaire" && <p className="mt-1 text-[11px] text-brass-soft">Objectif secondaire, facultatif : mérite, renseignement et une pièce de dossier sur {findFaction(m.faction)?.name ?? "la faction"}.</p>}
        {node.alt && node.attempts === 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs">
            <span className="text-muted">
              Autre itinéraire : <span className="text-ivory">{node.alt.title}</span> — {node.alt.situation}
            </span>
            {onChange && (
              <button disabled={busy} onClick={() => onChange(chooseRoute(state))} className="ml-auto rounded-sm border border-brass/60 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:bg-brass hover:text-ink">
                ⑂ Prendre cet itinéraire
              </button>
            )}
          </div>
        )}
      </div>

      {node.type !== "dilemme" && maxSpend > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted">
          Dépenser du renseignement :
          {Array.from({ length: maxSpend + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => setSpend(i)}
              className={`rounded-sm border px-2 py-0.5 font-mono ${intel === i ? "border-brass bg-brass/15 text-brass-soft" : "border-line hover:text-ivory"}`}
            >
              {i === 0 ? "0" : `+${i}`}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((a) => (
          <li key={a.id}>
            <ApproachButton state={state} a={a} intel={intel} disabled={busy} onClick={() => onAction({ type: "node", approach: a.id, intel: a.kind === "choix" ? 0 : intel })} />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {resources.map((r) => (
          <button
            key={r.id}
            disabled={busy}
            onClick={() => onAction({ type: "resource", source: r.id })}
            className="rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold tracking-wide"
            style={{ borderColor: agency.color, color: agency.color }}
            title={r.title}
          >
            {r.id === "seat" ? "✦" : "⚙"} {r.name}
          </button>
        ))}
        <form
          className="flex min-w-[14rem] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (free.trim()) {
              onAction({ type: "node_free", text: free.trim() });
              setFree("");
            }
          }}
        >
          <input value={free} onChange={(e) => setFree(e.target.value)} disabled={busy} maxLength={400} placeholder="Ou improviser autre chose…" className="field flex-1 py-1.5 text-sm" />
          <button type="submit" disabled={busy || !free.trim()} className="btn btn-ghost px-3 py-1.5">
            Tenter
          </button>
        </form>
      </div>
    </div>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="w-20">
      <p className="flex justify-between text-[9px] tracking-[0.15em] text-faint uppercase">
        {label}
        <span className="font-mono">{value}</span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function ApproachButton({ state, a, intel, disabled, onClick }: { state: GameState; a: Approach; intel: number; disabled: boolean; onClick: () => void }) {
  const odds = a.kind === "choix" ? null : Math.round(approachOdds(state, a, intel) * 100);
  const mate = a.operative ? state.roster.find((o) => o.id === a.operative) : undefined;
  const risks = [a.risk.exposure && `expo +${a.risk.exposure}`, a.risk.alert && `alerte +${a.risk.alert}`, a.risk.health && `santé −${a.risk.health}`].filter(Boolean);
  const effect = a.effect;
  const effects = effect
    ? [
        effect.exposure && `expo ${effect.exposure > 0 ? "+" : ""}${effect.exposure}`,
        effect.alert && `alerte ${effect.alert > 0 ? "+" : ""}${effect.alert}`,
        effect.intel && `renseignement +${effect.intel}`,
        effect.team && `équipe ${effect.team > 0 ? "+" : ""}${effect.team}`,
        effect.diplomacy && `diplomatie ${effect.diplomacy > 0 ? "+" : ""}${effect.diplomacy}`,
        effect.compromise && "objectif compromis",
        effect.rulebreak && "Règles de Lucerne ⚠",
      ].filter(Boolean)
    : [];
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="group flex h-full w-full items-start gap-2.5 rounded-sm border border-line bg-panel/60 px-3 py-2.5 text-left text-sm transition-all hover:border-brass/60 hover:bg-panel disabled:opacity-50"
    >
      {a.skill ? <SkillGlyph skill={a.skill} className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="mt-0.5 w-4 shrink-0 text-center text-brass">?</span>}
      <span className="min-w-0 flex-1">
        <span className="block">
          {a.kind === "gadget" && <span className="mr-1 text-[10px] font-bold tracking-[0.12em] text-brass uppercase">Gadget</span>}
          {a.kind === "equipier" && mate && <span className="mr-1 text-[10px] font-bold tracking-[0.12em] text-[#7fa6d9] uppercase">{mate.codename || "Équipier"}</span>}
          {a.label}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted">
          {a.skill && (
            <span>
              {SKILLS[a.skill].label} · {difficultyLabel(a.difficulty)}
            </span>
          )}
          {risks.length > 0 && <span className="text-fail/80">si échec : {risks.join(", ")}</span>}
          {a.cost ? <span>{formatEuros(a.cost)}</span> : null}
          {a.intel ? <span className="text-brass">renseignement +{a.intel}</span> : null}
          {effects.length > 0 && <span className="text-partial">{effects.join(" · ")}</span>}
        </span>
      </span>
      {odds !== null && (
        <span className={`shrink-0 font-mono text-sm font-semibold ${odds >= 75 ? "text-success" : odds >= 45 ? "text-partial" : "text-fail"}`}>{odds} %</span>
      )}
    </button>
  );
}

export { bestSkill };
