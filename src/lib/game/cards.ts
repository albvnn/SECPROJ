/**
 * Les cartes du récit : ce que le jeu met lui-même en scène au moment où ça arrive
 * (bilan de semaine, ordre de mission, étape, débriefing, promotion).
 * Tout est rédigé ici pour l'affichage : une carte reste lisible même quand l'état a changé depuis.
 */
import { AGENCIES, findBranch, findSeat } from "./agencies";
import { formatDate } from "./calendar";
import { currentDate } from "./engine";
import { REST_DAYS, currentNode, type NodeOutcome } from "./missions";
import { ACTIVITIES } from "./planner";
import { MISSION_IMPORTANCE, RANKS, SKILLS, missionBonus, missionMerit } from "./rules";
import type { ActivityChoice, GameState, GaugeShift, Mission, RankId, StoryCard, StoryDoc } from "./types";
import { findCity, findCountry } from "@/lib/world/geo";
import { findFaction } from "@/lib/world/factions";

type NodeOutcomeLike = Pick<NodeOutcome, "outcome" | "notices" | "finished">;

function targetLabel(state: GameState, p: ActivityChoice): string | undefined {
  if (!p.target) return undefined;
  const c = state.character;
  return (
    SKILLS[p.target as keyof typeof SKILLS]?.label ??
    findBranch(c.identity.agency, p.target)?.name ??
    c.legends.find((l) => l.id === p.target)?.name ??
    state.duties.find((d) => d.id === p.target)?.title ??
    findCity(p.target)?.name ??
    AGENCIES[p.target as keyof typeof AGENCIES]?.name ??
    p.target
  );
}

/** Le bilan d'une semaine jouée : les trois créneaux, ce qui a bougé, et le détail. */
export function weekCard(before: GameState, after: GameState, plan: ActivityChoice[], lines: string[], event: boolean, weeks = 1, stop: string | null = null): StoryCard {
  const a = before.character;
  const b = after.character;
  const deltas: { label: string; value: number; unit?: string; good: boolean }[] = [];
  const push = (label: string, value: number, goodWhenUp: boolean, unit?: string) => {
    const v = Math.round(value * 10) / 10;
    if (v) deltas.push({ label, value: v, unit, good: goodWhenUp ? v > 0 : v < 0 });
  };
  push("Santé", b.health - a.health, true);
  push("Moral", b.morale - a.morale, true);
  push("Fatigue", b.fatigue - a.fatigue, false);
  push("Couverture", b.cover - a.cover, true);
  push("Mérite", b.merit - a.merit, true);
  push("Solde", b.money - a.money, true, "€");
  if (a.prison && b.prison) push("Évasion", b.prison.escape - a.prison.escape, true);
  return {
    type: "semaine",
    fromDay: before.world.day,
    toDay: after.world.day,
    dateLabel: formatDate(currentDate(after)),
    plan: plan.map((p) => {
      const def = ACTIVITIES[p.activity];
      return { icon: def?.icon ?? "·", label: def?.label ?? p.activity, detail: targetLabel(before, p) };
    }),
    deltas,
    lines,
    event,
    weeks,
    stop,
  };
}

/** L'anniversaire : un moment à part. */
export function birthdayCard(state: GameState, age: number, date: string): StoryCard {
  const c = state.character;
  return { type: "anniversaire", name: c.codename ? `« ${c.codename} »` : c.identity.firstName, age, dateLabel: formatDate(date) };
}

/** L'ordre de mission, au départ. */
export function briefingCard(state: GameState, notices: string[]): StoryCard | null {
  const m = state.mission;
  if (!m) return null;
  const city = findCity(m.cityId);
  const team = m.team
    .map((id) => state.roster.find((o) => o.id === id))
    .filter((o) => o !== undefined)
    .map((o) => (o.codename ? `« ${o.codename} » ${o.name}` : o.name));
  return {
    type: "briefing",
    name: m.name,
    importance: m.importance,
    kind: m.kind,
    city: city?.name ?? "",
    country: findCountry(city?.country ?? "")?.name ?? "",
    objective: m.objective,
    target: m.target,
    faction: findFaction(m.faction)?.name ?? "",
    cover: m.cover,
    team,
    steps: m.nodes.map((n) => ({ title: n.title, key: n.key, secondary: n.type === "secondaire", dilemma: n.type === "dilemme", fork: Boolean(n.alt) })),
    notes: notices.filter((n) => !n.startsWith("Mission ouverte")),
  };
}

function gauges(before: Mission, after: Mission): GaugeShift[] {
  return [
    { label: "Exposition", before: before.exposure, after: after.exposure, bad: true, max: 100 },
    { label: "Alerte", before: before.alert, after: after.alert, bad: true, max: 100 },
    { label: "Renseignement", before: before.intel, after: after.intel, max: Math.max(6, after.intel, before.intel) },
  ];
}

/** Une étape de mission jouée (et, si elle termine la mission, le débriefing). */
export function stepCards(before: GameState, after: GameState, r: NodeOutcomeLike, approach: string): StoryCard[] {
  const m0 = before.mission;
  if (!m0) return [];
  const m1 = r.finished ? after.lastMission : after.mission;
  const node = currentNode(m0);
  const cards: StoryCard[] = [];
  if (m1)
    cards.push({
      type: "etape",
      title: node?.title ?? "Étape",
      approach,
      outcome: r.outcome,
      gauges: gauges(m0, m1),
      notes: r.notices.filter((n) => !/^Mérite|^Prime|point de compétence|^\+/.test(n)).slice(0, 4),
      step: m0.current + 1,
      steps: m0.nodes.length,
    });
  if (r.finished && after.lastMission) {
    const m = after.lastMission;
    const youth = m.kind === "jeunesse";
    cards.push({
      type: "bilan",
      name: m.name,
      result: r.finished,
      merit: youth ? 0 : missionMerit(m.importance, r.finished) + (m.bonusMerit ?? 0),
      bonus: youth ? 0 : missionBonus(m.importance, r.finished),
      lines: r.notices.filter((n) => !/^Mérite|^Prime/.test(n)),
      restDays: Math.max(0, after.world.restUntil - after.world.day) || REST_DAYS[m.importance],
      ...(after.character.prison && !before.character.prison
        ? { arrested: `${after.character.prison.captor}, à ${findCity(after.character.prison.cityId)?.name ?? "?"}` }
        : {}),
    });
  }
  return cards;
}

/** Une promotion accordée. */
export function promotionCard(state: GameState, rank: RankId, notices: string[]): StoryCard {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const seat = findSeat(agency.id, c.seat);
  const station = findCity(c.station);
  return {
    type: "promotion",
    rank,
    title: RANKS[rank].label,
    subtitle: seat ? `${seat.name} · nom de code « ${c.codename} »` : station ? `Station de ${station.name}` : agency.name,
    lines: notices.filter((n) => !n.startsWith("Nouveau grade")),
  };
}

/** Résumé d'une carte pour la mémoire du narrateur. */
export function cardToText(card: StoryCard): string {
  switch (card.type) {
    case "semaine":
      return `[${(card.weeks ?? 1) > 1 ? `${card.weeks} semaines jouées` : "Semaine jouée"} : ${card.plan.map((p) => p.label).join(", ")}${card.stop ? ` — arrêt : ${card.stop}` : ""}]`;
    case "anniversaire":
      return `[Anniversaire : ${card.age} ans, le ${card.dateLabel}]`;
    case "briefing":
      return `[Ordre de mission : ${card.name}, ${MISSION_IMPORTANCE[card.importance].label.toLowerCase()}, ${card.city}]`;
    case "etape":
      return `[Étape « ${card.title} » : ${card.approach}]`;
    case "bilan":
      return `[Mission terminée : ${card.name}, ${card.result}]`;
    case "promotion":
      return `[Promotion : ${card.title}]`;
  }
}

/** Texte intégral d'une pièce (passages masqués compris), pour la mémoire du narrateur. */
export function docText(doc: StoryDoc): string {
  const body = doc.messages?.length ? doc.messages.map((m) => `${m.de} : ${m.texte}`).join(" / ") : doc.contenu;
  return `${body.replace(/\|\|/g, "")}${doc.legende ? ` (au dos : ${doc.legende})` : ""}`.slice(0, 600);
}
