import type { RegionId } from "./geo";

/** Les adversaires : services d'États hors Concordat et organisations privées. */
export type FactionKind = "etat" | "syndicat" | "mercenaires" | "cartel" | "tech" | "terroriste";

export interface FactionDef {
  id: string;
  name: string;
  kind: FactionKind;
  /** Pays d'attache (code de la carte), s'il y en a un. */
  country?: string;
  regions: RegionId[];
  style: string;
  /** Titres possibles de la cible d'une mission. */
  figures: string[];
}

export const FACTIONS: FactionDef[] = [
  {
    id: "russes",
    name: "les services russes (SVR et GRU)",
    kind: "etat",
    country: "643",
    regions: ["est", "europe", "arctique", "russie", "mediterranee", "sahel"],
    style: "sabotages d'infrastructures, assassinats ciblés, désinformation, agents dormants",
    figures: ["un colonel du GRU", "une illégale du SVR infiltrée depuis vingt ans", "un attaché culturel qui n'en est pas un", "un oligarque au service du Kremlin"],
  },
  {
    id: "chinois",
    name: "le ministère chinois de la Sécurité d'État",
    kind: "etat",
    country: "156",
    regions: ["asie_est", "asie_sud_est", "oceanie", "afrique", "europe", "amerique_nord"],
    style: "espionnage industriel, réseaux d'influence, cyberopérations patientes",
    figures: ["un chasseur de talents scientifiques", "une investisseuse aux fonds inépuisables", "un diplomate trop bien informé", "le patron d'une usine de puces"],
  },
  {
    id: "iraniens",
    name: "la force Al-Qods des Gardiens de la Révolution",
    kind: "etat",
    country: "364",
    regions: ["moyen_orient", "mediterranee", "europe", "afrique"],
    style: "réseaux par procuration, enlèvements, achats clandestins pour le programme nucléaire",
    figures: ["un intermédiaire en pièces détachées", "un commandant de la force Al-Qods", "un physicien sous surveillance", "un armateur aux navires fantômes"],
  },
  {
    id: "nordcoreens",
    name: "le Bureau 121 nord-coréen",
    kind: "etat",
    country: "408",
    regions: ["asie_est", "asie_sud_est", "asie_sud"],
    style: "braquages numériques, cryptomonnaies volées, ventes d'armes",
    figures: ["un hacker prodige qui n'a jamais vu la mer", "un banquier de Macao", "une négociante en missiles"],
  },
  {
    id: "koschei",
    name: "le Groupe Koschei",
    kind: "mercenaires",
    regions: ["sahel", "afrique", "mediterranee", "moyen_orient", "est"],
    style: "mercenaires héritiers de Wagner : protection de juntes, mines d'or, massacres niés",
    figures: ["le commandant Koschei en personne", "un logisticien des mines d'or", "un instructeur de la garde présidentielle"],
  },
  {
    id: "ouroboros",
    name: "l'Ouroboros",
    kind: "syndicat",
    regions: ["europe", "mediterranee", "moyen_orient", "asie_sud_est", "amerique_latine", "afrique"],
    style: "syndicat mondial en Anneaux régionaux : trafic d'armes, blanchiment, enchères de secrets volés",
    figures: ["la Tête d'un Anneau", "un commissaire-priseur des secrets", "un banquier de l'Anneau méditerranéen", "un fabricant d'identités"],
  },
  {
    id: "varn",
    name: "Varn Dynamics",
    kind: "tech",
    country: "ATL",
    regions: ["asie_sud_est", "oceanie", "amerique_nord", "europe"],
    style: "le conglomérat d'Elias Varn : biotech sans éthique, IA militaires, mercenaires privés",
    figures: ["Elias Varn lui-même", "la directrice des laboratoires de Varn", "un chef de la sécurité privée de Varn"],
  },
  {
    id: "promethee",
    name: "le Collectif Prométhée",
    kind: "tech",
    regions: ["amerique_nord", "moyen_orient", "europe"],
    style: "techno-secte transhumaniste de milliardaires : implants, IA, contrôle de l'information",
    figures: ["un gourou de la tech qui veut vivre éternellement", "une ingénieure repentie", "un fonds d'investissement qui ne dort jamais"],
  },
  {
    id: "corona",
    name: "la Corona del Pacífico",
    kind: "cartel",
    regions: ["amerique_latine", "amerique_nord", "asie_sud_est"],
    style: "cartel transpacifique : précurseurs chimiques, sous-marins artisanaux, corruption",
    figures: ["un chimiste du cartel", "une avocate de la Corona", "le capitaine d'un narco-sous-marin"],
  },
  {
    id: "vladivostok",
    name: "le Conseil de Vladivostok",
    kind: "syndicat",
    country: "EXO",
    regions: ["russie", "asie_est", "arctique"],
    style: "généraux et oligarques de l'Extrême-Orient sécessionniste : ils vendent l'arsenal ex-soviétique au plus offrant",
    figures: ["un général reconverti en marchand d'armes", "une armatrice de Vladivostok", "le gardien d'un dépôt d'ogives"],
  },
  {
    id: "gaia",
    name: "Gaïa Noire",
    kind: "terroriste",
    regions: ["europe", "arctique", "amerique_latine", "oceanie"],
    style: "écoterroristes radicaux : sabotages spectaculaires, armes biologiques improvisées",
    figures: ["une biologiste radicalisée", "le stratège sans visage de Gaïa Noire", "un ancien commando passé à la cause"],
  },
];

export const findFaction = (id: string) => FACTIONS.find((f) => f.id === id);
export const factionsOfRegion = (region: RegionId) => FACTIONS.filter((f) => f.regions.includes(region));
