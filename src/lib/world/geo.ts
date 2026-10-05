/**
 * Géographie du monde de LUCERNE : le nôtre en 2026, avec quelques différences.
 * Les identifiants de pays sont les codes ISO numériques de la carte Natural Earth
 * (world-atlas) ; les entités qui n'y existent pas ont un code à trois lettres.
 */

export type BlocId = "argos" | "meridian" | "monsoon" | "hostile" | "gris" | "neutre";

export type RegionId =
  | "europe"
  | "est"
  | "arctique"
  | "mediterranee"
  | "moyen_orient"
  | "sahel"
  | "afrique"
  | "amerique_nord"
  | "amerique_latine"
  | "russie"
  | "asie_est"
  | "asie_sud"
  | "asie_sud_est"
  | "oceanie";

export type ResourceId =
  | "petrole"
  | "gaz"
  | "terres_rares"
  | "uranium"
  | "lithium"
  | "semi_conducteurs"
  | "finance"
  | "ports"
  | "armement"
  | "cyber"
  | "agriculture"
  | "or";

export const BLOCS: Record<BlocId, { label: string; color: string; description: string }> = {
  argos: { label: "ARGOS", color: "var(--agency-argos)", description: "Pays membres d'ARGOS : l'Europe." },
  meridian: { label: "MERIDIAN", color: "var(--agency-meridian)", description: "Pays membres de MERIDIAN : les États-Unis et leurs alliés du Pacifique." },
  monsoon: { label: "MONSOON", color: "var(--agency-monsoon)", description: "Pays membres de MONSOON : les non-alignés." },
  hostile: { label: "Hors Concordat", color: "var(--bloc-hostile)", description: "Puissances hostiles aux trois agences, avec leurs propres services." },
  gris: { label: "Zone grise", color: "var(--bloc-gris)", description: "États faillis, nouveaux États, zones franches : personne n'y fait la loi." },
  neutre: { label: "Neutre", color: "var(--bloc-neutre)", description: "Pays hors des trois blocs, courtisés par tous." },
};

export const RESOURCES: Record<ResourceId, { label: string; icon: string }> = {
  petrole: { label: "Pétrole", icon: "⬣" },
  gaz: { label: "Gaz", icon: "◌" },
  terres_rares: { label: "Terres rares", icon: "✶" },
  uranium: { label: "Uranium", icon: "☢" },
  lithium: { label: "Lithium", icon: "ϟ" },
  semi_conducteurs: { label: "Semi-conducteurs", icon: "▦" },
  finance: { label: "Finance", icon: "€" },
  ports: { label: "Ports stratégiques", icon: "⚓" },
  armement: { label: "Armement", icon: "⌖" },
  cyber: { label: "Cyber", icon: "⌁" },
  agriculture: { label: "Agriculture", icon: "❦" },
  or: { label: "Or et minerais", icon: "◆" },
};

export interface RegionDef {
  label: string;
  /** Tension de départ (0 à 100). */
  tension: number;
  /** Ce qui s'y joue. */
  stakes: string;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  europe: { label: "Europe de l'Ouest", tension: 30, stakes: "Ingérences, sabotages d'infrastructures, finance offshore, terrorisme." },
  est: { label: "Europe de l'Est et Baltique", tension: 75, stakes: "Guerre gelée en Ukraine, câbles sous-marins sabotés, Kaliningrad, désinformation." },
  arctique: { label: "Arctique", tension: 55, stakes: "Groenland indépendant et ses terres rares, routes polaires, Svalbard, sous-marins." },
  mediterranee: { label: "Méditerranée et Afrique du Nord", tension: 50, stakes: "Libye fracturée, trafics, gazoducs, double jeu turc." },
  moyen_orient: { label: "Moyen-Orient et Golfe", tension: 80, stakes: "Programme iranien, détroit d'Ormuz, fonds souverains, Néom." },
  sahel: { label: "Sahel et Afrique de l'Ouest", tension: 70, stakes: "Confédération du Sahel, mercenaires, mines d'or et d'uranium, otages." },
  afrique: { label: "Afrique de l'Est, centrale et australe", tension: 45, stakes: "Mer Rouge, Corne de l'Afrique, minerais du Congo, ports chinois." },
  amerique_nord: { label: "Amérique du Nord", tension: 30, stakes: "Géants de la tech, cartels à la frontière, cyberattaques, élections." },
  amerique_latine: { label: "Amérique latine et Caraïbes", tension: 45, stakes: "Cartels, lithium, Amazonie, Venezuela, blanchiment." },
  russie: { label: "Russie et Asie centrale", tension: 65, stakes: "Une Russie amputée et imprévisible, l'Extrême-Orient sécessionniste, gaz d'Asie centrale." },
  asie_est: { label: "Asie de l'Est", tension: 75, stakes: "Mer de Chine, Taïwan, semi-conducteurs, missiles nord-coréens." },
  asie_sud: { label: "Asie du Sud", tension: 50, stakes: "Inde et Pakistan, cyber, eau de l'Himalaya, Afghanistan." },
  asie_sud_est: { label: "Asie du Sud-Est", tension: 55, stakes: "Détroit de Malacca, Nouvelle-Atlantide, piraterie, arnaques en ligne industrielles." },
  oceanie: { label: "Océanie et Pacifique", tension: 25, stakes: "Câbles du Pacifique, îles courtisées, bases navales." },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export interface CountryDef {
  /** Code de la carte (ISO numérique) ou code à trois lettres pour une entité nouvelle. */
  id: string;
  name: string;
  region: RegionId;
  bloc: BlocId;
  /** Stabilité intérieure (0 = chaos, 100 = parfaitement stable). */
  stability: number;
  resources: ResourceId[];
  /** Ce qui diffère de notre monde. */
  note?: string;
  /** Formes de la carte qui composent cette entité (par défaut : son propre id). */
  mapIds?: string[];
  /** Entité sans forme à cette échelle : marqueur à ces coordonnées (lat, lon). */
  marker?: [number, number];
}

type Row = [id: string, name: string, region: RegionId, bloc: BlocId, stability: number, resources: ResourceId[], note?: string];

const ROWS: Row[] = [
  // ARGOS — Europe
  ["250", "France", "europe", "argos", 72, ["armement", "uranium", "finance", "agriculture"]],
  ["276", "Allemagne", "europe", "argos", 75, ["semi_conducteurs", "armement", "finance"]],
  ["380", "Italie", "europe", "argos", 62, ["ports", "finance"]],
  ["724", "Espagne", "europe", "argos", 68, ["ports", "agriculture"]],
  ["620", "Portugal", "europe", "argos", 74, ["ports", "lithium"]],
  ["826", "Royaume-Uni", "europe", "argos", 66, ["finance", "armement", "cyber"], "Amputé de l'Écosse en 2025, il siège à ARGOS tout en renseignant discrètement MERIDIAN : la faille la plus surveillée d'Europe."],
  ["372", "Irlande", "europe", "argos", 82, ["cyber", "finance"]],
  ["056", "Belgique", "europe", "argos", 70, ["finance", "ports"]],
  ["528", "Pays-Bas", "europe", "argos", 78, ["semi_conducteurs", "ports"]],
  ["442", "Luxembourg", "europe", "argos", 90, ["finance"]],
  ["756", "Suisse", "europe", "argos", 92, ["finance"], "Neutre en façade, elle abrite l'Olympe, le siège d'ARGOS, sous un massif près de Lucerne."],
  ["040", "Autriche", "europe", "argos", 82, ["finance"]],
  ["208", "Danemark", "europe", "argos", 85, ["ports"]],
  ["203", "Tchéquie", "europe", "argos", 76, ["armement"]],
  ["703", "Slovaquie", "europe", "argos", 64, ["armement"]],
  ["348", "Hongrie", "europe", "argos", 55, ["agriculture"], "Membre réticent d'ARGOS, soupçonné de laisser fuiter vers Moscou."],
  ["705", "Slovénie", "europe", "argos", 80, []],
  ["191", "Croatie", "mediterranee", "argos", 72, ["ports"]],
  ["300", "Grèce", "mediterranee", "argos", 64, ["ports"]],
  ["196", "Chypre", "mediterranee", "argos", 60, ["finance", "gaz"]],
  ["642", "Roumanie", "est", "argos", 63, ["gaz", "agriculture"]],
  ["100", "Bulgarie", "est", "argos", 58, ["ports"]],
  ["616", "Pologne", "est", "argos", 70, ["armement", "agriculture"]],
  ["440", "Lituanie", "est", "argos", 68, []],
  ["428", "Lettonie", "est", "argos", 66, ["ports"]],
  ["233", "Estonie", "est", "argos", 74, ["cyber"]],
  ["804", "Ukraine", "est", "argos", 30, ["agriculture", "armement", "terres_rares"], "Membre associé d'ARGOS depuis 2023. La guerre est gelée sur une ligne de front fortifiée ; rien n'est réglé."],
  ["752", "Suède", "arctique", "argos", 84, ["armement", "or"]],
  ["246", "Finlande", "arctique", "argos", 86, ["armement", "or"]],
  ["578", "Norvège", "arctique", "argos", 88, ["petrole", "gaz", "ports"]],
  ["352", "Islande", "arctique", "argos", 90, ["ports"]],

  // MERIDIAN — États-Unis et alliés du Pacifique
  ["840", "États-Unis", "amerique_nord", "meridian", 58, ["finance", "cyber", "armement", "petrole", "semi_conducteurs"], "Première puissance du monde, plus divisée que jamais : MERIDIAN est le seul de ses services que les deux camps respectent encore."],
  ["124", "Canada", "amerique_nord", "meridian", 82, ["petrole", "uranium", "or"]],
  ["630", "Porto Rico", "amerique_latine", "meridian", 60, ["ports"]],
  ["036", "Australie", "oceanie", "meridian", 84, ["uranium", "lithium", "terres_rares", "or"]],
  ["554", "Nouvelle-Zélande", "oceanie", "meridian", 90, ["agriculture"]],
  ["392", "Japon", "asie_est", "meridian", 86, ["semi_conducteurs", "finance", "cyber"]],
  ["410", "Corée du Sud", "asie_est", "meridian", 74, ["semi_conducteurs", "armement"]],
  ["608", "Philippines", "asie_sud_est", "meridian", 48, ["ports"]],
  ["032", "Argentine", "amerique_latine", "meridian", 45, ["lithium", "agriculture"], "Ralliée à MERIDIAN en 2025, au grand dam de ses voisins."],

  // MONSOON — non-alignés
  ["356", "Inde", "asie_sud", "monsoon", 62, ["cyber", "armement", "agriculture"], "Le pilier de MONSOON : non alignée, elle traite avec tout le monde et ne se soumet à personne."],
  ["360", "Indonésie", "asie_sud_est", "monsoon", 60, ["petrole", "or", "ports"]],
  ["458", "Malaisie", "asie_sud_est", "monsoon", 66, ["semi_conducteurs", "ports"]],
  ["704", "Vietnam", "asie_sud_est", "monsoon", 64, ["agriculture", "terres_rares"]],
  ["764", "Thaïlande", "asie_sud_est", "monsoon", 55, ["agriculture"]],
  ["784", "Émirats arabes unis", "moyen_orient", "monsoon", 82, ["finance", "petrole"]],
  ["682", "Arabie saoudite", "moyen_orient", "monsoon", 68, ["petrole", "finance"]],
  ["634", "Qatar", "moyen_orient", "monsoon", 84, ["gaz", "finance"]],
  ["792", "Turquie", "mediterranee", "monsoon", 50, ["armement", "ports"], "A quitté l'OTAN de fait en 2025 pour rejoindre MONSOON : elle garde les détroits et vend ses drones à qui paie."],
  ["818", "Égypte", "mediterranee", "monsoon", 48, ["ports", "gaz"]],
  ["076", "Brésil", "amerique_latine", "monsoon", 52, ["agriculture", "petrole", "lithium", "or"]],
  ["484", "Mexique", "amerique_nord", "monsoon", 38, ["petrole", "agriculture"], "Excédé par les pressions de Washington, il a rejoint MONSOON en 2025. Les cartels n'ont pas changé de camp."],
  ["710", "Afrique du Sud", "afrique", "monsoon", 50, ["or", "uranium", "terres_rares"]],
  ["566", "Nigeria", "sahel", "monsoon", 40, ["petrole", "gaz"]],
  ["404", "Kenya", "afrique", "monsoon", 55, ["ports", "agriculture"]],

  // Hors Concordat
  ["643", "Russie", "russie", "hostile", 40, ["gaz", "petrole", "armement", "uranium", "cyber"], "Amputée de son Extrême-Orient depuis 2025, plus imprévisible que jamais. Ses services (SVR, GRU) sont l'ennemi numéro un d'ARGOS."],
  ["156", "Chine", "asie_est", "hostile", 70, ["terres_rares", "semi_conducteurs", "cyber", "armement", "ports"], "Hors Concordat, rivale de MERIDIAN, partenaire commercial de MONSOON. Son ministère de la Sécurité d'État est le service le plus nombreux du monde."],
  ["364", "Iran", "moyen_orient", "hostile", 42, ["petrole", "gaz", "uranium"]],
  ["408", "Corée du Nord", "asie_est", "hostile", 55, ["cyber", "armement"]],
  ["112", "Biélorussie", "est", "hostile", 50, ["armement"]],
  ["SAH", "Confédération du Sahel", "sahel", "hostile", 25, ["or", "uranium"], "Mali, Burkina Faso et Niger ont fusionné en 2025 sous une junte unique, protégée par des mercenaires russes. Mines d'or et d'uranium, otages, trafics."],
  ["862", "Venezuela", "amerique_latine", "hostile", 25, ["petrole", "or"]],

  // Zones grises et entités nouvelles
  ["304", "Groenland", "arctique", "gris", 60, ["terres_rares", "uranium", "ports"], "Indépendant depuis le référendum de 2026 (Kalaallit Nunaat). Ses terres rares et ses fjords militaires sont disputés entre ARGOS et MERIDIAN."],
  ["EXO", "République d'Extrême-Orient", "russie", "gris", 20, ["ports", "armement", "or"], "Vladivostok et Khabarovsk ont fait sécession en 2025 : un État-marché noir tenu par d'anciens généraux et des oligarques, carrefour de tous les trafics du Pacifique."],
  ["SVA", "Zone franche du Svalbard", "arctique", "gris", 70, ["cyber"], "Zone franche internationale depuis 2025 : chercheurs, mineurs, espions de toutes les agences, et la plus grande banque de données du monde sous le permafrost."],
  ["NEO", "Cité-charte de Néom", "moyen_orient", "gris", 75, ["finance", "cyber"], "Ville-laboratoire autonome sur la mer Rouge : ses lois sont écrites par ses investisseurs, et personne n'y pose de questions."],
  ["ATL", "Nouvelle-Atlantide", "asie_sud_est", "gris", 65, ["finance", "cyber"], "Île-État flottante amarrée en mer de Sulu, fondée en 2024 par le milliardaire Elias Varn : paradis fiscal, laboratoires sans éthique, aucun traité signé."],
  ["434", "Libye", "mediterranee", "gris", 15, ["petrole", "ports"]],
  ["887", "Yémen", "moyen_orient", "gris", 10, ["ports"]],
  ["706", "Somalie", "afrique", "gris", 12, ["ports"]],
  ["760", "Syrie", "moyen_orient", "gris", 22, []],
  ["004", "Afghanistan", "asie_sud", "gris", 18, ["lithium"]],
  ["104", "Myanmar", "asie_sud_est", "gris", 18, ["terres_rares"]],
  ["729", "Soudan", "afrique", "gris", 10, ["or"]],
  ["332", "Haïti", "amerique_latine", "gris", 8, []],

  // Micro-États et entités sans forme sur la carte
  ["SCO", "Écosse", "europe", "argos", 80, ["petrole", "ports"], "Indépendante depuis le référendum de 2025 et membre d'ARGOS à part entière. Édimbourg accueille son antenne nordique."],
  ["SGP", "Singapour", "asie_sud_est", "monsoon", 92, ["finance", "ports", "cyber"], "Cité-État au carrefour de tout : le Phare, siège de MONSOON, est amarré au large de ses côtes."],
  ["MLT", "Malte", "mediterranee", "argos", 72, ["finance", "ports"]],
  ["MCO", "Monaco", "europe", "argos", 90, ["finance"]],
  // Neutres
  ["158", "Taïwan", "asie_est", "neutre", 72, ["semi_conducteurs"]],
  ["376", "Israël", "moyen_orient", "neutre", 52, ["cyber", "armement"]],
  ["586", "Pakistan", "asie_sud", "neutre", 38, ["armement"]],
  ["050", "Bangladesh", "asie_sud", "neutre", 45, ["agriculture"]],
  ["144", "Sri Lanka", "asie_sud", "neutre", 52, ["ports"]],
  ["524", "Népal", "asie_sud", "neutre", 55, []],
  ["064", "Bhoutan", "asie_sud", "neutre", 80, []],
  ["496", "Mongolie", "asie_est", "neutre", 62, ["terres_rares", "or"]],
  ["398", "Kazakhstan", "russie", "neutre", 60, ["uranium", "petrole"]],
  ["860", "Ouzbékistan", "russie", "neutre", 55, ["or", "gaz"]],
  ["795", "Turkménistan", "russie", "neutre", 50, ["gaz"]],
  ["762", "Tadjikistan", "russie", "neutre", 45, []],
  ["417", "Kirghizistan", "russie", "neutre", 48, ["or"]],
  ["268", "Géorgie", "moyen_orient", "neutre", 50, ["ports"]],
  ["051", "Arménie", "moyen_orient", "neutre", 52, []],
  ["031", "Azerbaïdjan", "moyen_orient", "neutre", 54, ["petrole", "gaz"]],
  ["368", "Irak", "moyen_orient", "neutre", 30, ["petrole"]],
  ["400", "Jordanie", "moyen_orient", "neutre", 62, []],
  ["422", "Liban", "moyen_orient", "neutre", 25, ["finance"]],
  ["275", "Palestine", "moyen_orient", "neutre", 10, []],
  ["414", "Koweït", "moyen_orient", "neutre", 75, ["petrole"]],
  ["512", "Oman", "moyen_orient", "neutre", 78, ["ports", "petrole"]],
  ["498", "Moldavie", "est", "neutre", 45, []],
  ["688", "Serbie", "mediterranee", "neutre", 55, []],
  ["070", "Bosnie-Herzégovine", "mediterranee", "neutre", 45, []],
  ["499", "Monténégro", "mediterranee", "neutre", 58, ["ports"]],
  ["807", "Macédoine du Nord", "mediterranee", "neutre", 58, []],
  ["008", "Albanie", "mediterranee", "neutre", 56, ["ports"]],
  ["504", "Maroc", "mediterranee", "neutre", 66, ["agriculture", "ports"]],
  ["012", "Algérie", "mediterranee", "neutre", 55, ["gaz", "petrole"]],
  ["788", "Tunisie", "mediterranee", "neutre", 52, []],
  ["732", "Sahara occidental", "mediterranee", "neutre", 35, []],
  ["478", "Mauritanie", "sahel", "neutre", 45, ["or"]],
  ["686", "Sénégal", "sahel", "neutre", 66, ["ports", "gaz"]],
  ["270", "Gambie", "sahel", "neutre", 55, []],
  ["624", "Guinée-Bissau", "sahel", "neutre", 30, []],
  ["324", "Guinée", "sahel", "neutre", 35, ["or"]],
  ["694", "Sierra Leone", "sahel", "neutre", 45, ["or"]],
  ["430", "Liberia", "sahel", "neutre", 45, []],
  ["384", "Côte d'Ivoire", "sahel", "neutre", 60, ["agriculture", "ports"]],
  ["288", "Ghana", "sahel", "neutre", 65, ["or"]],
  ["768", "Togo", "sahel", "neutre", 52, ["ports"]],
  ["204", "Bénin", "sahel", "neutre", 55, ["ports"]],
  ["148", "Tchad", "sahel", "neutre", 28, ["petrole"]],
  ["120", "Cameroun", "afrique", "neutre", 40, ["petrole"]],
  ["140", "Centrafrique", "afrique", "neutre", 12, ["or"]],
  ["728", "Soudan du Sud", "afrique", "neutre", 12, ["petrole"]],
  ["231", "Éthiopie", "afrique", "neutre", 38, ["agriculture"]],
  ["232", "Érythrée", "afrique", "neutre", 35, ["ports"]],
  ["262", "Djibouti", "afrique", "neutre", 55, ["ports"]],
  ["800", "Ouganda", "afrique", "neutre", 50, ["petrole"]],
  ["646", "Rwanda", "afrique", "neutre", 66, ["or"]],
  ["108", "Burundi", "afrique", "neutre", 35, []],
  ["834", "Tanzanie", "afrique", "neutre", 58, ["ports", "or"]],
  ["180", "RD Congo", "afrique", "neutre", 18, ["or", "terres_rares", "lithium"]],
  ["178", "Congo", "afrique", "neutre", 45, ["petrole"]],
  ["266", "Gabon", "afrique", "neutre", 48, ["petrole", "uranium"]],
  ["226", "Guinée équatoriale", "afrique", "neutre", 40, ["petrole"]],
  ["024", "Angola", "afrique", "neutre", 45, ["petrole", "or"]],
  ["894", "Zambie", "afrique", "neutre", 58, ["or"]],
  ["454", "Malawi", "afrique", "neutre", 55, []],
  ["508", "Mozambique", "afrique", "neutre", 35, ["gaz", "ports"]],
  ["716", "Zimbabwe", "afrique", "neutre", 40, ["lithium", "or"]],
  ["072", "Botswana", "afrique", "neutre", 72, ["or"]],
  ["516", "Namibie", "afrique", "neutre", 68, ["uranium"]],
  ["426", "Lesotho", "afrique", "neutre", 55, []],
  ["748", "Eswatini", "afrique", "neutre", 50, []],
  ["450", "Madagascar", "afrique", "neutre", 42, ["terres_rares"]],
  ["320", "Guatemala", "amerique_latine", "neutre", 40, []],
  ["084", "Belize", "amerique_latine", "neutre", 55, []],
  ["340", "Honduras", "amerique_latine", "neutre", 32, []],
  ["222", "Salvador", "amerique_latine", "neutre", 50, []],
  ["558", "Nicaragua", "amerique_latine", "neutre", 35, []],
  ["188", "Costa Rica", "amerique_latine", "neutre", 75, []],
  ["591", "Panama", "amerique_latine", "neutre", 62, ["ports", "finance"]],
  ["192", "Cuba", "amerique_latine", "neutre", 40, []],
  ["388", "Jamaïque", "amerique_latine", "neutre", 55, []],
  ["214", "République dominicaine", "amerique_latine", "neutre", 60, []],
  ["044", "Bahamas", "amerique_latine", "neutre", 70, ["finance"]],
  ["780", "Trinité-et-Tobago", "amerique_latine", "neutre", 60, ["gaz"]],
  ["170", "Colombie", "amerique_latine", "neutre", 45, ["petrole", "or"]],
  ["218", "Équateur", "amerique_latine", "neutre", 35, ["petrole"]],
  ["604", "Pérou", "amerique_latine", "neutre", 45, ["or"]],
  ["068", "Bolivie", "amerique_latine", "neutre", 40, ["lithium"]],
  ["152", "Chili", "amerique_latine", "neutre", 68, ["lithium", "or"]],
  ["600", "Paraguay", "amerique_latine", "neutre", 55, ["agriculture"]],
  ["858", "Uruguay", "amerique_latine", "neutre", 80, ["agriculture"]],
  ["328", "Guyana", "amerique_latine", "neutre", 55, ["petrole"]],
  ["740", "Suriname", "amerique_latine", "neutre", 50, ["or"]],
  ["238", "Malouines", "amerique_latine", "neutre", 80, ["petrole"]],
  ["116", "Cambodge", "asie_sud_est", "neutre", 45, []],
  ["418", "Laos", "asie_sud_est", "neutre", 50, []],
  ["096", "Brunei", "asie_sud_est", "neutre", 80, ["petrole"]],
  ["626", "Timor oriental", "asie_sud_est", "neutre", 50, ["petrole"]],
  ["598", "Papouasie-Nouvelle-Guinée", "oceanie", "neutre", 35, ["or", "gaz"]],
  ["090", "Îles Salomon", "oceanie", "neutre", 45, []],
  ["548", "Vanuatu", "oceanie", "neutre", 60, []],
  ["242", "Fidji", "oceanie", "neutre", 62, ["ports"]],
  ["540", "Nouvelle-Calédonie", "oceanie", "argos", 45, ["or"]],
  ["260", "Terres australes françaises", "oceanie", "argos", 90, []],
  ["010", "Antarctique", "oceanie", "neutre", 90, []],
];

const MARKERS: Record<string, [number, number]> = {
  SCO: [56.5, -4.2],
  SGP: [1.35, 103.82],
  MLT: [35.9, 14.45],
  MCO: [43.74, 7.42],
  SVA: [78.2, 16.0],
  NEO: [28.0, 35.2],
  ATL: [8.0, 120.5],
};

const seen = new Set<string>();
export const COUNTRIES: CountryDef[] = ROWS.filter(([id]) => (seen.has(id) ? false : (seen.add(id), true))).map(
  ([id, name, region, bloc, stability, resources, note]) => ({
    id,
    name,
    region,
    bloc,
    stability,
    resources,
    note,
    ...(id === "SAH" ? { mapIds: ["466", "854", "562"] } : {}),
    ...(MARKERS[id] ? { marker: MARKERS[id] } : {}),
  }),
);

const BY_ID = new Map(COUNTRIES.map((c) => [c.id, c]));
/** Code de forme de la carte → entité (la Confédération du Sahel regroupe trois formes). */
const BY_MAP_ID = new Map<string, CountryDef>();
for (const c of COUNTRIES) for (const m of c.mapIds ?? [c.id]) BY_MAP_ID.set(m, c);

export const findCountry = (id: string) => BY_ID.get(id);
export const countryOfShape = (mapId: string) => BY_MAP_ID.get(mapId);
export const findCountryByName = (name: string) => {
  const n = normalize(name);
  return COUNTRIES.find((c) => normalize(c.name) === n);
};

/** Contour approximatif de la République d'Extrême-Orient (lon, lat), dessiné par-dessus la Russie. */
export const FAR_EAST_OUTLINE: [number, number][] = [
  [130.5, 42.4],
  [131.2, 43.2],
  [133.2, 45.0],
  [134.7, 47.7],
  [130.7, 48.9],
  [127.6, 49.8],
  [125.0, 53.2],
  [121.3, 53.4],
  [120.5, 55.8],
  [124.0, 58.5],
  [134.0, 61.0],
  [150.0, 62.5],
  [160.0, 65.5],
  [180.0, 66.0],
  [180.0, 61.0],
  [163.0, 57.5],
  [156.5, 51.0],
  [155.5, 56.0],
  [142.0, 59.2],
  [140.5, 53.5],
  [138.5, 47.0],
];

/* ------------------------------------------------------------------ */
/* Villes                                                              */
/* ------------------------------------------------------------------ */

export type CityTag = "capitale" | "port" | "finance" | "tech" | "academie" | "qg" | "secret";

export interface CityDef {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  tags?: CityTag[];
}

type CityRow = [id: string, name: string, country: string, lat: number, lon: number, tags?: CityTag[]];

const CITY_ROWS: CityRow[] = [
  // Lieux des agences
  ["olympe", "L'Olympe (Alpes suisses)", "756", 46.82, 8.42, ["qg", "secret"]],
  ["melea", "Méléa (mer Égée)", "300", 37.05, 25.45, ["academie", "secret"]],
  ["halcyon", "Halcyon (fosse d'Hawaï)", "840", 20.6, -158.6, ["qg", "secret"]],
  ["northwatch", "Northwatch (Rocheuses)", "124", 51.4, -116.2, ["academie", "secret"]],
  ["phare", "Le Phare (au large de Singapour)", "SGP", 1.18, 104.15, ["qg", "secret"]],
  ["senja", "Senja (îles Natuna)", "360", 4.0, 108.2, ["academie", "secret"]],
  // Europe
  ["paris", "Paris", "250", 48.86, 2.35, ["capitale", "finance"]],
  ["marseille", "Marseille", "250", 43.3, 5.37, ["port"]],
  ["lyon", "Lyon", "250", 45.76, 4.84],
  ["toulouse", "Toulouse", "250", 43.6, 1.44, ["tech"]],
  ["hambourg", "Hambourg", "276", 53.55, 9.99, ["port"]],
  ["naples", "Naples", "380", 40.85, 14.27, ["port"]],
  ["manchester", "Manchester", "826", 53.48, -2.24],
  ["porto", "Porto", "620", 41.15, -8.61, ["port"]],
  ["cracovie", "Cracovie", "616", 50.06, 19.94],
  ["budapest", "Budapest", "348", 47.5, 19.04, ["capitale"]],
  ["londres", "Londres", "826", 51.51, -0.13, ["capitale", "finance"]],
  ["edimbourg", "Édimbourg", "SCO", 55.95, -3.19, ["capitale"]],
  ["berlin", "Berlin", "276", 52.52, 13.4, ["capitale", "tech"]],
  ["munich", "Munich", "276", 48.14, 11.58, ["tech"]],
  ["bruxelles", "Bruxelles", "056", 50.85, 4.35, ["capitale"]],
  ["amsterdam", "Amsterdam", "528", 52.37, 4.9, ["port", "finance"]],
  ["geneve", "Genève", "756", 46.2, 6.14, ["finance"]],
  ["lucerne", "Lucerne", "756", 47.05, 8.31],
  ["zurich", "Zurich", "756", 47.37, 8.54, ["finance"]],
  ["davos", "Davos", "756", 46.8, 9.84],
  ["monaco", "Monaco", "MCO", 43.74, 7.42, ["finance"]],
  ["milan", "Milan", "380", 45.46, 9.19, ["finance"]],
  ["rome", "Rome", "380", 41.9, 12.5, ["capitale"]],
  ["venise", "Venise", "380", 45.44, 12.33, ["port"]],
  ["madrid", "Madrid", "724", 40.42, -3.7, ["capitale"]],
  ["barcelone", "Barcelone", "724", 41.39, 2.17, ["port"]],
  ["lisbonne", "Lisbonne", "620", 38.72, -9.14, ["capitale", "port"]],
  ["dublin", "Dublin", "372", 53.35, -6.26, ["tech"]],
  ["vienne", "Vienne", "040", 48.21, 16.37, ["capitale"]],
  ["prague", "Prague", "203", 50.08, 14.44, ["capitale"]],
  ["luxembourg", "Luxembourg", "442", 49.61, 6.13, ["finance"]],
  // Est et Baltique
  ["varsovie", "Varsovie", "616", 52.23, 21.01, ["capitale"]],
  ["kyiv", "Kyiv", "804", 50.45, 30.52, ["capitale"]],
  ["odessa", "Odessa", "804", 46.48, 30.72, ["port"]],
  ["riga", "Riga", "428", 56.95, 24.11, ["port"]],
  ["tallinn", "Tallinn", "233", 59.44, 24.75, ["tech"]],
  ["vilnius", "Vilnius", "440", 54.69, 25.28],
  ["minsk", "Minsk", "112", 53.9, 27.57, ["capitale"]],
  ["kaliningrad", "Kaliningrad", "643", 54.71, 20.51, ["port"]],
  ["bucarest", "Bucarest", "642", 44.43, 26.1, ["capitale"]],
  ["stockholm", "Stockholm", "752", 59.33, 18.07, ["capitale"]],
  ["helsinki", "Helsinki", "246", 60.17, 24.94, ["capitale"]],
  ["copenhague", "Copenhague", "208", 55.68, 12.57, ["port"]],
  // Arctique
  ["nuuk", "Nuuk", "304", 64.18, -51.72, ["capitale", "port"]],
  ["longyearbyen", "Longyearbyen", "SVA", 78.22, 15.65],
  ["reykjavik", "Reykjavik", "352", 64.15, -21.94, ["port"]],
  ["tromso", "Tromsø", "578", 69.65, 18.96, ["port"]],
  ["mourmansk", "Mourmansk", "643", 68.97, 33.08, ["port"]],
  ["oslo", "Oslo", "578", 59.91, 10.75, ["capitale"]],
  // Méditerranée
  ["istanbul", "Istanbul", "792", 41.01, 28.98, ["port", "finance"]],
  ["ankara", "Ankara", "792", 39.93, 32.86, ["capitale"]],
  ["antalya", "Antalya", "792", 36.9, 30.7, ["port"]],
  ["kharkiv", "Kharkiv", "804", 49.99, 36.23],
  ["athenes", "Athènes", "300", 37.98, 23.73, ["capitale", "port"]],
  ["la_valette", "La Valette", "MLT", 35.9, 14.51, ["port", "finance"]],
  ["tunis", "Tunis", "788", 36.81, 10.18],
  ["alger", "Alger", "012", 36.75, 3.06, ["capitale"]],
  ["tripoli", "Tripoli", "434", 32.89, 13.19, ["port"]],
  ["le_caire", "Le Caire", "818", 30.04, 31.24, ["capitale"]],
  ["alexandrie", "Alexandrie", "818", 31.2, 29.92, ["port"]],
  ["casablanca", "Casablanca", "504", 33.57, -7.59, ["port"]],
  ["tanger", "Tanger", "504", 35.76, -5.83, ["port"]],
  ["nicosie", "Nicosie", "196", 35.17, 33.36],
  ["belgrade", "Belgrade", "688", 44.79, 20.45],
  // Moyen-Orient
  ["dubai", "Dubaï", "784", 25.2, 55.27, ["finance", "port"]],
  ["doha", "Doha", "634", 25.29, 51.53, ["finance"]],
  ["riyad", "Riyad", "682", 24.71, 46.68, ["capitale"]],
  ["neom", "Néom", "NEO", 28.0, 35.2, ["tech"]],
  ["teheran", "Téhéran", "364", 35.69, 51.39, ["capitale"]],
  ["bandar_abbas", "Bandar Abbas", "364", 27.18, 56.27, ["port"]],
  ["bagdad", "Bagdad", "368", 33.31, 44.36, ["capitale"]],
  ["damas", "Damas", "760", 33.51, 36.29],
  ["beyrouth", "Beyrouth", "422", 33.89, 35.5, ["port"]],
  ["tel_aviv", "Tel-Aviv", "376", 32.08, 34.78, ["tech"]],
  ["amman", "Amman", "400", 31.95, 35.93],
  ["mascate", "Mascate", "512", 23.59, 58.38, ["port"]],
  ["aden", "Aden", "887", 12.79, 45.02, ["port"]],
  ["bakou", "Bakou", "031", 40.41, 49.87, ["port"]],
  ["tbilissi", "Tbilissi", "268", 41.72, 44.79],
  // Sahel et Afrique de l'Ouest
  ["bamako", "Bamako", "SAH", 12.64, -8.0, ["capitale"]],
  ["niamey", "Niamey", "SAH", 13.51, 2.11],
  ["ouagadougou", "Ouagadougou", "SAH", 12.37, -1.52],
  ["arlit", "Arlit (mines d'uranium)", "SAH", 18.74, 7.39],
  ["dakar", "Dakar", "686", 14.72, -17.47, ["port"]],
  ["abidjan", "Abidjan", "384", 5.36, -4.01, ["port"]],
  ["lagos", "Lagos", "566", 6.52, 3.38, ["port", "finance"]],
  ["accra", "Accra", "288", 5.6, -0.19],
  ["ndjamena", "N'Djamena", "148", 12.13, 15.06],
  // Afrique
  ["addis_abeba", "Addis-Abeba", "231", 9.03, 38.74, ["capitale"]],
  ["nairobi", "Nairobi", "404", -1.29, 36.82, ["capitale", "tech"]],
  ["mombasa", "Mombasa", "404", -4.04, 39.67, ["port"]],
  ["mogadiscio", "Mogadiscio", "706", 2.05, 45.32, ["port"]],
  ["djibouti", "Djibouti", "262", 11.59, 43.15, ["port"]],
  ["khartoum", "Khartoum", "729", 15.5, 32.56],
  ["kinshasa", "Kinshasa", "180", -4.44, 15.27],
  ["goma", "Goma", "180", -1.68, 29.22],
  ["johannesburg", "Johannesburg", "710", -26.2, 28.05, ["finance"]],
  ["le_cap", "Le Cap", "710", -33.92, 18.42, ["port"]],
  ["luanda", "Luanda", "024", -8.84, 13.23, ["port"]],
  ["dar_es_salam", "Dar es Salam", "834", -6.79, 39.21, ["port"]],
  // Amérique du Nord
  ["washington", "Washington", "840", 38.91, -77.04, ["capitale"]],
  ["new_york", "New York", "840", 40.71, -74.01, ["finance", "port"]],
  ["los_angeles", "Los Angeles", "840", 34.05, -118.24, ["port"]],
  ["san_francisco", "San Francisco", "840", 37.77, -122.42, ["tech"]],
  ["miami", "Miami", "840", 25.76, -80.19, ["port", "finance"]],
  ["chicago", "Chicago", "840", 41.88, -87.63, ["finance"]],
  ["las_vegas", "Las Vegas", "840", 36.17, -115.14],
  ["houston", "Houston", "840", 29.76, -95.37, ["port"]],
  ["anchorage", "Anchorage", "840", 61.22, -149.9],
  ["honolulu", "Honolulu", "840", 21.31, -157.86, ["port"]],
  ["toronto", "Toronto", "124", 43.65, -79.38, ["finance"]],
  ["montreal", "Montréal", "124", 45.5, -73.57],
  ["vancouver", "Vancouver", "124", 49.28, -123.12, ["port"]],
  ["mexico", "Mexico", "484", 19.43, -99.13, ["capitale"]],
  ["tijuana", "Tijuana", "484", 32.51, -117.04],
  ["culiacan", "Culiacán", "484", 24.8, -107.39],
  // Amérique latine
  ["bogota", "Bogota", "170", 4.71, -74.07, ["capitale"]],
  ["medellin", "Medellín", "170", 6.24, -75.58],
  ["caracas", "Caracas", "862", 10.48, -66.9, ["capitale"]],
  ["rio", "Rio de Janeiro", "076", -22.91, -43.17, ["port"]],
  ["sao_paulo", "São Paulo", "076", -23.55, -46.63, ["finance"]],
  ["manaus", "Manaus", "076", -3.12, -60.02],
  ["buenos_aires", "Buenos Aires", "032", -34.6, -58.38, ["capitale", "port"]],
  ["santiago", "Santiago", "152", -33.45, -70.67, ["capitale"]],
  ["atacama", "Désert d'Atacama", "152", -23.65, -68.15],
  ["lima", "Lima", "604", -12.05, -77.04, ["capitale"]],
  ["la_havane", "La Havane", "192", 23.11, -82.37, ["port"]],
  ["panama", "Panama", "591", 8.98, -79.52, ["port", "finance"]],
  ["port_au_prince", "Port-au-Prince", "332", 18.59, -72.31],
  ["la_paz", "La Paz", "068", -16.49, -68.12],
  // Russie et Asie centrale
  ["moscou", "Moscou", "643", 55.76, 37.62, ["capitale"]],
  ["saint_petersbourg", "Saint-Pétersbourg", "643", 59.93, 30.34, ["port"]],
  ["novossibirsk", "Novossibirsk", "643", 55.01, 82.93, ["tech"]],
  ["vladivostok", "Vladivostok", "EXO", 43.12, 131.89, ["capitale", "port"]],
  ["khabarovsk", "Khabarovsk", "EXO", 48.48, 135.08],
  ["astana", "Astana", "398", 51.17, 71.45, ["capitale"]],
  ["almaty", "Almaty", "398", 43.24, 76.89, ["finance"]],
  ["baikonour", "Baïkonour", "398", 45.62, 63.31, ["secret"]],
  ["tachkent", "Tachkent", "860", 41.3, 69.24],
  // Asie de l'Est
  ["pekin", "Pékin", "156", 39.9, 116.41, ["capitale"]],
  ["shanghai", "Shanghai", "156", 31.23, 121.47, ["finance", "port"]],
  ["shenzhen", "Shenzhen", "156", 22.54, 114.06, ["tech"]],
  ["hong_kong", "Hong Kong", "156", 22.32, 114.17, ["finance", "port"]],
  ["macao", "Macao", "156", 22.2, 113.54, ["finance"]],
  ["taipei", "Taipei", "158", 25.03, 121.57, ["tech"]],
  ["tokyo", "Tokyo", "392", 35.68, 139.69, ["capitale", "tech"]],
  ["osaka", "Osaka", "392", 34.69, 135.5, ["port"]],
  ["seoul", "Séoul", "410", 37.57, 126.98, ["capitale", "tech"]],
  ["busan", "Busan", "410", 35.18, 129.08, ["port"]],
  ["pyongyang", "Pyongyang", "408", 39.04, 125.76, ["capitale"]],
  ["oulan_bator", "Oulan-Bator", "496", 47.89, 106.91],
  // Asie du Sud
  ["new_delhi", "New Delhi", "356", 28.61, 77.21, ["capitale"]],
  ["mumbai", "Mumbai", "356", 19.08, 72.88, ["finance", "port"]],
  ["bangalore", "Bangalore", "356", 12.97, 77.59, ["tech"]],
  ["karachi", "Karachi", "586", 24.86, 67.01, ["port"]],
  ["islamabad", "Islamabad", "586", 33.68, 73.05, ["capitale"]],
  ["kaboul", "Kaboul", "004", 34.53, 69.17],
  ["dhaka", "Dacca", "050", 23.81, 90.41],
  ["colombo", "Colombo", "144", 6.93, 79.86, ["port"]],
  ["katmandou", "Katmandou", "524", 27.72, 85.32],
  // Asie du Sud-Est
  ["singapour", "Singapour", "SGP", 1.35, 103.82, ["finance", "port", "tech"]],
  ["kuala_lumpur", "Kuala Lumpur", "458", 3.14, 101.69, ["capitale"]],
  ["jakarta", "Jakarta", "360", -6.21, 106.85, ["capitale", "port"]],
  ["bali", "Bali", "360", -8.65, 115.22],
  ["manille", "Manille", "608", 14.6, 120.98, ["capitale", "port"]],
  ["bangkok", "Bangkok", "764", 13.76, 100.5, ["capitale"]],
  ["ho_chi_minh", "Hô Chi Minh-Ville", "704", 10.82, 106.63, ["port"]],
  ["hanoi", "Hanoï", "704", 21.03, 105.85, ["capitale"]],
  ["rangoun", "Rangoun", "104", 16.87, 96.2, ["port"]],
  ["phnom_penh", "Phnom Penh", "116", 11.56, 104.93],
  ["nouvelle_atlantide", "Nouvelle-Atlantide", "ATL", 8.0, 120.5, ["finance", "tech"]],
  // Océanie
  ["sydney", "Sydney", "036", -33.87, 151.21, ["port", "finance"]],
  ["canberra", "Canberra", "036", -35.28, 149.13, ["capitale"]],
  ["perth", "Perth", "036", -31.95, 115.86, ["port"]],
  ["darwin", "Darwin", "036", -12.46, 130.84, ["port"]],
  ["auckland", "Auckland", "554", -36.85, 174.76, ["port"]],
  ["port_moresby", "Port Moresby", "598", -9.44, 147.18],
  ["noumea", "Nouméa", "540", -22.27, 166.46, ["port"]],
  ["suva", "Suva", "242", -18.14, 178.44, ["port"]],
];

export const CITIES: CityDef[] = CITY_ROWS.map(([id, name, country, lat, lon, tags]) => ({ id, name, country, lat, lon, tags }));

const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));
export const findCity = (id: string | null | undefined) => (id ? CITY_BY_ID.get(id) : undefined);
export const cityRegion = (id: string): RegionId | undefined => {
  const city = findCity(id);
  return city ? findCountry(city.country)?.region : undefined;
};
export const citiesOfRegion = (region: RegionId) =>
  CITIES.filter((c) => !c.tags?.includes("secret") && findCountry(c.country)?.region === region);

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Retrouve une ville connue dans un texte libre (« un café de Riga », « Singapour, quartier des affaires »).
 * Sert à placer sur la carte les lieux écrits par le narrateur.
 */
export function matchCity(text: string | null | undefined): CityDef | undefined {
  if (!text) return undefined;
  const t = ` ${normalize(text)} `;
  let best: CityDef | undefined;
  for (const c of CITIES) {
    const names = [c.name.replace(/\s*\(.*\)$/, ""), c.id.replace(/_/g, " ")];
    for (const n of names) {
      const key = normalize(n);
      if (key.length >= 3 && t.includes(` ${key} `) && (!best || key.length > normalize(best.name).length)) best = c;
    }
  }
  return best;
}
