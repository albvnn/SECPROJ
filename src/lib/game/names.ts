import type { AgencyId, Gender } from "./types";

/** Prénoms et noms par culture, pour que chaque nationalité sonne juste. */
interface Culture {
  first: Record<Gender, string[]>;
  last: string[];
}

const C: Record<string, Culture> = {
  fr: {
    first: {
      garcon: ["Malo", "Elias", "Noé", "Sacha", "Gabin", "Timéo", "Aurèle", "Côme", "Ilyes", "Yanis", "Léon", "Bastien"],
      fille: ["Inès", "Lou", "Nour", "Maëlys", "Capucine", "Romane", "Albane", "Ninon", "Jade", "Margaux", "Salomé", "Elsa"],
      nonbinaire: ["Sasha", "Alix", "Charlie", "Eden", "Camille", "Noa", "Swann", "Jules"],
    },
    last: ["Marceau", "Benali", "Rousseau", "Diallo", "Vasseur", "Morel", "Lefèvre", "Garnier", "Castel", "Haddad", "Perrin", "Delaunay", "Ferrand", "Moulin"],
  },
  de: {
    first: { garcon: ["Jonas", "Finn", "Leon", "Matthias", "Emil", "Lukas"], fille: ["Clara", "Lena", "Mila", "Hanna", "Greta", "Sophie"], nonbinaire: ["Kim", "Robin", "Luca"] },
    last: ["Keller", "Brandt", "Hoffmann", "Vogel", "Schreiber", "Krüger", "Lindner", "Bauer"],
  },
  it: {
    first: { garcon: ["Luca", "Matteo", "Lorenzo", "Tommaso", "Dario"], fille: ["Giulia", "Chiara", "Alessia", "Bianca", "Sofia"], nonbinaire: ["Andrea", "Gabri"] },
    last: ["Rossi", "Ferrante", "Moretti", "Conti", "Galli", "Marchetti", "Bruno"],
  },
  es: {
    first: { garcon: ["Mateo", "Hugo", "Álvaro", "Pablo", "Iker"], fille: ["Lucía", "Carmen", "Irene", "Marta", "Alba"], nonbinaire: ["Ariel", "Dani"] },
    last: ["García", "Navarro", "Ortega", "Serrano", "Vidal", "Romero"],
  },
  pt: {
    first: { garcon: ["Tomás", "Duarte", "Rafael", "Gonçalo"], fille: ["Beatriz", "Inês", "Leonor", "Mariana"], nonbinaire: ["Alex"] },
    last: ["Da Silva", "Ferreira", "Costa", "Almeida", "Sousa", "Pereira"],
  },
  en: {
    first: { garcon: ["Oliver", "Callum", "Rory", "Harry", "Owen", "Finlay"], fille: ["Isla", "Freya", "Maisie", "Eleanor", "Saoirse", "Niamh"], nonbinaire: ["Rowan", "Morgan", "Sam"] },
    last: ["Hughes", "MacLeod", "Fraser", "O'Connor", "Whitmore", "Ashdown", "Kerr", "Doyle"],
  },
  nordic: {
    first: { garcon: ["Henrik", "Oskar", "Elias", "Aksel", "Magnus", "Eero"], fille: ["Freja", "Ingrid", "Astrid", "Saga", "Aino", "Sigrid"], nonbinaire: ["Kim", "Alva"] },
    last: ["Lindqvist", "Halvorsen", "Nyberg", "Virtanen", "Sørensen", "Eklund", "Dahl"],
  },
  slav: {
    first: { garcon: ["Mateusz", "Tomáš", "Andriy", "Oleksiy", "Dominik", "Jakub"], fille: ["Zofia", "Ilona", "Daryna", "Kateřina", "Milena", "Oksana"], nonbinaire: ["Sasha", "Nika"] },
    last: ["Kowalski", "Novák", "Shevchenko", "Horvat", "Popescu", "Wiśniewski", "Kovalenko", "Ozoliņš"],
  },
  gr: {
    first: { garcon: ["Nikolaos", "Yannis", "Stavros", "Petros"], fille: ["Eleni", "Danaé", "Ariadni", "Zoé"], nonbinaire: ["Ari"] },
    last: ["Papadopoulos", "Kostas", "Andreou", "Mavros", "Laskaris"],
  },
  nl: {
    first: { garcon: ["Daan", "Bram", "Thijs", "Arne"], fille: ["Fenna", "Lotte", "Noor", "Elise"], nonbinaire: ["Robin"] },
    last: ["Vermeulen", "De Vries", "Peeters", "Janssens", "Van Dijk"],
  },
  us: {
    first: { garcon: ["Ethan", "Caleb", "Marcus", "Tyler", "Isaiah", "Wyatt", "Jalen"], fille: ["Ava", "Harper", "Maya", "Aaliyah", "Kenzie", "Riley", "Grace"], nonbinaire: ["River", "Quinn", "Sky", "Jordan"] },
    last: ["Carter", "Brooks", "Whitaker", "Hayes", "Okafor", "Reyes", "Tremblay", "Lawson", "Mitchell", "Nakamura"],
  },
  ja: {
    first: { garcon: ["Haruto", "Ren", "Sota", "Kaito"], fille: ["Yuna", "Sakura", "Hina", "Aoi"], nonbinaire: ["Hikaru", "Rei"] },
    last: ["Tanaka", "Nakamura", "Kobayashi", "Watanabe", "Ishikawa"],
  },
  ko: {
    first: { garcon: ["Minjun", "Seojun", "Jiho"], fille: ["Seo-yeon", "Ji-woo", "Ha-eun"], nonbinaire: ["Min"] },
    last: ["Kim", "Park", "Choi", "Jung", "Kang"],
  },
  ph: {
    first: { garcon: ["Rizal", "Paolo", "Miguel"], fille: ["Andrea", "Bea", "Kristine"], nonbinaire: ["Jun"] },
    last: ["Santos", "Reyes", "Dela Cruz", "Bautista"],
  },
  la: {
    first: { garcon: ["Mateo", "Santiago", "Joaquín", "Diego", "Thiago"], fille: ["Valentina", "Camila", "Renata", "Sofía", "Isabela"], nonbinaire: ["Ari", "Dani"] },
    last: ["Navarro", "Mendoza", "Castillo", "Vargas", "Herrera", "Fuentes"],
  },
  br: {
    first: { garcon: ["Thiago", "Rafael", "Davi", "Caio"], fille: ["Isabela", "Larissa", "Beatriz", "Yasmin"], nonbinaire: ["Alex"] },
    last: ["Santos", "Oliveira", "Souza", "Carvalho", "Ribeiro"],
  },
  in: {
    first: { garcon: ["Arjun", "Rohan", "Nikhil", "Kabir", "Vikram"], fille: ["Ananya", "Priya", "Meera", "Ishani", "Kavya"], nonbinaire: ["Kiran", "Ashwin"] },
    last: ["Sharma", "Iyer", "Mehta", "Reddy", "Kapoor", "Banerjee", "Nair"],
  },
  sea: {
    first: { garcon: ["Bao", "Arif", "Somchai", "Rizky", "Hafiz"], fille: ["Linh", "Dewi", "Mei", "Siti", "Mali"], nonbinaire: ["Tai", "Sora"] },
    last: ["Nguyen", "Wijaya", "Tan", "Lim", "Rahman", "Chaiyaporn", "Tran"],
  },
  ar: {
    first: { garcon: ["Omar", "Karim", "Youssef", "Faisal", "Tariq"], fille: ["Layla", "Yasmine", "Nour", "Amira", "Salma"], nonbinaire: ["Noor"] },
    last: ["Al-Masri", "Haddad", "Al-Farsi", "Nasser", "Khalil", "Mansour"],
  },
  tr: {
    first: { garcon: ["Emre", "Kerem", "Mert", "Can"], fille: ["Elif", "Defne", "Zeynep", "Ece"], nonbinaire: ["Deniz"] },
    last: ["Yılmaz", "Demir", "Kaya", "Aydın", "Öztürk"],
  },
  af: {
    first: { garcon: ["Chidi", "Kwame", "Tunde", "Baraka", "Thabo"], fille: ["Amara", "Zuri", "Nia", "Ayo", "Lerato"], nonbinaire: ["Sade"] },
    last: ["Okafor", "Mensah", "Adeyemi", "Otieno", "Nkosi", "Mwangi"],
  },
};

/** Culture des noms par nationalité. */
const COUNTRY_CULTURE: Record<string, string> = {
  France: "fr", Belgique: "fr", Luxembourg: "fr", Suisse: "fr", Monaco: "fr",
  Allemagne: "de", Autriche: "de",
  Italie: "it", Malte: "it",
  Espagne: "es",
  Portugal: "pt",
  "Royaume-Uni": "en", Écosse: "en", Irlande: "en",
  Suède: "nordic", Danemark: "nordic", Finlande: "nordic", Norvège: "nordic", Islande: "nordic", Estonie: "nordic",
  Pologne: "slav", Tchéquie: "slav", Slovaquie: "slav", Hongrie: "slav", Roumanie: "slav", Bulgarie: "slav", Croatie: "slav", Slovénie: "slav", Lettonie: "slav", Lituanie: "slav", Ukraine: "slav",
  Grèce: "gr", Chypre: "gr",
  "Pays-Bas": "nl",
  "États-Unis": "us", Canada: "us", Australie: "en", "Nouvelle-Zélande": "en",
  Japon: "ja",
  "Corée du Sud": "ko",
  Philippines: "ph",
  Argentine: "la", Mexique: "la",
  Brésil: "br",
  Inde: "in",
  Indonésie: "sea", Malaisie: "sea", Singapour: "sea", Vietnam: "sea", Thaïlande: "sea",
  "Émirats arabes unis": "ar", "Arabie saoudite": "ar", Qatar: "ar", Égypte: "ar",
  Turquie: "tr",
  "Afrique du Sud": "af", Nigeria: "af", Kenya: "af",
};

export function cultureOf(country: string): Culture {
  return C[COUNTRY_CULTURE[country] ?? "fr"];
}

/** Un nom plausible pour cette nationalité. */
export function randomName(country: string, gender: Gender, rng: () => number = Math.random): { first: string; last: string } {
  const c = cultureOf(country);
  const pick = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
  return { first: pick(c.first[gender]), last: pick(c.last) };
}

/** Quelques villes par pays membre, pour le lieu de naissance tiré au hasard. */
export const BIRTHPLACES: Record<string, string[]> = {
  France: ["Marseille", "Roubaix", "Lyon", "Saint-Denis", "Brest", "Toulouse", "Nice", "Strasbourg", "Le Havre", "Grenoble"],
  Allemagne: ["Berlin", "Hambourg", "Leipzig", "Cologne", "Duisbourg"],
  Italie: ["Naples", "Turin", "Palerme", "Milan", "Gênes"],
  Espagne: ["Madrid", "Barcelone", "Séville", "Bilbao", "Valence"],
  Portugal: ["Lisbonne", "Porto", "Coimbra"],
  "Royaume-Uni": ["Londres", "Manchester", "Liverpool", "Belfast", "Cardiff"],
  Écosse: ["Glasgow", "Édimbourg", "Aberdeen", "Dundee"],
  Irlande: ["Dublin", "Cork", "Galway"],
  Belgique: ["Bruxelles", "Anvers", "Liège", "Charleroi"],
  "Pays-Bas": ["Rotterdam", "Amsterdam", "Utrecht"],
  Luxembourg: ["Luxembourg", "Esch-sur-Alzette"],
  Suisse: ["Genève", "Lausanne", "Zurich", "Bâle"],
  Autriche: ["Vienne", "Graz", "Linz"],
  Pologne: ["Varsovie", "Gdańsk", "Łódź", "Cracovie"],
  Tchéquie: ["Prague", "Brno", "Ostrava"],
  Slovaquie: ["Bratislava", "Košice"],
  Hongrie: ["Budapest", "Debrecen"],
  Roumanie: ["Bucarest", "Constanța", "Cluj-Napoca"],
  Bulgarie: ["Sofia", "Varna"],
  Grèce: ["Athènes", "Le Pirée", "Thessalonique"],
  Chypre: ["Nicosie", "Limassol"],
  Malte: ["La Valette", "Birgu"],
  Croatie: ["Split", "Zagreb", "Rijeka"],
  Slovénie: ["Ljubljana", "Maribor"],
  Suède: ["Malmö", "Göteborg", "Stockholm"],
  Danemark: ["Copenhague", "Aarhus"],
  Finlande: ["Helsinki", "Tampere"],
  Norvège: ["Oslo", "Bergen", "Tromsø"],
  Islande: ["Reykjavik"],
  Estonie: ["Tallinn", "Narva"],
  Lettonie: ["Riga", "Daugavpils"],
  Lituanie: ["Vilnius", "Kaunas"],
  Ukraine: ["Kyiv", "Odessa", "Kharkiv", "Lviv"],
  "États-Unis": ["Detroit", "Baltimore", "El Paso", "Oakland", "New York", "Chicago", "La Nouvelle-Orléans"],
  Canada: ["Montréal", "Toronto", "Winnipeg", "Vancouver"],
  Australie: ["Sydney", "Darwin", "Melbourne", "Perth"],
  "Nouvelle-Zélande": ["Auckland", "Wellington", "Rotorua"],
  Japon: ["Osaka", "Tokyo", "Kitakyūshū", "Sapporo"],
  "Corée du Sud": ["Busan", "Séoul", "Incheon"],
  Philippines: ["Manille", "Cebu", "Davao"],
  Argentine: ["Buenos Aires", "Rosario", "Córdoba"],
  Inde: ["Mumbai", "Calcutta", "Chennai", "Delhi"],
  Indonésie: ["Jakarta", "Surabaya", "Makassar"],
  Singapour: ["Singapour"],
  Malaisie: ["Kuala Lumpur", "George Town", "Johor Bahru"],
  Vietnam: ["Hô Chi Minh-Ville", "Hanoï", "Haïphong"],
  Thaïlande: ["Bangkok", "Chiang Mai", "Pattaya"],
  "Émirats arabes unis": ["Dubaï", "Abou Dabi", "Charjah"],
  "Arabie saoudite": ["Riyad", "Djeddah"],
  Qatar: ["Doha"],
  Turquie: ["Istanbul", "Izmir", "Ankara"],
  Égypte: ["Le Caire", "Alexandrie"],
  Brésil: ["Rio de Janeiro", "São Paulo", "Salvador", "Recife"],
  Mexique: ["Mexico", "Tijuana", "Monterrey", "Oaxaca"],
  "Afrique du Sud": ["Johannesburg", "Le Cap", "Durban"],
  Nigeria: ["Lagos", "Abuja", "Port Harcourt"],
  Kenya: ["Nairobi", "Mombasa", "Kisumu"],
};

/** Noms de code des agents, dans le style de chaque agence. */
export const CODENAMES: Record<AgencyId, string[]> = {
  argos: [
    "Atlas", "Icare", "Méduse", "Thésée", "Nyx", "Fenrir", "Morrigan", "Perun", "Cassandre", "Freya", "Ariane", "Orphée", "Hécate",
    "Persée", "Antigone", "Odin", "Loki", "Brigid", "Svarog", "Électre", "Prométhée", "Pénélope", "Achille", "Circé", "Janus",
    "Minerve", "Mercure", "Vulcain", "Diane", "Tyr", "Baldr", "Skadi", "Lugh", "Dagda", "Veles", "Mokosh", "Hermione", "Calypso",
    "Ajax", "Niobé", "Thalie", "Héra", "Castor", "Pollux", "Sigurd", "Epona", "Cerbère", "Andromaque",
  ],
  meridian: [
    "Vega", "Rigel", "Altair", "Lyra", "Orion", "Cassiopeia", "Antares", "Sirius", "Deneb", "Andromeda", "Polaris", "Arcturus",
    "Capella", "Aldebaran", "Spica", "Betelgeuse", "Mira", "Castor", "Bellatrix", "Electra", "Maia", "Nova", "Draco", "Cygnus",
    "Pegasus", "Hydra", "Corvus", "Lynx", "Perseus", "Carina", "Auriga", "Fomalhaut", "Canopus", "Hadar", "Shaula", "Mintaka",
  ],
  monsoon: [
    "Arashi", "Baram", "Kilat", "Hawa", "Kaminari", "Ombak", "Taifun", "Kabut", "Aandhi", "Sirocco", "Haboob", "Meltem", "Garua",
    "Pampero", "Kaze", "Chinook", "Bora", "Khamsin", "Shamal", "Barat", "Angin", "Halimun", "Toofan", "Varsha", "Megh", "Bijli",
    "Tsunami", "Amihan", "Habagat", "Zonda", "Harmattan", "Simoun", "Sumatra", "Brisa", "Yamase", "Oroshi",
  ],
};
