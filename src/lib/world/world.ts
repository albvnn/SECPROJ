import type { AgencyId, Diplomacy, NewsItem, WorldGeo } from "@/lib/game/types";
import { pick, randInt, type Rng } from "@/lib/game/rng";
import { AGENCIES } from "@/lib/game/agencies";
import { CITIES, REGION_IDS, REGIONS, findCountry, type RegionId } from "./geo";
import { factionsOfRegion } from "./factions";

/** Les relations entre agences au départ de toute partie (après la Fracture de 2022). */
export const DIPLOMACY_START: Diplomacy = { argos_meridian: 25, meridian_monsoon: -35, argos_monsoon: 5 };

export function initialGeo(): WorldGeo {
  return {
    tensions: Object.fromEntries(REGION_IDS.map((r) => [r, REGIONS[r].tension])),
    diplomacy: { ...DIPLOMACY_START },
    news: [],
    threats: [],
    dossiers: {},
    dormant: {},
    satisfaction: { argos: 60, meridian: 60, monsoon: 60 },
    nemeses: [],
  };
}

export function diplomacyKey(a: AgencyId, b: AgencyId): keyof Diplomacy | null {
  const pair = [a, b].sort().join("_");
  return pair === "argos_meridian" ? "argos_meridian" : pair === "argos_monsoon" ? "argos_monsoon" : pair === "meridian_monsoon" ? "meridian_monsoon" : null;
}

export function diplomacyBetween(d: Diplomacy, a: AgencyId, b: AgencyId): number {
  const k = diplomacyKey(a, b);
  return k ? d[k] : 100;
}

export function diplomacyLabel(v: number): { label: string; tone: "ally" | "warm" | "neutral" | "cold" | "hostile" | "war"; description: string } {
  if (v >= 60) return { label: "Alliance", tone: "ally", description: "Opérations conjointes, partage complet du renseignement." };
  if (v >= 25) return { label: "Alliés méfiants", tone: "warm", description: "On coopère sur le terrorisme, on s'espionne pour la technologie." };
  if (v >= -10) return { label: "Neutres", tone: "neutral", description: "Rapports purement donnant-donnant." };
  if (v >= -40) return { label: "Rivaux", tone: "cold", description: "Coups bas tolérés, tant que les Règles de Lucerne sont respectées." };
  if (v >= -70) return { label: "Hostiles", tone: "hostile", description: "Agents expulsés, réseaux démantelés, incidents fréquents." };
  return { label: "Guerre de l'ombre", tone: "war", description: "Les Règles de Lucerne ne protègent plus personne : les agents se chassent." };
}

export function shiftDiplomacy(geo: WorldGeo, a: AgencyId, b: AgencyId, delta: number): WorldGeo {
  const k = diplomacyKey(a, b);
  if (!k || !delta) return geo;
  return { ...geo, diplomacy: { ...geo.diplomacy, [k]: clamp(geo.diplomacy[k] + delta, -100, 100) } };
}

export function shiftTension(geo: WorldGeo, region: string, delta: number): WorldGeo {
  if (!delta) return geo;
  return { ...geo, tensions: { ...geo.tensions, [region]: clamp((geo.tensions[region] ?? 50) + delta, 0, 100) } };
}

export function addNews(geo: WorldGeo, item: NewsItem): WorldGeo {
  return { ...geo, news: [item, ...geo.news].slice(0, 30) };
}

export function tensionLabel(t: number): string {
  if (t >= 80) return "explosive";
  if (t >= 60) return "très tendue";
  if (t >= 40) return "tendue";
  if (t >= 20) return "calme";
  return "apaisée";
}

/* ------------------------------------------------------------------ */
/* Dépêches                                                            */
/* ------------------------------------------------------------------ */

const NEWS_TEMPLATES: ((c: { city: string; country: string; faction: string; region: string }) => string)[] = [
  (x) => `${x.city} : explosion dans un dépôt portuaire, les autorités parlent d'un accident.`,
  (x) => `Un câble sous-marin sectionné au large de ${x.city} ; internet coupé pendant six heures.`,
  (x) => `${x.country} : un haut fonctionnaire de l'Énergie démissionne après des révélations sur ses contacts avec ${x.faction}.`,
  (x) => `Un physicien disparaît à ${x.city}. Sa famille ne croit pas à la fugue.`,
  (x) => `Les marchés de ${x.city} paniqués par une cyberattaque contre une chambre de compensation.`,
  (x) => `${x.country} : manifestations après la révélation d'écoutes massives.`,
  (x) => `Un cargo au transpondeur coupé repéré au large de ${x.city}.`,
  (x) => `Le cours des terres rares s'envole après des incidents en ${x.region.toLowerCase()}.`,
  (x) => `Un journaliste d'investigation retrouvé mort dans un hôtel de ${x.city}.`,
  (x) => `Vente aux enchères record à ${x.city} : un acheteur anonyme règle en cryptomonnaie.`,
  (x) => `${x.country} expulse trois diplomates pour « activités incompatibles avec leur statut ».`,
  (x) => `Panne géante du réseau électrique de ${x.city} : la piste d'un sabotage est envisagée.`,
  (x) => `Drones non identifiés au-dessus d'une base militaire près de ${x.city}.`,
  (x) => `Un prototype de puce quantique dérobé dans un laboratoire de ${x.country}.`,
];

/** Une dépêche plausible pour une région (pondérée par la tension). */
export function makeNews(geo: WorldGeo, day: number, rng: Rng = Math.random): NewsItem {
  const region = weightedRegion(geo, rng);
  const cities = CITIES.filter((c) => !c.tags?.includes("secret") && findCountry(c.country)?.region === region);
  const city = cities.length ? pick(cities, rng) : CITIES[0];
  const factions = factionsOfRegion(region);
  return {
    day,
    region,
    text: pick(NEWS_TEMPLATES, rng)({
      city: city.name,
      country: findCountry(city.country)?.name ?? "",
      faction: factions.length ? pick(factions, rng).name : "un réseau étranger",
      region: REGIONS[region].label,
    }),
  };
}

export function weightedRegion(geo: WorldGeo, rng: Rng = Math.random): RegionId {
  const total = REGION_IDS.reduce((n, r) => n + (geo.tensions[r] ?? 50) ** 2, 0);
  let x = rng() * total;
  for (const r of REGION_IDS) {
    x -= (geo.tensions[r] ?? 50) ** 2;
    if (x <= 0) return r;
  }
  return REGION_IDS[0];
}

/**
 * Une semaine passe dans le monde : les tensions dérivent vers leur niveau de fond,
 * la diplomatie se détend ou se crispe lentement, une ou deux dépêches tombent.
 */
export function weeklyWorld(geo: WorldGeo, day: number, rng: Rng = Math.random): WorldGeo {
  const tensions = { ...geo.tensions };
  for (const r of REGION_IDS) {
    const base = REGIONS[r].tension;
    const t = tensions[r] ?? base;
    tensions[r] = clamp(Math.round(t + (base - t) * 0.08 + randInt(-3, 3, rng)), 0, 100);
  }
  const diplomacy = { ...geo.diplomacy };
  for (const k of Object.keys(diplomacy) as (keyof Diplomacy)[]) {
    const base = DIPLOMACY_START[k];
    diplomacy[k] = clamp(Math.round(diplomacy[k] + (base - diplomacy[k]) * 0.04 + randInt(-1, 1, rng)), -100, 100);
  }
  let next: WorldGeo = { ...geo, tensions, diplomacy };
  const count = rng() < 0.35 ? 2 : 1;
  for (let i = 0; i < count; i++) next = addNews(next, makeNews(next, day, rng));
  return next;
}

/** Résumé de l'état du monde pour le narrateur. */
export function worldSummary(geo: WorldGeo, agency: AgencyId): string {
  const hot = REGION_IDS.map((r) => ({ r, t: geo.tensions[r] ?? 50 }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 4)
    .map(({ r, t }) => `${REGIONS[r].label} (${tensionLabel(t)}, ${t})`)
    .join(" ; ");
  const others = (["argos", "meridian", "monsoon"] as AgencyId[]).filter((a) => a !== agency);
  const diplo = others.map((o) => `${AGENCIES[o].name} : ${diplomacyLabel(diplomacyBetween(geo.diplomacy, agency, o)).label} (${diplomacyBetween(geo.diplomacy, agency, o)})`).join(" ; ");
  const news = geo.news
    .slice(0, 4)
    .map((n) => `- J${n.day} : ${n.text}`)
    .join("\n");
  return `Régions les plus tendues : ${hot}.\nRelations de ${AGENCIES[agency].name} : ${diplo}.\nDernières dépêches :\n${news || "- aucune"}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
