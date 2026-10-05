/**
 * Le terrain : blessures, notoriété par pays, légendes, langues, voyages, détention.
 * Fonctions pures, utilisées par les missions et la semaine.
 */
import { pick, randInt, uid, type Rng } from "./rng";
import { randomName } from "./names";
import type { Character, GameState, Injury, Legend, NodeType, Prison, SkillId } from "./types";
import { CITIES, findCity, findCountry, type CityDef } from "@/lib/world/geo";

/* ------------------------------------------------------------------ */
/* Blessures                                                           */
/* ------------------------------------------------------------------ */

const INJURIES: Record<string, { name: string; description: string; malus: Partial<Record<SkillId, number>> }[]> = {
  combat: [
    { name: "Côtes fêlées", description: "Chaque inspiration rappelle le dernier coup encaissé.", malus: { endurance: -1, force: -1 } },
    { name: "Arcade ouverte", description: "Six points de suture et un œil à moitié fermé.", malus: { regard: -1, tenue: -1 } },
    { name: "Bras entaillé", description: "Une lame est passée trop près.", malus: { combat: -1, precision: -1 } },
  ],
  poursuite: [{ name: "Cheville foulée", description: "Le dernier toit était plus bas que prévu.", malus: { athletisme: -2, vivacite: -1 } }],
  extraction: [{ name: "Épaule démise", description: "Remise en place à l'arrière d'une camionnette.", malus: { force: -1, athletisme: -1, pilotage: -1 } }],
  effraction: [{ name: "Main coupée", description: "Le verre blindé avait le dernier mot.", malus: { doigte: -2, machine: -1 } }],
  infiltration: [{ name: "Mauvaise chute", description: "Une gaine technique qui a cédé.", malus: { athletisme: -1, ombre: -1 } }],
  default: [{ name: "Contusions", description: "Rien de cassé, tout fait mal.", malus: { endurance: -1 } }],
};

const SEQUELS: { name: string; description: string; malus: Partial<Record<SkillId, number>> }[] = [
  { name: "Vieille fracture au genou", description: "Elle se réveille quand il pleut, et quand il faut courir.", malus: { athletisme: -1 } },
  { name: "Acouphène", description: "Un sifflement qui ne part plus depuis l'explosion.", malus: { alerte: -1 } },
  { name: "Main raide", description: "Deux doigts qui ne se plient plus tout à fait.", malus: { doigte: -1 } },
  { name: "Cicatrice au visage", description: "On s'en souvient. C'est bien le problème.", malus: { masque: -1 } },
];

/** Une blessure reçue sur une étape : sévère, elle laisse parfois une séquelle à vie. */
export function inflictInjury(c: Character, node: NodeType, severity: number, day: number, critical: boolean, rng: Rng): { character: Character; notice: string } {
  if (critical && severity >= 3 && rng() < 0.25) {
    const s = pick(SEQUELS.filter((x) => !c.injuries.some((i) => i.name === x.name)).length ? SEQUELS.filter((x) => !c.injuries.some((i) => i.name === x.name)) : SEQUELS, rng);
    const injury: Injury = { id: uid(rng), ...s };
    return { character: { ...c, injuries: [...c.injuries, injury] }, notice: `Séquelle : ${s.name}` };
  }
  const t = pick(INJURIES[node] ?? INJURIES.default, rng);
  const injury: Injury = { id: uid(rng), ...t, healDay: day + randInt(10, 18, rng) * Math.max(1, severity - 1) };
  return { character: { ...c, injuries: [...c.injuries, injury] }, notice: `Blessure : ${t.name}` };
}

export function injuryMalus(c: Pick<Character, "injuries">, skill: SkillId): number {
  return (c.injuries ?? []).reduce((n, i) => n + (i.malus[skill] ?? 0), 0);
}

/** Les blessures guérissent avec le temps (plus vite avec du repos). */
export function healInjuries(c: Character, day: number, rested: boolean): { character: Character; healed: string[] } {
  const healed: string[] = [];
  const injuries = c.injuries
    .map((i) => (i.healDay && rested ? { ...i, healDay: i.healDay - 4 } : i))
    .filter((i) => {
      if (i.healDay !== undefined && i.healDay <= day) {
        healed.push(i.name);
        return false;
      }
      return true;
    });
  return { character: { ...c, injuries }, healed };
}

/* ------------------------------------------------------------------ */
/* Notoriété par pays                                                  */
/* ------------------------------------------------------------------ */

export const heatOf = (c: Character, country: string) => c.heat?.[country] ?? 0;

export function addHeat(c: Character, country: string, delta: number): Character {
  return { ...c, heat: { ...c.heat, [country]: Math.max(0, Math.min(100, heatOf(c, country) + delta)) } };
}

/** Les fiches s'oublient lentement (moins vite chez les puissances hostiles). */
export function coolHeat(c: Character): Character {
  const heat: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.heat ?? {})) {
    const next = v - (findCountry(k)?.bloc === "hostile" ? 1 : 2);
    if (next > 0) heat[k] = next;
  }
  return { ...c, heat };
}

export function heatLabel(h: number): string {
  if (h >= 80) return "recherché";
  if (h >= 60) return "fiché";
  if (h >= 30) return "signalé";
  if (h > 0) return "remarqué";
  return "inconnu";
}

/* ------------------------------------------------------------------ */
/* Légendes                                                            */
/* ------------------------------------------------------------------ */

const PROFESSIONS = [
  "consultant en assurances",
  "acheteuse d'art",
  "ingénieur en télécommunications",
  "journaliste indépendante",
  "négociant en vins",
  "doctorant en archéologie",
  "photographe de mode",
  "cadre d'une ONG médicale",
  "pilote de ligne",
  "traductrice de conférence",
  "agent immobilier de luxe",
  "chef cuisinier",
];

const LEGEND_COUNTRIES = ["France", "Allemagne", "Italie", "Espagne", "Royaume-Uni", "Canada", "États-Unis", "Brésil", "Mexique", "Singapour", "Inde", "Afrique du Sud", "Australie", "Suisse", "Grèce", "Turquie", "Japon", "Argentine"];

export const LEGEND_COST = 2000;

export function legendCap(c: Character): number {
  if (c.seat) return 3;
  if (c.rank === "aspirant" || c.rank === "prospect") return 0;
  return c.rank === "agent" ? 1 : 2;
}

export function createLegend(c: Character, day: number, credibility: number, rng: Rng): Legend {
  const nationality = pick(LEGEND_COUNTRIES, rng);
  const gender = c.identity.gender;
  const n = randomName(nationality, gender, rng);
  return { id: uid(rng), name: `${n.first} ${n.last}`, nationality, profession: pick(PROFESSIONS, rng), credibility, burned: [], createdDay: day };
}

/** Une légende qui tient réduit l'exposition de chaque faux pas. */
export const legendShield = (l: Legend | undefined) => (l ? Math.floor(l.credibility / 20) : 0);

export const legendUsableIn = (l: Legend, country: string) => !l.burned.includes(findCountry(country)?.name ?? country);

/* ------------------------------------------------------------------ */
/* Langues                                                             */
/* ------------------------------------------------------------------ */

/** Langues parlées dans chaque pays (codes de la carte). */
const COUNTRY_LANGUAGES: Record<string, string[]> = {
  "250": ["français"], "MCO": ["français"], "056": ["français", "néerlandais"], "442": ["français", "allemand", "luxembourgeois"], "756": ["allemand", "français", "italien"],
  "276": ["allemand"], "040": ["allemand"], "380": ["italien"], "724": ["espagnol"], "620": ["portugais"], "826": ["anglais"], "SCO": ["anglais"], "372": ["anglais"],
  "528": ["néerlandais"], "616": ["polonais"], "804": ["ukrainien", "russe"], "112": ["russe"], "643": ["russe"], "EXO": ["russe"], "440": ["lituanien", "russe"], "428": ["letton", "russe"],
  "233": ["estonien", "russe"], "642": ["roumain"], "100": ["bulgare"], "300": ["grec"], "196": ["grec", "turc", "anglais"], "MLT": ["maltais", "anglais"], "191": ["croate"], "688": ["serbe"],
  "752": ["suédois"], "578": ["norvégien"], "208": ["danois"], "246": ["finnois"], "352": ["islandais"], "304": ["groenlandais", "danois"], "SVA": ["norvégien", "anglais", "russe"],
  "792": ["turc"], "818": ["arabe"], "788": ["arabe", "français"], "012": ["arabe", "français"], "504": ["arabe", "français"], "434": ["arabe"], "422": ["arabe", "français"], "760": ["arabe"],
  "368": ["arabe"], "400": ["arabe"], "682": ["arabe"], "NEO": ["arabe", "anglais"], "784": ["arabe", "anglais"], "634": ["arabe", "anglais"], "512": ["arabe"], "887": ["arabe"], "364": ["persan"],
  "376": ["hébreu", "anglais"], "031": ["azéri", "russe"], "268": ["géorgien", "russe"], "SAH": ["français", "bambara", "haoussa"], "686": ["français", "wolof"], "384": ["français"],
  "566": ["anglais", "yoruba", "haoussa"], "288": ["anglais"], "148": ["français", "arabe"], "231": ["amharique", "anglais"], "404": ["swahili", "anglais"], "706": ["somali", "arabe"],
  "262": ["français", "arabe"], "729": ["arabe"], "180": ["français", "lingala"], "710": ["anglais", "zoulou", "afrikaans"], "024": ["portugais"], "834": ["swahili", "anglais"],
  "840": ["anglais", "espagnol"], "124": ["anglais", "français"], "484": ["espagnol"], "170": ["espagnol"], "862": ["espagnol"], "076": ["portugais"], "032": ["espagnol"], "152": ["espagnol"],
  "604": ["espagnol"], "192": ["espagnol"], "591": ["espagnol", "anglais"], "332": ["créole", "français"], "068": ["espagnol"], "398": ["kazakh", "russe"], "860": ["ouzbek", "russe"],
  "156": ["chinois"], "158": ["chinois"], "392": ["japonais"], "410": ["coréen"], "408": ["coréen"], "496": ["mongol", "russe"], "356": ["hindi", "anglais"], "586": ["ourdou", "anglais"],
  "004": ["persan", "pachto"], "050": ["bengali"], "144": ["cinghalais", "anglais"], "524": ["népalais"], "SGP": ["anglais", "chinois", "malais"], "458": ["malais", "anglais"],
  "360": ["indonésien"], "608": ["filipino", "anglais"], "764": ["thaï"], "704": ["vietnamien"], "104": ["birman"], "116": ["khmer"], "ATL": ["anglais"], "036": ["anglais"],
  "554": ["anglais", "maori"], "598": ["anglais"], "540": ["français"], "242": ["anglais"],
};

export const ALL_LANGUAGES = [...new Set(Object.values(COUNTRY_LANGUAGES).flat())].sort((a, b) => a.localeCompare(b, "fr"));

export function languagesOf(country: string): string[] {
  return COUNTRY_LANGUAGES[country] ?? ["anglais"];
}

/** +1 si l'on parle une langue du pays, −1 si on n'en parle aucune (et pas l'anglais quand il y est parlé). */
export function languageBonus(c: Character, country: string): number {
  const local = languagesOf(country);
  const spoken = new Set((c.spoken ?? []).map((l) => l.toLowerCase()));
  if (local.some((l) => spoken.has(l))) return 1;
  return -1;
}

/** Les étapes où la langue compte. */
export const LANGUAGE_NODES: NodeType[] = ["social", "renseignement", "filature", "approche", "secondaire"];

/* ------------------------------------------------------------------ */
/* Voyages                                                             */
/* ------------------------------------------------------------------ */

function distanceKm(a: CityDef, b: CityDef): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Trip {
  km: number;
  hours: number;
  cost: number;
  /** Décalage horaire en heures. */
  jetlag: number;
  /** Fatigue du voyage. */
  fatigue: number;
}

export function trip(fromId: string, toId: string): Trip {
  const a = findCity(fromId);
  const b = findCity(toId);
  if (!a || !b || a.id === b.id) return { km: 0, hours: 0, cost: 0, jetlag: 0, fatigue: 0 };
  const km = Math.round(distanceKm(a, b));
  const hours = Math.round((km / 800 + 2.5) * 10) / 10;
  const jetlag = Math.round(Math.abs(a.lon - b.lon) / 15);
  return { km, hours, cost: Math.round((150 + km * 0.12) / 10) * 10, jetlag, fatigue: Math.min(40, Math.round(hours / 2 + jetlag * 2.5)) };
}

/* ------------------------------------------------------------------ */
/* Détention                                                           */
/* ------------------------------------------------------------------ */

/** Arrêté pendant une mission : dans un pays hostile, c'est la prison ; ailleurs, une expulsion. */
export function arrest(state: GameState, cityId: string, captor: string): Prison {
  const city = findCity(cityId) ?? CITIES[0];
  return { country: city.country, cityId: city.id, captor, since: state.world.day, escape: 0, leaked: 0 };
}
