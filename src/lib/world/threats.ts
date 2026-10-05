/**
 * Le monde vivant : les factions mènent leurs propres opérations (les menaces),
 * les agences rivales agissent, les ennemis nommés reviennent, les dossiers se remplissent.
 */
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { randomName } from "@/lib/game/names";
import { chance, pick, pickWeighted, randInt, uid, type Rng } from "@/lib/game/rng";
import type { AgencyId, GameState, Nemesis, NewsItem, Threat, WorldGeo } from "@/lib/game/types";
import { FACTIONS, findFaction } from "./factions";
import { REGIONS, citiesOfRegion, findCity, findCountry, type RegionId } from "./geo";
import { addNews, diplomacyBetween, shiftDiplomacy, shiftTension } from "./world";

/** Régions où chaque agence a des intérêts (et où elle intervient d'elle-même). */
export const INTERESTS: Record<AgencyId, Partial<Record<RegionId, number>>> = {
  argos: { europe: 3, est: 3, mediterranee: 2.5, sahel: 2, arctique: 2, moyen_orient: 1.5, russie: 1.5, afrique: 1 },
  meridian: { amerique_nord: 3, amerique_latine: 2.5, asie_est: 3, oceanie: 2, moyen_orient: 1.5, arctique: 2, asie_sud_est: 1.5 },
  monsoon: { asie_sud: 3, asie_sud_est: 3, moyen_orient: 2.5, afrique: 2, amerique_latine: 1.5, sahel: 1.5, asie_est: 1.5 },
};

/** Ce que chaque type de faction prépare. */
const PLOTS: Record<string, { template: string; title: string; strike: string }[]> = {
  etat: [
    { template: "sabotage", title: "sabotage d'une infrastructure à {city}", strike: "{city} : une infrastructure critique paralysée pendant des jours. Sabotage, selon des sources officieuses." },
    { template: "assassinat", title: "élimination d'un opposant à {city}", strike: "{city} : un opposant en exil retrouvé mort. Les autorités parlent de crise cardiaque." },
    { template: "cyber", title: "cyberattaque préparée depuis {city}", strike: "Cyberattaque massive : hôpitaux et banques à l'arrêt dans plusieurs pays. La piste mène à {city}." },
    { template: "prototype", title: "vol de technologie à {city}", strike: "{city} : un prototype militaire a disparu d'un laboratoire réputé inviolable." },
  ],
  syndicat: [
    { template: "gala", title: "vente aux enchères de secrets à {city}", strike: "{city} : des documents classifiés vendus au plus offrant ; trois gouvernements démentent." },
    { template: "arme", title: "livraison d'armes via {city}", strike: "Des armes lourdes livrées via {city} : un conflit régional s'embrase." },
    { template: "reseau", title: "un réseau qui s'installe à {city}", strike: "{city} : un réseau criminel a pris le contrôle du port. La police est débordée." },
  ],
  mercenaires: [
    { template: "otage", title: "prise d'otages autour de {city}", strike: "{city} : des ressortissants étrangers enlevés par des hommes armés non identifiés." },
    { template: "arme", title: "trafic d'armes à {city}", strike: "Des mercenaires lourdement armés repérés à {city}. Un coup d'État se prépare." },
  ],
  cartel: [
    { template: "reseau", title: "le cartel s'étend à {city}", strike: "{city} : vague de violence liée au cartel ; un juge abattu." },
    { template: "otage", title: "enlèvement préparé à {city}", strike: "{city} : la fille d'un ministre enlevée à la sortie de son école." },
  ],
  tech: [
    { template: "prototype", title: "expérience interdite à {city}", strike: "{city} : un laboratoire privé ferme après un « incident biologique mineur »." },
    { template: "cyber", title: "IA de manipulation testée depuis {city}", strike: "Une campagne de désinformation inédite fait vaciller une élection. Les serveurs étaient à {city}." },
  ],
  terroriste: [
    { template: "sabotage", title: "attentat préparé à {city}", strike: "{city} : explosion dans une installation industrielle. Un groupe radical revendique." },
    { template: "arme", title: "arme biologique en transit par {city}", strike: "Alerte sanitaire à {city} : un agent pathogène dérobé a été dispersé." },
  ],
};

const fill = (s: string, city: string) => s.replace(/\{city\}/g, city);

export function initialThreats(geo: WorldGeo, rng: Rng = Math.random): Threat[] {
  const out: Threat[] = [];
  for (let i = 0; i < 4; i++) {
    const t = newThreat({ ...geo, threats: out }, 0, rng);
    if (t) out.push({ ...t, progress: randInt(10, 50, rng) });
  }
  return out;
}

function newThreat(geo: WorldGeo, day: number, rng: Rng): Threat | null {
  const factions = FACTIONS.filter((f) => !(geo.dormant?.[f.id] > day));
  if (!factions.length) return null;
  const faction = pick(factions, rng);
  const region = pickWeighted(faction.regions, (r) => (geo.tensions[r] ?? 50) ** 1.5, rng);
  const cities = citiesOfRegion(region).filter((c) => findCountry(c.country)?.bloc !== "hostile" || chance(0.3, rng));
  const city = cities.length ? pick(cities, rng) : citiesOfRegion(region)[0];
  if (!city) return null;
  const plot = pick(PLOTS[faction.kind] ?? PLOTS.syndicat, rng);
  return { id: uid(rng), faction: faction.id, region, cityId: city.id, template: plot.template, title: fill(plot.title, city.name), progress: 0, known: false };
}

function strikeText(t: Threat): string {
  const faction = findFaction(t.faction);
  const plot = (PLOTS[faction?.kind ?? "syndicat"] ?? []).find((p) => p.template === t.template) ?? PLOTS.syndicat[0];
  return fill(plot.strike, findCity(t.cityId)?.name ?? "");
}

export const satisfactionOf = (geo: WorldGeo, agency: AgencyId) => geo.satisfaction?.[agency] ?? 60;

export function shiftSatisfaction(geo: WorldGeo, agency: AgencyId, delta: number): WorldGeo {
  return { ...geo, satisfaction: { ...geo.satisfaction, [agency]: Math.max(0, Math.min(100, satisfactionOf(geo, agency) + delta)) } };
}

/** Les gouvernements règlent les moyens de l'agence selon leur satisfaction (×0,6 à ×1,4). */
export const fundingFactor = (geo: WorldGeo, agency: AgencyId) => 0.6 + satisfactionOf(geo, agency) / 125;

/* ------------------------------------------------------------------ */
/* Dossiers                                                            */
/* ------------------------------------------------------------------ */

export const DOSSIER_FULL = 10;

/** Une pièce de plus sur une faction ; un dossier complet ouvre l'opération contre sa tête. */
export function addDossier(geo: WorldGeo, faction: string, n: number, rng: Rng = Math.random): { geo: WorldGeo; notice?: string } {
  const before = geo.dossiers?.[faction] ?? 0;
  const after = Math.min(DOSSIER_FULL, before + n);
  let next: WorldGeo = { ...geo, dossiers: { ...geo.dossiers, [faction]: after } };
  const f = findFaction(faction);
  if (after >= DOSSIER_FULL && before < DOSSIER_FULL && f && !geo.threats.some((t) => t.capstone && t.faction === faction)) {
    const region = pick(f.regions, rng);
    const city = citiesOfRegion(region)[0] ?? findCity(AGENCIES.argos.hqCity)!;
    next = {
      ...next,
      threats: [
        ...next.threats,
        { id: uid(rng), faction, region, cityId: city.id, template: "reseau", title: `La tête de ${f.name}`, progress: 0, known: true, capstone: true },
      ],
    };
    return { geo: next, notice: `Dossier complet sur ${f.name} : l'opération contre sa tête est possible` };
  }
  return { geo: next, notice: after > before ? `Dossier ${f?.name ?? faction} : ${after}/${DOSSIER_FULL}` : undefined };
}

/* ------------------------------------------------------------------ */
/* Ennemis nommés                                                      */
/* ------------------------------------------------------------------ */

const NEMESIS_COUNTRIES: Record<string, string[]> = {
  russes: ["Ukraine"], chinois: ["Singapour"], iraniens: ["Turquie"], nordcoreens: ["Corée du Sud"], koschei: ["Ukraine"],
  ouroboros: ["Italie", "France", "Brésil", "Turquie"], varn: ["États-Unis", "Australie"], promethee: ["États-Unis", "Allemagne"],
  corona: ["Mexique", "Argentine"], vladivostok: ["Ukraine"], gaia: ["Norvège", "Brésil", "France"],
};

export function makeNemesis(faction: string, title: string, cityId: string, day: number, history: string, rng: Rng = Math.random, agency?: AgencyId): Nemesis {
  const country = agency ? pick(AGENCIES[agency].members, rng).country : pick(NEMESIS_COUNTRIES[faction] ?? ["France"], rng);
  const n = randomName(country, chance(0.5, rng) ? "fille" : "garcon", rng);
  return { id: uid(rng), name: `${n.first} ${n.last}`, title, faction, agency, level: 1, grudge: 40, status: "libre", cityId, lastDay: day, encounters: 1, history };
}

/* ------------------------------------------------------------------ */
/* La semaine du monde                                                 */
/* ------------------------------------------------------------------ */

export interface WorldWeek {
  state: GameState;
  notices: string[];
  /** Un événement à mettre en scène (ennemi qui frappe, coup d'une agence rivale). */
  event?: string;
}

export function weeklyThreats(initial: GameState, rng: Rng = Math.random): WorldWeek {
  let state = initial;
  const day = state.world.day;
  const me = state.character.identity.agency;
  let geo = state.world.geo;
  const notices: string[] = [];
  let event: string | undefined;

  // Nouvelles opérations adverses.
  if (geo.threats.length < 6 && chance(0.35, rng)) {
    const t = newThreat(geo, day, rng);
    if (t) geo = { ...geo, threats: [...geo.threats, t] };
  }

  const myRegions = new Set<string>([
    ...state.command.assets.filter((a) => a.status === "actif").map((a) => findCountry(findCity(a.cityId)?.country ?? "")?.region ?? ""),
    findCountry(findCity(state.character.station ?? state.command.station?.cityId ?? "")?.country ?? "")?.region ?? "",
  ]);
  const analysis = AGENCIES[me].branches.find((b) => b.kind === "analyse");
  const analysisFavor = analysis ? (state.command.branchFavor?.[analysis.id] ?? 0) : 0;

  const remaining: Threat[] = [];
  for (const t of geo.threats) {
    let threat = { ...t };
    if (!threat.capstone) threat.progress += randInt(4, 10, rng) + ((geo.tensions[t.region] ?? 50) >= 70 ? 3 : 0);
    if (!threat.known && (myRegions.has(t.region) || analysisFavor >= 30 || chance(0.15, rng))) threat.known = true;

    // Les autres Cercles s'en occupent parfois avant le joueur.
    const offered = state.offers.some((o) => o.threat === t.id) || state.mission?.threat === t.id;
    let handledBy: AgencyId | null = null;
    if (!threat.capstone && !offered)
      for (const a of AGENCY_IDS) if (!handledBy && chance((INTERESTS[a][t.region as RegionId] ?? 0.3) * 0.025, rng)) handledBy = a;
    if (handledBy) {
      geo = addNews(geo, { day, region: t.region, text: `${findCity(t.cityId)?.name ?? ""} : plusieurs arrestations discrètes ; « une affaire réglée en coulisses », selon un diplomate.` });
      geo = shiftTension(geo, t.region, -3);
      if (handledBy === me) {
        geo = shiftSatisfaction(geo, me, 1);
        if (t.known) notices.push(`Le Cercle a déjoué : ${t.title}`);
      } else if (t.known) notices.push(`${AGENCIES[handledBy].name} a déjoué : ${t.title}`);
      continue;
    }
    if (threat.progress >= 100 && !threat.capstone) {
      geo = addNews(geo, { day, region: t.region, text: strikeText(t) });
      geo = shiftTension(geo, t.region, 8);
      for (const a of AGENCY_IDS) if ((INTERESTS[a][t.region as RegionId] ?? 0) >= 2.5) geo = shiftSatisfaction(geo, a, -6);
      if (offered) {
        state = { ...state, character: { ...state.character, reputation: Math.max(0, state.character.reputation - 5) } };
        notices.push(`La menace qu'on t'avait confiée a frappé : ${t.title} (réputation −5)`);
      } else if (t.known) notices.push(`Personne ne l'a arrêtée : ${t.title}`);
      if (t.nemesis) geo = { ...geo, nemeses: geo.nemeses.map((n) => (n.id === t.nemesis ? { ...n, level: Math.min(5, n.level + 1) } : n)) };
      continue;
    }
    remaining.push(threat);
  }
  geo = { ...geo, threats: remaining };

  // Les informateurs remplissent les dossiers.
  for (const a of state.command.assets.filter((x) => x.status === "actif")) {
    if (!chance(0.08, rng)) continue;
    const region = findCountry(findCity(a.cityId)?.country ?? "")?.region;
    const f = FACTIONS.filter((x) => region && x.regions.includes(region as RegionId));
    if (!f.length) continue;
    const r = addDossier(geo, pick(f, rng).id, 1, rng);
    geo = r.geo;
    if (r.notice) notices.push(`${a.name} : ${r.notice}`);
  }

  // Les agences rivales agissent selon l'état des relations.
  for (const other of AGENCY_IDS.filter((a) => a !== me)) {
    const d = diplomacyBetween(geo.diplomacy, me, other);
    if (d <= -40 && chance(0.05, rng)) {
      const name = AGENCIES[other].name;
      if (state.command.station && chance(0.5, rng)) {
        state = { ...state, command: { ...state.command, station: { ...state.command.station, cover: Math.max(0, state.command.station.cover - 20) } } };
        event = `${name} a repéré ta Station : des visages connus rôdent autour, des micros ont été trouvés.`;
      } else {
        event = `${name} a volé un prototype au laboratoire de ton agence. Toute la maison en parle.`;
        state = { ...state, command: { ...state.command, labFavor: 0 } };
      }
      notices.push(`Coup de ${name} contre ton agence`);
      geo = shiftDiplomacy(geo, me, other, -3);
    } else if (d >= 45 && chance(0.05, rng)) {
      state = { ...state, command: { ...state.command, intelStock: Math.min(3, (state.command.intelStock ?? 0) + 1) } };
      notices.push(`${AGENCIES[other].name} partage un renseignement (+1 renseignement de départ)`);
    }
  }

  // Les ennemis nommés n'oublient pas.
  const nemeses = geo.nemeses.map((n) => ({ ...n }));
  for (const n of nemeses) {
    if (n.status !== "libre" || n.grudge < 40 || !chance(0.035 + n.level * 0.01, rng)) continue;
    const country = findCity(n.cityId)?.country;
    if (country) state = { ...state, character: { ...state.character, heat: { ...state.character.heat, [country]: Math.min(100, (state.character.heat?.[country] ?? 0) + 15) } } };
    const target = state.relations.filter((r) => r.status === "actif").sort((a, b) => b.affinity - a.affinity)[0];
    event =
      target && chance(0.5, rng)
        ? `${n.name}, ${n.title}, s'en prend à ${target.name} pour t'atteindre : une menace, une visite, un avertissement.`
        : `${n.name}, ${n.title}, te fait savoir qu'il ne t'a pas oublié : ton nom circule dans les services de ${findCountry(country ?? "")?.name ?? "plusieurs pays"}.`;
    notices.push(`${n.name} se manifeste`);
    n.grudge = Math.max(0, n.grudge - 10);
  }
  geo = { ...geo, nemeses };

  return { state: { ...state, world: { ...state.world, geo } }, notices, event };
}

/** Ce que les dépêches publiques ne disent pas : la liste des menaces pour le narrateur. */
export function threatsSummary(geo: WorldGeo): string {
  const known = geo.threats.filter((t) => t.known);
  if (!known.length) return "Aucune menace identifiée.";
  return known
    .map((t) => `${t.title} (${findFaction(t.faction)?.name}, ${REGIONS[t.region as RegionId]?.label}, avancement ${t.progress}/100${t.capstone ? ", OPÉRATION DÉCISIVE" : ""})`)
    .join(" ; ");
}

export type { NewsItem };
