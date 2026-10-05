"use client";

import { useEffect, useState } from "react";
import { tint } from "@/lib/ui/color";
import {
  ATTRIBUTE_IDS,
  ATTRIBUTES,
  BREVET_AGE,
  MISSION_IMPORTANCE,
  POLE_POINT_COST,
  RANKS,
  SKILLS,
  ageStage,
  findOrigin,
  skillsOf,
  xpToNext,
} from "@/lib/game/rules";
import { AGENCIES, SEAT_XP_BONUS, findSeat } from "@/lib/game/agencies";
import { injuryMalus, legendCap } from "@/lib/game/field";
import {
  CARRY_LIMIT,
  canSpendOnPole,
  canSpendOnSkill,
  capFor,
  currentAge,
  skillTotal,
  spendPolePoint,
  spendSkillPoint,
  traitSkillMod,
} from "@/lib/game/engine";
import type { AttributeId, Character, GameState, PlayerAction, ProgressKind, RelationKind, SkillId } from "@/lib/game/types";
import { PoleEmblem, SkillChips, SkillGlyph } from "./glyphs";
import { Silhouette } from "./Mallette";
import { BranchTiles, LanguageChips, MeritGauge, NextSteps, Passports, PoleRadar, RankLadder, TraitBadges, WatchList } from "./SheetVisuals";
import { SeatSigil } from "./sigils";
import { RankBadge } from "./ui";
import { findCity, findCountry } from "@/lib/world/geo";

type Tab = "fiche" | "agent" | "legendes";

/** Les intercalaires du dossier : une icône, un nom, ce qu'on y trouve. */
const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: "fiche", label: "Aptitudes", icon: "◆", hint: "Pôles, compétences, traits, langues" },
  { id: "agent", label: "Carrière", icon: "▲", hint: "Grade, mérite, affectation, Branches" },
  { id: "legendes", label: "Couvertures", icon: "▤", hint: "Légendes, couverture civile, fiché par pays" },
];

interface SheetProps {
  state: GameState;
  /** Absent : fiche en lecture seule (par exemple pendant qu'un tour s'écrit). */
  onChange?: (next: GameState) => void;
  /** Lance un tour de jeu (contacter, utiliser un objet, soutien de siège ou de Branche). */
  onAction?: (action: PlayerAction) => void;
  /** Ouvre la cérémonie de promotion (présent seulement quand une promotion est possible). */
  onOpenPromotion?: () => void;
  /** Ouvre la mallette (l'inventaire en grand). */
  onOpenMallette?: () => void;
  /** Ouvre les archives, éventuellement sur une chemise. */
  onOpenArchives?: (folder?: string) => void;
  /** Le terminal demande un onglet précis : `n` change à chaque demande. */
  focusTab?: { id: SheetTab; n: number } | null;
}

export type SheetTab = Tab;

/**
 * La fiche, comme un dossier d'agent : la carte d'identité en tête, toujours visible,
 * et des intercalaires sur la tranche pour passer d'une section à l'autre.
 */
export function CharacterSheet({ state, onChange, onAction, onOpenPromotion, onOpenMallette, onOpenArchives, focusTab }: SheetProps) {
  const [tab, setTab] = useState<Tab>("fiche");
  useEffect(() => {
    if (focusTab) setTab(focusTab.id);
  }, [focusTab]);
  const agency = AGENCIES[state.character.identity.agency];
  const badge: Partial<Record<Tab, React.ReactNode>> = {
    fiche: state.character.skillPoints > 0 ? state.character.skillPoints : null,
    agent: onOpenPromotion ? "!" : null,
  };
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <IdCard state={state} onOpenPromotion={onOpenPromotion} onOpenMallette={onOpenMallette} />
        <div className="flex shrink-0 items-baseline justify-between border-y border-line bg-night/40 px-4 py-1.5">
          <span className="shrink-0 font-typewriter text-[11px] tracking-[0.25em] whitespace-nowrap uppercase" style={{ color: agency.color }}>
            {current.icon} {current.label}
          </span>
          <span className="truncate pl-2 text-[10px] text-faint">{current.hint}</span>
        </div>
        <div key={tab} className="scrollbar-thin animate-rise min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "fiche" && <Fiche state={state} onChange={onChange} />}
          {tab === "agent" && <AgentTab state={state} onOpenPromotion={onOpenPromotion} onOpenArchives={onOpenArchives} />}
          {tab === "legendes" && <CoversTab state={state} />}
        </div>
      </div>
      {/* Les intercalaires, sur la tranche du dossier. */}
      <nav aria-label="Sections de la fiche" className="flex w-9 shrink-0 flex-col gap-1 border-l border-line bg-night/60 pt-3">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={`${t.label} — ${t.hint}`}
              aria-current={on ? "page" : undefined}
              className={`relative -ml-px flex flex-col items-center gap-1.5 rounded-r-md border border-l-0 py-2.5 transition-colors ${
                on ? "border-line-strong bg-panel text-ivory" : "border-transparent text-muted hover:bg-panel/60 hover:text-ivory"
              }`}
              style={on ? { boxShadow: `inset 3px 0 0 ${agency.color}` } : undefined}
            >
              <span className="text-xs" style={on ? { color: agency.color } : undefined}>
                {t.icon}
              </span>
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl]">{t.label}</span>
              {badge[t.id] ? <span className="rounded-full bg-brass px-1 text-[9px] leading-tight font-bold text-ink">{badge[t.id]}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** La carte d'identité de l'agent : qui, quel grade, où, et dans quel état. */
function IdCard({ state, onOpenPromotion, onOpenMallette }: { state: GameState; onOpenPromotion?: () => void; onOpenMallette?: () => void }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const seat = findSeat(c.identity.agency, c.seat);
  const station = findCity(c.station);
  const age = currentAge(state);
  const initials = `${c.identity.firstName[0] ?? ""}${c.identity.lastName[0] ?? ""}`.toUpperCase();
  const vitals = [
    { label: "Santé", value: c.health, max: c.healthMax, color: c.health <= 3 ? "var(--color-stamp)" : "var(--pole-corps)" },
    { label: "Moral", value: c.morale, max: c.moraleMax, color: "var(--pole-ame)" },
    ...(state.world.phase !== "dossier"
      ? [
          { label: "Fatigue", value: c.fatigue ?? 0, max: 100, color: (c.fatigue ?? 0) >= 60 ? "var(--color-fail)" : "var(--color-partial)" },
          { label: "Couv.", title: "Couverture civile", value: c.cover ?? 0, max: 100, color: (c.cover ?? 0) < 30 ? "var(--color-fail)" : "var(--color-success)" },
        ]
      : []),
  ];
  return (
    <header className="relative shrink-0 overflow-hidden px-4 pt-4 pb-3" style={{ background: `linear-gradient(160deg, ${tint(agency.color, 10)}, transparent 70%)` }}>
      {/* Le filigrane de l'agence. */}
      <span aria-hidden className="pointer-events-none absolute -top-3 -right-2 font-serif text-[64px] leading-none tracking-[0.1em] opacity-[0.05]" style={{ color: agency.color }}>
        {agency.name}
      </span>
      <div className="relative flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="grid h-[68px] w-14 place-items-center rounded-sm border font-serif text-2xl" style={{ borderColor: tint(agency.color, 50), background: tint(agency.color, 14), color: agency.color }}>
            {initials}
          </div>
          <RankBadge rank={c.rank} className="absolute -right-2 -bottom-2 h-6 w-5 drop-shadow" />
        </div>
        <div className="min-w-0 flex-1">
          {c.codename && <p className="font-mono text-[10px] tracking-[0.3em] text-brass uppercase">« {c.codename} »</p>}
          <h2 className="truncate font-serif text-xl leading-tight">
            {c.identity.firstName} {c.identity.lastName}
          </h2>
          <p className="truncate text-[11px] text-muted">
            <span className="font-semibold tracking-[0.15em]" style={{ color: agency.color }}>
              {agency.name}
            </span>{" "}
            · {RANKS[c.rank].label} · {age} ans
            {c.rank === "aspirant" || c.rank === "prospect" ? ` · brassard ${c.armband}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap gap-1">
            {seat && (
              <span className="rounded-sm px-1.5 py-px text-[10px]" style={{ background: tint(agency.color, 15), color: agency.color }}>
                {seat.name}
              </span>
            )}
            {station && (
              <span className="rounded-sm px-1.5 py-px text-[10px]" style={{ background: tint(agency.color, 15), color: agency.color }}>
                Station de {station.name}
              </span>
            )}
            {c.matricule && <span className="rounded-sm bg-line/60 px-1.5 py-px font-mono text-[10px] text-muted">{c.matricule}</span>}
          </p>
        </div>
      </div>
      <div className="relative mt-3 grid grid-cols-4 gap-2">
        {vitals.map((v) => (
          <div key={v.label} title={`${"title" in v ? v.title : v.label} ${v.value}/${v.max}`} className="min-w-0">
            <p className="flex items-baseline justify-between gap-1 text-[9px] tracking-[0.1em] text-muted uppercase">
              {v.label}
              <span className="font-mono text-[10px] text-ivory/80">{v.value}</span>
            </p>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (v.value / v.max) * 100)}%`, background: v.color }} />
            </div>
          </div>
        ))}
      </div>
      {onOpenMallette && (
        <button onClick={onOpenMallette} className="group relative mt-3 flex w-full items-center gap-2 rounded-sm border border-[#3a2c1d] px-2 py-1 text-left" style={{ background: "linear-gradient(180deg, #3b2a1a, #24190f)" }} title="Ouvrir la mallette (M)">
          <span className="font-typewriter text-[9px] tracking-[0.2em] text-[#e2c88f] uppercase">Mallette</span>
          <span className="flex flex-1 gap-0.5">
            {Array.from({ length: CARRY_LIMIT }, (_, i) => {
              const it = c.inventory.filter((x) => x.carried)[i];
              return (
                <span key={i} className="grid h-5 flex-1 place-items-center rounded-[2px] bg-[#141110] text-[#c9b48c]" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.9)" }}>
                  {it ? <Silhouette category={it.category} className="h-3.5 w-3.5" /> : null}
                </span>
              );
            })}
          </span>
          <span className="text-[10px] text-[#e2c88f]/70 group-hover:text-[#e2c88f]">▸</span>
        </button>
      )}
      {c.prison && (
        <p className="relative mt-3 rounded-sm border border-fail/50 bg-fail/[0.08] px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-fail">Détenu</span> — {c.prison.captor}, à {findCity(c.prison.cityId)?.name ?? "?"}. Évasion {c.prison.escape}/100 · secrets livrés {c.prison.leaked}/100.
        </p>
      )}
      {onOpenPromotion && (
        <button onClick={onOpenPromotion} className="relative mt-3 w-full rounded-sm py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase" style={{ background: agency.color, color: "var(--color-ink)" }}>
          ❖ Promotion possible
        </button>
      )}
      {state.mission && (
        <div className="relative mt-3">
          <MissionPanel state={state} />
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */

function Fiche({ state, onChange }: SheetProps) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const origin = findOrigin(c.originId);
  const seat = findSeat(c.identity.agency, c.seat);
  const seatSkills = new Set<SkillId>(seat?.specialty ?? []);

  return (
    <div className="space-y-6">
      <PoleRadar state={state} />
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
            seatSkills={seatSkills}
            agencyColor={agency.color}
            onSpendSkill={onChange && ((sk) => onChange(spendSkillPoint(state, sk)))}
            onSpendPole={onChange && (() => onChange(spendPolePoint(state, a)))}
          />
        ))}
      </section>

      <section>
        <h3 className="label mb-2">Traits</h3>
        <TraitBadges state={state} />
        <p className="mt-2 text-[11px] text-faint">
          {c.identity.nationality} · {origin?.label} · {c.identity.birthplace}
        </p>
      </section>
      <section>
        <h3 className="label mb-2" title="Parler la langue du pays : +1 au contact des gens en mission ; sinon −1.">
          Langues
        </h3>
        <LanguageChips state={state} />
      </section>
    </div>
  );
}

function MissionPanel({ state }: { state: GameState }) {
  const m = state.mission!;
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const legend = c.legends.find((l) => l.id === m.legend);
  const team = m.team.map((id) => state.roster.find((o) => o.id === id)).filter((o) => o !== undefined);
  return (
    <section className="rounded-sm border p-3" style={{ borderColor: tint(agency.color, 45), background: tint(agency.color, 7) }}>
      <p className="label" style={{ color: agency.color }}>
        Mission en cours · {MISSION_IMPORTANCE[m.importance].label}
      </p>
      <p className="mt-0.5 font-serif text-lg leading-tight">{m.name}</p>
      <p className="mt-1 text-xs text-ivory/85">{m.objective}</p>
      <p className="mt-1.5 text-[11px] text-muted">
        {findCity(m.cityId)?.name} · {team.length ? `avec ${team.map((o) => o.codename || o.name.split(" ")[0]).join(", ")}` : "seul"} · depuis le jour {m.startDay}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">
        Couverture : {legend ? `${legend.name} (crédibilité ${legend.credibility})` : m.cover}
        {m.blown && <span className="text-fail"> · grillée</span>}
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
      {state.world.phase === "mission" && <p className="mt-2 text-[11px] text-faint">Approches, soutiens et improvisation : dans la console de mission, sous le récit.</p>}
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
  seatSkills,
  agencyColor,
  onSpendSkill,
  onSpendPole,
}: {
  pole: AttributeId;
  c: Character;
  seatSkills: Set<SkillId>;
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
          const inSeat = seatSkills.has(s);
          const hurt = injuryMalus(c, s);
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
                  {inSeat && (
                    <span className="text-[10px]" style={{ color: agencyColor }} title={`Spécialité de ton siège : +${SEAT_XP_BONUS} d'expérience hors mission`}>
                      ✦
                    </span>
                  )}
                  {hurt < 0 && (
                    <span className="font-mono text-[10px] text-fail" title="Malus de blessure en mission">
                      {hurt}
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
/* Agent : agence, grade, organisation, carrière                        */
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
  seat: "❖",
  age: "○",
  money: "€",
};

function AgentTab({ state, onOpenPromotion, onOpenArchives }: { state: GameState; onOpenPromotion?: () => void; onOpenArchives?: (folder?: string) => void }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const seat = findSeat(c.identity.agency, c.seat);
  const station = findCity(c.station);
  const [showAll, setShowAll] = useState(false);
  const age = currentAge(state);

  return (
    <div className="space-y-6">
      <RankLadder state={state} />
      <div className="rounded-sm border border-line p-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-serif text-lg">{RANKS[c.rank].label}</span>
          <span className="text-[10px] text-faint">
            {ageStage(age).label}
            {age < BREVET_AGE ? ` · Brevet dans ${BREVET_AGE - age} an${BREVET_AGE - age > 1 ? "s" : ""}` : ""}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-ivory/80">
          <span className="text-success">▲</span> {RANKS[c.rank].powers}
        </p>
        <p className="mt-0.5 text-[11px] text-ivory/80">
          <span className="text-fail">▼</span> {RANKS[c.rank].duties}
        </p>
        <div className="mt-3">
          <MeritGauge state={state} />
        </div>
      </div>
      <NextSteps state={state} />
      {onOpenPromotion && (
        <button onClick={onOpenPromotion} className="w-full rounded-sm px-3 py-2.5 text-[11px] font-bold tracking-[0.18em] uppercase" style={{ background: agency.color, color: "var(--color-ink)" }}>
          ❖ Demander ma promotion
        </button>
      )}

      <section>
        <h3 className="label mb-2">Affectation</h3>
        {seat ? (
          <div className="flex gap-3 rounded-sm border p-2.5" style={{ borderColor: agency.color, background: tint(agency.color, 8) }} title={seat.heritage}>
            <span style={{ color: agency.color }}>
              <SeatSigil agency={agency.id} seat={seat.id} number={seat.number} className="h-12 w-12" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-base" style={{ color: agency.color }}>
                {seat.name}
              </p>
              <p className="text-[11px] text-ivory/85" title={seat.signature.description}>
                ✦ {seat.signature.name}
              </p>
              <p className="mt-1">
                <SkillChips skills={seat.specialty.map((sk) => [sk, c.skills[sk]?.rank ?? 0] as [SkillId, number])} showLevel={false} />
              </p>
            </div>
          </div>
        ) : station ? (
          <p className="flex items-center gap-2 rounded-sm border border-line p-2.5 text-xs">
            <span className="grid h-8 w-8 place-items-center rounded-sm text-sm" style={{ background: tint(agency.color, 18), color: agency.color }}>
              ▣
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-ivory">Station de {station.name}</span>
              <span className="text-[10px] text-muted">{findCountry(station.country)?.name} · +1 sur les missions de ta région</span>
            </span>
          </p>
        ) : (
          <p className="text-xs text-faint">Ton affectation se décide au Brevet.</p>
        )}
      </section>

      <section>
        <h3 className="label mb-2" title="On ne rejoint pas une Branche : on s'entend (ou non) avec son chef. Chaque soutien en mission entame son estime.">
          Les Branches · estime
        </h3>
        <BranchTiles state={state} />
      </section>

      <section>
        <h3 className="label mb-2">Distinctions</h3>
        {c.distinctions.length === 0 ? (
          <p className="text-xs text-faint">Aucune pour l'instant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {c.distinctions.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 px-2 py-0.5 text-[11px] text-brass-soft" title={d.reason}>
                ✦ {d.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="label mb-2">Derniers faits d'armes</h3>
        {state.progress.length === 0 ? (
          <p className="text-xs text-faint">Ta progression s'écrira ici.</p>
        ) : (
          <ol className="relative space-y-1.5 border-l border-line pl-3">
            {[...state.progress].reverse().slice(0, showAll ? undefined : 5).map((p, i) => (
              <li key={i} className="relative text-[11px] leading-snug">
                <span className="absolute top-1 -left-[17px] grid h-2.5 w-2.5 place-items-center rounded-full bg-ink text-[8px] text-brass">{PROGRESS_ICONS[p.kind] ?? "·"}</span>
                <span className="text-ivory/85">{p.text}</span>
                <span className="ml-1.5 font-mono text-[9px] text-faint">{p.day > 0 ? `J${p.day}` : ""}</span>
              </li>
            ))}
          </ol>
        )}
        {state.progress.length > 5 && (
          <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[10px] tracking-[0.15em] text-muted uppercase hover:text-ivory">
            {showAll ? "Réduire" : `Tout voir (${state.progress.length})`}
          </button>
        )}
      </section>

      {onOpenArchives && (
        <section className="flex flex-wrap gap-1.5 border-t border-line pt-4">
          {(
            [
              ["ag:grades", "Les grades"],
              ["ag:distinctions", "Les distinctions"],
              ["ag:charte", `Charte ${agency.name}`],
              ["moi:dossier", "Ton dossier"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => onOpenArchives(id)} className="rounded-sm border border-line px-2 py-1 text-[11px] text-muted hover:border-brass hover:text-ivory">
              ▤ {label}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

/** Couvertures : ta vie officielle, tes fausses identités, et ce que les services étrangers savent. */
function CoversTab({ state }: { state: GameState }) {
  const c = state.character;
  const cover = c.cover ?? 0;
  return (
    <div className="space-y-6">
      <section title="Ta vie officielle : études, famille, voisins. Trop basse, on finit par poser des questions.">
        <p className="flex items-baseline justify-between text-[9px] tracking-[0.14em] text-muted uppercase">
          Couverture civile
          <span className="font-mono text-xs tracking-normal text-ivory/85">{cover}/100</span>
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cover}%`, background: cover < 30 ? "var(--color-fail)" : "var(--color-success)" }} />
        </div>
      </section>
      {RANKS[c.rank].order >= RANKS.aspirant.order && (
        <section>
          <h3 className="label mb-2">
            Légendes · {c.legends.length}/{legendCap(c)}
          </h3>
          <Passports state={state} />
        </section>
      )}
      <section>
        <h3 className="label mb-2" title="La notoriété monte avec le bruit de tes missions et retombe avec le temps. Fiché, tu seras attendu à l'arrivée.">
          Fiché par pays
        </h3>
        <WatchList state={state} />
      </section>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Liens                                                               */
/* ------------------------------------------------------------------ */

export const KIND_LABELS: Record<RelationKind, { label: string; color: string }> = {
  proche: { label: "Proche", color: "var(--pole-ame)" },
  mentor: { label: "Mentor", color: "var(--color-brass)" },
  equipier: { label: "Équipier", color: "var(--pole-esprit)" },
  allie: { label: "Allié", color: "var(--color-success)" },
  contact: { label: "Contact", color: "var(--color-muted)" },
  ami: { label: "Ami·e", color: "#4fa3a5" },
  amour: { label: "Amour", color: "#e0607e" },
  ex: { label: "Ex", color: "#8a7f8f" },
  rival: { label: "Rival", color: "var(--color-partial)" },
  ennemi: { label: "Ennemi", color: "var(--color-fail)" },
};

export const CONTACT_INTENTS = ["Prendre des nouvelles", "Demander un renseignement", "Demander un service", "Proposer de se voir"];

/* ------------------------------------------------------------------ */
/* Carnet et dossier                                                   */
/* ------------------------------------------------------------------ */

export function Carnet({ state }: { state: GameState }) {
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
