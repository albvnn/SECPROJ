"use client";

import { useEffect, useState } from "react";
import { AGENCIES } from "@/lib/game/agencies";
import { CARRY_LIMIT, toggleCarried } from "@/lib/game/engine";
import { POSSESSIONS, weeklyUpkeep } from "@/lib/game/economy";
import { findGadget } from "@/lib/game/gadgets";
import { ATTRIBUTES, SKILLS, formatEuros } from "@/lib/game/rules";
import type { GameState, Item, ItemCategory, PlayerAction } from "@/lib/game/types";
import { SkillGlyph } from "./glyphs";

/* ------------------------------------------------------------------ */
/* Silhouettes : chaque catégorie a sa découpe dans la mousse          */
/* ------------------------------------------------------------------ */

const SILHOUETTES: Record<ItemCategory, React.ReactNode> = {
  gadget: (
    <>
      <rect x="14" y="14" width="36" height="36" rx="4" />
      <rect x="22" y="22" width="20" height="20" rx="2" />
      <path d="M22 10v4M32 10v4M42 10v4M22 50v4M32 50v4M42 50v4M10 22h4M10 32h4M10 42h4M50 22h4M50 32h4M50 42h4" />
    </>
  ),
  arme: <path d="M8 24h38l6-4h4v10h-12l-3 4h-7l-3 14h-9l3-14H8z M30 34v6" />,
  equipement: (
    <>
      <path d="M14 50l20-20M30 26l8-8 8 8-8 8z" />
      <circle cx="17" cy="47" r="4" />
      <path d="M40 40l10 10" />
    </>
  ),
  document: (
    <>
      <path d="M16 10h22l10 10v34H16z" />
      <path d="M38 10v10h10M22 30h20M22 37h20M22 44h12" />
    </>
  ),
  consommable: (
    <>
      <path d="M26 10h12M28 10v12l-8 14v14a4 4 0 004 4h16a4 4 0 004-4V36l-8-14V10" />
      <path d="M21 40h22" />
    </>
  ),
  souvenir: <path d="M32 10l6 14 15 1-11 10 4 15-14-8-14 8 4-15-11-10 15-1z" />,
};

function Silhouette({ category, className = "h-10 w-10" }: { category: ItemCategory; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {SILHOUETTES[category] ?? SILHOUETTES.equipement}
    </svg>
  );
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  gadget: "Gadget",
  arme: "Arme",
  equipement: "Équipement",
  document: "Document",
  consommable: "Consommable",
  souvenir: "Souvenir",
};

/* ------------------------------------------------------------------ */
/* La mallette                                                         */
/* ------------------------------------------------------------------ */

/**
 * L'inventaire comme on l'ouvre en vrai : une mallette dont la mousse est découpée en emplacements
 * (ce que tu emportes), un casier (ce qui reste à la base), et la fiche technique de l'objet choisi.
 * À la base, on glisse les objets d'un côté à l'autre ; en mission, la mallette est verrouillée.
 */
export function Mallette({
  state,
  onChange,
  onAction,
  onClose,
}: {
  state: GameState;
  onChange?: (s: GameState) => void;
  onAction?: (a: PlayerAction) => void;
  onClose: () => void;
}) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const inMission = state.world.phase === "mission";
  const locked = inMission || !onChange;
  const items = c.inventory.map((item, index) => ({ item, index }));
  const carried = items.filter((x) => x.item.carried);
  const locker = items.filter((x) => !x.item.carried);
  const [selected, setSelected] = useState<number | null>(carried[0]?.index ?? locker[0]?.index ?? null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<"case" | "locker" | null>(null);
  const [opened, setOpened] = useState(false);
  const chosen = selected !== null ? c.inventory[selected] : undefined;
  const full = carried.length >= CARRY_LIMIT;

  useEffect(() => {
    const t = setTimeout(() => setOpened(true), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const move = (index: number, toCase: boolean) => {
    if (locked) return;
    const item = c.inventory[index];
    if (!item || item.carried === toCase) return;
    onChange!(toggleCarried(state, index));
  };
  const dropZone = (zone: "case" | "locker") => ({
    onDragOver: (e: React.DragEvent) => {
      if (locked || dragging === null) return;
      e.preventDefault();
      setOver(zone);
    },
    onDragLeave: () => setOver((o) => (o === zone ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging !== null) move(dragging, zone === "case");
      setDragging(null);
      setOver(null);
    },
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Mallette" className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10" onClick={(e) => e.stopPropagation()}>
        {/* Le couvercle : cuir, coutures et fermoirs. */}
        <div
          className="relative rounded-t-lg border border-b-0 border-[#3a2c1d] px-5 pt-4 pb-3 shadow-2xl transition-transform duration-700"
          style={{
            background: "linear-gradient(180deg, #3b2a1a, #24190f)",
            transformOrigin: "bottom",
            transform: opened ? "perspective(900px) rotateX(0deg)" : "perspective(900px) rotateX(-70deg)",
          }}
        >
          <div className="pointer-events-none absolute inset-2 rounded-md border border-dashed border-[#a8875a]/30" />
          <div className="relative flex flex-wrap items-center gap-3">
            <span className="h-3 w-8 rounded-sm bg-gradient-to-b from-[#e2c88f] to-[#8a6a35] shadow" />
            <div className="min-w-0 flex-1">
              <p className="font-typewriter text-[11px] tracking-[0.3em] text-[#e2c88f] uppercase">
                Mallette · {c.codename ? `« ${c.codename} »` : c.matricule ?? `${c.identity.firstName} ${c.identity.lastName}`}
              </p>
              <p className="text-[11px] text-[#c9b48c]/80">
                {inMission ? "En mission : la mallette est verrouillée, tu fais avec ce que tu as." : locked ? "Lecture seule pendant que le narrateur écrit." : "À la base : glisse les objets entre la mallette et le casier."}
              </p>
            </div>
            <span className="h-3 w-8 rounded-sm bg-gradient-to-b from-[#e2c88f] to-[#8a6a35] shadow" />
            <button onClick={onClose} className="rounded-sm border border-[#a8875a]/40 px-2 py-1 text-[10px] tracking-[0.15em] text-[#e2c88f] uppercase hover:bg-[#e2c88f]/10">
              Fermer ✕
            </button>
          </div>
        </div>

        <div className="grid gap-0 overflow-hidden rounded-b-lg border border-t-0 border-[#3a2c1d] shadow-2xl lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="bg-[#16120d] p-4 sm:p-5">
            {/* La mousse découpée. */}
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-typewriter text-[11px] tracking-[0.25em] text-[#c9b48c] uppercase">Sur toi</p>
              <p className={`font-mono text-[11px] ${full ? "text-partial" : "text-[#c9b48c]/70"}`}>
                {carried.length}/{CARRY_LIMIT}
              </p>
            </div>
            <div
              {...dropZone("case")}
              className={`grid grid-cols-2 gap-3 rounded-md p-3 transition-colors sm:grid-cols-4 ${over === "case" ? "ring-2 ring-brass/60" : ""}`}
              style={{
                background: "radial-gradient(circle at 30% 20%, #26211b, #141110)",
                backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 30% 20%, #26211b, #141110)",
                backgroundSize: "6px 6px, 100% 100%",
              }}
            >
              {Array.from({ length: CARRY_LIMIT }, (_, slot) => {
                const x = carried[slot];
                return x ? (
                  <Cutout
                    key={`i${x.index}`}
                    item={x.item}
                    on={selected === x.index}
                    draggable={!locked}
                    onDragStart={() => setDragging(x.index)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => setSelected(x.index)}
                  />
                ) : (
                  <div key={`e${slot}`} className="grid aspect-[4/3] place-items-center rounded-md text-[10px] tracking-[0.2em] text-[#c9b48c]/25 uppercase" style={{ boxShadow: "inset 0 3px 10px rgba(0,0,0,0.85), inset 0 -1px 0 rgba(255,255,255,0.04)" }}>
                    vide
                  </div>
                );
              })}
            </div>

            {/* Le casier de la base. */}
            <div className="mt-5 mb-2 flex items-baseline justify-between">
              <p className="font-typewriter text-[11px] tracking-[0.25em] text-[#c9b48c] uppercase">Au casier · {agency.hq.split(":")[0]}</p>
              <p className="font-mono text-[11px] text-[#c9b48c]/70">{locker.length}</p>
            </div>
            <div {...dropZone("locker")} className={`min-h-24 rounded-md border border-[#3a2c1d] p-2 transition-colors ${over === "locker" ? "ring-2 ring-brass/60" : ""}`} style={{ background: "repeating-linear-gradient(180deg, #1c1813 0 58px, #2a231a 58px 61px)" }}>
              {locker.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[#c9b48c]/40 italic">Étagères vides.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {locker.map((x) => (
                    <li key={x.index}>
                      <button
                        draggable={!locked}
                        onDragStart={() => setDragging(x.index)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(x.index)}
                        className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors ${selected === x.index ? "border-brass bg-brass/10 text-brass-soft" : "border-[#3a2c1d] bg-[#1f1a14] text-[#e9e4d8]/85 hover:border-[#a8875a]/50"}`}
                      >
                        <span className="text-[#c9b48c]">
                          <Silhouette category={x.item.category} className="h-5 w-5" />
                        </span>
                        <span className="max-w-[10rem] truncate">{x.item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* L'argent et les biens, au fond de la mallette. */}
            <div className="mt-5 grid gap-2 text-xs text-[#c9b48c]/80 sm:grid-cols-3">
              <p>
                Solde <span className="font-mono text-success">{formatEuros(c.money)}</span>
                {weeklyUpkeep(state) > 0 && <span className="text-[#c9b48c]/50"> · entretien −{formatEuros(weeklyUpkeep(state))}/sem.</span>}
              </p>
              {inMission && (
                <p>
                  Fonds d'opération <span className="font-mono" style={{ color: agency.color }}>{formatEuros(c.missionFunds)}</span>
                </p>
              )}
              <p className="truncate">
                Biens : {c.possessions?.length ? c.possessions.map((id) => POSSESSIONS.find((p) => p.id === id)?.name).filter(Boolean).join(", ") : "aucun"}
              </p>
            </div>
          </div>

          {/* La fiche technique. */}
          <aside className="border-t border-[#3a2c1d] bg-[#efe7d3] p-5 text-[#24201a] lg:border-t-0 lg:border-l">
            {chosen && selected !== null ? (
              <ItemSheet
                item={chosen}
                labName={agency.lab.name}
                locked={locked}
                full={full}
                onMove={() => move(selected, !chosen.carried)}
                onUse={onAction && chosen.carried && chosen.charges !== 0 ? (how) => (onClose(), onAction({ type: "use", item: chosen.name, how })) : undefined}
              />
            ) : (
              <p className="font-typewriter text-sm opacity-60">Choisis un objet pour lire sa fiche.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Cutout({
  item,
  on,
  draggable,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  item: Item;
  on: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const pole = item.bonus ? ATTRIBUTES[SKILLS[item.bonus.skill].attribute].color : "#c9b48c";
  const spent = item.charges === 0;
  return (
    <button
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={item.description}
      className={`group relative flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-md px-2 text-center transition-transform ${on ? "-translate-y-0.5" : "hover:-translate-y-0.5"} ${spent ? "opacity-40" : ""}`}
      style={{
        background: "linear-gradient(180deg, #2b2620, #1d1915)",
        boxShadow: on ? `inset 0 3px 10px rgba(0,0,0,0.8), 0 0 0 2px ${pole}` : "inset 0 3px 10px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ color: pole }}>
        <Silhouette category={item.category} />
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight text-[#e9e4d8]/90">{item.name}</span>
      {item.charges !== undefined && (
        <span className="flex gap-0.5" aria-label={`${item.charges} utilisations`}>
          {Array.from({ length: Math.min(9, Math.max(item.charges, 1)) }, (_, i) => (
            <span key={i} className="h-1 w-2 rounded-full" style={{ background: i < item.charges! ? pole : "rgba(255,255,255,0.15)" }} />
          ))}
        </span>
      )}
      {item.lab && <span className="absolute top-1 right-1 rounded-[2px] bg-[var(--pole-esprit)]/80 px-1 text-[8px] font-bold tracking-wider text-white uppercase">Labo</span>}
      {item.bonus && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[9px]" style={{ color: pole }}>
          <SkillGlyph skill={item.bonus.skill} className="h-3 w-3" />+{item.bonus.value}
        </span>
      )}
    </button>
  );
}

function ItemSheet({ item, labName, locked, full, onMove, onUse }: { item: Item; labName: string; locked: boolean; full: boolean; onMove: () => void; onUse?: (how: string) => void }) {
  const [how, setHow] = useState("");
  const gadget = findGadget(item.gadget);
  return (
    <div key={item.name} className="animate-rise">
      <p className="font-typewriter text-[10px] tracking-[0.25em] uppercase opacity-60">Fiche technique · {CATEGORY_LABELS[item.category]}</p>
      <div className="mt-3 flex items-start gap-3">
        <span className="rounded-md border border-[#24201a]/20 p-2">
          <Silhouette category={item.category} className="h-14 w-14" />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-2xl leading-tight">{item.name}</p>
          <p className="text-xs opacity-70">{item.carried ? "Dans la mallette" : "Au casier"}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-snug">{item.description}</p>
      <dl className="mt-4 space-y-2 font-typewriter text-[13px]">
        {item.bonus && (
          <div>
            <dt className="text-[10px] tracking-[0.2em] uppercase opacity-60">Effet</dt>
            <dd>
              {SKILLS[item.bonus.skill].label} +{item.bonus.value} — {item.bonus.condition}
            </dd>
          </div>
        )}
        {item.charges !== undefined && (
          <div>
            <dt className="text-[10px] tracking-[0.2em] uppercase opacity-60">Utilisations</dt>
            <dd>{item.charges === 0 ? "épuisé" : item.charges}</dd>
          </div>
        )}
        {gadget && (
          <div>
            <dt className="text-[10px] tracking-[0.2em] uppercase opacity-60">Sert pour</dt>
            <dd>{gadget.nodes.join(", ")}</dd>
          </div>
        )}
        {item.lab && (
          <div>
            <dt className="text-[10px] tracking-[0.2em] uppercase opacity-60">Provenance</dt>
            <dd>Propriété de {labName}. À rendre en fin de mission ; le perdre coûte du mérite.</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 space-y-2">
        {!locked && (
          <button onClick={onMove} disabled={!item.carried && full} className="w-full rounded-sm border border-[#24201a]/40 px-3 py-2 font-typewriter text-xs tracking-[0.15em] uppercase hover:bg-[#24201a]/10 disabled:opacity-40">
            {item.carried ? "Laisser au casier" : full ? "Mallette pleine" : "Mettre dans la mallette"}
          </button>
        )}
        {onUse && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUse(how.trim());
            }}
            className="flex gap-1.5"
          >
            <input value={how} onChange={(e) => setHow(e.target.value)} maxLength={300} placeholder="Comment, sur quoi ? (facultatif)" className="min-w-0 flex-1 rounded-sm border border-[#24201a]/30 bg-white/40 px-2 py-1.5 text-xs outline-none focus:border-[#24201a]/70" />
            <button type="submit" className="rounded-sm bg-[#24201a] px-3 py-1.5 font-typewriter text-xs tracking-[0.15em] text-[#efe7d3] uppercase">
              Utiliser
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export { Silhouette };
