"use client";

import { useEffect, useState } from "react";
import { tint } from "@/lib/ui/color";
import { ATTRIBUTES, DIFFICULTIES, OUTCOMES, SKILLS } from "@/lib/game/rules";
import type { CheckOutcome, CheckResult } from "@/lib/game/types";
import { SkillGlyph } from "./glyphs";

const OUTCOME_COLOR: Record<CheckOutcome, string> = {
  reussite_critique: "var(--color-brass-soft)",
  reussite: "var(--color-success)",
  reussite_partielle: "var(--color-partial)",
  echec: "var(--color-fail)",
  echec_critique: "var(--color-stamp)",
};

const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]],
};

function Die({ value, color, spinning }: { value: number; color: string; spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-9 w-9 ${spinning ? "animate-tumble" : ""}`} aria-label={`${value}`}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="4" strokeWidth="1.3" style={{ fill: "var(--color-night)", stroke: color }} />
      {PIPS[value].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.9" style={{ fill: color }} />
      ))}
    </svg>
  );
}

export function DiceCard({ check, animate = false }: { check: CheckResult; animate?: boolean }) {
  const [faces, setFaces] = useState<[number, number]>(animate ? [1, 1] : check.dice);
  const [settled, setSettled] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const roll = () => 1 + Math.floor(Math.random() * 6);
    const tick = setInterval(() => setFaces([roll(), roll()]), 70);
    const stop = setTimeout(() => {
      clearInterval(tick);
      setFaces(check.dice);
      setSettled(true);
    }, 800);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [animate, check.dice]);

  const pole = ATTRIBUTES[SKILLS[check.skill].attribute];
  const outcomeColor = OUTCOME_COLOR[check.outcome];
  const frame = check.red ? "var(--color-stamp)" : tint("var(--color-ivory)", 55);

  return (
    <div
      className="animate-rise my-5 overflow-hidden rounded-sm border bg-panel/85 font-sans"
      style={{ borderColor: frame, boxShadow: check.red ? "0 0 0 1px rgba(179,38,30,0.25), 0 0 24px -8px rgba(179,38,30,0.5)" : undefined }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[0.22em] uppercase" style={{ background: tint(pole.color, 13), color: pole.color }}>
        <SkillGlyph skill={check.skill} className="h-4 w-4" />
        <span>{SKILLS[check.skill].label}</span>
        <span className="text-faint">·</span>
        <span className="text-ivory/70">
          {DIFFICULTIES[check.difficulty].label} {check.dc}
        </span>
        <span className="ml-auto" style={{ color: check.red ? "var(--color-fail)" : tint("var(--color-ivory)", 70) }}>
          {check.red ? "Jet rouge" : "Jet blanc"}
        </span>
      </div>
      <div className="flex items-center gap-4 px-3 py-3">
        <div className="flex shrink-0 gap-1.5">
          <Die value={faces[0]} color={settled ? pole.color : "var(--color-line-strong)"} spinning={animate && !settled} />
          <Die value={faces[1]} color={settled ? pole.color : "var(--color-line-strong)"} spinning={animate && !settled} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ivory/90" title={check.reason}>
            {check.reason}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted transition-opacity duration-300" style={{ opacity: settled ? 1 : 0 }}>
            {check.dice[0]}+{check.dice[1]} {check.bonus >= 0 ? "+" : "−"} {Math.abs(check.bonus)} ={" "}
            <span className="text-ivory">{check.total}</span> · {check.bonusBreakdown.join(" · ")}
          </p>
        </div>
        <span
          className="shrink-0 text-right text-xs font-bold tracking-[0.12em] uppercase transition-opacity duration-300"
          style={{ color: outcomeColor, opacity: settled ? 1 : 0 }}
        >
          {OUTCOMES[check.outcome].label}
        </span>
      </div>
    </div>
  );
}
