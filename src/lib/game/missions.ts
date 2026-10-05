/**
 * Missions jouées par le moteur : génération, préparation, étapes et résultat.
 * Le narrateur ne fait que raconter ce que ce module décide.
 */
import { AGENCIES, findBranch, findSeat } from "./agencies";
import { findGadget, GADGETS } from "./gadgets";
import { chance, pick, pickWeighted, randInt, shuffle, uid, type Rng } from "./rng";
import { bestSkill, isAvailable, OPERATIVE_TRAITS, operativeSkill } from "./roster";
import { DIFFICULTIES, DIFFICULTY_IDS, MISSION_IMPORTANCE, MISSION_RESULTS, RANKS, SKILLS, can, formatEuros, formatMerit, missionBonus, missionMerit, POINTS_PER_MISSION } from "./rules";
import type {
  MissionRecord,
  AgencyId,
  Approach,
  CheckOutcome,
  CheckResult,
  Difficulty,
  DilemmaEffect,
  GameState,
  Item,
  Mission,
  MissionImportance,
  MissionKind,
  MissionNode,
  MissionOffer,
  MissionResult,
  NodeType,
  Operative,
  RankId,
  Risk,
  SkillId,
} from "./types";
import { CITIES, REGIONS, cityRegion, citiesOfRegion, findCity, findCountry, type RegionId } from "@/lib/world/geo";
import { INTERESTS, addDossier, fundingFactor, makeNemesis, shiftSatisfaction } from "@/lib/world/threats";
import { LANGUAGE_NODES, addHeat, arrest, heatLabel, heatOf, inflictInjury, injuryMalus, languageBonus, legendShield, legendUsableIn, trip } from "./field";
import { possessionBonus } from "./economy";
import { factionsOfRegion, findFaction } from "@/lib/world/factions";
import { addNews, diplomacyBetween, shiftDiplomacy, shiftTension, weightedRegion } from "@/lib/world/world";

/* ------------------------------------------------------------------ */
/* Contexte d'une mission                                              */
/* ------------------------------------------------------------------ */

interface Ctx {
  city: string;
  country: string;
  target: string;
  faction: string;
  cover: string;
  other: string;
  agency: string;
}

/** « de les services russes » → « des services russes », « à Le Caire » → « au Caire ». */
function contract(prep: string, value: string): string {
  const m = /^(les|le|Le|Les) (.*)$/.exec(value);
  if (!m) return `${prep} ${value}`;
  const plural = m[1].toLowerCase() === "les";
  const art = prep === "de" ? (plural ? "des" : "du") : plural ? "aux" : "au";
  return `${art} ${m[2]}`;
}

const t = (raw: string, c: Ctx) =>
  raw
    .replace(/\b(de|à) \{(city|country|target|faction|other)\}/g, (_, prep: string, key: keyof Ctx) => contract(prep, c[key]))
    .replace(/\{city\}/g, c.city)
    .replace(/\{country\}/g, c.country)
    .replace(/\{target\}/g, c.target)
    .replace(/\{faction\}/g, c.faction)
    .replace(/\{cover\}/g, c.cover)
    .replace(/\{other\}/g, c.other)
    .replace(/\{agency\}/g, c.agency);

/* ------------------------------------------------------------------ */
/* Approches par type d'étape                                          */
/* ------------------------------------------------------------------ */

interface ApproachTpl {
  label: string;
  skill: SkillId;
  difficulty: Difficulty;
  risk: Partial<Risk>;
  intel?: number;
  cost?: number;
}

const A = (label: string, skill: SkillId, difficulty: Difficulty, risk: Partial<Risk>, extra: { intel?: number; cost?: number } = {}): ApproachTpl => ({
  label,
  skill,
  difficulty,
  risk,
  ...extra,
});

interface NodeDef {
  title: string[];
  situation: string[];
  approaches: ApproachTpl[];
}

const NODES: Record<Exclude<NodeType, "objectif" | "dilemme">, NodeDef> = {
  approche: {
    title: ["Arrivée à {city}", "Le premier contact avec {city}", "Entrer dans la zone"],
    situation: [
      "Il faut arriver à {city} et s'approcher de {target} sans que personne ne fasse le lien avec {agency}.",
      "{city} grouille d'yeux : ceux de {faction}, ceux de la police locale, peut-être ceux d'une agence rivale.",
    ],
    approaches: [
      A("Voyager sous ta couverture de {cover}", "masque", "moyenne", { exposure: 15 }),
      A("Arriver par une voie détournée, de nuit", "ombre", "ardue", { alert: 10 }),
      A("Étudier les horaires et choisir ton moment", "tactique", "moyenne", { exposure: 5 }, { intel: 1 }),
      A("Débarquer par la mer ou par les airs", "pilotage", "ardue", { alert: 10, health: 1 }),
      A("Te faire inviter par un contact local", "eloquence", "facile", { exposure: 10 }, { cost: 1500 }),
    ],
  },
  infiltration: {
    title: ["L'infiltration", "Passer à l'intérieur", "Derrière les murs"],
    situation: [
      "Le bâtiment de {target} est gardé : caméras, badges, vigiles privés de {faction}.",
      "Il faut entrer là où {target} se croit intouchable.",
    ],
    approaches: [
      A("Te glisser par les toits et les gaines techniques", "ombre", "ardue", { alert: 15, health: 1 }),
      A("Te faire passer pour un employé", "masque", "moyenne", { exposure: 20 }),
      A("Pirater le contrôle d'accès", "machine", "ardue", { alert: 20 }),
      A("Escalader la façade", "athletisme", "ardue", { alert: 10, health: 2 }),
      A("Corrompre un vigile", "eloquence", "facile", { exposure: 15 }, { cost: 2000 }),
    ],
  },
  social: {
    title: ["Le bon cercle", "Gagner sa confiance", "La soirée"],
    situation: [
      "{target} ne parle qu'aux gens de son monde. Il faut en faire partie, au moins une soirée.",
      "Réception, cercle de jeu ou dîner d'affaires : l'entourage de {target} est là, et il faut s'y faire une place.",
    ],
    approaches: [
      A("Engager la conversation et gagner sa confiance", "eloquence", "moyenne", { exposure: 10 }),
      A("Écouter, et trouver sa faille", "empathie", "moyenne", { exposure: 5 }, { intel: 1 }),
      A("Jouer un personnage irrésistible", "masque", "ardue", { exposure: 20 }),
      A("Briller par ton aisance et tes manières", "tenue", "moyenne", { exposure: 10 }),
      A("Bluffer à la table de jeu", "sangfroid", "ardue", { exposure: 15 }, { cost: 3000 }),
    ],
  },
  renseignement: {
    title: ["Le terrain", "Comprendre avant d'agir", "Les habitudes de la cible"],
    situation: [
      "Avant de bouger, il faut savoir qui protège {target}, à quelle heure, et avec quoi.",
      "Les informations du briefing sont maigres : il faut en apprendre davantage sur place.",
    ],
    approaches: [
      A("Éplucher registres et archives locales", "archives", "moyenne", { alert: 5 }, { intel: 2 }),
      A("Recouper les indices", "logique", "moyenne", { exposure: 5 }, { intel: 2 }),
      A("Observer les lieux une journée entière", "regard", "facile", { exposure: 10 }, { intel: 1 }),
      A("Écouter les conversations en langue locale", "babel", "moyenne", { exposure: 10 }, { intel: 2 }),
      A("Intercepter ses communications", "machine", "ardue", { alert: 15 }, { intel: 3 }),
    ],
  },
  effraction: {
    title: ["Le coffre", "La porte blindée", "La salle sécurisée"],
    situation: ["Ce que tu cherches est derrière une porte que personne n'est censé ouvrir.", "Une salle forte, trois niveaux de sécurité, et peu de temps."],
    approaches: [
      A("Crocheter la serrure", "doigte", "moyenne", { alert: 15 }),
      A("Désactiver l'alarme puis ouvrir", "machine", "ardue", { alert: 25 }),
      A("Forcer, vite", "force", "facile", { alert: 30, health: 1 }),
      A("Découper l'accès au millimètre", "precision", "ardue", { alert: 15 }),
    ],
  },
  filature: {
    title: ["La filature", "Sur ses talons", "Ne pas la perdre"],
    situation: ["{target} se déplace, et il faut savoir où.", "Un contact de {target} quitte le bâtiment : il mène quelque part."],
    approaches: [
      A("La suivre à bonne distance", "regard", "moyenne", { exposure: 15 }),
      A("Coller à la cible dans la foule", "ombre", "ardue", { exposure: 20 }),
      A("Anticiper son trajet", "instinct", "moyenne", { exposure: 10 }),
      A("La suivre en voiture", "pilotage", "moyenne", { alert: 10 }),
    ],
  },
  poursuite: {
    title: ["La poursuite", "Ça tourne mal", "Course contre la montre"],
    situation: ["Quelqu'un a donné l'alerte : ça court, ça démarre, ça tire.", "La cible s'enfuit à travers {city}."],
    approaches: [
      A("Prendre le volant", "pilotage", "ardue", { alert: 15, health: 2 }),
      A("Courir par les toits", "athletisme", "ardue", { health: 2, alert: 5 }),
      A("Couper par les ruelles", "vivacite", "moyenne", { alert: 10 }),
      A("Lui tendre un piège plus loin", "tactique", "ardue", { alert: 5 }),
    ],
  },
  combat: {
    title: ["L'affrontement", "Corps à corps", "Plus le choix"],
    situation: ["Les hommes de {faction} ne te laisseront pas passer.", "Trois gardes, un couloir, et pas de sortie."],
    approaches: [
      A("Neutraliser au corps à corps", "combat", "ardue", { health: 3, alert: 15 }),
      A("Un tir précis, un seul", "precision", "ardue", { alert: 25, health: 2 }),
      A("Désarmer d'un geste", "vivacite", "redoutable", { health: 2, alert: 10 }),
      A("Négocier sous la menace", "sangfroid", "ardue", { health: 2, exposure: 10 }),
      A("Encaisser et tenir", "endurance", "moyenne", { health: 3, alert: 10 }),
    ],
  },
  piratage: {
    title: ["Le réseau", "Le pare-feu", "Dans la machine"],
    situation: ["Les données de {target} sont sur un réseau isolé, surveillé en permanence.", "Une intrusion propre, ou rien."],
    approaches: [
      A("Forcer le pare-feu", "machine", "ardue", { alert: 20 }),
      A("Trouver la faille logique", "logique", "ardue", { alert: 10 }),
      A("Obtenir l'accès par ingénierie sociale", "masque", "moyenne", { exposure: 15 }),
      A("Retrouver un vieux mot de passe dans les archives", "archives", "moyenne", { alert: 5 }),
    ],
  },
  complication: {
    title: ["Imprévu", "Le grain de sable", "Ça se complique"],
    situation: [
      "Un garde te dévisage : il t'a déjà vu quelque part.",
      "La cible change ses plans au dernier moment.",
      "Un agent d'une agence rivale est sur la même affaire, et il t'a repéré.",
      "Ton contact local ne répond plus.",
    ],
    approaches: [
      A("Garder ton calme et continuer", "sangfroid", "moyenne", { exposure: 15 }),
      A("Improviser une sortie", "instinct", "moyenne", { alert: 15 }),
      A("Trouver une explication crédible", "eloquence", "moyenne", { exposure: 20 }),
      A("Le faire taire, discrètement", "combat", "ardue", { alert: 20, health: 1 }),
    ],
  },
  secondaire: {
    title: ["Objectif secondaire", "Une occasion à saisir", "Le bonus"],
    situation: [
      "Le bureau de {target} est vide pour quelques minutes. Personne ne t'a demandé d'y entrer.",
      "Un serveur de {faction} tourne sans surveillance dans la pièce d'à côté.",
      "Un lieutenant de {target} a laissé son téléphone sur la table.",
    ],
    approaches: [
      A("Poser un micro dans le bureau", "doigte", "ardue", { alert: 15, exposure: 10 }),
      A("Photographier les documents d'un regard", "regard", "moyenne", { exposure: 15 }),
      A("Copier le disque en vitesse", "machine", "ardue", { alert: 20 }),
      A("Cloner le téléphone", "machine", "moyenne", { exposure: 10, alert: 10 }),
    ],
  },
  extraction: {
    title: ["L'extraction", "Sortir vivant", "Le point de récupération"],
    situation: ["C'est fait, ou presque : il faut maintenant quitter {city}.", "Les routes se ferment. Le point de récupération est à quatre kilomètres."],
    approaches: [
      A("Disparaître discrètement", "ombre", "moyenne", { alert: 15 }),
      A("Fuir en véhicule", "pilotage", "ardue", { health: 2, alert: 10 }),
      A("Sortir sous une autre identité", "masque", "moyenne", { exposure: 20 }),
      A("Tenir jusqu'au point de récupération", "endurance", "moyenne", { health: 2 }),
    ],
  },
};

/** Compétences utiles par type d'étape (pour proposer l'équipier le plus adapté). */
const NODE_SKILLS: Record<NodeType, SkillId[]> = Object.fromEntries(
  (Object.keys(NODES) as (keyof typeof NODES)[]).map((k) => [k, [...new Set(NODES[k].approaches.map((a) => a.skill))]]),
) as Record<NodeType, SkillId[]>;
NODE_SKILLS.objectif = ["masque", "eloquence", "machine", "combat", "doigte", "logique"];
NODE_SKILLS.dilemme = [];

/* ------------------------------------------------------------------ */
/* Modèles de mission                                                  */
/* ------------------------------------------------------------------ */

interface Template {
  id: string;
  kind: MissionKind;
  title: string;
  summary: string;
  objective: string;
  /** Étapes d'une mission locale ; les plus importantes en insèrent d'autres au milieu. */
  plan: NodeType[];
  extra: NodeType[];
  key: NodeDef;
  covers: string[];
  /** Compétences clés de la mission (elles orientent le choix de l'équipe). */
  skills: SkillId[];
}

const TEMPLATES: Template[] = [
  {
    id: "exfiltration",
    kind: "standard",
    title: "Exfiltrer un transfuge",
    summary: "{target}, au service de {faction}, veut passer à l'Ouest… enfin, chez nous. Il faut le sortir de {city} vivant.",
    objective: "Ramener {target} vivant, avec ce qu'il sait.",
    plan: ["approche", "social", "objectif", "extraction"],
    extra: ["renseignement", "filature", "complication", "poursuite", "combat"],
    key: {
      title: ["Le rendez-vous"],
      situation: ["{target} est au rendez-vous, terrifié. Il hésite encore, et quelqu'un l'a suivi."],
      approaches: [
        A("Le convaincre de te suivre maintenant", "empathie", "moyenne", { exposure: 15 }),
        A("Le déguiser et le faire passer pour un autre", "masque", "ardue", { exposure: 20 }),
        A("Semer ses suiveurs avant de l'aborder", "ombre", "ardue", { alert: 15 }),
      ],
    },
    covers: ["consultant en assurances", "photographe de mode", "étudiant en échange"],
    skills: ["empathie", "masque", "ombre"],
  },
  {
    id: "prototype",
    kind: "standard",
    title: "Voler un prototype",
    summary: "{faction} a mis au point quelque chose qu'aucune agence ne devrait laisser entre ses mains. Il est à {city}.",
    objective: "Récupérer le prototype (ou ses plans) et le ramener au laboratoire.",
    plan: ["renseignement", "infiltration", "objectif", "extraction"],
    extra: ["effraction", "piratage", "complication", "combat", "poursuite"],
    key: {
      title: ["Le laboratoire"],
      situation: ["Le prototype est là, sous verre, relié à un système qui hurlera au moindre écart."],
      approaches: [
        A("Remplacer le prototype par un leurre", "doigte", "ardue", { alert: 20 }),
        A("Copier les plans sans rien toucher", "machine", "ardue", { alert: 15 }),
        A("Faire sortir le prototype par un employé manipulé", "eloquence", "ardue", { exposure: 20 }),
      ],
    },
    covers: ["technicienne de maintenance", "auditeur de sécurité", "chercheur invité"],
    skills: ["machine", "doigte", "ombre"],
  },
  {
    id: "sabotage",
    kind: "standard",
    title: "Saboter une installation",
    summary: "À {city}, {faction} prépare une installation qui changera le rapport de force. Elle ne doit jamais fonctionner.",
    objective: "Mettre l'installation hors service sans victimes civiles, et sans signature.",
    plan: ["approche", "infiltration", "objectif", "extraction"],
    extra: ["renseignement", "piratage", "effraction", "complication", "combat"],
    key: {
      title: ["Le cœur de l'installation"],
      situation: ["Les turbines, les serveurs ou les centrifugeuses tournent. Tu as quelques minutes."],
      approaches: [
        A("Saboter le système de contrôle", "machine", "ardue", { alert: 20 }),
        A("Placer une charge discrète au bon endroit", "precision", "ardue", { alert: 25, health: 1 }),
        A("Provoquer une panne qui passera pour un accident", "logique", "redoutable", { alert: 10 }),
      ],
    },
    covers: ["ingénieur d'une société sous-traitante", "inspectrice des normes", "livreur"],
    skills: ["machine", "precision", "ombre"],
  },
  {
    id: "gala",
    kind: "standard",
    title: "Démasquer au gala",
    summary: "{target} sera au gala de {city}, une vente aux enchères où l'on achète tout, y compris des secrets d'État.",
    objective: "Prouver ce que {target} vend, et à qui, sans qu'il le sache.",
    plan: ["approche", "social", "objectif", "extraction"],
    extra: ["renseignement", "social", "filature", "complication", "piratage"],
    key: {
      title: ["La salle des ventes"],
      situation: ["Le lot mystère arrive. {target} lève discrètement la main."],
      approaches: [
        A("Photographier l'acheteur et le contrat", "regard", "ardue", { exposure: 15 }),
        A("Faire monter les enchères pour démasquer l'acheteur", "sangfroid", "ardue", { exposure: 20 }, { cost: 4000 }),
        A("Subtiliser le carnet de {target}", "doigte", "ardue", { alert: 15 }),
      ],
    },
    covers: ["héritière d'une fortune discrète", "courtier en œuvres d'art", "secrétaire d'un collectionneur"],
    skills: ["tenue", "eloquence", "masque"],
  },
  {
    id: "reseau",
    kind: "standard",
    title: "Démanteler un réseau",
    summary: "Un réseau de {faction} opère depuis {city}. Il faut remonter jusqu'à sa tête : {target}.",
    objective: "Identifier et neutraliser {target}, et livrer le réseau aux autorités locales.",
    plan: ["renseignement", "filature", "objectif", "extraction"],
    extra: ["social", "infiltration", "complication", "combat", "poursuite"],
    key: {
      title: ["La tête du réseau"],
      situation: ["{target} est enfin à portée, entouré de ses lieutenants."],
      approaches: [
        A("Le piéger avec une fausse livraison", "tactique", "ardue", { exposure: 15 }),
        A("Le retourner contre ses commanditaires", "eloquence", "redoutable", { exposure: 20 }),
        A("Le neutraliser au moment où il est seul", "combat", "ardue", { alert: 20, health: 2 }),
      ],
    },
    covers: ["journaliste free-lance", "acheteur intéressé", "nouvelle recrue du réseau"],
    skills: ["regard", "logique", "tactique"],
  },
  {
    id: "assassinat",
    kind: "standard",
    title: "Empêcher un assassinat",
    summary: "{faction} veut éliminer une personnalité à {city} dans les jours qui viennent. On ne sait ni où ni comment.",
    objective: "Empêcher l'attentat et identifier le tueur.",
    plan: ["renseignement", "filature", "objectif", "extraction"],
    extra: ["complication", "social", "poursuite", "combat", "renseignement"],
    key: {
      title: ["L'instant"],
      situation: ["Le tueur est en position. Tu as une seconde d'avance, peut-être deux."],
      approaches: [
        A("Repérer le tireur à temps", "alerte", "ardue", { alert: 15 }),
        A("Mettre la cible à l'abri sans paniquer la foule", "sangfroid", "ardue", { exposure: 15 }),
        A("Désarmer le tueur", "vivacite", "redoutable", { health: 3, alert: 15 }),
      ],
    },
    covers: ["garde du corps privé", "serveur de l'événement", "photographe accrédité"],
    skills: ["alerte", "regard", "combat"],
  },
  {
    id: "arme",
    kind: "standard",
    title: "Récupérer une arme",
    summary: "Une arme qui n'aurait jamais dû quitter son dépôt a été vendue à {faction}. Elle transite par {city}.",
    objective: "Récupérer ou neutraliser l'arme avant sa livraison.",
    plan: ["renseignement", "approche", "objectif", "extraction"],
    extra: ["infiltration", "combat", "complication", "poursuite", "piratage"],
    key: {
      title: ["La cargaison"],
      situation: ["La caisse est là. Un détonateur, un minuteur, ou rien du tout : impossible à dire sans l'ouvrir."],
      approaches: [
        A("Désamorcer sur place", "machine", "redoutable", { health: 3, alert: 10 }),
        A("Détourner toute la cargaison", "pilotage", "ardue", { alert: 25 }),
        A("Identifier le mécanisme avant de toucher à quoi que ce soit", "logique", "ardue", { alert: 10 }),
      ],
    },
    covers: ["transitaire maritime", "inspecteur des douanes", "agent d'assurance cargo"],
    skills: ["machine", "combat", "pilotage"],
  },
  {
    id: "otage",
    kind: "standard",
    title: "Libérer un otage",
    summary: "{faction} retient un ressortissant d'un pays membre à {city}. Les négociations officielles ont échoué.",
    objective: "Libérer l'otage vivant.",
    plan: ["renseignement", "infiltration", "objectif", "extraction"],
    extra: ["approche", "combat", "complication", "poursuite", "filature"],
    key: {
      title: ["La pièce où il est retenu"],
      situation: ["L'otage est là, attaché. Deux gardes, un troisième dans le couloir."],
      approaches: [
        A("Neutraliser les gardes en silence", "combat", "ardue", { health: 2, alert: 20 }),
        A("Faire diversion pour vider la pièce", "tactique", "ardue", { alert: 15 }),
        A("Négocier sa libération en te faisant passer pour un émissaire", "masque", "redoutable", { exposure: 25 }),
      ],
    },
    covers: ["négociateur d'une ONG", "médecin humanitaire", "chauffeur"],
    skills: ["combat", "tactique", "ombre"],
  },
  {
    id: "cyber",
    kind: "standard",
    title: "Remonter une cyberattaque",
    summary: "Une cyberattaque a frappé un pays membre. La trace mène à {city}, et à {faction}.",
    objective: "Localiser les serveurs, identifier l'équipe, couper l'attaque à la source.",
    plan: ["piratage", "renseignement", "objectif", "extraction"],
    extra: ["filature", "infiltration", "complication", "effraction", "social"],
    key: {
      title: ["La salle des serveurs"],
      situation: ["Les machines tournent dans une salle climatisée ; l'équipe de {target} dort à côté."],
      approaches: [
        A("Retourner leur propre virus contre eux", "machine", "redoutable", { alert: 15 }),
        A("Copier les disques et saboter le reste", "doigte", "ardue", { alert: 20 }),
        A("Faire parler le hacker principal", "eloquence", "ardue", { exposure: 15 }),
      ],
    },
    covers: ["consultante en cybersécurité", "étudiant en informatique", "technicien de fibre"],
    skills: ["machine", "logique", "archives"],
  },
  // Opérations Jeunesse : là où seul un adolescent passe inaperçu.
  {
    id: "jeune_lycee",
    kind: "jeunesse",
    title: "Le nouveau du lycée international",
    summary: "L'enfant de {target} étudie dans un lycée international de {city}. Un ado peut s'en faire un ami ; un adulte, jamais.",
    objective: "Devenir proche de l'enfant de {target} et rapporter ce qui se dit à la maison, sans jamais être soupçonné.",
    plan: ["social", "renseignement", "objectif", "extraction"],
    extra: ["complication", "social"],
    key: {
      title: ["L'invitation à la maison"],
      situation: ["L'enfant de {target} t'invite chez lui. Le bureau de son parent est au bout du couloir."],
      approaches: [
        A("Rester naturel et écouter", "empathie", "moyenne", { exposure: 10 }, { intel: 1 }),
        A("Te glisser dans le bureau pendant cinq minutes", "ombre", "ardue", { alert: 15 }),
        A("Photographier les documents d'un regard", "regard", "moyenne", { exposure: 15 }),
      ],
    },
    covers: ["élève transféré en cours d'année", "fils ou fille d'un diplomate muté"],
    skills: ["empathie", "masque", "eloquence"],
  },
  {
    id: "jeune_camp",
    kind: "jeunesse",
    title: "Un camp d'été trop parfait",
    summary: "Un camp d'été financé par {faction} recrute des adolescents brillants près de {city}. Personne n'en ressort pareil.",
    objective: "Y entrer comme participant, comprendre ce qu'on y fait aux jeunes, et en ressortir avec des preuves.",
    plan: ["social", "filature", "objectif", "extraction"],
    extra: ["complication", "renseignement"],
    key: {
      title: ["La séance du soir"],
      situation: ["Les participants les plus doués sont emmenés à part, la nuit. Tu fais partie des élus."],
      approaches: [
        A("Jouer le jeu sans te laisser prendre", "sangfroid", "ardue", { exposure: 15 }),
        A("Enregistrer la séance", "doigte", "moyenne", { alert: 15 }),
        A("Faire parler un animateur", "eloquence", "moyenne", { exposure: 15 }),
      ],
    },
    covers: ["lauréat d'un concours de sciences", "jeune sportif prometteur"],
    skills: ["sangfroid", "eloquence", "masque"],
  },
  {
    id: "jeune_tournoi",
    kind: "jeunesse",
    title: "Le tournoi d'e-sport",
    summary: "{faction} recrute ses pirates parmi les finalistes d'un tournoi de jeux vidéo à {city}.",
    objective: "Te faire repérer comme joueur prometteur, et remonter jusqu'au recruteur.",
    plan: ["piratage", "social", "objectif", "extraction"],
    extra: ["complication", "filature"],
    key: {
      title: ["Le message privé"],
      situation: ["Après ta demi-finale, un inconnu te propose « un vrai défi ». Il veut te rencontrer."],
      approaches: [
        A("Accepter et jouer le prodige naïf", "masque", "moyenne", { exposure: 15 }),
        A("Tracer son compte avant le rendez-vous", "machine", "ardue", { alert: 10 }, { intel: 1 }),
        A("L'amener à se dévoiler en ligne", "logique", "moyenne", { exposure: 10 }),
      ],
    },
    covers: ["joueur classé dans le top 50 national", "streameuse débutante"],
    skills: ["machine", "vivacite", "masque"],
  },
  // Contre-espionnage contre une agence rivale.
  {
    id: "taupe",
    kind: "contre_espionnage",
    title: "Débusquer un agent de {other}",
    summary: "Un agent de {other} opère à {city} contre les intérêts de {agency}. Les Règles de Lucerne interdisent de le tuer ; rien n'interdit de le ridiculiser.",
    objective: "Identifier l'agent de {other} et le faire expulser, sans incident diplomatique.",
    plan: ["renseignement", "filature", "objectif", "extraction"],
    extra: ["social", "complication", "piratage", "poursuite"],
    key: {
      title: ["Face à face"],
      situation: ["L'agent de {other} sait qu'il est démasqué. Il te propose un marché."],
      approaches: [
        A("Le confronter avec les preuves", "logique", "ardue", { exposure: 10 }),
        A("Le retourner : qu'il travaille pour toi", "eloquence", "redoutable", { exposure: 20 }, { intel: 2 }),
        A("Le faire arrêter par la police locale", "tactique", "moyenne", { alert: 15 }),
      ],
    },
    covers: ["attaché commercial", "chercheuse en thèse"],
    skills: ["logique", "regard", "eloquence"],
  },
];

export const findTemplate = (id: string) => TEMPLATES.find((x) => x.id === id);

/* ------------------------------------------------------------------ */
/* Dilemmes                                                            */
/* ------------------------------------------------------------------ */

interface DilemmaTpl {
  title: string;
  situation: string;
  options: { label: string; effect: DilemmaEffect }[];
  /** Ne s'applique que si une autre agence est impliquée. */
  needsOther?: boolean;
}

const DILEMMAS: DilemmaTpl[] = [
  {
    title: "Un civil dans la ligne de mire",
    situation: "Une passante, un serveur, un enfant : quelqu'un d'innocent se trouve au mauvais endroit. Le protéger coûte du temps.",
    options: [
      { label: "Le protéger, quitte à perdre du temps", effect: { alert: 20, team: 5, morale: 1 } },
      { label: "Continuer : la mission d'abord", effect: { morale: -2, team: -5, rulebreak: true } },
      { label: "Confier sa protection à un équipier", effect: { alert: 10, team: -3 } },
    ],
  },
  {
    title: "L'offre de la cible",
    situation: "{target} te propose une fortune pour que tu le laisses filer. Personne n'en saurait rien.",
    options: [
      { label: "Refuser sèchement", effect: { team: 3 } },
      { label: "Faire semblant d'accepter pour gagner du temps", effect: { intel: 1, exposure: 10 } },
      { label: "Accepter", effect: { compromise: true, rulebreak: true, morale: -2 } },
    ],
  },
  {
    title: "L'équipier blessé",
    situation: "Un équipier est touché. Le porter ralentit tout le monde ; le laisser, c'est le livrer à {faction}.",
    options: [
      { label: "Le porter, coûte que coûte", effect: { alert: 15, team: 10, morale: 1 } },
      { label: "Le cacher et revenir le chercher", effect: { exposure: 10, team: 2 } },
      { label: "Le laisser : la mission d'abord", effect: { team: -25, morale: -3 } },
    ],
  },
  {
    title: "Un agent de {other} sur l'affaire",
    situation: "Un agent de {other} travaille sur la même cible. Il te propose d'échanger ce que vous savez.",
    options: [
      { label: "Accepter l'échange", effect: { intel: 2, diplomacy: 6 } },
      { label: "Refuser poliment", effect: { diplomacy: -2 } },
      { label: "Le piéger et lui voler ses informations", effect: { intel: 2, diplomacy: -15, rulebreak: true } },
    ],
    needsOther: true,
  },
  {
    title: "Les ordres changent",
    situation: "Le QG ordonne d'abandonner l'objectif principal pour une cible plus urgente. Tu n'as pas tous les éléments.",
    options: [
      { label: "Obéir", effect: { compromise: true, merit: 1 } },
      { label: "Désobéir et finir le travail", effect: { merit: -1, alert: 10, team: 3 } },
      { label: "Demander confirmation, et perdre de précieuses minutes", effect: { alert: 15 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Génération                                                          */
/* ------------------------------------------------------------------ */

const OP_NAMES: Record<AgencyId, string[]> = {
  argos: ["Labyrinthe", "Ambroisie", "Chimère", "Hydre", "Toison d'or", "Sirène", "Égide", "Minotaure", "Achéron", "Pégase", "Carybde", "Styx", "Olympie", "Méandre", "Dédale", "Charon"],
  meridian: ["Nightfall", "Iron Comet", "Blue Horizon", "Dead Reckoning", "Black Meridian", "Silent Orbit", "Red Giant", "Event Horizon", "Northern Light", "Deep Sky", "Solar Wind", "Long Night"],
  monsoon: ["Marée basse", "Mangrove", "Typhon blanc", "Corail noir", "Mousson sèche", "Vent d'Est", "Lame de fond", "Brume de mer", "Pluie d'été", "Grand Courant", "Œil du cyclone", "Récif"],
};

/** Les officiers reçoivent les affaires locales ; le Cercle, les grandes. */
const IMPORTANCE_WEIGHTS: Record<string, Record<MissionImportance, number>> = {
  officier: { locale: 55, regionale: 40, continentale: 5, mondiale: 0 },
  station: { locale: 35, regionale: 50, continentale: 15, mondiale: 0 },
  cercle: { locale: 0, regionale: 25, continentale: 50, mondiale: 25 },
  senior: { locale: 0, regionale: 15, continentale: 50, mondiale: 35 },
};


const NODE_COUNT: Record<MissionImportance, number> = { locale: 4, regionale: 6, continentale: 8, mondiale: 10 };

export const OFFER_COUNT = (rank: RankId) => (RANKS[rank].order <= RANKS.agent.order ? 1 : RANKS[rank].order === 3 ? 2 : 3);

/** Les officiers et les cadets reçoivent leurs missions ; à partir d'un siège ou d'une Station, on choisit. */
export const offersAreAssigned = (rank: RankId) => !can(rank, "choose_missions");

function rankBand(rank: RankId) {
  if (rank === "titulaire" || rank === "doyen") return "cercle";
  if (rank === "chef_station") return "station";
  if (rank === "controleur" || rank === "directeur") return "senior";
  return "officier";
}

export function makeOffer(state: GameState, rng: Rng = Math.random, kindHint?: MissionKind): MissionOffer {
  const c = state.character;
  const agency = c.identity.agency;
  const geo = state.world.geo;
  const youth = c.rank === "aspirant" || kindHint === "jeunesse";

  let kind: MissionKind = youth ? "jeunesse" : "standard";
  let other: AgencyId | undefined;
  if (!youth) {
    const others = (["argos", "meridian", "monsoon"] as AgencyId[]).filter((a) => a !== agency);
    const rival = others.find((o) => diplomacyBetween(geo.diplomacy, agency, o) <= -10);
    const ally = others.find((o) => diplomacyBetween(geo.diplomacy, agency, o) >= 35);
    if (rival && chance(0.2, rng)) {
      kind = "contre_espionnage";
      other = rival;
    } else if (ally && chance(0.15, rng)) {
      kind = "conjointe";
      other = ally;
    }
  }

  // Les missions naissent des menaces identifiées : les plus avancées d'abord, l'opération décisive pour le Cercle.
  const taken = new Set(state.offers.map((o) => o.threat).filter(Boolean));
  const candidates =
    youth || kind === "contre_espionnage"
      ? []
      : geo.threats.filter(
          (t) =>
            t.known &&
            !taken.has(t.id) &&
            (!t.capstone || RANKS[c.rank].order >= 3) &&
            (t.capstone || findTemplate(t.template)) &&
            // Un officier reste dans les zones de son agence ; le Cercle va partout.
            (RANKS[c.rank].order >= 3 || (INTERESTS[agency][t.region as RegionId] ?? 0) >= 2 || (c.station && cityRegion(c.station) === t.region)),
        );
  const threat = candidates.length && chance(0.8, rng) ? pickWeighted(candidates, (t) => t.progress + 20 + (t.capstone ? 300 : 0), rng) : undefined;

  // Région : la menace, ou tension × intérêts de l'agence (les cadets restent près des pays membres).
  const region: RegionId = threat
    ? (threat.region as RegionId)
    : youth
      ? pick((Object.keys(INTERESTS[agency]) as RegionId[]).filter((r) => (INTERESTS[agency][r] ?? 0) >= 2.5), rng)
      : pickWeighted(
          Object.keys(REGIONS) as RegionId[],
          (r) => ((geo.tensions[r] ?? 50) ** 1.5) * (INTERESTS[agency][r] ?? (RANKS[c.rank].order >= 3 ? 0.4 : 0)) * (c.station && cityRegion(c.station) === r ? 3 : 1),
          rng,
        );
  const cities = citiesOfRegion(region);
  const city = (threat && findCity(threat.cityId)) || (cities.length ? pick(cities, rng) : pick(CITIES.filter((x) => !x.tags?.includes("secret")), rng));
  const factions = factionsOfRegion(region);
  const faction = (threat && findFaction(threat.faction)) || (factions.length ? pick(factions, rng) : findFaction("ouroboros")!);

  const pool = TEMPLATES.filter((tp) => (kind === "jeunesse" ? tp.kind === "jeunesse" : kind === "contre_espionnage" ? tp.kind === "contre_espionnage" : tp.kind === "standard"));
  const tpl = (threat && findTemplate(threat.template)) || pick(pool, rng);
  const importance: MissionImportance = youth
    ? "locale"
    : threat?.capstone
      ? "mondiale"
      : kind === "contre_espionnage"
        ? "regionale"
        : pickWeighted(["locale", "regionale", "continentale", "mondiale"] as MissionImportance[], (i) => IMPORTANCE_WEIGHTS[rankBand(c.rank)][i], rng);

  // Un ennemi nommé de cette faction reprend du service.
  const nemesis =
    (threat?.nemesis && geo.nemeses.find((n) => n.id === threat.nemesis && n.status === "libre")) ||
    (!youth && chance(0.4, rng) ? geo.nemeses.find((n) => n.status === "libre" && (kind === "contre_espionnage" ? n.agency === other : n.faction === faction.id)) : undefined);
  const target = nemesis
    ? `${nemesis.name}, ${nemesis.title}`
    : kind === "contre_espionnage"
      ? `un agent de ${AGENCIES[other!].name}`
      : threat?.capstone
        ? `la tête de ${faction.name}`
        : pick(faction.figures, rng);
  const ctx: Ctx = {
    city: city.name,
    country: findCountry(city.country)?.name ?? "",
    target,
    faction: faction.name,
    cover: "",
    other: other ? AGENCIES[other].name : "",
    agency: AGENCIES[agency].name,
  };
  const name = `Opération ${pick(OP_NAMES[agency], rng)}`;
  const comeback = nemesis ? ` ${nemesis.name} est de retour : ${nemesis.history}` : "";
  return {
    id: uid(rng),
    kind,
    importance,
    template: tpl.id,
    title: `${name} — ${threat?.capstone ? `La tête de ${faction.name}` : t(tpl.title, ctx)}`,
    summary:
      (threat?.capstone
        ? `Le dossier sur ${faction.name} est complet : on sait enfin qui la dirige, et où la trouver. C'est l'occasion d'une génération.`
        : t(tpl.summary, ctx)) +
      comeback +
      (kind === "conjointe" ? ` Opération conjointe avec ${ctx.other} : un de leurs agents sera de l'équipe.` : "") +
      (threat ? ` (Menace identifiée : ${threat.title}, avancement ${threat.progress}/100.)` : ""),
    region,
    cityId: city.id,
    faction: faction.id,
    target,
    objective: threat?.capstone ? `Neutraliser la tête de ${faction.name} et démanteler son état-major.` : t(tpl.objective, ctx),
    other,
    threat: threat?.id,
    nemesis: nemesis?.id,
    assigned: offersAreAssigned(c.rank),
    expiresDay: state.world.day + (offersAreAssigned(c.rank) ? 14 : 21),
  };
}

/** Équipe proposée par la hiérarchie (pour un Agent, elle est imposée). */
export function suggestedTeam(state: GameState, offer: MissionOffer, _rng?: Rng): string[] {
  const c = state.character;
  const day = state.world.day;
  // Déterministe : la même offre propose toujours la même équipe (affichage et départ concordent).
  let h = [...offer.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tpl = findTemplate(offer.template);
  const pool = teamPool(state);
  const scored = pool
    .map((o) => ({ o, score: (tpl ? bestSkill(o, tpl.skills).value : 4) + rng() * 2 + (state.command.squad.includes(o.id) ? 5 : 0) }))
    .sort((a, b) => b.score - a.score);
  const size = offer.kind === "jeunesse" ? 1 : maxTeam(c.rank);
  return scored.slice(0, size).map((x) => x.o.id);
}

/** Taille de l'équipe : soutiens pour un officier, seconds pour un Doyen, effectifs pour le commandement. */
/** Ceux qui peuvent partir avec le joueur : le personnel de soutien et les officiers (les seconds d'un Doyen d'abord). */
export function teamPool(state: GameState): Operative[] {
  const c = state.character;
  return state.roster.filter((o) => o.agency === c.identity.agency && isAvailable(o, state.world.day) && (o.role === "soutien" || o.role === "officier"));
}

export function maxTeam(rank: RankId): number {
  return ({ prospect: 0, aspirant: 1, agent: 1, titulaire: 2, chef_station: 2, doyen: 3, controleur: 3, directeur: 4 } as Record<RankId, number>)[rank];
}

export function maxGadgets(state: GameState): number {
  const o = RANKS[state.character.rank].order;
  return 2 + (o >= 3 ? 1 : 0) + (o >= 4 ? 1 : 0) + (state.command.labFavor ?? 0) + (state.command.station?.modules.includes("atelier") ? 1 : 0);
}

/** Gadgets que le joueur peut réquisitionner. */
export function availableGadgets(state: GameState) {
  const order = RANKS[state.character.rank].order;
  return GADGETS.filter((g) => RANKS[g.minRank].order <= order && (g.tier < 3 || state.command.unlocked.includes(g.id)));
}

/** Budget de réquisition pour une mission : les fonds d'opération du grade (un cadet a un petit budget). */
export function requisitionBudget(state: GameState): number {
  return Math.max(3000, RANKS[state.character.rank].fundsCap);
}

/* ------------------------------------------------------------------ */
/* Dotation : les moyens qu'on t'accorde pour une mission              */
/* ------------------------------------------------------------------ */

export interface AllowanceLine {
  label: string;
  detail: string;
  tone: "base" | "plus" | "minus";
}

export interface Allowance {
  /** Budget de réquisition (gadgets du laboratoire). */
  budget: number;
  /** Fonds d'opération confiés pour la mission. */
  funds: number;
  gadgetSlots: number;
  teamSize: number;
  /** Renseignement de départ. */
  intel: number;
  /** Confiance de la hiérarchie (×0,6 à ×1,35) : elle dépend de ta réputation, de ton mérite et de tes blâmes. */
  trust: number;
  lines: AllowanceLine[];
}

const IMPORTANCE_MEANS: Record<MissionImportance, number> = { locale: 0.6, regionale: 1, continentale: 1.6, mondiale: 2.5 };

/**
 * Ce que l'agence t'accorde pour cette mission : selon ton grade, la confiance qu'on te fait (ton potentiel),
 * ton rôle (ton siège, ta Station), l'importance de l'affaire et la satisfaction des gouvernements.
 */
export function missionAllowance(state: GameState, offer: MissionOffer): Allowance {
  const c = state.character;
  const rank = RANKS[c.rank];
  const lines: AllowanceLine[] = [];
  const youth = offer.kind === "jeunesse";
  const funding = fundingFactor(state.world.geo, c.identity.agency);

  // Le grade fixe la base.
  let budget = requisitionBudget(state);
  let funds = Math.max(1000, rank.fundsCap);
  let slots = maxGadgets(state);
  let team = youth ? 1 : maxTeam(c.rank);
  lines.push({ label: `Grade : ${rank.label}`, detail: `${formatEuros(budget)} de réquisition, ${slots} emplacement${slots > 1 ? "s" : ""}, ${team} équipier${team > 1 ? "s" : ""}`, tone: "base" });

  // Le potentiel : ce que la hiérarchie pense de toi.
  const trust = Math.max(0.6, Math.min(1.35, 0.8 + c.reputation / 250 + Math.min(0.15, c.merit / 100) - c.blames * 0.1));
  if (Math.abs(trust - 1) >= 0.05)
    lines.push({
      label: trust > 1 ? "La hiérarchie croit en toi" : "La hiérarchie se méfie",
      detail: `moyens ×${trust.toFixed(2)} (réputation ${c.reputation}, mérite ${formatMerit(c.merit)}${c.blames ? `, ${c.blames} blâme${c.blames > 1 ? "s" : ""}` : ""})`,
      tone: trust > 1 ? "plus" : "minus",
    });

  // L'importance de l'affaire.
  const weight = youth ? 0.5 : IMPORTANCE_MEANS[offer.importance];
  if (weight !== 1) lines.push({ label: `Mission ${youth ? "Jeunesse" : MISSION_IMPORTANCE[offer.importance].label.toLowerCase()}`, detail: `moyens ×${weight}`, tone: weight > 1 ? "plus" : "minus" });
  if (!youth && (offer.importance === "continentale" || offer.importance === "mondiale")) {
    team += 1;
    lines.push({ label: "Affaire d'envergure", detail: "un équipier de plus", tone: "plus" });
  }
  if (offer.importance === "mondiale") {
    slots += 1;
    lines.push({ label: "Priorité absolue", detail: "un emplacement de gadget de plus", tone: "plus" });
  }

  // Le rôle : ton siège, ta Station.
  const tpl = findTemplate(offer.template);
  const seat = findSeat(c.identity.agency, c.seat);
  if (seat && tpl && tpl.skills.some((k) => seat.specialty.includes(k))) {
    slots += 1;
    lines.push({ label: `Mission de ton siège (${seat.name})`, detail: "un emplacement de plus : on te fait confiance sur ton terrain", tone: "plus" });
  }
  let intel = (state.command.intelStock ?? 0);
  if (state.command.intelStock) lines.push({ label: "Préparation (Branches, rivaux)", detail: `+${state.command.intelStock} renseignement`, tone: "plus" });
  const stationRegion = findCountry(findCity(c.station ?? state.command.station?.cityId ?? "")?.country ?? "")?.region;
  if (stationRegion && stationRegion === offer.region) {
    funds = Math.round(funds * 1.2);
    intel += 1;
    lines.push({ label: "Terrain de ta Station", detail: "+1 renseignement, fonds +20 % (planques, voitures, contacts locaux)", tone: "plus" });
  }
  const assets = state.command.assets.filter((a) => a.status === "actif" && findCountry(findCity(a.cityId)?.country ?? "")?.region === offer.region).length;
  if (assets) {
    intel += Math.min(2, assets);
    lines.push({ label: "Tes informateurs sur place", detail: `+${Math.min(2, assets)} renseignement`, tone: "plus" });
  }
  if (stationHelps(state, offer.region, "ecoutes")) {
    intel += 1;
    lines.push({ label: "Salle des écoutes", detail: "+1 renseignement", tone: "plus" });
  }
  if (state.knowledge?.recon?.[offer.id]) {
    intel += 1;
    lines.push({ label: "Repérages", detail: "+1 renseignement, étapes connues", tone: "plus" });
  }
  const studied = (offer.threat && state.knowledge?.threats?.[offer.threat]) || 0;
  if (studied) {
    intel += studied;
    lines.push({ label: "Menace étudiée", detail: `+${studied} renseignement`, tone: "plus" });
  }
  if (offer.kind === "conjointe" && offer.other) {
    budget = Math.round(budget * 1.25);
    lines.push({ label: `Opération conjointe avec ${AGENCIES[offer.other].name}`, detail: "réquisition +25 % (frais partagés)", tone: "plus" });
  }
  if (offer.kind === "contre_espionnage") {
    funds = Math.round(funds * 0.8);
    lines.push({ label: "Contre-espionnage", detail: "fonds −20 % : rien ne doit laisser de trace", tone: "minus" });
  }

  // Les gouvernements paient.
  if (Math.abs(funding - 1) >= 0.03) lines.push({ label: "Satisfaction des gouvernements", detail: `moyens ×${funding.toFixed(2)}`, tone: funding > 1 ? "plus" : "minus" });
  const factor = trust * weight * funding;
  return {
    budget: Math.round((budget * factor) / 100) * 100,
    funds: Math.round((funds * factor) / 100) * 100,
    gadgetSlots: slots,
    teamSize: team,
    intel: Math.min(6, intel),
    trust,
    lines,
  };
}

function shiftDifficulty(d: Difficulty, steps: number): Difficulty {
  const i = DIFFICULTY_IDS.indexOf(d);
  return DIFFICULTY_IDS[Math.max(0, Math.min(DIFFICULTY_IDS.length - 1, i + steps))];
}

const IMPORTANCE_SHIFT: Record<MissionImportance, number> = { locale: 0, regionale: 0, continentale: 1, mondiale: 1 };

function buildApproaches(tpls: ApproachTpl[], count: number, shift: number, ctx: Ctx, rng: Rng): Approach[] {
  return shuffle(tpls, rng)
    .slice(0, count)
    .map((a) => ({
      id: uid(rng),
      label: t(a.label, ctx),
      kind: "competence" as const,
      skill: a.skill,
      difficulty: shiftDifficulty(a.difficulty, shift),
      risk: { exposure: a.risk.exposure ?? 0, alert: a.risk.alert ?? 0, health: a.risk.health ?? 0 },
      intel: a.intel,
      cost: a.cost,
    }));
}

function buildNode(type: NodeType, def: NodeDef, shift: number, ctx: Ctx, rng: Rng, key = false): MissionNode {
  return {
    type,
    title: t(pick(def.title, rng), ctx),
    situation: t(pick(def.situation, rng), ctx),
    approaches: buildApproaches(def.approaches, key ? def.approaches.length : 3, shift + (key ? 0 : 0), ctx, rng),
    status: "a_venir",
    attempts: 0,
    key,
  };
}

function buildDilemma(ctx: Ctx, hasOther: boolean, rng: Rng): MissionNode {
  const d = pick(
    DILEMMAS.filter((x) => !x.needsOther || hasOther),
    rng,
  );
  return {
    type: "dilemme",
    title: t(d.title, ctx),
    situation: t(d.situation, ctx),
    approaches: d.options.map((o) => ({ id: uid(rng), label: t(o.label, ctx), kind: "choix" as const, risk: { exposure: 0, alert: 0, health: 0 }, effect: o.effect })),
    status: "a_venir",
    attempts: 0,
  };
}

/** Le contexte d'écriture d'une mission (ville, cible, faction, couverture). */
function offerCtx(state: GameState, offer: MissionOffer, rng: Rng, cover?: string): Ctx {
  const tpl = findTemplate(offer.template)!;
  const city = findCity(offer.cityId)!;
  return {
    city: city.name,
    country: findCountry(city.country)?.name ?? "",
    target: offer.target,
    faction: findFaction(offer.faction)?.name ?? "l'ennemi",
    cover: cover ?? pick(tpl.covers, rng),
    other: offer.other ? AGENCIES[offer.other].name : "",
    agency: AGENCIES[state.character.identity.agency].name,
  };
}

/** Repérages : les étapes réelles d'une mission proposée, établies d'avance (la couverture reste à choisir). */
export function scoutOffer(state: GameState, offerId: string, rng: Rng = Math.random): MissionNode[] | null {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return null;
  return buildNodes(offer, offerCtx(state, offer, rng, "{cover}"), rng);
}

/** Remplace la couverture laissée en suspens par les repérages. */
function withCover(n: MissionNode, cover: string): MissionNode {
  const f = (x: string) => x.replace(/\{cover\}/g, cover);
  return {
    ...n,
    title: f(n.title),
    situation: f(n.situation),
    approaches: n.approaches.map((a) => ({ ...a, label: f(a.label) })),
    ...(n.alt ? { alt: withCover(n.alt, cover) } : {}),
  };
}

/** Une fois partie, une mission n'a plus besoin de ses repérages ni de l'étude de sa menace. */
function forgetOffer(k: GameState["knowledge"], offerId: string, threat?: string): GameState["knowledge"] {
  if (!k) return k;
  const recon = { ...k.recon };
  delete recon[offerId];
  const threats = { ...k.threats };
  if (threat) delete threats[threat];
  return { ...k, recon, threats };
}

function buildNodes(offer: MissionOffer, ctx: Ctx, rng: Rng): MissionNode[] {
  const tpl = findTemplate(offer.template)!;
  const shift = IMPORTANCE_SHIFT[offer.importance] + (offer.kind === "jeunesse" ? -1 : 0);
  const total = offer.kind === "jeunesse" ? 4 : NODE_COUNT[offer.importance];
  const plan = [...tpl.plan];
  // Les étapes supplémentaires s'insèrent avant l'objectif.
  const extras = shuffle(tpl.extra, rng);
  let k = 0;
  while (plan.length < total) {
    const at = plan.indexOf("objectif");
    plan.splice(at, 0, extras[k % extras.length]);
    k++;
  }
  const nodes = plan.map((type) =>
    type === "objectif" ? buildNode("objectif", tpl.key, shift + (offer.importance === "mondiale" ? 1 : 0), ctx, rng, true) : buildNode(type, NODES[type as keyof typeof NODES], shift, ctx, rng),
  );
  // Des itinéraires au choix : certaines étapes ont une autre voie (les toits ou le gala, le port ou la gare).
  nodes.forEach((n, i) => {
    if (n.key || i === nodes.length - 1 || !chance(0.45, rng)) return;
    const alt = shuffle(tpl.extra.filter((x) => x !== n.type && x !== "complication"), rng)[0];
    if (alt) n.alt = buildNode(alt, NODES[alt as keyof typeof NODES], shift, ctx, rng);
  });
  // Des objectifs secondaires facultatifs (mérite, renseignement, pièces de dossier).
  const secondaries = offer.kind === "jeunesse" ? 0 : offer.importance === "locale" ? (chance(0.4, rng) ? 1 : 0) : offer.importance === "regionale" ? 1 : 2;
  for (let i = 0; i < secondaries; i++) {
    const at = Math.max(1, nodes.findIndex((n) => n.key) - i);
    const sec = buildNode("secondaire", NODES.secondaire, shift, ctx, rng);
    sec.approaches.push({ id: "skip", label: "Laisser tomber : ce n'est pas la mission", kind: "choix", risk: { exposure: 0, alert: 0, health: 0 }, effect: {} });
    nodes.splice(at, 0, sec);
  }
  // Les missions importantes posent un dilemme (avant l'objectif).
  const hasOther = Boolean(offer.other) || chance(0.3, rng);
  if (offer.importance === "continentale" || offer.importance === "mondiale" || (offer.importance === "regionale" && chance(0.5, rng))) {
    const at = nodes.findIndex((n) => n.key);
    nodes.splice(Math.max(1, at), 0, buildDilemma({ ...ctx, other: ctx.other || pick(["ARGOS", "MERIDIAN", "MONSOON"].filter((n) => n !== ctx.agency), rng) }, hasOther, rng));
    if (offer.importance === "mondiale") nodes.splice(Math.max(1, Math.floor(at / 2)), 0, buildDilemma(ctx, false, rng));
  }
  nodes[0].status = "en_cours";
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

export interface StartResult {
  state: GameState;
  notices: string[];
}

export function canStartMission(state: GameState): string | null {
  const c = state.character;
  if (state.mission) return "une mission est déjà en cours";
  if (state.character.prison) return "tu es en détention";
  if (state.world.phase !== "base") return "les missions partent de la base (ou de l'Académie)";
  if (state.world.day < state.world.restUntil) return `récupération obligatoire jusqu'au jour ${state.world.restUntil}`;
  if (c.rank === "aspirant") {
    if (c.armband === "blanc") return "il faut le brassard gris pour une Opération Jeunesse";
    return null;
  }
  if (RANKS[c.rank].order < RANKS.agent.order) return "pas de mission avant la fin de la Sélection";
  return null;
}

export function startMission(state: GameState, offerId: string, teamIds: string[], gadgetIds: string[], rng: Rng = Math.random, legendId?: string): StartResult {
  const blocker = canStartMission(state);
  if (blocker) throw new Error(`Mission impossible : ${blocker}.`);
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error("Cette mission n'est plus proposée.");
  const c = state.character;
  const agency = c.identity.agency;
  const day = state.world.day;

  const allowance = missionAllowance(state, offer);
  // Équipe : imposée pour un Agent, choisie au-delà.
  const allowed = allowance.teamSize;
  const team = (offersAreAssigned(c.rank) || offer.kind === "jeunesse" ? suggestedTeam(state, offer, rng) : teamIds)
    .filter((id) => state.roster.some((o) => o.id === id && isAvailable(o, day)))
    .slice(0, allowed);

  // Équipement : réquisition dans la limite du budget et du nombre d'emplacements.
  const catalog = availableGadgets(state);
  const budget = allowance.budget;
  let spent = 0;
  const gadgets = gadgetIds
    .map((id) => catalog.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .slice(0, allowance.gadgetSlots)
    .filter((g) => (spent + g.cost <= budget ? ((spent += g.cost), true) : false));
  const items: Item[] = gadgets.map((g) => ({
    name: g.name,
    description: g.description,
    category: "gadget",
    carried: true,
    bonus: { skill: g.skill, value: g.bonus, condition: "en mission" },
    ...(g.charges ? { charges: g.charges } : {}),
    lab: true,
    gadget: g.id,
  }));

  const city = findCity(offer.cityId)!;
  const ctx = offerCtx(state, offer, rng);

  // Légende : une fausse identité qui n'est pas grillée dans ce pays.
  const legend = legendId ? c.legends.find((l) => l.id === legendId && legendUsableIn(l, city.country)) : undefined;
  if (legend) ctx.cover = `${legend.name}, ${legend.profession} (${legend.nationality})`;

  // Le voyage : durée, coût (pris en charge), décalage horaire et fatigue.
  const journey = trip(state.world.cityId, offer.cityId);
  const travelDays = Math.ceil(journey.hours / 24);

  // Renseignement de départ : préparation, informateurs et antenne de la région.

  // Repérages faits d'avance : les étapes sont celles qu'on a étudiées.
  const scouted = state.knowledge?.recon?.[offer.id];
  const nodes = scouted ? scouted.map((n) => withCover(n, ctx.cover)) : buildNodes(offer, ctx, rng);
  const studied = (offer.threat && state.knowledge?.threats?.[offer.threat]) || 0;
  const country = findCountry(city.country);
  const heat = heatOf(c, city.country);
  // En territoire hostile, il faut entrer clandestinement.
  if (country?.bloc === "hostile" && nodes[0].type === "approche") {
    nodes[0] = { ...nodes[0], title: "Insertion clandestine", situation: `Aucun soutien local : il faut entrer en ${country.name} sans visa, sans filet.`, approaches: nodes[0].approaches.map((a) => ({ ...a, difficulty: a.difficulty ? shiftDifficulty(a.difficulty, 1) : a.difficulty })) };
  }
  // Fiché dans ce pays : on t'attend à l'arrivée, sauf si ta légende tient.
  if (heat >= 60 && (!legend || legend.credibility < 60)) {
    const control = buildNode("complication", NODES.complication, IMPORTANCE_SHIFT[offer.importance], ctx, rng);
    nodes.splice(0, 0, { ...control, title: "Contrôle renforcé", situation: `Ton visage est dans les fichiers des services de ${country?.name}. À l'arrivée, on te regarde de trop près.`, status: "en_cours" });
    nodes[1].status = "a_venir";
  }

  const mission: Mission = {
    id: uid(rng),
    name: offer.title.split(" — ")[0],
    kind: offer.kind,
    importance: offer.importance,
    template: offer.template,
    region: offer.region,
    cityId: offer.cityId,
    faction: offer.faction,
    target: offer.target,
    objective: offer.objective,
    other: offer.other,
    team,
    handler: offer.kind === "jeunesse" ? team[0] : undefined,
    cover: ctx.cover,
    nodes,
    current: 0,
    exposure: 0,
    alert: Math.round(heat / 3),
    intel: allowance.intel,
    startDay: day + travelDays,
    legend: legend?.id,
    offerId: offer.id,
    threat: offer.threat,
    nemesis: offer.nemesis,
    turns: 0,
    resourcesUsed: [],
    history: [],
    stage: "terrain",
  };

  const roster = state.roster.map((o) => (team.includes(o.id) ? { ...o, status: "en_mission" as const, cityId: offer.cityId, positionDay: day } : o));
  const notices = [
    `Mission ouverte : ${mission.name} (${MISSION_IMPORTANCE[offer.importance].label.toLowerCase()}) — ${city.name}`,
    ...(gadgets.length ? [`Réquisition du laboratoire : ${gadgets.map((g) => g.name).join(", ")} (${formatEuros(spent)})`] : []),
    ...(journey.km ? [`Voyage : ${journey.km} km, ${journey.hours} h${journey.jetlag ? `, décalage de ${journey.jetlag} h` : ""} (fatigue +${journey.fatigue})`] : []),
    ...(legend ? [`Légende : ${legend.name}`] : []),
    ...(scouted ? ["Repérages : les étapes sont connues d'avance (+1 renseignement)"] : []),
    ...(studied ? [`Menace étudiée : +${studied} renseignement`] : []),
    ...(heat >= 30 ? [`Tu es ${heatLabel(heat)} dans ce pays : l'alerte part de ${Math.round(heat / 3)}`] : []),
  ];
  return {
    state: {
      ...state,
      mission,
      offers: state.offers.filter((o) => o.id !== offerId),
      roster,
      character: {
        ...c,
        inventory: [...c.inventory, ...items],
        missionFunds: Math.max(0, allowance.funds - spent),
        fatigue: Math.min(100, (c.fatigue ?? 0) + journey.fatigue),
      },
      world: {
        ...state.world,
        day: day + travelDays,
        phase: "mission",
        cityId: offer.cityId,
        location: city.name,
        chapter: mission.name,
      },
      command: { ...state.command, intelStock: 0, labFavor: 0 },
      knowledge: forgetOffer(state.knowledge, offer.id, offer.threat),
      scene: null,
      updatedAt: Date.now(),
    },
    notices,
  };
}

/* ------------------------------------------------------------------ */
/* Étapes                                                              */
/* ------------------------------------------------------------------ */

export const currentNode = (m: Mission): MissionNode | undefined => m.nodes[m.current];

/** Prendre l'autre itinéraire de l'étape en cours (avant d'avoir agi). */
export function chooseRoute(state: GameState): GameState {
  const m = state.mission;
  const node = m && currentNode(m);
  if (!m || !node?.alt || node.attempts > 0) return state;
  const swapped: MissionNode = { ...node.alt, status: "en_cours", alt: { ...node, alt: undefined, status: "a_venir" } };
  return { ...state, mission: { ...m, nodes: m.nodes.map((n, i) => (i === m.current ? swapped : n)) }, updatedAt: Date.now() };
}

/** Les approches jouables à l'étape en cours : celles du modèle, plus gadgets et équipiers. */
export function nodeOptions(state: GameState): Approach[] {
  const m = state.mission;
  const node = m && currentNode(m);
  if (!m || !node || m.stage !== "terrain") return [];
  if (node.type === "dilemme") return node.approaches;
  const options = [...node.approaches];
  // Gadgets emportés qui servent à ce type d'étape.
  for (const item of state.character.inventory) {
    const g = findGadget(item.gadget);
    if (!g || !item.carried || item.charges === 0 || !g.nodes.includes(node.type === "objectif" ? "objectif" : node.type)) continue;
    const base = node.approaches.find((a) => a.skill === g.skill)?.difficulty ?? "ardue";
    options.push({
      id: `gadget:${g.id}`,
      label: `Utiliser ${g.name}`,
      kind: "gadget",
      skill: g.skill,
      difficulty: base,
      risk: { exposure: 5, alert: 5, health: 0 },
      gadget: g.id,
    });
  }
  // L'équipier le plus doué pour cette étape.
  const skills = NODE_SKILLS[node.type].length ? NODE_SKILLS[node.type] : node.approaches.map((a) => a.skill!).filter(Boolean);
  const mates = m.team.map((id) => state.roster.find((o) => o.id === id)).filter((o): o is Operative => Boolean(o) && o!.status === "en_mission");
  for (const o of mates) {
    const best = bestSkill(o, skills);
    const ref = node.approaches.find((a) => a.skill === best.skill) ?? node.approaches[0];
    options.push({
      id: `equipier:${o.id}`,
      label: `Laisser ${o.codename || o.name.split(" ")[0]} s'en charger (${SKILLS[best.skill].label})`,
      kind: "equipier",
      skill: best.skill,
      difficulty: ref?.difficulty ?? "moyenne",
      risk: ref?.risk ?? { exposure: 10, alert: 10, health: 1 },
      operative: o.id,
    });
  }
  return options;
}

/** Bonus d'un équipier qui épaule le joueur sur une compétence (le plus doué de l'équipe). */
export function teamAssist(state: GameState, skill: SkillId): { bonus: number; who?: string } {
  const m = state.mission;
  if (!m) return { bonus: 0 };
  let best: { bonus: number; who?: string } = { bonus: 0 };
  for (const id of m.team) {
    const o = state.roster.find((x) => x.id === id);
    if (!o || o.status !== "en_mission" || o.fatigue >= 80) continue;
    const v = operativeSkill(o, skill) + (OPERATIVE_TRAITS[o.trait]?.assist?.[skill] ?? 0);
    const b = v >= 8 ? 2 : v >= 6 ? 1 : 0;
    if (b > best.bonus) best = { bonus: b, who: o.codename || o.name };
  }
  return best;
}

/** L'antenne du joueur couvre-t-elle cette région, avec ce module ? */
function stationHelps(state: GameState, region: string, module: string): boolean {
  const st = state.command.station;
  return Boolean(st && st.modules.includes(module as never) && findCountry(findCity(st.cityId)?.country ?? "")?.region === region);
}

/** Malus d'alerte : plus l'ennemi est sur ses gardes, plus tout est difficile. */
export const alertPenalty = (alert: number) => (alert >= 85 ? 2 : alert >= 60 ? 1 : 0);

/** Probabilité de réussite affichée au joueur. */
/** Les bonus et malus de la situation : terrain connu, langue, biens personnels. */
export function situationalBonuses(state: GameState, a: Approach): { label: string; value: number }[] {
  const m = state.mission;
  const node = m && currentNode(m);
  if (!m || !node || !a.skill) return [];
  const c = state.character;
  const out: { label: string; value: number }[] = [];
  if (c.station && cityRegion(c.station) === m.region) out.push({ label: "Terrain connu", value: 1 });
  if (LANGUAGE_NODES.includes(node.type)) {
    const lang = languageBonus(c, findCity(m.cityId)?.country ?? "");
    out.push({ label: lang > 0 ? "Langue locale" : "Barrière de la langue", value: lang });
  }
  if (node.type === "social" || node.type === "poursuite" || node.type === "extraction" || node.type === "combat") {
    const owned = possessionBonus(state, a.skill);
    if (owned) out.push({ label: owned.label, value: owned.value });
  }
  return out;
}

export function approachOdds(state: GameState, a: Approach, intel: number): number {
  if (a.kind === "choix" || !a.skill || !a.difficulty) return 1;
  const m = state.mission!;
  const dc = DIFFICULTIES[a.difficulty].dc;
  let bonus: number;
  if (a.kind === "equipier") {
    const o = state.roster.find((x) => x.id === a.operative);
    bonus = o ? operativeSkill(o, a.skill) + (OPERATIVE_TRAITS[o.trait]?.assist?.[a.skill] ?? 0) : 3;
  } else {
    const c = state.character;
    bonus = c.attributes[SKILLS[a.skill].attribute] + c.skills[a.skill].rank;
    const g = findGadget(a.gadget);
    if (g) bonus += g.bonus;
    bonus += teamAssist(state, a.skill).bonus;
    bonus += situationalBonuses(state, a).reduce((n, b) => n + b.value, 0);
    bonus += injuryMalus(c, a.skill);
    const tired = (c.fatigue ?? 0) >= 85 ? 2 : (c.fatigue ?? 0) >= 60 ? 1 : 0;
    bonus -= tired;
  }
  bonus += intel - alertPenalty(m.alert);
  let ok = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) if ((x === 6 && y === 6) || (!(x === 1 && y === 1) && x + y + bonus >= dc - 1)) ok++;
  return ok / 36;
}

export interface NodeOutcome {
  state: GameState;
  /** Jet du joueur ou de l'équipier, pour l'affichage. */
  check?: CheckResult;
  outcome: CheckOutcome | "choix";
  notices: string[];
  /** Résumé factuel pour le narrateur. */
  summary: string;
  /** La mission vient de se terminer. */
  finished?: MissionResult;
}

const SUCCESS: CheckOutcome[] = ["reussite", "reussite_critique", "reussite_partielle"];

/**
 * Applique le résultat d'une tentative sur l'étape en cours (jet déjà fait).
 * Sert aussi aux tentatives improvisées arbitrées par le narrateur.
 */
export function applyAttempt(state: GameState, approach: Approach, outcome: CheckOutcome | "choix", rng: Rng = Math.random): NodeOutcome {
  let m = { ...state.mission! };
  const nodes = m.nodes.map((n) => ({ ...n }));
  const node = nodes[m.current];
  const notices: string[] = [];
  let c = { ...state.character };
  let roster = state.roster;
  let geo = state.world.geo;
  const lines: string[] = [];

  node.attempts += 1;
  m.turns += 1;

  if (outcome === "choix") {
    const e = approach.effect ?? {};
    m.exposure = clamp(m.exposure + (e.exposure ?? 0), 0, 100);
    m.alert = clamp(m.alert + (e.alert ?? 0), 0, 100);
    m.intel = Math.max(0, m.intel + (e.intel ?? 0));
    if (e.morale) c = { ...c, morale: clamp(c.morale + e.morale, 0, c.moraleMax) };
    if (e.merit) {
      c = { ...c, merit: Math.max(0, c.merit + e.merit) };
      notices.push(`Mérite ${e.merit > 0 ? "+" : ""}${e.merit} : ${approach.label}`);
    }
    if (e.team) roster = roster.map((o) => (m.team.includes(o.id) ? { ...o, affinity: clamp(o.affinity + e.team!, -100, 100) } : o));
    if (e.diplomacy && m.other) geo = shiftDiplomacy(geo, c.identity.agency, m.other, e.diplomacy);
    else if (e.diplomacy) {
      const others = (["argos", "meridian", "monsoon"] as AgencyId[]).filter((a) => a !== c.identity.agency);
      geo = shiftDiplomacy(geo, c.identity.agency, pick(others, rng), e.diplomacy);
    }
    if (e.compromise) m.compromised = true;
    if (e.rulebreak) {
      m.rulebreaks = (m.rulebreaks ?? 0) + 1;
      lines.push("Ce choix pourrait être jugé contraire aux Règles de Lucerne.");
    }
    node.status = "reussi";
    lines.unshift(`Choix : ${approach.label}.`);
  } else {
    const success = SUCCESS.includes(outcome);
    const partial = outcome === "reussite_partielle";
    const factor = outcome === "echec_critique" ? 1.5 : outcome === "echec" ? 1 : partial ? 0.5 : 0;
    const risk = approach.risk;
    const legend = c.legends?.find((l) => l.id === m.legend);
    const exposure = Math.max(0, Math.round(risk.exposure * factor) - (factor && stationHelps(state, m.region, "planque") ? 5 : 0) - (factor ? legendShield(legend) : 0));
    const alert = Math.round(risk.alert * factor);
    const vehicle = (node.type === "extraction" || node.type === "poursuite") && stationHelps(state, m.region, "garage") ? 1 : 0;
    const health = Math.max(0, Math.round(risk.health * factor) - vehicle);
    m.exposure = clamp(m.exposure + exposure, 0, 100);
    m.alert = clamp(m.alert + alert, 0, 100);
    if (approach.cost) c = { ...c, missionFunds: Math.max(0, c.missionFunds - approach.cost) };

    if (approach.operative) {
      const idx = roster.findIndex((o) => o.id === approach.operative);
      if (idx >= 0) {
        const o = { ...roster[idx], fatigue: clamp(roster[idx].fatigue + 15, 0, 100) };
        if (health >= 2 && chance(0.5, rng)) {
          o.status = "blesse";
          o.busyUntil = state.world.day + 21;
          notices.push(`${o.codename || o.name} est blessé`);
          lines.push(`${o.codename || o.name} est blessé.`);
        }
        roster = roster.map((x, i) => (i === idx ? o : x));
      }
    } else if (health > 0) {
      c = { ...c, health: Math.max(0, c.health - health) };
      notices.push(`Santé −${health}`);
      // Les coups sérieux laissent une blessure (parfois une séquelle).
      if (health >= 2) {
        const hurt = inflictInjury(c, node.type, health, state.world.day, outcome === "echec_critique", rng);
        c = hurt.character;
        notices.push(hurt.notice);
        lines.push(`${hurt.notice}.`);
      }
    }

    if (success) {
      const g = findGadget(approach.gadget);
      if (g?.effect) {
        m.exposure = clamp(m.exposure + (g.effect.exposure ?? 0), 0, 100);
        m.alert = clamp(m.alert + (g.effect.alert ?? 0), 0, 100);
        m.intel += g.effect.intel ?? 0;
        if (g.effect.health) c = { ...c, health: Math.min(c.healthMax, c.health + g.effect.health) };
      }
      if (node.type === "secondaire") {
        m.bonusMerit = (m.bonusMerit ?? 0) + 0.5;
        m.intel += 1;
        lines.push("Objectif secondaire rempli : mérite +0,5, renseignement +1, une pièce de dossier.");
      }
      const gained = (approach.intel ?? 0) + (outcome === "reussite_critique" ? 1 : 0);
      if (gained) {
        m.intel += gained;
        lines.push(`Renseignement +${gained}.`);
      }
      node.status = partial ? "partiel" : "reussi";
    } else {
      // Une approche ratée ne se retente pas : il faut changer d'angle.
      node.approaches = node.approaches.filter((a) => a.id !== approach.id);
      if (outcome === "echec_critique" && nodes.filter((n) => n.type === "complication").length < 2) {
        nodes.splice(m.current + 1, 0, buildNode("complication", NODES.complication, IMPORTANCE_SHIFT[m.importance], ctxOf(state), rng));
        lines.push("Une complication surgit.");
      }
      if (!node.approaches.length) {
        node.status = "echoue";
        lines.push("Plus aucune approche possible : l'étape est perdue.");
      }
    }
    lines.unshift(
      `${approach.label} : ${outcome === "reussite_critique" ? "réussite éclatante" : outcome === "reussite" ? "réussite" : partial ? "réussite partielle (au prix d'un risque)" : outcome === "echec_critique" ? "échec grave" : "échec"}.`,
    );
    if (exposure) lines.push(`Exposition +${exposure} (${m.exposure}/100).`);
    if (alert) lines.push(`Alerte +${alert} (${m.alert}/100).`);
    if (health && !approach.operative) lines.push(`Blessure : santé −${health}.`);
  }

  // Couverture grillée ou cible en fuite : on saute à l'extraction.
  const extractionAt = nodes.length - 1;
  const keyIdx = nodes.findIndex((n) => n.key);
  const open = (i: number) => nodes[i].status === "a_venir" || nodes[i].status === "en_cours";
  if (m.exposure >= 100 && !m.blown) {
    m.blown = true;
    m.compromised = true;
    lines.push("COUVERTURE GRILLÉE : il faut sortir, tout de suite.");
    for (let i = m.current; i < extractionAt; i++) if (open(i)) nodes[i].status = "echoue";
  }
  if (m.alert >= 100 && keyIdx >= m.current && open(keyIdx)) {
    nodes[keyIdx].status = "echoue";
    lines.push("ALERTE MAXIMALE : la cible s'est évanouie, l'objectif est perdu.");
  }

  // Étape suivante : on passe les étapes perdues ou sautées.
  if (!open(m.current)) {
    m.current += 1;
    while (m.current < nodes.length && nodes[m.current].status === "echoue") m.current += 1;
    if (m.current < nodes.length) nodes[m.current].status = "en_cours";
  } else node.status = "en_cours";

  m = { ...m, nodes, history: [...m.history, { node: state.mission!.current, approach: approach.label, outcome, summary: lines.join(" ") }] };
  let next: GameState = { ...state, mission: m, character: c, roster, world: { ...state.world, geo } };

  let finished: MissionResult | undefined;
  if (m.current >= nodes.length) {
    const end = finishMission(next, rng);
    next = end.state;
    notices.push(...end.notices);
    lines.push(...end.lines);
    finished = end.result;
  }
  return { state: next, outcome, notices, summary: lines.join(" "), finished };
}

function ctxOf(state: GameState): Ctx {
  const m = state.mission!;
  const city = findCity(m.cityId);
  return {
    city: city?.name ?? "",
    country: findCountry(city?.country ?? "")?.name ?? "",
    target: m.target,
    faction: findFaction(m.faction)?.name ?? "",
    cover: m.cover,
    other: m.other ? AGENCIES[m.other].name : "",
    agency: AGENCIES[state.character.identity.agency].name,
  };
}

/**
 * Soutien de mission (une fois chacun) : le coup signature du siège emporte l'étape en cours ;
 * une Branche change les jauges (labo : alerte −15 ; analyse : renseignement +3 ; logistique : exposition −25).
 */
export function useResource(state: GameState, source: string): NodeOutcome {
  const c = state.character;
  const m = { ...state.mission!, resourcesUsed: [...state.mission!.resourcesUsed, source] };
  if (source === "seat") {
    const seat = findSeat(c.identity.agency, c.seat);
    return applyAttempt(
      { ...state, mission: m },
      { id: "ressource:seat", label: `${seat?.signature.name ?? "Coup signature"} (${seat?.name ?? "siège"})`, kind: "competence", risk: { exposure: 0, alert: 0, health: 0 } },
      "reussite",
    );
  }
  const branch = findBranch(c.identity.agency, source);
  if (!branch) throw new Error("Soutien inconnu.");
  const effects =
    branch.kind === "labo" ? { alert: Math.max(0, m.alert - 15) } : branch.kind === "analyse" ? { intel: m.intel + 3 } : { exposure: Math.max(0, m.exposure - 25) };
  const favor = { ...(state.command.branchFavor ?? {}), [branch.id]: Math.max(-100, (state.command.branchFavor?.[branch.id] ?? 0) - 5) };
  const summary = `Soutien de ${branch.name} : ${branch.support.name} — ${branch.support.description}`;
  const mission = { ...m, ...effects, history: [...m.history, { node: m.current, approach: branch.support.name, outcome: "reussite" as const, summary }] };
  return { state: { ...state, mission, command: { ...state.command, branchFavor: favor } }, outcome: "reussite", notices: [`${branch.support.name} (${branch.name})`], summary };
}

/* ------------------------------------------------------------------ */
/* Fin de mission                                                      */
/* ------------------------------------------------------------------ */

/** Récupération obligatoire après une mission, en jours. */
export const REST_DAYS: Record<MissionImportance, number> = { locale: 21, regionale: 28, continentale: 42, mondiale: 56 };

function finishMission(state: GameState, rng: Rng): { state: GameState; notices: string[]; lines: string[]; result: MissionResult } {
  const m = state.mission!;
  const key = m.nodes.find((n) => n.key);
  const extraction = m.nodes[m.nodes.length - 1];
  const keyDone = key && (key.status === "reussi" || key.status === "partiel");
  const anyFailed = m.nodes.some((n) => n.status === "echoue" && n.type !== "secondaire");
  let result: MissionResult;
  if (!keyDone) result = "echec";
  else if (m.compromised || extraction.status === "echoue") result = "partiel";
  else if (key!.status === "reussi" && extraction.status === "reussi" && m.exposure < 40 && !anyFailed) result = "eclatant";
  else result = "reussite";

  const notices: string[] = [];
  const lines: string[] = [`MISSION TERMINÉE — résultat : ${MISSION_RESULTS[result].label.toUpperCase()}.`];
  let c = { ...state.character, feats: { ...state.character.feats } };
  let w = { ...state.world };
  let geo = w.geo;
  const agency = c.identity.agency;
  const youth = m.kind === "jeunesse";

  // Mérite, prime, points (les Opérations Jeunesse comptent pour le brassard, pas pour le mérite).
  if (!youth) {
    const gained = missionMerit(m.importance, result);
    const bonus = missionBonus(m.importance, result);
    c.merit += gained;
    notices.push(`Mérite +${gained} : mission ${MISSION_IMPORTANCE[m.importance].label.toLowerCase()}, ${MISSION_RESULTS[result].label.toLowerCase()}`);
    if (bonus > 0) {
      c.money += bonus;
      notices.push(`Prime de mission : +${formatEuros(bonus)}`);
    }
  } else {
    c.youthOps = (c.youthOps ?? 0) + 1;
    if (result !== "echec" && c.armband === "gris") {
      c.armband = "bleu";
      notices.push("Brassard bleu : première Opération Jeunesse réussie");
    } else if (result === "eclatant" && c.armband === "bleu" && c.youthOps >= 2) {
      c.armband = "noir";
      notices.push("Brassard noir : l'élite des cadets");
    }
  }
  if (result === "reussite" || result === "eclatant") {
    w.missionsCompleted += 1;
    c.skillPoints += POINTS_PER_MISSION;
    notices.push(`+${POINTS_PER_MISSION} point de compétence à répartir (mission réussie)`);
    if (m.importance === "continentale" || m.importance === "mondiale") c.feats.majorMission = true;
  }
  if (RANKS[c.rank].order >= 4 && m.team.length >= 2 && result !== "echec") c.feats.commanded = true;
  if ((m.rulebreaks ?? 0) > 0 && chance(0.5 * (m.rulebreaks ?? 1), rng)) {
    c.blames += 1;
    c.merit = Math.max(0, c.merit - 3);
    notices.push("Blâme : manquement aux Règles de Lucerne (−3 de mérite)");
  }

  // Le monde réagit.
  geo = shiftTension(geo, m.region, result === "eclatant" ? -8 : result === "reussite" ? -5 : result === "partiel" ? -1 : 6);
  if (m.kind === "conjointe" && m.other) geo = shiftDiplomacy(geo, agency, m.other, result === "echec" ? -6 : 6);
  if (m.kind === "contre_espionnage" && m.other) geo = shiftDiplomacy(geo, agency, m.other, -8);
  const city = findCity(m.cityId);
  geo = addNews(geo, {
    day: w.day,
    region: m.region,
    player: true,
    text:
      result === "echec"
        ? `${city?.name ?? "Ailleurs"} : une affaire étouffée de justesse ; les autorités refusent tout commentaire.`
        : `${city?.name ?? "Ailleurs"} : ${PUBLIC_FACADE[m.template] ?? "un incident discret, vite oublié."}`,
  });

  // Objectifs secondaires : mérite en plus.
  if (m.bonusMerit && !youth) {
    c.merit += m.bonusMerit;
    notices.push(`Mérite +${m.bonusMerit} : objectifs secondaires`);
  }

  // Notoriété dans le pays, et légende grillée si la couverture a sauté.
  const country = city?.country ?? "";
  const countryName = findCountry(country)?.name ?? "";
  const heatGain = Math.round(m.exposure / 2) + (m.blown ? 40 : 0) + (result === "echec" ? 10 : 0);
  if (country && heatGain) {
    c = addHeat(c, country, heatGain);
    if (heatOf(c, country) >= 60) notices.push(`Tu es ${heatLabel(heatOf(c, country))} en ${countryName}`);
  }
  if (m.legend && m.blown) {
    c = { ...c, legends: c.legends.map((l) => (l.id === m.legend ? { ...l, credibility: Math.max(0, l.credibility - 40), burned: [...new Set([...l.burned, countryName])] } : l)) };
    notices.push(`Légende grillée en ${countryName}`);
  }

  // La menace visée : déjouée, ou relancée.
  if (m.threat) {
    const threat = geo.threats.find((x) => x.id === m.threat);
    if (threat && result !== "echec") {
      geo = { ...geo, threats: geo.threats.filter((x) => x.id !== threat.id) };
      if (threat.capstone) {
        geo = { ...geo, dormant: { ...geo.dormant, [threat.faction]: w.day + 365 }, dossiers: { ...geo.dossiers, [threat.faction]: 0 }, threats: geo.threats.filter((x) => x.faction !== threat.faction) };
        geo = addNews(geo, { day: w.day, region: m.region, player: true, text: `Coup de filet mondial : l'état-major de ${findFaction(threat.faction)?.name} démantelé en une nuit, dans plusieurs pays.` });
        notices.push(`${findFaction(threat.faction)?.name} décapitée : en sommeil pour un an`);
      } else notices.push(`Menace déjouée : ${threat.title}`);
    } else if (threat) geo = { ...geo, threats: geo.threats.map((x) => (x.id === threat.id ? { ...x, progress: Math.min(95, x.progress + 25) } : x)) };
  }

  // Les dossiers se remplissent, les gouvernements jugent.
  const pieces = (result === "eclatant" ? 2 : result === "reussite" ? 1 : 0) + Math.round((m.bonusMerit ?? 0) * 2);
  if (pieces && !youth) {
    const r = addDossier(geo, m.faction, pieces, rng);
    geo = r.geo;
    if (r.notice) notices.push(r.notice);
  }
  if (!youth) geo = shiftSatisfaction(geo, agency, result === "eclatant" ? 3 : result === "reussite" ? 2 : result === "partiel" ? 0 : -3);

  // L'ennemi nommé : pris, abattu, ou plus dangereux encore.
  const target = m.nemesis ? geo.nemeses.find((n) => n.id === m.nemesis) : undefined;
  if (target) {
    const caught = result === "eclatant" || (result === "reussite" && chance(0.5, rng));
    geo = {
      ...geo,
      nemeses: geo.nemeses.map((n) =>
        n.id === target.id
          ? caught
            ? { ...n, status: chance(0.6, rng) ? "capture" : "mort", lastDay: w.day, encounters: n.encounters + 1 }
            : { ...n, level: Math.min(5, n.level + 1), grudge: Math.min(100, n.grudge + 20), cityId: m.cityId, lastDay: w.day, encounters: n.encounters + 1, history: `${n.history} Il t'a encore échappé à ${city?.name}.` }
          : n,
      ),
    };
    notices.push(caught ? `${target.name} est hors d'état de nuire` : `${target.name} t'a encore échappé`);
  } else if (!youth && result !== "eclatant" && (m.kind === "contre_espionnage" || chance(0.45, rng))) {
    const title = m.target.replace(/^(un|une) /, "");
    const n = makeNemesis(m.faction, title, m.cityId, w.day, `Vous vous êtes affrontés à ${city?.name} (${m.name}).`, rng, m.kind === "contre_espionnage" ? m.other : undefined);
    geo = { ...geo, nemeses: [...geo.nemeses, n] };
    notices.push(`Un ennemi est né : ${n.name}, ${title}`);
  }

  // Pris sur le terrain : prison en pays hostile, expulsion ailleurs.
  let prison = null as GameState["character"]["prison"];
  if (extraction.status === "echoue" && (m.blown || m.exposure >= 80) && !youth) {
    const bloc = findCountry(country)?.bloc;
    if ((bloc === "hostile" || bloc === "gris") && chance(0.55, rng)) {
      prison = arrest(state, m.cityId, findFaction(m.faction)?.name ?? `les services de ${countryName}`);
      notices.push(`Capturé en ${countryName}`);
    } else if (chance(0.4, rng)) {
      c = { ...addHeat(c, country, 100), reputation: Math.max(0, c.reputation - 8) };
      notices.push(`Arrêté puis expulsé de ${countryName} (réputation −8)`);
    }
  }
  c = { ...c, prison };

  // Matériel rendu, fonds restitués, retour à la base.
  const lab = c.inventory.filter((i) => i.lab);
  if (lab.length) notices.push(`Rendu au laboratoire : ${lab.map((i) => i.name).join(", ")}`);
  if (c.missionFunds > 0) notices.push(`Fonds opérationnels restitués : ${formatEuros(c.missionFunds)}`);
  c = { ...c, inventory: c.inventory.filter((i) => !i.lab), missionFunds: 0, fatigue: clamp((c.fatigue ?? 0) + 30, 0, 100) };

  const duration = 2 + m.nodes.length;
  const rest =
    (youth ? 28 : REST_DAYS[m.importance]) +
    (c.health <= c.healthMax / 2 ? 14 : 0) -
    (state.command.station?.modules.includes("infirmerie") ? 7 : 0) -
    (c.possessions?.includes("planque") ? 7 : 0);
  const home = prison ? prison.cityId : c.rank === "aspirant" ? AGENCIES[agency].academyCity : (c.station ?? AGENCIES[agency].hqCity);
  w = {
    ...w,
    phase: "base",
    day: w.day + duration,
    restUntil: w.day + duration + rest,
    cityId: home,
    location: findCity(home)?.name ?? w.location,
    chapter: `Après ${m.name.replace("Opération ", "")}`,
    geo,
  };
  lines.push(prison ? `CAPTURÉ : le personnage est détenu par ${prison.captor}.` : `Retour à la base. Récupération obligatoire : ${Math.round(rest / 7)} semaines avant la prochaine mission.`);

  // L'équipe rentre, plus ou moins soudée.
  const roster = state.roster.map((o) => {
    if (!m.team.includes(o.id)) return o;
    const loyal = OPERATIVE_TRAITS[o.trait]?.affinity ?? 1;
    const delta = Math.round((result === "echec" ? -4 : result === "eclatant" ? 10 : 6) * loyal);
    return {
      ...o,
      status: o.status === "en_mission" ? ("apte" as const) : o.status,
      affinity: clamp(o.affinity + delta, -100, 100),
      missionsWithPlayer: o.missionsWithPlayer + 1,
      fatigue: clamp(o.fatigue + 25, 0, 100),
      cityId: AGENCIES[o.agency].hqCity,
      positionDay: w.day,
    };
  });

  // Devoir : le rapport de mission.
  const duties = [
    ...state.duties,
    {
      id: uid(rng),
      title: `Rapport : ${m.name}`,
      description: "Rédiger le rapport de mission et passer le débriefing avec la hiérarchie.",
      activity: "devoir" as const,
      dueDay: w.day + 7,
      progress: 0,
      required: 1,
      penalty: { reputation: -5, merit: -0.5 },
      status: "ouvert" as const,
    },
  ];

  // Aux archives.
  const record: MissionRecord = {
    id: m.id,
    ...(m.offerId ? { offerId: m.offerId } : {}),
    name: m.name,
    kind: m.kind,
    importance: m.importance,
    result,
    city: city?.name ?? "",
    country: findCountry(city?.country ?? "")?.name ?? "",
    region: m.region,
    faction: findFaction(m.faction)?.name ?? "",
    target: m.target,
    objective: m.objective,
    cover: m.cover,
    team: m.team.map((id) => state.roster.find((o) => o.id === id)).filter((o) => o !== undefined).map((o) => (o.codename ? `« ${o.codename} » ${o.name}` : o.name)),
    startDay: m.startDay,
    endDay: w.day,
    steps: m.nodes.map((n) => ({ title: n.title, status: n.status, ...(n.key ? { key: true } : {}), ...(n.type === "secondaire" ? { secondary: true } : {}), ...(n.type === "dilemme" ? { dilemma: true } : {}) })),
    report: [...lines.slice(1), ...notices],
    exposure: m.exposure,
    ...(m.blown ? { blown: true } : {}),
    ...(m.nemesis ? { nemesis: geo.nemeses.find((n) => n.id === m.nemesis)?.name } : {}),
  };

  return {
    state: { ...state, character: c, world: w, roster, duties, mission: null, lastMission: { ...m, stage: "terminee", result }, missionLog: [...(state.missionLog ?? []), record].slice(-80) },
    notices,
    lines,
    result,
  };
}

/** Ce que le public en saura (dépêche). */
const PUBLIC_FACADE: Record<string, string> = {
  exfiltration: "un ingénieur porté disparu ; sa famille a reçu une carte postale sans adresse.",
  prototype: "un laboratoire privé signale un « incident informatique mineur ».",
  sabotage: "une installation industrielle à l'arrêt après une panne inexpliquée.",
  gala: "une vente aux enchères annulée au dernier moment ; deux invités arrêtés à l'aéroport.",
  reseau: "coup de filet de la police locale contre un réseau de contrebande.",
  assassinat: "fausse alerte lors d'une visite officielle ; la sécurité a été renforcée.",
  arme: "un conteneur saisi sur le port, contenu classé secret.",
  otage: "un ressortissant libéré « grâce à la médiation d'un pays tiers ».",
  cyber: "fin brutale d'une vague de cyberattaques ; les serveurs ont disparu.",
  jeune_lycee: "rien. Un élève a simplement changé d'établissement.",
  jeune_camp: "un camp d'été pour jeunes talents ferme ses portes pour « raisons administratives ».",
  jeune_tournoi: "disqualification d'une équipe lors d'un tournoi d'e-sport ; enquête pour fraude.",
  taupe: "un diplomate étranger quitte le pays sans explication.",
};

/* ------------------------------------------------------------------ */
/* Tableau des missions                                                */
/* ------------------------------------------------------------------ */

/** Remplit le tableau des missions quand le joueur peut repartir. */
export function refreshOffers(state: GameState, rng: Rng = Math.random): { state: GameState; notices: string[] } {
  const c = state.character;
  const day = state.world.day;
  const notices: string[] = [];
  // Les offres expirées disparaissent ; refuser une mission assignée se paie.
  let offers = state.offers.filter((o) => o.expiresDay > day);
  let reputation = c.reputation;
  for (const o of state.offers.filter((x) => x.expiresDay <= day && x.assigned)) {
    reputation = Math.max(0, reputation - 6);
    notices.push(`Mission ignorée : ${o.title.split(" — ")[0]} confiée à un autre (réputation −6)`);
  }
  const eligible = state.world.phase === "base" && !state.mission && day >= state.world.restUntil && !canStartMission(state);
  if (eligible && offers.length === 0) {
    // Cadets : une Opération Jeunesse de temps en temps seulement.
    const youth = c.rank === "aspirant";
    if (!youth || chance(0.35, rng)) {
      const count = youth ? 1 : OFFER_COUNT(c.rank);
      for (let i = 0; i < count; i++) offers.push(makeOffer(state, rng));
      notices.push(youth ? "Une Opération Jeunesse t'est proposée" : count > 1 ? `${count} missions proposées par la hiérarchie` : "Nouvelle mission assignée");
    }
  }
  return { state: { ...state, offers, character: { ...c, reputation } }, notices };
}

/** Missions confiées à d'autres (Contrôleur et au-delà) : résultat calculé au retour de l'équipe. */
export function delegateChance(state: GameState, offer: MissionOffer, team: Operative[]): number {
  const tpl = findTemplate(offer.template);
  const skill = team.reduce((n, o) => n + (tpl ? bestSkill(o, tpl.skills).value : 4), 0) / Math.max(1, team.length);
  const base = { locale: 0.8, regionale: 0.65, continentale: 0.5, mondiale: 0.35 }[offer.importance];
  return clamp(base + (skill - 6) * 0.06 + (team.length - 2) * 0.05, 0.1, 0.95);
}

export function difficultyLabel(d?: Difficulty) {
  return d ? DIFFICULTIES[d].label : "";
}

export function regionLabel(id: string) {
  return REGIONS[id as RegionId]?.label ?? id;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
