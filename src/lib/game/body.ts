/**
 * Le corps : taille, musculature, masse grasse, cicatrices. Il change chaque semaine selon ce qu'on
 * fait (entraînement, repos, fatigue, blessures, détention) et pèse un peu sur les jets physiques.
 * Fonctions pures.
 */
import { ATTRIBUTES, SKILLS } from "./rules";
import type { ActivityChoice, Body, BodyZone, Character, Gender, Injury, SkillId } from "./types";

/* ------------------------------------------------------------------ */
/* Silhouette de départ                                                */
/* ------------------------------------------------------------------ */

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

const FAT_RANGE: Record<Gender, [number, number, number]> = {
  // [minimum, normal, maximum] en % de masse grasse
  fille: [14, 23, 36],
  garcon: [7, 14, 30],
  nonbinaire: [10, 19, 33],
};

export const muscleCap = (c: Pick<Character, "attributes">) => Math.min(100, 30 + c.attributes.corps * 11 + c.attributes.geste * 3);

/** Le corps d'un personnage qui n'en a pas encore (création, ancienne sauvegarde). */
export function initialBody(c: Pick<Character, "identity" | "attributes">): Body {
  const g = c.identity.gender;
  const h = hash(`${c.identity.firstName}${c.identity.lastName}`);
  const base = g === "fille" ? 165 : g === "garcon" ? 177 : 171;
  const adultHeight = base + ((h % 15) - 7) + (c.attributes.corps - 3);
  const muscle = Math.min(muscleCap(c), 22 + c.attributes.corps * 9 + c.attributes.geste * 3);
  const fat = Math.round((FAT_RANGE[g][1] - (c.attributes.corps - 3) * 1.5 + ((h >> 4) % 5) - 2) * 10) / 10;
  return { adultHeight, muscle, fat, scars: [] };
}

/* ------------------------------------------------------------------ */
/* Mesures                                                             */
/* ------------------------------------------------------------------ */

/** La croissance s'arrête vers 16 ans pour les filles, 18 pour les garçons. */
export function heightAt(body: Body, gender: Gender, age: number): number {
  const end = gender === "fille" ? 16 : gender === "garcon" ? 18 : 17;
  const perYear = gender === "fille" ? 1.5 : gender === "garcon" ? 3 : 2.2;
  return Math.round(body.adultHeight - Math.max(0, end - age) * perYear);
}

/** Le poids se déduit de la taille, des muscles et de la masse grasse. */
export function weightOf(body: Body, gender: Gender, heightCm: number): number {
  const m = heightCm / 100;
  const leanIndex = (gender === "fille" ? 14.6 : gender === "garcon" ? 15.6 : 15.1) + body.muscle * 0.065;
  return Math.round(((m * m * leanIndex) / (1 - body.fat / 100)) * 10) / 10;
}

export interface BodyStats {
  height: number;
  weight: number;
  bmi: number;
  muscle: number;
  fat: number;
  build: string;
  fatLabel: string;
}

export function bodyStats(c: Pick<Character, "identity" | "attributes" | "body">, age: number): BodyStats {
  const body = c.body ?? initialBody(c);
  const height = heightAt(body, c.identity.gender, age);
  const weight = weightOf(body, c.identity.gender, height);
  return {
    height,
    weight,
    bmi: Math.round((weight / (height / 100) ** 2) * 10) / 10,
    muscle: Math.round(body.muscle),
    fat: Math.round(body.fat * 10) / 10,
    build: buildLabel(body.muscle),
    fatLabel: fatLabel(body.fat, c.identity.gender),
  };
}

export function buildLabel(muscle: number): string {
  return muscle < 28 ? "frêle" : muscle < 42 ? "mince" : muscle < 58 ? "athlétique" : muscle < 74 ? "musclé" : "puissant";
}

export function fatLabel(fat: number, gender: Gender): string {
  const [min, normal, max] = FAT_RANGE[gender];
  return fat <= min + 2 ? "très sec" : fat < normal - 2 ? "sec" : fat <= normal + 4 ? "normal" : fat < max - 3 ? "enveloppé" : "lourd";
}

/* ------------------------------------------------------------------ */
/* Effets en jeu                                                       */
/* ------------------------------------------------------------------ */

/** Ce que le corps ajoute ou retire à un jet, avec sa raison. */
export function bodyMod(c: Pick<Character, "identity" | "attributes" | "body">, skill: SkillId): { value: number; label: string } | null {
  const body = c.body;
  if (!body) return null;
  const [, normal, max] = FAT_RANGE[c.identity.gender];
  if ((skill === "force" || skill === "combat") && body.muscle >= 74) return { value: 1, label: "Carrure" };
  if ((skill === "force" || skill === "endurance") && body.muscle < 28) return { value: -1, label: "Frêle" };
  if ((skill === "athletisme" || skill === "vivacite") && body.fat >= max - 3) return { value: -1, label: "Lourd" };
  if (skill === "athletisme" && body.muscle >= 50 && body.fat <= normal) return { value: 1, label: "Affûté" };
  return null;
}

/* ------------------------------------------------------------------ */
/* La semaine                                                          */
/* ------------------------------------------------------------------ */

const PHYSICAL = new Set(["corps", "geste"]);

/** Le corps après une semaine : l'entraînement physique construit, l'inaction et les blessures défont. */
export function bodyWeek(c: Character, plan: ActivityChoice[], opts: { prison: boolean; fatigue: number }): { body: Body; notices: string[] } {
  const body = c.body ?? initialBody(c);
  const physical = plan.filter(
    (p) => (p.activity === "entrainement" && p.target && PHYSICAL.has(SKILLS[p.target as SkillId]?.attribute ?? "")) || p.activity === "evasion" || p.activity === "sport",
  ).length;
  // La musculation construit davantage ; le cardio brûle davantage.
  const muscu = plan.filter((p) => p.activity === "sport" && (p.target === "muscu" || p.target === "boxe")).length;
  const cardio = plan.filter((p) => p.activity === "sport" && p.target === "cardio").length;
  const rest = plan.filter((p) => p.activity === "repos" || p.activity === "loisirs").length;
  const hurt = (c.injuries ?? []).filter((i) => i.healDay !== undefined).length;
  const cap = muscleCap(c);
  const [min, , max] = FAT_RANGE[c.identity.gender];

  let muscle = body.muscle + physical * 1.3 + muscu * 0.8 - (physical === 0 ? 0.5 : 0) - hurt * 0.7 - (opts.prison ? 0.8 : 0);
  if (muscle > cap) muscle = Math.max(cap, body.muscle - 0.5);
  muscle = Math.max(12, Math.min(100, muscle));
  let fat = body.fat + rest * 0.3 - physical * 0.45 - cardio * 0.5 - (opts.fatigue >= 60 ? 0.3 : 0) - (opts.prison ? 0.4 : 0) + (c.morale <= 3 ? 0.3 : 0);
  fat = Math.max(min, Math.min(max, fat));
  const next: Body = { ...body, muscle: Math.round(muscle * 10) / 10, fat: Math.round(fat * 10) / 10, prev: { muscle: body.muscle, fat: body.fat } };

  const notices: string[] = [];
  if (buildLabel(next.muscle) !== buildLabel(body.muscle)) notices.push(`Silhouette : ${buildLabel(next.muscle)}`);
  return { body: next, notices };
}

/* ------------------------------------------------------------------ */
/* Blessures et cicatrices                                             */
/* ------------------------------------------------------------------ */

const ZONE_OF: Record<string, BodyZone | "bras" | "main" | "jambe"> = {
  "Côtes fêlées": "torse",
  "Arcade ouverte": "tete",
  "Bras entaillé": "bras",
  "Cheville foulée": "jambe",
  "Épaule démise": "bras",
  "Main coupée": "main",
  "Mauvaise chute": "jambe",
  Contusions: "abdomen",
  "Vieille fracture au genou": "jambe",
  Acouphène: "tete",
  "Main raide": "main",
  "Cicatrice au visage": "tete",
};

/** Les blessures qui laissent une marque visible une fois guéries. */
const SCAR_OF: Record<string, string> = {
  "Arcade ouverte": "Cicatrice à l'arcade",
  "Bras entaillé": "Cicatrice au bras",
  "Main coupée": "Cicatrice à la main",
  "Épaule démise": "Épaule fragile",
};

/** Où se trouve une blessure sur le corps (le côté dépend de la blessure elle-même). */
export function injuryZone(i: Pick<Injury, "id" | "name" | "malus">): BodyZone {
  const z = ZONE_OF[i.name];
  const side = hash(i.id || i.name) % 2 ? "d" : "g";
  if (z === "bras" || z === "main" || z === "jambe") return `${z}_${side}` as BodyZone;
  if (z) return z;
  // Une blessure inconnue : on la place d'après ce qu'elle gêne.
  const skill = Object.keys(i.malus)[0] as SkillId | undefined;
  const pole = skill ? SKILLS[skill]?.attribute : undefined;
  return pole === "geste" ? `main_${side}` : pole === "corps" ? "torse" : "tete";
}

/** Les blessures guéries laissent parfois une cicatrice. */
export function scarsFrom(c: Character, healed: Injury[], day: number): Body {
  const body = c.body ?? initialBody(c);
  const scars = [...body.scars];
  for (const i of healed) if (SCAR_OF[i.name]) scars.push({ zone: injuryZone(i), name: SCAR_OF[i.name], day });
  return { ...body, scars: scars.slice(-12) };
}

/** Une phrase pour le narrateur. */
export function bodyLine(c: Pick<Character, "identity" | "attributes" | "body" | "injuries">, age: number): string {
  const s = bodyStats(c, age);
  const marks = [...(c.body?.scars ?? []).map((x) => x.name.toLowerCase()), ...(c.injuries ?? []).filter((i) => i.healDay === undefined).map((i) => i.name.toLowerCase())];
  return `${(s.height / 100).toFixed(2).replace(".", ",")} m, ${Math.round(s.weight)} kg, ${s.build}, ${s.fatLabel}${marks.length ? ` ; ${marks.join(", ")}` : ""}`;
}

export const POLE_COLOR = ATTRIBUTES.corps.color;
