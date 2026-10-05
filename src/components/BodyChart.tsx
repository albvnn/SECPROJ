"use client";

import { useState } from "react";
import { bodyMod, bodyStats, initialBody, injuryZone, muscleCap } from "@/lib/game/body";
import { currentAge } from "@/lib/game/engine";
import { SKILLS } from "@/lib/game/rules";
import type { BodyZone, GameState, SkillId } from "@/lib/game/types";

type Pt = [number, number];

/** Une courbe lisse et fermée qui passe par tous les points (Catmull-Rom → Bézier). */
function smooth(points: Pt[], closed = true): string {
  const n = points.length;
  const p = (i: number) => points[(i + n) % n];
  let d = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? `${d}Z` : d;
}

const W = 170;
const BOTTOM = 292;
const SCALE_MAX = 200; // cm

interface Mark {
  zone: BodyZone;
  kind: "blessure" | "sequelle" | "cicatrice";
  name: string;
  detail: string;
}

/**
 * La planche anatomique : la silhouette suit la taille, la musculature et la masse grasse ;
 * les blessures en cours battent en rouge, les séquelles sont marquées, les cicatrices restent.
 */
export function BodyChart({ state }: { state: GameState }) {
  const c = state.character;
  const age = currentAge(state);
  const body = c.body ?? initialBody(c);
  const s = bodyStats(c, age);
  const fille = c.identity.gender === "fille";
  const [picked, setPicked] = useState<number | null>(null);

  // Géométrie : tout se règle en « têtes » (une silhouette fait 7,5 têtes).
  const H = (s.height / SCALE_MAX) * 270;
  const top = BOTTOM - H;
  const hu = H / 7.5;
  const cx = 100;
  const m = body.muscle / 100;
  const f = body.fat / 100;
  const sw = hu * (0.78 + m * 0.42 - (fille ? 0.1 : 0)); // épaules
  const ww = hu * (0.38 + f * 0.75 + m * 0.08 - (fille ? 0.04 : 0)); // taille
  const hw = hu * (0.52 + f * 0.6 + (fille ? 0.13 : 0)); // hanches
  const tw = hu * (0.2 + m * 0.12 + f * 0.25); // cuisses
  const aw = hu * (0.11 + m * 0.11 + f * 0.12); // bras
  const neck = hu * (0.15 + m * 0.08);
  const sy = top + hu * 1.35;
  const wy = top + hu * 3.0;
  const hy = top + hu * 3.75;
  const crotch = top + hu * 4.15;
  const knee = top + hu * 5.75;
  const ankle = BOTTOM - hu * 0.2;

  const half: Pt[] = [
    [cx + neck, top + hu * 1.05],
    [cx + sw * 0.86, sy - hu * 0.1],
    [cx + sw, sy + hu * 0.25],
    [cx + sw * 0.8, sy + hu * 0.75],
    [cx + sw * 0.78 + (fille ? hu * 0.06 : 0), top + hu * 2.15],
    [cx + ww, wy],
    [cx + hw, hy],
    [cx + hw * 0.62 + tw * 0.75, top + hu * 4.7],
    [cx + hu * 0.22 + tw * 0.55, knee],
    [cx + hu * 0.22 + tw * 0.5, top + hu * 6.45],
    [cx + hu * 0.2, ankle],
    [cx + hu * 0.34, BOTTOM],
    [cx + hu * 0.11, BOTTOM],
    [cx + hu * 0.12, ankle],
    [cx + hu * 0.12, knee],
    [cx + hu * 0.06, crotch],
  ];
  const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  const torso = smooth([...half, [cx, crotch + hu * 0.02], ...[...half].reverse().map(mirror)]);
  const arm = (dir: 1 | -1) => {
    const x = (v: number) => cx + dir * v;
    return smooth([
      [x(sw * 0.98), sy + hu * 0.05],
      [x(sw + aw * 1.1), sy + hu * 0.45],
      [x(sw + hu * 0.12 + aw), top + hu * 2.9],
      [x(sw + hu * 0.22 + aw * 0.6), top + hu * 3.95],
      [x(sw + hu * 0.26 + aw * 0.3), top + hu * 4.55],
      [x(sw + hu * 0.12), top + hu * 4.5],
      [x(sw + hu * 0.12 - aw * 0.1), top + hu * 3.95],
      [x(sw + hu * 0.02 - aw * 0.2), top + hu * 2.95],
      [x(sw * 0.82), sy + hu * 0.8],
    ]);
  };

  const zone = (z: BodyZone): Pt => {
    const side = z.endsWith("_d") ? -1 : 1; // le côté droit du personnage est à gauche de la planche
    if (z === "tete") return [cx + hu * 0.12, top + hu * 0.45];
    if (z === "torse") return [cx - hu * 0.3, top + hu * 2.1];
    if (z === "abdomen") return [cx + hu * 0.1, top + hu * 3.05];
    if (z.startsWith("bras")) return [cx + side * (sw + hu * 0.12 + aw * 0.5), top + hu * 2.7];
    if (z.startsWith("main")) return [cx + side * (sw + hu * 0.2), top + hu * 4.3];
    return [cx + side * (hu * 0.15 + tw * 0.3), knee];
  };

  const marks: Mark[] = [
    ...(c.injuries ?? []).map(
      (i): Mark => ({
        zone: injuryZone(i),
        kind: i.healDay === undefined ? "sequelle" : "blessure",
        name: i.name,
        detail: `${Object.entries(i.malus)
          .map(([k, v]) => `${SKILLS[k as SkillId]?.label ?? k} ${v}`)
          .join(" · ")}${i.healDay !== undefined ? ` · guérie dans ${Math.max(0, i.healDay - state.world.day)} j` : " · à vie"}`,
      }),
    ),
    ...body.scars.map((x): Mark => ({ zone: x.zone, kind: "cicatrice", name: x.name, detail: `depuis le jour ${x.day}` })),
  ];
  const shown = picked !== null ? marks[picked] : undefined;
  const cap = muscleCap(c);
  const trend = (now: number, before: number | undefined) => (before === undefined || Math.abs(now - before) < 0.05 ? "" : now > before ? "↑" : "↓");
  const effects = (["force", "combat", "endurance", "athletisme", "vivacite"] as SkillId[])
    .map((k) => ({ k, mod: bodyMod(c, k) }))
    .filter((x) => x.mod);

  return (
    <div className="rounded-2xl bg-panel p-3 ring-1 ring-line">
      <div className="flex gap-2">
        <svg viewBox={`0 0 ${W} 300`} className="h-72 w-[9.5rem] shrink-0" aria-label="Silhouette">
          <defs>
            <linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--pole-corps)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--pole-corps)" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* La toise. */}
          {Array.from({ length: SCALE_MAX / 10 + 1 }, (_, i) => {
            const y = BOTTOM - (i * 10 * 270) / SCALE_MAX;
            return (
              <g key={i}>
                <line x1="18" x2={i % 5 === 0 ? 30 : 25} y1={y} y2={y} stroke="var(--color-line-strong)" strokeWidth="0.8" />
                {i % 5 === 0 && (
                  <text x="0" y={y + 3} fontSize="8" fill="var(--color-faint)" fontFamily="var(--font-mono)">
                    {i * 10}
                  </text>
                )}
              </g>
            );
          })}
          <line x1="18" x2="18" y1={BOTTOM - 270} y2={BOTTOM} stroke="var(--color-line-strong)" strokeWidth="0.8" />
          <line x1="18" x2={cx + sw + hu * 0.4} y1={top} y2={top} stroke="var(--color-brass)" strokeWidth="0.7" strokeDasharray="2 2" />
          <text x="34" y={top - 3} fontSize="8" fill="var(--color-brass)" fontFamily="var(--font-mono)">
            {s.height} cm
          </text>
          {/* La silhouette. */}
          <g stroke="var(--pole-corps)" strokeWidth="1.1" strokeLinejoin="round" className="transition-all duration-700">
            <path d={arm(1)} fill="url(#body-fill)" />
            <path d={arm(-1)} fill="url(#body-fill)" />
            <path d={torso} fill="url(#body-fill)" />
            <ellipse cx={cx} cy={top + hu * 0.5} rx={hu * 0.37} ry={hu * 0.5} fill="url(#body-fill)" />
          </g>
          {/* Les reliefs, quand il y a de quoi. */}
          {body.muscle >= 50 && (
            <g fill="none" stroke="var(--pole-corps)" strokeOpacity={Math.min(0.55, (body.muscle - 40) / 80)} strokeWidth="0.8" strokeLinecap="round">
              <path d={`M${cx - sw * 0.65},${top + hu * 1.95} Q${cx},${top + hu * 2.35} ${cx + sw * 0.65},${top + hu * 1.95}`} />
              <path d={`M${cx},${top + hu * 1.6} V${top + hu * 3.3}`} />
              {body.fat < (fille ? 24 : 16) &&
                [2.65, 2.95, 3.25].map((k) => <path key={k} d={`M${cx - hu * 0.22},${top + hu * k} H${cx + hu * 0.22}`} />)}
              <path d={`M${cx - sw},${sy + hu * 0.3} q${-aw * 0.6},${hu * 0.35} ${-aw * 0.2},${hu * 0.7}`} />
              <path d={`M${cx + sw},${sy + hu * 0.3} q${aw * 0.6},${hu * 0.35} ${aw * 0.2},${hu * 0.7}`} />
            </g>
          )}
          {/* Les marques. */}
          {marks.map((mk, i) => {
            const [x, y] = zone(mk.zone);
            const on = picked === i;
            return (
              <g key={i} className="cursor-pointer" onClick={() => setPicked(on ? null : i)}>
                <circle cx={x} cy={y} r="9" fill="transparent" />
                {mk.kind === "blessure" && (
                  <>
                    <circle cx={x} cy={y} r={3} fill="none" stroke="var(--color-fail)" strokeWidth="1.5" className="map-pulse" />
                    <circle cx={x} cy={y} r={on ? 4.5 : 3.5} fill="var(--color-fail)" />
                  </>
                )}
                {mk.kind === "sequelle" && <path d={`M${x - 4},${y - 4}L${x + 4},${y + 4}M${x + 4},${y - 4}L${x - 4},${y + 4}`} stroke="var(--color-partial)" strokeWidth={on ? 2.4 : 1.8} strokeLinecap="round" />}
                {mk.kind === "cicatrice" && (
                  <path d={`M${x - 6},${y + 1}L${x - 3},${y - 1}L${x},${y + 1}L${x + 3},${y - 1}L${x + 6},${y + 1}M${x - 4.5},${y - 3}V${y + 3}M${x - 1.5},${y - 3}V${y + 3}M${x + 1.5},${y - 3}V${y + 3}M${x + 4.5},${y - 3}V${y + 3}`} stroke="#d98f8a" strokeWidth={on ? 1.4 : 1} fill="none" strokeLinecap="round" />
                )}
              </g>
            );
          })}
        </svg>

        <dl className="min-w-0 flex-1 space-y-2 pt-1 text-xs">
          <Stat label="Taille" value={`${(s.height / 100).toFixed(2).replace(".", ",")} m`} />
          <Stat label="Poids" value={`${s.weight.toFixed(1).replace(".", ",")} kg`} sub={`IMC ${s.bmi.toFixed(1).replace(".", ",")}`} />
          <div>
            <dt className="flex justify-between text-[9px] tracking-[0.14em] text-muted uppercase">
              Musculature
              <span className="font-mono tracking-normal text-ivory/85">
                {s.muscle} {trend(body.muscle, body.prev?.muscle)}
              </span>
            </dt>
            <dd className="relative mt-1 h-1.5 rounded-full bg-line" title={`Potentiel ${cap} (pôle Corps)`}>
              <span className="block h-full rounded-full bg-[var(--pole-corps)] transition-all duration-700" style={{ width: `${s.muscle}%` }} />
              <span className="absolute -top-0.5 h-2.5 w-px bg-ivory/60" style={{ left: `${cap}%` }} />
            </dd>
            <p className="mt-0.5 text-[10px] text-faint capitalize">{s.build}</p>
          </div>
          <div>
            <dt className="flex justify-between text-[9px] tracking-[0.14em] text-muted uppercase">
              Masse grasse
              <span className="font-mono tracking-normal text-ivory/85">
                {s.fat.toFixed(1).replace(".", ",")} % {trend(body.fat, body.prev?.fat)}
              </span>
            </dt>
            <p className="mt-0.5 text-[10px] text-faint capitalize">{s.fatLabel}</p>
          </div>
          {effects.length > 0 && (
            <div className="border-t border-line pt-1.5">
              {effects.map(({ k, mod }) => (
                <p key={k} className={`text-[10px] ${mod!.value > 0 ? "text-success" : "text-fail"}`}>
                  {mod!.label} : {SKILLS[k].label} {mod!.value > 0 ? "+" : ""}
                  {mod!.value}
                </p>
              ))}
            </div>
          )}
        </dl>
      </div>
      {shown ? (
        <p className="animate-rise mt-1 rounded-lg bg-night/60 px-2.5 py-1.5 text-[11px]">
          <span className={shown.kind === "blessure" ? "text-fail" : shown.kind === "sequelle" ? "text-partial" : "text-[#d98f8a]"}>{shown.name}</span>
          <span className="text-muted"> — {shown.detail}</span>
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-faint">
          {marks.length ? "Touche une marque pour la lire." : "Aucune marque. Pour l'instant."} L'entraînement physique construit ; le repos, l'inaction et les blessures défont.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[9px] tracking-[0.14em] text-muted uppercase">{label}</dt>
      <dd className="font-mono text-sm">
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-faint">{sub}</span>}
      </dd>
    </div>
  );
}
