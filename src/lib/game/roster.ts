import { AGENCIES, AGENCY_IDS } from "./agencies";
import { randomName } from "./names";
import { pick, pickWeighted, randInt, shuffle, uid, type Rng } from "./rng";
import { RANKS, SKILLS } from "./rules";
import type { AgencyId, Gender, GameState, Operative, OperativeRole, RankId, SkillId } from "./types";
import { CITIES, findCountryByName } from "@/lib/world/geo";

/** Défauts et qualités des agents : ils pèsent en mission et dans les relations. */
export const OPERATIVE_TRAITS: Record<string, { label: string; description: string; assist?: Partial<Record<SkillId, number>>; exposure?: number; alert?: number; affinity?: number }> = {
  tete_brulee: { label: "Tête brûlée", description: "Fonce toujours. Redoutable au contact, désastreux pour la discrétion.", assist: { combat: 1, athletisme: 1 }, alert: 5 },
  meticuleux: { label: "Méticuleux", description: "Ne laisse jamais de trace, mais exaspère tout le monde.", exposure: -5 },
  bavard: { label: "Bavard", description: "Charmant et drôle. Parle trop.", assist: { eloquence: 1 }, exposure: 5 },
  loyal: { label: "Loyal", description: "Couvre ses équipiers quoi qu'il en coûte.", affinity: 2 },
  ambitieux: { label: "Ambitieux", description: "Excellent, et il le sait. Il vise ta place.", affinity: 0.5 },
  froid: { label: "Glacial", description: "Aucune émotion visible. Parfait sous pression, difficile à aimer.", assist: { sangfroid: 1 } },
  genie: { label: "Génie technique", description: "Répare tout, pirate tout, oublie de manger.", assist: { machine: 2 } },
  veteran: { label: "Vieux routier", description: "A tout vu. Ses conseils valent de l'or ; sa patience, beaucoup moins.", assist: { tactique: 1, instinct: 1 } },
  anxieux: { label: "Anxieux", description: "Voit le danger partout. Souvent à raison.", assist: { alerte: 1 }, alert: -3 },
  charmeur: { label: "Charmeur", description: "Ouvre toutes les portes avec un sourire.", assist: { eloquence: 1, masque: 1 } },
};

const TRAIT_IDS = Object.keys(OPERATIVE_TRAITS);

/** Le personnel de soutien qui part en mission avec les agents. */
const SUPPORT_JOBS: { job: [string, string]; skills: SkillId[] }[] = [
  { job: ["pilote", "pilote"], skills: ["pilotage", "sangfroid", "alerte"] },
  { job: ["technicien", "technicienne"], skills: ["machine", "doigte", "logique"] },
  { job: ["analyste de terrain", "analyste de terrain"], skills: ["logique", "archives", "babel"] },
  { job: ["tireur d'élite", "tireuse d'élite"], skills: ["precision", "sangfroid", "regard"] },
  { job: ["médecin de terrain", "médecin de terrain"], skills: ["medecine", "sangfroid", "endurance"] },
  { job: ["chauffeur", "chauffeuse"], skills: ["pilotage", "vivacite", "alerte"] },
  { job: ["officier traitant", "officière traitante"], skills: ["empathie", "eloquence", "masque"] },
  { job: ["plongeur de combat", "plongeuse de combat"], skills: ["athletisme", "endurance", "combat"] },
  { job: ["hacker", "hackeuse"], skills: ["machine", "logique", "vivacite"] },
  { job: ["garde du corps", "garde du corps"], skills: ["combat", "alerte", "force"] },
];

function person(agency: AgencyId, rng: Rng) {
  const def = AGENCIES[agency];
  const member = pick(def.members, rng);
  const gender = pickWeighted<Gender>(["garcon", "fille", "nonbinaire"], (g) => (g === "nonbinaire" ? 0.6 : 5), rng);
  const { first, last } = randomName(member.country, gender, rng);
  return { name: `${first} ${last}`, nationality: member.country, gender };
}

function homeCity(agency: AgencyId, nationality: string, rng: Rng): string {
  const home = findCountryByName(nationality);
  const cities = CITIES.filter((c) => c.country === home?.id && !c.tags?.includes("secret"));
  return cities.length ? pick(cities, rng).id : AGENCIES[agency].hqCity;
}

function skillsFrom(list: SkillId[], base: [number, number], rng: Rng): Partial<Record<SkillId, number>> {
  const skills: Partial<Record<SkillId, number>> = {};
  for (const s of list) skills[s] = randInt(base[0], base[1], rng);
  const extra = pick(Object.keys(SKILLS) as SkillId[], rng);
  if (!skills[extra]) skills[extra] = randInt(base[0] - 1, base[1] - 2, rng);
  return skills;
}

function make(agency: AgencyId, role: OperativeRole, rank: RankId, rng: Rng, day: number, extra: Partial<Operative> = {}): Operative {
  const p = person(agency, rng);
  const order = RANKS[rank].order;
  return {
    id: uid(rng),
    name: p.name,
    codename: "",
    agency,
    nationality: p.nationality,
    gender: p.gender,
    age: randInt(22, 28, rng) + order * randInt(2, 4, rng),
    rank,
    role,
    skills: {},
    trait: pick(TRAIT_IDS, rng),
    status: "apte",
    fatigue: randInt(0, 30, rng),
    affinity: randInt(-10, 10, rng),
    missionsWithPlayer: 0,
    cityId: AGENCIES[agency].hqCity,
    positionDay: day,
    ...extra,
  };
}

/** Le Cercle d'une agence : un titulaire par siège (le plus ancien est Doyen). Ils sont presque toujours en mission. */
function circle(agency: AgencyId, rng: Rng, day: number): Operative[] {
  const def = AGENCIES[agency];
  const hot = CITIES.filter((c) => !c.tags?.includes("secret"));
  const members = def.seats.map((seat) => {
    const away = rng() < 0.7;
    return make(agency, "titulaire", "titulaire", rng, day, {
      seat: seat.id,
      codename: seat.name.replace(/^le Banc d(?:e |')/, ""),
      age: randInt(24, 46, rng),
      skills: skillsFrom(seat.specialty, [6, 9], rng),
      status: away ? "en_mission" : "apte",
      busyUntil: away ? day + randInt(5, 40, rng) : undefined,
      cityId: away ? pick(hot, rng).id : def.hqCity,
    });
  });
  const eldest = [...members].sort((a, b) => b.age - a.age)[0];
  eldest.rank = "doyen";
  return members;
}

/** Les Stations : un chef et un officier par ville (l'agence du joueur), quelques officiers pour les rivales. */
function stations(agency: AgencyId, full: boolean, rng: Rng, day: number): Operative[] {
  const def = AGENCIES[agency];
  const out: Operative[] = [];
  const cities = full ? def.stations : shuffle(def.stations, rng).slice(0, 4);
  for (const city of cities) {
    const pool = shuffle(Object.keys(SKILLS) as SkillId[], rng).slice(0, 3);
    if (full) out.push(make(agency, "officier", "chef_station", rng, day, { station: city, cityId: city, skills: skillsFrom(pool, [5, 7], rng) }));
    out.push(make(agency, "officier", "agent", rng, day, { station: city, cityId: city, age: randInt(19, 27, rng), skills: skillsFrom(shuffle(Object.keys(SKILLS) as SkillId[], rng).slice(0, 3), [4, 6], rng) }));
  }
  return out;
}

function supportStaff(agency: AgencyId, rng: Rng, day: number): Operative[] {
  return SUPPORT_JOBS.map((j) => {
    const op = make(agency, "soutien", "agent", rng, day, { skills: skillsFrom(j.skills, [5, 8], rng) });
    return { ...op, job: j.job[op.gender === "fille" ? 1 : 0] };
  });
}

/** Les cadets de l'Académie : une dizaine en tout, dont un ou deux de la promotion du joueur. */
function cadets(agency: AgencyId, playerAge: number, rng: Rng, day: number): Operative[] {
  const ages = [playerAge, 14, 14, 15, 15, 16, 16, 17, 17];
  return ages.map((age) => {
    const op = make(agency, "cadet", "aspirant", rng, day, {
      age,
      skills: skillsFrom(shuffle(Object.keys(SKILLS) as SkillId[], rng).slice(0, 3), [3, 5], rng),
      cityId: AGENCIES[agency].academyCity,
      affinity: randInt(-5, 15, rng),
    });
    return op;
  });
}

/** L'effectif de départ : l'agence du joueur au complet, et le Cercle des deux autres. */
export function generateRoster(playerAgency: AgencyId, playerAge: number, day = 0, rng: Rng = Math.random): Operative[] {
  const roster: Operative[] = [
    ...cadets(playerAgency, playerAge, rng, day),
    ...circle(playerAgency, rng, day),
    ...stations(playerAgency, true, rng, day),
    ...supportStaff(playerAgency, rng, day),
  ];
  for (const other of AGENCY_IDS.filter((a) => a !== playerAgency)) roster.push(...circle(other, rng, day), ...stations(other, false, rng, day));
  return roster;
}

/** Un officier promu pour combler un siège vacant. */
export function recruitOperative(state: GameState, agency: AgencyId, rng: Rng = Math.random): Operative {
  return make(agency, "officier", "agent", rng, state.world.day, { skills: skillsFrom(shuffle(Object.keys(SKILLS) as SkillId[], rng).slice(0, 3), [4, 6], rng) });
}

export function operativeSkill(o: Operative, skill: SkillId): number {
  return o.skills[skill] ?? 2 + Math.floor(RANKS[o.rank].order / 2);
}

/** Meilleure compétence de l'agent parmi une liste. */
export function bestSkill(o: Operative, skills: SkillId[]): { skill: SkillId; value: number } {
  return skills.map((s) => ({ skill: s, value: operativeSkill(o, s) + (OPERATIVE_TRAITS[o.trait]?.assist?.[s] ?? 0) })).sort((a, b) => b.value - a.value)[0];
}

export const isAvailable = (o: Operative, day: number) => o.status === "apte" && (!o.busyUntil || o.busyUntil <= day);

/** Les cadets de l'Académie du joueur. */
export const chambree = (state: GameState) => state.roster.filter((o) => o.agency === state.character.identity.agency && o.role === "cadet");

export function operativeLabel(o: Operative): string {
  return o.codename ? `« ${o.codename} » (${o.name})` : o.name;
}

/** Ce qu'il fait dans l'organisation, en quelques mots. */
export function operativeTitle(o: Operative): string {
  const agency = AGENCIES[o.agency];
  if (o.role === "titulaire") return `${o.rank === "doyen" ? "Doyen des" : "Titulaire,"} ${agency.circle.name}`;
  if (o.role === "cadet") return `cadet de ${agency.name}`;
  if (o.role === "soutien") return `${o.job ?? "soutien"}, ${agency.name}`;
  const city = CITIES.find((c) => c.id === o.station)?.name;
  return `${o.rank === "chef_station" ? "chef de la Station" : "officier de la Station"}${city ? ` de ${city}` : ""}`;
}
