/** Les quatre pôles (attributs), façon Disco Elysium. */
export type AttributeId = "esprit" | "ame" | "corps" | "geste";

export type SkillId =
  // Esprit
  | "logique"
  | "archives"
  | "machine"
  | "babel"
  | "medecine"
  | "tactique"
  // Âme
  | "sangfroid"
  | "empathie"
  | "masque"
  | "eloquence"
  | "instinct"
  | "tenue"
  // Corps
  | "endurance"
  | "force"
  | "combat"
  | "athletisme"
  | "tolerance"
  | "alerte"
  // Geste
  | "precision"
  | "doigte"
  | "ombre"
  | "pilotage"
  | "vivacite"
  | "regard";

/** Les trois agences du Concordat de Lucerne. */
export type AgencyId = "argos" | "meridian" | "monsoon";

/** Les grades du Concordat, communs aux trois agences. */
export type RankId =
  | "prospect"
  | "aspirant"
  | "agent"
  | "titulaire"
  | "doyen"
  | "chef_station"
  | "controleur"
  | "directeur";

export type PhaseId =
  | "dossier"
  | "recrutement"
  | "selection"
  | "base"
  | "mission"
  | "apres";

export type Difficulty =
  | "triviale"
  | "facile"
  | "moyenne"
  | "ardue"
  | "redoutable"
  | "legendaire"
  | "heroique"
  | "surhumaine"
  | "impossible";

export type CheckOutcome =
  | "reussite_critique"
  | "reussite"
  | "reussite_partielle"
  | "echec"
  | "echec_critique";

export type Gender = "garcon" | "fille" | "nonbinaire";

export type MissionImportance = "locale" | "regionale" | "continentale" | "mondiale";
export type MissionResult = "echec" | "partiel" | "reussite" | "eclatant";

export interface SkillState {
  /** Rangs appris (s'ajoutent au pôle). */
  rank: number;
  xp: number;
}

export type ItemCategory = "gadget" | "arme" | "equipement" | "document" | "consommable" | "souvenir";

export interface Item {
  name: string;
  description: string;
  category: ItemCategory;
  /** Sur soi (utilisable) ou au casier de la base. */
  carried: boolean;
  /** Bonus chiffré appliqué par le moteur quand l'objet est utilisé pour un jet de cette compétence. */
  bonus?: { skill: SkillId; value: number; condition: string };
  /** Utilisations restantes (absent = illimité). */
  charges?: number;
  /** Prêté par le laboratoire de l'agence : rendu à la fin de la mission, sa perte coûte du mérite. */
  lab?: boolean;
  /** Gadget du catalogue (ses effets en mission). */
  gadget?: string;
}

export type ProgressKind =
  | "skill"
  | "pole"
  | "rank"
  | "merit"
  | "item"
  | "pin"
  | "points"
  | "codename"
  | "seat"
  | "age"
  | "money";

export interface ProgressEntry {
  ts: number;
  day: number;
  kind: ProgressKind;
  text: string;
}

export interface Distinction {
  name: string;
  reason: string;
}

export interface Identity {
  firstName: string;
  lastName: string;
  /** Âge au moment du recrutement ; l'âge courant dépend de la date du jour. */
  age: number;
  gender: Gender;
  /** Date de naissance (AAAA-MM-JJ), fixée par le moteur : l'âge en découle. */
  birthDate?: string;
  birthplace: string;
  appearance: string;
  languages: string;
  /** Agence du Concordat à laquelle le prospect a été proposé. */
  agency: AgencyId;
  /** Pays membre qui a proposé le prospect. */
  nationality: string;
}

export interface Character {
  identity: Identity;
  originId: string;
  dramaId: string;
  motivationId: string;
  qualities: string[];
  flaw: string;
  playerNotes: string;
  attributes: Record<AttributeId, number>;
  skills: Record<SkillId, SkillState>;
  /** Compétence signature : +1 rang et +1 au plafond d'apprentissage. */
  signature: SkillId;
  health: number;
  healthMax: number;
  morale: number;
  moraleMax: number;
  reputation: number;
  rank: RankId;
  /** Mérite cumulé : la base des promotions. */
  merit: number;
  /** Blâmes non effacés. */
  blames: number;
  /** Conditions de promotion remplies au fil de la carrière. */
  feats: { majorMission: boolean; commanded: boolean; seated?: boolean };
  /** Nom de code : celui du siège du Cercle (fixe, comme 007). */
  codename: string | null;
  /** Matricule d'officier, avant d'avoir un siège. */
  matricule: string | null;
  /** Siège au Cercle (identifiant). */
  seat: string | null;
  /** Station d'affectation (ville de la carte). */
  station: string | null;
  inventory: Item[];
  distinctions: Distinction[];
  /** Points de compétence gagnés, que le joueur répartit lui-même. */
  skillPoints: number;
  /** Solde personnelle, en euros. */
  money: number;
  /** Fonds opérationnels de la mission en cours, restitués à la fin. */
  missionFunds: number;
  /** Fatigue (0 à 100) : elle pèse sur les jets au-delà de 60. */
  fatigue: number;
  /** Couverture civile (0 à 100) : la crédibilité de ta vie officielle auprès de ta famille et de ton entourage. */
  cover: number;
  /** Brassard de l'Académie (cadets). */
  armband: Armband;
  /** Opérations Jeunesse menées comme cadet. */
  youthOps: number;
  /** Fausses identités. */
  legends: Legend[];
  /** Notoriété auprès des services de chaque pays (0 à 100), par code de pays. */
  heat: Record<string, number>;
  /** Blessures en cours et séquelles. */
  injuries: Injury[];
  /** Le corps : il change avec l'entraînement, le repos, les blessures. */
  body?: Body;
  /** Le relevé de compte. */
  ledger?: LedgerEntry[];
  /** Langues parlées, et apprentissage en cours (0 à 100). */
  spoken: string[];
  learning: Record<string, number>;
  /** Biens personnels (logement, véhicule, garde-robe…). */
  possessions: string[];
  /** Détention : arrêté et retenu par un service étranger. */
  prison: Prison | null;
}

export interface Prison {
  country: string;
  cityId: string;
  captor: string;
  since: number;
  /** Progression d'une évasion (0 à 100). */
  escape: number;
  /** Ce que l'ennemi a déjà arraché (0 à 100). */
  leaked: number;
}

export type Armband = "blanc" | "gris" | "bleu" | "noir";

/** Une fausse identité : on la construit, on l'entretient, elle se grille. */
export interface Legend {
  id: string;
  name: string;
  nationality: string;
  profession: string;
  /** Crédibilité (0 à 100) : elle protège de l'exposition en mission. */
  credibility: number;
  /** Pays où elle est grillée (noms). */
  burned: string[];
  createdDay: number;
}

export interface LedgerEntry {
  day: number;
  label: string;
  amount: number;
}

export type BodyZone = "tete" | "torse" | "abdomen" | "bras_g" | "bras_d" | "main_g" | "main_d" | "jambe_g" | "jambe_d";

export interface Body {
  /** Taille adulte visée (cm) : on grandit jusqu'à 16-18 ans. */
  adultHeight: number;
  /** Musculature (0 à 100). */
  muscle: number;
  /** Masse grasse (%). */
  fat: number;
  /** Ce que les blessures ont laissé. */
  scars: { zone: BodyZone; name: string; day: number }[];
  /** Les valeurs de la semaine précédente, pour les tendances. */
  prev?: { muscle: number; fat: number };
}

/** Une blessure : un malus sur certaines compétences jusqu'à guérison (ou à vie : une séquelle). */
export interface Injury {
  id: string;
  name: string;
  description: string;
  malus: Partial<Record<SkillId, number>>;
  /** Jour de guérison ; absent pour une séquelle permanente. */
  healDay?: number;
}

export type RelationKind = "proche" | "mentor" | "equipier" | "allie" | "contact" | "ami" | "amour" | "ex" | "rival" | "ennemi";
export type RelationStatus = "actif" | "injoignable" | "disparu" | "mort" | "archive";

export interface Relation {
  name: string;
  role: string;
  kind: RelationKind;
  status: RelationStatus;
  affinity: number;
  /** Faveurs : positif = il t'en doit, négatif = tu lui en dois. */
  favors: number;
  /** Où le joindre ou le trouver. */
  location: string;
  /** Ce qu'il sait de toi (ta vraie identité, ton agence, tes secrets…). */
  knows: string;
  notes: string;
  /** Jour du dernier échange. */
  lastSeenDay: number;
  /** Force du lien (0 à 100) : elle s'érode quand on ne donne pas de nouvelles. */
  bond: number;
  /** Dernière position connue (ville de la carte) et jour où elle a été connue. */
  cityId?: string;
  positionDay?: number;
  /** Sous quelle identité elle te connaît : « reel », « code », ou le nom d'une légende. */
  knownAs?: string;
  /** Membre de l'effectif (camarade, collègue) : sa fiche suit ses mutations. */
  operativeId?: string;
  /** Jour de la rencontre. */
  metDay?: number;
  /** Les grandes étapes du lien, datées. */
  history?: { day: number; text: string }[];
}

export interface World {
  /** Date du jour 0 de la partie (AAAA-MM-JJ). */
  startDate?: string;
  phase: PhaseId;
  day: number;
  location: string;
  chapter: string;
  missionsCompleted: number;
  /** Ville où se trouve le personnage (carte). */
  cityId: string;
  /** Pas de nouvelle mission avant ce jour (récupération). */
  restUntil: number;
  /** Tensions par région, diplomatie entre agences, dépêches. */
  geo: WorldGeo;
}

export interface WorldGeo {
  tensions: Record<string, number>;
  /** Relations entre agences, de −100 (guerre de l'ombre) à +100 (alliance). */
  diplomacy: Diplomacy;
  news: NewsItem[];
  /** Opérations adverses en cours : ignorées, elles frappent. */
  threats: Threat[];
  /** Pièces de renseignement accumulées sur chaque faction (0 à 10). */
  dossiers: Record<string, number>;
  /** Factions décapitées, en sommeil jusqu'à ce jour. */
  dormant: Record<string, number>;
  /** Satisfaction des gouvernements membres envers chaque agence (0 à 100) : elle fixe les moyens. */
  satisfaction: Record<string, number>;
  /** Ennemis nommés qui reviennent. */
  nemeses: Nemesis[];
}

export interface Threat {
  id: string;
  faction: string;
  region: string;
  cityId: string;
  /** Modèle de mission correspondant. */
  template: string;
  title: string;
  /** Avancement (0 à 100) : à 100, elle frappe. */
  progress: number;
  /** Identifiée (détails connus) ou simple rumeur. */
  known: boolean;
  /** Ennemi nommé à sa tête, s'il y en a un. */
  nemesis?: string;
  /** Opération décisive contre la tête de la faction. */
  capstone?: boolean;
}

export interface Nemesis {
  id: string;
  name: string;
  title: string;
  faction: string;
  /** Agent d'une agence rivale. */
  agency?: AgencyId;
  level: number;
  /** Sa rancune envers le joueur (0 à 100). */
  grudge: number;
  status: "libre" | "capture" | "mort";
  cityId: string;
  lastDay: number;
  encounters: number;
  /** Ce que le joueur lui a fait, en une phrase. */
  history: string;
}

export interface Diplomacy {
  argos_meridian: number;
  meridian_monsoon: number;
  argos_monsoon: number;
}

export interface NewsItem {
  day: number;
  region: string;
  text: string;
  /** Liée à une action du joueur. */
  player?: boolean;
}

export interface CheckResult {
  skill: SkillId;
  difficulty: Difficulty;
  reason: string;
  /** Objet utilisé pour ce jet, s'il y en a un. */
  item?: string;
  /** Jet rouge : une seule tentative possible. Jet blanc : peut être retenté plus tard. */
  red: boolean;
  dice: [number, number];
  bonus: number;
  bonusBreakdown: string[];
  total: number;
  dc: number;
  outcome: CheckOutcome;
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "check"; check: CheckResult }
  | { kind: "event"; text: string }
  /** Carte du jeu (bilan, ordre de mission…), affichée dans le récit. */
  | { kind: "card"; card: StoryCard }
  /** Pièce montrée par le narrateur (message, lettre, coupure de presse…). */
  | { kind: "doc"; doc: StoryDoc };

/** Une jauge de mission avant et après une étape. */
export interface GaugeShift {
  label: string;
  before: number;
  after: number;
  /** Plus c'est haut, pire c'est (exposition, alerte). */
  bad?: boolean;
  max?: number;
}

/** Ce que le jeu met en scène lui-même dans le récit, au moment où ça arrive. Tout est déjà rédigé pour l'affichage. */
export type StoryCard =
  | {
      type: "semaine";
      fromDay: number;
      toDay: number;
      dateLabel: string;
      plan: { icon: string; label: string; detail?: string }[];
      deltas: { label: string; value: number; unit?: string; good: boolean }[];
      lines: string[];
      event: boolean;
      /** Nombre de semaines jouées d'affilée (1 si absent). */
      weeks?: number;
      /** Pourquoi le temps s'est arrêté plus tôt. */
      stop?: string | null;
    }
  | {
      type: "anniversaire";
      name: string;
      age: number;
      dateLabel: string;
    }
  | {
      type: "briefing";
      name: string;
      importance: MissionImportance;
      kind: MissionKind;
      city: string;
      country: string;
      objective: string;
      target: string;
      faction: string;
      cover: string;
      team: string[];
      steps: { title: string; key?: boolean; secondary?: boolean; dilemma?: boolean; fork?: boolean }[];
      notes: string[];
    }
  | {
      type: "etape";
      title: string;
      approach: string;
      outcome: CheckOutcome | "choix";
      gauges: GaugeShift[];
      notes: string[];
      step: number;
      steps: number;
    }
  | {
      type: "bilan";
      name: string;
      result: MissionResult;
      merit: number;
      bonus: number;
      lines: string[];
      restDays: number;
      /** Arrêté à la fin de la mission : par qui, et où. */
      arrested?: string;
    }
  | { type: "promotion"; rank: RankId; title: string; subtitle: string; lines: string[] };

export type StoryDocType = "message" | "lettre" | "presse" | "chiffre" | "photo";

/** Une pièce que le narrateur montre telle quelle au joueur. */
export interface StoryDoc {
  type: StoryDocType;
  titre: string;
  /** Expéditeur, source, auteur ou photographe. */
  de?: string;
  /** Date ou heure telle qu'elle apparaît sur la pièce. */
  date?: string;
  /** Texte de la pièce. Les passages entre ||barres|| sont masqués jusqu'à ce que le joueur les lise de près. */
  contenu: string;
  /** Messages d'une conversation (type « message »). */
  messages?: { de: string; texte: string }[];
  /** Pour une photo : la légende manuscrite au dos. */
  legende?: string;
  /** Jour de jeu où la pièce a été montrée. */
  day?: number;
  /** Pour un rapport : la question posée, la cotation de la source, la mission concernée. */
  topic?: IntelRequestKind;
  grade?: string;
  offerId?: string;
  /** Mission pendant laquelle la pièce a été trouvée ou montrée. */
  missionId?: string;
}

export interface LogEntry {
  id: string;
  role: "narrator" | "player";
  segments: Segment[];
  ts: number;
  /** Modèle qui a écrit ce tour (entrées du narrateur). */
  model?: string;
  /** Action libre telle que le joueur l'avait écrite, si l'arbitre l'a reformulée. */
  original?: string;
}

export type ChoiceTone = "audace" | "prudence" | "ruse" | "social" | "ellipse" | "autre";

export interface Choice {
  label: string;
  tone: ChoiceTone;
  /** Compétence mise en avant par ce choix, s'il y en a une. */
  skill?: SkillId;
}

export interface Dossier {
  text: string;
  summary: string;
}

/**
 * Choix du modèle narrateur :
 * - eco : toujours le modèle rapide ;
 * - hybride : le modèle rapide pour les scènes courantes, le modèle fort pour les moments clés ;
 * - prestige : toujours le modèle fort.
 */
export type NarrationMode = "eco" | "hybride" | "prestige";

/** Vitesse à laquelle l'histoire avance. */
export type Pace = "pose" | "normal" | "rapide";

/** Scène en cours : un objectif dramatique, joué en quelques tours puis coupé. */
export interface Scene {
  title: string;
  goal: string;
  turns: number;
  planned: number;
}

export type SceneIntensity = "courante" | "forte";

export interface Routing {
  model: string;
  tier: "fast" | "strong";
  reason: string;
  /** Phase du jeu au moment de ce choix (pour repérer un changement de phase). */
  phase: PhaseId;
}

/** Résumé scellé d'un chapitre terminé. */
export interface ChapterArchive {
  title: string;
  summary: string;
}

export interface Usage {
  /** Nombre d'appels à l'API. */
  calls?: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costUsd: number;
}

/* ------------------------------------------------------------------ */
/* Effectif                                                            */
/* ------------------------------------------------------------------ */

export type OperativeStatus = "apte" | "en_mission" | "blesse" | "mort" | "disparu" | "retraite";

export type OperativeRole = "titulaire" | "officier" | "soutien" | "cadet";

export interface Operative {
  id: string;
  name: string;
  codename: string;
  agency: AgencyId;
  nationality: string;
  gender: Gender;
  age: number;
  rank: RankId;
  /** Sa place dans l'organisation. */
  role: OperativeRole;
  /** Siège au Cercle (titulaires). */
  seat?: string;
  /** Station d'affectation (officiers). */
  station?: string;
  /** Métier pour le personnel de soutien (pilote, technicienne…). */
  job?: string;
  /** Ses meilleures compétences (valeur totale, comme celles du joueur). */
  skills: Partial<Record<SkillId, number>>;
  trait: string;
  status: OperativeStatus;
  /** Fatigue (0 à 100). */
  fatigue: number;
  /** Ce qu'il pense du joueur (−100 à +100). */
  affinity: number;
  missionsWithPlayer: number;
  /** Dernière position connue et jour où elle l'a été. */
  cityId: string;
  positionDay: number;
  /** Jour de retour s'il est blessé ou en mission sans le joueur. */
  busyUntil?: number;
}

/* ------------------------------------------------------------------ */
/* Missions jouées par le moteur                                       */
/* ------------------------------------------------------------------ */

export type MissionKind = "standard" | "jeunesse" | "conjointe" | "contre_espionnage";

export type NodeType =
  | "approche"
  | "infiltration"
  | "social"
  | "renseignement"
  | "effraction"
  | "filature"
  | "poursuite"
  | "combat"
  | "piratage"
  | "dilemme"
  | "objectif"
  | "extraction"
  | "complication"
  | "secondaire";

export interface Risk {
  exposure: number;
  alert: number;
  health: number;
}

/** Conséquences d'une option de dilemme (sans dés). */
export interface DilemmaEffect {
  exposure?: number;
  alert?: number;
  intel?: number;
  merit?: number;
  morale?: number;
  /** Variation de la diplomatie avec l'autre agence concernée. */
  diplomacy?: number;
  /** Variation d'affinité de l'équipe. */
  team?: number;
  /** L'objectif est compromis (résultat au mieux partiel). */
  compromise?: boolean;
  /** L'option est jugée contraire aux Règles de Lucerne (risque de blâme). */
  rulebreak?: boolean;
}

export interface Approach {
  id: string;
  label: string;
  kind: "competence" | "gadget" | "equipier" | "choix";
  skill?: SkillId;
  difficulty?: Difficulty;
  /** Ce qui arrive en cas d'échec (moitié en réussite partielle). */
  risk: Risk;
  /** Renseignement gagné en cas de réussite. */
  intel?: number;
  /** Dépense sur les fonds d'opération. */
  cost?: number;
  /** Gadget utilisé (identifiant du catalogue) : une utilisation consommée. */
  gadget?: string;
  /** Équipier qui agit à la place du joueur. */
  operative?: string;
  /** Pour un dilemme. */
  effect?: DilemmaEffect;
}

export type NodeStatus = "a_venir" | "en_cours" | "reussi" | "partiel" | "echoue";

export interface MissionNode {
  type: NodeType;
  title: string;
  situation: string;
  approaches: Approach[];
  status: NodeStatus;
  attempts: number;
  /** L'étape de l'objectif. */
  key?: boolean;
  /** Autre itinéraire possible pour cette étape (au choix du joueur avant d'agir). */
  alt?: MissionNode;
}

export interface MissionStep {
  node: number;
  approach: string;
  outcome: CheckOutcome | "choix";
  summary: string;
}

export interface Mission {
  id: string;
  name: string;
  kind: MissionKind;
  importance: MissionImportance;
  template: string;
  region: string;
  cityId: string;
  faction: string;
  target: string;
  objective: string;
  /** Agence partenaire (opération conjointe) ou visée (contre-espionnage). */
  other?: AgencyId;
  /** Équipiers (identifiants de l'effectif). */
  team: string[];
  /** Agent qui encadre une Opération Jeunesse. */
  handler?: string;
  cover: string;
  nodes: MissionNode[];
  current: number;
  /** Jauges : exposition et alerte de 0 à 100, renseignement en points. */
  exposure: number;
  alert: number;
  intel: number;
  startDay: number;
  /** Actions jouées depuis le début de la mission. */
  turns: number;
  /** Soutiens déjà utilisés pendant cette mission (« seat » ou identifiant de Branche). */
  resourcesUsed: string[];
  history: MissionStep[];
  /** Phase de la mission : préparation (équipe, équipement), sur le terrain, terminée. */
  stage: "preparation" | "terrain" | "terminee";
  result?: MissionResult;
  /** L'objectif est compromis par un choix (résultat au mieux partiel). */
  compromised?: boolean;
  /** Couverture grillée (exposition à 100). */
  blown?: boolean;
  /** Légende utilisée (identifiant). */
  legend?: string;
  /** Menace visée, et ennemi nommé à affronter. */
  threat?: string;
  nemesis?: string;
  /** Mérite gagné par les objectifs secondaires. */
  bonusMerit?: number;
  /** Choix contraires aux Règles de Lucerne. */
  rulebreaks?: number;
  /** La proposition d'où vient la mission (pour y rattacher repérages et rapports). */
  offerId?: string;
}

/** Une mission terminée, telle qu'elle reste aux archives. */
export interface MissionRecord {
  id: string;
  offerId?: string;
  name: string;
  kind: MissionKind;
  importance: MissionImportance;
  result: MissionResult;
  city: string;
  country: string;
  region: string;
  faction: string;
  target: string;
  objective: string;
  cover: string;
  team: string[];
  startDay: number;
  endDay: number;
  steps: { title: string; status: NodeStatus; key?: boolean; secondary?: boolean; dilemma?: boolean }[];
  /** Ce que la hiérarchie en a retenu (bilan du moteur). */
  report: string[];
  exposure: number;
  blown?: boolean;
  /** Ennemi nommé affronté. */
  nemesis?: string;
}

export interface MissionOffer {
  id: string;
  kind: MissionKind;
  importance: MissionImportance;
  template: string;
  title: string;
  summary: string;
  region: string;
  cityId: string;
  faction: string;
  target: string;
  objective: string;
  other?: AgencyId;
  threat?: string;
  nemesis?: string;
  /** Assignée par la hiérarchie (pas de refus sans conséquence). */
  assigned: boolean;
  expiresDay: number;
}

/* ------------------------------------------------------------------ */
/* Vie hors mission                                                    */
/* ------------------------------------------------------------------ */

export type ActivityId =
  | "entrainement"
  | "repos"
  | "relation"
  | "couverture"
  | "branche"
  | "devoir"
  | "informateurs"
  | "escouade"
  | "antenne"
  | "loisirs"
  | "cours"
  | "theatre"
  | "agence"
  | "langue"
  | "legende"
  | "resister"
  | "evasion"
  | "attendre";

export interface ActivityChoice {
  activity: ActivityId;
  /** Compétence, relation, devoir, région… selon l'activité. */
  target?: string;
}

export interface Duty {
  id: string;
  title: string;
  description: string;
  /** Activité qui fait avancer ce devoir. */
  activity: ActivityId;
  dueDay: number;
  progress: number;
  required: number;
  penalty: { merit?: number; reputation?: number; cover?: number; morale?: number };
  status: "ouvert" | "fait" | "manque";
}

export interface WeekReport {
  day: number;
  lines: string[];
  /** Événement de la semaine, mis en scène par le narrateur. */
  event?: string;
}

/* ------------------------------------------------------------------ */
/* Commandement                                                        */
/* ------------------------------------------------------------------ */

export interface Asset {
  id: string;
  name: string;
  role: string;
  cityId: string;
  /** Coût par semaine, sur la solde. */
  cost: number;
  reliability: number;
  status: "actif" | "grille" | "retourne";
  recruitedDay: number;
}

export type StationModule = "planque" | "ecoutes" | "atelier" | "garage" | "infirmerie" | "salle_crise";

export interface Station {
  cityId: string;
  budget: number;
  modules: StationModule[];
  /** Renseignement accumulé par l'antenne sur sa région. */
  intel: number;
  /** Discrétion de l'antenne (0 à 100). */
  cover: number;
}

export interface Project {
  id: string;
  /** Gadget débloqué à la fin du projet. */
  gadget: string;
  progress: number;
  required: number;
}

export interface Theatre {
  region: string;
  budget: number;
  /** Villes des antennes du théâtre. */
  stations: string[];
  projects: Project[];
  /** Priorité : renseignement, action ou discrétion. */
  posture: "renseignement" | "action" | "discretion";
}

export type HqModule = "laboratoire" | "academie" | "salle_crise" | "hangar" | "infirmerie" | "archives";

export interface AgencyCommand {
  hq: Record<HqModule, number>;
  /** Budget mensuel par Branche (en millions d'euros). */
  branchBudget: Record<string, number>;
  /** Crédit auprès des gouvernements membres (0 à 100). */
  councilFavor: number;
}

export interface DelegatedOp {
  offerId: string;
  title: string;
  team: string[];
  returnDay: number;
  chance: number;
}

export interface Command {
  assets: Asset[];
  /** Escouade (identifiants de l'effectif). */
  squad: string[];
  station: Station | null;
  theatre: Theatre | null;
  agency: AgencyCommand | null;
  /** Gadgets débloqués par la recherche. */
  unlocked: string[];
  /** Le Directeur en place s'apprête à partir. */
  directorVacant?: boolean;
  /** Ce que chaque Branche pense de toi (−100 à +100). */
  branchFavor: Record<string, number>;
  /** Sièges du Cercle vacants, et depuis quand (« agence:siège »). */
  vacantSince: Record<string, number>;
  /** Missions confiées à d'autres. */
  delegated: DelegatedOp[];
  /** Renseignement préparé pour la prochaine mission. */
  intelStock: number;
  /** Faveurs du laboratoire : emplacements de gadgets en plus à la prochaine mission. */
  labFavor: number;
}

/* ------------------------------------------------------------------ */
/* Renseignement : ce que le personnage sait                           */
/* ------------------------------------------------------------------ */

export type IntelRequestKind = "reperages" | "menace" | "region" | "agent" | "faction" | "cercle";

/** À qui l'on pose la question. */
export type SourceKind = "analyse" | "hierarchie" | "relation" | "informateur" | "rival" | "courtier" | "presse";

/** Une question posée à une source : la réponse arrive après quelques jours, plus ou moins fiable. */
export interface IntelRequest {
  id: string;
  kind: IntelRequestKind;
  /** Mission proposée, menace, région, agent, faction ou agence visée. */
  target: string;
  /** Libellé lisible de la cible, figé au dépôt. */
  label: string;
  filedDay: number;
  readyDay: number;
  source: SourceKind;
  /** La source précise : nom d'une relation, informateur, agent, courtier. */
  sourceRef?: string;
  sourceLabel: string;
  /** Cotation à la manière des services : fiabilité de la source (A à E) et crédibilité de l'information (1 à 5). */
  grade: string;
  /** Ce que la question a coûté, en clair. */
  cost: string;
  /** Décidé au dépôt, jamais montré : la source dira-t-elle vrai ? */
  truthful: boolean;
  /** Mission proposée à laquelle la réponse se rattache. */
  offerId?: string;
}

export interface Knowledge {
  /** Rapports régionaux reçus : région → jour du rapport (ils vieillissent). */
  regions: Record<string, number>;
  /** Fiches d'agents consultées. */
  operatives: string[];
  /** Profils de factions ouverts. */
  factions: string[];
  /** Repérages faits pour une mission proposée : ses étapes, connues d'avance. */
  recon: Record<string, MissionNode[]>;
  /** Menaces étudiées : renseignement de départ en plus pour une mission contre elles. */
  threats: Record<string, number>;
  /** Demandes en cours. */
  requests: IntelRequest[];
  /** Agences rivales dont on a percé le Cercle. */
  circles: AgencyId[];
}

export interface GameState {
  version: 4;
  id: string;
  createdAt: number;
  updatedAt: number;
  character: Character;
  world: World;
  relations: Relation[];
  journal: string[];
  /** Faits du carnet résolus (mystère élucidé, promesse tenue…), sortis du contexte du narrateur. */
  journalResolved: string[];
  dossier: Dossier | null;
  /** Mémoire longue : résumé de toute la campagne au-delà des archives récentes. */
  saga: string;
  /** Mémoire moyenne : un résumé par chapitre terminé. */
  archives: ChapterArchive[];
  /** Mémoire courte : résumé glissant du chapitre en cours. */
  chronicle: string;
  /** Chapitre auquel se rapporte `chronicle`. */
  chronicleChapter: string;
  /** Nombre d'entrées du journal déjà condensées dans la chronique. */
  chronicleUpTo: number;
  /** Notes secrètes du narrateur. Jamais montrées au joueur. */
  gmNotes: string;
  log: LogEntry[];
  choices: Choice[];
  settings: { narration: NarrationMode; pace: Pace; span?: number | "auto" };
  scene: Scene | null;
  /** Tours joués depuis le début de la phase en cours. */
  phaseTurns: number;
  /** Tours joués depuis le début du chapitre en cours. */
  chapterTurns: number;
  /** Intrigue courte (rare, une seule à la fois), à la vérité fixée dès l'ouverture. */
  intrigue: { title: string; question: string; answer: string; turns: number; planned: number } | null;
  /** Mission en cours. */
  mission: Mission | null;
  /** Dernière mission terminée (pour son bilan). */
  lastMission: Mission | null;
  /** Missions proposées par la hiérarchie. */
  offers: MissionOffer[];
  /** Agents de l'agence du joueur et des deux autres. */
  roster: Operative[];
  /** Devoirs en cours. */
  duties: Duty[];
  /** Dernier bilan de semaine. */
  lastWeek: WeekReport | null;
  /** Ce que le joueur gère selon son grade. */
  command: Command;
  /** Intensité annoncée par le narrateur pour le tour suivant. */
  nextIntensity: SceneIntensity;
  /** Dernier choix de modèle (pour garder le même tant que son cache est chaud). */
  routing: Routing | null;
  /** Historique de la progression du personnage. */
  progress: ProgressEntry[];
  /** Pièces montrées par le narrateur, gardées dans le carnet (les plus récentes en dernier). */
  pieces: StoryDoc[];
  /** Ce que le personnage sait au-delà de son accréditation : rapports, fiches, repérages, demandes en cours. */
  knowledge: Knowledge;
  /** Toutes les missions terminées, pour les archives. */
  missionLog: MissionRecord[];
  /** Consommation cumulée de l'API sur la partie. */
  usage: Usage & { turns: number };
}

/**
 * Ce qui circule entre client et serveur : l'état complet, sauf que `log`
 * ne contient que les entrées pas encore condensées dans la chronique.
 */
export type WireState = GameState;

export type PlayerAction =
  | { type: "start" }
  | { type: "advance" }
  | { type: "choice"; text: string }
  | { type: "free"; text: string }
  /** Recontacter une relation (appel, message, rendez-vous). */
  | { type: "contact"; name: string; intent: string }
  /** Utiliser un objet de l'inventaire. */
  | { type: "use"; item: string; how: string }
  /** Coup signature du siège, ou soutien d'une Branche, pendant une mission. */
  | { type: "resource"; source: string }
  /** Jouer une semaine planifiée (trois créneaux). */
  | { type: "week"; plan: ActivityChoice[]; span?: number | "auto" }
  /** Accepter une mission et la préparer (équipe, équipement, couverture). */
  | { type: "mission_start"; offer: string; team: string[]; gadgets: string[]; legend?: string }
  /** Choisir une approche à l'étape en cours d'une mission. */
  | { type: "node"; approach: string; intel: number }
  /** Tenter autre chose à l'étape en cours (arbitré par le narrateur). */
  | { type: "node_free"; text: string }
  /** Demander une promotion (choisie par le joueur) : siège pour un titulaire, Station pour un officier ou un chef de station. */
  | { type: "promotion"; rank: RankId; seat?: string; station?: string };

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "check"; check: CheckResult }
  | { type: "event"; text: string }
  /** Carte du jeu ou pièce du narrateur, à insérer dans le récit. */
  | { type: "segment"; segment: Extract<Segment, { kind: "card" | "doc" }> }
  | { type: "choices"; choices: Choice[] }
  | { type: "reinterpreted"; text: string; reason: string }
  | { type: "rejected"; reason: string; suggestion: string }
  | { type: "usage"; usage: Usage }
  | { type: "routing"; routing: Routing }
  /** Une tentative a échoué et va être relancée : les segments affichés reviennent à cet état. */
  | { type: "rollback"; segments: Segment[] }
  | { type: "state"; state: WireState }
  | { type: "error"; message: string }
  | { type: "done" };
