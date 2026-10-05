import type { AgencyId, NodeType, SkillId } from "./types";

/** Un siège du Cercle : nommé, numéroté, avec sa tradition et son coup signature. */
export interface SeatDef {
  id: string;
  number: number;
  name: string;
  /** Compétences du siège : on les apprend plus vite hors mission. */
  specialty: SkillId[];
  heritage: string;
  /** Une fois par mission : une étape de ce type est emportée d'office. */
  signature: { name: string; description: string; nodes: NodeType[] };
}

export type BranchKind = "labo" | "analyse" | "logistique";

/** Les trois Branches de soutien : on ne les rejoint pas, on s'entend (ou non) avec leur chef. */
export interface BranchDef {
  id: string;
  kind: BranchKind;
  name: string;
  role: string;
  chief: { name: string; description: string };
  /** Le coup de main qu'elle peut donner une fois par mission. */
  support: { name: string; description: string };
}

export interface AgencyDef {
  id: AgencyId;
  name: string;
  region: string;
  epithet: string;
  motto: string;
  color: string;
  identity: string;
  style: string;
  hq: string;
  /** Ville de la carte où se trouve le siège. */
  hqCity: string;
  academy: string;
  /** Ville de la carte où se trouve l'Académie. */
  academyCity: string;
  director: { name: string; codename: string; description: string };
  second: { name: string; description: string };
  /** Le laboratoire (raccourci vers la Branche du même nom). */
  lab: { name: string; chief: string };
  members: { country: string; languages: string }[];
  codenames: { theme: string; examples: string[] };
  circle: {
    name: string;
    /** Comment on appelle un membre du Cercle. */
    member: string;
    seatTerm: { singular: string; plural: string };
    description: string;
  };
  seats: SeatDef[];
  /** Villes des Stations de l'agence. */
  stations: string[];
  branches: BranchDef[];
  organization: string;
  /** Le paravent public derrière lequel l'agence invite ses prospects, sans jamais dire son nom. */
  cover: { name: string; pretext: string };
  /** La cérémonie où l'on prend son siège. */
  ceremony: { name: string; place: string; text: string };
}

const seat = (
  id: string,
  number: number,
  name: string,
  specialty: SkillId[],
  heritage: string,
  signature: SeatDef["signature"],
): SeatDef => ({ id, number, name, specialty, heritage, signature });

export const AGENCIES: Record<AgencyId, AgencyDef> = {
  argos: {
    id: "argos",
    name: "ARGOS",
    region: "Europe",
    epithet: "Argos Panoptès, le géant aux cent yeux qui ne dormait jamais.",
    motto: "Cent yeux, aucun sommeil.",
    color: "var(--agency-argos)",
    identity:
      "L'héritière directe du Concordat de 1961, et la plus fine des trois. Renseignement humain, élégance, manipulation en haute société. Depuis la Fracture, elle veut une Europe qui ne dépende plus de personne, ni de Washington ni de Moscou. Un agent d'ARGOS qui doit sortir une arme a déjà raté quelque chose.",
    style: "Palaces, trains de nuit, opéras, ventes aux enchères, ambassades, yachts de la Riviera, vieilles capitales.",
    hq: "L'Olympe : un massif des Alpes suisses évidé sur onze niveaux, relié à Lucerne par un train à sustentation magnétique. Au cœur, l'Agora, une salle de crise holographique où l'Europe entière tient sur une table.",
    hqCity: "olympe",
    academy:
      "Le Lycée de Méléa, un monastère byzantin sur une île privée de la mer Égée. En surface, une école internationale pour adolescents surdoués ; dessous, des stands de tir, une fosse d'apnée de quarante mètres et des salles d'interrogatoire.",
    academyCity: "melea",
    director: {
      name: "Auguste Delorme",
      codename: "Ulysse",
      description: "68 ans, directeur depuis 1998. Costume trois-pièces, parapluie, vouvoie tout le monde. D'une politesse absolue et toujours trois coups d'avance.",
    },
    second: { name: "Margaux Lenoir", description: "La Seconde : chef d'état-major, vingt ans de terrain, ne sourit jamais et sait tout avant Delorme." },
    lab: { name: "la Forge", chief: "Lazare Fontaine, dit « Dédale », génie échevelé qui supplie qu'on lui rende ses gadgets intacts" },
    members: [
      { country: "France", languages: "Français" },
      { country: "Allemagne", languages: "Allemand" },
      { country: "Italie", languages: "Italien" },
      { country: "Espagne", languages: "Espagnol" },
      { country: "Portugal", languages: "Portugais" },
      { country: "Royaume-Uni", languages: "Anglais" },
      { country: "Écosse", languages: "Anglais, gaélique" },
      { country: "Irlande", languages: "Anglais, irlandais" },
      { country: "Belgique", languages: "Français, néerlandais" },
      { country: "Pays-Bas", languages: "Néerlandais" },
      { country: "Luxembourg", languages: "Luxembourgeois, français, allemand" },
      { country: "Suisse", languages: "Français, allemand" },
      { country: "Autriche", languages: "Allemand" },
      { country: "Pologne", languages: "Polonais" },
      { country: "Tchéquie", languages: "Tchèque" },
      { country: "Slovaquie", languages: "Slovaque" },
      { country: "Hongrie", languages: "Hongrois" },
      { country: "Roumanie", languages: "Roumain" },
      { country: "Bulgarie", languages: "Bulgare" },
      { country: "Grèce", languages: "Grec" },
      { country: "Chypre", languages: "Grec, anglais" },
      { country: "Malte", languages: "Maltais, anglais" },
      { country: "Croatie", languages: "Croate" },
      { country: "Slovénie", languages: "Slovène" },
      { country: "Suède", languages: "Suédois" },
      { country: "Danemark", languages: "Danois" },
      { country: "Finlande", languages: "Finnois" },
      { country: "Norvège", languages: "Norvégien" },
      { country: "Islande", languages: "Islandais" },
      { country: "Estonie", languages: "Estonien" },
      { country: "Lettonie", languages: "Letton" },
      { country: "Lituanie", languages: "Lituanien" },
      { country: "Ukraine", languages: "Ukrainien" },
    ],
    codenames: {
      theme: "les mythologies d'Europe (grecque, romaine, nordique, celtique, slave)",
      examples: ["Atlas", "Icare", "Méduse", "Thésée", "Nyx", "Fenrir", "Morrigan", "Perun", "Cassandre", "Freya"],
    },
    circle: {
      name: "les Argonautes",
      member: "Argonaute",
      seatTerm: { singular: "banc", plural: "bancs" },
      description:
        "Dix bancs de chêne face à la table du Conseil, à l'Olympe : un par rameur de l'Argo. Chaque banc porte le nom d'un héros et la mémoire de ceux qui s'y sont assis. On n'y entre que quand l'un d'eux se vide.",
    },
    seats: [
      seat("jason", 1, "le Banc de Jason", ["tactique", "eloquence", "sangfroid"], "Le banc du chef de l'expédition. Delorme y a siégé vingt ans avant de prendre la Direction.", {
        name: "Prendre la barre",
        description: "Quand tout vacille, tu imposes ton plan : l'objectif ou la crise est emporté.",
        nodes: ["objectif", "complication"],
      }),
      seat("orphee", 2, "le Banc d'Orphée", ["eloquence", "empathie", "tenue"], "Le banc des charmeurs. Son dernier titulaire a convaincu un ministre de trahir son propre gouvernement… en un dîner.", {
        name: "Le chant",
        description: "Une conversation qui aurait dû mal tourner te rend un allié.",
        nodes: ["social", "complication"],
      }),
      seat("lyncee", 3, "le Banc de Lyncée", ["regard", "alerte", "logique"], "Lyncée voyait à travers les murs. Ses titulaires remarquent tout, et ne l'oublient jamais.", {
        name: "L'œil de Lyncée",
        description: "Tu lis le terrain d'un seul regard : l'étape de renseignement ou de filature est emportée.",
        nodes: ["renseignement", "filature"],
      }),
      seat("heracles", 4, "le Banc d'Héraclès", ["force", "combat", "endurance"], "Le banc de la force. On l'appelle quand la ruse a échoué ; ses titulaires détestent qu'on les appelle trop tard.", {
        name: "Les douze travaux",
        description: "Une porte, un mur ou trois gardes : rien ne te résiste une fois.",
        nodes: ["combat", "effraction"],
      }),
      seat("atalante", 5, "le Banc d'Atalante", ["athletisme", "vivacite", "ombre"], "La seule femme de l'Argo, et la plus rapide. Ce banc n'a jamais perdu une poursuite.", {
        name: "La course d'Atalante",
        description: "Personne ne te rattrape, personne ne t'échappe.",
        nodes: ["poursuite", "extraction"],
      }),
      seat("tiphys", 6, "le Banc de Tiphys", ["pilotage", "tactique", "sangfroid"], "Le pilote de l'Argo. Ses titulaires conduisent tout ce qui a un moteur, une voile ou des ailes.", {
        name: "Le pilote",
        description: "Une arrivée, une fuite ou une poursuite menée sans une égratignure.",
        nodes: ["approche", "extraction", "poursuite"],
      }),
      seat("autolycos", 7, "le Banc d'Autolycos", ["doigte", "ombre", "masque"], "Le prince des voleurs, grand-père d'Ulysse. Delorme lui garde une tendresse coupable.", {
        name: "Le vol parfait",
        description: "Tu entres et tu prends, sans laisser de trace.",
        nodes: ["effraction", "infiltration"],
      }),
      seat("asclepios", 8, "le Banc d'Asclépios", ["medecine", "sangfroid", "empathie"], "Le banc des soigneurs. On raconte qu'il a ramené des agents d'entre les morts.", {
        name: "Le caducée",
        description: "Tu tiens tout le monde debout quand ça tourne mal.",
        nodes: ["complication", "combat"],
      }),
      seat("argos", 9, "le Banc d'Argos", ["machine", "precision", "logique"], "Argos, le charpentier qui construisit le navire, a donné son nom à l'agence. Son banc revient aux génies de la mécanique.", {
        name: "Le charpentier",
        description: "Un système, une serrure, une machine : tu trouves la faille.",
        nodes: ["piratage", "effraction"],
      }),
      seat("medee", 10, "le Banc de Médée", ["masque", "medecine", "babel"], "Elle n'était pas Argonaute, elle les a sauvés. Le seul banc qu'on accorde aux maîtres du poison et des masques.", {
        name: "Le philtre",
        description: "Un visage, une voix, un poison : tu deviens quelqu'un d'autre au bon moment.",
        nodes: ["social", "infiltration"],
      }),
    ],
    stations: ["londres", "istanbul", "varsovie", "kyiv", "tallinn", "athenes", "tunis", "dakar", "nuuk", "beyrouth"],
    branches: [
      {
        id: "forge",
        kind: "labo",
        name: "la Forge",
        role: "Le laboratoire : gadgets, prototypes, véhicules.",
        chief: { name: "Lazare Fontaine, dit « Dédale »", description: "Génie échevelé qui supplie qu'on lui rende ses gadgets intacts, et ne pardonne jamais une casse." },
        support: { name: "Livraison de la Forge", description: "Un drone dépose une contre-mesure sur mesure : l'alerte retombe." },
      },
      {
        id: "bibliotheque",
        kind: "analyse",
        name: "la Bibliothèque",
        role: "L'analyse : archives, recoupements, écoutes.",
        chief: { name: "Odile Varenne, dite « Mnémé »", description: "Analyste qui lit quatre langues mortes et n'oublie aucun dossier ; elle sort rarement de ses archives." },
        support: { name: "Le dossier complet", description: "La Bibliothèque te transmet ce qu'il te manquait : renseignement +3." },
      },
      {
        id: "passeurs",
        kind: "logistique",
        name: "les Passeurs",
        role: "La logistique : faux papiers, planques, bateaux, extractions.",
        chief: { name: "Ilias Konstantinou, dit « Charon »", description: "Ancien contrebandier grec. Rien n'est impossible, tout se paie." },
        support: { name: "La barque de Charon", description: "Nouveaux papiers, voiture de repli, porte dérobée : exposition −25." },
      },
    ],
    organization:
      "Le Directeur et sa Seconde à l'Olympe ; dix Argonautes ; une dizaine de Stations à travers l'Europe et ses marges, chacune avec son chef, ses officiers et ses informateurs ; trois Branches de soutien — la Forge, la Bibliothèque, les Passeurs ; et le Lycée de Méléa.",
    cover: {
      name: "la Fondation Méléa",
      pretext:
        "Une bourse d'excellence pour un « programme international » de cent jours dans un monastère restauré d'une île grecque : langues, sciences, sport, art de vivre. Une lettre sur papier épais, un blason discret, et aucune candidature jamais déposée.",
    },
    ceremony: {
      name: "La Prise du Banc",
      place: "Sous la voûte de l'Olympe",
      text: "Dix bancs de chêne face à la table du Conseil. Delorme pose la main sur le dossier d'un banc vide : « D'autres s'y sont assis avant vous. Faites-leur honneur. »",
    },
  },

  meridian: {
    id: "meridian",
    name: "MERIDIAN",
    region: "États-Unis et Pacifique",
    epithet: "La ligne qui relie les pôles : celle que suivent les navigateurs.",
    motto: "Hold the line.",
    color: "var(--agency-meridian)",
    identity:
      "Née de la course à l'espace et des grandes alliances du Pacifique. Les plus gros moyens du monde : satellites, drones, forces spéciales, et une IA d'analyse qui lit toutes les communications du Pacifique. Alliée d'ARGOS sur le papier, elle l'espionne sans complexe ; ennemie déclarée de tout ce qui ressemble à Pékin.",
    style: "Déserts, plateformes pétrolières, mégapoles, jungles, porte-avions, bases secrètes, courses-poursuites, cascades aériennes.",
    hq: "Halcyon : une base sous-marine à trois cents mètres de fond au large d'Hawaï, desservie par sous-marins de transport. Au-dessus, Zenith, sa station de commandement en orbite basse, d'où Polaris suit chaque opération en direct.",
    hqCity: "halcyon",
    academy: "Northwatch, une ancienne base aérienne des Rocheuses canadiennes. Pistes taillées dans la montagne, simulateurs de chasse, et un hiver de huit mois qui trie les volontés.",
    academyCity: "northwatch",
    director: {
      name: "Margaret Halloran",
      codename: "Polaris",
      description: "Ancienne pilote d'essai canadienne, sèche, directe, adore les paris impossibles et déteste les réunions.",
    },
    second: { name: "Samuel Ortiz", description: "Deputy Director, général en retraite, le seul capable de dire non à Halloran." },
    lab: { name: "le Hangar", chief: "Dex Okafor, ingénieur de génie qui teste tout lui-même, d'où ses sourcils roussis" },
    members: [
      { country: "États-Unis", languages: "Anglais" },
      { country: "Canada", languages: "Anglais, français" },
      { country: "Australie", languages: "Anglais" },
      { country: "Nouvelle-Zélande", languages: "Anglais, maori" },
      { country: "Japon", languages: "Japonais" },
      { country: "Corée du Sud", languages: "Coréen" },
      { country: "Philippines", languages: "Filipino, anglais" },
      { country: "Argentine", languages: "Espagnol" },
    ],
    codenames: {
      theme: "les étoiles et les constellations, avec lesquelles les navigateurs se repèrent",
      examples: ["Vega", "Rigel", "Altaïr", "Lyra", "Orion", "Cassiopée", "Antarès", "Sirius", "Deneb", "Andromède"],
    },
    circle: {
      name: "la Constellation",
      member: "Étoile",
      seatTerm: { singular: "étoile", plural: "étoiles" },
      description:
        "Au plafond de la salle de contrôle d'Halcyon, une carte du ciel : dix étoiles, une par agent de terrain. Quand l'un meurt ou part, la sienne s'éteint, jusqu'à ce qu'on la rallume pour un autre.",
    },
    seats: [
      seat("sirius", 1, "Sirius", ["combat", "precision", "endurance"], "La plus brillante. On lui confie ce qui doit être réglé vite et fort.", { name: "Brightest Star", description: "Le moment où tout bascule t'appartient.", nodes: ["combat", "objectif"] }),
      seat("vega", 2, "Vega", ["pilotage", "tactique", "alerte"], "L'étoile des navigateurs. Ses titulaires arrivent toujours là où personne ne les attend.", { name: "True North", description: "Une arrivée ou une fuite parfaitement menée.", nodes: ["approche", "extraction", "poursuite"] }),
      seat("rigel", 3, "Rigel", ["precision", "sangfroid", "regard"], "L'étoile froide. Le siège des tireurs qui ne tirent qu'une fois.", { name: "One Shot", description: "Un seul geste, le bon.", nodes: ["combat", "filature"] }),
      seat("altair", 4, "Altaïr", ["athletisme", "vivacite", "pilotage"], "L'aigle. Ses titulaires sautent de ce dont les autres descendent.", { name: "The Eagle", description: "Toits, falaises, véhicules en marche : rien ne t'arrête.", nodes: ["poursuite", "extraction"] }),
      seat("antares", 5, "Antarès", ["ombre", "masque", "doigte"], "Le rival de Mars, rouge et discret. Le siège des infiltrés.", { name: "Red Shift", description: "Tu passes là où personne ne passe.", nodes: ["infiltration", "effraction"] }),
      seat("arcturus", 6, "Arcturus", ["endurance", "alerte", "combat"], "Le gardien de l'Ourse. Le siège de ceux qui protègent, et ramènent tout le monde.", { name: "The Guardian", description: "Quand l'équipe est en danger, tu tiens.", nodes: ["complication", "combat"] }),
      seat("deneb", 7, "Deneb", ["machine", "logique", "archives"], "La lointaine. Le siège des génies du signal.", { name: "Deep Signal", description: "Un réseau, un code, un serveur : tu entres.", nodes: ["piratage", "renseignement"] }),
      seat("capella", 8, "Capella", ["eloquence", "tenue", "empathie"], "La chèvre qui nourrit les dieux. Le siège des séducteurs et des diplomates.", { name: "Charm Offensive", description: "Une soirée qui aurait dû mal finir te sourit.", nodes: ["social", "complication"] }),
      seat("aldebaran", 9, "Aldébaran", ["regard", "instinct", "babel"], "L'œil du Taureau. Le siège des observateurs qui comprennent toutes les langues.", { name: "Bull's Eye", description: "Tu vois tout, tu comprends tout.", nodes: ["renseignement", "filature"] }),
      seat("betelgeuse", 10, "Bételgeuse", ["force", "machine", "precision"], "La géante instable, qui explosera un jour. Le siège des démolisseurs.", { name: "Supernova", description: "Une porte, un coffre, une salle des machines : ça saute.", nodes: ["effraction", "objectif"] }),
    ],
    stations: ["washington", "miami", "tokyo", "seoul", "taipei", "manille", "sydney", "buenos_aires", "anchorage", "dubai"],
    branches: [
      {
        id: "hangar",
        kind: "labo",
        name: "le Hangar",
        role: "Le laboratoire : prototypes, véhicules, armement.",
        chief: { name: "Dex Okafor", description: "Ingénieur de génie qui teste tout lui-même, d'où ses sourcils roussis." },
        support: { name: "Hangar Drop", description: "Un drone largue une contre-mesure : l'alerte retombe." },
      },
      {
        id: "mission_control",
        kind: "analyse",
        name: "Mission Control",
        role: "L'analyse et le suivi en direct depuis Halcyon et Zenith.",
        chief: { name: "Ruth Abernathy, dite « Houston »", description: "La voix calme de toutes les opérations depuis vingt ans ; elle ne panique jamais, et c'est ce qui fait peur." },
        support: { name: "Eye in the Sky", description: "Satellites et écoutes en direct : renseignement +3." },
      },
      {
        id: "ground_crew",
        kind: "logistique",
        name: "Ground Crew",
        role: "La logistique : couvertures, transport, extractions.",
        chief: { name: "Cole Whitaker", description: "Ancien des forces spéciales, mâche toujours du chewing-gum, a sorti des agents de pires endroits que celui-là." },
        support: { name: "Exfil Package", description: "Papiers neufs, véhicule de repli, piste dégagée : exposition −25." },
      },
    ],
    organization:
      "Polaris et son Deputy à Halcyon ; dix Étoiles ; une dizaine de Stations sur le Pacifique et les Amériques ; trois Branches — le Hangar, Mission Control, Ground Crew ; et l'Académie de Northwatch.",
    cover: {
      name: "le Northwatch Fellowship",
      pretext:
        "Un programme d'élite pour jeunes talents (aéronautique, survie, leadership), financé par une fondation privée et installé dans une ancienne base des Rocheuses canadiennes. Des recruteurs en polo bleu marine, très polis, qui savent déjà tout de toi.",
    },
    ceremony: {
      name: "Une étoile s'allume",
      place: "Dans la salle de contrôle d'Halcyon",
      text: "Au plafond, la carte du ciel. Une étoile éteinte depuis des mois attend. Halloran ne fait pas de discours : « Pick one. Then earn it. »",
    },
  },

  monsoon: {
    id: "monsoon",
    name: "MONSOON",
    region: "Les non-alignés : Asie, Golfe, Afrique, Amérique latine",
    epithet: "La mousson : patiente pendant des mois, puis irrésistible.",
    motto: "Attendre comme la mer. Frapper comme la mousson.",
    color: "var(--agency-monsoon)",
    identity:
      "L'agence des non-alignés, née de la Fracture de 2022 : elle refuse de choisir un camp, traite avec Pékin comme avec Washington, et vend parfois ses informations au plus offrant. Réseaux, finance, cyber, opérations maritimes : des préparatifs invisibles qui durent des semaines, puis une action de quelques minutes, décisive.",
    style: "Ports géants, mégapoles verticales, fonds souverains du Golfe, archipels, marchés de nuit, détroits, salles de serveurs.",
    hq: "Le Phare : une île artificielle au large de Singapour, sous un vrai phare. En dessous, la Ruche, le plus puissant calculateur quantique connu, refroidi par l'eau de mer.",
    hqCity: "phare",
    academy:
      "Senja, une île de l'archipel des Natuna qu'on ne rejoint qu'à marée basse, par une chaussée de corail. Le jour, une école de la mer ; la nuit, plongée de combat et filature dans les marchés de Singapour.",
    academyCity: "senja",
    director: {
      name: "Arjun Mehta",
      codename: "l'Œil",
      description: "L'œil du cyclone : calme absolu, joueur de go, ne hausse jamais la voix et n'oublie jamais rien.",
    },
    second: { name: "Nasrin Haddad", description: "La Main gauche de l'Œil : négociatrice, elle a racheté plus d'agents capturés que quiconque." },
    lab: { name: "l'Atelier des Vents", chief: "Hana Seo, ingénieure coréenne aussi silencieuse que ses drones" },
    members: [
      { country: "Inde", languages: "Hindi, anglais" },
      { country: "Indonésie", languages: "Indonésien" },
      { country: "Singapour", languages: "Anglais, mandarin, malais" },
      { country: "Malaisie", languages: "Malais, anglais" },
      { country: "Vietnam", languages: "Vietnamien" },
      { country: "Thaïlande", languages: "Thaï" },
      { country: "Émirats arabes unis", languages: "Arabe, anglais" },
      { country: "Arabie saoudite", languages: "Arabe" },
      { country: "Qatar", languages: "Arabe" },
      { country: "Turquie", languages: "Turc" },
      { country: "Égypte", languages: "Arabe" },
      { country: "Brésil", languages: "Portugais" },
      { country: "Mexique", languages: "Espagnol" },
      { country: "Afrique du Sud", languages: "Anglais, zoulou" },
      { country: "Nigeria", languages: "Anglais, yoruba" },
      { country: "Kenya", languages: "Swahili, anglais" },
    ],
    codenames: {
      theme: "les vents, tempêtes et phénomènes naturels, dans les langues de la région",
      examples: ["Arashi", "Baram", "Kilat", "Hawa", "Senja", "Kaminari", "Ombak", "Taifun", "Kabut", "Aandhi"],
    },
    circle: {
      name: "les Huit Vents",
      member: "Vent",
      seatTerm: { singular: "vent", plural: "vents" },
      description:
        "Huit girouettes de bronze au sommet du Phare, une par vent qui souffle sur les pays de MONSOON. Quand un Vent tombe, sa girouette tourne à vide, et toute l'agence le sait.",
    },
    seats: [
      seat("amihan", 1, "Amihan", ["logique", "archives", "babel"], "Le vent frais du nord-est, qui annonce les saisons. Le siège des patients qui savent tout avant tout le monde.", { name: "La saison qui vient", description: "Tu avais tout prévu.", nodes: ["renseignement", "piratage"] }),
      seat("habagat", 2, "Habagat", ["eloquence", "empathie", "instinct"], "La mousson du sud-ouest, qui apporte la pluie et la vie. Le siège des tisseurs de réseaux.", { name: "La pluie", description: "Quelqu'un, quelque part, te devait un service.", nodes: ["social", "complication"] }),
      seat("shamal", 3, "Shamal", ["ombre", "masque", "alerte"], "Le vent du Golfe qui soulève les tempêtes de sable. Le siège de ceux qui disparaissent.", { name: "La tempête de sable", description: "Tu te fonds dans le décor, et personne ne te revoit.", nodes: ["infiltration", "extraction"] }),
      seat("harmattan", 4, "Harmattan", ["endurance", "tolerance", "combat"], "Le vent sec du Sahel, qui use tout. Le siège de ceux qui tiennent quand les autres tombent.", { name: "La poussière", description: "Tu encaisses, tu tiens, tu gagnes.", nodes: ["combat", "complication"] }),
      seat("khamsin", 5, "Khamsin", ["sangfroid", "tactique", "regard"], "Le vent brûlant de cinquante jours. Le siège des stratèges qui ne frappent qu'une fois.", { name: "Le cinquantième jour", description: "Le coup que tu préparais depuis le début.", nodes: ["objectif", "filature"] }),
      seat("sumatra", 6, "Sumatra", ["vivacite", "precision", "pilotage"], "Le grain soudain du détroit de Malacca. Le siège des frappes éclair.", { name: "Le grain", description: "Quelques secondes, et c'est fini.", nodes: ["poursuite", "combat"] }),
      seat("loo", 7, "Loo", ["machine", "doigte", "precision"], "Le vent brûlant des plaines de l'Inde, qui fait fondre ce qu'il touche. Le siège des techniciens.", { name: "La fonte", description: "Aucun système ne résiste à la chaleur.", nodes: ["effraction", "piratage"] }),
      seat("barat", 8, "Barat", ["pilotage", "athletisme", "endurance"], "Le vent d'ouest de la mer de Java. Le siège des marins et des plongeurs.", { name: "La traversée", description: "La mer est ta route, et personne ne la surveille.", nodes: ["approche", "extraction"] }),
    ],
    stations: ["mumbai", "singapour", "jakarta", "dubai", "istanbul", "le_caire", "lagos", "nairobi", "sao_paulo", "mexico"],
    branches: [
      {
        id: "atelier",
        kind: "labo",
        name: "l'Atelier des Vents",
        role: "Le laboratoire : drones, électronique, équipement de plongée.",
        chief: { name: "Hana Seo", description: "Ingénieure coréenne aussi silencieuse que ses drones ; elle note chaque gadget perdu dans un carnet noir." },
        support: { name: "Le drone de l'Atelier", description: "Une contre-mesure livrée en silence : l'alerte retombe." },
      },
      {
        id: "ruche",
        kind: "analyse",
        name: "la Ruche",
        role: "L'analyse : le calculateur quantique et ses gardiens.",
        chief: { name: "Vikram Rao", description: "Mathématicien qui parle à la Ruche comme à une personne, et l'écoute davantage que les humains." },
        support: { name: "La Ruche répond", description: "Une corrélation que personne n'avait vue : renseignement +3." },
      },
      {
        id: "marees",
        kind: "logistique",
        name: "les Marées",
        role: "La logistique : flotte fantôme, faux pavillons, passeurs.",
        chief: { name: "Laila Al-Mansoori", description: "Armatrice émiratie à la flotte fantôme ; elle peut faire disparaître n'importe qui, contre un service." },
        support: { name: "La marée descend", description: "Un bateau, des papiers, une sortie : exposition −25." },
      },
    ],
    organization:
      "L'Œil et sa Main gauche au Phare ; huit Vents ; une dizaine de Stations sur trois continents ; trois Branches — l'Atelier des Vents, la Ruche, les Marées ; et l'Académie de Senja.",
    cover: {
      name: "l'Institut Senja",
      pretext:
        "Une bourse d'études maritimes et linguistiques sur une île de la mer de Chine. L'invitation arrive toujours par une personne de confiance (un professeur, un entraîneur, un vieil ami de la famille) qui ne sait pas elle-même ce qu'elle transmet.",
    },
    ceremony: {
      name: "Le Vent qui se lève",
      place: "Au sommet du Phare",
      text: "Huit girouettes de bronze. L'une tourne à vide depuis des mois. L'Œil te tend une pierre de go blanche et attend que tu choisisses.",
    },
  },
};

export const AGENCY_IDS = Object.keys(AGENCIES) as AgencyId[];

export function findSeat(agency: AgencyId, id: string | null | undefined): SeatDef | undefined {
  return AGENCIES[agency].seats.find((s) => s.id === id);
}

export function findBranch(agency: AgencyId, id: string | null | undefined): BranchDef | undefined {
  return AGENCIES[agency].branches.find((b) => b.id === id);
}

/** Bonus d'expérience hors mission sur les compétences de son siège. */
export const SEAT_XP_BONUS = 1;
