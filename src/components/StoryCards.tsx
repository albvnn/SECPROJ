"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { MISSION_IMPORTANCE, MISSION_RESULTS, OUTCOMES, formatEuros } from "@/lib/game/rules";
import type { CheckOutcome, GaugeShift, MissionResult, StoryCard, StoryDoc } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { RankBadge } from "./ui";

/* ------------------------------------------------------------------ */
/* Petits outils                                                       */
/* ------------------------------------------------------------------ */

/** Un nombre qui défile jusqu'à sa valeur (seulement en direct). */
function useCountUp(target: number, animate: boolean, ms = 900): number {
  const [value, setValue] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setValue(target * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, ms]);
  return value;
}

/** Révèle progressivement `count` éléments (un toutes les `ms` millisecondes). */
function useReveal(count: number, animate: boolean, ms: number, delay = 0): number {
  const [shown, setShown] = useState(animate ? 0 : count);
  useEffect(() => {
    if (!animate) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      i += 1;
      setShown(i);
      if (i < count) timer = setTimeout(next, ms);
    };
    timer = setTimeout(next, delay || ms);
    return () => clearTimeout(timer);
  }, [count, animate, ms, delay]);
  return shown;
}

const fmt = (n: number, unit?: string) => {
  const r = Math.round(n * 10) / 10;
  const abs = Math.abs(r).toLocaleString("fr-FR");
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${abs}${unit ? ` ${unit}` : ""}`;
};

function Shell({ accent, children, className = "" }: { accent: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`animate-rise my-6 overflow-hidden rounded-sm border bg-panel/90 font-sans ${className}`} style={{ borderColor: tint(accent, 45) }}>
      {children}
    </div>
  );
}

function Kicker({ accent, children, right }: { accent: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold tracking-[0.22em] uppercase" style={{ background: tint(accent, 12), color: accent }}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {right && <span className="shrink-0 tracking-[0.12em] text-ivory/60">{right}</span>}
    </div>
  );
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase hover:text-ivory" aria-expanded={open}>
      {open ? "▾" : "▸"} {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cartes du jeu                                                       */
/* ------------------------------------------------------------------ */

export function StoryCardView({ card, animate = false }: { card: StoryCard; animate?: boolean }) {
  switch (card.type) {
    case "semaine":
      return <WeekCard card={card} animate={animate} />;
    case "briefing":
      return <BriefingCard card={card} animate={animate} />;
    case "etape":
      return <StepCard card={card} animate={animate} />;
    case "bilan":
      return <DebriefCard card={card} animate={animate} />;
    case "promotion":
      return <PromotionCard card={card} animate={animate} />;
  }
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function WeekCard({ card, animate }: { card: Extract<StoryCard, { type: "semaine" }>; animate: boolean }) {
  const days = useReveal(7, animate, 110);
  const slots = useReveal(card.plan.length, animate, 260, 900);
  const [open, setOpen] = useState(false);
  const accent = "var(--color-brass)";
  return (
    <Shell accent={accent}>
      <Kicker accent={accent} right={card.dateLabel}>
        Semaine · jour {card.fromDay} → {card.toDay}
      </Kicker>
      <div className="px-4 pt-3 pb-4">
        <div className="flex gap-1" aria-hidden>
          {DAY_NAMES.map((d, i) => (
            <div key={d} className="flex-1 text-center">
              <div className="h-1.5 rounded-full transition-colors duration-300" style={{ background: i < days ? accent : "var(--hairline)" }} />
              <span className={`mt-1 block text-[9px] tracking-wider uppercase ${i < days ? "text-muted" : "text-faint/50"}`}>{d}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {card.plan.map((p, i) => (
            <div
              key={i}
              className="rounded-sm border border-line bg-night/60 px-3 py-2 transition-all duration-500"
              style={{ opacity: i < slots ? 1 : 0, transform: i < slots ? "none" : "translateY(6px)" }}
            >
              <p className="text-sm">
                <span className="mr-1.5 text-brass">{p.icon}</span>
                {p.label}
              </p>
              {p.detail && <p className="truncate text-[11px] text-muted">{p.detail}</p>}
            </div>
          ))}
        </div>
        {card.deltas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.deltas.map((d) => (
              <Delta key={d.label} label={d.label} value={d.value} unit={d.unit} good={d.good} animate={animate} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {card.lines.length > 0 ? <Toggle open={open} onClick={() => setOpen((o) => !o)} label={`Détail de la semaine (${card.lines.length})`} /> : <span />}
          {card.event && <span className="text-[10px] font-semibold tracking-[0.15em] text-partial uppercase">Un événement t'attend ↓</span>}
        </div>
        {open && (
          <ul className="animate-rise mt-2 space-y-1 border-t border-line pt-2 text-xs text-muted">
            {card.lines.map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function Delta({ label, value, unit, good, animate }: { label: string; value: number; unit?: string; good: boolean; animate: boolean }) {
  const v = useCountUp(value, animate);
  const color = good ? "var(--color-success)" : "var(--color-fail)";
  return (
    <span className="rounded-sm border px-2 py-0.5 text-[11px]" style={{ borderColor: tint(color, 40), color }}>
      {label} <span className="font-mono">{fmt(unit === "€" ? Math.round(v) : v, unit)}</span>
    </span>
  );
}

const IMPORTANCE_COLOR: Record<string, string> = {
  locale: "var(--color-muted)",
  regionale: "var(--pole-esprit)",
  continentale: "var(--color-partial)",
  mondiale: "var(--color-fail)",
};

function BriefingCard({ card, animate }: { card: Extract<StoryCard, { type: "briefing" }>; animate: boolean }) {
  const [open, setOpen] = useState(animate);
  const accent = IMPORTANCE_COLOR[card.importance];
  return (
    <div className="animate-rise paper relative my-6 overflow-hidden rounded-sm font-sans text-paper-ink">
      <div className="flex items-center justify-between border-b border-paper-ink/15 px-5 py-2 font-typewriter text-[11px] tracking-[0.25em] uppercase">
        <span>Ordre de mission</span>
        <span style={{ color: accent === "var(--color-muted)" ? undefined : accent }}>
          {card.kind === "jeunesse" ? "Opération Jeunesse" : MISSION_IMPORTANCE[card.importance].label}
        </span>
      </div>
      <div className="relative px-5 pt-4 pb-5">
        <span className={`stamp pointer-events-none absolute top-3 right-4 px-2 py-0.5 text-sm ${animate ? "animate-stamp" : ""}`}>Confidentiel</span>
        <p className="pr-28 font-serif text-3xl leading-tight">{card.name}</p>
        <p className="mt-0.5 font-typewriter text-xs opacity-70">
          {card.city}
          {card.country ? `, ${card.country}` : ""}
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-1" aria-label="Étapes prévues">
          {card.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-1" title={s.title}>
              <span
                className={`grid h-6 min-w-6 place-items-center rounded-sm border px-1 font-mono text-[10px] ${s.secondary ? "border-dashed" : ""}`}
                style={{ borderColor: s.key ? "var(--color-stamp)" : "rgba(36,32,26,0.35)", color: s.key ? "var(--color-stamp)" : undefined }}
              >
                {s.dilemma ? "?" : s.key ? "★" : s.secondary ? "◇" : i + 1}
                {s.fork && <sup className="ml-px">⑂</sup>}
              </span>
              {i < card.steps.length - 1 && <span className="h-px w-2 bg-paper-ink/30" />}
            </li>
          ))}
        </ol>
        {!open ? (
          <button onClick={() => setOpen(true)} className="mt-4 font-typewriter text-xs tracking-[0.15em] uppercase underline-offset-4 hover:underline">
            ▸ Ouvrir le dossier
          </button>
        ) : (
          <div className="animate-rise mt-4 grid gap-x-6 gap-y-2 font-typewriter text-[13px] leading-snug sm:grid-cols-2">
            <Field label="Objectif">{card.objective}</Field>
            <Field label="Cible">{card.target}</Field>
            <Field label="Adversaire">{card.faction}</Field>
            <Field label="Couverture">{card.cover}</Field>
            <Field label="Équipe">{card.team.length ? card.team.join(", ") : "Seul."}</Field>
            {card.notes.length > 0 && (
              <Field label="Logistique">
                {card.notes.map((n, i) => (
                  <span key={i} className="block">
                    {n}
                  </span>
                ))}
              </Field>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] uppercase opacity-60">{label}</p>
      <p>{children}</p>
    </div>
  );
}

const OUTCOME_COLOR: Record<CheckOutcome | "choix", string> = {
  reussite_critique: "var(--color-brass-soft)",
  reussite: "var(--color-success)",
  reussite_partielle: "var(--color-partial)",
  echec: "var(--color-fail)",
  echec_critique: "var(--color-stamp)",
  choix: "var(--color-brass)",
};

function StepCard({ card, animate }: { card: Extract<StoryCard, { type: "etape" }>; animate: boolean }) {
  const color = OUTCOME_COLOR[card.outcome];
  return (
    <Shell accent={color} className="!my-4">
      <Kicker accent={color} right={card.outcome === "choix" ? "Décision" : OUTCOMES[card.outcome].label}>
        Étape {card.step}/{card.steps} · {card.title}
      </Kicker>
      <div className="px-4 py-3">
        {card.approach && <p className="text-sm text-ivory/90">{card.approach}</p>}
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {card.gauges.map((g) => (
            <GaugeDelta key={g.label} g={g} animate={animate} />
          ))}
        </div>
        {card.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
            {card.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function GaugeDelta({ g, animate }: { g: GaugeShift; animate: boolean }) {
  const [v, setV] = useState(animate ? g.before : g.after);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setV(g.after), 250);
    return () => clearTimeout(t);
  }, [animate, g.after]);
  const max = g.max ?? 100;
  const d = g.after - g.before;
  const worse = g.bad ? d > 0 : d < 0;
  const color = d === 0 ? "var(--color-muted)" : worse ? "var(--color-fail)" : "var(--color-success)";
  return (
    <div>
      <p className="flex items-baseline justify-between text-[10px] tracking-[0.15em] text-faint uppercase">
        {g.label}
        <span className="font-mono normal-case" style={{ color }}>
          {g.after}
          {d !== 0 && <span className="ml-1">({fmt(d)})</span>}
        </span>
      </p>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${(Math.max(g.before, g.after) / max) * 100}%`, background: color }} />
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${(v / max) * 100}%`, background: g.bad ? "var(--color-fail)" : "var(--color-brass)" }} />
      </div>
    </div>
  );
}

const RESULT_COLOR: Record<MissionResult, string> = {
  eclatant: "var(--color-brass-soft)",
  reussite: "var(--color-success)",
  partiel: "var(--color-partial)",
  echec: "var(--color-fail)",
};

function DebriefCard({ card, animate }: { card: Extract<StoryCard, { type: "bilan" }>; animate: boolean }) {
  const color = RESULT_COLOR[card.result];
  const merit = useCountUp(card.merit, animate, 1200);
  const bonus = useCountUp(card.bonus, animate, 1200);
  const [open, setOpen] = useState(animate);
  return (
    <Shell accent={color}>
      <Kicker accent={color}>Débriefing · {card.name}</Kicker>
      <div className="grid items-center gap-4 px-4 py-4 sm:grid-cols-[auto_1fr]">
        <div className="grid place-items-center px-2 py-1">
          <span
            className={`inline-block border-[3px] border-double px-3 py-1 font-typewriter text-xl tracking-[0.2em] uppercase ${animate ? "animate-stamp" : ""}`}
            style={{ borderColor: color, color, transform: "rotate(-8deg)" }}
          >
            {MISSION_RESULTS[card.result].label}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {card.merit > 0 && <Stat label="Mérite" value={`+${(Math.round(merit * 10) / 10).toLocaleString("fr-FR")}`} color={color} />}
          {card.bonus > 0 && <Stat label="Prime" value={formatEuros(Math.round(bonus))} color="var(--color-success)" />}
          <Stat label="Repos" value={`${Math.ceil(card.restDays / 7)} sem.`} color="var(--color-muted)" />
        </div>
      </div>
      {card.arrested && (
        <div className="flex items-center gap-3 border-t border-fail/40 bg-fail/[0.08] px-4 py-2.5">
          <span className={`inline-block border-2 border-fail px-2 font-typewriter text-sm tracking-[0.2em] text-fail uppercase ${animate ? "animate-stamp" : ""}`} style={{ transform: "rotate(-4deg)" }}>
            Détenu
          </span>
          <p className="text-xs text-ivory/85">Arrêté par {card.arrested}. Ta semaine se jouera désormais en cellule.</p>
        </div>
      )}
      {card.lines.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <Toggle open={open} onClick={() => setOpen((o) => !o)} label="Rapport de la Direction" />
          {open && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-ivory/80">
              {card.lines.map((l, i) => (
                <li key={i}>· {l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="font-mono text-2xl leading-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function PromotionCard({ card, animate }: { card: Extract<StoryCard, { type: "promotion" }>; animate: boolean }) {
  const accent = "var(--color-brass)";
  return (
    <div className={`animate-rise relative my-8 overflow-hidden rounded-sm border px-5 py-6 text-center font-sans ${animate ? "animate-shine" : ""}`} style={{ borderColor: tint(accent, 55), background: `radial-gradient(ellipse at 50% 0%, ${tint(accent, 18)}, transparent 70%)` }}>
      <p className="label" style={{ color: accent }}>
        Nouveau grade
      </p>
      <RankBadge rank={card.rank} className={`mx-auto mt-3 h-16 w-14 ${animate ? "animate-stamp" : ""}`} />
      <p className="mt-3 font-serif text-4xl">{card.title}</p>
      <p className="mt-1 text-sm text-muted">{card.subtitle}</p>
      {card.lines.length > 0 && (
        <ul className="mx-auto mt-4 max-w-md space-y-0.5 text-xs text-ivory/80">
          {card.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pièces du narrateur                                                 */
/* ------------------------------------------------------------------ */

/** Texte avec des ||détails|| à dévoiler d'un clic. */
function Detailed({ text, onReveal }: { text: string; onReveal?: () => void }) {
  const parts = useMemo(() => text.split(/\|\|(.+?)\|\|/g), [text]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 0 ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <span
            key={i}
            role="button"
            tabIndex={0}
            title={revealed.has(i) ? undefined : "Regarder de plus près"}
            onClick={() => {
              if (revealed.has(i)) return;
              setRevealed((s) => new Set(s).add(i));
              onReveal?.();
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !revealed.has(i)) {
                e.preventDefault();
                setRevealed((s) => new Set(s).add(i));
                onReveal?.();
              }
            }}
            className={`hidden-detail ${revealed.has(i) ? "revealed" : ""}`}
          >
            {p}
          </span>
        ),
      )}
    </>
  );
}

const countDetails = (text: string) => (text.match(/\|\|(.+?)\|\|/g) ?? []).length;

function useDetails(text: string) {
  const total = countDetails(text);
  const [found, setFound] = useState(0);
  return {
    onReveal: () => setFound((f) => f + 1),
    hint: total ? (found >= total ? "Tout est relevé." : `Des passages méritent un second regard (${found}/${total}) : clique dessus.`) : "",
  };
}

export function StoryDocView({ doc, animate = false }: { doc: StoryDoc; animate?: boolean }) {
  switch (doc.type) {
    case "message":
      return <MessageDoc doc={doc} animate={animate} />;
    case "presse":
      return <PressDoc doc={doc} />;
    case "chiffre":
      return <CipherDoc doc={doc} animate={animate} />;
    case "photo":
      return <PhotoDoc doc={doc} animate={animate} />;
    default:
      return <LetterDoc doc={doc} />;
  }
}

function MessageDoc({ doc, animate }: { doc: StoryDoc; animate: boolean }) {
  const messages = doc.messages?.length ? doc.messages : [{ de: doc.de ?? "?", texte: doc.contenu }];
  const shown = useReveal(messages.length, animate, 1100, 500);
  const typing = animate && shown < messages.length;
  const mine = (de: string) => /^moi$/i.test(de.trim());
  return (
    <div className="animate-rise mx-auto my-6 max-w-sm overflow-hidden rounded-2xl border border-line-strong bg-night font-sans shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-line text-xs">{(doc.de ?? messages.find((m) => !mine(m.de))?.de ?? "?").slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate text-sm">{doc.de ?? doc.titre}</p>
          <p className="truncate text-[10px] text-faint">{doc.date ?? doc.titre}</p>
        </div>
        <span className="ml-auto text-[10px] text-faint">🔒</span>
      </div>
      <div className="space-y-2 px-3 py-3">
        {messages.slice(0, shown).map((m, i) => (
          <div key={i} className={`animate-rise flex ${mine(m.de) ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-snug ${mine(m.de) ? "rounded-br-sm bg-brass/25 text-ivory" : "rounded-bl-sm bg-panel-2 text-ivory/90"}`}>
              {!mine(m.de) && messages.some((x) => !mine(x.de) && x.de !== m.de) && <span className="block text-[10px] text-brass">{m.de}</span>}
              <Detailed text={m.texte} />
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex gap-1 px-2 py-1" aria-label="écrit…">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LetterDoc({ doc }: { doc: StoryDoc }) {
  const { onReveal, hint } = useDetails(doc.contenu);
  return (
    <div className="animate-rise paper relative mx-auto my-6 max-w-lg rotate-[-0.6deg] rounded-sm px-6 py-5 font-typewriter text-[14px] leading-relaxed">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-paper-ink/20 pb-2 text-[11px] tracking-[0.2em] uppercase">
        <span className="truncate">{doc.titre}</span>
        {doc.date && <span className="shrink-0 opacity-60">{doc.date}</span>}
      </div>
      <p className="whitespace-pre-line">
        <Detailed text={doc.contenu} onReveal={onReveal} />
      </p>
      {doc.de && <p className="mt-4 text-right italic">— {doc.de}</p>}
      {hint && <p className="mt-3 font-sans text-[10px] tracking-wide text-paper-ink/60">{hint}</p>}
    </div>
  );
}

function PressDoc({ doc }: { doc: StoryDoc }) {
  const { onReveal, hint } = useDetails(doc.contenu);
  return (
    <div className="animate-rise paper mx-auto my-6 max-w-lg rotate-[0.5deg] rounded-[1px] px-6 py-5" style={{ filter: "saturate(0.6)" }}>
      <div className="flex items-baseline justify-between border-b-2 border-double border-paper-ink/60 pb-1">
        <span className="font-serif text-lg font-bold tracking-wide uppercase">{doc.de ?? "Dépêche"}</span>
        {doc.date && <span className="font-mono text-[10px] opacity-60">{doc.date}</span>}
      </div>
      <p className="mt-3 font-serif text-2xl leading-tight font-bold">{doc.titre}</p>
      <p className="mt-2 font-serif text-[15px] leading-snug text-paper-ink/90 [column-gap:1.5rem] sm:columns-2">
        <Detailed text={doc.contenu} onReveal={onReveal} />
      </p>
      {hint && <p className="mt-3 font-sans text-[10px] tracking-wide text-paper-ink/60">{hint}</p>}
    </div>
  );
}

const GLYPHS = "ΔΣΞΨΩ#%&@7349ЖЯ§¤∆◊";

function CipherDoc({ doc, animate }: { doc: StoryDoc; animate: boolean }) {
  const clear = doc.contenu.replace(/\|\|/g, "");
  const [state, setState] = useState<"chiffre" | "decode" | "clair">(animate ? "chiffre" : "clair");
  const [progress, setProgress] = useState(0);
  const seed = useMemo(() => Array.from(clear, (_, i) => GLYPHS[(i * 7 + clear.length) % GLYPHS.length]), [clear]);
  useEffect(() => {
    if (state !== "decode") return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 1800);
      setProgress(k);
      if (k < 1) raf = requestAnimationFrame(step);
      else setState("clair");
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state]);
  const shownText =
    state === "clair"
      ? clear
      : Array.from(clear, (ch, i) => (ch === " " || ch === "\n" ? ch : state === "decode" && i / clear.length < progress ? ch : seed[i])).join("");
  return (
    <div className="animate-rise mx-auto my-6 max-w-lg overflow-hidden rounded-sm border border-line-strong bg-night font-mono">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[10px] tracking-[0.2em] text-muted uppercase">
        <span>Message chiffré · {doc.titre}</span>
        {doc.de && <span>{doc.de}</span>}
      </div>
      <p className={`px-4 py-4 text-sm leading-relaxed whitespace-pre-line ${state === "clair" ? "text-ivory" : "text-success/80"}`} aria-live="polite">
        {shownText}
      </p>
      {state === "chiffre" && (
        <div className="border-t border-line px-4 py-2.5 text-right">
          <button onClick={() => setState("decode")} className="btn btn-ghost px-3 py-1.5 text-[10px]">
            ⌗ Déchiffrer
          </button>
        </div>
      )}
    </div>
  );
}

function PhotoDoc({ doc, animate }: { doc: StoryDoc; animate: boolean }) {
  const [back, setBack] = useState(false);
  return (
    <div className="animate-rise mx-auto my-6 w-full max-w-xs rotate-[1.5deg]">
      <div className="bg-[#f4f1ea] p-3 pb-2 text-[#2a2620] shadow-2xl">
        {!back ? (
          <>
            <div className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#3b3a36] to-[#141412] p-4 ${animate ? "animate-develop" : ""}`}>
              <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: "repeating-radial-gradient(circle at 30% 20%, #fff 0 1px, transparent 1px 3px)" }} />
              <p className="relative font-serif text-[15px] leading-snug text-[#e9e4d8]/90 italic">
                <Detailed text={doc.contenu} />
              </p>
            </div>
            <p className="mt-2 text-center font-typewriter text-sm">{doc.titre}</p>
          </>
        ) : (
          <div className="grid aspect-[4/3] place-items-center p-4 text-center">
            <p className="font-serif text-lg italic">{doc.legende ?? "Rien au dos."}</p>
            {doc.date && <p className="mt-2 font-typewriter text-xs opacity-60">{doc.date}</p>}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] opacity-70">
          <span>{doc.de ?? ""}</span>
          <button onClick={() => setBack((b) => !b)} className="font-sans tracking-wide uppercase hover:underline">
            ↻ {back ? "Recto" : "Retourner"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Libellé et icône d'une pièce dans les listes. */
export const DOC_LABELS: Record<StoryDoc["type"], { label: string; icon: string }> = {
  message: { label: "Message", icon: "✉" },
  lettre: { label: "Document", icon: "✎" },
  presse: { label: "Presse", icon: "▤" },
  chiffre: { label: "Chiffré", icon: "⌗" },
  photo: { label: "Photo", icon: "◫" },
};
