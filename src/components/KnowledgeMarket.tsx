"use client";

import { useState } from "react";
import { buyers, freshValue, knowledgeBase, tradeInfo, type BuyerKind } from "@/lib/game/knowledgebase";
import type { GameState, InfoItem } from "@/lib/game/types";

const ORIGIN: Record<InfoItem["origin"], { label: string; icon: string }> = {
  rapport: { label: "Rapport", icon: "⌕" },
  operation: { label: "Opération", icon: "⌖" },
  faction: { label: "Faction", icon: "◆" },
  piece: { label: "Pièce", icon: "▣" },
  echange: { label: "Échange", icon: "⇄" },
};

const KIND: Record<BuyerKind, { label: string; color: string }> = {
  agence: { label: "Ton agence", color: "var(--color-success)" },
  lien: { label: "Tes liens", color: "var(--pole-ame)" },
  rival: { label: "Agents rivaux", color: "var(--color-partial)" },
  courtier: { label: "Marché noir", color: "var(--color-fail)" },
};

/**
 * Ce que tu sais, et ce que ça vaut : chaque information se verse au dossier de l'agence,
 * s'offre à un lien, s'échange avec un rival ou se vend à un courtier.
 */
export function KnowledgeMarket({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const items = knowledgeBase(state);
  const [picked, setPicked] = useState<string | null>(items[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const item = items.find((x) => x.id === picked) ?? null;
  const today = state.world.day;
  const traded = state.knowledge?.traded ?? {};

  if (!items.length)
    return (
      <div className="grid min-h-60 place-items-center rounded-sm border border-dashed border-line text-center">
        <p className="max-w-sm px-6 text-sm text-muted">Tu ne sais encore rien qui vaille. Les réponses de ton réseau, tes opérations et les pièces que tu gardes viendront remplir cette base.</p>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ul className="space-y-1">
        {items.map((it) => {
          const v = freshValue(it, today);
          const n = traded[it.id]?.length ?? 0;
          return (
            <li key={it.id}>
              <button
                onClick={() => (setPicked(it.id), setError(null), setDone([]))}
                className={`flex w-full items-start gap-2.5 rounded-sm border px-3 py-2 text-left transition-colors ${picked === it.id ? "border-brass/60 bg-brass/10" : "border-line hover:border-line-strong"}`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-center text-brass">{ORIGIN[it.origin].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{it.title}</span>
                  <span className="block truncate text-[10px] text-faint">
                    {ORIGIN[it.origin].label} · {it.about}
                    {n ? ` · cédée ${n} fois` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <Value v={v} />
                  {it.sensitive && <span className="rounded-[2px] border border-fail/60 px-1 text-[8px] tracking-[0.15em] text-fail uppercase">secret</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {item && (
        <div key={item.id} className="animate-rise space-y-4">
          <div className="paper rounded-sm px-5 py-4 text-paper-ink">
            <p className="font-typewriter text-[10px] tracking-[0.25em] uppercase opacity-60">
              {ORIGIN[item.origin].label} · {item.day ? `jour ${item.day}` : "dossier ouvert"}
            </p>
            <h3 className="mt-1 font-serif text-2xl leading-tight">{item.title}</h3>
            <p className="text-sm opacity-75">{item.about}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                Valeur <Value v={freshValue(item, today)} dark />
              </span>
              {freshValue(item, today) < item.value && <span className="opacity-60">elle vieillit (valeur d'origine {item.value})</span>}
              {item.sensitive && <span className="font-semibold text-[#b4483c]">Secret de ton agence : la céder dehors, c'est trahir.</span>}
            </div>
          </div>

          {(Object.keys(KIND) as BuyerKind[]).map((k) => {
            const list = buyers(state, item).filter((b) => b.kind === k);
            if (!list.length) return null;
            return (
              <section key={k}>
                <h4 className="label mb-1.5" style={{ color: KIND[k].color }}>
                  {KIND[k].label}
                </h4>
                <ul className="space-y-1.5">
                  {list.map((b) => {
                    const key = `${b.kind}:${b.ref}`;
                    return (
                      <li key={key} className={`flex items-center gap-3 rounded-sm border px-3 py-2 ${b.blocker ? "border-line/60 opacity-55" : "border-line"}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{b.label}</span>
                          <span className="block truncate text-[10px] text-faint">{b.detail}</span>
                          <span className="block text-[11px] text-success">{b.gain}</span>
                          {b.risk && <span className="block text-[10px] text-fail">⚠ {b.risk}</span>}
                          {b.blocker && <span className="block text-[10px] text-muted">{b.blocker}</span>}
                        </span>
                        {!b.blocker && onChange && (
                          <button
                            onClick={() => {
                              try {
                                setError(null);
                                const r = tradeInfo(state, item.id, b.kind, b.ref);
                                setDone(r.notices);
                                onChange(r.state);
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "Impossible.");
                              }
                            }}
                            className="shrink-0 rounded-sm bg-brass/90 px-3 py-1 text-[10px] font-semibold tracking-[0.1em] text-ink uppercase hover:bg-brass-soft"
                          >
                            {b.kind === "courtier" ? "Vendre" : b.kind === "rival" ? "Échanger" : b.kind === "agence" ? "Verser" : "Offrir"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {error && <p className="text-xs text-fail">{error}</p>}
          {done.length > 0 && (
            <ul className="animate-rise rounded-sm border border-success/40 bg-success/5 px-3 py-2 text-xs">
              {done.map((n) => (
                <li key={n}>✓ {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Value({ v, dark = false }: { v: number; dark?: boolean }) {
  return (
    <span className="flex gap-0.5" title={`Valeur ${v}/5`} aria-label={`Valeur ${v} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-2 w-1.5 rounded-[1px]" style={{ background: i <= v ? "var(--color-brass)" : dark ? "rgba(36,32,26,0.2)" : "var(--color-line-strong)" }} />
      ))}
    </span>
  );
}
