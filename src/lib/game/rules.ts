import { AGENCIES } from "./agencies";
import type {
  MissionImportance,
  MissionResult,
  AttributeId,
  CheckOutcome,
  ChoiceTone,
  Difficulty,
  Gender,
  PhaseId,
  RankId,
  SkillId,
} from "./types";

/* ------------------------------------------------------------------ */
/* Pôles                                                               */
/* ------------------------------------------------------------------ */

export interface AttributeDef {
  label: string;
  short: string;
  color: string;
  tagline: string;
  description: string;
}

export const ATTRIBUTES: Record<AttributeId, AttributeDef> = {
  esprit: {
    label: "Esprit",
    short: "ESP",
    color: "var(--pole-esprit)",
    tagline: "Penser plus vite que l'adversaire.",
    description: "Raisonnement, savoir, technique. Le pôle des cerveaux, des hackers et des stratèges.",
  },
  ame: {
    label: "Âme",
    short: "ÂME",
    color: "var(--pole-ame)",
    tagline: "Lire les gens. Se tenir soi-même.",
    description: "Volonté, intuition, empathie, art du rôle. Le pôle des manipulateurs et des gentlemen.",
  },
  corps: {
    label: "Corps",
    short: "COR",
    color: "var(--pole-corps)",
    tagline: "Encaisser. Frapper. Tenir debout.",
    description: "Force, endurance, combat, réflexes de survie. Le pôle de ceux qu'on envoie au contact.",
  },
  geste: {
    label: "Geste",
    short: "GES",
    color: "var(--pole-geste)",
    tagline: "La précision d'une main de tailleur.",
    description: "Adresse, discrétion, perception, vitesse. Le pôle des ombres et des tireurs.",
  },
};

export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[];

export const ATTR_MIN = 1;
export const ATTR_MAX = 6;
export const ATTR_CREATION_MAX = 5;
export const ATTR_CREATION_POINTS = 8;

/* ------------------------------------------------------------------ */
/* Compétences                                                         */
/* ------------------------------------------------------------------ */

export interface SkillDef {
  label: string;
  attribute: AttributeId;
  description: string;
  /** Personnalité de la voix intérieure, pour le narrateur. */
  voice: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  // ESPRIT — bleu
  logique: {
    label: "Logique",
    attribute: "esprit",
    description: "Déduire, recouper, démonter un mensonge par ses incohérences.",
    voice: "Froide, sûre d'elle, un peu condescendante. Aime les chaînes de causes et les certitudes.",
  },
  archives: {
    label: "Archives",
    attribute: "esprit",
    description: "Culture générale, histoire, art, géopolitique, grands crus et vieux scandales.",
    voice: "Érudite, bavarde, digressive. Sort des anecdotes savantes au pire moment.",
  },
  machine: {
    label: "Machine",
    attribute: "esprit",
    description: "Électronique, piratage, serrures connectées, gadgets du laboratoire.",
    voice: "Rapide, technique, enthousiaste. Parle aux appareils comme à des animaux.",
  },
  babel: {
    label: "Babel",
    attribute: "esprit",
    description: "Langues étrangères, accents, argots, codes et chiffrements.",
    voice: "Polyglotte, joueuse, relève chaque accent et chaque faute de grammaire.",
  },
  medecine: {
    label: "Médecine",
    attribute: "esprit",
    description: "Premiers secours, anatomie, toxicologie, reconnaître un symptôme.",
    voice: "Clinique, calme, un brin morbide. Voit des organes là où les autres voient des gens.",
  },
  tactique: {
    label: "Tactique",
    attribute: "esprit",
    description: "Plans, mémoire spatiale, issues de secours, timing d'une opération.",
    voice: "Militaire, sèche, compte les sorties et les secondes. Déteste l'improvisation.",
  },
  // ÂME — violet
  sangfroid: {
    label: "Sang-froid",
    attribute: "ame",
    description: "Volonté, résister à la peur, à la pression, à l'interrogatoire.",
    voice: "Grave, apaisante, la voix d'un ancien qui a tout vu. Te tient debout quand tout lâche.",
  },
  empathie: {
    label: "Empathie",
    attribute: "ame",
    description: "Lire les émotions, sentir la détresse, comprendre ce que l'autre ne dit pas.",
    voice: "Douce, attentive, parfois bouleversée par ce qu'elle perçoit chez les autres.",
  },
  masque: {
    label: "Masque",
    attribute: "ame",
    description: "Mentir, tenir une couverture, jouer un rôle, se déguiser.",
    voice: "Théâtrale, joueuse, adore les rôles et les répliques. Un peu inquiétante.",
  },
  eloquence: {
    label: "Éloquence",
    attribute: "ame",
    description: "Persuader, négocier, intimider, retourner une conversation.",
    voice: "Charmeuse, stratège des mots, souffle la bonne phrase avec un sourire en coin.",
  },
  instinct: {
    label: "Instinct",
    attribute: "ame",
    description: "Intuition, pressentiments, sentir qu'une pièce « cloche ».",
    voice: "Mystique, énigmatique, parle par images et sensations. Souvent juste, jamais claire.",
  },
  tenue: {
    label: "Tenue",
    attribute: "ame",
    description: "Étiquette, élégance, savoir-vivre, se fondre dans le grand monde.",
    voice: "Snob, impeccable, vouvoie tout le monde. Juge ta posture, tes chaussures et tes manières.",
  },
  // CORPS — rouge
  endurance: {
    label: "Endurance",
    attribute: "corps",
    description: "Tenir la distance, le froid, la faim, le manque de sommeil, le poison.",
    voice: "Lente, solide, têtue. « Encore un pas. Juste un. »",
  },
  force: {
    label: "Force",
    attribute: "corps",
    description: "Soulever, briser, enfoncer, retenir quelqu'un au-dessus du vide.",
    voice: "Brute joviale, simple, fière de tes muscles même quand il n'y a pas de quoi.",
  },
  combat: {
    label: "Combat",
    attribute: "corps",
    description: "Corps à corps, désarmement, self-défense, armes improvisées.",
    voice: "Brutale, concise, voit chaque personne comme une suite d'angles et de cibles.",
  },
  athletisme: {
    label: "Athlétisme",
    attribute: "corps",
    description: "Course, escalade, natation, saut, parkour.",
    voice: "Énergique, compétitive, veut toujours sauter, grimper, courir plus vite.",
  },
  tolerance: {
    label: "Tolérance",
    attribute: "corps",
    description: "Supporter la douleur, les blessures, rester conscient.",
    voice: "Rauque, ironique, presque masochiste. Trouve la douleur « intéressante ».",
  },
  alerte: {
    label: "Alerte",
    attribute: "corps",
    description: "Réflexe de survie, sentir le danger physique, fuir ou frapper d'abord.",
    voice: "Paranoïaque, haletante, crie en MAJUSCULES quand le danger approche.",
  },
  // GESTE — jaune
  precision: {
    label: "Précision",
    attribute: "geste",
    description: "Tir, lancer, viser juste sous pression.",
    voice: "Calme, chuchotée, ne parle qu'en distances, en vent et en respiration.",
  },
  doigte: {
    label: "Doigté",
    attribute: "geste",
    description: "Crochetage, pickpocket, escamotage, désamorçage délicat.",
    voice: "Malicieuse, légère, adore les poches pleines et les serrures têtues.",
  },
  ombre: {
    label: "Ombre",
    attribute: "geste",
    description: "Discrétion, déplacement silencieux, filature, disparaître.",
    voice: "Murmurée, féline, parle de silence et d'angles morts.",
  },
  pilotage: {
    label: "Pilotage",
    attribute: "geste",
    description: "Conduite, deux-roues, bateau, poursuites.",
    voice: "Accro à la vitesse, vulgaire, compte les rapports et les virages.",
  },
  vivacite: {
    label: "Vivacité",
    attribute: "geste",
    description: "Esquive, réflexes, vitesse de main, rattraper ce qui tombe.",
    voice: "Nerveuse, ultra-rapide, phrases hachées. Toujours une demi-seconde en avance.",
  },
  regard: {
    label: "Regard",
    attribute: "geste",
    description: "Observation fine, détails visuels, repérer une filature ou une arme.",
    voice: "Précise, descriptive, remarque la tache, le tic, la bosse sous la veste.",
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export const skillsOf = (a: AttributeId) => SKILL_IDS.filter((s) => SKILLS[s].attribute === a);

/** Plafond de rangs appris : la valeur du pôle (+1 pour la compétence signature). */
export function skillCap(attrValue: number, isSignature: boolean) {
  return attrValue + (isSignature ? 1 : 0);
}

/** XP nécessaire pour passer du rang `rank` au suivant. */
export function xpToNext(rank: number): number {
  return (rank + 1) * 3;
}

export const SKILL_CREATION_POINTS = 3;

/** Coût en points de compétence pour renforcer un pôle soi-même. */
export const POLE_POINT_COST = 3;
/** Points de compétence accordés automatiquement. */
export const POINTS_PER_MISSION = 1;
export const POINTS_PER_RANK = 1;
export const POINTS_PER_BREVET = 2;

/* ------------------------------------------------------------------ */
/* Origines, drames, motivations, traits                               */
/* ------------------------------------------------------------------ */

export interface Origin {
  id: string;
  /** Argent de poche au moment du recrutement, en euros. */
  money: number;
  label: string;
  tagline: string;
  description: string;
  skills: Partial<Record<SkillId, number>>;
  item: { name: string; description: string };
}

export const ORIGINS: Origin[] = [
  {
    id: "pupille",
    money: 15,
    label: "Pupille de l'État",
    tagline: "Six foyers, quatre familles d'accueil, zéro attache.",
    description:
      "Placé par les services sociaux depuis tout petit. Tu as appris à lire les adultes avant qu'ils ne te lisent, et à ne rien posséder que tu ne puisses porter.",
    skills: { masque: 1, regard: 1 },
    item: { name: "Sac à dos rapiécé", description: "Tout ce que tu possèdes tient dedans. Toujours prêt à partir." },
  },
  {
    id: "rue",
    money: 8,
    label: "Enfant de la rue",
    tagline: "Les toits, les gares, les nuits blanches.",
    description:
      "Fugueur depuis longtemps, tu as survécu entre squats, gares et petits larcins. Tu connais la ville comme personne et tu cours très, très vite.",
    skills: { doigte: 1, athletisme: 1 },
    item: { name: "Couteau suisse ébréché", description: "Volé, puis gardé. Il t'a sorti de plus d'un mauvais pas." },
  },
  {
    id: "prodige",
    money: 40,
    label: "Prodige incompris",
    tagline: "Trop intelligent pour l'école, pas assez sage pour le reste.",
    description:
      "QI hors normes, ennui chronique. Tu as fini par pirater le réseau de ton collège — ou quelque chose de bien plus gros — juste pour voir si c'était possible.",
    skills: { machine: 1, logique: 1 },
    item: { name: "Ordinateur portable bricolé", description: "Une carcasse rafistolée, un système maison, des secrets dedans." },
  },
  {
    id: "escroc",
    money: 120,
    label: "Enfant d'escroc",
    tagline: "Élevé entre deux arnaques et trois fausses identités.",
    description:
      "Ton parent était un artiste de l'arnaque. Tu as grandi dans les halls de palaces et les trains de nuit, à jouer des rôles avant même de savoir qui tu étais.",
    skills: { masque: 1, tenue: 1 },
    item: { name: "Jeu de cartes truqué", description: "Le dernier cadeau de ton parent. Les as sont toujours là où tu les veux." },
  },
  {
    id: "sportif",
    money: 30,
    label: "Espoir sportif brisé",
    tagline: "Promis aux sommets. Jusqu'à ce que tout s'effondre.",
    description:
      "Centre de formation, compétitions, rêves olympiques… puis un scandale, une blessure ou un drame familial a tout arrêté. Il te reste un corps entraîné et une rage sourde.",
    skills: { athletisme: 1, endurance: 1 },
    item: { name: "Médaille ternie", description: "Ta seule victoire officielle. Tu ne sais pas pourquoi tu la gardes." },
  },
  {
    id: "heritier",
    money: 60,
    label: "Héritier déchu",
    tagline: "Hier, un nom qui ouvrait toutes les portes.",
    description:
      "Grande famille, pensionnats suisses, vacances à Gstaad. Puis la ruine, le scandale ou la mort. L'argent a disparu, pas les manières ni les langues.",
    skills: { tenue: 1, babel: 1 },
    item: { name: "Chevalière de famille", description: "Un blason que plus personne ne respecte. Sauf toi." },
  },
  {
    id: "militaire",
    money: 50,
    label: "Enfant de militaire",
    tagline: "Casernes, déménagements, discipline.",
    description:
      "Élevé au rythme des mutations d'un parent militaire, d'une base lointaine à l'autre. Tu sais te tenir droit, obéir… et désobéir quand il le faut.",
    skills: { precision: 1, tactique: 1 },
    item: { name: "Plaque d'identité militaire", description: "Celle de ton parent. Le métal est toujours froid." },
  },
  {
    id: "delinquant",
    money: 25,
    label: "Délinquant juvénile",
    tagline: "Casier épais, centre fermé pour mineurs.",
    description:
      "Vols, bagarres, cambriolages : tu as fini en centre fermé pour mineurs. Les éducateurs disaient que tu étais « irrécupérable ». Quelqu'un, quelque part, n'est pas d'accord.",
    skills: { combat: 1, ombre: 1 },
    item: { name: "Crochets de serrurier artisanaux", description: "Deux épingles tordues avec amour. Plus fiables qu'une clé." },
  },
  {
    id: "forain",
    money: 35,
    label: "Enfant de la balle",
    tagline: "Cirque, fêtes foraines, une ville par semaine.",
    description:
      "Né sous un chapiteau, tu as appris à jongler avant de savoir lire et à repérer un pigeon dans la foule à trente mètres. Puis le cirque a fermé — ou brûlé.",
    skills: { vivacite: 1, empathie: 1 },
    item: { name: "Trois balles de jonglage", description: "Usées, recousues. Tes mains s'apaisent quand elles les tiennent." },
  },
  {
    id: "exil",
    money: 10,
    label: "Enfant de l'exil",
    tagline: "Une autre langue, un autre pays, une traversée.",
    description:
      "Ta famille a fui une guerre ou une dictature. Tu as connu les camps, les guichets, les nuits à attendre. Tu parles trois langues et tu n'as peur de presque rien.",
    skills: { babel: 1, endurance: 1 },
    item: { name: "Photo pliée en quatre", description: "Une maison, là-bas. Des visages que tu ne veux pas oublier." },
  },
];

export interface Drama {
  id: string;
  label: string;
  description: string;
}

export const DRAMAS: Drama[] = [
  { id: "accident", label: "Un accident", description: "Tes parents sont morts dans un accident. Tout le monde dit que c'était un accident." },
  { id: "disparition", label: "Une disparition", description: "Un parent a disparu du jour au lendemain, sans un mot. L'enquête n'a jamais rien donné." },
  { id: "prison", label: "Un parent en prison", description: "Ton parent purge une longue peine. Tu ne sais pas si tu dois le haïr ou l'attendre." },
  { id: "abandon", label: "Abandonné à la naissance", description: "Un berceau, une maternité, aucun nom. Tes origines sont une page blanche." },
  { id: "toxique", label: "Une famille toxique", description: "Le juge t'a retiré à ta famille. Il y a des choses dont tu ne parles jamais." },
  { id: "assassinat", label: "Un meurtre classé", description: "Ton parent a été tué. L'affaire a été classée bien trop vite." },
  { id: "fugue", label: "Parti de toi-même", description: "Personne ne t'a perdu : c'est toi qui es parti. Et tu avais de bonnes raisons." },
  { id: "mystere", label: "Laisser le dossier décider", description: "Le narrateur choisit — et il ne te dira peut-être pas tout tout de suite." },
];

export const MOTIVATIONS = [
  { id: "appartenance", label: "Appartenir à quelque chose", description: "Une famille, même une famille de l'ombre." },
  { id: "verite", label: "Découvrir la vérité", description: "Sur ton passé, sur ce qui est arrivé à ta famille." },
  { id: "adrenaline", label: "L'adrénaline", description: "La vie normale t'ennuie à mourir." },
  { id: "prouver", label: "Prouver ta valeur", description: "À ceux qui t'ont dit que tu ne valais rien." },
  { id: "proteger", label: "Protéger les autres", description: "Pour que personne ne vive ce que tu as vécu." },
  { id: "liberte", label: "La liberté", description: "Un casier effacé, un avenir, une porte de sortie." },
];

export interface Trait {
  id: string;
  label: string;
  description: string;
  skills?: Partial<Record<SkillId, number>>;
  healthMax?: number;
  moraleMax?: number;
  reputation?: number;
}

export const QUALITIES: Trait[] = [
  { id: "memoire", label: "Mémoire photographique", description: "Un visage, une plaque, un code : tu n'oublies rien.", skills: { archives: 1, regard: 1 } },
  { id: "cameleon", label: "Caméléon", description: "Tu te fonds dans n'importe quel décor.", skills: { masque: 1, ombre: 1 } },
  { id: "nerfs", label: "Nerfs d'acier", description: "Plus ça chauffe, plus tu es calme.", skills: { sangfroid: 2 } },
  { id: "bagarreur", label: "Bagarreur né", description: "Tu as grandi en encaissant. Et en rendant.", skills: { combat: 1, tolerance: 1 } },
  { id: "lynx", label: "Œil de lynx", description: "Tu vois ce que les autres ratent.", skills: { precision: 1, regard: 1 } },
  { id: "argent", label: "Langue d'argent", description: "Tu pourrais vendre du sable au Sahara.", skills: { eloquence: 1, masque: 1 } },
  { id: "fee", label: "Doigts de fée", description: "Serrures, poches, circuits : tes mains savent.", skills: { doigte: 1, machine: 1 } },
  { id: "polyglotte", label: "Polyglotte", description: "Les langues entrent dans ta tête sans frapper.", skills: { babel: 2 } },
  { id: "endurant", label: "Increvable", description: "Tu encaisses ce qui en mettrait d'autres au tapis.", healthMax: 2, skills: { endurance: 1 } },
  { id: "charme", label: "Charme naturel", description: "Les gens t'apprécient sans savoir pourquoi.", skills: { eloquence: 1, empathie: 1 } },
  { id: "sixieme", label: "Sixième sens", description: "Tu sens le danger avant de le voir.", skills: { instinct: 1, alerte: 1 } },
  { id: "geek", label: "Bricoleur de génie", description: "Donne-toi un trombone et une pile.", skills: { machine: 2 } },
  { id: "stratege", label: "Stratège", description: "Tu as toujours trois coups d'avance. Au moins.", skills: { tactique: 1, logique: 1 } },
  { id: "felin", label: "Félin", description: "Souple, rapide, tu retombes toujours sur tes pattes.", skills: { vivacite: 1, athletisme: 1 } },
];

export const FLAWS: Trait[] = [
  { id: "tetebrulee", label: "Tête brûlée", description: "Tu fonces d'abord, tu réfléchis à l'infirmerie.", skills: { sangfroid: -1, tactique: -1 } },
  { id: "insolent", label: "Insolent", description: "Le respect, ça se mérite. Les instructeurs adorent.", skills: { tenue: -1 }, reputation: -5 },
  { id: "cauchemars", label: "Cauchemars", description: "Les nuits sont longues, et elles reviennent toujours.", moraleMax: -2 },
  { id: "asthme", label: "Asthmatique", description: "Ta ventoline, c'est ton arme secrète. Ne la perds pas.", skills: { athletisme: -1, endurance: -1 } },
  { id: "mefiant", label: "Méfiance maladive", description: "Tout le monde ment. Surtout ceux qui sourient.", skills: { empathie: -1 } },
  { id: "kleptomane", label: "Kleptomane", description: "Ce n'est pas toi, ce sont tes mains.", skills: { doigte: 1 } },
  { id: "phobie", label: "Phobie", description: "Vertige, noyade ou espaces clos : un jour, ça tombera au pire moment." },
  { id: "grandegueule", label: "Grande gueule", description: "Tu ne sais pas te taire. Même quand ta vie en dépend.", skills: { masque: -1, ombre: -1 } },
  { id: "autorite", label: "Allergie à l'autorité", description: "Un ordre ? Tu as presque envie de faire l'inverse.", reputation: -10 },
  { id: "ecorche", label: "Écorché vif", description: "Tu ressens tout, trop fort, tout le temps.", skills: { empathie: 1 }, moraleMax: -2 },
];

export const QUALITY_COUNT = 2;

export const GENDERS: { id: Gender; label: string }[] = [
  { id: "garcon", label: "Garçon" },
  { id: "fille", label: "Fille" },
  { id: "nonbinaire", label: "Non-binaire" },
];

export const AGE_MIN = 14;
export const AGE_MAX = 17;
/** Âge du Brevet : on devient agent, et les vraies missions commencent. */
export const BREVET_AGE = 18;

/** Étape de vie de l'agent selon son âge. */
export function ageStage(age: number): { label: string; description: string } {
  if (age < BREVET_AGE)
    return { label: "Aspirant", description: `En formation : aucune vraie mission avant le Brevet, à ${BREVET_AGE} ans.` };
  return { label: "Agent", description: "Breveté : missions dans le monde entier." };
}

/* ------------------------------------------------------------------ */
/* Grades du Concordat                                                 */
/* ------------------------------------------------------------------ */

export interface RankDef {
  label: string;
  /** Ancienneté (0 à 5) : deux grades de voies différentes peuvent avoir la même. */
  order: number;
  /** Voie de carrière : tronc commun, terrain (le Cercle) ou commandement. */
  track: "tronc" | "terrain" | "commandement" | "sommet";
  color: string;
  /** Mérite cumulé requis. */
  merit: number;
  /** Âge minimal. */
  minAge: number;
  /** Grades d'où l'on peut y accéder. */
  from: RankId[];
  /** Condition affichée au joueur. */
  requirement: string;
  /** Ce que le grade permet (vraies responsabilités en jeu). */
  powers: string;
  /** Ce qu'il impose. */
  duties: string;
  /** Solde hebdomadaire, en euros. */
  allowance: number;
  /** Fonds opérationnels maximum par mission, en euros. */
  fundsCap: number;
}

export const RANKS: Record<RankId, RankDef> = {
  prospect: {
    label: "Prospect",
    order: 0,
    track: "tronc",
    color: "#6b6a66",
    merit: 0,
    minAge: 0,
    from: [],
    requirement: "Être signalé par un Correspondant d'un pays membre.",
    powers: "Aucun. Tu ne sais même pas pour qui tu passes ces épreuves.",
    duties: "Tout peut s'arrêter du jour au lendemain, sans explication.",
    allowance: 0,
    fundsCap: 0,
  },
  aspirant: {
    label: "Cadet",
    order: 1,
    track: "tronc",
    color: "#8f949c",
    merit: 0,
    minAge: 0,
    from: ["prospect"],
    requirement: "Être l'un des un ou deux prospects retenus à la Sélection, et accepter la Révélation.",
    powers: "Formation à l'Académie, Opérations Jeunesse encadrées, Jeux de Lucerne.",
    duties: "Tu ne quittes l'Académie qu'avec une autorisation. Tes examens comptent.",
    allowance: 60,
    fundsCap: 3000,
  },
  agent: {
    label: "Officier",
    order: 2,
    track: "tronc",
    color: "#3a7bd5",
    merit: 0,
    minAge: BREVET_AGE,
    from: ["aspirant"],
    requirement: `Le Brevet, à ${BREVET_AGE} ans.`,
    powers: "Affecté à une Station : missions locales et régionales, soutien des titulaires de passage, informations de terrain.",
    duties: "Tu obéis à ton chef de station. Tu rêves d'un siège au Cercle, comme tous les autres.",
    allowance: 700,
    fundsCap: 5000,
  },
  titulaire: {
    label: "Titulaire",
    order: 3,
    track: "terrain",
    color: "#2f8f6a",
    merit: 6,
    minAge: BREVET_AGE,
    from: ["agent"],
    requirement: "Un siège libre au Cercle, 6 de mérite, et une mission continentale ou mondiale réussie.",
    powers: "Un siège au Cercle et la Licence de Lucerne : opérer seul partout, choisir ses approches, réquisitionner les prototypes, ses propres informateurs.",
    duties: "Les missions qui comptent te reviennent, et l'agence ne te couvrira pas toujours.",
    allowance: 1400,
    fundsCap: 80000,
  },
  doyen: {
    label: "Doyen du Cercle",
    order: 4,
    track: "terrain",
    color: "#c9a45c",
    merit: 28,
    minAge: 25,
    from: ["titulaire"],
    requirement: "28 de mérite, 25 ans, aucun blâme : le plus respecté des titulaires.",
    powers: "Mener les opérations conjointes, former deux officiers comme seconds, avoir l'oreille du Directeur.",
    duties: "Tes seconds sont ta responsabilité ; le Cercle te regarde.",
    allowance: 1800,
    fundsCap: 250000,
  },
  chef_station: {
    label: "Chef de station",
    order: 3,
    track: "commandement",
    color: "#7a6fd0",
    merit: 8,
    minAge: 21,
    from: ["agent"],
    requirement: "8 de mérite et 21 ans.",
    powers: "Diriger une Station : son budget, ses modules, ses officiers et ses informateurs ; confier des missions locales à tes officiers.",
    duties: "Rapports mensuels, discrétion de la Station, sécurité de tes officiers.",
    allowance: 1200,
    fundsCap: 60000,
  },
  controleur: {
    label: "Contrôleur",
    order: 4,
    track: "commandement",
    color: "#a8324a",
    merit: 22,
    minAge: 25,
    from: ["chef_station", "titulaire", "doyen"],
    requirement: "22 de mérite et 25 ans, en venant d'une Station ou du Cercle (qu'on quitte alors).",
    powers: "Traiter les titulaires : leur confier les missions, superviser une région, commander des projets au laboratoire.",
    duties: "Les échecs de tes agents sont les tiens. Une région entière dépend de tes choix.",
    allowance: 2200,
    fundsCap: 1000000,
  },
  directeur: {
    label: "Directeur",
    order: 5,
    track: "sommet",
    color: "var(--color-ivory)",
    merit: 60,
    minAge: 32,
    from: ["controleur"],
    requirement: "60 de mérite, 32 ans, avoir siégé au Cercle, et le départ du Directeur en place.",
    powers: "Diriger l'agence, répondre aux gouvernements, siéger au Conseil des Trois.",
    duties: "Le monde entier.",
    allowance: 3500,
    fundsCap: 50000000,
  },
};

/** Ce que chaque grade permet de faire dans le jeu. */
export type Capability = "informants" | "station" | "seconds" | "region" | "agency" | "delegate" | "choose_missions" | "seat";

export const CAPABILITIES: Record<RankId, Capability[]> = {
  prospect: [],
  aspirant: [],
  agent: [],
  titulaire: ["informants", "seat", "choose_missions"],
  doyen: ["informants", "seat", "seconds", "choose_missions"],
  chef_station: ["informants", "station", "delegate", "choose_missions"],
  controleur: ["informants", "region", "delegate", "choose_missions"],
  directeur: ["informants", "region", "agency", "delegate", "choose_missions"],
};

export const can = (rank: RankId, cap: Capability) => CAPABILITIES[rank]?.includes(cap) ?? false;

export const RANK_IDS = Object.keys(RANKS) as RankId[];

/* ------------------------------------------------------------------ */
/* Mérite et argent                                                    */
/* ------------------------------------------------------------------ */

export const MISSION_IMPORTANCE: Record<MissionImportance, { label: string; merit: number }> = {
  locale: { label: "Locale", merit: 1 },
  regionale: { label: "Régionale", merit: 2 },
  continentale: { label: "Continentale", merit: 4 },
  mondiale: { label: "Mondiale", merit: 8 },
};

export const MISSION_RESULTS: Record<MissionResult, { label: string; factor: number }> = {
  echec: { label: "Échec", factor: 0 },
  partiel: { label: "Succès partiel", factor: 0.5 },
  reussite: { label: "Réussite", factor: 1 },
  eclatant: { label: "Succès éclatant", factor: 1.5 },
};

/** Mérite d'une mission : importance × résultat (arrondi au demi-point). */
export function missionMerit(importance: MissionImportance, result: MissionResult): number {
  return Math.round(MISSION_IMPORTANCE[importance].merit * MISSION_RESULTS[result].factor * 2) / 2;
}

/** Prime de mission : 1 000 € par point de mérite gagné. */
export function missionBonus(importance: MissionImportance, result: MissionResult): number {
  return missionMerit(importance, result) * 1000;
}

export function formatEuros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export function formatMerit(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(".", ",");
}

/** Distinctions du Concordat, communes aux trois agences. */
export const PINS = [
  { name: "Major de promotion", description: "Premier de sa promotion à la Sélection ou au Brevet." },
  { name: "Croix d'argent", description: "Avoir sauvé la vie d'un équipier." },
  { name: "Plaque de jade", description: "Mission réussie sans avoir jamais été détecté." },
  { name: "Ruban rouge", description: "Blessé en service." },
  { name: "Étoile de Lucerne", description: "Acte exceptionnel, remise par le Conseil des Trois. Rarissime." },
];

/* ------------------------------------------------------------------ */
/* Phases et rythme                                                    */
/* ------------------------------------------------------------------ */

export const PHASES: Record<PhaseId, { label: string; description: string }> = {
  dossier: { label: "Dossier", description: "Ton pays te propose à l'agence ; un recruteur reconstitue ta vie." },
  recrutement: { label: "L'Invitation", description: "Une bourse, un programme d'exception. Personne ne te dit la vérité." },
  selection: { label: "La Sélection", description: "100 jours d'épreuves déguisées. À peine un prospect sur dix découvre la vérité." },
  base: { label: "La Base", description: "À l'Académie tant que tu es Aspirant, puis entre deux missions une fois agent." },
  mission: { label: "Mission", description: "Une opération à travers le monde, à partir du Brevet (18 ans)." },
  apres: { label: "Retraite", description: "Quitter le service actif." },
};

export const PHASE_IDS = Object.keys(PHASES) as PhaseId[];

/** Libellé de la phase, selon que le personnage est encore aspirant ou déjà agent. */
export function phaseLabel(phase: PhaseId, age: number): string {
  if (phase === "base") return age < BREVET_AGE ? "L'Académie" : "La Base";
  return PHASES[phase].label;
}

export const SELECTION_DAYS = 100;

/**
 * Nombre de tours visé pour chaque phase, selon le rythme choisi
 * (posé / normal / rapide). Le narrateur voit s'il est en avance ou en retard.
 */
/**
 * Durée d'une mission selon son importance, en tours (posé / normal / rapide),
 * et nombre de vraies décisions qu'on attend du joueur.
 */
export const MISSION_LENGTH: Record<MissionImportance, { turns: [number, number, number]; decisions: number }> = {
  locale: { turns: [10, 7, 5], decisions: 2 },
  regionale: { turns: [15, 11, 8], decisions: 3 },
  continentale: { turns: [22, 16, 11], decisions: 4 },
  mondiale: { turns: [30, 22, 15], decisions: 6 },
};

/** Tours prévus pour une mission, et minimum avant de pouvoir la clore. */
export function missionTurns(importance: MissionImportance, pace: keyof typeof PACES): { target: number; min: number } {
  const target = MISSION_LENGTH[importance].turns[PACES[pace].index];
  return { target, min: Math.ceil(target * 0.6) };
}

/** Étape de la structure de mission attendue, selon l'avancement. */
export function missionStage(turn: number, target: number): string {
  const r = turn / target;
  if (r <= 0.15) return "ouverture et briefing, puis première décision : l'approche";
  if (r <= 0.3) return "laboratoire, couverture, départ, arrivée sur le premier lieu";
  if (r <= 0.6) return "terrain : lieux à travers le monde, infiltration de l'entourage de la cible, alliés et soupçons";
  if (r <= 0.8) return "retournement : quelque chose casse (couverture, équipier, plan), et le joueur doit trancher";
  if (r <= 1) return "le repaire et le dénouement : la confrontation finale et ses choix";
  return "conclusion immédiate : dénouement, épilogue, débriefing";
}

export const PHASE_TURN_BUDGET: Record<PhaseId, [number, number, number]> = {
  dossier: [0, 0, 0],
  recrutement: [8, 5, 3],
  selection: [24, 15, 9],
  base: [8, 4, 2],
  mission: [24, 16, 10],
  apres: [10, 6, 4],
};

/** Durée maximale d'une intrigue, en tours, selon le rythme (posé / normal / rapide). */
export const INTRIGUE_MAX_TURNS: [number, number, number] = [10, 7, 5];

export const PACES = {
  pose: { label: "Posé", sceneTurns: "3 à 5", index: 0 },
  normal: { label: "Normal", sceneTurns: "2 à 3", index: 1 },
  rapide: { label: "Rapide", sceneTurns: "1 à 2", index: 2 },
} as const;

/* ------------------------------------------------------------------ */
/* Jets (2d6 + compétence, façon Disco Elysium)                        */
/* ------------------------------------------------------------------ */

export const DIFFICULTIES: Record<Difficulty, { label: string; dc: number }> = {
  triviale: { label: "Triviale", dc: 6 },
  facile: { label: "Facile", dc: 8 },
  moyenne: { label: "Moyenne", dc: 10 },
  ardue: { label: "Ardue", dc: 12 },
  redoutable: { label: "Redoutable", dc: 13 },
  legendaire: { label: "Légendaire", dc: 14 },
  heroique: { label: "Héroïque", dc: 15 },
  surhumaine: { label: "Surhumaine", dc: 16 },
  impossible: { label: "Impossible", dc: 18 },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as Difficulty[];

/** Écart sous le seuil qui donne encore une réussite partielle (succès à un prix). */
export const PARTIAL_MARGIN = 1;
/** Bonus fixe d'un test passif (voix intérieure) : compétence + 6 contre le seuil. */
export const PASSIVE_BONUS = 6;

export const OUTCOMES: Record<CheckOutcome, { label: string; guidance: string }> = {
  reussite_critique: {
    label: "Réussite critique",
    guidance: "Double six : succès éclatant, au-delà des espérances, avec un bonus inattendu.",
  },
  reussite: { label: "Réussite", guidance: "L'action réussit pleinement." },
  reussite_partielle: {
    label: "Réussite partielle",
    guidance: "L'action réussit mais à un prix : complication, bruit, blessure légère, temps perdu ou soupçon.",
  },
  echec: { label: "Échec", guidance: "L'action échoue. La situation évolue — rarement en mieux." },
  echec_critique: {
    label: "Échec critique",
    guidance: "Double un : échec cuisant avec une conséquence sérieuse (blessure, couverture menacée, humiliation publique…).",
  },
};

export const LOW_THRESHOLD = 3;

export function healthMaxFor(corps: number) {
  return 6 + corps * 2;
}
export function moraleMaxFor(ame: number) {
  return 6 + ame * 2;
}

export const CHOICE_TONES: Record<ChoiceTone, { label: string }> = {
  audace: { label: "Audace" },
  prudence: { label: "Prudence" },
  ruse: { label: "Ruse" },
  social: { label: "Social" },
  ellipse: { label: "Avancer" },
  autre: { label: "Autre" },
};

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const findOrigin = (id: string) => ORIGINS.find((o) => o.id === id);
export const findDrama = (id: string) => DRAMAS.find((d) => d.id === id);
export const findMotivation = (id: string) => MOTIVATIONS.find((m) => m.id === id);
export const findQuality = (id: string) => QUALITIES.find((q) => q.id === id);
export const findFlaw = (id: string) => FLAWS.find((f) => f.id === id);

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Retrouve une compétence par son identifiant ou son nom (« Sang-froid », « sangfroid »…). */
export function resolveSkill(name: string): SkillId | null {
  const n = normalize(name);
  return SKILL_IDS.find((s) => s === n || normalize(SKILLS[s].label) === n) ?? null;
}

export const ADVANCE_LABEL = "⏭ Avancer jusqu'au prochain moment important";

/** Nom affiché d'un soutien de mission : coup signature du siège ou Branche. */
function sourceLabel(id: string): string {
  if (id === "seat") return "coup signature du siège";
  for (const a of Object.values(AGENCIES)) {
    const b = a.branches.find((x) => x.id === id);
    if (b) return b.name;
  }
  return id;
}

/** Texte affiché pour l'action du joueur (null pour le début de partie). */
export function actionLabel(action: import("./types").PlayerAction): string | null {
  switch (action.type) {
    case "start":
      return null;
    case "advance":
      return ADVANCE_LABEL;
    case "contact":
      return `☎ Contacter ${action.name} — ${action.intent}`;
    case "use":
      return `▣ Utiliser ${action.item}${action.how ? ` — ${action.how}` : ""}`;
    case "resource":
      return `✦ Soutien : ${sourceLabel(action.source)}`;
    case "promotion":
      return `❖ ${RANKS[action.rank].label}`;
    case "week":
      return "▤ Une semaine passe";
    case "mission_start":
      return "✈ Départ en mission";
    case "node":
      return "▸ Action";
    case "node_free":
      return action.text;
    case "choice":
    case "free":
      return action.text;
  }
}

/** Classe une notification du moteur pour l'historique et les alertes de progression. */
export function progressKind(text: string): import("./types").ProgressKind | null {
  if (/progresse : rang|plafonne/.test(text)) return "skill";
  if (/^(Esprit|Âme|Corps|Geste) passe à/.test(text)) return "pole";
  if (/^(Nouveau grade|Promotion possible)/.test(text)) return "rank";
  if (/^(Mérite|Blâme)/.test(text)) return "merit";
  if (/^Nom de code/.test(text)) return "codename";
  if (/^Distinction/.test(text)) return "pin";
  if (/point(s)? de compétence/.test(text)) return "points";
  if (/^(Obtenu|Perdu|Rendu au laboratoire|.* est épuisé)/.test(text)) return "item";
  if (/^(Siège au Cercle|Affectation|Matricule)/.test(text)) return "seat";
  if (/^Prime de mission/.test(text)) return "money";
  if (/^(Anniversaire|Majorité)/.test(text)) return "age";
  return null;
}

export type Voice =
  | { kind: "skill"; skill: SkillId }
  | { kind: "trait"; label: string; flaw: boolean }
  | { kind: "other"; label: string };

/**
 * Identifie qui parle dans une voix intérieure `{{…}}` : une compétence, une
 * qualité ou le défaut du personnage (par identifiant ou début de nom), ou à
 * défaut une voix libre affichée telle quelle.
 */
export function resolveVoice(name: string): Voice {
  const skill = resolveSkill(name);
  if (skill) return { kind: "skill", skill };
  const n = normalize(name);
  const match = (t: Trait) => t.id === n || (n.length >= 4 && normalize(t.label).startsWith(n)) || normalize(t.label) === n;
  const quality = QUALITIES.find(match);
  if (quality) return { kind: "trait", label: quality.label, flaw: false };
  const flaw = FLAWS.find(match);
  if (flaw) return { kind: "trait", label: flaw.label, flaw: true };
  const label = name.trim().replace(/[_-]+/g, " ");
  return { kind: "other", label: label.charAt(0).toUpperCase() + label.slice(1) };
}
