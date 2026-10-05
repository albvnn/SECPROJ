/**
 * Le calendrier : les vrais rendez-vous du monde (sommets, élections, grands événements)
 * et ceux du Concordat (Conseil des Trois, Jeux de Lucerne, remise des Brevets).
 */
import { AGENCIES } from "@/lib/game/agencies";
import { SKILLS } from "@/lib/game/rules";
import { addDays, parseIso } from "@/lib/game/calendar";
import { d6, uid, type Rng } from "@/lib/game/rng";
import type { AgencyId, GameState } from "@/lib/game/types";
import { findCity, findCountry } from "./geo";
import { addNews, shiftDiplomacy, shiftTension } from "./world";

export interface AgendaEvent {
  id: string;
  name: string;
  /** Chaque année (mois 1-12, jour) ou à une date précise (AAAA-MM-JJ). */
  yearly?: { month: number; day: number };
  months?: number[];
  date?: string;
  length: number;
  cityId?: string;
  kind: "sommet" | "election" | "sport" | "concordat";
  /** Dépêche publique. */
  news?: string;
  tension?: number;
  /** Type de menace qui se greffe sur l'événement. */
  template?: string;
}

export const AGENDA: AgendaEvent[] = [
  { id: "davos", name: "Forum économique de Davos", yearly: { month: 1, day: 19 }, length: 5, cityId: "davos", kind: "sommet", news: "Ouverture du Forum de Davos : chefs d'État et milliardaires sous très haute sécurité.", tension: 2, template: "gala" },
  { id: "munich", name: "Conférence de Munich sur la sécurité", yearly: { month: 2, day: 13 }, length: 3, cityId: "munich", kind: "sommet", news: "Conférence de Munich : les ministres de la Défense étalent leurs désaccords.", tension: 3, template: "assassinat" },
  { id: "onu", name: "Assemblée générale des Nations unies", yearly: { month: 9, day: 22 }, length: 7, cityId: "new_york", kind: "sommet", news: "New York : la semaine de haut niveau de l'Assemblée générale de l'ONU s'ouvre dans un climat tendu.", tension: 2, template: "assassinat" },
  { id: "bresil", name: "Élection présidentielle au Brésil", date: "2026-10-04", length: 22, cityId: "sao_paulo", kind: "election", news: "Brésil : premier tour de la présidentielle, sur fond d'accusations d'ingérence étrangère.", tension: 4, template: "cyber" },
  { id: "midterms", name: "Élections de mi-mandat aux États-Unis", date: "2026-11-03", length: 2, cityId: "washington", kind: "election", news: "États-Unis : élections de mi-mandat sous la menace de cyberattaques.", tension: 4, template: "cyber" },
  { id: "cop31", name: "COP31 à Antalya", date: "2026-11-09", length: 12, cityId: "antalya", kind: "sommet", news: "Antalya : ouverture de la COP31, les manifestants affluent.", tension: 2, template: "sabotage" },
  { id: "g20_2026", name: "Sommet du G20 à Miami", date: "2026-12-14", length: 2, cityId: "miami", kind: "sommet", news: "Miami : le G20 s'ouvre sous une sécurité sans précédent.", tension: 3, template: "assassinat" },
  { id: "france2027", name: "Élection présidentielle française", date: "2027-04-11", length: 15, cityId: "paris", kind: "election", news: "France : premier tour de la présidentielle ; Moscou accusé de désinformation massive.", tension: 4, template: "cyber" },
  { id: "jo2028", name: "Jeux olympiques de Los Angeles", date: "2028-07-14", length: 17, cityId: "los_angeles", kind: "sport", news: "Los Angeles : cérémonie d'ouverture des Jeux olympiques sous un dôme de drones.", tension: 3, template: "otage" },
  { id: "coupe2030", name: "Coupe du monde de football", date: "2030-06-13", length: 32, cityId: "madrid", kind: "sport", news: "Coup d'envoi de la Coupe du monde entre Espagne, Portugal et Maroc.", tension: 2, template: "arme" },
  { id: "conseil", name: "Conseil des Trois", months: [1, 4, 7, 10], yearly: { month: 1, day: 3 }, length: 2, cityId: "lucerne", kind: "concordat" },
  { id: "jeux", name: "Jeux de Lucerne", yearly: { month: 7, day: 10 }, length: 7, cityId: "lucerne", kind: "concordat" },
  { id: "brevets", name: "Remise des Brevets", yearly: { month: 6, day: 28 }, length: 1, kind: "concordat" },
];

/** Les événements qui commencent entre deux dates (exclue, incluse). */
export function eventsBetween(fromIso: string, toIso: string): { event: AgendaEvent; start: string }[] {
  const from = parseIso(fromIso).getTime();
  const to = parseIso(toIso).getTime();
  const out: { event: AgendaEvent; start: string }[] = [];
  const years = [parseIso(fromIso).getUTCFullYear(), parseIso(toIso).getUTCFullYear()];
  for (const e of AGENDA) {
    const starts: string[] = [];
    if (e.date) starts.push(e.date);
    if (e.yearly)
      for (const y of new Set(years))
        for (const m of e.months ?? [e.yearly.month]) starts.push(`${y}-${String(m).padStart(2, "0")}-${String(e.yearly.day).padStart(2, "0")}`);
    for (const st of starts) {
      const t = parseIso(st).getTime();
      if (t > from && t <= to) out.push({ event: e, start: st });
    }
  }
  return out;
}

/** Les rendez-vous des semaines à venir (pour l'interface). */
export function upcoming(state: GameState, days = 120): { event: AgendaEvent; start: string; inDays: number }[] {
  const today = addDays(state.world.startDate ?? "2026-10-05", state.world.day);
  return eventsBetween(today, addDays(today, days)).map((x) => ({ ...x, inDays: Math.round((parseIso(x.start).getTime() - parseIso(today).getTime()) / 86_400_000) }));
}

export interface AgendaWeek {
  state: GameState;
  notices: string[];
  event?: string;
}

export function weeklyAgenda(initial: GameState, fromIso: string, toIso: string, rng: Rng = Math.random): AgendaWeek {
  let state = initial;
  let geo = state.world.geo;
  const notices: string[] = [];
  let event: string | undefined;
  const me = state.character.identity.agency;
  const day = state.world.day;

  for (const { event: e } of eventsBetween(fromIso, toIso)) {
    const city = findCity(e.cityId);
    const region = city ? findCountry(city.country)?.region : undefined;
    if (e.news) geo = addNews(geo, { day, region: region ?? "europe", text: e.news });
    if (region && e.tension) geo = shiftTension(geo, region, e.tension);
    // Un grand rendez-vous attire toujours quelqu'un qui veut le faire dérailler.
    if (e.template && city && region && rng() < 0.7) {
      geo = {
        ...geo,
        threats: [...geo.threats, { id: uid(rng), faction: pickFaction(region, rng), region, cityId: city.id, template: e.template, title: `menace sur ${e.name}`, progress: 55, known: true }],
      };
      notices.push(`${e.name} : une menace identifiée`);
    }
    if (e.id === "conseil") {
      // Le Conseil des Trois : on négocie, on se menace, on échange des prisonniers.
      for (const [a, b] of [
        ["argos", "meridian"],
        ["meridian", "monsoon"],
        ["argos", "monsoon"],
      ] as [AgencyId, AgencyId][])
        geo = shiftDiplomacy(geo, a, b, Math.round((rng() - 0.5) * 12));
      notices.push("Le Conseil des Trois s'est réuni à Lucerne");
      if (state.character.rank === "controleur" || state.character.rank === "directeur" || state.character.rank === "doyen")
        event = "Le Conseil des Trois se réunit dans la villa de Lucerne, et le personnage y est convié : sourires, menaces voilées, marchandages d'agents capturés.";
    }
    if (e.id === "jeux" && state.character.rank === "aspirant") {
      // Les Jeux de Lucerne : trois épreuves, contre les cadets des deux autres agences.
      const c = state.character;
      const score = (skills: (keyof typeof c.skills)[]) => Math.max(...skills.map((s) => c.attributes[SKILLS[s].attribute] + c.skills[s].rank)) + d6(rng) + d6(rng);
      const mine = score(["ombre", "doigte"]) + score(["athletisme", "vivacite"]) + score(["tactique", "sangfroid"]);
      const rivals = [0, 0].map(() => 3 * (7 + d6(rng)));
      const place = 1 + rivals.filter((r) => r > mine).length;
      const others = (["argos", "meridian", "monsoon"] as AgencyId[]).filter((a) => a !== me).map((a) => AGENCIES[a].name).join(" et ");
      if (place === 1) {
        state = { ...state, character: { ...state.character, reputation: Math.min(100, c.reputation + 10), skillPoints: c.skillPoints + 1, distinctions: [...c.distinctions, { name: "Vainqueur des Jeux de Lucerne", reason: `Premier devant les cadets de ${others}` }] } };
        notices.push("Jeux de Lucerne : victoire ! (réputation +10, +1 point de compétence)");
      } else notices.push(`Jeux de Lucerne : ${place}ᵉ place`);
      event = `Les Jeux de Lucerne ont eu lieu (infiltration, poursuite, stratégie) face aux cadets de ${others} : le personnage termine ${place === 1 ? "PREMIER" : `${place}ᵉ`}. Raconte les épreuves, les rivaux, la trêve tendue.`;
    }
    if (e.id === "brevets" && state.character.rank === "aspirant") notices.push("Remise des Brevets : les aînés de l'Académie partent dans les Stations");
  }
  return { state: { ...state, world: { ...state.world, geo } }, notices, event };
}

function pickFaction(region: string, rng: Rng): string {
  const pool: Record<string, string[]> = {
    europe: ["russes", "ouroboros", "gaia", "promethee"],
    amerique_nord: ["chinois", "promethee", "corona"],
    amerique_latine: ["corona", "ouroboros"],
    mediterranee: ["ouroboros", "iraniens", "koschei"],
  };
  const list = pool[region] ?? ["ouroboros", "russes", "chinois"];
  return list[Math.floor(rng() * list.length)];
}
