"use client";

import { useState } from "react";
import { clearance, clearanceDef } from "@/lib/game/intel";
import { SOURCE_KINDS, TOPICS, fileRequest, gradeLabel, questionsFor, sourceOffers, targetLabel } from "@/lib/game/sources";
import type { GameState, IntelRequestKind, SourceKind } from "@/lib/game/types";

/** Un bloc d'information que ton accréditation ne permet pas de lire. */
export function Classified({ need, children, action }: { need: number; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-sm border border-dashed border-line-strong bg-night/40 px-3 py-2.5">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--color-ivory) 0 2px, transparent 2px 9px)" }} />
      <p className="relative flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-sm border border-stamp/60 px-1.5 font-typewriter text-[10px] tracking-[0.2em] text-fail uppercase">Classifié</span>
        <span className="min-w-0 flex-1">{children ?? `Accréditation ${clearanceDef(need).label} requise.`}</span>
        {action}
      </p>
    </div>
  );
}

/** Demander un renseignement : le bouton ouvre la liste des sources qui pourraient répondre. */
export function RequestButton({
  state,
  kind,
  target,
  onChange,
  label,
}: {
  state: GameState;
  kind: IntelRequestKind;
  target: string;
  onChange?: (s: GameState) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pending = state.knowledge.requests.find((r) => r.kind === kind && r.target === target);
  if (pending)
    return (
      <span className="text-[10px] tracking-[0.12em] whitespace-nowrap text-brass-soft uppercase" title={`${pending.sourceLabel} · réponse au jour ${pending.readyDay}`}>
        ⌛ {pending.sourceLabel.split(" ")[0]} · J{pending.readyDay}
      </span>
    );
  const offers = sourceOffers(state, kind, target);
  const available = offers.filter((o) => !o.blocker).length;
  return (
    <span className="relative inline-flex">
      <button
        disabled={!onChange || !offers.length}
        title={available ? `${TOPICS[kind].gives} ${available} source${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}.` : offers[0]?.blocker ?? "Personne ne peut répondre."}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors ${
          available ? "border-brass/50 text-brass-soft hover:bg-brass hover:text-ink" : "border-line text-faint"
        }`}
      >
        ⌕ {label ?? TOPICS[kind].label}
        {available > 1 ? <span className="ml-1 opacity-70">·{available}</span> : null}
      </button>
      {open && onChange && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 w-[22rem] max-w-[85vw] rounded-sm border border-line-strong bg-panel p-2 text-left shadow-2xl">
            <p className="px-1 pb-1.5 text-[10px] tracking-[0.15em] text-muted uppercase">
              {TOPICS[kind].label} · {targetLabel(state, kind, target)}
            </p>
            <SourceList state={state} kind={kind} target={target} onChange={(s) => (setOpen(false), onChange(s))} compact />
          </div>
        </>
      )}
    </span>
  );
}

/** Le marché du renseignement : toutes les sources qui peuvent répondre, comparées. */
export function SourceList({
  state,
  kind,
  target,
  onChange,
  compact = false,
}: {
  state: GameState;
  kind: IntelRequestKind;
  target: string;
  onChange: (s: GameState) => void;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const offers = sourceOffers(state, kind, target);
  const shown = compact ? offers.filter((o, i) => !o.blocker || i < 4).slice(0, 8) : offers;
  if (!offers.length) return <p className="px-1 text-xs text-faint">Personne, dans ton réseau, ne peut répondre à cette question.</p>;
  return (
    <div>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-0.5">
        {shown.map((o) => (
          <li key={`${o.source}:${o.ref ?? ""}`} className={`rounded-sm border px-2 py-1.5 ${o.blocker ? "border-line/60 opacity-55" : "border-line hover:border-line-strong"}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-4 shrink-0 text-center text-brass" title={SOURCE_KINDS[o.source].description}>
                {SOURCE_KINDS[o.source].icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-ivory/90">{o.label}</span>
                  <span className="shrink-0 font-mono text-[10px]" title={gradeLabel(o.grade)} style={{ color: GRADE_COLOR[o.grade[0]] }}>
                    {o.grade}
                  </span>
                </p>
                <p className="truncate text-[10px] text-faint">{o.detail}</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {o.costText} · {o.days} j{o.blocker ? <span className="text-fail"> · {o.blocker}</span> : null}
                </p>
              </div>
              {!o.blocker && (
                <button
                  onClick={() => {
                    try {
                      setError(null);
                      onChange(fileRequest(state, kind, target, { source: o.source, ref: o.ref }));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Impossible.");
                    }
                  }}
                  className="shrink-0 self-center rounded-sm bg-brass/90 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-ink uppercase hover:bg-brass-soft"
                >
                  Demander
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-[10px] text-fail">{error}</p>}
      <p className="mt-1.5 px-1 text-[10px] leading-snug text-faint">Cotation : A (sûre) à E (douteuse), 1 (confirmée) à 5 (improbable). Une source peu fiable peut se tromper, ou mentir.</p>
    </div>
  );
}

export const GRADE_COLOR: Record<string, string> = {
  A: "var(--color-success)",
  B: "var(--color-success)",
  C: "var(--color-partial)",
  D: "var(--color-fail)",
  E: "var(--color-fail)",
};

/** Le niveau d'accréditation, en pastille. */
export function ClearanceBadge({ state }: { state: GameState }) {
  const lvl = clearance(state);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-[10px] tracking-[0.15em] uppercase" title={clearanceDef(lvl).grants}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2 w-1 rounded-[1px] ${i <= lvl ? "bg-brass" : "bg-line-strong"}`} />
        ))}
      </span>
      {clearanceDef(lvl).label}
    </span>
  );
}

/** « Lui demander… » : les questions qu'une personne précise peut traiter, avec leur prix. */
export function AskPerson({ state, source, refId, onChange }: { state: GameState; source: SourceKind; refId: string; onChange?: (s: GameState) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = state.knowledge.requests.find((r) => r.source === source && r.sourceRef === refId);
  if (!onChange) return null;
  if (pending)
    return (
      <span className="text-[10px] tracking-[0.12em] text-brass-soft uppercase" title={`${TOPICS[pending.kind].label} — ${pending.label}`}>
        ⌛ réponse J{pending.readyDay}
      </span>
    );
  const questions = open ? questionsFor(state, source, refId) : [];
  return (
    <span className="relative inline-flex">
      <button onClick={() => setOpen((o) => !o)} className="text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline">
        ⌕ Lui demander…
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 w-80 max-w-[85vw] rounded-sm border border-line-strong bg-panel p-2 text-left shadow-2xl">
            {questions.length === 0 ? (
              <p className="px-1 text-xs text-muted">Rien qu'il puisse te dire en ce moment : il ne sait que ce qui se passe chez lui, et le lien doit être solide.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {questions.map((q) => {
                  const offer = sourceOffers(state, q.kind, q.target).find((o) => o.source === source && o.ref === refId)!;
                  return (
                    <li key={`${q.kind}:${q.target}`}>
                      <button
                        onClick={() => {
                          try {
                            setError(null);
                            onChange(fileRequest(state, q.kind, q.target, { source, ref: refId }));
                            setOpen(false);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Impossible.");
                          }
                        }}
                        className="w-full rounded-sm border border-line px-2 py-1 text-left hover:border-brass/60"
                      >
                        <span className="block truncate text-xs text-ivory/90">{q.label}</span>
                        <span className="text-[10px] text-muted">
                          {offer.costText} · {offer.days} j ·{" "}
                          <span style={{ color: GRADE_COLOR[offer.grade[0]] }} title={gradeLabel(offer.grade)}>
                            {offer.grade}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error && <p className="mt-1 text-[10px] text-fail">{error}</p>}
          </div>
        </>
      )}
    </span>
  );
}
