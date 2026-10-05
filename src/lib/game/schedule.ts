/**
 * Tout ce qui est daté dans la vie du personnage, réuni pour l'agenda du téléphone :
 * devoirs, missions qui expirent, réponses attendues, guérisons, anniversaire, grands rendez-vous.
 */
import { addDays, parseIso } from "./calendar";
import { ACTIVITIES } from "./planner";
import { TOPICS } from "./sources";
import type { GameState } from "./types";
import { upcoming } from "@/lib/world/agenda";

export type ScheduleKind = "devoir" | "mission" | "reponse" | "sante" | "perso" | "monde" | "repos";

export interface ScheduleItem {
  /** Jour de jeu (comme `world.day`). */
  day: number;
  /** Date réelle AAAA-MM-JJ. */
  date: string;
  kind: ScheduleKind;
  title: string;
  detail?: string;
  /** Urgent : à moins d'une semaine et lourd de conséquences. */
  urgent?: boolean;
  cityId?: string;
  /** Pour ouvrir ce qui va avec (mission à préparer, réponse attendue…). */
  ref?: string;
}

export const SCHEDULE_KINDS: Record<ScheduleKind, { label: string; icon: string; color: string }> = {
  devoir: { label: "Devoir", icon: "✎", color: "var(--color-partial)" },
  mission: { label: "Mission", icon: "⌖", color: "var(--color-fail)" },
  reponse: { label: "Réponse", icon: "⌕", color: "var(--pole-esprit)" },
  sante: { label: "Santé", icon: "✚", color: "var(--pole-corps)" },
  perso: { label: "Perso", icon: "♥", color: "var(--pole-ame)" },
  monde: { label: "Monde", icon: "◎", color: "var(--color-brass)" },
  repos: { label: "Repos", icon: "☾", color: "var(--color-muted)" },
};

export const startIso = (state: GameState) => state.world.startDate ?? "2026-09-01";
export const dayToIso = (state: GameState, day: number) => addDays(startIso(state), day);
export const isoToDay = (state: GameState, iso: string) => Math.round((parseIso(iso).getTime() - parseIso(startIso(state)).getTime()) / 86_400_000);

/** Les événements des `horizon` prochains jours (et ceux en cours), triés. */
export function schedule(state: GameState, horizon = 120): ScheduleItem[] {
  const today = state.world.day;
  const items: ScheduleItem[] = [];
  const push = (it: Omit<ScheduleItem, "date">) => it.day >= today - 1 && it.day <= today + horizon && items.push({ ...it, date: dayToIso(state, it.day) });

  for (const d of state.duties)
    if (d.status === "ouvert")
      push({
        day: d.dueDay,
        kind: "devoir",
        title: d.title,
        detail: `${ACTIVITIES[d.activity].icon} ${ACTIVITIES[d.activity].label} · ${d.progress}/${d.required}`,
        urgent: d.dueDay - today <= 7,
        ref: d.id,
      });
  for (const o of state.offers)
    push({
      day: o.expiresDay,
      kind: "mission",
      title: `${o.assigned ? "Départ exigé" : "Expire"} : ${o.title.split(" — ")[0]}`,
      detail: o.objective,
      urgent: o.assigned && o.expiresDay - today <= 7,
      cityId: o.cityId,
      ref: o.id,
    });
  for (const r of state.knowledge?.requests ?? [])
    push({ day: r.readyDay, kind: "reponse", title: `${TOPICS[r.kind].label} : ${r.label}`, detail: r.sourceLabel, ref: r.id });
  for (const i of state.character.injuries ?? []) if (i.healDay !== undefined && i.healDay > today) push({ day: i.healDay, kind: "sante", title: `Guérison : ${i.name}` });
  if (state.world.restUntil > today) push({ day: state.world.restUntil, kind: "repos", title: "Fin de la récupération", detail: "De nouveau envoyable en mission." });

  // L'anniversaire : il revient chaque année.
  const birth = state.character.identity.birthDate;
  if (birth) {
    const now = parseIso(dayToIso(state, today));
    for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const iso = `${y}${birth.slice(4)}`;
      push({ day: isoToDay(state, iso), kind: "perso", title: "Ton anniversaire", detail: `${y - Number(birth.slice(0, 4))} ans` });
    }
  }

  for (const { event, start } of upcoming(state, horizon))
    push({ day: isoToDay(state, start), kind: "monde", title: event.name, detail: event.kind, cityId: event.cityId });

  return items.sort((a, b) => a.day - b.day || Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}
