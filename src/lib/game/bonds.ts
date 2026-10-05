/**
 * La vie des liens : les relations suivent l'effectif (un camarade breveté, muté, blessé…),
 * les amitiés mûrissent, une histoire peut naître (entre adultes, si le joueur le choisit) ou finir,
 * et les civils ont leur propre vie. Chaque étape est datée dans l'historique du lien.
 * Fonctions pures.
 */
import { chance, pick, type Rng } from "./rng";
import { operativeTitle } from "./roster";
import type { GameState, Operative, Relation, RelationKind } from "./types";
import { CITIES, findCity } from "@/lib/world/geo";

const HISTORY = 20;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[«»"]/g, "")
    .trim()
    .toLowerCase();

export function withHistory(r: Relation, day: number, text: string): Relation {
  const history = r.history ?? [];
  if (history.at(-1)?.text === text) return r;
  return { ...r, history: [...history, { day, text }].slice(-HISTORY) };
}

/** Le membre de l'effectif qui porte ce nom, s'il y en a un. */
export function findOperative(roster: Operative[], name: string): Operative | undefined {
  const n = norm(name);
  return roster.find((o) => norm(o.name) === n || (o.codename && norm(o.codename) === n) || n.includes(norm(o.name)));
}

/* ------------------------------------------------------------------ */
/* La trajectoire d'un lien                                            */
/* ------------------------------------------------------------------ */

/** Les liens personnels qui peuvent mûrir, du simple contact jusqu'à l'histoire d'amour. */
export const LADDER: RelationKind[] = ["contact", "ami", "proche", "amour"];

const ROMANCE_FROM = new Set<RelationKind>(["ami", "proche", "equipier", "allie", "contact"]);

/**
 * Une histoire est possible : entre adultes, avec quelqu'un de très proche, sans autre histoire en cours.
 * Le jeu ne la déclenche jamais seul : le joueur se déclare, le narrateur raconte la réponse.
 */
export function romancePossible(state: GameState, r: Relation, age: number): boolean {
  if (age < 18 || r.status !== "actif" || !ROMANCE_FROM.has(r.kind)) return false;
  if (r.affinity < 70 || (r.bond ?? 50) < 65) return false;
  const op = r.operativeId ? state.roster.find((o) => o.id === r.operativeId) : undefined;
  if (op && op.age < 18) return false;
  return !state.relations.some((x) => x.kind === "amour" && x.status === "actif" && x.name !== r.name);
}

/** Peut-on passer ce lien en « amour » ? (garde-fou pour le narrateur) */
export function romanceAllowed(state: GameState, r: Pick<Relation, "operativeId" | "name">, age: number): string | null {
  if (age < 18) return "pas d'histoire d'amour enregistrée avant 18 ans";
  const op = r.operativeId ? state.roster.find((o) => o.id === r.operativeId) : findOperative(state.roster, r.name);
  if (op && op.age < 18) return `${r.name} est mineur·e`;
  return null;
}

/* ------------------------------------------------------------------ */
/* L'effectif bouge : les fiches suivent                               */
/* ------------------------------------------------------------------ */

const STATUS_TEXT: Partial<Record<Operative["status"], string>> = {
  mort: "n'est pas rentré·e de mission",
  retraite: "a pris sa retraite",
  blesse: "a été blessé·e en mission",
};

/** Après la semaine de l'effectif : grade, poste, ville et statut des camarades sont reportés sur leur fiche. */
export function syncWithRoster(relations: Relation[], before: Operative[], after: Operative[], day: number): { relations: Relation[]; notices: string[]; lines: string[] } {
  const notices: string[] = [];
  const lines: string[] = [];
  const out = relations.map((r) => {
    if (!r.operativeId) return r;
    const o = after.find((x) => x.id === r.operativeId);
    const prev = before.find((x) => x.id === r.operativeId);
    if (!o || !prev) return r;
    let next = r;
    const title = operativeTitle(o);
    if (o.rank !== prev.rank || o.station !== prev.station || o.seat !== prev.seat || o.role !== prev.role) {
      const text = o.seat && o.seat !== prev.seat ? `obtient un siège : « ${o.codename} »` : o.role !== prev.role && o.role === "officier" ? `reçoit son Brevet : ${title}` : `devient ${title}`;
      next = withHistory({ ...next, role: title }, day, `${r.name} ${text}`);
      notices.push(`${r.name} ${text}`);
      lines.push(`${r.name} ${text}.`);
    }
    if (o.status !== prev.status && STATUS_TEXT[o.status]) {
      const text = STATUS_TEXT[o.status]!;
      next = withHistory({ ...next, status: o.status === "mort" ? "mort" : next.status }, day, `${r.name} ${text}`);
      notices.push(`${r.name} ${text}`);
      lines.push(`${r.name} ${text}.`);
    }
    if (o.cityId && o.cityId !== r.cityId && o.status !== "mort") {
      const city = findCity(o.cityId);
      next = { ...next, cityId: o.cityId, positionDay: o.positionDay, location: city ? city.name : next.location };
    }
    return next;
  });
  return { relations: out, notices, lines };
}

/* ------------------------------------------------------------------ */
/* La semaine des liens                                                */
/* ------------------------------------------------------------------ */

interface LifeEvent {
  weight: (r: Relation) => number;
  run: (r: Relation, day: number, rng: Rng) => { relation: Relation; text: string };
}

/** Ce qui arrive aux civils pendant que tu travailles. */
const LIFE: LifeEvent[] = [
  {
    weight: () => 2,
    run: (r, day, rng) => {
      const here = findCity(r.cityId);
      const pool = CITIES.filter((c) => c.id !== r.cityId && (!here || c.country === here.country));
      const to = pick(pool.length ? pool : CITIES, rng);
      return { relation: { ...r, cityId: to.id, positionDay: day, location: to.name }, text: `${r.name} a déménagé à ${to.name}` };
    },
  },
  {
    weight: () => 2,
    run: (r, _day, rng) => ({ relation: r, text: `${r.name} ${pick(["a changé de travail", "a été promu·e", "a perdu son emploi", "reprend des études"], rng)}` }),
  },
  {
    weight: () => 2,
    run: (r, _day, rng) => ({
      relation: r,
      text: `${r.name} a des ennuis (${pick(["dettes", "un problème avec la police", "un souci de santé", "quelqu'un qui le menace"], rng)}) et cherche à te joindre`,
    }),
  },
  {
    weight: (r) => ((r.bond ?? 50) >= 50 ? 2 : 0),
    run: (r, _day, rng) => ({ relation: { ...r, affinity: Math.min(100, r.affinity + 3) }, text: `${r.name} a une bonne nouvelle à t'annoncer (${pick(["des fiançailles", "une naissance", "un nouveau départ", "un concours réussi"], rng)})` }),
  },
  {
    weight: (r) => ((r.bond ?? 50) < 35 ? 3 : 0),
    run: (r) => ({ relation: { ...r, affinity: Math.max(-100, r.affinity - 5) }, text: `${r.name} répond de moins en moins à tes messages` }),
  },
];

/**
 * Une semaine dans la vie des liens : les amitiés mûrissent, les histoires d'amour négligées s'abîment
 * (et parfois finissent), et il arrive quelque chose à un civil de temps en temps.
 */
export function weeklyBonds(state: GameState, rng: Rng): { relations: Relation[]; notices: string[]; lines: string[] } {
  const day = state.world.day;
  const notices: string[] = [];
  const lines: string[] = [];
  let relations = state.relations.map((r) => {
    if (r.status !== "actif") return r;
    const since = day - (r.history?.at(-1)?.day ?? r.metDay ?? 0);
    // L'amitié mûrit avec le temps et l'attention.
    if (r.kind === "contact" && r.affinity >= 40 && (r.bond ?? 50) >= 60 && since >= 21) {
      notices.push(`${r.name} : une amitié`);
      return withHistory({ ...r, kind: "ami" as RelationKind }, day, `${r.name} devient un·e ami·e`);
    }
    if (r.kind === "ami" && r.affinity >= 65 && (r.bond ?? 50) >= 70 && since >= 42) {
      notices.push(`${r.name} : un·e proche`);
      return withHistory({ ...r, kind: "proche" as RelationKind }, day, `${r.name} devient un·e proche`);
    }
    // Une histoire qu'on néglige.
    if (r.kind === "amour") {
      const bond = r.bond ?? 50;
      if (bond < 30) {
        const hurt = { ...r, affinity: Math.max(-100, r.affinity - 8) };
        if (hurt.affinity < 0 && chance(0.5, rng)) {
          notices.push(`${r.name} a rompu`);
          lines.push(`${r.name} a rompu : trop d'absences, trop de silences.`);
          return withHistory({ ...hurt, kind: "ex" as RelationKind }, day, `Rupture avec ${r.name}`);
        }
        lines.push(`${r.name} te reproche ton silence.`);
        return withHistory(hurt, day, `${r.name} te reproche ton silence`);
      }
    }
    return r;
  });

  // La vie des civils : au plus un événement par semaine.
  const civilians = relations.filter((r) => r.status === "actif" && !r.operativeId && !["rival", "ennemi", "ex"].includes(r.kind));
  for (const r of civilians) {
    if (!chance(0.04, rng)) continue;
    const pool = LIFE.map((e) => ({ e, w: e.weight(r) })).filter((x) => x.w > 0);
    const total = pool.reduce((n, x) => n + x.w, 0);
    let roll = rng() * total;
    const ev = pool.find((x) => (roll -= x.w) < 0)?.e ?? pool[0]?.e;
    if (!ev) continue;
    const { relation, text } = ev.run(r, day, rng);
    relations = relations.map((x) => (x.name === r.name ? withHistory(relation, day, text) : x));
    notices.push(text);
    lines.push(`${text}.`);
    break;
  }
  return { relations, notices, lines };
}
