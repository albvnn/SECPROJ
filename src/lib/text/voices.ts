export type Piece = { kind: "text"; text: string } | { kind: "voice"; name: string; text: string };

/** Repère de voix intérieure : {{ombre}}, **{{Ombre}}**, {{ sang-froid }} :, etc. */
const TAG = /\*{0,2}\{\{\s*([^{}]+?)\s*\}\}\*{0,2}\s*(?:[—–:-]\s*)?/g;

/**
 * Découpe un texte de narration en paragraphes et en voix intérieures, quel que
 * soit le format employé : voix en début ou en milieu de paragraphe, repère seul
 * sur sa ligne avec le texte en dessous, plusieurs voix dans le même paragraphe.
 */
export function splitVoices(text: string): Piece[] {
  // Un repère à moitié écrit en fin de texte (pendant le streaming) n'est pas affiché.
  const cleaned = text.replace(/\*{0,2}\{\{[^}]*\}?$/, "");
  const pieces: Piece[] = [];
  for (const block of cleaned.split(/\n+/).map((b) => b.trim()).filter(Boolean)) {
    const matches = [...block.matchAll(TAG)];
    if (!matches.length) {
      pieces.push({ kind: "text", text: block });
      continue;
    }
    const before = block.slice(0, matches[0].index).trim();
    if (before) pieces.push({ kind: "text", text: before });
    matches.forEach((m, k) => {
      const start = m.index! + m[0].length;
      const end = k + 1 < matches.length ? matches[k + 1].index! : block.length;
      pieces.push({ kind: "voice", name: m[1], text: block.slice(start, end).trim() });
    });
  }
  // Repère seul sur sa ligne : la voix prend le paragraphe suivant.
  const out: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const next = pieces[i + 1];
    if (p.kind === "voice" && !p.text && next?.kind === "text") {
      out.push({ ...p, text: next.text });
      i++;
    } else out.push(p);
  }
  return out;
}
