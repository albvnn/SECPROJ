/**
 * L'économie personnelle : ce que la solde permet d'acheter, et ce que ça coûte chaque semaine.
 */
import type { GameState, SkillId } from "./types";

export interface PossessionDef {
  id: string;
  name: string;
  category: "logement" | "vehicule" | "style" | "formation" | "famille";
  description: string;
  /** Prix d'achat (0 = abonnement seul). */
  price: number;
  /** Entretien hebdomadaire. */
  upkeep: number;
  /** Ce que ça change. */
  effect: string;
  /** Effets mécaniques. */
  restHealth?: number;
  restMorale?: number;
  coverPerWeek?: number;
  /** Bonus de jet sur une compétence dans certaines étapes. */
  skillBonus?: { skill: SkillId; value: number };
  languageBoost?: number;
  restDays?: number;
  /** Remplace un autre bien de la même catégorie. */
  replaces?: string[];
  minRank?: "agent";
}

export const POSSESSIONS: PossessionDef[] = [
  { id: "studio", name: "Studio en ville", category: "logement", description: "Vingt mètres carrés à toi, loin des dortoirs et des casernes.", price: 0, upkeep: 220, effect: "Repos : santé +1. Ta vie officielle a enfin une adresse (couverture +3/semaine).", restHealth: 1, coverPerWeek: 3, minRank: "agent" },
  { id: "appartement", name: "Appartement", category: "logement", description: "Un vrai appartement, avec une vue, et une porte blindée discrète.", price: 0, upkeep: 650, effect: "Repos : santé +2, moral +1. Couverture +5/semaine.", restHealth: 2, restMorale: 1, coverPerWeek: 5, replaces: ["studio"], minRank: "agent" },
  { id: "planque", name: "Planque personnelle", category: "logement", description: "Un second appartement que personne ne connaît, pas même l'agence.", price: 45000, upkeep: 150, effect: "Récupération après mission raccourcie d'une semaine.", restDays: 7, minRank: "agent" },
  { id: "voiture", name: "Voiture de sport d'occasion", category: "vehicule", description: "Rapide, discrète, assurée sous un faux nom.", price: 28000, upkeep: 120, effect: "Pilotage +1 en poursuite et à l'extraction.", skillBonus: { skill: "pilotage", value: 1 }, minRank: "agent" },
  { id: "moto", name: "Moto", category: "vehicule", description: "Pour se faufiler là où les voitures restent coincées.", price: 9000, upkeep: 50, effect: "Vivacité +1 en poursuite.", skillBonus: { skill: "vivacite", value: 1 }, replaces: [], minRank: "agent" },
  { id: "garde_robe", name: "Garde-robe sur mesure", category: "style", description: "Trois costumes, deux robes de soirée, des chaussures qui ne font pas de bruit.", price: 9500, upkeep: 30, effect: "Tenue +1 dans les étapes mondaines.", skillBonus: { skill: "tenue", value: 1 } },
  { id: "montre", name: "Montre de collection", category: "style", description: "Le genre d'objet qui ouvre les portes des cercles fermés.", price: 15000, upkeep: 0, effect: "Éloquence +1 dans les étapes mondaines.", skillBonus: { skill: "eloquence", value: 1 } },
  { id: "professeur", name: "Professeur particulier de langues", category: "formation", description: "Trois soirs par semaine, en visio ou en personne.", price: 0, upkeep: 180, effect: "Apprentissage des langues +10 par semaine.", languageBoost: 10 },
  { id: "salle", name: "Club de combat privé", category: "formation", description: "Un dojo de quartier où personne ne pose de questions.", price: 0, upkeep: 60, effect: "Combat +1 en mission (entretien régulier).", skillBonus: { skill: "combat", value: 1 } },
  { id: "famille", name: "Aider ta famille", category: "famille", description: "Un virement chaque semaine, présenté comme une bourse ou un salaire.", price: 0, upkeep: 300, effect: "Moral +1, couverture +4/semaine : ils ne posent plus de questions.", restMorale: 1, coverPerWeek: 4 },
];

export const findPossession = (id: string) => POSSESSIONS.find((p) => p.id === id);

export const owns = (state: GameState, id: string) => state.character.possessions?.includes(id) ?? false;

export function weeklyUpkeep(state: GameState): number {
  return (state.character.possessions ?? []).reduce((n, id) => n + (findPossession(id)?.upkeep ?? 0), 0);
}

export function buyPossession(state: GameState, id: string): GameState {
  const p = findPossession(id);
  if (!p) throw new Error("Bien inconnu.");
  const c = state.character;
  if (p.minRank && (c.rank === "prospect" || c.rank === "aspirant")) throw new Error("Pas avant le Brevet : l'Académie fournit tout.");
  if (owns(state, id)) throw new Error("Tu l'as déjà.");
  const cost = p.price + p.upkeep;
  if (c.money < cost) throw new Error(`Il faut ${cost} € (achat et première semaine).`);
  const possessions = [...(c.possessions ?? []).filter((x) => !(p.replaces ?? []).includes(x)), id];
  return { ...state, character: { ...c, money: c.money - cost, possessions }, updatedAt: Date.now() };
}

/** Revendre (à moitié prix) ou résilier. */
export function sellPossession(state: GameState, id: string): GameState {
  const p = findPossession(id);
  const c = state.character;
  if (!p || !owns(state, id)) return state;
  return { ...state, character: { ...c, money: c.money + Math.round(p.price / 2), possessions: c.possessions.filter((x) => x !== id) }, updatedAt: Date.now() };
}

/** Bonus de jet apporté par les biens pour cette compétence. */
export function possessionBonus(state: GameState, skill: SkillId): { value: number; label: string } | null {
  for (const id of state.character.possessions ?? []) {
    const p = findPossession(id);
    if (p?.skillBonus?.skill === skill) return { value: p.skillBonus.value, label: p.name };
  }
  return null;
}

/** Paie l'entretien de la semaine ; ce qu'on ne peut plus payer est perdu. */
export function payUpkeep(state: GameState): { state: GameState; notices: string[]; lines: string[] } {
  const c = state.character;
  let money = c.money;
  const kept: string[] = [];
  const notices: string[] = [];
  for (const id of c.possessions ?? []) {
    const p = findPossession(id);
    if (!p) continue;
    if (money >= p.upkeep) {
      money -= p.upkeep;
      kept.push(id);
    } else notices.push(`Impayé : tu perds ${p.name}`);
  }
  const spent = c.money - money;
  return { state: { ...state, character: { ...c, money, possessions: kept } }, notices, lines: spent ? [`Dépenses de la semaine : −${spent} €.`] : [] };
}
