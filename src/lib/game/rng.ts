/** Petits utilitaires d'aléatoire. `rng` renvoie un nombre dans [0, 1[. */
export type Rng = () => number;

export const pick = <T,>(list: readonly T[], rng: Rng = Math.random): T => list[Math.floor(rng() * list.length)];

export function pickWeighted<T>(items: readonly T[], weight: (t: T) => number, rng: Rng = Math.random): T {
  const total = items.reduce((n, t) => n + Math.max(0, weight(t)), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function shuffle<T>(list: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const randInt = (min: number, max: number, rng: Rng = Math.random) => min + Math.floor(rng() * (max - min + 1));

export const chance = (p: number, rng: Rng = Math.random) => rng() < p;

export const d6 = (rng: Rng = Math.random) => 1 + Math.floor(rng() * 6);

export function uid(rng: Rng = Math.random): string {
  return Math.floor(rng() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
}

/** Probabilité de réussir 2d6 + bonus ≥ seuil. */
export function successChance(bonus: number, dc: number): number {
  let ok = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + bonus >= dc) ok++;
  return ok / 36;
}
