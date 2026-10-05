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
  findFlaw,
  findOrigin,
  findQuality,
  formatEuros,
  formatMerit,
  skillsOf,
  xpToNext,
} from "@/lib/game/rules";
import { AGENCIES, SEAT_XP_BONUS, findSeat } from "@/lib/game/agencies";
import { weeklyUpkeep } from "@/lib/game/economy";
import { branchFavor } from "@/lib/game/command";
import { heatLabel, injuryMalus, legendCap } from "@/lib/game/field";
import {
  BRANCH_FAVOR_MIN,
  CARRY_LIMIT,
  RELATION_LIMIT,
  canSpendOnPole,
  canSpendOnSkill,
  capFor,
  currentAge,
  nextRanks,
  rankMissing,
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
import { DOC_LABELS, StoryDocView } from "./StoryCards";
import { AskPerson } from "./IntelUI";
import { Silhouette } from "./Mallette";
import { Possessions } from "./WeekPlanner";
import { BranchSigil, SeatSigil } from "./sigils";
import { Bar, RankBadge } from "./ui";
import { findCity, findCountry } from "@/lib/world/geo";

type Tab = "fiche" | "agent" | "relations" | "affaires" | "carnet";

/** Les intercalaires du dossier : une icône, un nom, ce qu'on y trouve. */
const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: "fiche", label: "Aptitudes", icon: "◆", hint: "Compétences, traits, blessures, langues" },
  { id: "agent", label: "Carrière", icon: "▲", hint: "Grade, mérite, affectation, Branches, légendes" },
  { id: "relations", label: "Liens", icon: "☎", hint: "Les gens qui comptent, et ce qu'ils peuvent te dire" },
  { id: "affaires", label: "Affaires", icon: "▣", hint: "Mallette, argent, patrimoine" },
  { id: "carnet", label: "Carnet", icon: "✎", hint: "Faits établis, chapitres, dernières pièces" },
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
  const activeRelations = state.relations.filter((r) => r.status !== "archive" && r.status !== "mort").length;
  // Pièces reçues depuis la dernière visite du carnet.
  const [seenPieces, setSeenPieces] = useState(state.pieces?.length ?? 0);
  const newPieces = tab === "carnet" ? 0 : Math.max(0, (state.pieces?.length ?? 0) - seenPieces);
  useEffect(() => {
    if (tab === "carnet") setSeenPieces(state.pieces?.length ?? 0);
  }, [tab, state.pieces?.length]);
  const badge: Partial<Record<Tab, React.ReactNode>> = {
    fiche: state.character.skillPoints > 0 ? state.character.skillPoints : null,
    agent: onOpenPromotion ? "!" : null,
    relations: activeRelations > 0 ? <span className="opacity-60">{activeRelations}</span> : null,
    carnet: newPieces > 0 ? newPieces : null,
  };
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <IdCard state={state} onOpenPromotion={onOpenPromotion} />
        <div className="flex shrink-0 items-baseline justify-between border-y border-line bg-night/40 px-4 py-1.5">
          <span className="shrink-0 font-typewriter text-[11px] tracking-[0.25em] whitespace-nowrap uppercase" style={{ color: agency.color }}>
            {current.icon} {current.label}
          </span>
          <span className="truncate pl-2 text-[10px] text-faint">{current.hint}</span>
        </div>
        <div key={tab} className="scrollbar-thin animate-rise min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "fiche" && <Fiche state={state} onChange={onChange} />}
          {tab === "agent" && <AgentTab state={state} onOpenPromotion={onOpenPromotion} onOpenArchives={onOpenArchives} />}
          {tab === "relations" && <Relations state={state} onChange={onChange} onAction={onAction} />}
          {tab === "affaires" && (
            <div className="space-y-6">
              {onOpenMallette ? <MalletteTeaser state={state} onOpen={onOpenMallette} /> : <Inventory state={state} onChange={onChange} onAction={onAction} />}
              <Finances state={state} />
              {RANKS[state.character.rank].order >= RANKS.aspirant.order && !state.character.prison && <Possessions state={state} onChange={onChange} compact />}
            </div>
          )}
          {tab === "carnet" && <CarnetTab state={state} onOpenArchives={onOpenArchives} />}
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
function IdCard({ state, onOpenPromotion }: { state: GameState; onOpenPromotion?: () => void }) {
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

      <InjuriesSection state={state} />
      <LanguagesSection state={state} />

      <section>
        <h3 className="label mb-2">Traits</h3>
        <p className="mb-2 text-xs text-muted">
          {c.identity.nationality} · {origin?.label} · {c.identity.birthplace}
        </p>
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
  const nexts = nextRanks(state).filter((r) => r !== "aspirant");
  const meritTarget = nexts.length ? Math.min(...nexts.map((r) => RANKS[r].merit).filter((m) => m > 0), Infinity) : 0;
  const hasTarget = Number.isFinite(meritTarget) && meritTarget > 0;
  const [showAll, setShowAll] = useState(false);
  const age = currentAge(state);

  return (
    <div className="space-y-7">
      <section>
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
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="label" title="Une mission rapporte selon son importance × son résultat. Un blâme : −3.">
                Mérite
              </span>
              <span className="font-mono text-xs text-ivory/80">
                {formatMerit(c.merit)}
                {hasTarget && ` / ${meritTarget}`}
                {c.blames > 0 && <span className="ml-2 text-fail">{c.blames} blâme{c.blames > 1 ? "s" : ""}</span>}
              </span>
            </div>
            {hasTarget && (
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brass transition-all duration-700" style={{ width: `${Math.min(100, (c.merit / meritTarget) * 100)}%` }} />
              </div>
            )}
          </div>
          <Bar label="Réputation" value={c.reputation} max={100} color="var(--color-brass)" display={`${c.reputation}`} />
          {nexts.map((r) => {
            const missing = rankMissing(state, r);
            return (
              <p key={r} className="text-xs text-muted">
                {RANKS[r].track === "terrain" ? "Terrain" : RANKS[r].track === "commandement" ? "Commandement" : "Prochain grade"} : <span className="text-ivory">{RANKS[r].label}</span>
                {missing.length === 0 ? <span className="text-success"> — conditions remplies.</span> : <> — il manque : {missing.join(" ; ")}.</>}
              </p>
            );
          })}
          {onOpenPromotion && (
            <button onClick={onOpenPromotion} className="w-full rounded-sm px-3 py-2.5 text-[11px] font-bold tracking-[0.18em] uppercase" style={{ background: agency.color, color: "var(--color-ink)" }}>
              ❖ Demander ma promotion
            </button>
          )}
          <p className="text-[11px] text-faint">
            {ageStage(age).label} — {ageStage(age).description}
            {age < BREVET_AGE && ` Brevet dans ${BREVET_AGE - age} an${BREVET_AGE - age > 1 ? "s" : ""} environ.`}
          </p>
        </div>
      </section>

      <OrganisationSection state={state} />
      <LegendsSection state={state} />
      <HeatSection state={state} />

      <section>
        <h3 className="label mb-3">Distinctions</h3>
        {c.distinctions.length === 0 ? (
          <p className="text-xs text-faint italic">Aucune pour l'instant.</p>
        ) : (
          <ul className="space-y-2">
            {c.distinctions.map((d, i) => (
              <li key={i}>
                <p className="text-sm">
                  <span className="text-brass">✦</span> {d.name}
                </p>
                <p className="pl-4 text-xs text-muted">{d.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="label mb-3">Progression</h3>
        {state.progress.length === 0 ? (
          <p className="text-sm text-faint italic">Ta progression s'écrira ici.</p>
        ) : (
          <ol className="space-y-1.5">
            {[...state.progress].reverse().slice(0, showAll ? undefined : 8).map((p, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="w-4 shrink-0 text-center text-brass/80">{PROGRESS_ICONS[p.kind] ?? "·"}</span>
                <span className="flex-1 text-ivory/85">{p.text}</span>
                <span className="shrink-0 font-mono text-[10px] text-faint">{p.day > 0 ? `J${p.day}` : "—"}</span>
              </li>
            ))}
          </ol>
        )}
        {state.progress.length > 8 && (
          <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[10px] tracking-[0.15em] text-muted uppercase hover:text-ivory">
            {showAll ? "Réduire" : `Tout voir (${state.progress.length})`}
          </button>
        )}
      </section>

      {onOpenArchives && (
        <section className="border-t border-line pt-4">
          <p className="label mb-2">Aux archives</p>
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </section>
      )}
    </div>
  );
}

/** Ce que coûte et rapporte la vie d'agent. */
function Finances({ state }: { state: GameState }) {
  const c = state.character;
  const currentOrder = RANKS[c.rank].order;
  return (
      <section>
        <h3 className="label mb-3">Finances</h3>
        <dl className="space-y-1.5 text-xs">
          <Row label="Sur ton compte" value={formatEuros(c.money)} valueClass="text-success" />
          <Row label="Solde versée / semaine" value={RANKS[c.rank].allowance ? formatEuros(RANKS[c.rank].allowance) : "—"} />
          <Row label="Fonds d'opération max." value={RANKS[c.rank].fundsCap ? formatEuros(RANKS[c.rank].fundsCap) : "—"} />
          <Row label="Prime de mission" value={currentOrder >= RANKS.agent.order ? "1 000 € / pt de mérite" : "—"} />
          {weeklyUpkeep(state) > 0 && <Row label="Entretien de tes biens" value={`−${formatEuros(weeklyUpkeep(state))}/sem.`} valueClass="text-partial" />}
        </dl>
      </section>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-mono whitespace-nowrap ${valueClass}`}>{value}</dd>
    </div>
  );
}

/** Ta place dans l'organisation : ton siège ou ta Station, et les trois Branches qui te soutiennent. */
function OrganisationSection({ state }: { state: GameState }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const seat = findSeat(c.identity.agency, c.seat);
  const station = findCity(c.station);
  const officer = RANKS[c.rank].order >= RANKS.agent.order;
  return (
    <section>
      <h3 className="label mb-1">Organisation</h3>
      <p className="mb-3 text-xs leading-relaxed text-muted">{agency.organization}</p>
      {seat ? (
        <div className="mb-3 flex gap-3 rounded-sm border p-2.5" style={{ borderColor: agency.color, background: tint(agency.color, 8) }}>
          <span style={{ color: agency.color }}>
            <SeatSigil agency={agency.id} seat={seat.id} number={seat.number} className="h-12 w-12" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-base" style={{ color: agency.color }}>
              {seat.name}
            </p>
            <p className="text-[11px] text-muted">{seat.heritage}</p>
            <p className="mt-1 text-xs text-ivory/85">
              <span style={{ color: agency.color }}>✦ {seat.signature.name}.</span> {seat.signature.description}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-2.5 text-[11px]">
              {seat.specialty.map((s) => (
                <span key={s} className="inline-flex items-center gap-1" style={{ color: ATTRIBUTES[SKILLS[s].attribute].color }}>
                  <SkillGlyph skill={s} className="h-3 w-3" />
                  {SKILLS[s].label}
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : station ? (
        <p className="mb-3 rounded-sm border border-line bg-night/40 p-2.5 text-xs text-muted">
          <span className="text-ivory">Station de {station.name}</span> ({findCountry(station.country)?.name}) : ta région est ton terrain (+1 sur les missions qui s'y déroulent).
          {c.rank === "agent" && ` Un siège du Cercle (${agency.circle.name}) se libère environ une fois par an.`}
        </p>
      ) : (
        <p className="mb-3 text-xs text-faint">Ton affectation se décide au Brevet : une Station de l'agence.</p>
      )}
      <p className="label mb-2">Les trois Branches</p>
      <ul className="space-y-2">
        {agency.branches.map((b) => {
          const favor = branchFavor(state, b.id);
          const color = favor >= 20 ? "var(--color-success)" : favor <= BRANCH_FAVOR_MIN ? "var(--color-fail)" : "var(--color-muted)";
          return (
            <li key={b.id} className="flex gap-2.5 rounded-sm border border-line p-2.5">
              <span style={{ color: agency.color, opacity: 0.8 }}>
                <BranchSigil agency={agency.id} branch={b.id} className="h-9 w-9" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-base">{b.name}</span>
                  <span className="font-mono text-[11px]" style={{ color }} title="Son estime pour toi">
                    {favor > 0 ? "+" : ""}
                    {favor}
                  </span>
                </p>
                <p className="text-[11px] text-muted">{b.role}</p>
                <p className="mt-0.5 text-[11px] text-ivory/80">
                  {b.chief.name} — {b.chief.description}
                </p>
                <p className="mt-1 text-[11px]">
                  <span style={{ color: agency.color }}>⚙ {b.support.name}.</span> <span className="text-muted">{b.support.description}</span>
                </p>
                {officer && favor <= BRANCH_FAVOR_MIN && <p className="text-[10px] text-fail">Refuse de t'aider en mission tant que la relation ne s'arrange pas.</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-faint">
        {officer
          ? "On ne rejoint pas une Branche : on s'entend (ou non) avec son chef. Passe du temps avec elles au planning ; chaque soutien en mission entame un peu leur estime."
          : "Les Branches ne travaillent qu'avec les officiers brevetés."}
      </p>
    </section>
  );
}

/** Les fausses identités : créées et entretenues au planning, grillées par l'exposition. */
function LegendsSection({ state }: { state: GameState }) {
  const c = state.character;
  const cap = legendCap(c);
  if (cap === 0 && c.legends.length === 0) return null;
  return (
    <section>
      <h3 className="label mb-2">
        Légendes · {c.legends.length}/{cap}
      </h3>
      {c.legends.length === 0 ? (
        <p className="text-xs text-muted">Aucune. Construis-en une au planning (activité « Légende ») : une identité de couverture te protège à chaque faux pas en mission.</p>
      ) : (
        <ul className="space-y-2">
          {c.legends.map((l) => (
            <li key={l.id} className="rounded-sm border border-line p-2.5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-base">{l.name}</span>
                <span className="font-mono text-[10px] text-muted">créée J{l.createdDay}</span>
              </p>
              <p className="text-[11px] text-muted">
                {l.profession}, {l.nationality}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-faint">
                crédibilité
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full" style={{ width: `${l.credibility}%`, background: l.credibility >= 60 ? "var(--color-success)" : l.credibility >= 30 ? "var(--color-partial)" : "var(--color-fail)" }} />
                </span>
                {l.credibility}
              </div>
              {l.burned.length > 0 && <p className="mt-1 text-[11px] text-fail">Grillée en : {l.burned.join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ce que les services de chaque pays savent de toi. */
function HeatSection({ state }: { state: GameState }) {
  const entries = Object.entries(state.character.heat ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (RANKS[state.character.rank].order < RANKS.aspirant.order) return null;
  return (
    <section>
      <h3 className="label mb-2">Fiché par pays</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">Aucun service étranger ne s'intéresse à toi. Pour l'instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([code, v]) => (
            <li key={code} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate">{findCountry(code)?.name ?? code}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full" style={{ width: `${v}%`, background: v >= 60 ? "var(--color-fail)" : v >= 30 ? "var(--color-partial)" : "var(--color-muted)" }} />
              </span>
              <span className={`w-20 text-right text-[10px] ${v >= 60 ? "text-fail" : "text-muted"}`}>
                {heatLabel(v)} {v}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-faint">La notoriété monte avec le bruit de tes missions et baisse avec le temps (moins vite chez les puissances hostiles). Fiché, tu seras attendu à l'arrivée.</p>
    </section>
  );
}

/** Blessures en cours (avec leur malus) et séquelles permanentes. */
function InjuriesSection({ state }: { state: GameState }) {
  const list = state.character.injuries ?? [];
  if (!list.length) return null;
  const day = state.world.day;
  return (
    <section>
      <h3 className="label mb-2 text-fail">Blessures et séquelles</h3>
      <ul className="space-y-2">
        {list.map((i) => (
          <li key={i.id} className="border-l-2 border-fail/50 pl-3">
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span>{i.name}</span>
              <span className="font-mono text-[10px] text-muted">{i.healDay === undefined ? "à vie" : i.healDay > day ? `guérie dans ${i.healDay - day} j` : "presque guérie"}</span>
            </p>
            <p className="text-xs text-muted">{i.description}</p>
            <p className="text-[11px] text-fail/90">
              {Object.entries(i.malus)
                .map(([k, v]) => `${SKILLS[k as SkillId].label} ${v}`)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-faint">Le repos accélère la guérison. Les séquelles, elles, restent.</p>
    </section>
  );
}

function LanguagesSection({ state }: { state: GameState }) {
  const c = state.character;
  const learning = Object.entries(c.learning ?? {}).sort((a, b) => b[1] - a[1]);
  if (!c.spoken?.length && !learning.length) return null;
  return (
    <section>
      <h3 className="label mb-2">Langues</h3>
      <p className="flex flex-wrap gap-1.5">
        {c.spoken.map((l) => (
          <span key={l} className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ivory/90">
            {l}
          </span>
        ))}
      </p>
      {learning.length > 0 && (
        <ul className="mt-2 space-y-1">
          {learning.map(([l, v]) => (
            <li key={l} className="flex items-center gap-2 text-[11px] text-muted">
              <span className="w-24 truncate">{l}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-[var(--pole-esprit)]" style={{ width: `${v}%` }} />
              </span>
              <span className="font-mono">{v}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-faint">Parler la langue du pays : +1 au contact des gens en mission ; sinon −1.</p>
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
          <RelationCard key={r.name} r={r} day={state.world.day} onAction={onAction} onArchive={onChange && (() => setStatus(r.name, "archive"))} onAsk={{ state, onChange }} />
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
  onAsk,
}: {
  r: Relation;
  day: number;
  onAction?: (a: PlayerAction) => void;
  onArchive?: () => void;
  /** Lui poser une question de renseignement (coûte une faveur). */
  onAsk?: { state: GameState; onChange?: (s: GameState) => void };
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
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] whitespace-nowrap text-faint">
          {since <= 0 ? "vu aujourd'hui" : `vu il y a ${since} j`}
          {r.cityId ? ` · ${findCity(r.cityId)?.name}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
          {onArchive && !contact && (
            <button onClick={onArchive} className="text-[10px] tracking-[0.12em] text-faint uppercase hover:text-muted" title="Ne plus suivre ce lien (libère une place)">
              Archiver
            </button>
          )}
          {reachable && !contact && onAsk && <AskPerson state={onAsk.state} source="relation" refId={r.name} onChange={onAsk.onChange} />}
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

/** La mallette fermée, en miniature : ce qu'il y a dans la mousse, et de quoi l'ouvrir. */
function MalletteTeaser({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const carried = state.character.inventory.filter((i) => i.carried);
  return (
    <button
      onClick={onOpen}
      className="group block w-full rounded-md border border-[#3a2c1d] p-2.5 text-left shadow-lg transition-transform hover:-translate-y-0.5"
      style={{ background: "linear-gradient(180deg, #3b2a1a, #24190f)" }}
      title="Ouvrir la mallette (raccourci : M)"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-typewriter text-[10px] tracking-[0.25em] text-[#e2c88f] uppercase">Mallette</span>
        <span className="font-mono text-[10px] text-[#c9b48c]/80">
          {carried.length}/{CARRY_LIMIT}
        </span>
      </span>
      <span className="mt-2 grid grid-cols-8 gap-1 rounded-sm bg-[#141110] p-1.5">
        {Array.from({ length: CARRY_LIMIT }, (_, i) => (
          <span key={i} className="grid aspect-square place-items-center rounded-[3px] text-[#c9b48c]" style={{ boxShadow: "inset 0 2px 5px rgba(0,0,0,0.9)" }}>
            {carried[i] ? <Silhouette category={carried[i].category} className="h-4 w-4" /> : null}
          </span>
        ))}
      </span>
      <span className="mt-2 block text-center font-typewriter text-[10px] tracking-[0.2em] text-[#e2c88f]/80 uppercase group-hover:text-[#e2c88f]">Ouvrir ▸</span>
    </button>
  );
}

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

function CarnetTab({ state, onOpenArchives }: { state: GameState; onOpenArchives?: (folder?: string) => void }) {
  return (
    <div className="space-y-6">
      <Pieces state={state} onOpenArchives={onOpenArchives} />
      <Carnet state={state} />
    </div>
  );
}

/** Les trois dernières pièces montrées par le narrateur ; les autres sont aux archives. */
function Pieces({ state, onOpenArchives }: { state: GameState; onOpenArchives?: (folder?: string) => void }) {
  const all = state.pieces ?? [];
  const pieces = [...all].reverse().slice(0, 3);
  const [open, setOpen] = useState<number | null>(null);
  if (!pieces.length) return null;
  return (
    <section>
      <h3 className="label mb-2 flex items-baseline justify-between">
        <span>Dernières pièces</span>
        {onOpenArchives && all.length > 0 && (
          <button onClick={() => onOpenArchives()} className="text-[10px] tracking-[0.12em] text-brass-soft hover:underline">
            ▤ toutes ({all.length}) aux archives
          </button>
        )}
      </h3>
      <ul className="space-y-1.5">
        {pieces.map((d, i) => (
          <li key={i} className="rounded-sm border border-line">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-baseline gap-2 px-3 py-2 text-left" aria-expanded={open === i}>
              <span className="w-4 shrink-0 text-center text-brass">{DOC_LABELS[d.type].icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{d.titre}</span>
                <span className="text-[10px] text-faint">
                  {DOC_LABELS[d.type].label}
                  {d.de ? ` · ${d.de}` : ""}
                  {d.day !== undefined ? ` · J${d.day}` : ""}
                </span>
              </span>
            </button>
            {open === i && (
              <div className="border-t border-line px-1 pb-1 text-base">
                <StoryDocView doc={d} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

