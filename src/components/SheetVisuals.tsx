"use client";

import { useState } from "react";
import { AGENCIES } from "@/lib/game/agencies";
import { branchFavor } from "@/lib/game/command";
import { BRANCH_FAVOR_MIN, nextRanks, rankMissing } from "@/lib/game/engine";
import { heatLabel, legendCap } from "@/lib/game/field";
import { ATTR_MAX, ATTRIBUTE_IDS, ATTRIBUTES, RANK_IDS, RANKS, SKILLS, findFlaw, findQuality, formatMerit } from "@/lib/game/rules";
import type { GameState, RankId } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { findCountry } from "@/lib/world/geo";
import { PoleEmblem, SkillGlyph } from "./glyphs";
import { BranchSigil } from "./sigils";
import { RankBadge } from "./ui";

/* ------------------------------------------------------------------ */
/* Aptitudes                                                           */
/* ------------------------------------------------------------------ */

/** L'empreinte : les quatre pôles en losange, d'un coup d'œil. */
export function PoleRadar({ state }: { state: GameState }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const R = 46;
  // Esprit en haut, Âme à droite, Corps en bas, Geste à gauche.
  const dirs: Record<string, [number, number]> = { esprit: [0, -1], ame: [1, 0], corps: [0, 1], geste: [-1, 0] };
  const pt = (a: string, v: number) => {
    const [dx, dy] = dirs[a];
    const r = (v / ATTR_MAX) * R;
    return [60 + dx * r, 60 + dy * r];
  };
  const poly = ATTRIBUTE_IDS.map((a) => pt(a, c.attributes[a]).join(",")).join(" ");
  const sig = SKILLS[c.signature];
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" aria-label="Empreinte des pôles">
        {[2, 4, 6].map((v) => (
          <polygon key={v} points={ATTRIBUTE_IDS.map((a) => pt(a, v).join(",")).join(" ")} fill="none" stroke="var(--color-line)" strokeWidth={0.8} />
        ))}
        <line x1="60" y1={60 - R} x2="60" y2={60 + R} stroke="var(--color-line)" strokeWidth={0.6} />
        <line x1={60 - R} y1="60" x2={60 + R} y2="60" stroke="var(--color-line)" strokeWidth={0.6} />
        <polygon points={poly} fill={tint(agency.color, 22)} stroke={agency.color} strokeWidth={1.4} strokeLinejoin="round" className="transition-all duration-700" />
        {ATTRIBUTE_IDS.map((a) => {
          const [x, y] = pt(a, c.attributes[a]);
          return <circle key={a} cx={x} cy={y} r={3} fill={ATTRIBUTES[a].color} />;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {ATTRIBUTE_IDS.map((a) => (
          <li key={a} className="flex items-center gap-2" title={ATTRIBUTES[a].description}>
            <PoleEmblem pole={a} className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: ATTRIBUTES[a].color }}>
              {ATTRIBUTES[a].label}
            </span>
            <span className="font-serif text-xl leading-none" style={{ color: ATTRIBUTES[a].color }}>
              {c.attributes[a]}
            </span>
          </li>
        ))}
        {sig && (
          <li className="flex items-center gap-1.5 pt-1 text-[10px] text-muted" title="Compétence signature : +1 rang et +1 au plafond">
            <span className="text-brass">★</span>
            <SkillGlyph skill={c.signature} className="h-3 w-3" />
            {sig.label}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Qualités et défaut, en tampons : la description au survol. */
export function TraitBadges({ state }: { state: GameState }) {
  const c = state.character;
  const qualities = c.qualities.map(findQuality).filter((q) => q !== undefined);
  const flaw = findFlaw(c.flaw);
  const [open, setOpen] = useState<string | null>(null);
  const all = [...qualities.map((q) => ({ ...q, good: true })), ...(flaw ? [{ ...flaw, good: false }] : [])];
  const shown = all.find((t) => t.id === open);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            title={t.description}
            className={`rotate-[-1deg] rounded-sm border-2 px-2 py-0.5 font-typewriter text-[11px] tracking-[0.12em] uppercase transition-transform hover:rotate-0 ${t.good ? "border-success/60 text-success" : "border-fail/60 text-fail"} ${open === t.id ? "rotate-0 bg-ivory/5" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {shown && <p className="animate-rise mt-2 text-xs text-muted">{shown.description}</p>}
    </div>
  );
}

/** Les langues : celles qu'on parle, et celles qu'on apprend (avec leur avancée). */
export function LanguageChips({ state }: { state: GameState }) {
  const c = state.character;
  const learning = Object.entries(c.learning ?? {}).sort((a, b) => b[1] - a[1]);
  if (!c.spoken?.length && !learning.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {c.spoken.map((l) => (
        <span key={l} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ivory/90" title="Courant">
          {l}
        </span>
      ))}
      {learning.map(([l, v]) => (
        <span key={l} className="relative overflow-hidden rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted" title={`En apprentissage : ${v} %`}>
          <span className="absolute inset-y-0 left-0 bg-[var(--pole-esprit)]/20" style={{ width: `${v}%` }} />
          <span className="relative">
            {l} {v}%
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carrière                                                            */
/* ------------------------------------------------------------------ */

/** L'échelle des grades : le tronc commun, puis les deux voies, et la Direction au sommet. */
export function RankLadder({ state }: { state: GameState }) {
  const c = state.character;
  const order = RANKS[c.rank].order;
  const nexts = new Set(nextRanks(state));
  const reached = (r: RankId) => r === c.rank || (RANKS[r].order < order && (RANKS[r].track === "tronc" || RANKS[r].track === RANKS[c.rank].track || (c.feats?.seated && RANKS[r].track === "terrain")));
  const cell = (r: RankId) => {
    const current = r === c.rank;
    const next = nexts.has(r);
    return (
      <div key={r} className={`flex flex-col items-center gap-0.5 ${reached(r) || next ? "" : "opacity-35"}`} title={`${RANKS[r].label} — ${RANKS[r].requirement}`}>
        <span className={`grid h-9 w-9 place-items-center rounded-full ${current ? "bg-brass/20 ring-2 ring-brass" : next ? "ring-1 ring-dashed ring-brass/60" : ""}`}>
          <RankBadge rank={r} className="h-6 w-5" />
        </span>
        <span className={`max-w-[3.8rem] truncate text-center text-[9px] leading-tight ${current ? "font-semibold text-brass-soft" : "text-muted"}`}>{RANKS[r].label}</span>
      </div>
    );
  };
  const tronc = RANK_IDS.filter((r) => RANKS[r].track === "tronc" && r !== "directeur");
  const terrain = RANK_IDS.filter((r) => RANKS[r].track === "terrain");
  const commandement = RANK_IDS.filter((r) => RANKS[r].track === "commandement");
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between">{tronc.map(cell)}</div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Terrain", terrain],
            ["Commandement", commandement],
          ] as const
        ).map(([label, ranks]) => (
          <div key={label} className="rounded-sm border border-line/60 pt-1 pb-1.5">
            <p className="mb-1 text-center text-[8px] tracking-[0.2em] text-faint uppercase">{label}</p>
            <div className="flex justify-around">{ranks.map(cell)}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-center">{cell("directeur")}</div>
    </div>
  );
}

/** La prochaine marche : ce qui est fait, ce qui manque, en liste à cocher. */
export function NextSteps({ state }: { state: GameState }) {
  const nexts = nextRanks(state).filter((r) => r !== "aspirant");
  if (!nexts.length) return null;
  return (
    <div className="space-y-2">
      {nexts.map((r) => {
        const missing = rankMissing(state, r);
        return (
          <div key={r} className="rounded-sm border border-line p-2.5">
            <p className="flex items-center gap-2 text-sm">
              <RankBadge rank={r} className="h-5 w-4" />
              <span className="flex-1">{RANKS[r].label}</span>
              {RANKS[r].track !== "tronc" && <span className="text-[9px] tracking-[0.12em] text-faint uppercase">{RANKS[r].track}</span>}
            </p>
            {missing.length === 0 ? (
              <p className="mt-1 text-xs text-success">✓ Conditions remplies : à toi de la demander.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {missing.map((m) => (
                  <li key={m} className="flex gap-1.5 text-[11px] text-muted">
                    <span className="text-fail">✗</span>
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MeritGauge({ state }: { state: GameState }) {
  const c = state.character;
  const nexts = nextRanks(state).filter((r) => r !== "aspirant");
  const target = nexts.length ? Math.min(...nexts.map((r) => RANKS[r].merit).filter((m) => m > 0), Infinity) : 0;
  const has = Number.isFinite(target) && target > 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div title="Une mission rapporte selon son importance × son résultat. Un blâme : −3.">
        <p className="flex items-baseline justify-between text-[9px] tracking-[0.14em] text-muted uppercase">
          Mérite
          <span className="font-mono text-xs tracking-normal text-ivory/85">
            {formatMerit(c.merit)}
            {has ? `/${target}` : ""}
          </span>
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brass transition-all duration-700" style={{ width: `${has ? Math.min(100, (c.merit / target) * 100) : 100}%` }} />
        </div>
        {c.blames > 0 && <p className="mt-0.5 text-[10px] text-fail">{c.blames} blâme{c.blames > 1 ? "s" : ""}</p>}
      </div>
      <div>
        <p className="flex items-baseline justify-between text-[9px] tracking-[0.14em] text-muted uppercase">
          Réputation
          <span className="font-mono text-xs tracking-normal text-ivory/85">{c.reputation}</span>
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-[var(--pole-ame)] transition-all duration-700" style={{ width: `${c.reputation}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Les trois Branches, en tuiles : sigle, estime, et le reste au survol. */
export function BranchTiles({ state }: { state: GameState }) {
  const agency = AGENCIES[state.character.identity.agency];
  const officer = RANKS[state.character.rank].order >= RANKS.agent.order;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {agency.branches.map((b) => {
        const favor = branchFavor(state, b.id);
        const color = favor >= 20 ? "var(--color-success)" : favor <= BRANCH_FAVOR_MIN ? "var(--color-fail)" : "var(--color-muted)";
        return (
          <div key={b.id} className="flex flex-col items-center gap-1 rounded-sm border border-line px-1 py-2 text-center" title={`${b.name} — ${b.role}\n${b.chief.name}\nSoutien : ${b.support.name}. ${b.support.description}${officer && favor <= BRANCH_FAVOR_MIN ? "\nRefuse de t'aider en mission." : ""}`}>
            <span style={{ color: agency.color, opacity: 0.85 }}>
              <BranchSigil agency={agency.id} branch={b.id} className="h-8 w-8" />
            </span>
            <span className="w-full truncate text-[11px]">{b.name}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (favor + 100) / 2)}%`, background: color }} />
            </span>
            <span className="font-mono text-[10px]" style={{ color }}>
              {favor > 0 ? "+" : ""}
              {favor}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Couvertures                                                         */
/* ------------------------------------------------------------------ */

/** Les légendes, comme des passeports : la crédibilité en bas, les pays grillés en tampons. */
export function Passports({ state }: { state: GameState }) {
  const c = state.character;
  const cap = legendCap(c);
  const initials = `${c.identity.firstName[0] ?? ""}${c.identity.lastName[0] ?? ""}`;
  return (
    <div className="space-y-3">
      {c.legends.map((l, i) => (
        <div key={l.id} className="relative overflow-hidden rounded-md border border-[#2b3a55] text-[#e8e4d8] shadow-lg" style={{ background: "linear-gradient(135deg, #1f2b44, #15203a 60%, #1b2740)", transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
            <span className="font-typewriter text-[10px] tracking-[0.3em] text-[#d8c38f] uppercase">Passeport · {l.nationality}</span>
            <span className="font-mono text-[9px] opacity-60">J{l.createdDay}</span>
          </div>
          <div className="flex gap-3 p-3">
            <div className="grid h-16 w-13 shrink-0 place-items-center rounded-sm bg-[#e8e4d8]/10 font-serif text-lg opacity-80 ring-1 ring-white/10">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg leading-tight">{l.name}</p>
              <p className="text-[11px] opacity-70">{l.profession}</p>
              <p className="mt-2 flex items-center gap-2 text-[9px] tracking-[0.15em] uppercase opacity-70">
                Crédibilité
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${l.credibility}%`, background: l.credibility >= 60 ? "#6fbf73" : l.credibility >= 30 ? "#d6a84a" : "#d0574b" }} />
                </span>
                <span className="font-mono tracking-normal">{l.credibility}</span>
              </p>
            </div>
          </div>
          {/* La bande lisible par machine. */}
          <p className="truncate bg-black/20 px-3 py-1 font-mono text-[9px] tracking-[0.2em] opacity-50">
            P&lt;{l.nationality.slice(0, 3).toUpperCase()}&lt;{l.name.toUpperCase().replace(/[^A-Z]+/g, "<")}&lt;&lt;&lt;&lt;&lt;&lt;
          </p>
          {l.burned.map((b, n) => (
            <span key={b} className="absolute rounded-sm border-2 border-[#d0574b] px-1.5 font-typewriter text-[10px] tracking-[0.15em] text-[#d0574b] uppercase opacity-85" style={{ right: 10 + n * 18, top: 34 + n * 14, transform: `rotate(${-12 + n * 9}deg)` }}>
              Grillée · {b}
            </span>
          ))}
        </div>
      ))}
      {Array.from({ length: Math.max(0, cap - c.legends.length) }, (_, i) => (
        <div key={`vide${i}`} className="grid h-20 place-items-center rounded-md border border-dashed border-line text-center text-[11px] text-faint">
          Emplacement libre — construis une légende au planning (« Légende »)
        </div>
      ))}
      {cap === 0 && c.legends.length === 0 && <p className="text-xs text-faint">Les légendes viennent avec le Brevet.</p>}
    </div>
  );
}

/** Le fichier des services étrangers : qui te connaît, et à quel point. */
export function WatchList({ state }: { state: GameState }) {
  const entries = Object.entries(state.character.heat ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-xs text-faint">Aucun service étranger ne s'intéresse à toi. Pour l'instant.</p>;
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {entries.map(([code, v]) => {
        const color = v >= 60 ? "var(--color-fail)" : v >= 30 ? "var(--color-partial)" : "var(--color-muted)";
        return (
          <li key={code} className="relative overflow-hidden rounded-sm border border-line px-2 py-1.5">
            <span className="absolute inset-y-0 left-0" style={{ width: `${v}%`, background: tint(color, 12) }} />
            <p className="relative truncate text-xs">{findCountry(code)?.name ?? code}</p>
            <p className="relative font-typewriter text-[10px] tracking-[0.12em] uppercase" style={{ color }}>
              {heatLabel(v)} · {v}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
