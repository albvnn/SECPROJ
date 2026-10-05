/** Variante transparente d'une couleur (hex ou variable CSS), en pourcentage d'opacité. */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
