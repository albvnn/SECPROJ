/**
 * La vie hors mission : une semaine = trois créneaux d'activités, résolus par le moteur.
 * Puis le temps passe, le monde bouge, les liens s'usent, les devoirs tombent.
 */
import { AGENCIES, findBranch, findSeat } from "./agencies";
import { RELATION_LIMIT, applyUpdate, currentAge, currentDate, dateOfAge, gainSkillXp, promotionsAvailable, recordProgress, skillTotal } from "./engine";
import { delegateChance, refreshOffers } from "./missions";
import { randomName } from "./names";
import { chance, pick, randInt, uid, type Rng } from "./rng";
import { isAvailable, OPERATIVE_TRAITS, recruitOperative } from "./roster";
import { MISSION_IMPORTANCE, RANKS, SKILLS, can, missionMerit, type Capability } from "./rules";
import type { ActivityChoice, ActivityId, Asset, Duty, GameState, Operative, RankId, Relation, SkillId, WeekReport } from "./types";
import { CITIES, REGIONS, findCity, findCountry, matchCity, type RegionId } from "@/lib/world/geo";
import { GADGETS } from "./gadgets";
import { branchFavor, monthlyCommand, shiftBranchFavor } from "./command";
import { ALL_LANGUAGES, LEGEND_COST, coolHeat, createLegend, healInjuries, inflictInjury, legendCap, speaksLanguage } from "./field";
import { findPossession, payUpkeep } from "./economy";
import { addDays, monthLabel } from "./calendar";
import { weeklyAgenda } from "@/lib/world/agenda";
import { satisfactionOf, weeklyThreats } from "@/lib/world/threats";
import { addNews, shiftDiplomacy, shiftTension, weeklyWorld } from "@/lib/world/world";
import { resolveRequests } from "./sources";
import { bodyWeek } from "./body";
import { pushLedger } from "./ledger";
import { syncWithRoster, weeklyBonds } from "./bonds";
import { weeklyPost } from "./post";

export const SLOTS = 3;

/** Compétences enseignées en cours à l'Académie. */
export const ACADEMIC_SKILLS: SkillId[] = ["babel", "archives", "logique", "medecine", "tactique", "tenue"];

export interface ActivityDef {
  label: string;
  icon: string;
  description: string;
  target?: "skill" | "relation" | "duty" | "city" | "academic" | "agency" | "branch" | "language" | "legend" | "choice" | "region";
  /** Les variantes, pour les activités à choix. */
  options?: { id: string; label: string; hint: string }[];
  /** Réservé à la détention. */
  prison?: boolean;
  /** Ce que le grade doit permettre. */
  cap?: Capability;
  /** Il faut être au moins Officier. */
  officer?: boolean;
  /** Réservé à l'Académie (cadets) ou interdit aux cadets. */
  academy?: boolean;
}

export const ACTIVITIES: Record<ActivityId, ActivityDef> = {
  cours: { label: "Cours", icon: "✎", description: "Langues, sciences, histoire du renseignement. Indispensable pour les examens de saison.", target: "academic", academy: true },
  entrainement: { label: "Entraînement", icon: "▲", description: "Travailler une compétence : +2 d'expérience (+1 sur les compétences de ton siège, +1 à l'Académie). Fatigant.", target: "skill" },
  repos: { label: "Repos", icon: "☾", description: "Dormir, se soigner : santé +3, moral +2, fatigue −35." },
  relation: { label: "Voir quelqu'un", icon: "☎", description: "Entretenir un lien : de visu s'il est dans ta ville (lien +30), sinon à distance (lien +15).", target: "relation" },
  couverture: { label: "Vie officielle", icon: "⌂", description: "Famille, études ou travail de façade : couverture +30. Ceux qui croient à ta vie officielle ont besoin de te voir." },
  loisirs: { label: "Quartier libre", icon: "♪", description: "Souffler : moral +3, fatigue −15. On y fait parfois des rencontres." },
  devoir: { label: "Devoir", icon: "☐", description: "Avancer un devoir en cours (rapport, examen, requalification…).", target: "duty" },
  branche: {
    label: "Branches",
    icon: "⚙",
    description: "Passer du temps avec une Branche : elle t'apprécie davantage (+8), et te le rend (labo : un gadget de plus ; analyse : +1 renseignement de départ ; logistique : couverture +10).",
    target: "branch",
    officer: true,
  },
  informateurs: { label: "Informateurs", icon: "⌖", description: "Recruter un informateur dans une ville, ou entretenir ceux que tu as (fiabilité +15).", target: "city", cap: "informants" },
  escouade: { label: "Tes seconds", icon: "⚑", description: "Former tes deux seconds : fatigue −15, affinité +3, parfois une compétence qui progresse.", cap: "seconds" },
  antenne: { label: "Station", icon: "⌂", description: "Diriger ta Station : renseignement régional +2, discrétion +5.", cap: "station" },
  theatre: { label: "Région", icon: "◈", description: "Superviser ta région : projets de recherche +1, tension régionale −2.", cap: "region" },
  agence: { label: "Agence", icon: "◆", description: "Diriger l'agence : crédit auprès des gouvernements +5, ou détendre une relation avec une agence rivale.", target: "agency", cap: "agency" },
  langue: { label: "Langue", icon: "文", description: "Apprendre une langue : +12 par semaine (plus avec Babel ou un professeur). À 100, tu la parles : elle t'aide sur le terrain.", target: "language" },
  legende: { label: "Légende", icon: "⎔", description: "Construire une fausse identité (2 000 €) ou consolider une légende existante (crédibilité +20).", target: "legend", officer: true },
  resister: { label: "Résister", icon: "✊", description: "Tenir face aux interrogatoires (Sang-froid). Céder, c'est livrer des secrets de l'agence.", prison: true },
  evasion: { label: "Évasion", icon: "⛓", description: "Préparer ton évasion (Ombre, Doigté ou Athlétisme). Risqué, mais c'est toi qui décides.", prison: true },
  attendre: { label: "Attendre l'échange", icon: "⌛", description: "Compter sur ton agence et le Conseil des Trois pour négocier ta libération.", prison: true },
  sport: {
    label: "Sport",
    icon: "◇",
    description: "Salle, piste ou ring : le corps se construit (musculature, masse grasse) et une compétence physique progresse. Fatigant, mais bon pour le moral.",
    target: "choice",
    options: [
      { id: "muscu", label: "Musculation", hint: "Force +1 xp · muscles" },
      { id: "cardio", label: "Course et natation", hint: "Endurance +1 xp · masse grasse" },
      { id: "boxe", label: "Boxe et krav-maga", hint: "Combat +1 xp · gare aux coups" },
    ],
  },
  exercice: {
    label: "Exercice de terrain",
    icon: "◎",
    description: "Un scénario grandeur nature dans une vraie ville : deux compétences de terrain progressent ensemble.",
    target: "choice",
    options: [
      { id: "filature", label: "Filature", hint: "Ombre · Regard" },
      { id: "infiltration", label: "Infiltration", hint: "Ombre · Doigté" },
      { id: "interrogatoire", label: "Interrogatoire", hint: "Empathie · Sang-froid" },
      { id: "conduite", label: "Conduite d'évasion", hint: "Pilotage · Vivacité" },
      { id: "tir", label: "Tir de précision", hint: "Précision · Alerte" },
    ],
  },
  veille: {
    label: "Veille",
    icon: "▤",
    description: "Lire les dépêches, les rapports et la presse locale d'une région : tu la suis pendant six mois (menaces, tensions), et ton analyse s'aiguise.",
    target: "region",
    officer: true,
  },
  job: {
    label: "Petit boulot",
    icon: "€",
    description: "Un vrai travail pour ta vie officielle : un peu d'argent, et une couverture qui tient (couverture +10).",
  },
  soins: {
    label: "Soins",
    icon: "✚",
    description: "Kiné, médecin de l'agence : les blessures guérissent une semaine plus vite, santé +2 (150 € hors Académie).",
  },
  mondanites: {
    label: "Mondanités",
    icon: "♢",
    description: "Vernissages, dîners, réceptions : on s'y fait des contacts (parfois un nouveau lien), on y soigne sa réputation et sa couverture. 150 € hors Académie.",
  },
  profil_bas: {
    label: "Profil bas",
    icon: "◌",
    description: "Changer d'habitudes, de téléphone, de trajets : les services qui te surveillent perdent ta trace (notoriété −12 dans les deux pays où tu es le plus fiché).",
    officer: true,
  },
  instruire: {
    label: "Instruire",
    icon: "✦",
    description: "Former les cadets de l'Académie : réputation +3, et enseigner t'oblige à revoir tes bases (Tactique).",
  },
};

export const ACTIVITY_IDS = Object.keys(ACTIVITIES) as ActivityId[];

const isCadet = (state: GameState) => state.character.rank === "aspirant";

export function activityBlocker(state: GameState, id: ActivityId): string | null {
  const def = ACTIVITIES[id];
  const cadet = isCadet(state);
  if (state.character.prison) return def.prison ? null : "tu es en détention";
  if (def.prison) return "réservé à la détention";
  if (id === "legende" && legendCap(state.character) === 0) return "pas avant le Brevet";
  if (id === "langue" && ALL_LANGUAGES.every((l) => speaksLanguage(state.character, l))) return "tu parles déjà tout";
  if (def.academy === true && !cadet) return "réservé aux cadets de l'Académie";
  if (def.academy === false && cadet) return "pas à l'Académie";
  if (def.cap && !can(state.character.rank, def.cap)) return "pas à ton grade";
  if (def.officer && RANKS[state.character.rank].order < RANKS.agent.order) return "à partir du Brevet";
  if (id === "escouade" && !state.command.squad.length) return "tu n'as pas encore choisi tes seconds";
  if (id === "antenne" && !state.command.station) return "tu ne diriges pas de Station";
  if (id === "theatre" && !state.command.theatre) return "tu ne supervises pas de région";
  if (id === "devoir" && !state.duties.some((d) => d.status === "ouvert" && d.activity === "devoir")) return "aucun devoir à rédiger";
  if (id === "relation" && !activeRelations(state).length) return "personne à voir";
  if (id === "soins" && !(state.character.injuries ?? []).some((i) => i.healDay !== undefined) && state.character.health >= state.character.healthMax) return "rien à soigner";
  if (id === "profil_bas" && !Object.values(state.character.heat ?? {}).some((v) => v > 0)) return "personne ne te cherche";
  if (id === "instruire" && RANKS[state.character.rank].order < RANKS.titulaire.order) return "à partir de Titulaire ou Chef de station";
  if ((id === "soins" || id === "mondanites") && !cadet && state.character.money < 150) return "il faut 150 €";
  return null;
}

export const activeRelations = (state: GameState) => state.relations.filter((r) => r.status === "actif" && r.kind !== "ennemi");

export function defaultPlan(state: GameState): ActivityChoice[] {
  if (state.character.prison) return [{ activity: "resister" }, { activity: "evasion" }, { activity: "attendre" }];
  const cadet = isCadet(state);
  const sig = state.character.signature;
  return cadet
    ? [{ activity: "cours", target: "babel" }, { activity: "entrainement", target: sig }, { activity: "repos" }]
    : [{ activity: "entrainement", target: sig }, { activity: "couverture" }, { activity: "repos" }];
}

export function planError(state: GameState, plan: ActivityChoice[]): string | null {
  if (plan.length !== SLOTS) return `Une semaine compte ${SLOTS} créneaux.`;
  for (const p of plan) {
    const b = activityBlocker(state, p.activity);
    if (b) return `${ACTIVITIES[p.activity].label} : ${b}.`;
    const def = ACTIVITIES[p.activity];
    if ((def.target === "skill" || def.target === "academic") && !(p.target && p.target in SKILLS)) return `${def.label} : choisis une compétence.`;
    if (def.target === "relation" && !state.relations.some((r) => r.name === p.target)) return `${def.label} : choisis quelqu'un.`;
    if (def.target === "duty" && !state.duties.some((d) => d.id === p.target && d.status === "ouvert")) return `${def.label} : choisis un devoir.`;
    if (def.target === "language" && !(p.target && ALL_LANGUAGES.includes(p.target))) return `${def.label} : choisis une langue.`;
    if (def.target === "branch" && !p.target) return `${def.label} : choisis une Branche.`;
    if (def.target === "choice" && !def.options?.some((o) => o.id === p.target)) return `${def.label} : choisis une variante.`;
    if (def.target === "region" && !(p.target && p.target in REGIONS)) return `${def.label} : choisis une région.`;
  }
  if (isCadet(state) && !state.character.prison && !plan.some((p) => p.activity === "cours")) return "À l'Académie, au moins un créneau de cours par semaine est obligatoire.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Devoirs                                                             */
/* ------------------------------------------------------------------ */

function duty(rng: Rng, d: Omit<Duty, "id" | "progress" | "status">): Duty {
  return { ...d, id: uid(rng), progress: 0, status: "ouvert" };
}

/** Les obligations qui tombent cette semaine selon le grade. */
function newDuties(state: GameState, rng: Rng): Duty[] {
  const c = state.character;
  const day = state.world.day;
  const week = Math.floor(day / 7);
  const open = (title: string) => state.duties.some((d) => d.status === "ouvert" && d.title.startsWith(title));
  const out: Duty[] = [];
  const order = RANKS[c.rank].order;
  if (isCadet(state)) {
    if (week % 13 === 6 && !open("Examens de saison"))
      out.push(duty(rng, { title: "Examens de saison", description: "Langues, sciences, droit du renseignement : deux semaines pour réviser, en cours.", activity: "cours", dueDay: day + 14, required: 2, penalty: { reputation: -8, morale: -2 } }));
    if (chance(0.18, rng) && !open("Corvée"))
      out.push(duty(rng, { title: "Corvée de la chambrée", description: "Cuisines, entretien des armes, ronde de nuit : ta chambrée est de service.", activity: "devoir", dueDay: day + 14, required: 1, penalty: { reputation: -3 } }));
    return out;
  }
  if (order < RANKS.agent.order) return out;
  if (week % 13 === 3 && !open("Requalification"))
    out.push(duty(rng, { title: "Requalification trimestrielle", description: "Tir, combat, conduite d'évasion, test d'interrogatoire : l'agence vérifie que tu tiens encore.", activity: "devoir", dueDay: day + 21, required: 1, penalty: { reputation: -5, merit: -0.5 } }));
  if (state.command.assets.some((a) => a.status === "actif") && week % 4 === 1 && !open("Rencontrer tes informateurs"))
    out.push(duty(rng, { title: "Rencontrer tes informateurs", description: "Un informateur qu'on ne voit plus est un informateur qu'on perd.", activity: "informateurs", dueDay: day + 14, required: 1, penalty: { reputation: -2 } }));
  if (can(c.rank, "seconds") && state.command.squad.length && week % 4 === 2 && !open("Évaluations"))
    out.push(duty(rng, { title: "Évaluations de tes seconds", description: "Noter, recadrer, féliciter : tes deux seconds attendent ton jugement.", activity: "escouade", dueDay: day + 14, required: 1, penalty: { reputation: -4 } }));
  if (state.command.station && week % 4 === 0 && !open("Rapport mensuel"))
    out.push(duty(rng, { title: "Rapport mensuel de la Station", description: "Budget, sources, menaces : le Contrôleur veut des chiffres.", activity: "antenne", dueDay: day + 10, required: 1, penalty: { reputation: -5, merit: -0.5 } }));
  if (state.command.theatre && week % 6 === 0 && !open("Conseil de région"))
    out.push(duty(rng, { title: "Conseil de région", description: "Arbitrer entre les Stations, défendre ton budget devant la Direction.", activity: "theatre", dueDay: day + 14, required: 1, penalty: { reputation: -6, merit: -1 } }));
  if (state.command.agency && week % 13 === 0 && !open("Conseil des membres"))
    out.push(duty(rng, { title: "Conseil des pays membres", description: "Les gouvernements réclament des comptes. Le budget de l'an prochain en dépend.", activity: "agence", dueDay: day + 21, required: 1, penalty: { merit: -2 } }));
  return out;
}

/* ------------------------------------------------------------------ */
/* Événements de la semaine                                            */
/* ------------------------------------------------------------------ */

const ACADEMY_EVENTS = [
  "Une bagarre éclate dans la chambrée : deux cadets en viennent aux mains, et tout le monde regarde le personnage.",
  "Un cadet propose de faire le mur cette nuit pour rejoindre le village de l'autre côté de l'île.",
  "Le mentor de la chambrée prend le personnage à part : il a remarqué quelque chose.",
  "Punition collective : la chambrée entière paie pour la faute d'un seul. Il faut savoir qui.",
  "Exercice surprise en pleine nuit : alerte, cagoules, interrogatoire simulé.",
  "Un cadet de la chambrée a disparu ce matin. Renvoyé ? Blessé ? Personne ne dit rien.",
  "Une lettre de la famille arrive, et elle contient une question à laquelle il est difficile de mentir.",
  "Les instructeurs annoncent la sélection pour les Jeux de Lucerne contre les deux autres agences.",
  "Un instructeur légendaire, revenu blessé d'une mission, accepte de répondre à une seule question.",
  "Une rivalité avec un cadet d'une autre chambrée tourne au défi public.",
];

const AGENT_EVENTS = [
  "Le Contrôleur convoque le personnage pour un débriefing qui tourne au règlement de comptes.",
  "Un agent d'une agence rivale aborde le personnage dans un bar, trop aimablement.",
  "Le laboratoire demande au personnage de tester un prototype instable.",
  "Un équipier de la dernière mission, encore à l'infirmerie, demande à le voir.",
  "Une rumeur de taupe court au siège ; tous les regards se croisent à la cantine.",
  "Une ancienne connaissance de sa vie d'avant reconnaît le personnage dans la rue.",
  "Une dépêche du jour concerne directement une personne que le personnage connaît.",
  "Le directeur croise le personnage dans un couloir et lui pose une question piège.",
  "Une proposition de l'extérieur : un ancien agent passé au privé veut le recruter.",
];

function pickEvent(state: GameState, rng: Rng, neglected: Relation | undefined): string | undefined {
  const c = state.character;
  if (neglected && chance(0.7, rng))
    return `${neglected.name} (${neglected.role}) n'a plus de nouvelles depuis longtemps et le fait savoir : appel furieux, visite surprise ou silence inquiétant.`;
  if (c.cover < 25 && RANKS[c.rank].order >= RANKS.aspirant.order && chance(0.7, rng))
    return "La vie officielle du personnage se fissure : sa famille ou son entourage pose des questions précises sur l'endroit où il passe ses semaines. Il faut une explication qui tienne.";
  if (!chance(0.45, rng)) return undefined;
  const news = state.world.geo.news[0];
  if (news && chance(0.15, rng)) return `Conséquence d'une dépêche du jour (« ${news.text} ») : le personnage s'y retrouve mêlé de près ou de loin.`;
  return pick(isCadet(state) ? ACADEMY_EVENTS : AGENT_EVENTS, rng);
}

/* ------------------------------------------------------------------ */
/* Informateurs                                                        */
/* ------------------------------------------------------------------ */

/** Métiers des informateurs : [masculin, féminin]. */
const ASSET_ROLES: [string, string][] = [
  ["douanier", "douanière"],
  ["employé d'un grand hôtel", "employée d'un grand hôtel"],
  ["chauffeur de taxi", "chauffeuse de taxi"],
  ["banquier", "banquière"],
  ["policier", "policière"],
  ["journaliste", "journaliste"],
  ["fonctionnaire au ministère", "fonctionnaire au ministère"],
  ["barman", "barmaid"],
  ["docker", "docker"],
  ["hacker", "hackeuse"],
  ["traducteur", "traductrice"],
  ["concierge d'ambassade", "concierge d'ambassade"],
];

export function assetCap(rank: RankId): number {
  return ({ titulaire: 3, doyen: 4, chef_station: 5, controleur: 8, directeur: 10 } as Partial<Record<RankId, number>>)[rank] ?? 0;
}

function recruitAsset(state: GameState, cityId: string, rng: Rng): Asset | null {
  const city = findCity(cityId);
  if (!city) return null;
  const country = findCountry(city.country)?.name ?? "France";
  const gender = chance(0.5, rng) ? "fille" : "garcon";
  const n = randomName(country, gender, rng);
  return {
    id: uid(rng),
    name: `${n.first} ${n.last}`,
    role: pick(ASSET_ROLES, rng)[gender === "fille" ? 1 : 0],
    cityId,
    cost: randInt(2, 6, rng) * 100,
    reliability: randInt(45, 70, rng),
    status: "actif",
    recruitedDay: state.world.day,
  };
}

/* ------------------------------------------------------------------ */
/* Résolution de la semaine                                            */
/* ------------------------------------------------------------------ */

const BOND_DECAY: Record<string, number> = { amour: 10, proche: 8, ami: 5, mentor: 5, equipier: 6, allie: 5, contact: 3, ex: 0, rival: 0, ennemi: 0 };

export interface WeekResult {
  state: GameState;
  report: WeekReport;
  notices: string[];
}

/** Ce qu'on rencontre dans les réceptions. */
const SOCIAL_ROLES = [
  "attaché culturel d'une ambassade",
  "journaliste économique",
  "avocate d'affaires",
  "galeriste",
  "chirurgien réputé",
  "banquier privé",
  "ingénieure en télécoms",
  "conseiller d'un ministre",
  "photographe de mode",
  "héritière d'un armateur",
];

/** Combien de temps faire passer : un nombre de semaines, ou « jusqu'au prochain temps fort » (six mois au plus). */
export type Span = number | "auto";
export const AUTO_MAX_WEEKS = 26;
export const MAX_SPAN_WEEKS = 26;

export interface PeriodResult {
  state: GameState;
  weeks: number;
  /** La chronique de la période : semaine par semaine jusqu'à un mois, mois par mois au-delà. */
  lines: string[];
  notices: string[];
  /** L'événement sur lequel la période se termine, à jouer en scène. */
  event?: string;
  /** Pourquoi le temps s'est arrêté avant la fin prévue. */
  stop: string | null;
  /** Ce qui a arrêté le temps mérite d'être joué lentement, sur plusieurs tours. */
  momentous: boolean;
  /** Un anniversaire est tombé pendant la période. */
  birthday?: { age: number; date: string };
}

/** Regroupe les lignes identiques : « Entraînement : Combat (+3) » ×4. */
export function foldLines(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].map(([l, n]) => (n > 1 ? `${l.replace(/\.$/, "")} (×${n}).` : l));
}

/** Le début d'une phrase, pour nommer un événement en peu de mots. */
const gist = (text: string) => {
  const head = text.split(/[:;.]/)[0].trim();
  return head.length > 70 ? `${head.slice(0, 67).trimEnd()}…` : head;
};

/**
 * Plusieurs semaines d'affilée avec le même planning, et la vie continue : les petits événements
 * se racontent dans la chronique. Le temps s'arrête de lui-même sur ce qui compte : un temps fort
 * (Conseil, Jeux, menace sur la maison, ennemi qui se manifeste), une mission, un devoir qui presse,
 * un anniversaire, une promotion possible, l'épuisement, une blessure, une arrestation, ou un planning
 * devenu impossible.
 */
export function resolvePeriod(initial: GameState, plan: ActivityChoice[], span: Span, rng: Rng = Math.random): PeriodResult {
  const max = span === "auto" ? AUTO_MAX_WEEKS : Math.max(1, Math.min(MAX_SPAN_WEEKS, Math.round(span)));
  let state = initial;
  const notices: string[] = [];
  let stop: string | null = null;
  let momentous = false;
  let event: string | undefined;
  let birthday: PeriodResult["birthday"];
  const weeksLog: { from: number; to: number; lines: string[]; event?: string }[] = [];
  for (let i = 0; i < max; i++) {
    if (i > 0) {
      const err = planError(state, plan);
      if (err) {
        stop = `le planning n'est plus possible (${err})`;
        break;
      }
    }
    const before = state;
    const ageBefore = currentAge(before);
    const promosBefore = promotionsAvailable(before).length;
    const r = resolveWeek(state, plan, rng);
    state = r.state;
    weeksLog.push({ from: before.world.day, to: state.world.day, lines: r.report.lines, event: r.report.event });
    notices.push(...r.notices);
    const c = state.character;
    const age = currentAge(state);
    if (age > ageBefore) birthday = { age, date: dateOfAge(state, age) ?? currentDate(state) };
    // Ce qui arrête le temps (même à la dernière semaine : ça dit comment jouer la suite).
    const covered = (d: (typeof state.duties)[number]) => plan.some((p) => p.activity === d.activity && (d.activity !== "devoir" || !p.target || p.target === d.id));
    // Les petites corvées, sur une longue période, se font en passant : on ne s'arrête pas pour elles.
    if (max > 1) {
      for (const d of state.duties) {
        const minor = !d.penalty.merit && (d.penalty.reputation ?? 0) > -5 && !d.penalty.cover;
        if (d.status !== "ouvert" || !minor || d.dueDay - state.world.day > 7 || covered(d)) continue;
        state = {
          ...state,
          duties: state.duties.map((x) => (x.id === d.id ? { ...x, progress: x.required, status: "fait" as const } : x)),
          character: { ...state.character, fatigue: Math.min(100, (state.character.fatigue ?? 0) + 6) },
        };
        weeksLog.at(-1)!.lines.push(`En passant : ${d.title} (fatigue +6).`);
      }
    }
    const newOffer = state.offers.find((o) => !before.offers.some((x) => x.id === o.id));
    // Un devoir n'arrête le temps que s'il est nouveau et que le planning ne s'en charge pas.
    const urgent = state.duties.find(
      (d) => d.status === "ouvert" && d.dueDay - state.world.day <= 7 && d.progress < d.required && !initial.duties.some((x) => x.id === d.id) && !covered(d),
    );
    const nemesis = r.report.event ? state.world.geo.nemeses.find((n) => n.status === "libre" && r.report.event!.includes(n.name.split(" ")[0])) : undefined;
    if (nemesis) {
      event = r.report.event;
      stop = `${nemesis.name} se manifeste`;
      momentous = true;
    } else if (r.report.major && r.report.event) {
      event = r.report.event;
      stop = `un temps fort : ${gist(r.report.event)}`;
      momentous = true;
    } else if (c.prison && !before.character.prison) {
      stop = "tu as été arrêté·e";
      momentous = true;
    } else if (birthday) {
      stop = `ton anniversaire (${birthday.age} ans)`;
      momentous = true;
    } else if (newOffer && (newOffer.assigned || before.offers.length === 0)) {
      stop = newOffer.assigned ? `une mission t'est assignée : ${newOffer.title.split(" — ")[0]}` : `une mission est proposée : ${newOffer.title.split(" — ")[0]}`;
      momentous = Boolean(newOffer.assigned);
    } else if (urgent) stop = `un devoir presse : ${urgent.title}`;
    else if (promotionsAvailable(state).length > promosBefore) stop = "une promotion est possible";
    else if ((c.fatigue ?? 0) >= 85) stop = "tu es épuisé·e";
    else if (c.health <= 3) stop = "ta santé est au plus bas";
    else if ((c.injuries ?? []).length > (before.character.injuries ?? []).length) stop = "une blessure";
    // À la fin prévue, ce n'est pas un arrêt : le temps a simplement fini de passer.
    if (i === max - 1 && !momentous) stop = null;
    if (stop) break;
  }

  // L'événement de la fin de période se joue en scène ; les autres se racontent dans la chronique.
  event ??= weeksLog.findLast((w) => w.event)?.event;
  const others = (ws: typeof weeksLog) => [...new Set(ws.map((w) => w.event).filter((e): e is string => Boolean(e) && e !== event))].map((e) => `Il s'est aussi passé : ${e}`);
  const start = state.world.startDate ?? "2026-10-05";
  let lines: string[];
  if (weeksLog.length === 1) lines = [...weeksLog[0].lines, ...others(weeksLog)];
  else if (weeksLog.length <= 4)
    lines = foldLines([...weeksLog.flatMap((w, n) => [`— Semaine ${n + 1} (jour ${w.from} → ${w.to}) —`, ...w.lines]), ...others(weeksLog)]);
  else {
    // Au-delà d'un mois : la chronique, mois par mois.
    const months = new Map<string, typeof weeksLog>();
    for (const w of weeksLog) {
      const m = monthLabel(addDays(start, w.to));
      months.set(m, [...(months.get(m) ?? []), w]);
    }
    lines = [...months.entries()].flatMap(([m, ws]) => [`— ${m.replace(/^./, (x) => x.toUpperCase())} (${ws.length} sem.) —`, ...foldLines(ws.flatMap((w) => w.lines)), ...others(ws)]);
  }
  return { state, weeks: weeksLog.length, lines, notices, event, stop, momentous, birthday };
}

export function resolveWeek(initial: GameState, plan: ActivityChoice[], rng: Rng = Math.random): WeekResult {
  const err = planError(initial, plan);
  if (err) throw new Error(err);
  let state = initial;
  const lines: string[] = [];
  const notices: string[] = [];
  const day = state.world.day;
  const cadet = isCadet(state);
  const contacted = new Set<string>();
  let fatigue = state.character.fatigue ?? 0;
  let cover = state.character.cover ?? 70;

  const progressDuty = (match: (d: Duty) => boolean) => {
    const d = state.duties.find((x) => x.status === "ouvert" && match(x));
    if (!d) return;
    const progress = d.progress + 1;
    const done = progress >= d.required;
    state = { ...state, duties: state.duties.map((x) => (x.id === d.id ? { ...x, progress, status: done ? "fait" : "ouvert" } : x)) };
    lines.push(done ? `Devoir accompli : ${d.title}.` : `${d.title} : ${progress}/${d.required}.`);
    if (done) notices.push(`Devoir accompli : ${d.title}`);
  };

  const learn = (skill: SkillId, xp: number) => {
    const r = gainSkillXp(state, skill, xp);
    state = r.state;
    notices.push(...r.notices);
  };

  for (const slot of plan) {
    const c = state.character;
    switch (slot.activity) {
      case "cours": {
        const skill = slot.target as SkillId;
        learn(skill, 2);
        fatigue += 5;
        lines.push(`Cours : ${SKILLS[skill].label} (+2 d'expérience).`);
        progressDuty((d) => d.activity === "cours");
        break;
      }
      case "entrainement": {
        const skill = slot.target as SkillId;
        const xp = 2 + (cadet ? 1 : 0);
        learn(skill, xp);
        fatigue += 12;
        const inSeat = findSeat(c.identity.agency, c.seat)?.specialty.includes(skill);
        lines.push(`Entraînement : ${SKILLS[skill].label} (+${xp + (inSeat ? 1 : 0)} d'expérience).`);
        break;
      }
      case "repos": {
        fatigue -= 35;
        state = {
          ...state,
          character: { ...state.character, health: Math.min(c.healthMax, c.health + 3), morale: Math.min(c.moraleMax, c.morale + 2) },
        };
        lines.push("Repos : santé +3, moral +2.");
        break;
      }
      case "loisirs": {
        fatigue -= 15;
        state = { ...state, character: { ...state.character, morale: Math.min(c.moraleMax, c.morale + 3) } };
        lines.push("Quartier libre : moral +3.");
        break;
      }
      case "couverture": {
        cover += 30;
        fatigue += 3;
        lines.push("Vie officielle : on t'a vu là où tu es censé être (couverture +30).");
        break;
      }
      case "relation": {
        const r = state.relations.find((x) => x.name === slot.target);
        if (!r) break;
        const here = r.cityId && r.cityId === state.world.cityId;
        const gain = here ? 30 : 15;
        contacted.add(r.name);
        state = {
          ...state,
          relations: state.relations.map((x) =>
            x.name === r.name ? { ...x, bond: Math.min(100, (x.bond ?? 50) + gain), affinity: Math.min(100, x.affinity + (here ? 4 : 2)), lastSeenDay: day + 7 } : x,
          ),
        };
        fatigue += 2;
        lines.push(`${here ? "Vu" : "Appel avec"} ${r.name} : lien +${gain}.`);
        break;
      }
      case "devoir":
        progressDuty((d) => d.id === slot.target);
        fatigue += 6;
        break;
      case "branche": {
        const branch = findBranch(c.identity.agency, slot.target);
        if (!branch) break;
        state = shiftBranchFavor(state, branch.id, 8);
        fatigue += 5;
        if (branch.kind === "labo") {
          learn("machine", 1);
          state = { ...state, command: { ...state.command, labFavor: Math.min(2, (state.command.labFavor ?? 0) + 1) } };
          lines.push(`${branch.name} : tu as testé des prototypes ; un gadget de plus à la prochaine mission (estime ${branchFavor(state, branch.id)}).`);
        } else if (branch.kind === "analyse") {
          learn("archives", 1);
          const stock = Math.min(3, (state.command.intelStock ?? 0) + 1);
          state = { ...state, command: { ...state.command, intelStock: stock } };
          lines.push(`${branch.name} : dossiers étudiés ; renseignement de départ ${stock}/3 (estime ${branchFavor(state, branch.id)}).`);
        } else {
          cover += 10;
          lines.push(`${branch.name} : couverture consolidée (+10), papiers à jour (estime ${branchFavor(state, branch.id)}).`);
        }
        break;
      }
      case "langue": {
        const lang = slot.target!;
        const boost = (c.possessions ?? []).reduce((n, id) => n + (findPossession(id)?.languageBoost ?? 0), 0);
        const gain = 12 + Math.floor(c.skills.babel.rank * 1.5) + boost;
        const progress = Math.min(100, (state.character.learning[lang] ?? 0) + gain);
        fatigue += 5;
        if (progress >= 100) {
          state = { ...state, character: { ...state.character, spoken: [...state.character.spoken, lang], learning: Object.fromEntries(Object.entries(state.character.learning).filter(([k]) => k !== lang)) } };
          lines.push(`Langue : tu parles désormais ${lang}.`);
          notices.push(`Nouvelle langue : ${lang}`);
        } else {
          state = { ...state, character: { ...state.character, learning: { ...state.character.learning, [lang]: progress } } };
          lines.push(`Langue : ${lang} ${progress}/100.`);
        }
        learn("babel", 1);
        break;
      }
      case "legende": {
        const cur = state.character.legends;
        const existing = cur.find((l) => l.id === slot.target);
        fatigue += 6;
        if (existing) {
          state = { ...state, character: { ...state.character, legends: cur.map((l) => (l.id === existing.id ? { ...l, credibility: Math.min(100, l.credibility + 20) } : l)) } };
          lines.push(`Légende ${existing.name} consolidée : crédibilité ${Math.min(100, existing.credibility + 20)}.`);
        } else if (cur.length >= legendCap(state.character)) lines.push(`Tu as déjà ${cur.length} légende${cur.length > 1 ? "s" : ""} : c'est le maximum à ton grade.`);
        else if (state.character.money < LEGEND_COST) lines.push(`Pas assez d'argent pour une nouvelle légende (${LEGEND_COST} €).`);
        else {
          const logistics = AGENCIES[c.identity.agency].branches.find((b) => b.kind === "logistique");
          const credibility = Math.min(90, 40 + Math.max(0, Math.round(branchFavor(state, logistics?.id ?? "") / 4)));
          const legend = createLegend(state.character, day, credibility, rng);
          state = { ...state, character: { ...state.character, money: state.character.money - LEGEND_COST, legends: [...cur, legend], ledger: pushLedger(state.character.ledger, day, `Légende : ${legend.name}`, -LEGEND_COST) } };
          lines.push(`Nouvelle légende : ${legend.name}, ${legend.profession} (${legend.nationality}), crédibilité ${credibility}.`);
          notices.push(`Nouvelle légende : ${legend.name}`);
        }
        break;
      }
      case "sport": {
        const skill: SkillId = slot.target === "cardio" ? "endurance" : slot.target === "boxe" ? "combat" : "force";
        learn(skill, 1);
        fatigue += 10;
        state = { ...state, character: { ...state.character, morale: Math.min(state.character.moraleMax, state.character.morale + 1) } };
        const opt = ACTIVITIES.sport.options!.find((o) => o.id === slot.target);
        lines.push(`Sport : ${opt?.label ?? "entraînement"} (${SKILLS[skill].label} +1, moral +1).`);
        if (slot.target === "boxe" && chance(0.06, rng)) {
          const hurt = inflictInjury(state.character, "combat", 1, state.world.day, false, rng);
          state = { ...state, character: hurt.character };
          notices.push(hurt.notice);
          lines.push(`Un coup mal paré au ring : ${hurt.notice.replace(/^Blessure : /, "").toLowerCase()}.`);
        }
        break;
      }
      case "exercice": {
        const pairs: Record<string, [SkillId, SkillId]> = {
          filature: ["ombre", "regard"],
          infiltration: ["ombre", "doigte"],
          interrogatoire: ["empathie", "sangfroid"],
          conduite: ["pilotage", "vivacite"],
          tir: ["precision", "alerte"],
        };
        const [a, b] = pairs[slot.target ?? "filature"] ?? pairs.filature;
        learn(a, 1);
        learn(b, 1);
        fatigue += 10;
        const opt = ACTIVITIES.exercice.options!.find((o) => o.id === slot.target);
        lines.push(`Exercice de terrain : ${opt?.label ?? "scénario"} (${SKILLS[a].label} et ${SKILLS[b].label} +1).`);
        break;
      }
      case "veille": {
        const region = slot.target as RegionId;
        learn("logique", 1);
        fatigue += 4;
        state = { ...state, knowledge: { ...state.knowledge, regions: { ...state.knowledge.regions, [region]: state.world.day } } };
        lines.push(`Veille : ${REGIONS[region]?.label ?? region} suivie six mois (Logique +1).`);
        break;
      }
      case "job": {
        const best = Math.max(skillTotal(c, "eloquence"), skillTotal(c, "tenue"), skillTotal(c, "machine"));
        const pay = cadet ? 60 : 180 + 35 * best;
        cover += 10;
        fatigue += 8;
        state = { ...state, character: { ...state.character, money: state.character.money + pay, ledger: pushLedger(state.character.ledger, state.world.day, cadet ? "Petits services à l'Académie" : "Petit boulot", pay) } };
        lines.push(`Petit boulot : +${pay} €, couverture +10.`);
        break;
      }
      case "soins": {
        const cost = cadet ? 0 : 150;
        state = {
          ...state,
          character: {
            ...state.character,
            health: Math.min(state.character.healthMax, state.character.health + 2),
            injuries: state.character.injuries.map((i) => (i.healDay !== undefined ? { ...i, healDay: i.healDay - 7 } : i)),
            money: state.character.money - cost,
            ledger: cost ? pushLedger(state.character.ledger, state.world.day, "Soins", -cost) : state.character.ledger,
          },
        };
        fatigue -= 10;
        lines.push(`Soins : santé +2, blessures plus vite guéries${cost ? ` (−${cost} €)` : ""}.`);
        break;
      }
      case "mondanites": {
        const cost = cadet ? 0 : 150;
        const city = findCity(state.world.cityId);
        learn("eloquence", 1);
        cover += 5;
        let ch = { ...state.character, morale: Math.min(state.character.moraleMax, state.character.morale + 1), money: state.character.money - cost, ledger: cost ? pushLedger(state.character.ledger, state.world.day, "Mondanités", -cost) : state.character.ledger };
        let relations = state.relations;
        if (city && activeRelations(state).length < RELATION_LIMIT && chance(0.35, rng)) {
          const gender = chance(0.5, rng) ? "fille" : "garcon";
          const n = randomName(findCountry(city.country)?.name ?? "France", gender, rng);
          const role = pick(SOCIAL_ROLES, rng);
          const name = `${n.first} ${n.last}`;
          relations = [
            ...relations,
            { name, role, kind: "contact", status: "actif", affinity: 20, favors: 0, location: city.name, knows: "", notes: "", lastSeenDay: state.world.day, bond: 55, cityId: city.id, positionDay: state.world.day, knownAs: "reel", metDay: state.world.day, history: [{ day: state.world.day, text: `Rencontre lors d'une réception : ${role}` }] },
          ];
          notices.push(`Nouvelle relation : ${name}`);
          lines.push(`Mondanités : rencontre avec ${name}, ${role}.`);
        } else {
          ch = { ...ch, reputation: Math.min(100, ch.reputation + 1) };
          lines.push(`Mondanités : on t'a vu, on se souvient de toi (réputation +1${cost ? `, −${cost} €` : ""}).`);
        }
        state = { ...state, character: ch, relations };
        break;
      }
      case "profil_bas": {
        const hottest = Object.entries(c.heat ?? {})
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);
        const heat = { ...state.character.heat };
        for (const [k, v] of hottest) heat[k] = Math.max(0, v - 12);
        cover += 5;
        state = { ...state, character: { ...state.character, heat } };
        lines.push(`Profil bas : ${hottest.map(([k]) => findCountry(k)?.name ?? k).join(" et ")} perdent ta trace (notoriété −12).`);
        break;
      }
      case "instruire": {
        learn("tactique", 1);
        fatigue += 6;
        state = { ...state, character: { ...state.character, reputation: Math.min(100, state.character.reputation + 3), morale: Math.min(state.character.moraleMax, state.character.morale + 1) } };
        lines.push("Instruire : une promotion de cadets t'écoute (réputation +3, Tactique +1).");
        break;
      }
      case "resister": {
        const r = prisonCheck(state, ["sangfroid", "tolerance"], 12, rng);
        if (r.ok) lines.push(`Interrogatoire : tu tiens (${r.total} contre 12).`);
        else {
          const leaked = Math.min(100, (state.character.prison!.leaked ?? 0) + 20);
          state = { ...state, character: { ...state.character, prison: { ...state.character.prison!, leaked }, morale: Math.max(0, state.character.morale - 1) } };
          lines.push(`Interrogatoire : tu as parlé (${r.total} contre 12). Secrets livrés : ${leaked}/100.`);
          if (leaked >= 60) {
            const asset = state.command.assets.find((x) => x.status === "actif");
            if (asset) state = { ...state, command: { ...state.command, assets: state.command.assets.map((x) => (x.id === asset.id ? { ...x, status: "grille" } : x)) } };
            state = { ...state, character: { ...state.character, reputation: Math.max(0, state.character.reputation - 5) } };
            notices.push(asset ? `Tes aveux ont grillé ${asset.name}` : "Tes aveux ont coûté cher à l'agence");
          }
        }
        break;
      }
      case "evasion": {
        const r = prisonCheck(state, ["ombre", "doigte", "athletisme"], 13, rng);
        const p = state.character.prison!;
        const escape = Math.max(0, Math.min(100, p.escape + (r.ok ? 35 : -10)));
        state = { ...state, character: { ...state.character, prison: { ...p, escape }, health: r.ok ? state.character.health : Math.max(1, state.character.health - 2) } };
        lines.push(r.ok ? `Évasion : un pas de plus (${escape}/100).` : `Évasion : repéré, tabassé (${escape}/100).`);
        break;
      }
      case "attendre":
        lines.push("Tu attends. Quelque part, on négocie ton sort.");
        break;
      case "informateurs": {
        fatigue += 8;
        const active = state.command.assets.filter((a) => a.status === "actif");
        if (slot.target && findCity(slot.target)) {
          if (active.length >= assetCap(c.rank)) {
            lines.push(`Réseau complet : ${assetCap(c.rank)} informateurs au plus à ton grade.`);
          } else {
            const a = recruitAsset(state, slot.target, rng);
            if (a) {
              state = { ...state, command: { ...state.command, assets: [...state.command.assets, a] } };
              lines.push(`Informateur recruté à ${findCity(a.cityId)!.name} : ${a.name}, ${a.role} (${a.cost} €/semaine).`);
              notices.push(`Informateur recruté : ${a.name}`);
            }
          }
        } else {
          state = { ...state, command: { ...state.command, assets: state.command.assets.map((a) => (a.status === "actif" ? { ...a, reliability: Math.min(100, a.reliability + 15) } : a)) } };
          lines.push("Réseau entretenu : fiabilité de tes informateurs +15.");
        }
        progressDuty((d) => d.activity === "informateurs");
        break;
      }
      case "escouade": {
        fatigue += 8;
        state = {
          ...state,
          roster: state.roster.map((o) => {
            if (!state.command.squad.includes(o.id)) return o;
            const skills = { ...o.skills };
            if (chance(0.25, rng)) {
              const k = pick(Object.keys(skills) as SkillId[], rng);
              skills[k] = Math.min(10, (skills[k] ?? 3) + 1);
            }
            return { ...o, skills, fatigue: Math.max(0, o.fatigue - 15), affinity: Math.min(100, o.affinity + 3) };
          }),
        };
        lines.push("Escouade entraînée : fatigue −15, affinité +3.");
        progressDuty((d) => d.activity === "escouade");
        break;
      }
      case "antenne": {
        fatigue += 8;
        const st = state.command.station!;
        state = { ...state, command: { ...state.command, station: { ...st, intel: Math.min(10, st.intel + 2), cover: Math.min(100, st.cover + 5) } } };
        lines.push(`Antenne de ${findCity(st.cityId)?.name} : renseignement régional +2, discrétion +5.`);
        progressDuty((d) => d.activity === "antenne");
        break;
      }
      case "theatre": {
        fatigue += 8;
        const th = state.command.theatre!;
        const projects = th.projects.map((p) => ({ ...p, progress: Math.min(p.required, p.progress + 1) }));
        const done = projects.filter((p) => p.progress >= p.required);
        const unlocked = [...new Set([...state.command.unlocked, ...done.map((p) => p.gadget)])];
        for (const p of done) {
          const g = GADGETS.find((x) => x.id === p.gadget);
          notices.push(`Recherche aboutie : ${g?.name ?? p.gadget} disponible`);
        }
        state = {
          ...state,
          command: { ...state.command, unlocked, theatre: { ...th, projects: projects.filter((p) => p.progress < p.required) } },
          world: { ...state.world, geo: shiftTension(state.world.geo, th.region, -2) },
        };
        lines.push("Théâtre : projets de recherche +1, tension régionale −2.");
        progressDuty((d) => d.activity === "theatre");
        break;
      }
      case "agence": {
        fatigue += 8;
        const ag = state.command.agency!;
        if (slot.target && slot.target !== c.identity.agency) {
          state = { ...state, world: { ...state.world, geo: shiftDiplomacy(state.world.geo, c.identity.agency, slot.target as never, 4) } };
          lines.push(`Canal ouvert avec ${AGENCIES[slot.target as keyof typeof AGENCIES]?.name ?? slot.target} : relations +4.`);
        } else {
          state = { ...state, command: { ...state.command, agency: { ...ag, councilFavor: Math.min(100, ag.councilFavor + 5) } } };
          lines.push("Gouvernements membres rassurés : crédit +5.");
        }
        progressDuty((d) => d.activity === "agence");
        break;
      }
    }
  }

  // Le patrimoine : entretien et confort.
  const upkeep = payUpkeep(state);
  state = upkeep.state;
  notices.push(...upkeep.notices);
  lines.push(...upkeep.lines);
  const rested = plan.some((p) => p.activity === "repos");
  for (const id of state.character.possessions ?? []) {
    const p = findPossession(id);
    if (!p) continue;
    if (p.coverPerWeek) cover += p.coverPerWeek;
    if (rested && (p.restHealth || p.restMorale)) {
      const ch = state.character;
      state = { ...state, character: { ...ch, health: Math.min(ch.healthMax, ch.health + (p.restHealth ?? 0)), morale: Math.min(ch.moraleMax, ch.morale + (p.restMorale ?? 0)) } };
    }
  }

  // Budgets mensuels de l'antenne et du théâtre.
  if (Math.floor((day + 7) / 28) > Math.floor(day / 28)) state = monthlyCommand(state);

  // Le temps passe (solde, anniversaires, Brevet…).
  const passed = applyUpdate(state, { jours_ecoules: 7 });
  state = recordProgress(passed.state, passed.notices);
  notices.push(...passed.notices.filter((n) => !n.endsWith("jours passent.")));
  const now = state.world.day;

  // Les blessures guérissent ; les fiches s'oublient.
  const healing = healInjuries(state.character, now, rested);
  state = { ...state, character: coolHeat(healing.character) };
  for (const h of healing.healed) {
    notices.push(`Guéri : ${h}`);
    lines.push(`Guéri : ${h}.`);
  }

  // Les réponses aux demandes de renseignement.
  {
    const r = resolveRequests(state, rng);
    state = r.state;
    lines.push(...r.lines);
    notices.push(...r.notices);
  }

  // En détention : évasion réussie, ou échange négocié.
  if (state.character.prison) {
    const p = state.character.prison;
    const exchange = plan.some((x) => x.activity === "attendre") && chance(0.08 + satisfactionOf(state.world.geo, state.character.identity.agency) / 1000 + (now - p.since) / 2000, rng);
    if (p.escape >= 100 || exchange) {
      const home = AGENCIES[state.character.identity.agency].hqCity;
      state = {
        ...state,
        character: { ...state.character, prison: null, reputation: Math.max(0, Math.min(100, state.character.reputation + (exchange ? -3 : 6))) },
        world: { ...state.world, cityId: home, location: findCity(home)?.name ?? state.world.location, restUntil: now + 42 },
      };
      const msg = exchange ? "Libéré : échangé au Conseil des Trois" : "Évadé !";
      notices.push(msg);
      lines.push(`${msg}.`);
    }
  }

  // Fatigue et couverture.
  fatigue = Math.max(0, Math.min(100, fatigue - 8));
  const hasCover = state.world.phase === "base";
  if (hasCover) cover -= cadet ? 3 : 5;
  cover = Math.max(0, Math.min(100, cover));
  if (cover < 30 && (initial.character.cover ?? 70) >= 30) notices.push("Ta couverture civile se fissure");
  state = { ...state, character: { ...state.character, fatigue, cover } };

  // Le poste : responsabilités tenues ou négligées, échelons.
  {
    const p = weeklyPost(state, plan, day);
    state = { ...state, post: p.post, character: { ...state.character, reputation: Math.max(0, Math.min(100, state.character.reputation + p.reputation)) } };
    notices.push(...p.notices);
    lines.push(...p.lines);
  }

  // Le corps suit : l'entraînement physique construit, l'inaction et les blessures défont.
  {
    const b = bodyWeek(state.character, plan, { prison: Boolean(state.character.prison), fatigue });
    state = { ...state, character: { ...state.character, body: b.body } };
    notices.push(...b.notices);
  }

  // Les liens s'usent sans nouvelles.
  let neglected: Relation | undefined;
  state = {
    ...state,
    relations: state.relations.map((r) => {
      if (r.status !== "actif" || contacted.has(r.name)) return r;
      const bond = Math.max(0, (r.bond ?? 50) - (BOND_DECAY[r.kind] ?? 4));
      if (bond < 25 && (r.bond ?? 50) >= 25) {
        notices.push(`${r.name} se sent négligé`);
        neglected = r;
      }
      return { ...r, bond };
    }),
  };

  // Les liens vivent : amitiés qui mûrissent, histoires négligées, la vie des civils.
  {
    const b = weeklyBonds(state, rng);
    state = { ...state, relations: b.relations };
    notices.push(...b.notices);
    lines.push(...b.lines);
  }

  // Devoirs : échéances et nouveaux.
  for (const d of state.duties.filter((x) => x.status === "ouvert" && x.dueDay < now)) {
    const p = d.penalty;
    const c = state.character;
    state = {
      ...state,
      duties: state.duties.map((x) => (x.id === d.id ? { ...x, status: "manque" as const } : x)),
      character: {
        ...c,
        reputation: Math.max(0, c.reputation + (p.reputation ?? 0)),
        merit: Math.max(0, c.merit + (p.merit ?? 0)),
        cover: Math.max(0, c.cover + (p.cover ?? 0)),
        morale: Math.max(0, c.morale + (p.morale ?? 0)),
      },
    };
    notices.push(`Devoir manqué : ${d.title}`);
    lines.push(`Devoir manqué : ${d.title} (${[p.reputation && `réputation ${p.reputation}`, p.merit && `mérite ${p.merit}`, p.morale && `moral ${p.morale}`].filter(Boolean).join(", ")}).`);
  }
  const fresh = newDuties(state, rng);
  for (const d of fresh) notices.push(`Nouveau devoir : ${d.title}`);
  state = { ...state, duties: [...state.duties.filter((d) => d.status === "ouvert" || d.dueDay > now - 28), ...fresh] };

  // Informateurs : paie, fiabilité, risque d'être grillé.
  if (state.command.assets.length) {
    let money = state.character.money;
    const assets = state.command.assets.map((a) => {
      if (a.status !== "actif") return a;
      let next = { ...a, reliability: Math.max(0, a.reliability - 3) };
      if (money >= a.cost) money -= a.cost;
      else next.reliability = Math.max(0, next.reliability - 20);
      if (chance(((100 - next.reliability) / 100) * 0.06, rng)) {
        next = { ...next, status: chance(0.3, rng) ? "retourne" : "grille" };
        notices.push(`Informateur ${next.status === "retourne" ? "retourné par l'ennemi" : "grillé"} : ${a.name}`);
      }
      return next;
    });
    state = { ...state, character: { ...state.character, money, ledger: pushLedger(state.character.ledger, state.world.day, "Informateurs", money - state.character.money) }, command: { ...state.command, assets } };
  }

  // L'effectif vit sa vie : missions du Cercle, sièges vacants, cadets brevetés.
  const rosterBefore = state.roster;
  const lives = weeklyRoster(state, rng);
  state = lives.state;
  notices.push(...lives.notices);
  // Tes camarades et collègues : leur fiche suit leurs mutations.
  {
    const sync = syncWithRoster(state.relations, rosterBefore, state.roster, state.world.day);
    state = { ...state, relations: sync.relations };
    for (const n of sync.notices) {
      // Pas de doublon avec ce que l'effectif a déjà annoncé.
      const who = state.relations.find((r) => n.startsWith(r.name))?.name;
      if (!who || !lives.notices.some((x) => x.includes(who))) notices.push(n);
    }
    lines.push(...sync.lines);
  }
  lines.push(...lives.notices.map((n) => `${n}.`));

  // Missions déléguées qui rentrent.
  const back = state.command.delegated.filter((d) => d.returnDay <= now);
  for (const op of back) {
    const ok = chance(op.chance, rng);
    const merit = ok ? missionMerit("regionale", "reussite") / 2 : 0;
    state = {
      ...state,
      character: { ...state.character, merit: state.character.merit + merit },
      roster: state.roster.map((o) => (op.team.includes(o.id) ? { ...o, status: ok || !chance(0.3, rng) ? "apte" : "blesse", busyUntil: ok ? undefined : now + 14, affinity: o.affinity + (ok ? 4 : -3) } : o)),
    };
    notices.push(ok ? `Mission déléguée réussie : ${op.title} (mérite +${merit})` : `Mission déléguée ratée : ${op.title}`);
    lines.push(ok ? `Ton équipe revient de ${op.title} : réussite.` : `Ton équipe revient de ${op.title} : échec.`);
  }
  if (back.length) state = { ...state, command: { ...state.command, delegated: state.command.delegated.filter((d) => d.returnDay > now) } };

  // Le monde tourne : dépêches, calendrier, menaces, agences rivales, ennemis nommés.
  state = { ...state, world: { ...state.world, geo: weeklyWorld(state.world.geo, now, rng) } };
  const start = state.world.startDate ?? "2026-10-05";
  const agenda = weeklyAgenda(state, addDays(start, day), addDays(start, now), rng);
  state = agenda.state;
  notices.push(...agenda.notices);
  const world = weeklyThreats(state, rng);
  state = world.state;
  notices.push(...world.notices);

  // Missions : récupération terminée ?
  if (now >= state.world.restUntil && initial.world.day < initial.world.restUntil && !cadet) lines.push("Récupération terminée : tu peux repartir en mission.");
  const offers = refreshOffers(state, rng);
  state = offers.state;
  notices.push(...offers.notices);

  const event = state.character.prison
    ? `Détention à ${findCity(state.character.prison.cityId)?.name ?? "l'étranger"}, aux mains de ${state.character.prison.captor} : la cellule, les interrogatoires, les autres détenus, l'espoir.`
    : (agenda.event ?? world.event ?? pickEvent(state, rng, neglected));
  state = recordProgress(state, notices);
  const major = !state.character.prison && Boolean(agenda.event || world.event);
  const report: WeekReport = { day: now, lines, event, ...(major ? { major } : {}) };
  return { state: { ...state, lastWeek: report, updatedAt: Date.now() }, report, notices };
}

/**
 * L'effectif vit sa vie : les titulaires partent et reviennent de mission (parfois pas),
 * prennent leur retraite ; un siège vacant est attribué à un officier si personne ne le réclame.
 * Les cadets vieillissent et sortent officiers ; de nouveaux cadets arrivent chaque année.
 */
function weeklyRoster(state: GameState, rng: Rng): { state: GameState; notices: string[] } {
  const now = state.world.day;
  const mine = state.character.identity.agency;
  const notices: string[] = [];
  const vacant = { ...(state.command.vacantSince ?? {}) };
  const newYear = Math.floor(now / 364) > Math.floor((now - 7) / 364);
  const hot = CITIES.filter((c) => !c.tags?.includes("secret"));
  let roster = state.roster.map((o) => {
    let next: Operative = { ...o, fatigue: Math.max(0, o.fatigue - 10) };
    if (newYear) next.age += 1;
    if (next.status === "blesse" && next.busyUntil && next.busyUntil <= now) next = { ...next, status: "apte", busyUntil: undefined, cityId: AGENCIES[o.agency].hqCity, positionDay: now };
    if (next.role === "titulaire" && next.status !== "mort" && next.status !== "retraite") {
      const label = `${next.codename} (${AGENCIES[o.agency].circle.name})`;
      if (next.status === "en_mission" && next.busyUntil && next.busyUntil <= now && !state.mission?.team.includes(o.id)) {
        if (chance(0.012, rng)) {
          next = { ...next, status: "mort", positionDay: now };
          vacant[`${o.agency}:${o.seat}`] = now;
          if (o.agency === mine) notices.push(`${next.codename} n'est pas rentré de mission : ${findSeat(o.agency, o.seat)?.name} est vacant`);
        } else if (chance(0.08, rng)) next = { ...next, status: "blesse", busyUntil: now + 21, cityId: AGENCIES[o.agency].hqCity, positionDay: now };
        else next = { ...next, status: "apte", busyUntil: undefined, cityId: AGENCIES[o.agency].hqCity, positionDay: now };
        void label;
      } else if (next.status === "apte" && chance(0.45, rng)) {
        next = { ...next, status: "en_mission", busyUntil: now + randInt(10, 40, rng), cityId: pick(hot, rng).id, positionDay: now };
      }
      if (next.status === "apte" && next.age >= 45 && chance(0.015, rng)) {
        next = { ...next, status: "retraite" };
        vacant[`${o.agency}:${o.seat}`] = now;
        if (o.agency === mine) notices.push(`${next.codename} prend sa retraite : ${findSeat(o.agency, o.seat)?.name} est vacant`);
      }
    } else if (next.role !== "cadet" && next.status === "apte" && chance(0.12, rng)) {
      // Officiers et soutiens bougent : missions, congés. La carte montre leur dernière position connue.
      const base = next.station ?? AGENCIES[o.agency].hqCity;
      next = { ...next, cityId: chance(0.6, rng) ? base : pick(hot, rng).id, positionDay: now };
    }
    // Les cadets sortent officiers à 18 ans.
    if (next.role === "cadet" && next.age >= 18) {
      const station = pick(AGENCIES[o.agency].stations, rng);
      next = { ...next, role: "officier", rank: "agent", station, cityId: station, positionDay: now };
      if (o.agency === mine) notices.push(`${next.name} reçoit son Brevet : officier à ${findCity(station)?.name}`);
    }
    return next;
  });

  // Les sièges vacants depuis plus de dix semaines finissent par être attribués.
  for (const [key, since] of Object.entries(vacant)) {
    if (now - since < 70 || !chance(0.12, rng)) continue;
    const [agency, seatId] = key.split(":") as [typeof mine, string];
    const seat = findSeat(agency, seatId);
    const taken = roster.some((o) => o.agency === agency && o.seat === seatId && o.status !== "mort" && o.status !== "retraite") || (agency === mine && state.character.seat === seatId);
    if (taken) {
      delete vacant[key];
      continue;
    }
    const candidate = roster
      .filter((o) => o.agency === agency && o.role === "officier" && o.status === "apte" && !state.command.squad.includes(o.id))
      .sort((a, b) => Object.values(b.skills).reduce((n, v) => n + (v ?? 0), 0) - Object.values(a.skills).reduce((n, v) => n + (v ?? 0), 0))[0];
    if (!candidate || !seat) continue;
    roster = roster.map((o) =>
      o.id === candidate.id ? { ...o, role: "titulaire", rank: "titulaire", seat: seatId, codename: seat.name.replace(/^le Banc d(?:e |')/, ""), station: undefined, cityId: AGENCIES[agency].hqCity, positionDay: now } : o,
    );
    delete vacant[key];
    if (agency === mine) notices.push(`${seat.name} est attribué à ${candidate.name}, désormais « ${seat.name.replace(/^le Banc d(?:e |')/, "")} »`);
  }

  // Une nouvelle promotion de cadets arrive chaque année.
  if (newYear) for (let i = 0; i < 2; i++) roster.push({ ...recruitCadet(state, rng), age: 14 });

  return { state: { ...state, roster, command: { ...state.command, vacantSince: vacant } }, notices };
}

function recruitCadet(state: GameState, rng: Rng): Operative {
  const o = recruitOperative(state, state.character.identity.agency, rng);
  return { ...o, role: "cadet", rank: "aspirant", station: undefined, cityId: AGENCIES[state.character.identity.agency].academyCity };
}

/** Place sur la carte une relation dont le narrateur a écrit le lieu en toutes lettres. */
export function locateRelation(r: Relation, day: number): Relation {
  const city = matchCity(r.location);
  return city && city.id !== r.cityId ? { ...r, cityId: city.id, positionDay: day } : r;
}

/** Résumé de la vie hors mission pour le narrateur. */
export function lifeSummary(state: GameState): string {
  const c = state.character;
  const open = state.duties.filter((d) => d.status === "ouvert");
  const lines = [
    `Fatigue ${c.fatigue}/100 — Couverture civile ${c.cover}/100${c.cover < 30 ? " (ELLE SE FISSURE : famille et entourage posent des questions)" : ""}.`,
    open.length ? `Devoirs en cours : ${open.map((d) => `${d.title} (échéance J${d.dueDay}, ${d.progress}/${d.required})`).join(" ; ")}.` : "Aucun devoir en cours.",
    state.world.day < state.world.restUntil ? `Récupération obligatoire jusqu'au jour ${state.world.restUntil} : pas de mission avant.` : "",
    state.offers.length ? `Missions proposées : ${state.offers.map((o) => `${o.title} (${MISSION_IMPORTANCE[o.importance].label.toLowerCase()})`).join(" ; ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export const isOperativeFree = isAvailable;
export { OPERATIVE_TRAITS };

/** Un jet de détention (2d6 + la meilleure des compétences proposées). */
function prisonCheck(state: GameState, skills: SkillId[], dc: number, rng: Rng): { ok: boolean; total: number } {
  const c = state.character;
  const best = Math.max(...skills.map((k) => c.attributes[SKILLS[k].attribute] + c.skills[k].rank));
  const total = best + 1 + Math.floor(rng() * 6) + 1 + Math.floor(rng() * 6);
  return { ok: total >= dc, total };
}
