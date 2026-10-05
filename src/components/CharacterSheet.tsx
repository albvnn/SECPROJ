"use client";

import { useState } from "react";
import { tint } from "@/lib/ui/color";
import {
  ATTRIBUTE_IDS,
  ATTRIBUTES,
  BREVET_AGE,
  MISSION_IMPORTANCE,
  PHASE_IDS,
  PHASES,
  PINS,
  POLE_POINT_COST,
  RANK_IDS,
  RANKS,
  SELECTION_DAYS,
  SKILLS,
  ageStage,
  findFlaw,
  findOrigin,
  findQuality,
  formatEuros,
  formatMerit,
  phaseLabel,
  skillsOf,
  xpToNext,
} from "@/lib/game/rules";
import { AGENCIES, DIVISION_SKILL_REQUIREMENT, divisionLimit, findDivision, type DivisionDef } from "@/lib/game/agencies";
import { formatDate } from "@/lib/game/calendar";
import {
  CARRY_LIMIT,
  RELATION_LIMIT,
  canSpendOnPole,
  canSpendOnSkill,
  capFor,
  currentAge,
  currentDate,
  nextRank,
  rankMissing,
  resourceAvailable,
  skillTotal,
  spendPolePoint,
  spendSkillPoint,
  toggleCarried,
  traitSkillMod,
} from "@/lib/game/engine";
import type {
  AttributeId,
  Character,
  GameState,
  Item,
  ItemCategory,
  PlayerAction,
  ProgressKind,
  Relation,
  RelationKind,
  RelationStatus,
  SkillId,
} from "@/lib/game/types";
import { PoleEmblem, SkillGlyph } from "./glyphs";
import { RichText } from "./RichText";
import { DivisionSigil } from "./sigils";
import { Bar, RankBadge } from "./ui";
import { findCity } from "@/lib/world/geo";

type Tab = "fiche" | "agent" | "relations" | "sac" | "carnet" | "dossier";

const TABS: { id: Tab; label: string }[] = [
  { id: "fiche", label: "Fiche" },
  { id: "agent", label: "Agent" },
  { id: "relations", label: "Liens" },
  { id: "sac", label: "Sac" },
  { id: "carnet", label: "Carnet" },
  { id: "dossier", label: "Dossier" },
];

interface SheetProps {
  state: GameState;
  /** Absent : fiche en lecture seule (par exemple pendant qu'un tour s'écrit). */
  onChange?: (next: GameState) => void;
  /** Lance un tour de jeu (contacter, utiliser un objet, ressource de Division). */
  onAction?: (action: PlayerAction) => void;
  /** Ouvre la cérémonie de choix de Division (présent seulement quand un choix est possible). */
  onOpenDivisions?: () => void;
}

export function CharacterSheet({ state, onChange, onAction, onOpenDivisions }: SheetProps) {
  const [tab, setTab] = useState<Tab>("fiche");
  const activeRelations = state.relations.filter((r) => r.status !== "archive" && r.status !== "mort").length;
  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors ${
              tab === t.id ? "border-b-2 border-brass text-brass-soft" : "text-muted hover:text-ivory"
            }`}
          >
            {t.label}
            {t.id === "relations" && activeRelations > 0 && <span className="ml-1 text-faint">{activeRelations}</span>}
            {t.id === "fiche" && state.character.skillPoints > 0 && (
              <span className="ml-1 rounded-full bg-brass px-1.5 text-[9px] text-ink">{state.character.skillPoints}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "fiche" && <Fiche state={state} onChange={onChange} onAction={onAction} />}
        {tab === "agent" && <AgentTab state={state} onOpenDivisions={onOpenDivisions} />}
        {tab === "relations" && <Relations state={state} onChange={onChange} onAction={onAction} />}
        {tab === "sac" && <Inventory state={state} onChange={onChange} onAction={onAction} />}
        {tab === "carnet" && <Carnet state={state} />}
        {tab === "dossier" && <DossierTab state={state} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */

function Fiche({ state, onChange, onAction }: SheetProps) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const rank = RANKS[c.rank];
  const origin = findOrigin(c.originId);
  const healthColor = c.health <= 3 ? "var(--color-stamp)" : c.health <= c.healthMax / 2 ? "var(--color-partial)" : "var(--pole-corps)";
  const divisionSkills = new Map<SkillId, DivisionDef>();
  for (const id of c.divisions) {
    const d = findDivision(c.identity.agency, id);
    d?.skills.forEach((s) => divisionSkills.set(s, d));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <RankBadge rank={c.rank} className="mt-1 h-12 w-10 shrink-0" />
        <div className="min-w-0">
          {c.codename && <p className="font-mono text-[11px] tracking-[0.3em] text-brass uppercase">« {c.codename} »</p>}
          <h2 className="font-serif text-2xl leading-tight">
            {c.identity.firstName} {c.identity.lastName}
          </h2>
          <p className="text-xs text-muted">
            {currentAge(state)} ans · {c.identity.nationality} · {origin?.label}
          </p>
          <p className="mt-1 text-xs">
            <span className="font-semibold tracking-[0.2em]" style={{ color: agency.color }}>
              {agency.name}
            </span>
            <span className="text-ivory/90"> · {rank.label}</span>
            {c.rank === "aspirant" || c.rank === "prospect" ? <span className="text-muted"> · brassard {c.armband}</span> : null}
          </p>
          {c.divisions.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {c.divisions.map((id) => (
                <span key={id} className="rounded-sm px-1.5 py-0.5 text-[10px] tracking-wide" style={{ background: tint(agency.color, 15), color: agency.color }}>
                  {findDivision(c.identity.agency, id)?.name ?? id}
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      {state.mission && <MissionPanel state={state} onAction={onAction} />}

      <section className="space-y-3">
        <Bar label="Santé" value={c.health} max={c.healthMax} color={healthColor} />
        <Bar label="Moral" value={c.morale} max={c.moraleMax} color="var(--pole-ame)" />
        <Bar label="Réputation" value={c.reputation} max={100} color="var(--color-brass)" display={`${c.reputation}`} />
        {state.world.phase !== "dossier" && (
          <>
            <Bar label="Fatigue" value={c.fatigue ?? 0} max={100} color={(c.fatigue ?? 0) >= 60 ? "var(--color-fail)" : "var(--color-partial)"} display={`${c.fatigue ?? 0}`} />
            <Bar label="Couverture civile" value={c.cover ?? 0} max={100} color={(c.cover ?? 0) < 30 ? "var(--color-fail)" : "var(--color-success)"} display={`${c.cover ?? 0}`} />
          </>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="label">Solde</span>
          <span className="font-mono text-sm text-success">{formatEuros(c.money)}</span>
        </div>
        {state.world.phase === "mission" && (
          <div className="flex items-baseline justify-between" title="Fonds de l'agence pour cette mission, restitués à la fin">
            <span className="label">Fonds d'opération</span>
            <span className="font-mono text-sm" style={{ color: agency.color }}>
              {formatEuros(c.missionFunds)}
            </span>
          </div>
        )}
      </section>

      {c.skillPoints > 0 && (
        <div className="rounded-sm border border-brass/50 bg-brass/10 px-3 py-2.5 text-sm">
          <p className="font-semibold text-brass-soft">
            {c.skillPoints} point{c.skillPoints > 1 ? "s" : ""} de compétence à répartir
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {onChange
              ? `+ sur une compétence : un rang (dans la limite du pôle). + sur un pôle : ${POLE_POINT_COST} points.`
              : "Disponible quand le narrateur a fini d'écrire."}
          </p>
        </div>
      )}

      <section className="space-y-4">
        {ATTRIBUTE_IDS.map((a) => (
          <PoleBlock
            key={a}
            pole={a}
            c={c}
            divisionSkills={divisionSkills}
            agencyColor={agency.color}
            onSpendSkill={onChange && ((sk) => onChange(spendSkillPoint(state, sk)))}
            onSpendPole={onChange && (() => onChange(spendPolePoint(state, a)))}
          />
        ))}
      </section>

      <section>
        <h3 className="label mb-2">Traits</h3>
        <ul className="space-y-2 text-sm">
          {c.qualities.map(findQuality).map(
            (q) =>
              q && (
                <li key={q.id}>
                  <span className="text-success">◆</span> <span className="text-ivory">{q.label}</span>
                  <span className="block pl-4 text-xs text-muted">{q.description}</span>
                </li>
              ),
          )}
          {(() => {
            const f = findFlaw(c.flaw);
            return (
              f && (
                <li>
                  <span className="text-fail">◆</span> <span className="text-ivory">{f.label}</span>
                  <span className="block pl-4 text-xs text-muted">{f.description}</span>
                </li>
              )
            );
          })()}
        </ul>
      </section>
    </div>
  );
}

function MissionPanel({ state, onAction }: { state: GameState; onAction?: (a: PlayerAction) => void }) {
  const m = state.mission!;
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const divName = (id: string) => findDivision(c.identity.agency, id)?.name ?? id;
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section className="rounded-sm border p-3" style={{ borderColor: tint(agency.color, 45), background: tint(agency.color, 7) }}>
      <p className="label" style={{ color: agency.color }}>
        Mission en cours · {MISSION_IMPORTANCE[m.importance].label}
      </p>
      <p className="mt-0.5 font-serif text-lg leading-tight">{m.name}</p>
      <p className="mt-1 text-xs text-ivory/85">{m.objective}</p>
      <p className="mt-1.5 text-[11px] text-muted">
        Menée par {divName(m.lead)}
        {m.support.length > 0 && ` · soutien : ${m.support.map(divName).join(", ")}`} · depuis le jour {m.startDay}
      </p>
      <div className="mt-2">
        <div className="flex justify-between text-[10px] tracking-[0.12em] text-muted uppercase">
          <span>
            Étape {Math.min(m.current + 1, m.nodes.length)}/{m.nodes.length}
          </span>
          <span>
            expo {m.exposure} · alerte {m.alert} · rens. {m.intel}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(m.current / m.nodes.length) * 100}%`, background: agency.color }} />
        </div>
      </div>
      {c.divisions.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-2.5" style={{ borderColor: tint(agency.color, 25) }}>
          <p className="label">Ressources de Division · une fois par mission</p>
          {c.divisions.map((id) => {
            const d = findDivision(c.identity.agency, id);
            if (!d) return null;
            const available = resourceAvailable(state, id);
            return (
              <div key={id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${available ? "text-ivory" : "text-faint line-through"}`}>
                    ✦ {d.resource.name} <span className="text-faint">· {d.name}</span>
                  </p>
                  <p className="text-[11px] text-muted">{d.resource.description}</p>
                </div>
                {available && onAction && (
                  <button
                    onClick={() => {
                      if (confirm === id) {
                        setConfirm(null);
                        onAction({ type: "resource", division: id });
                      } else setConfirm(id);
                    }}
                    onBlur={() => setConfirm(null)}
                    className="shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors hover:bg-brass hover:text-ink"
                    style={{ borderColor: agency.color, color: confirm === id ? undefined : agency.color }}
                  >
                    {confirm === id ? "Confirmer" : "Utiliser"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SpendButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-brass/60 text-xs leading-none text-brass-soft transition-colors hover:bg-brass hover:text-ink"
    >
      +
    </button>
  );
}

function PoleBlock({
  pole,
  c,
  divisionSkills,
  agencyColor,
  onSpendSkill,
  onSpendPole,
}: {
  pole: AttributeId;
  c: Character;
  divisionSkills: Map<SkillId, DivisionDef>;
  agencyColor: string;
  onSpendSkill?: (s: SkillId) => void;
  onSpendPole?: () => void;
}) {
  const def = ATTRIBUTES[pole];
  return (
    <div className="overflow-hidden rounded-sm border" style={{ borderColor: tint(def.color, 33), background: tint(def.color, 5) }}>
      <div className="flex items-center gap-3 px-3 py-2" style={{ background: tint(def.color, 12) }} title={def.description}>
        <PoleEmblem pole={pole} className="h-7 w-7" />
        <span className="flex-1 text-xs font-bold tracking-[0.25em] uppercase" style={{ color: def.color }}>
          {def.label}
        </span>
        {onSpendPole && canSpendOnPole(c, pole) && (
          <SpendButton onClick={onSpendPole} title={`Renforcer ${def.label} (${POLE_POINT_COST} points) : relève les plafonds`} />
        )}
        <span className="font-serif text-3xl leading-none lining-nums" style={{ color: def.color }}>
          {c.attributes[pole]}
        </span>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {skillsOf(pole).map((s) => {
          const sk = c.skills[s];
          const cap = capFor(c, s);
          const total = skillTotal(c, s);
          const talent = traitSkillMod(c, s);
          const atCap = sk.rank >= cap;
          const progress = Math.min(1, sk.xp / xpToNext(sk.rank));
          const division = divisionSkills.get(s);
          return (
            <li key={s} className="flex items-center gap-2.5 px-3 py-1.5" title={`${SKILLS[s].description}${talent ? ` (traits ${talent > 0 ? "+" : ""}${talent})` : ""}`}>
              <SkillGlyph skill={s} className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span className="truncate">{SKILLS[s].label}</span>
                  {s === c.signature && (
                    <span className="text-[10px] text-brass" title="Compétence signature">
                      ★
                    </span>
                  )}
                  {division && (
                    <span className="text-[10px]" style={{ color: agencyColor }} title={`${division.name} : apprentissage accéléré hors mission`}>
                      ✦
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {Array.from({ length: cap }, (_, i) => (
                    <span key={i} className="h-[3px] w-2.5 rounded-full" style={{ background: i < sk.rank ? def.color : "var(--hairline)" }} />
                  ))}
                  <span className="ml-1 h-[2px] w-8 overflow-hidden rounded-full" style={{ background: "var(--hairline)" }}>
                    <span
                      className="block h-full transition-all duration-700"
                      style={{ width: `${progress * 100}%`, background: atCap ? "var(--color-faint)" : tint(def.color, 67) }}
                    />
                  </span>
                </div>
              </div>
              {onSpendSkill && canSpendOnSkill(c, s) && (
                <SpendButton onClick={() => onSpendSkill(s)} title={`Dépenser un point : ${SKILLS[s].label} rang ${sk.rank + 1}`} />
              )}
              <span className="w-6 text-right font-mono text-base font-semibold" style={{ color: def.color }}>
                {total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent : agence, grade, Divisions, carrière                          */
/* ------------------------------------------------------------------ */

const PROGRESS_ICONS: Record<ProgressKind, string> = {
  skill: "▲",
  pole: "◆",
  rank: "▼",
  merit: "✚",
  item: "▣",
  pin: "✦",
  points: "+",
  codename: "«»",
  division: "❖",
  age: "○",
  money: "€",
};

function AgentTab({ state, onOpenDivisions }: { state: GameState; onOpenDivisions?: () => void }) {
  const c = state.character;
  const w = state.world;
  const agency = AGENCIES[c.identity.agency];
  const age = currentAge(state);
  const next = nextRank(c);
  const missing = next ? rankMissing(c, w, age, next) : [];
  const phaseIndex = PHASE_IDS.indexOf(w.phase);
  const currentOrder = RANKS[c.rank].order;
  const meritTarget = next ? RANKS[next].merit : 0;

  return (
    <div className="space-y-7">
      <section className="rounded-sm border p-3" style={{ borderColor: tint(agency.color, 40), background: tint(agency.color, 6) }}>
        <p className="font-serif text-2xl tracking-[0.15em]" style={{ color: agency.color }}>
          {agency.name}
        </p>
        <p className="text-xs text-ivory/80 italic">« {agency.motto} »</p>
        <dl className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
          <div>
            <dt className="inline text-ivory/70">Région. </dt>
            <dd className="inline">{agency.region} · signalé{c.identity.gender === "fille" ? "e" : ""} par : {c.identity.nationality}</dd>
          </div>
          <div>
            <dt className="inline text-ivory/70">Direction. </dt>
            <dd className="inline">
              {agency.director.name}, « {agency.director.codename} »
            </dd>
          </div>
          <div>
            <dt className="inline text-ivory/70">Quartier général. </dt>
            <dd className="inline">{agency.hq}</dd>
          </div>
          <div>
            <dt className="inline text-ivory/70">Académie. </dt>
            <dd className="inline">{agency.academy}</dd>
          </div>
          <div>
            <dt className="inline text-ivory/70">Laboratoire. </dt>
            <dd className="inline">
              {agency.lab.name}, {agency.lab.chief}
            </dd>
          </div>
          <div>
            <dt className="inline text-ivory/70">Noms de code. </dt>
            <dd className="inline">{agency.codenames.theme}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="label mb-3">Grade</h3>
        <div className="flex items-start gap-3">
          <RankBadge rank={c.rank} className="h-10 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xl leading-tight">{RANKS[c.rank].label}</p>
            <p className="mt-1 text-xs text-ivory/85">
              <span className="text-success">Pouvoirs.</span> {RANKS[c.rank].powers}
            </p>
            <p className="mt-0.5 text-xs text-ivory/85">
              <span className="text-fail">Devoirs.</span> {RANKS[c.rank].duties}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="label">Mérite</span>
            <span className="font-mono text-xs text-ivory/80">
              {formatMerit(c.merit)}
              {next && meritTarget > 0 && ` / ${meritTarget}`}
              {c.blames > 0 && <span className="ml-2 text-fail">{c.blames} blâme{c.blames > 1 ? "s" : ""}</span>}
            </span>
          </div>
          {next && meritTarget > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brass transition-all duration-700" style={{ width: `${Math.min(100, (c.merit / meritTarget) * 100)}%` }} />
            </div>
          )}
          {next && (
            <p className="mt-2 text-xs text-muted">
              Prochain grade : <span className="text-ivory">{RANKS[next].label}</span>
              {missing.length === 0 ? (
                <span className="text-success"> — conditions remplies, la promotion dépend de ta hiérarchie.</span>
              ) : (
                <> — il manque : {missing.join(" ; ")}.</>
              )}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Une mission rapporte selon son importance (locale 1, régionale 2, continentale 4, mondiale 8) multipliée par le résultat (partiel ×0,5, réussite ×1, éclatant ×1,5). Un acte remarquable : +0,5 à +4. Un blâme : −3.
          </p>
        </div>
      </section>

      <section>
        <h3 className="label mb-3">Les grades du Concordat</h3>
        <ol className="space-y-1.5">
          {RANK_IDS.map((r) => {
            const def = RANKS[r];
            const reached = def.order <= currentOrder;
            const current = r === c.rank;
            return (
              <li
                key={r}
                className={`flex items-start gap-3 rounded-sm px-2 py-1.5 ${current ? "bg-brass/10 ring-1 ring-brass/40" : ""} ${reached ? "" : "opacity-55"}`}
              >
                <RankBadge rank={r} className="mt-0.5 h-6 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    {def.label}
                    <span className="font-mono text-[10px] text-muted">
                      {def.merit > 0 && `${def.merit} mér.`}
                      {def.minAge > 0 && ` · ${def.minAge} ans`}
                    </span>
                  </p>
                  <p className="text-[11px] text-faint">{def.requirement}</p>
                  {current || !reached ? <p className="text-[11px] text-muted">{def.powers}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <DivisionsSection state={state} onOpen={onOpenDivisions} />

      <section>
        <h3 className="label mb-3">Parcours</h3>
        <ol className="relative space-y-3 border-l border-line pl-4">
          {PHASE_IDS.filter((p) => p !== "dossier").map((p) => {
            const done = PHASE_IDS.indexOf(p) < phaseIndex && !(p === "mission" && w.phase !== "apres");
            const current = p === w.phase;
            return (
              <li key={p} className="relative">
                <span
                  className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rotate-45 ${current ? "bg-brass" : done ? "bg-brass/40" : "border border-line-strong bg-ink"}`}
                />
                <p className={`text-sm ${current ? "text-brass-soft" : done ? "text-ivory/70" : "text-faint"}`}>
                  {p === "base" ? phaseLabel(p, age) : PHASES[p].label}
                  {current && p === "selection" && (
                    <span className="ml-2 font-mono text-[11px]">
                      jour {w.day}/{SELECTION_DAYS}
                    </span>
                  )}
                  {p === "mission" && w.missionsCompleted > 0 && (
                    <span className="ml-2 font-mono text-[11px] text-muted">
                      {w.missionsCompleted} mission{w.missionsCompleted > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">{PHASES[p].description}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs">
          <span className="text-brass-soft">{ageStage(age).label}</span>
          <span className="text-muted"> — {ageStage(age).description}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {c.identity.birthDate && `Né${c.identity.gender === "fille" ? "e" : ""} le ${formatDate(c.identity.birthDate)} · `}
          {age} ans · {formatDate(currentDate(state))}
          {age < BREVET_AGE && ` · Brevet dans ${BREVET_AGE - age} an${BREVET_AGE - age > 1 ? "s" : ""} environ`}
        </p>
      </section>

      <section>
        <h3 className="label mb-3">Finances</h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Solde personnelle" value={formatEuros(c.money)} valueClass="text-success" />
          <Row label="Versement hebdomadaire" value={RANKS[c.rank].allowance ? formatEuros(RANKS[c.rank].allowance) : "—"} />
          <Row label="Fonds d'opération max. par mission" value={RANKS[c.rank].fundsCap ? formatEuros(RANKS[c.rank].fundsCap) : "—"} />
          <Row label="Prime de mission" value={currentOrder >= RANKS.agent.order ? "1 000 € par point de mérite" : "—"} />
        </dl>
      </section>

      <section>
        <h3 className="label mb-3">Distinctions</h3>
        <ul className="space-y-2">
          {PINS.map((p) => {
            const earned = c.distinctions.filter((d) => d.name.toLowerCase().includes(p.name.toLowerCase()));
            return (
              <li key={p.name} className={earned.length ? "" : "opacity-40"}>
                <p className="text-sm">
                  <span className={earned.length ? "text-brass" : "text-faint"}>✦</span> {p.name}
                  {earned.length > 1 && <span className="ml-1 font-mono text-[10px] text-brass">×{earned.length}</span>}
                </p>
                <p className="pl-4 text-xs text-muted">{earned[0]?.reason ?? p.description}</p>
              </li>
            );
          })}
          {c.distinctions
            .filter((d) => !PINS.some((p) => d.name.toLowerCase().includes(p.name.toLowerCase())))
            .map((d, i) => (
              <li key={i}>
                <p className="text-sm">
                  <span className="text-brass">✦</span> {d.name}
                </p>
                <p className="pl-4 text-xs text-muted">{d.reason}</p>
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h3 className="label mb-3">Progression</h3>
        {state.progress.length === 0 ? (
          <p className="text-sm text-faint italic">Ta progression s'écrira ici.</p>
        ) : (
          <ol className="space-y-1.5">
            {[...state.progress].reverse().map((p, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="w-4 shrink-0 text-center text-brass/80">{PROGRESS_ICONS[p.kind] ?? "·"}</span>
                <span className="flex-1 text-ivory/85">{p.text}</span>
                <span className="shrink-0 font-mono text-[10px] text-faint">{p.day > 0 ? `J${p.day}` : "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-mono ${valueClass}`}>{value}</dd>
    </div>
  );
}

function DivisionsSection({ state, onOpen }: { state: GameState; onOpen?: () => void }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const limit = divisionLimit(c.identity.agency, c.rank);
  const [open, setOpen] = useState<string | null>(null);
  const term = agency.divisionTerm;
  const eligibility = (d: DivisionDef): string | null => {
    if (c.divisions.includes(d.id)) return null;
    if (limit === 0) return `Choix au Brevet (${BREVET_AGE} ans).`;
    if (c.divisions.length >= limit) return `Limite atteinte pour ton grade (${limit}).`;
    if (d.requiresDivisions && c.divisions.length < d.requiresDivisions)
      return `Sur invitation, après ${d.requiresDivisions} ${d.requiresDivisions > 1 ? term.plural : term.singular}.`;
    if (c.divisions.length > 0 && !d.skills.some((s) => skillTotal(c, s) >= DIVISION_SKILL_REQUIREMENT))
      return `Il faut ${DIVISION_SKILL_REQUIREMENT} dans une de ses compétences.`;
    return "Accessible : demande-le en jeu.";
  };
  return (
    <section>
      <h3 className="label mb-1">
        {term.plural} · {c.divisions.length}/{limit || "—"}
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-muted">{agency.organization}</p>
      {onOpen && (
        <button
          onClick={onOpen}
          className="mb-3 w-full rounded-sm px-3 py-2.5 text-[11px] font-bold tracking-[0.18em] uppercase"
          style={{ background: agency.color, color: "var(--color-ink)" }}
        >
          ❖ {agency.ceremony.name} — choisir
        </button>
      )}
      <ul className="space-y-2">
        {agency.divisions.map((d) => {
          const mine = c.divisions.includes(d.id);
          const note = eligibility(d);
          const expanded = mine || open === d.id;
          return (
            <li
              key={d.id}
              className={`rounded-sm border p-2.5 ${mine ? "" : "cursor-pointer"}`}
              style={{ borderColor: mine ? agency.color : "var(--color-line)", background: mine ? tint(agency.color, 8) : undefined }}
              onClick={() => !mine && setOpen(open === d.id ? null : d.id)}
            >
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-serif text-base" style={{ color: mine ? agency.color : undefined }}>
                  <span style={{ color: agency.color, opacity: mine ? 1 : 0.6 }}>
                    <DivisionSigil agency={c.identity.agency} division={d.id} className="h-7 w-7" />
                  </span>
                  {d.name}
                </span>
                {mine && <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: agency.color }}>Membre</span>}
              </p>
              <p className="text-xs text-muted">{d.role}</p>
              {expanded && (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {d.skills.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 text-[11px]" style={{ color: ATTRIBUTES[SKILLS[s].attribute].color }}>
                        <SkillGlyph skill={s} className="h-3 w-3" />
                        {SKILLS[s].label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ivory/80">
                    <span style={{ color: agency.color }}>✦ {d.resource.name}.</span> {d.resource.description}
                  </p>
                </>
              )}
              {note && <p className="mt-1 text-[11px] text-faint">{note}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-faint">
        Hors mission, l'expérience gagnée sur les compétences de tes {term.plural} rapporte un point de plus. En mission, chacune offre sa ressource une fois.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Liens                                                               */
/* ------------------------------------------------------------------ */

const KIND_LABELS: Record<RelationKind, { label: string; color: string }> = {
  proche: { label: "Proche", color: "var(--pole-ame)" },
  mentor: { label: "Mentor", color: "var(--color-brass)" },
  equipier: { label: "Équipier", color: "var(--pole-esprit)" },
  allie: { label: "Allié", color: "var(--color-success)" },
  contact: { label: "Contact", color: "var(--color-muted)" },
  rival: { label: "Rival", color: "var(--color-partial)" },
  ennemi: { label: "Ennemi", color: "var(--color-fail)" },
};

const STATUS_LABELS: Record<RelationStatus, string> = {
  actif: "",
  injoignable: "Injoignable",
  disparu: "Disparu",
  mort: "Mort",
  archive: "Perdu de vue",
};

const CONTACT_INTENTS = ["Prendre des nouvelles", "Demander un renseignement", "Demander un service", "Proposer de se voir"];

function Relations({ state, onChange, onAction }: SheetProps) {
  const [showLost, setShowLost] = useState(false);
  if (!state.relations.length) return <p className="text-sm text-faint italic">Personne ne compte encore. Ça viendra.</p>;
  const active = state.relations.filter((r) => r.status !== "archive" && r.status !== "mort");
  const lost = state.relations.filter((r) => r.status === "archive" || r.status === "mort");
  const sorted = [...active].sort((a, b) => b.lastSeenDay - a.lastSeenDay || Math.abs(b.affinity) - Math.abs(a.affinity));
  const setStatus = (name: string, status: RelationStatus) =>
    onChange?.({ ...state, relations: state.relations.map((r) => (r.name === name ? { ...r, status } : r)), updatedAt: Date.now() });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {active.length}/{RELATION_LIMIT} liens suivis. Le narrateur s'en souvient ; tu peux les recontacter à tout moment.
      </p>
      <ul className="space-y-3">
        {sorted.map((r) => (
          <RelationCard key={r.name} r={r} day={state.world.day} onAction={onAction} onArchive={onChange && (() => setStatus(r.name, "archive"))} />
        ))}
      </ul>
      {lost.length > 0 && (
        <div className="border-t border-line pt-3">
          <button onClick={() => setShowLost((s) => !s)} className="label hover:text-ivory">
            {showLost ? "▾" : "▸"} Perdus de vue · {lost.length}
          </button>
          {showLost && (
            <ul className="mt-2 space-y-2">
              {lost.map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-2 text-sm text-muted">
                  <span>
                    {r.status === "mort" && "✝ "}
                    {r.name} <span className="text-xs text-faint">— {r.role}</span>
                  </span>
                  {r.status === "archive" && onChange && active.length < RELATION_LIMIT && (
                    <button onClick={() => setStatus(r.name, "actif")} className="shrink-0 text-[10px] tracking-[0.12em] text-faint uppercase hover:text-ivory">
                      Rétablir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RelationCard({
  r,
  day,
  onAction,
  onArchive,
}: {
  r: Relation;
  day: number;
  onAction?: (a: PlayerAction) => void;
  onArchive?: () => void;
}) {
  const [contact, setContact] = useState(false);
  const [intent, setIntent] = useState("");
  const kind = KIND_LABELS[r.kind] ?? KIND_LABELS.contact;
  const pct = (r.affinity + 100) / 2;
  const color = r.affinity >= 25 ? "var(--color-success)" : r.affinity <= -25 ? "var(--color-fail)" : "var(--color-muted)";
  const reachable = r.status === "actif";
  const since = day - r.lastSeenDay;
  const send = (text: string) => {
    if (!onAction || !text.trim()) return;
    onAction({ type: "contact", name: r.name, intent: text.trim() });
    setContact(false);
    setIntent("");
  };

  return (
    <li className="rounded-sm border border-line bg-night/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-serif text-lg leading-tight">{r.name}</p>
        <span className="font-mono text-xs" style={{ color }}>
          {r.affinity > 0 ? "+" : ""}
          {r.affinity}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="rounded-sm px-1 text-[9px] font-semibold tracking-[0.15em] uppercase" style={{ color: kind.color, background: tint(kind.color, 14) }}>
          {kind.label}
        </span>
        <span className="text-brass/80">{r.role}</span>
        {STATUS_LABELS[r.status] && <span className="text-fail">· {STATUS_LABELS[r.status]}</span>}
      </p>
      <div className="relative mt-2 h-1 rounded-full bg-line">
        <span className="absolute top-[-2px] left-1/2 h-2 w-px bg-line-strong" />
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ left: `${pct}%`, background: color }} />
      </div>
      <dl className="mt-2 space-y-0.5 text-xs leading-relaxed text-muted">
        {r.location && (
          <div>
            <dt className="inline text-ivory/60">Où : </dt>
            <dd className="inline">{r.location}</dd>
          </div>
        )}
        {r.favors !== 0 && (
          <div>
            <dt className="inline text-ivory/60">Faveurs : </dt>
            <dd className="inline" style={{ color: r.favors > 0 ? "var(--color-success)" : "var(--color-fail)" }}>
              {r.favors > 0 ? `te doit ${r.favors} faveur${r.favors > 1 ? "s" : ""}` : `tu lui dois ${-r.favors} faveur${r.favors < -1 ? "s" : ""}`}
            </dd>
          </div>
        )}
        {r.knows && (
          <div>
            <dt className="inline text-ivory/60">Sait : </dt>
            <dd className="inline">{r.knows}</dd>
          </div>
        )}
        {r.notes && <p className="pt-0.5">{r.notes}</p>}
      </dl>
      {r.kind !== "rival" && r.kind !== "ennemi" && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-faint" title="La force du lien s'érode quand tu ne donnes pas de nouvelles">
          lien
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full" style={{ width: `${r.bond ?? 50}%`, background: (r.bond ?? 50) < 25 ? "var(--color-fail)" : "var(--pole-ame)" }} />
          </span>
          {(r.bond ?? 50) < 25 ? <span className="text-fail">se sent négligé</span> : r.bond ?? 50}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-faint">
          {since <= 0 ? "vu aujourd'hui" : `vu il y a ${since} j`}
          {r.cityId ? ` · ${findCity(r.cityId)?.name}` : ""}
        </span>
        <div className="flex gap-3">
          {onArchive && !contact && (
            <button onClick={onArchive} className="text-[10px] tracking-[0.12em] text-faint uppercase hover:text-muted" title="Ne plus suivre ce lien (libère une place)">
              Archiver
            </button>
          )}
          {onAction && reachable && !contact && (
            <button onClick={() => setContact(true)} className="text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline">
              ☎ Contacter
            </button>
          )}
        </div>
      </div>
      {contact && onAction && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_INTENTS.map((i) => (
              <button key={i} onClick={() => send(i)} className="rounded-sm border border-line px-2 py-1 text-[11px] text-muted hover:border-brass hover:text-ivory">
                {i}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(intent);
            }}
            className="flex gap-1.5"
          >
            <input
              autoFocus
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              maxLength={300}
              placeholder="Ou dis pourquoi tu l'appelles…"
              className="field min-w-0 flex-1 py-1 text-xs"
            />
            <button type="submit" disabled={!intent.trim()} className="btn btn-primary px-2 py-1 text-[10px]">
              OK
            </button>
            <button type="button" onClick={() => setContact(false)} className="px-1 text-xs text-faint hover:text-ivory">
              ✕
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Sac                                                                 */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  gadget: "Gadget",
  arme: "Arme",
  equipement: "Équipement",
  document: "Document",
  consommable: "Consommable",
  souvenir: "Souvenir",
};

function Inventory({ state, onChange, onAction }: SheetProps) {
  const c = state.character;
  const inMission = state.world.phase === "mission";
  const carried = c.inventory.map((item, index) => ({ item, index })).filter((x) => x.item.carried);
  const locker = c.inventory.map((item, index) => ({ item, index })).filter((x) => !x.item.carried);
  const full = carried.length >= CARRY_LIMIT;
  const agency = AGENCIES[c.identity.agency];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="label mb-2 flex justify-between">
          <span>Sur toi</span>
          <span className={full ? "text-partial" : ""}>
            {carried.length}/{CARRY_LIMIT}
          </span>
        </h3>
        {carried.length === 0 ? (
          <p className="text-sm text-faint italic">Les poches vides.</p>
        ) : (
          <ul className="space-y-2">
            {carried.map(({ item, index }) => (
              <ItemCard
                key={index}
                item={item}
                labName={agency.lab.name}
                onUse={onAction && item.charges !== 0 ? (how) => onAction({ type: "use", item: item.name, how }) : undefined}
                onToggle={onChange && !inMission ? () => onChange(toggleCarried(state, index)) : undefined}
                toggleLabel="Ranger"
              />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="label mb-2">Au casier</h3>
        {locker.length === 0 ? (
          <p className="text-sm text-faint italic">Rien au casier.</p>
        ) : (
          <ul className="space-y-2">
            {locker.map(({ item, index }) => (
              <ItemCard
                key={index}
                item={item}
                labName={agency.lab.name}
                onToggle={onChange && !inMission && !full ? () => onChange(toggleCarried(state, index)) : undefined}
                toggleLabel="Prendre"
              />
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] leading-relaxed text-faint">
        Seuls les objets sur toi servent aux jets et peuvent être utilisés. On change ce qu'on emporte à la base, pas en mission. Le matériel de {agency.lab.name} est
        rendu en fin de mission ; le perdre coûte du mérite.
      </p>
    </div>
  );
}

function ItemCard({
  item,
  labName,
  onUse,
  onToggle,
  toggleLabel,
}: {
  item: Item;
  labName: string;
  onUse?: (how: string) => void;
  onToggle?: () => void;
  toggleLabel: string;
}) {
  const [using, setUsing] = useState(false);
  const [how, setHow] = useState("");
  return (
    <li className={`border-l pl-3 ${item.charges === 0 ? "border-line opacity-50" : "border-brass/40"}`}>
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        {item.name}
        <span className="text-[9px] tracking-widest text-faint uppercase">{CATEGORY_LABELS[item.category] ?? item.category}</span>
        {item.lab && (
          <span className="rounded-sm px-1 text-[9px] tracking-widest uppercase" style={{ color: "var(--pole-esprit)", background: tint("var(--pole-esprit)", 14) }} title={`Prêté par ${labName}`}>
            Labo
          </span>
        )}
        {item.charges !== undefined && (
          <span className="font-mono text-[10px] text-muted">{item.charges === 0 ? "épuisé" : `${item.charges} util.`}</span>
        )}
      </p>
      {item.bonus && (
        <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: ATTRIBUTES[SKILLS[item.bonus.skill].attribute].color }}>
          <SkillGlyph skill={item.bonus.skill} className="h-3 w-3" />
          {SKILLS[item.bonus.skill].label} +{item.bonus.value}
          <span className="text-muted">— {item.bonus.condition}</span>
        </p>
      )}
      <p className="text-xs text-muted">{item.description}</p>
      {(onUse || onToggle) && !using && (
        <div className="mt-1 flex gap-3">
          {onUse && (
            <button onClick={() => setUsing(true)} className="text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline">
              ▣ Utiliser
            </button>
          )}
          {onToggle && (
            <button onClick={onToggle} className="text-[10px] tracking-[0.12em] text-faint uppercase hover:text-muted">
              {toggleLabel}
            </button>
          )}
        </div>
      )}
      {using && onUse && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUse(how.trim());
            setUsing(false);
            setHow("");
          }}
          className="mt-1.5 flex gap-1.5"
        >
          <input
            autoFocus
            value={how}
            onChange={(e) => setHow(e.target.value)}
            maxLength={300}
            placeholder="Comment, sur quoi, sur qui ? (facultatif)"
            className="field min-w-0 flex-1 py-1 text-xs"
          />
          <button type="submit" className="btn btn-primary px-2 py-1 text-[10px]">
            OK
          </button>
          <button type="button" onClick={() => setUsing(false)} className="px-1 text-xs text-faint hover:text-ivory">
            ✕
          </button>
        </form>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Carnet et dossier                                                   */
/* ------------------------------------------------------------------ */

function Carnet({ state }: { state: GameState }) {
  return (
    <div className="space-y-6">
      {state.intrigue && (
        <div className="rounded-sm border border-line-strong bg-night/60 p-3">
          <p className="label mb-1">Intrigue en cours</p>
          <p className="font-serif text-lg leading-tight">{state.intrigue.title}</p>
          <p className="mt-1 text-sm text-muted italic">{state.intrigue.question}</p>
          <div className="mt-2 h-1 rounded-full bg-line">
            <div className="h-full rounded-full bg-brass transition-all" style={{ width: `${Math.min(100, (state.intrigue.turns / state.intrigue.planned) * 100)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-faint">
            Tour {state.intrigue.turns} sur {state.intrigue.planned} environ
          </p>
        </div>
      )}
      <div>
        <h3 className="label mb-2">Faits établis</h3>
        {state.journal.length === 0 ? (
          <p className="text-sm text-faint italic">Rien de noté pour l'instant.</p>
        ) : (
          <ol className="space-y-3">
            {state.journal.map((note, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-0.5 font-mono text-[10px] text-brass/70">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ivory/90">{note}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {state.chronicle && (
        <div className="border-t border-line pt-4">
          <h3 className="label mb-2">Chapitre en cours — {state.chronicleChapter || state.world.chapter}</h3>
          <p className="text-xs leading-relaxed whitespace-pre-line text-muted">{state.chronicle}</p>
        </div>
      )}

      {state.archives.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="label mb-2">Chapitres passés</h3>
          <ol className="space-y-3">
            {[...state.archives].reverse().map((a, i) => (
              <li key={i}>
                <p className="font-serif text-base text-brass-soft">{a.title}</p>
                <p className="text-xs leading-relaxed text-muted">{a.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {state.saga && (
        <div className="border-t border-line pt-4">
          <h3 className="label mb-2">La saga</h3>
          <p className="text-xs leading-relaxed whitespace-pre-line text-muted">{state.saga}</p>
        </div>
      )}

      {state.journalResolved.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="label mb-2">Résolus</h3>
          <ul className="space-y-1.5">
            {[...state.journalResolved].reverse().map((note, i) => (
              <li key={i} className="text-xs text-faint line-through decoration-1">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DossierTab({ state }: { state: GameState }) {
  if (!state.dossier) return <p className="text-sm text-faint italic">Dossier en cours de rédaction.</p>;
  return (
    <article className="paper rounded-sm p-5 font-typewriter text-[13px] leading-relaxed">
      <div className="prose-narrative">
        <RichText text={state.dossier.text} variant="dossier" />
      </div>
    </article>
  );
}
