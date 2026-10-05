import type { AgencyId } from "@/lib/game/types";

/**
 * Sceaux des sièges du Cercle : un motif par siège, dans un cadre propre à chaque agence
 * (double anneau grec pour ARGOS, rose des vents pour MERIDIAN, cercle zen ouvert pour MONSOON).
 */

const MOTIFS: Record<string, React.ReactNode> = {
  eye: (
    <>
      <path d="M14 32 Q32 16 50 32 Q32 48 14 32 Z" />
      <circle cx="32" cy="32" r="6" />
      <circle cx="32" cy="32" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  lyre: (
    <>
      <path d="M22 18 C14 26 18 40 26 44 H38 C46 40 50 26 42 18" />
      <path d="M24 24 H40 M28 24 V44 M32 24 V44 M36 24 V44" strokeOpacity="0.8" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="32" cy="32" r="11" />
      <path d="M32 14 V26 M32 38 V50 M14 32 H26 M38 32 H50" />
      <circle cx="32" cy="32" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // ARGOS — Maisons du Panthéon
  mnemosyne: <path d="M32 32 m0 -2 a2 2 0 1 1 -2 2 a4.5 4.5 0 0 1 4.5 -4.5 a7 7 0 0 1 7 7 a9.5 9.5 0 0 1 -9.5 9.5 a12 12 0 0 1 -12 -12 a14.5 14.5 0 0 1 14.5 -14.5" />,
  hermes: (
    <>
      <path d="M32 16 V50" />
      <path d="M32 21 C26 15 20 16 17 19 C22 20 26 22 30 24 M32 21 C38 15 44 16 47 19 C42 20 38 22 34 24" />
      <path d="M32 27 C40 30 40 35 32 38 C24 41 24 46 32 49 M32 27 C24 30 24 35 32 38 C40 41 40 46 32 49" strokeOpacity="0.8" />
      <circle cx="32" cy="15" r="2" />
    </>
  ),
  nyx: (
    <>
      <path d="M38 17 A16 16 0 1 0 38 47 A12.5 12.5 0 1 1 38 17 Z" />
      <path d="M44 22 l1 2.5 l2.5 1 l-2.5 1 l-1 2.5 l-1 -2.5 l-2.5 -1 l2.5 -1 Z M48 36 l0.7 1.6 l1.6 0.7 l-1.6 0.7 l-0.7 1.6 l-0.7 -1.6 l-1.6 -0.7 l1.6 -0.7 Z" fill="currentColor" stroke="none" />
    </>
  ),
  hephaistos: (
    <>
      <path d="M18 40 H46 L42 45 H36 L38 50 H26 L28 45 H22 Z" />
      <path d="M26 33 L40 19 M36 15 L44 23 L40 27 L32 19 Z" />
      <path d="M22 34 l-3 -3 M25 31 l-1 -4 M28 33 l3 -2" strokeOpacity="0.7" />
    </>
  ),
  ares: (
    <>
      <circle cx="32" cy="34" r="12" />
      <circle cx="32" cy="34" r="4" />
      <path d="M32 12 V54 M28.5 17 L32 11 L35.5 17" />
    </>
  ),

  // MERIDIAN — Wings du Programme
  vanguard: (
    <>
      <path d="M20 34 L32 22 L44 34" />
      <path d="M20 44 L32 32 L44 44" />
      <path d="M32 14 L34 19 L32 18 L30 19 Z" fill="currentColor" />
    </>
  ),
  flight: (
    <>
      <circle cx="32" cy="32" r="5" />
      <path d="M27 31 C21 28 15 28 10 30 C15 31 19 33 22 35 M37 31 C43 28 49 28 54 30 C49 31 45 33 42 35" />
      <path d="M26 35 C22 34 18 35 15 37 M38 35 C42 34 46 35 49 37" strokeOpacity="0.7" />
    </>
  ),
  signal: (
    <>
      <circle cx="32" cy="38" r="2.4" fill="currentColor" />
      <path d="M25 31 A10 10 0 0 1 39 31 M20 26 A17 17 0 0 1 44 26 M15 21 A24 24 0 0 1 49 21" />
      <path d="M32 40 L27 50 H37 Z" strokeOpacity="0.8" />
    </>
  ),
  mirage: (
    <>
      <path d="M32 16 L44 32 L32 48 L20 32 Z" />
      <path d="M36 16 L48 32 L36 48" strokeOpacity="0.45" />
      <path d="M28 16 L16 32 L28 48" strokeOpacity="0.45" />
    </>
  ),
  ghost: (
    <>
      <circle cx="32" cy="32" r="13" strokeDasharray="2 4" />
      <circle cx="32" cy="32" r="1.6" fill="currentColor" />
    </>
  ),

  // MONSOON — Écoles
  maree: (
    <>
      <path d="M14 26 C19 22 24 22 29 26 S39 30 44 26 S50 23 51 24" />
      <path d="M14 33 C19 29 24 29 29 33 S39 37 44 33 S50 30 51 31" strokeOpacity="0.8" />
      <path d="M14 40 C19 36 24 36 29 40 S39 44 44 40 S50 37 51 38" strokeOpacity="0.6" />
    </>
  ),
  foudre: <path d="M36 12 L22 35 H31 L27 52 L43 27 H33 Z" />,
  brume: (
    <>
      <path d="M14 24 H30 M35 24 H50" />
      <path d="M18 31 H24 M29 31 H46" strokeOpacity="0.8" />
      <path d="M14 38 H38 M43 38 H50" strokeOpacity="0.6" />
      <path d="M22 45 H28 M33 45 H44" strokeOpacity="0.4" />
    </>
  ),
  corail: (
    <path d="M32 52 V36 M32 40 L23 31 V22 M23 27 L18 22 M32 36 L41 27 V18 M41 23 L46 18 M32 44 L40 38 M23 31 L19 31" strokeLinecap="round" />
  ),
  typhon: (
    <>
      <circle cx="32" cy="32" r="3" />
      <path d="M32 29 C32 20 40 15 48 18" />
      <path d="M34.6 33.5 C42.4 38 42 47.4 34.6 51" />
      <path d="M29.4 33.5 C21.6 38 13.4 34 13.4 26" />
    </>
  ),
};

function Frame({ agency }: { agency: AgencyId }) {
  if (agency === "argos")
    return (
      <>
        <circle cx="32" cy="32" r="29.5" strokeOpacity="0.9" />
        <circle cx="32" cy="32" r="26.5" strokeOpacity="0.35" />
        {Array.from({ length: 24 }, (_, i) => (
          <path key={i} d="M32 2.5 V5" transform={`rotate(${i * 15} 32 32)`} strokeOpacity="0.5" />
        ))}
      </>
    );
  if (agency === "meridian")
    return (
      <>
        <circle cx="32" cy="32" r="28" strokeOpacity="0.8" />
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={i % 2 ? "M32 1.5 V6" : "M32 0.5 L33.5 4 H30.5 Z"} transform={`rotate(${i * 45} 32 32)`} fill={i % 2 ? undefined : "currentColor"} />
        ))}
      </>
    );
  return <path d="M50 12 A28 28 0 1 1 41 7" strokeWidth="2.6" strokeLinecap="round" strokeOpacity="0.85" />;
}

/** Motif de chaque siège. */
const SEAT_MOTIF: Record<string, string> = {
  jason: "vanguard", orphee: "lyre", lyncee: "eye", heracles: "ares", atalante: "flight", tiphys: "maree", autolycos: "nyx", asclepios: "hermes", argos: "hephaistos", medee: "mirage",
  sirius: "vanguard", vega: "flight", rigel: "crosshair", altair: "altair_wings", antares: "nyx", arcturus: "ares", deneb: "signal", capella: "hermes", aldebaran: "eye", betelgeuse: "foudre",
  amihan: "maree", habagat: "corail", shamal: "brume", harmattan: "ares", khamsin: "typhon", sumatra: "foudre", loo: "hephaistos", barat: "flight",
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function SeatSigil({ agency, seat, number, className = "h-16 w-16" }: { agency: AgencyId; seat: string; number?: number; className?: string }) {
  const motif = MOTIFS[SEAT_MOTIF[seat] === "altair_wings" ? "flight" : (SEAT_MOTIF[seat] ?? "")] ?? <circle cx="32" cy="32" r="6" />;
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <Frame agency={agency} />
      <g transform="translate(0 -3)">{motif}</g>
      {number ? (
        <text x="32" y="57" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontFamily="serif" letterSpacing="1">
          {ROMAN[number]}
        </text>
      ) : null}
    </svg>
  );
}

/** Emblème d'une Branche de soutien (laboratoire, analyse, logistique). */
const BRANCH_MOTIF: Record<string, string> = {
  forge: "hephaistos", bibliotheque: "mnemosyne", passeurs: "maree",
  hangar: "hephaistos", mission_control: "signal", ground_crew: "flight",
  atelier: "hephaistos", ruche: "signal", marees: "maree",
};

export function BranchSigil({ agency, branch, className = "h-16 w-16" }: { agency: AgencyId; branch: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <Frame agency={agency} />
      {MOTIFS[BRANCH_MOTIF[branch] ?? ""] ?? <circle cx="32" cy="32" r="6" />}
    </svg>
  );
}
