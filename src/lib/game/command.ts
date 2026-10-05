/**
 * Ce que le joueur dirige selon son grade : escouade, antenne, théâtre, agence.
 * Ces décisions se prennent directement (sans tour de jeu) ; leurs effets se font sentir semaine après semaine.
 */
import { AGENCIES } from "./agencies";
import { GADGETS, findGadget } from "./gadgets";
import { delegateChance } from "./missions";
import { fundingFactor } from "@/lib/world/threats";
import { randInt, uid, type Rng } from "./rng";
import { isAvailable } from "./roster";
import { RANKS, can } from "./rules";
import type { AgencyCommand, Command, GameState, HqModule, Project, RankId, StationModule, Theatre } from "./types";
import { citiesOfRegion, findCity, findCountry, type RegionId } from "@/lib/world/geo";

export function emptyCommand(): Command {
  return { assets: [], squad: [], station: null, theatre: null, agency: null, unlocked: [], delegated: [], intelStock: 0, labFavor: 0, branchFavor: {}, vacantSince: {} };
}

const atLeast = (rank: RankId, min: RankId) => RANKS[rank].order >= RANKS[min].order;
void atLeast;

/* ------------------------------------------------------------------ */
/* Seconds (Doyen) : deux officiers formés par le joueur                */
/* ------------------------------------------------------------------ */

export const SQUAD_SIZE = 2;

export function setSquad(state: GameState, ids: string[]): GameState {
  if (!can(state.character.rank, "seconds")) throw new Error("Seul le Doyen du Cercle forme des seconds.");
  const agency = state.character.identity.agency;
  const squad = ids.filter((id) => state.roster.some((o) => o.id === id && o.agency === agency && o.role === "officier")).slice(0, SQUAD_SIZE);
  return { ...state, command: { ...state.command, squad }, updatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Antenne                                                             */
/* ------------------------------------------------------------------ */

export const STATION_MODULES: Record<StationModule, { label: string; cost: number; effect: string }> = {
  planque: { label: "Planques", cost: 20000, effect: "Dans la région, chaque faux pas t'expose un peu moins (exposition −5 par échec)." },
  ecoutes: { label: "Salle des écoutes", cost: 30000, effect: "+1 renseignement de départ dans la région." },
  atelier: { label: "Atelier", cost: 40000, effect: "Un gadget de plus à chaque mission." },
  garage: { label: "Garage", cost: 35000, effect: "Véhicules prêts : les extractions sont plus sûres (santé épargnée)." },
  infirmerie: { label: "Infirmerie", cost: 25000, effect: "Récupération après mission raccourcie d'une semaine." },
  salle_crise: { label: "Salle de crise", cost: 60000, effect: "Missions déléguées : +10 % de chances de réussite." },
};

export const STATION_BUDGET = 60000;

export function openStation(state: GameState, cityId: string): GameState {
  if (!can(state.character.rank, "station")) throw new Error("Il faut être chef de station.");
  if (state.command.station) throw new Error("Tu diriges déjà une Station.");
  const city = findCity(cityId);
  const country = city && findCountry(city.country);
  if (!city || !country || city.tags?.includes("secret")) throw new Error("Ville inconnue.");
  if (country.bloc === "hostile") throw new Error("Impossible d'ouvrir une antenne en territoire hostile.");
  return {
    ...state,
    command: { ...state.command, station: { cityId, budget: STATION_BUDGET, modules: [], intel: 0, cover: 70 } },
    updatedAt: Date.now(),
  };
}

export function buyModule(state: GameState, module: StationModule): GameState {
  const st = state.command.station;
  if (!st) throw new Error("Pas d'antenne.");
  if (st.modules.includes(module)) throw new Error("Module déjà installé.");
  const cost = STATION_MODULES[module].cost;
  if (st.budget < cost) throw new Error("Budget de l'antenne insuffisant ce mois-ci.");
  return { ...state, command: { ...state.command, station: { ...st, budget: st.budget - cost, modules: [...st.modules, module] } }, updatedAt: Date.now() };
}

export const hasModule = (state: GameState, m: StationModule) => Boolean(state.command.station?.modules.includes(m));

/** Confier une mission proposée à une équipe sans y aller soi-même. */
export function delegateOffer(state: GameState, offerId: string, teamIds: string[], rng: Rng = Math.random): GameState {
  if (!can(state.character.rank, "delegate")) throw new Error("Seuls les chefs de station et les Contrôleurs confient des missions.");
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error("Mission introuvable.");
  const day = state.world.day;
  const team = state.roster.filter((o) => teamIds.includes(o.id) && isAvailable(o, day) && o.agency === state.character.identity.agency && o.role !== "cadet").slice(0, 4);
  if (!team.length) throw new Error("Il faut au moins un agent disponible.");
  const chance = Math.min(0.97, delegateChance(state, offer, team) + (hasModule(state, "salle_crise") ? 0.1 : 0));
  const returnDay = day + randInt(14, 28, rng);
  return {
    ...state,
    offers: state.offers.filter((o) => o.id !== offerId),
    roster: state.roster.map((o) => (team.some((t) => t.id === o.id) ? { ...o, status: "en_mission", busyUntil: returnDay, cityId: offer.cityId, positionDay: day } : o)),
    command: { ...state.command, delegated: [...state.command.delegated, { offerId, title: offer.title.split(" — ")[0], team: team.map((t) => t.id), returnDay, chance }] },
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Théâtre                                                             */
/* ------------------------------------------------------------------ */

export function openTheatre(state: GameState, region: RegionId, rng: Rng = Math.random): GameState {
  if (!can(state.character.rank, "region")) throw new Error("Il faut être Contrôleur.");
  if (state.command.theatre) throw new Error("Tu supervises déjà une région.");
  const cities = citiesOfRegion(region).filter((c) => findCountry(c.country)?.bloc !== "hostile");
  const stations = cities
    .sort(() => rng() - 0.5)
    .slice(0, 3)
    .map((c) => c.id);
  const theatre: Theatre = { region, budget: 2_000_000, stations, projects: [], posture: "renseignement" };
  return { ...state, command: { ...state.command, theatre }, updatedAt: Date.now() };
}

export function setPosture(state: GameState, posture: Theatre["posture"]): GameState {
  const th = state.command.theatre;
  if (!th) throw new Error("Pas de théâtre.");
  return { ...state, command: { ...state.command, theatre: { ...th, posture } }, updatedAt: Date.now() };
}

/** Lancer un projet de recherche : il débloque un gadget de niveau 3 pour tout le monde. */
export function startProject(state: GameState, gadgetId: string, rng: Rng = Math.random): GameState {
  const th = state.command.theatre;
  if (!th) throw new Error("Pas de théâtre.");
  const g = findGadget(gadgetId);
  if (!g || g.tier < 3) throw new Error("Projet inconnu.");
  if (state.command.unlocked.includes(g.id) || th.projects.some((p) => p.gadget === g.id)) throw new Error("Déjà en cours ou débloqué.");
  if (th.projects.length >= 2) throw new Error("Deux projets au plus en même temps.");
  const cost = 250_000;
  if (th.budget < cost) throw new Error("Budget du théâtre insuffisant.");
  const project: Project = { id: uid(rng), gadget: g.id, progress: 0, required: randInt(4, 7, rng) };
  return { ...state, command: { ...state.command, theatre: { ...th, budget: th.budget - cost, projects: [...th.projects, project] } }, updatedAt: Date.now() };
}

export const RESEARCHABLE = () => GADGETS.filter((g) => g.tier === 3);

/* ------------------------------------------------------------------ */
/* Agence                                                              */
/* ------------------------------------------------------------------ */

export const HQ_MODULES: Record<HqModule, { label: string; effect: string }> = {
  laboratoire: { label: "Laboratoire", effect: "Projets de recherche plus rapides, gadgets plus fiables." },
  academie: { label: "Académie", effect: "De meilleures recrues chaque année." },
  salle_crise: { label: "Salle de crise", effect: "Toutes les missions déléguées réussissent plus souvent." },
  hangar: { label: "Hangar", effect: "Extractions et projections plus rapides partout." },
  infirmerie: { label: "Infirmerie", effect: "Les blessés reviennent plus vite." },
  archives: { label: "Archives", effect: "Plus de renseignement au départ de chaque mission." },
};

export function initAgency(state: GameState): AgencyCommand {
  const branches = Object.fromEntries(AGENCIES[state.character.identity.agency].branches.map((b) => [b.id, 30]));
  return { hq: { laboratoire: 2, academie: 2, salle_crise: 2, hangar: 2, infirmerie: 2, archives: 2 }, branchBudget: branches, councilFavor: 50 };
}

export function upgradeHq(state: GameState, module: HqModule): GameState {
  const ag = state.command.agency;
  if (!ag) throw new Error("Il faut diriger l'agence.");
  const level = ag.hq[module];
  if (level >= 5) throw new Error("Niveau maximal.");
  const cost = 10 * level;
  if (ag.councilFavor < cost) throw new Error(`Il faut ${cost} de crédit auprès des gouvernements.`);
  return { ...state, command: { ...state.command, agency: { ...ag, councilFavor: ag.councilFavor - cost, hq: { ...ag.hq, [module]: level + 1 } } }, updatedAt: Date.now() };
}

export function setBranchBudget(state: GameState, branch: string, value: number): GameState {
  const ag = state.command.agency;
  if (!ag) throw new Error("Il faut diriger l'agence.");
  return { ...state, command: { ...state.command, agency: { ...ag, branchBudget: { ...ag.branchBudget, [branch]: Math.max(5, Math.min(80, Math.round(value))) } } }, updatedAt: Date.now() };
}

/** Ce que la Branche pense de toi : il conditionne son soutien en mission. */
export const branchFavor = (state: GameState, branch: string) => state.command.branchFavor?.[branch] ?? 0;

export function shiftBranchFavor(state: GameState, branch: string, delta: number): GameState {
  const cur = branchFavor(state, branch);
  return { ...state, command: { ...state.command, branchFavor: { ...state.command.branchFavor, [branch]: Math.max(-100, Math.min(100, cur + delta)) } } };
}

/** Ce qui s'ouvre au joueur quand il monte en grade. */
export function commandOnPromotion(state: GameState): GameState {
  const rank = state.character.rank;
  if (can(rank, "agency") && !state.command.agency) return { ...state, command: { ...state.command, agency: initAgency(state) } };
  return state;
}

/** Renouvellement mensuel des budgets. */
export function monthlyCommand(state: GameState): GameState {
  let command = state.command;
  if (command.station) {
    const base = Math.round(STATION_BUDGET * fundingFactor(state.world.geo, state.character.identity.agency));
    command = { ...command, station: { ...command.station, budget: Math.max(command.station.budget, 0) + base } };
  }
  if (command.theatre) {
    const posture = command.theatre.posture;
    command = { ...command, theatre: { ...command.theatre, budget: command.theatre.budget + (posture === "action" ? 600_000 : 500_000) } };
  }
  return { ...state, command };
}
