import { normalizeState } from "@/lib/game/engine";
import type { GameState, WireState } from "@/lib/game/types";

const INDEX_KEY = "seraphin:saves";
const SAVE_KEY = (id: string) => `seraphin:save:${id}`;

export interface SaveSummary {
  id: string;
  name: string;
  codename: string | null;
  rank: GameState["character"]["rank"];
  /** Absent sur les sauvegardes d'avant le Concordat. */
  agency?: GameState["character"]["identity"]["agency"];
  phase: GameState["world"]["phase"];
  chapter: string;
  updatedAt: number;
}

function summarize(s: GameState): SaveSummary {
  return {
    id: s.id,
    name: `${s.character.identity.firstName} ${s.character.identity.lastName}`.trim(),
    codename: s.character.codename,
    rank: s.character.rank,
    agency: s.character.identity.agency,
    phase: s.world.phase,
    chapter: s.world.chapter,
    updatedAt: s.updatedAt,
  };
}

function readIndex(): SaveSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SaveSummary[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function listSaves(): SaveSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Sauvegarde brute, même d'un format qui n'est plus jouable (pour l'exporter). */
export function loadRaw(id: string): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY(id));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function loadSave(id: string): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY(id));
    const state = raw ? (JSON.parse(raw) as GameState) : null;
    // Les sauvegardes d'avant le Concordat (versions 1 et 2) ne sont plus lisibles ; la v3 est mise à jour.
    return (state?.version as number) === 3 || state?.version === 4 ? normalizeState(state as GameState) : null;
  } catch {
    return null;
  }
}

/** Renvoie false si le stockage du navigateur est plein ou indisponible. */
export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY(state.id), JSON.stringify(state));
    const index = readIndex().filter((s) => s.id !== state.id);
    index.push(summarize(state));
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(id: string) {
  try {
    localStorage.removeItem(SAVE_KEY(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((s) => s.id !== id)));
  } catch {
    /* rien à faire */
  }
}

export function exportSave(state: GameState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = `${state.character.identity.firstName}-${state.character.identity.lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9-]/g, "");
  a.href = url;
  a.download = `lucerne-${name || "dossier"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file: File): Promise<GameState> {
  const data = JSON.parse(await file.text()) as GameState;
  if ((data as { version?: number })?.version === 1 || (data as { version?: number })?.version === 2) {
    throw new Error("Cette sauvegarde date d'avant le Concordat : elle n'est plus compatible. Crée un nouveau personnage.");
  }
  if (((data?.version as number) !== 3 && data?.version !== 4) || !data.character || !data.world || !Array.isArray(data.log)) {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  const state = normalizeState(data);
  if (!saveGame(state)) throw new Error("Stockage du navigateur plein.");
  return state;
}

/** Ce qu'on envoie au serveur : seulement la partie du journal pas encore archivée. */
export function toWire(state: GameState): WireState {
  return { ...state, log: state.log.slice(state.chronicleUpTo) };
}

/** Recompose l'état complet à partir de la réponse du serveur. */
export function fromWire(before: GameState, wire: WireState): GameState {
  return { ...wire, log: [...before.log.slice(0, wire.chronicleUpTo), ...wire.log] };
}
