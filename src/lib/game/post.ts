/**
 * Le poste : ce que ton grade et ton affectation attendent de toi chaque semaine et chaque mois,
 * et les échelons qu'on gravit à l'intérieur d'un même poste (états de service).
 * Tenir ses responsabilités fait monter ; les négliger fait redescendre, et la hiérarchie le remarque.
 * Fonctions pures.
 */
import type { ActivityChoice, ActivityId, GameState, PostState, RankId } from "./types";

export interface Responsibility {
  id: string;
  label: string;
  hint: string;
  /** Les activités du planning qui la remplissent. */
  activities: ActivityId[];
  every: "semaine" | "mois";
}

export interface PostDef {
  id: string;
  title: string;
  /** Les quatre échelons du poste. */
  echelons: [string, string, string, string];
  responsibilities: Responsibility[];
}

/** États de service nécessaires pour chaque échelon. */
export const ECHELON_POINTS: readonly number[] = [0, 8, 20, 40];

/** Ce que chaque échelon apporte (cumulatif). */
export const ECHELON_PERKS = ["—", "Solde +10 %", "+1 renseignement au départ de chaque mission", "Dotation de mission +15 %"] as const;

const PHYSICAL: ActivityId[] = ["entrainement", "sport", "exercice"];

const POSTS: Record<string, PostDef> = {
  cadet: {
    id: "cadet",
    title: "Cadet de l'Académie",
    echelons: ["Bleu", "Cadet", "Ancien", "Major de promotion"],
    responsibilities: [
      { id: "cours", label: "Suivre les cours", hint: "Au moins un créneau de cours", activities: ["cours"], every: "semaine" },
      { id: "forme", label: "Tenir la forme", hint: "Entraînement, sport ou exercice", activities: PHYSICAL, every: "semaine" },
      { id: "terrain", label: "Exercice de terrain", hint: "Un exercice grandeur nature", activities: ["exercice"], every: "mois" },
    ],
  },
  officier: {
    id: "officier",
    title: "Officier de Station",
    echelons: ["Stagiaire", "Officier", "Officier confirmé", "Officier principal"],
    responsibilities: [
      { id: "forme", label: "Rester opérationnel", hint: "Entraînement, sport ou exercice", activities: PHYSICAL, every: "semaine" },
      { id: "veille", label: "Suivre ta région", hint: "Veille ou travail de Station", activities: ["veille", "antenne"], every: "mois" },
      { id: "sources", label: "Entretenir tes sources", hint: "Informateurs ou un lien", activities: ["informateurs", "relation"], every: "mois" },
      { id: "couverture", label: "Tenir ta couverture", hint: "Vie officielle ou petit boulot", activities: ["couverture", "job"], every: "mois" },
    ],
  },
  chef_station: {
    id: "chef_station",
    title: "Chef de Station",
    echelons: ["Intérimaire", "Chef de Station", "Chef confirmé", "Chef de Station émérite"],
    responsibilities: [
      { id: "station", label: "Diriger la Station", hint: "Activité Station", activities: ["antenne"], every: "semaine" },
      { id: "sources", label: "Tenir le réseau", hint: "Informateurs", activities: ["informateurs"], every: "mois" },
      { id: "seconds", label: "Former tes seconds", hint: "Tes seconds ou instruire", activities: ["escouade", "instruire"], every: "mois" },
    ],
  },
  titulaire: {
    id: "titulaire",
    title: "Titulaire du Cercle",
    echelons: ["Nouveau titulaire", "Titulaire", "Titulaire éprouvé", "Pilier du Cercle"],
    responsibilities: [
      { id: "forme", label: "Être prêt à partir", hint: "Entraînement, sport ou exercice", activities: PHYSICAL, every: "semaine" },
      { id: "branches", label: "Ménager les Branches", hint: "Passer du temps avec une Branche", activities: ["branche"], every: "mois" },
      { id: "transmettre", label: "Transmettre", hint: "Instruire les cadets ou tes seconds", activities: ["instruire", "escouade"], every: "mois" },
    ],
  },
  doyen: {
    id: "doyen",
    title: "Doyen du Cercle",
    echelons: ["Doyen désigné", "Doyen", "Doyen respecté", "Conscience du Cercle"],
    responsibilities: [
      { id: "transmettre", label: "Transmettre", hint: "Instruire", activities: ["instruire"], every: "semaine" },
      { id: "branches", label: "Arbitrer les Branches", hint: "Passer du temps avec une Branche", activities: ["branche"], every: "mois" },
      { id: "forme", label: "Garder la main", hint: "Entraînement, sport ou exercice", activities: PHYSICAL, every: "mois" },
    ],
  },
  controleur: {
    id: "controleur",
    title: "Contrôleur régional",
    echelons: ["Contrôleur adjoint", "Contrôleur", "Contrôleur confirmé", "Grand contrôleur"],
    responsibilities: [
      { id: "region", label: "Superviser ta région", hint: "Activité Région", activities: ["theatre"], every: "semaine" },
      { id: "veille", label: "Lire le monde", hint: "Veille", activities: ["veille"], every: "mois" },
      { id: "stations", label: "Visiter les Stations", hint: "Station, Branches ou instruire", activities: ["antenne", "branche", "instruire"], every: "mois" },
    ],
  },
  directeur: {
    id: "directeur",
    title: "Direction de l'agence",
    echelons: ["Directeur par intérim", "Directeur", "Directeur établi", "Légende de l'agence"],
    responsibilities: [
      { id: "agence", label: "Diriger l'agence", hint: "Activité Agence", activities: ["agence"], every: "semaine" },
      { id: "cercle", label: "Tenir le Cercle", hint: "Branches ou instruire", activities: ["branche", "instruire"], every: "mois" },
    ],
  },
};

const RANK_POST: Partial<Record<RankId, string>> = {
  aspirant: "cadet",
  agent: "officier",
  chef_station: "chef_station",
  titulaire: "titulaire",
  doyen: "doyen",
  controleur: "controleur",
  directeur: "directeur",
};

/** Le poste du personnage (aucun avant l'Académie ni en détention). */
export function postOf(state: Pick<GameState, "character">): PostDef | null {
  if (state.character.prison) return null;
  const id = RANK_POST[state.character.rank];
  return id ? POSTS[id] : null;
}

export const echelonOf = (points: number): number => ECHELON_POINTS.reduce<number>((e, p, i) => (points >= p ? i : e), 0);

export const freshPost = (id: string, day: number): PostState => ({ id, points: 0, echelon: 0, since: day, done: {}, lastReview: day, total: 0 });

/** Le poste tel qu'il est maintenant (réinitialisé si le personnage a changé de poste). */
export function currentPost(state: Pick<GameState, "character" | "post" | "world">): PostState | null {
  const def = postOf(state);
  if (!def) return null;
  return state.post?.id === def.id ? state.post : freshPost(def.id, state.world.day);
}

/** Où en est chaque responsabilité : faite cette semaine (ou ce mois), prévue au planning, ou en souffrance. */
export function responsibilityStatus(state: Pick<GameState, "character" | "post" | "world">, plan: ActivityChoice[]) {
  const def = postOf(state);
  const post = currentPost(state);
  if (!def || !post) return [];
  return def.responsibilities.map((r) => {
    const planned = plan.some((p) => r.activities.includes(p.activity));
    const last = post.done[r.id]?.at(-1);
    const doneThisMonth = last !== undefined && last >= post.lastReview;
    return { ...r, planned, done: r.every === "mois" ? doneThisMonth : false, last };
  });
}

/**
 * La semaine du poste : chaque responsabilité hebdomadaire tenue rapporte, négligée elle coûte ;
 * toutes les quatre semaines, le bilan du mois. Les échelons suivent les états de service.
 */
export function weeklyPost(state: GameState, plan: ActivityChoice[], day: number): { post: PostState | null; reputation: number; notices: string[]; lines: string[] } {
  const def = postOf(state);
  const notices: string[] = [];
  const lines: string[] = [];
  if (!def) return { post: state.post ?? null, reputation: 0, notices, lines };
  const prev = state.post?.id === def.id ? state.post : freshPost(def.id, day);
  const post: PostState = { ...prev, done: { ...prev.done } };
  let delta = 0;
  let reputation = 0;
  for (const r of def.responsibilities) {
    const met = plan.some((p) => r.activities.includes(p.activity));
    if (met) post.done[r.id] = [...(post.done[r.id] ?? []), day].slice(-8);
    if (r.every === "semaine") {
      if (met) delta += 1;
      else {
        delta -= 1;
        lines.push(`Responsabilité négligée : ${r.label.toLowerCase()}.`);
      }
    }
  }
  // Le bilan du mois.
  if (day + 7 - post.lastReview >= 28) {
    const missed: string[] = [];
    for (const r of def.responsibilities.filter((x) => x.every === "mois")) {
      const ok = (post.done[r.id] ?? []).some((d) => d >= post.lastReview);
      if (ok) delta += 2;
      else {
        delta -= 2;
        reputation -= 2;
        missed.push(r.label.toLowerCase());
      }
    }
    lines.push(missed.length ? `Bilan du mois (${def.title}) : on t'a reproché de négliger ${missed.join(", ")}.` : `Bilan du mois (${def.title}) : rien à redire.`);
    if (missed.length) notices.push(`Bilan du mois : ${missed.length} responsabilité${missed.length > 1 ? "s" : ""} négligée${missed.length > 1 ? "s" : ""}`);
    post.lastReview = day + 7;
  }
  post.points = Math.max(0, Math.min(60, post.points + delta));
  if (delta > 0) post.total = (post.total ?? 0) + delta;
  const echelon = echelonOf(post.points);
  if (echelon > prev.echelon) notices.push(`Échelon : ${def.echelons[echelon]}`);
  if (echelon < prev.echelon) notices.push(`Rétrogradé : ${def.echelons[echelon]}`);
  post.echelon = echelon;
  return { post, reputation, notices, lines };
}

/** Pour le narrateur et les écrans. */
export function postLine(state: Pick<GameState, "character" | "post" | "world">): string | null {
  const def = postOf(state);
  const post = currentPost(state);
  if (!def || !post) return null;
  return `${def.title}, échelon « ${def.echelons[post.echelon]} » (${post.points} états de service)`;
}
