/**
 * Le besoin d'en connaître : ce que le personnage sait du monde dépend de son accréditation
 * (son grade), de ce qu'il a vu de ses yeux, et de ce qu'il a demandé à la Branche d'analyse.
 */
import type { AgencyId, GameState, Operative, RankId, Threat } from "./types";
import { FACTIONS } from "@/lib/world/factions";
import { findCity, findCountry } from "@/lib/world/geo";

/* ------------------------------------------------------------------ */
/* Accréditation                                                       */
/* ------------------------------------------------------------------ */

export interface ClearanceDef {
  level: number;
  label: string;
  /** Ce que ce niveau ouvre. */
  grants: string;
}

export const CLEARANCES: ClearanceDef[] = [
  { level: 0, label: "Aucune", grants: "Tu ne sais même pas pour qui tu passes ces épreuves." },
  { level: 1, label: "Académie", grants: "Ta chambrée, la légende du Cercle, les dépêches publiques. Les instructeurs peuvent te dire ce qui t'attend en Opération Jeunesse." },
  { level: 2, label: "Station", grants: "La région de ta Station et celles où tu as des sources, les moyens de ton agence, tes collègues. La Branche d'analyse répond à tes demandes." },
  { level: 3, label: "Cercle", grants: "Toutes les menaces identifiées, les dossiers des factions, les moyens des trois agences, les membres de ton Cercle." },
  { level: 4, label: "Région", grants: "Toutes les régions, tout l'effectif de ton agence, l'état des Cercles rivaux." },
  { level: 5, label: "Direction", grants: "Tout ce que l'agence sait, y compris les titulaires des agences rivales." },
];

const RANK_CLEARANCE: Record<RankId, number> = {
  prospect: 0,
  aspirant: 1,
  agent: 2,
  titulaire: 3,
  chef_station: 3,
  doyen: 4,
  controleur: 4,
  directeur: 5,
};

export const clearanceOf = (rank: RankId) => RANK_CLEARANCE[rank] ?? 0;
export const clearance = (state: GameState) => clearanceOf(state.character.rank);
export const clearanceDef = (level: number) => CLEARANCES[Math.max(0, Math.min(CLEARANCES.length - 1, level))];

/** Un rapport régional reste valable six mois. */
export const REPORT_DAYS = 180;

export const regionOfCity = (cityId: string | null | undefined) => findCountry(findCity(cityId)?.country ?? "")?.region;

/** Les régions que le personnage connaît, et pourquoi. */
export function knownRegions(state: GameState): Map<string, string> {
  const out = new Map<string, string>();
  const add = (region: string | undefined, why: string) => region && !out.has(region) && out.set(region, why);
  const c = state.character;
  add(regionOfCity(state.world.cityId), "tu y es");
  add(regionOfCity(c.station), "ta Station");
  add(regionOfCity(state.command.station?.cityId), "ta Station");
  add(state.command.theatre?.region, "ta région");
  if (state.mission) add(state.mission.region, "ta mission");
  for (const a of state.command.assets) if (a.status === "actif") add(regionOfCity(a.cityId), `ta source ${a.name}`);
  for (const [r, day] of Object.entries(state.knowledge?.regions ?? {}))
    if (state.world.day - day <= REPORT_DAYS) add(r, `rapport du jour ${day}`);
  return out;
}

export function regionKnown(state: GameState, region: string): boolean {
  return clearance(state) >= 4 || knownRegions(state).has(region);
}

/** Une menace dont on te confie le dossier se voit toujours. */
const concernsPlayer = (state: GameState, t: Threat) => state.offers.some((o) => o.threat === t.id) || state.mission?.threat === t.id;

/** La menace est identifiée, et tu as le droit d'en connaître. */
export function threatVisible(state: GameState, t: Threat): boolean {
  if (concernsPlayer(state, t) || state.knowledge?.threats?.[t.id] !== undefined) return true;
  if (!t.known || clearance(state) < 2) return false;
  return clearance(state) >= 3 || regionKnown(state, t.region);
}

/** Une rumeur : quelque chose se prépare dans une région que tu surveilles. */
export function rumourVisible(state: GameState, t: Threat): boolean {
  return !threatVisible(state, t) && clearance(state) >= 2 && regionKnown(state, t.region);
}

export function factionOpen(state: GameState, faction: string): boolean {
  return clearance(state) >= 3 || (state.knowledge?.factions ?? []).includes(faction);
}

export function satisfactionVisible(state: GameState, agency: AgencyId): boolean {
  return clearance(state) >= (agency === state.character.identity.agency ? 2 : 3);
}

export function circleVisible(state: GameState, agency: AgencyId): boolean {
  if ((state.knowledge?.circles ?? []).includes(agency)) return true;
  return clearance(state) >= (agency === state.character.identity.agency ? 1 : 4);
}

/** Connais-tu le dossier de cet agent (compétences, caractère, position) ? */
export function operativeKnown(state: GameState, o: Operative): boolean {
  const c = state.character;
  const lvl = clearance(state);
  if (o.missionsWithPlayer > 0 || (state.knowledge?.operatives ?? []).includes(o.id)) return true;
  if (o.agency !== c.identity.agency) return lvl >= 5 && o.role === "titulaire";
  if (lvl >= 4 || state.command.squad.includes(o.id)) return true;
  if (o.role === "cadet") return true;
  if (o.station && o.station === c.station) return true;
  if (o.role === "titulaire") return lvl >= 3;
  if (o.role === "soutien") return lvl >= 2;
  return false;
}

/** Figure-t-il seulement dans tes listes ? Les agents rivaux qu'on n'a jamais croisés n'existent pas pour toi. */
export function operativeListed(state: GameState, o: Operative): boolean {
  return o.agency === state.character.identity.agency || operativeKnown(state, o);
}

/** Ce que tu ignores, en chiffres : de quoi donner envie de monter. */
export function hiddenCounts(state: GameState) {
  const geo = state.world.geo;
  const threats = geo.threats.filter((t) => !threatVisible(state, t) && !rumourVisible(state, t)).length;
  const factions = FACTIONS.filter((f) => !factionOpen(state, f.id)).length;
  return { threats, factions };
}
