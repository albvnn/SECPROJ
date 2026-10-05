import { ATTRIBUTES, SKILLS } from "@/lib/game/rules";
import type { AttributeId, SkillId } from "@/lib/game/types";

/*
 * Direction artistique des glyphes :
 * - Esprit : traits fins, cercles et géométrie exacte (constructivisme).
 * - Âme    : courbes, croissants, spirales.
 * - Corps  : formes pleines, lourdes, massives.
 * - Geste  : traits nets, angles, mouvement.
 */

const SKILL_GLYPHS: Record<SkillId, React.ReactNode> = {
  // ESPRIT
  logique: (
    <g fill="none" strokeWidth="1.2">
      <path d="M12 5 L5 18 L19 18 Z" strokeOpacity="0.55" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
    </g>
  ),
  archives: (
    <g fill="none" strokeWidth="1.2">
      <path d="M5 4 V20" />
      <path d="M8 6 H19 M8 10 H16 M8 14 H18 M8 18 H13" />
    </g>
  ),
  machine: (
    <g fill="none" strokeWidth="1.2">
      <rect x="7" y="7" width="10" height="10" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" />
      <path d="M9 7 V3 M15 7 V3 M9 17 V21 M15 17 V21 M7 12 H3 M17 12 H21" />
    </g>
  ),
  babel: (
    <g fill="none" strokeWidth="1.2">
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
      <path d="M12 7.2 V16.8" strokeOpacity="0.5" />
    </g>
  ),
  medecine: (
    <g fill="none" strokeWidth="1.2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7 V17 M7 12 H17" />
    </g>
  ),
  tactique: (
    <g fill="none" strokeWidth="1.2">
      <path d="M4 8 H20 M4 16 H20 M8 4 V20 M16 4 V20" strokeOpacity="0.45" />
      <circle cx="18" cy="6" r="1.8" fill="currentColor" />
      <path d="M6 18 L16.5 7.5" strokeDasharray="2 1.5" />
    </g>
  ),
  // ÂME
  sangfroid: (
    <g fill="none" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M6 12 H18" />
      <path d="M9 15.5 H15" strokeOpacity="0.5" />
    </g>
  ),
  empathie: (
    <g fill="none" strokeWidth="1.5">
      <path d="M10 4 A8 8 0 0 0 10 20 A6 6 0 0 1 10 4 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M14 4 A8 8 0 0 1 14 20 A6 6 0 0 0 14 4 Z" fill="currentColor" fillOpacity="0.8" />
    </g>
  ),
  masque: (
    <g strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" fill="none" />
      <path d="M12 4 A8 8 0 0 0 12 20 Z" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.2" fill="currentColor" />
    </g>
  ),
  eloquence: (
    <g fill="none" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 8 Q7.5 4 12 8 T21 8" />
      <path d="M3 13 Q7.5 9 12 13 T21 13" strokeOpacity="0.7" />
      <path d="M5 18 Q8.5 15 12 18 T19 18" strokeOpacity="0.45" />
    </g>
  ),
  instinct: (
    <g fill="none" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 12 m0 0 a1.5 1.5 0 0 1 3 0 a3 3 0 0 1 -6 0 a4.5 4.5 0 0 1 9 0 a6 6 0 0 1 -12 0 a7.5 7.5 0 0 1 15 0" />
    </g>
  ),
  tenue: (
    <g strokeWidth="1.5">
      <path d="M12 3 L17 12 L12 21 L7 12 Z" fill="none" />
      <path d="M12 8.5 L14 12 L12 15.5 L10 12 Z" fill="currentColor" />
    </g>
  ),
  // CORPS
  endurance: (
    <g fill="currentColor">
      <rect x="9" y="3" width="6" height="15" />
      <rect x="5" y="18" width="14" height="3" />
    </g>
  ),
  force: (
    <g fill="currentColor">
      <path d="M12 3 L21 20 H3 Z" />
    </g>
  ),
  combat: (
    <g fill="currentColor">
      <path d="M4 7 L7 4 L20 17 L17 20 Z" />
      <path d="M17 4 L20 7 L7 20 L4 17 Z" fillOpacity="0.7" />
    </g>
  ),
  athletisme: (
    <g>
      <path d="M4 20 A9 9 0 0 1 17 8" fill="none" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="18.5" cy="6.5" r="3" fill="currentColor" />
    </g>
  ),
  tolerance: (
    <g>
      <rect x="4" y="4" width="16" height="16" fill="currentColor" />
      <path d="M13 4 L10 10 L14 13 L10 20" fill="none" style={{ stroke: "var(--glyph-bg)" }} strokeWidth="1.8" />
    </g>
  ),
  alerte: (
    <g fill="currentColor">
      <path d="M12 2 L14.2 8.5 L21 7 L16 12 L21 17 L14.2 15.5 L12 22 L9.8 15.5 L3 17 L8 12 L3 7 L9.8 8.5 Z" />
    </g>
  ),
  // GESTE
  precision: (
    <g fill="none" strokeWidth="1.2">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2 V7 M12 17 V22 M2 12 H7 M17 12 H22" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </g>
  ),
  doigte: (
    <g fill="none" strokeWidth="1.3" strokeLinecap="square">
      <circle cx="7.5" cy="7.5" r="3.5" />
      <path d="M10 10 L20 20 M16 16 L13.5 18.5 M18.5 18.5 L16.5 20.5" />
    </g>
  ),
  ombre: (
    <g fill="none" strokeWidth="1.2">
      <circle cx="12" cy="12" r="8" strokeOpacity="0.4" />
      <path d="M12 4 A8 8 0 0 1 12 20" />
      <path d="M13.5 6 L18 10.5 M13 9.5 L19.5 16 M13 13.5 L17 17.5" strokeOpacity="0.85" />
    </g>
  ),
  pilotage: (
    <g fill="none" strokeWidth="1.3">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10 V3.5 M10.3 13 L4.6 16.3 M13.7 13 L19.4 16.3" />
    </g>
  ),
  vivacite: (
    <g fill="none" strokeWidth="1.6" strokeLinejoin="miter">
      <path d="M14 2 L7 13 H12 L9 22 L18 9 H12.5 Z" />
    </g>
  ),
  regard: (
    <g fill="none" strokeWidth="1.3">
      <path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </g>
  ),
};

export function SkillGlyph({ skill, className = "h-5 w-5", colored = true }: { skill: SkillId; className?: string; colored?: boolean }) {
  const color = colored ? ATTRIBUTES[SKILLS[skill].attribute].color : "currentColor";
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ color, stroke: color }} aria-hidden>
      {SKILL_GLYPHS[skill]}
    </svg>
  );
}

const POLE_EMBLEMS: Record<AttributeId, React.ReactNode> = {
  esprit: (
    <g fill="none" strokeWidth="1.2">
      <circle cx="24" cy="24" r="18" />
      <circle cx="24" cy="24" r="11" strokeOpacity="0.6" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M24 2 V46 M2 24 H46" strokeOpacity="0.35" />
    </g>
  ),
  ame: (
    <g strokeWidth="1.5">
      <path d="M28 6 A18 18 0 1 0 28 42 A14 14 0 1 1 28 6 Z" fill="currentColor" />
      <circle cx="34" cy="16" r="2.5" fill="currentColor" />
      <circle cx="38" cy="26" r="1.5" fill="currentColor" fillOpacity="0.6" />
    </g>
  ),
  corps: (
    <g fill="currentColor">
      <path d="M24 4 L44 24 L24 44 L4 24 Z" />
      <path d="M24 14 L34 24 L24 34 L14 24 Z" style={{ fill: "var(--glyph-bg)" }} />
      <path d="M24 19 L29 24 L24 29 L19 24 Z" />
    </g>
  ),
  geste: (
    <g fill="none" strokeWidth="3" strokeLinecap="square">
      <path d="M8 40 L24 8" />
      <path d="M18 40 L34 8" strokeOpacity="0.7" />
      <path d="M28 40 L44 8" strokeOpacity="0.4" />
    </g>
  ),
};

export function PoleEmblem({ pole, className = "h-8 w-8" }: { pole: AttributeId; className?: string }) {
  const color = ATTRIBUTES[pole].color;
  return (
    <svg viewBox="0 0 48 48" className={className} style={{ color, stroke: color }} aria-hidden>
      {POLE_EMBLEMS[pole]}
    </svg>
  );
}
