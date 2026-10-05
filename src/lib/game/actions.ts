/**
 * Les actions jouées par le moteur (semaine, départ en mission, étapes, ressource) :
 * on les résout ici, puis le narrateur raconte ce qui s'est passé.
 */
import { AGENCIES, findSeat } from "./agencies";
import { performCheck, promote } from "./engine";
import { findGadget } from "./gadgets";
import {
  alertPenalty,
  applyAttempt,
  currentNode,
  nodeOptions,
  startMission,
  situationalBonuses,
  teamAssist,
  useResource,
  type NodeOutcome,
} from "./missions";
import { ACTIVITIES, resolvePeriod } from "./planner";
import { d6, type Rng } from "./rng";
import { OPERATIVE_TRAITS, operativeSkill, operativeTitle } from "./roster";
import { DIFFICULTIES, MISSION_IMPORTANCE, MISSION_RESULTS, PARTIAL_MARGIN, RANKS, SKILLS } from "./rules";
import type { Approach, CheckOutcome, CheckResult, GameState, Mission, PlayerAction, StoryCard } from "./types";
import { birthdayCard, briefingCard, promotionCard, stepCards, weekCard } from "./cards";
import { cityRegion, findCity, findCountry } from "@/lib/world/geo";
import { findFaction } from "@/lib/world/factions";

export interface EngineStep {
  state: GameState;
  notices: string[];
  checks: CheckResult[];
  /** Ce que le narrateur doit raconter, factuellement. */
  facts: string;
  /** Ligne du joueur dans le journal. */
  label: string;
  /** Le narrateur doit-il proposer des choix (un événement à jouer) ? */
  expectChoices: boolean;
  finished?: boolean;
  /** Cartes à afficher dans le récit avant la narration. */
  cards: StoryCard[];
}

/** Libellé de l'action du joueur, avant même qu'elle soit jouée (affichage en direct). */
export function describeAction(state: GameState, action: PlayerAction): string | null {
  switch (action.type) {
    case "week":
      return `▤ ${action.span === "auto" ? "Jusqu'au prochain événement" : (action.span ?? 1) > 1 ? `${action.span} semaines` : "Semaine"} : ${action.plan
        .map((p) => {
          const def = ACTIVITIES[p.activity];
          const target = p.target ? (SKILLS[p.target as keyof typeof SKILLS]?.label ?? state.relations.find((r) => r.name === p.target)?.name ?? findCity(p.target)?.name ?? state.duties.find((d) => d.id === p.target)?.title ?? AGENCIES[p.target as keyof typeof AGENCIES]?.name) : null;
          return target ? `${def?.label ?? p.activity} (${target})` : (def?.label ?? p.activity);
        })
        .join(", ")}`;
    case "mission_start": {
      const offer = state.offers.find((o) => o.id === action.offer);
      return `✈ Départ : ${offer?.title.split(" — ")[0] ?? "mission"}`;
    }
    case "node": {
      const a = nodeOptions(state).find((x) => x.id === action.approach);
      return a ? `▸ ${a.label}${action.intel ? ` (renseignement −${action.intel})` : ""}` : "▸ Action";
    }
    case "node_free":
      return `▸ ${action.text}`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Étapes de mission                                                   */
/* ------------------------------------------------------------------ */

function rollOutcome(dice: [number, number], total: number, dc: number): CheckOutcome {
  if (dice[0] === 6 && dice[1] === 6) return "reussite_critique";
  if (dice[0] === 1 && dice[1] === 1) return "echec_critique";
  if (total >= dc) return "reussite";
  if (total >= dc - PARTIAL_MARGIN) return "reussite_partielle";
  return "echec";
}

export function resolveNode(state: GameState, approachId: string, intelWanted: number, roll: () => number = () => d6(), rng: Rng = Math.random): NodeOutcome {
  const m = state.mission;
  if (!m || m.stage !== "terrain") throw new Error("Aucune mission en cours.");
  const a = nodeOptions(state).find((x) => x.id === approachId);
  if (!a) throw new Error("Cette option n'est plus possible.");
  if (a.kind === "choix") return applyAttempt(state, a, "choix", rng);

  // Le renseignement se dépense pour faciliter le jet (2 au plus).
  const spend = Math.max(0, Math.min(2, intelWanted, m.intel));
  let s: GameState = spend ? { ...state, mission: { ...m, intel: m.intel - spend } } : state;
  const penalty = alertPenalty(m.alert);
  let check: CheckResult;

  if (a.kind === "equipier") {
    const o = s.roster.find((x) => x.id === a.operative)!;
    const skill = a.skill!;
    const trait = OPERATIVE_TRAITS[o.trait]?.assist?.[skill] ?? 0;
    const breakdown = [`${o.codename || o.name} : ${SKILLS[skill].label} ${operativeSkill(o, skill)}`];
    if (trait) breakdown.push(`${OPERATIVE_TRAITS[o.trait].label} +${trait}`);
    if (spend) breakdown.push(`Renseignement +${spend}`);
    if (penalty) breakdown.push(`Alerte −${penalty}`);
    const bonus = operativeSkill(o, skill) + trait + spend - penalty;
    const dice: [number, number] = [roll(), roll()];
    const dc = DIFFICULTIES[a.difficulty!].dc;
    const total = dice[0] + dice[1] + bonus;
    check = { skill, difficulty: a.difficulty!, reason: a.label, red: false, dice, bonus, bonusBreakdown: breakdown, total, dc, outcome: rollOutcome(dice, total, dc) };
  } else {
    const assist = teamAssist(s, a.skill!);
    const gadgetItem = a.gadget ? s.character.inventory.find((i) => i.gadget === a.gadget && i.carried) : undefined;
    const bonuses = [
      ...(spend ? [{ label: "Renseignement", value: spend }] : []),
      ...situationalBonuses(s, a),
      ...(assist.bonus ? [{ label: `Aide de ${assist.who}`, value: assist.bonus }] : []),
      ...(penalty ? [{ label: "Alerte", value: -penalty }] : []),
    ];
    const r = performCheck(s, { skill: a.skill!, difficulty: a.difficulty!, reason: a.label, item: gadgetItem?.name, bonuses }, roll);
    s = r.state;
    check = r.check;
  }
  const out = applyAttempt(s, a, check.outcome, rng);
  return { ...out, check };
}

/** Une tentative improvisée, arbitrée et lancée par le narrateur, compte comme une approche. */
export function resolveFreeAttempt(state: GameState, label: string, outcome: CheckOutcome, rng: Rng = Math.random): NodeOutcome {
  const improvised: Approach = { id: "improvisation", label, kind: "competence", risk: { exposure: 15, alert: 15, health: 1 } };
  return applyAttempt(state, improvised, outcome, rng);
}

/* ------------------------------------------------------------------ */
/* Ce que le narrateur doit savoir                                     */
/* ------------------------------------------------------------------ */

export function missionBrief(state: GameState, m: Mission): string {
  const city = findCity(m.cityId);
  const country = findCountry(city?.country ?? "");
  const faction = findFaction(m.faction);
  const agency = AGENCIES[state.character.identity.agency];
  const team = m.team
    .map((id) => state.roster.find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => {
      const t = OPERATIVE_TRAITS[o!.trait];
      return `${o!.codename ? `« ${o!.codename} » ` : ""}${o!.name} (${o!.nationality}, ${operativeTitle(o!)} ; ${t?.label} : ${t?.description} ; affinité ${o!.affinity})`;
    });
  const gadgets = state.character.inventory.filter((i) => i.gadget).map((i) => `${i.name}${i.charges !== undefined ? ` (${i.charges} util.)` : ""}`);
  return [
    `Mission : ${m.name} — ${MISSION_IMPORTANCE[m.importance].label.toLowerCase()}${m.kind === "jeunesse" ? " — OPÉRATION JEUNESSE (encadrée, le personnage est cadet)" : ""}${m.kind === "conjointe" && m.other ? ` — opération conjointe avec ${AGENCIES[m.other].name}` : ""}${m.kind === "contre_espionnage" && m.other ? ` — contre-espionnage visant ${AGENCIES[m.other].name}` : ""}.`,
    `Lieu : ${city?.name}, ${country?.name}${country?.note ? ` (${country.note})` : ""}.`,
    `Adversaire : ${faction?.name} — ${faction?.style}. Cible : ${m.target}.`,
    `Objectif : ${m.objective}`,
    `Couverture du personnage : ${m.cover}.`,
    state.character.seat
      ? `Le personnage part en tant que « ${state.character.codename} » (${findSeat(agency.id, state.character.seat)?.name}).`
      : `Le personnage est ${RANKS[state.character.rank].label.toLowerCase()}${state.character.station ? ` de la Station de ${findCity(state.character.station)?.name}` : ""}.`,
    team.length ? `Équipe : ${team.join(" ; ")}.` : "Équipe : le personnage est seul sur le terrain (soutien à distance).",
    m.handler ? "Le premier équipier est l'agent adulte qui encadre l'opération." : "",
    gadgets.length ? `Gadgets réquisitionnés : ${gadgets.join(", ")}.` : "Aucun gadget réquisitionné.",
    `Jauges : exposition ${m.exposure}/100, alerte ${m.alert}/100, renseignement ${m.intel}.`,
    `Déroulé prévu (${m.nodes.length} étapes) : ${m.nodes.map((n, i) => `${i + 1}. ${n.title}${n.status !== "a_venir" && n.status !== "en_cours" ? ` [${n.status}]` : ""}${i === m.current ? " ← ÉTAPE EN COURS" : ""}`).join(" ; ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function nextStepText(state: GameState): string {
  const m = state.mission;
  const n = m && currentNode(m);
  if (!m || !n) return "";
  const options = nodeOptions(state).map((a) => `« ${a.label} »${a.skill ? ` (${SKILLS[a.skill].label})` : ""}`);
  return `ÉTAPE SUIVANTE — ${n.title} : ${n.situation}${n.type === "dilemme" ? " (DILEMME : un choix sans dés)" : ""}\nOptions que le jeu va proposer au joueur : ${options.join(", ")}.`;
}

/* ------------------------------------------------------------------ */
/* Exécution                                                           */
/* ------------------------------------------------------------------ */

export function runEngineAction(state: GameState, action: PlayerAction, roll: () => number, rng: Rng = Math.random): EngineStep | null {
  const label = describeAction(state, action) ?? "";
  switch (action.type) {
    case "week": {
      const r = resolvePeriod(state, action.plan, action.span ?? 1, rng);
      const span = r.weeks > 1 ? `${r.weeks} SEMAINES VIENNENT DE PASSER` : "UNE SEMAINE VIENT DE PASSER";
      const notices = [...new Set(r.notices)];
      const facts = [
        `${span} (jours ${state.world.day} → ${r.state.world.day}), résolue${r.weeks > 1 ? "s" : ""} par le jeu :`,
        ...r.lines.map((l) => `- ${l}`),
        ...notices.filter((n) => !r.lines.some((l) => l.includes(n))).map((n) => `- ${n}`),
        r.weeks > 1 ? `\nRaconte la période en accéléré (quelques moments choisis, le temps qui file), puis ralentis sur ce qui l'a interrompue.` : "",
        r.stop ? `Le temps s'est arrêté : ${r.stop}.` : "",
        r.birthday
          ? `\nANNIVERSAIRE : le personnage a eu ${r.birthday.age} ans (${r.birthday.date}). Marque le coup par une courte scène : qui y pense, qui l'oublie, ce que cet âge change.`
          : "",
        r.event ? `\nÉVÉNEMENT (à jouer en scène) : ${r.event}` : "\nPas d'événement particulier.",
      ]
        .filter(Boolean)
        .join("\n");
      const cards = [weekCard(state, r.state, action.plan, r.lines, Boolean(r.event), r.weeks, r.stop)];
      if (r.birthday) cards.push(birthdayCard(r.state, r.birthday.age, r.birthday.date));
      return { state: r.state, notices, checks: [], facts, label, expectChoices: Boolean(r.event || r.birthday), cards };
    }
    case "mission_start": {
      const r = startMission(state, action.offer, action.team, action.gadgets, rng, action.legend);
      const m = r.state.mission!;
      const facts = `LE JOUEUR PART EN MISSION (préparée dans le jeu).\n${missionBrief(r.state, m)}\n\n${nextStepText(r.state)}`;
      const brief = briefingCard(r.state, r.notices);
      return { state: r.state, notices: r.notices, checks: [], facts, label, expectChoices: false, cards: brief ? [brief] : [] };
    }
    case "node": {
      const before = state.mission!;
      const node = currentNode(before)!;
      const approach = nodeOptions(state).find((x) => x.id === action.approach)?.label ?? "";
      const r = resolveNode(state, action.approach, action.intel, roll, rng);
      return engineNodeStep(state, r, node.title, label, approach);
    }
    case "resource": {
      if (!state.mission || state.mission.stage !== "terrain") return null;
      const node = currentNode(state.mission)!;
      const r = useResource(state, action.source);
      return engineNodeStep(state, r, node.title, label, r.notices[0] ?? "Soutien");
    }
    case "promotion": {
      const r = promote(state, action.rank, { seat: action.seat, station: action.station });
      const c = r.state.character;
      const agency = AGENCIES[c.identity.agency];
      const seat = findSeat(agency.id, c.seat);
      const facts = [
        `LE JOUEUR DEVIENT ${RANKS[action.rank].label.toUpperCase()} (choisi dans le jeu, déjà appliqué).`,
        ...r.notices.map((n) => `- ${n}`),
        action.rank === "agent" ? `C'est LE BREVET : cérémonie, Serment de Lucerne, matricule, et l'annonce de son affectation. Pas de nom de code : il ne viendra qu'avec un siège au Cercle.` : "",
        seat ? `Siège : ${seat.name}. Tradition : ${seat.heritage} Coup signature : « ${seat.signature.name} » — ${seat.signature.description}. Cérémonie : « ${agency.ceremony.name} » (${agency.ceremony.place}) — ${agency.ceremony.text}` : "",
        action.rank === "controleur" ? "Il quitte le terrain (et son siège s'il en avait un) : il traitera désormais les titulaires et supervisera une région." : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { state: r.state, notices: r.notices, checks: [], facts, label: `❖ ${RANKS[action.rank].label}`, expectChoices: false, cards: [promotionCard(r.state, action.rank, r.notices)] };
    }
    default:
      return null;
  }
}

export function engineNodeStep(before: GameState, r: NodeOutcome, nodeTitle: string, label: string, approach = label): EngineStep {
  const after = r.state;
  const m = after.mission;
  const facts = [
    `RÉSULTAT DE L'ÉTAPE « ${nodeTitle} » (décidé par le jeu, à raconter fidèlement) : ${r.summary}`,
    r.check ? `Jet : ${SKILLS[r.check.skill].label} — ${r.check.dice[0]}+${r.check.dice[1]} + ${r.check.bonus} = ${r.check.total} contre ${r.check.dc}.` : "",
    r.finished
      ? `\nLA MISSION EST TERMINÉE : ${MISSION_RESULTS[r.finished].label.toUpperCase()}. Raconte la fin de l'action, l'extraction, puis le retour et le débriefing (ce que la hiérarchie en pense, ce que l'équipe en garde). Le jeu a déjà appliqué mérite, prime et récupération.`
      : m
        ? `Jauges : exposition ${m.exposure}/100, alerte ${m.alert}/100, renseignement ${m.intel}.\n${nextStepText(after)}`
        : "",
  ]
    .filter(Boolean)
    .join("\n");
  const cards = stepCards(before, after, r, approach.replace(/^▸ /, ""));
  return { state: after, notices: r.notices, checks: r.check ? [r.check] : [], facts, label, expectChoices: false, finished: Boolean(r.finished), cards };
}

export const isEngineAction = (a: PlayerAction, state: GameState) =>
  a.type === "week" || a.type === "mission_start" || a.type === "node" || a.type === "promotion" || (a.type === "resource" && state.mission?.stage === "terrain");

export { findGadget };
