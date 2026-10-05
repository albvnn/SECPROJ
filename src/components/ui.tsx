import { RANKS } from "@/lib/game/rules";
import type { RankId } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";

/** Emblème du Concordat de Lucerne : trois anneaux entrelacés (les trois agences) autour d'un œil. */
export function Emblem({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="32" cy="32" r="30" strokeOpacity="0.35" />
      {[0, 120, 240].map((a) => (
        <circle key={a} cx="32" cy="22" r="13" transform={`rotate(${a} 32 32)`} strokeOpacity="0.85" />
      ))}
      <path d="M22 32 Q32 24 42 32 Q32 40 22 32 Z" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Commandement : des chevrons. Terrain (le Cercle) : des étoiles. */
const CHEVRONS: Partial<Record<RankId, number>> = { agent: 1, chef_station: 2, controleur: 3 };
const STARS: Partial<Record<RankId, number>> = { titulaire: 1, doyen: 2, directeur: 3 };

function star(cx: number, cy: number, r: number) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join(" L")} Z`;
}

/** Insigne de grade : un écusson, des chevrons pour le commandement, des étoiles pour le Cercle. */
export function RankBadge({ rank, className = "h-6 w-5" }: { rank: RankId; className?: string }) {
  const color = RANKS[rank].color;
  const shield = "M2 3 L18 3 L18 13 C18 18 14 21 10 23 C6 21 2 18 2 13 Z";
  if (rank === "prospect")
    return (
      <svg viewBox="0 0 20 24" className={className} fill="none" aria-hidden>
        <path d={shield} style={{ stroke: color }} strokeDasharray="2 2" strokeWidth="1.1" />
      </svg>
    );
  const chevrons = CHEVRONS[rank] ?? 0;
  const stars = STARS[rank] ?? 0;
  return (
    <svg viewBox="0 0 20 24" className={className} fill="none" aria-hidden>
      <path d={shield} style={{ stroke: color, fill: tint(color, 18) }} strokeWidth="1.2" />
      {rank === "aspirant" && <path d="M6 12 L14 12" style={{ stroke: color }} strokeWidth="1.6" strokeLinecap="round" />}
      {Array.from({ length: chevrons }, (_, i) => (
        <path
          key={i}
          d={`M5.5 ${8 + i * 4} L10 ${11.5 + i * 4} L14.5 ${8 + i * 4}`}
          style={{ stroke: color }}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {stars === 1 && <path d={star(10, 12, 4)} style={{ fill: color }} />}
      {stars === 2 && [6.6, 13.4].map((x) => <path key={x} d={star(x, 11, 3)} style={{ fill: color }} />)}
      {stars === 3 &&
        [
          [10, 8.2],
          [6.4, 13.6],
          [13.6, 13.6],
        ].map(([x, y]) => <path key={x + "-" + y} d={star(x, y, 2.7)} style={{ fill: color }} />)}
    </svg>
  );
}

export function Bar({
  value,
  max,
  color,
  label,
  display,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  display?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-xs text-ivory/80">{display ?? `${value}/${max}`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Pips({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  return (
    <span className={`inline-flex gap-[3px] ${className}`} aria-label={`${value} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rotate-45 ${i < value ? "bg-brass" : "border border-line-strong"}`}
        />
      ))}
    </span>
  );
}

export function Divider({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-brass/70">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-brass/40" />
      {children ?? <span className="text-xs">◆</span>}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-brass/40" />
    </div>
  );
}
