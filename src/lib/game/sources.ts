/**
 * Le réseau : à qui demander, ce que ça coûte, et ce que ça vaut.
 * Chaque question peut être posée à plusieurs sources : la Branche d'analyse (fiable, bornée par l'accréditation),
 * la hiérarchie (pour ses propres missions), les gens qu'on connaît, ses informateurs, des agents rivaux,
 * des courtiers du marché noir ou la presse. Plus on sort des canaux officiels, plus on apprend… et plus on paie.
 */
import { pushLedger } from "./ledger";
import { AGENCIES } from "./agencies";
import { BRANCH_FAVOR_MIN } from "./engine";
import { branchFavor, shiftBranchFavor } from "./command";
import { circleVisible, clearance, clearanceDef, factionOpen, operativeKnown, regionOfCity, rumourVisible, threatVisible } from "./intel";
import { scoutOffer } from "./missions";
import { chance, pick, randInt, uid, type Rng } from "./rng";
import { operativeTitle } from "./roster";
import { SKILLS, formatEuros } from "./rules";
import type { AgencyId, GameState, IntelRequest, IntelRequestKind, Knowledge, SourceKind, StoryDoc } from "./types";
import { findFaction } from "@/lib/world/factions";
import { REGIONS, findCity, findCountry, type RegionId } from "@/lib/world/geo";
import { DOSSIER_FULL, addDossier } from "@/lib/world/threats";
import { shiftDiplomacy, tensionLabel } from "@/lib/world/world";

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export interface TopicDef {
  label: string;
  /** Ce que la réponse apporte. */
  gives: string;
  /** Accréditation nécessaire pour la poser à l'analyse. */
  minClearance: number;
}

export const TOPICS: Record<IntelRequestKind, TopicDef> = {
  reperages: { label: "Repérages", gives: "Les étapes réelles de la mission avant le départ, et +1 renseignement de départ.", minClearance: 1 },
  menace: { label: "Étude d'une menace", gives: "Qui, où, à quel stade ; jusqu'à +2 renseignement de départ pour une mission contre elle.", minClearance: 2 },
  region: { label: "Rapport régional", gives: "Les menaces et les tensions d'une région, pendant six mois.", minClearance: 2 },
  agent: { label: "Fiche d'agent", gives: "Compétences, caractère et dernière position d'un agent.", minClearance: 2 },
  faction: { label: "Profil de faction", gives: "Méthodes et figures d'une faction, et une pièce de plus à son dossier.", minClearance: 2 },
  cercle: { label: "État d'un Cercle rival", gives: "Qui siège, qui est vacant, qui est en mission dans une agence rivale.", minClearance: 3 },
};

/** Libellé de la cible d'une question (ou null si elle n'existe plus). */
export function targetLabel(state: GameState, kind: IntelRequestKind, target: string): string | null {
  switch (kind) {
    case "reperages":
      return state.offers.find((o) => o.id === target)?.title.split(" — ")[0] ?? null;
    case "menace": {
      const t = state.world.geo.threats.find((x) => x.id === target);
      return t ? (threatVisible(state, t) ? t.title : `rumeur, ${REGIONS[t.region as RegionId]?.label ?? t.region}`) : null;
    }
    case "region":
      return REGIONS[target as RegionId]?.label ?? null;
    case "agent": {
      const o = state.roster.find((x) => x.id === target);
      return o ? (o.codename ? `« ${o.codename} » ${o.name}` : o.name) : null;
    }
    case "faction":
      return findFaction(target)?.name ?? null;
    case "cercle":
      return target in AGENCIES && target !== state.character.identity.agency ? AGENCIES[target as AgencyId].circle.name : null;
  }
}

/** La région dont parle une question (les sources locales ne savent que ce qui se passe chez elles). */
function topicRegion(state: GameState, kind: IntelRequestKind, target: string): string | null {
  switch (kind) {
    case "reperages":
      return state.offers.find((o) => o.id === target)?.region ?? null;
    case "menace":
      return state.world.geo.threats.find((x) => x.id === target)?.region ?? null;
    case "region":
      return target;
    case "agent":
      return regionOfCity(state.roster.find((x) => x.id === target)?.cityId) ?? null;
    default:
      return null;
  }
}

/** Ce que la question vise déjà, inutile de la reposer. */
function alreadyKnown(state: GameState, kind: IntelRequestKind, target: string): string | null {
  const k = state.knowledge;
  switch (kind) {
    case "reperages":
      return k.recon[target] ? "repérages déjà faits" : null;
    case "menace":
      return k.threats[target] !== undefined ? "menace déjà étudiée" : null;
    case "region": {
      const day = k.regions[target];
      return day !== undefined && state.world.day - day < 60 ? "rapport encore récent" : null;
    }
    case "agent": {
      const o = state.roster.find((x) => x.id === target);
      return o && operativeKnown(state, o) ? "tu connais déjà son dossier" : null;
    }
    case "faction":
      return factionOpen(state, target) ? "profil déjà ouvert" : null;
    case "cercle":
      return circleVisible(state, target as AgencyId) ? "tu connais déjà ce Cercle" : null;
  }
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export const SOURCE_KINDS: Record<SourceKind, { label: string; icon: string; description: string }> = {
  analyse: { label: "Analyse", icon: "⌕", description: "La Branche d'analyse de l'agence : fiable, mais elle ne te dit que ce que ton accréditation permet." },
  hierarchie: { label: "Hiérarchie", icon: "▲", description: "Ton supérieur : il ne répond que sur tes propres missions, vite, mais il n'aime pas qu'on le dérange." },
  relation: { label: "Tes liens", icon: "☎", description: "Les gens que tu connais savent ce qui se passe chez eux. Ça se paie en faveurs, et ça use le lien." },
  informateur: { label: "Informateurs", icon: "⌖", description: "Tes sources payées : elles parlent de leur ville et de leur région, pour une prime." },
  rival: { label: "Agents rivaux", icon: "⇄", description: "Un agent d'une agence rivale qui t'apprécie peut parler de chez lui. Chaque confidence se paie en diplomatie." },
  courtier: { label: "Marché noir", icon: "¤", description: "Les courtiers vendent tout à qui paie. Cher, pas toujours vrai, et parfois ils te vendent à quelqu'un d'autre." },
  presse: { label: "Sources ouvertes", icon: "▤", description: "Journaux, réseaux, rapports d'ONG : gratuit, lent, et assez vague." },
};

/** Les courtiers : quatre adresses que tout officier finit par connaître. */
export const BROKERS = [
  { id: "libraire", name: "le Libraire", cityId: "geneve", style: "un bouquiniste de la vieille ville qui ne vend jamais de livres" },
  { id: "sabri", name: "Mme Sabri", cityId: "beyrouth", style: "une veuve élégante qui tient salon dans un hôtel décati" },
  { id: "dock", name: "« Dock »", cityId: "singapour", style: "un ancien de la marine marchande, joignable seulement par un jeu en ligne" },
  { id: "notario", name: "el Notario", cityId: "mexico", style: "un notaire véreux qui authentifie aussi les secrets" },
];

const BROKER_PRICE: Record<IntelRequestKind, number> = { reperages: 6000, menace: 9000, region: 5000, agent: 12000, faction: 15000, cercle: 25000 };

/** Ce que coûte une question, en clair et en effets. */
export interface CostSpec {
  estime?: { branch: string; amount: number };
  reputation?: number;
  money?: number;
  /** Faveur demandée à une relation (elle te devait, ou tu lui dois désormais). */
  favor?: string;
  bond?: { name: string; amount: number };
  cover?: number;
  asset?: { id: string; wear: number };
  affinity?: { id: string; amount: number };
  diplomacy?: { agency: AgencyId; amount: number };
  heat?: { country: string; amount: number };
}

export interface SourceOffer {
  source: SourceKind;
  ref?: string;
  label: string;
  /** Pourquoi cette source sait (sa ville, son rôle…). */
  detail: string;
  cost: CostSpec;
  costText: string;
  days: number;
  /** Cotation : fiabilité (A-E) et crédibilité (1-5). */
  grade: string;
  /** Probabilité qu'elle dise vrai. */
  truth: number;
  blocker: string | null;
}

const GRADE_TRUTH: Record<string, number> = { A: 0.99, B: 0.9, C: 0.75, D: 0.6, E: 0.45 };

function describeCost(state: GameState, c: CostSpec): string {
  const out: string[] = [];
  if (c.estime) out.push(`estime ${AGENCIES[state.character.identity.agency].branches.find((b) => b.id === c.estime!.branch)?.name ?? ""} −${c.estime.amount}`);
  if (c.reputation) out.push(`réputation −${c.reputation}`);
  if (c.money) out.push(formatEuros(c.money));
  if (c.favor) {
    const r = state.relations.find((x) => x.name === c.favor);
    out.push(r && r.favors > 0 ? "la faveur qu'on te devait" : "une faveur que tu devras");
  }
  if (c.bond) out.push(`lien −${c.bond.amount}`);
  if (c.cover) out.push(`couverture −${c.cover}`);
  if (c.asset) out.push(`fiabilité de la source −${c.asset.wear}`);
  if (c.affinity) out.push(`affinité −${c.affinity.amount}`);
  if (c.diplomacy) out.push(`relations avec ${AGENCIES[c.diplomacy.agency].name} −${c.diplomacy.amount}`);
  if (c.heat) out.push(`notoriété +${c.heat.amount} (${findCountry(c.heat.country)?.name ?? "?"})`);
  return out.join(" · ") || "gratuit";
}

/** Le supérieur à qui l'on rend compte. */
function superior(state: GameState): string {
  const r = state.character.rank;
  if (r === "aspirant" || r === "prospect") return "le chef des instructeurs";
  if (r === "agent") return "ton chef de station";
  if (r === "controleur" || r === "directeur") return "la Direction";
  return "ton Contrôleur";
}

export const analysisBranch = (state: GameState) => AGENCIES[state.character.identity.agency].branches.find((b) => b.kind === "analyse")!;
const busy = (state: GameState, source: SourceKind, ref?: string) => state.knowledge.requests.some((r) => r.source === source && (ref === undefined || r.sourceRef === ref));

/** Combien de questions la Branche d'analyse traite pour toi en même temps. */
export const analysisCapacity = (state: GameState) => [0, 1, 2, 3, 4, 5][clearance(state)] ?? 1;
/** Questions en vol, toutes sources confondues. */
export const MAX_REQUESTS = 8;

/** Toutes les sources qui pourraient répondre à cette question, disponibles ou non (avec la raison). */
export function sourceOffers(state: GameState, kind: IntelRequestKind, target: string): SourceOffer[] {
  const c = state.character;
  const me = c.identity.agency;
  const lvl = clearance(state);
  const region = topicRegion(state, kind, target);
  const offer = kind === "reperages" ? state.offers.find((o) => o.id === target) : undefined;
  const threat = kind === "menace" ? state.world.geo.threats.find((x) => x.id === target) : undefined;
  const agent = kind === "agent" ? state.roster.find((x) => x.id === target) : undefined;
  const offers: SourceOffer[] = [];
  const add = (o: Omit<SourceOffer, "costText" | "truth"> & { truth?: number }) =>
    offers.push({ ...o, costText: describeCost(state, o.cost), truth: o.truth ?? GRADE_TRUTH[o.grade[0]] ?? 0.7 });

  // 1. La Branche d'analyse (ou les instructeurs).
  {
    const cadet = c.rank === "aspirant" || c.rank === "prospect";
    const b = analysisBranch(state);
    const cost: CostSpec = cadet ? {} : { estime: { branch: b.id, amount: kind === "faction" || kind === "cercle" ? 5 : kind === "agent" || kind === "reperages" ? 3 : 4 } };
    let blocker: string | null = null;
    if (lvl < TOPICS[kind].minClearance) blocker = `accréditation ${clearanceDef(TOPICS[kind].minClearance).label} requise`;
    else if (cadet && kind !== "reperages") blocker = "les instructeurs ne parlent que de tes Opérations Jeunesse";
    else if (agent && agent.agency !== me && lvl < 3) blocker = "les agents rivaux demandent l'accréditation Cercle";
    else if (state.knowledge.requests.filter((r) => r.source === "analyse").length >= analysisCapacity(state)) blocker = `${analysisCapacity(state)} question${analysisCapacity(state) > 1 ? "s" : ""} au plus en même temps à ton niveau`;
    else if (!cadet && branchFavor(state, b.id) - (cost.estime?.amount ?? 0) < BRANCH_FAVOR_MIN) blocker = `${b.name} ne te doit plus rien : passe du temps avec elle au planning`;
    add({ source: "analyse", label: cadet ? "Les instructeurs" : b.name, detail: cadet ? "Ils préparent les Opérations Jeunesse." : b.chief.name, cost, days: kind === "faction" || kind === "cercle" ? 14 : 7, grade: "A-2", blocker });
  }

  // 2. La hiérarchie : seulement pour ses propres missions (besoin d'en connaître).
  {
    const own = Boolean(offer) || (threat && state.offers.some((o) => o.threat === threat.id));
    if (own)
      add({
        source: "hierarchie",
        label: superior(state).replace(/^./, (x) => x.toUpperCase()),
        detail: "Ta mission, donc ton droit d'en connaître.",
        cost: { reputation: 2 },
        days: 3,
        grade: "A-1",
        blocker: c.reputation < 2 ? "ta réputation est trop basse pour qu'on te réponde" : null,
      });
  }

  // 3. Tes liens : ils savent ce qui se passe là où ils vivent.
  if (region && kind !== "faction" && kind !== "cercle") {
    for (const r of state.relations) {
      if (r.status !== "actif" || r.kind === "ennemi" || !r.cityId) continue;
      const theirRegion = regionOfCity(r.cityId);
      const local = offer ? r.cityId === offer.cityId || theirRegion === region : theirRegion === region;
      if (!local) continue;
      const letter = r.kind === "mentor" || r.kind === "allie" || r.kind === "equipier" ? "B" : r.kind === "contact" ? "C" : r.kind === "proche" ? "D" : "E";
      const cred = r.affinity >= 50 ? 2 : r.affinity >= 20 ? 3 : 4;
      const cost: CostSpec = { favor: r.name, bond: { name: r.name, amount: 10 }, ...(r.kind === "proche" ? { cover: 5 } : {}) };
      const blocker = busy(state, "relation", r.name)
        ? "tu attends déjà sa réponse"
        : (r.bond ?? 50) < 30
          ? "le lien est trop distendu"
          : r.affinity < 0
            ? "il ne te veut pas de bien"
            : r.favors <= -2
              ? "tu lui dois déjà trop"
              : null;
      add({
        source: "relation",
        ref: r.name,
        label: r.name,
        detail: `${r.role} — ${findCity(r.cityId)?.name ?? "?"}`,
        cost,
        days: r.cityId === state.world.cityId ? 3 : 7,
        grade: `${letter}-${cred}`,
        blocker,
      });
    }
  }

  // 4. Tes informateurs : leur ville, leur région.
  if (region && kind !== "faction" && kind !== "cercle") {
    for (const a of state.command.assets) {
      if (a.status !== "actif" || regionOfCity(a.cityId) !== region) continue;
      if (offer && a.cityId !== offer.cityId && kind === "reperages" && a.reliability < 60) continue;
      const letter = a.reliability >= 80 ? "B" : a.reliability >= 60 ? "C" : "D";
      add({
        source: "informateur",
        ref: a.id,
        label: a.name,
        detail: `${a.role} — ${findCity(a.cityId)?.name ?? "?"}`,
        cost: { money: a.cost * 2, asset: { id: a.id, wear: 5 } },
        days: 7,
        grade: `${letter}-3`,
        truth: Math.min(0.95, a.reliability / 100),
        blocker: busy(state, "informateur", a.id) ? "il travaille déjà pour toi" : c.money < a.cost * 2 ? "pas assez d'argent pour sa prime" : null,
      });
    }
  }

  // 5. Les agents rivaux qui t'apprécient : ils parlent de chez eux, et de ce qu'ils voient.
  if (lvl >= 2 && kind !== "reperages" && kind !== "faction") {
    for (const o of state.roster) {
      if (o.agency === me || o.status === "mort" || o.affinity < 20 || !operativeKnown(state, o)) continue;
      const about =
        kind === "cercle" ? target === o.agency : kind === "agent" ? agent?.agency === o.agency && agent.id !== o.id : kind === "region" ? regionOfCity(o.cityId) === region : true;
      if (!about) continue;
      add({
        source: "rival",
        ref: o.id,
        label: o.codename ? `« ${o.codename} » ${o.name}` : o.name,
        detail: `${operativeTitle(o)}, ${AGENCIES[o.agency].name}`,
        cost: { diplomacy: { agency: o.agency, amount: 3 }, affinity: { id: o.id, amount: 10 } },
        days: 7,
        grade: `C-${o.affinity >= 50 ? 2 : 3}`,
        blocker: busy(state, "rival", o.id) ? "tu attends déjà sa réponse" : null,
      });
    }
  }

  // 6. Le marché noir : tout se vend.
  if (lvl >= 2) {
    for (const b of BROKERS) {
      const price = BROKER_PRICE[kind];
      const country = findCity(b.cityId)?.country ?? "";
      add({
        source: "courtier",
        ref: b.id,
        label: b.name.replace(/^./, (x) => x.toUpperCase()),
        detail: `${findCity(b.cityId)?.name} — ${b.style}`,
        cost: { money: price, heat: { country, amount: 10 } },
        days: 7,
        grade: b.id === "libraire" ? "C-3" : "D-3",
        truth: b.id === "libraire" ? 0.8 : 0.68,
        blocker: busy(state, "courtier", b.id) ? "il traite déjà une de tes affaires" : c.money < price ? `il faut ${formatEuros(price)}` : null,
      });
    }
  }

  // 7. Les sources ouvertes : de quoi se faire une idée.
  if (kind === "region" || kind === "menace")
    add({ source: "presse", label: "Presse et réseaux", detail: "Ce qui se dit publiquement.", cost: {}, days: 14, grade: "C-4", truth: 0.85, blocker: busy(state, "presse", target) ? "veille déjà en cours" : null });

  // Ce qui vaut pour toutes les sources.
  const common = state.character.prison
    ? "impossible depuis une cellule"
    : state.world.phase === "mission"
      ? "pas pendant une mission"
      : !targetLabel(state, kind, target)
        ? "cible introuvable"
        : alreadyKnown(state, kind, target) ??
          (state.knowledge.requests.some((r) => r.kind === kind && r.target === target) ? "déjà demandé" : state.knowledge.requests.length >= MAX_REQUESTS ? `${MAX_REQUESTS} questions en vol au plus` : null);
  return offers.map((o) => ({ ...o, blocker: common ?? o.blocker })).sort((a, b) => Number(Boolean(a.blocker)) - Number(Boolean(b.blocker)));
}

/** Les questions qu'on peut poser à une source précise (pour « Lui demander… » depuis une fiche). */
export function questionsFor(state: GameState, source: SourceKind, ref: string): { kind: IntelRequestKind; target: string; label: string }[] {
  const out: { kind: IntelRequestKind; target: string; label: string }[] = [];
  const candidates: [IntelRequestKind, string][] = [
    ...state.offers.map((o) => ["reperages", o.id] as [IntelRequestKind, string]),
    ...state.world.geo.threats.filter((t) => threatVisible(state, t) || rumourVisible(state, t)).map((t) => ["menace", t.id] as [IntelRequestKind, string]),
    ...Object.keys(REGIONS).map((r) => ["region", r] as [IntelRequestKind, string]),
    ...state.roster.filter((o) => o.status !== "mort").map((o) => ["agent", o.id] as [IntelRequestKind, string]),
    ...(["argos", "meridian", "monsoon"] as AgencyId[]).map((a) => ["cercle", a] as [IntelRequestKind, string]),
  ];
  for (const [kind, target] of candidates) {
    const o = sourceOffers(state, kind, target).find((x) => x.source === source && x.ref === ref && !x.blocker);
    if (o) out.push({ kind, target, label: `${TOPICS[kind].label} — ${targetLabel(state, kind, target)}` });
  }
  return out;
}

/** Poser la question : on paie tout de suite, la réponse arrive avec la semaine. */
export function fileRequest(state: GameState, kind: IntelRequestKind, target: string, pickSource: { source: SourceKind; ref?: string }, rng: Rng = Math.random): GameState {
  const offer = sourceOffers(state, kind, target).find((o) => o.source === pickSource.source && o.ref === pickSource.ref);
  if (!offer) throw new Error("Cette source ne peut pas répondre à cette question.");
  if (offer.blocker) throw new Error(`Impossible : ${offer.blocker}.`);
  let s = payCost(state, offer.cost);
  const request: IntelRequest = {
    id: uid(rng),
    kind,
    target,
    label: targetLabel(state, kind, target)!,
    filedDay: state.world.day,
    readyDay: state.world.day + offer.days,
    source: offer.source,
    ...(offer.ref ? { sourceRef: offer.ref } : {}),
    sourceLabel: offer.label,
    grade: offer.grade,
    cost: offer.costText,
    truthful: chance(offer.truth, rng),
    ...(kind === "reperages" ? { offerId: target } : kind === "menace" ? { offerId: state.offers.find((o) => o.threat === target)?.id } : {}),
  };
  s = { ...s, knowledge: { ...s.knowledge, requests: [...s.knowledge.requests, request] }, updatedAt: Date.now() };
  return s;
}

function payCost(state: GameState, c: CostSpec): GameState {
  let s = state;
  let ch = { ...s.character };
  if (c.estime) s = shiftBranchFavor(s, c.estime.branch, -c.estime.amount);
  if (c.reputation) ch.reputation = Math.max(0, ch.reputation - c.reputation);
  if (c.money) {
    ch.money -= c.money;
    ch.ledger = pushLedger(ch.ledger, s.world.day, "Renseignement acheté", -c.money);
  }
  if (c.cover) ch.cover = Math.max(0, ch.cover - c.cover);
  if (c.heat) ch = { ...ch, heat: { ...ch.heat, [c.heat.country]: Math.min(100, (ch.heat?.[c.heat.country] ?? 0) + c.heat.amount) } };
  s = { ...s, character: ch };
  if (c.favor || c.bond)
    s = {
      ...s,
      relations: s.relations.map((r) =>
        r.name === (c.favor ?? c.bond?.name) ? { ...r, favors: c.favor ? r.favors - 1 : r.favors, bond: Math.max(0, (r.bond ?? 50) - (c.bond?.amount ?? 0)) } : r,
      ),
    };
  if (c.asset) s = { ...s, command: { ...s.command, assets: s.command.assets.map((a) => (a.id === c.asset!.id ? { ...a, reliability: Math.max(0, a.reliability - c.asset!.wear) } : a)) } };
  if (c.affinity) s = { ...s, roster: s.roster.map((o) => (o.id === c.affinity!.id ? { ...o, affinity: Math.max(-100, o.affinity - c.affinity!.amount) } : o)) };
  if (c.diplomacy) s = { ...s, world: { ...s.world, geo: shiftDiplomacy(s.world.geo, s.character.identity.agency, c.diplomacy.agency, -c.diplomacy.amount) } };
  return s;
}

export function cancelRequest(state: GameState, id: string): GameState {
  return { ...state, knowledge: { ...state.knowledge, requests: state.knowledge.requests.filter((r) => r.id !== id) }, updatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Réponses                                                            */
/* ------------------------------------------------------------------ */

const jitter = (n: number, rng: Rng) => Math.max(0, Math.min(100, n + pick([-1, 1], rng) * randInt(20, 40, rng)));

/** Les réponses arrivées cette semaine : appliquées, et rangées dans le carnet comme des pièces. */
export function resolveRequests(initial: GameState, rng: Rng = Math.random): { state: GameState; lines: string[]; notices: string[] } {
  let state = initial;
  const lines: string[] = [];
  const notices: string[] = [];
  const day = state.world.day;
  const ready = state.knowledge.requests.filter((r) => r.readyDay <= day);
  if (!ready.length) return { state, lines, notices };
  let k: Knowledge = { ...state.knowledge, requests: state.knowledge.requests.filter((r) => r.readyDay > day) };
  const docs: StoryDoc[] = [];

  for (const r of ready) {
    const say = (titre: string, contenu: string) =>
      docs.push({
        type: r.source === "presse" ? "presse" : r.source === "relation" || r.source === "rival" ? "message" : "lettre",
        titre,
        de: r.sourceLabel,
        date: `Jour ${day}`,
        contenu,
        ...(r.source === "relation" || r.source === "rival" ? { messages: [{ de: r.sourceLabel, texte: contenu }] } : {}),
        day,
        topic: r.kind,
        grade: r.grade,
        ...(r.offerId ? { offerId: r.offerId } : {}),
      });
    const nothing = () => {
      say(`${TOPICS[r.kind].label} — ${r.label}`, pick(["Rien de solide. Désolé.", "Ma piste s'est refroidie. Je n'ai rien qui vaille d'être écrit.", "On m'a fermé la porte au nez. Rien à transmettre."], rng));
      lines.push(`${r.sourceLabel} n'a rien trouvé sur ${r.label}.`);
    };
    const press = r.source === "presse";
    switch (r.kind) {
      case "reperages": {
        const offer = state.offers.find((o) => o.id === r.target);
        const nodes = offer && scoutOffer(state, offer.id, rng);
        if (!offer || !nodes) {
          lines.push(`Repérages pour ${r.label} : sans objet, la mission n'est plus proposée.`);
          break;
        }
        if (!r.truthful) {
          nothing();
          break;
        }
        k = { ...k, recon: { ...k.recon, [offer.id]: nodes } };
        const steps = nodes.map((n, i) => `${i + 1}. ${n.title.replace(/\{cover\}/g, "ta couverture")}${n.key ? " (l'objectif)" : n.type === "secondaire" ? " (facultatif)" : n.type === "dilemme" ? " (un choix difficile)" : ""}${n.alt ? ` — ou : ${n.alt.title}` : ""}`);
        say(`Repérages — ${r.label}`, `Ce qui t'attend, dans l'ordre :\n${steps.join("\n")}\n\nOn a ||noté les horaires des relèves||.`);
        lines.push(`Repérages reçus pour ${r.label} : ${nodes.length} étapes connues d'avance.`);
        notices.push(`Repérages : ${r.label}`);
        break;
      }
      case "menace": {
        const t = state.world.geo.threats.find((x) => x.id === r.target);
        if (!t) {
          lines.push(`${r.label} : sans objet, l'affaire est close.`);
          break;
        }
        const shownProgress = r.truthful ? t.progress : jitter(t.progress, rng);
        if (!press) state = { ...state, world: { ...state.world, geo: { ...state.world.geo, threats: state.world.geo.threats.map((x) => (x.id === t.id ? { ...x, known: true } : x)) } } };
        k = { ...k, threats: { ...k.threats, [t.id]: press ? 0 : r.truthful ? 2 : 0 } };
        const nemesis = t.nemesis ? state.world.geo.nemeses.find((n) => n.id === t.nemesis) : undefined;
        say(
          press ? `On en parle — ${REGIONS[t.region as RegionId]?.label}` : `Étude de menace — ${t.title}`,
          press
            ? `Plusieurs médias évoquent une affaire à ${findCity(t.cityId)?.name ?? "?"} liée à ${findFaction(t.faction)?.name ?? "un groupe inconnu"}. Rien de précis.`
            : `Commanditaire : ${findFaction(t.faction)?.name ?? "inconnu"}. Lieu : ${findCity(t.cityId)?.name ?? "?"}. Avancement estimé : ||${shownProgress} sur 100||.${nemesis ? ` À sa tête, ||${nemesis.name}, ${nemesis.title}||.` : ""}`,
        );
        lines.push(press ? `La presse évoque une affaire à ${findCity(t.cityId)?.name}.` : `Étude reçue : ${t.title} (avancement estimé ${shownProgress}/100, cotation ${r.grade}).`);
        notices.push(`Menace étudiée : ${t.title}`);
        break;
      }
      case "region": {
        const here = state.world.geo.threats.filter((x) => x.region === r.target && !x.capstone);
        const tension = state.world.geo.tensions[r.target] ?? 50;
        if (press) {
          const news = state.world.geo.news.filter((n) => n.region === r.target).slice(0, 3);
          say(`Revue de presse — ${r.label}`, `Climat : ${tensionLabel(tension)}.\n${news.length ? news.map((n) => `· ${n.text}`).join("\n") : "Peu d'échos ces dernières semaines."}`);
          lines.push(`Revue de presse reçue : ${r.label}.`);
          break;
        }
        k = { ...k, regions: { ...k.regions, [r.target]: day } };
        // Une source qui ment, ou qui se trompe : on croit savoir, mais on ne voit pas tout.
        const reported = r.truthful ? here : here.filter(() => chance(0.4, rng));
        state = { ...state, world: { ...state.world, geo: { ...state.world.geo, threats: state.world.geo.threats.map((x) => (reported.some((y) => y.id === x.id) ? { ...x, known: true } : x)) } } };
        say(
          `Rapport régional — ${r.label}`,
          `Tension : ${tensionLabel(tension)}.\n${reported.length ? `Opérations adverses repérées :\n${reported.map((x) => `· ${x.title} — ${findFaction(x.faction)?.name}, ||${r.truthful ? x.progress : jitter(x.progress, rng)}/100||`).join("\n")}` : "Aucune opération adverse repérée."}\nValable six mois.`,
        );
        lines.push(`Rapport régional reçu : ${r.label} (${reported.length} menace${reported.length > 1 ? "s" : ""}, cotation ${r.grade}).`);
        notices.push(`Rapport régional : ${r.label}`);
        break;
      }
      case "agent": {
        const o = state.roster.find((x) => x.id === r.target);
        if (!o) break;
        if (!r.truthful) {
          nothing();
          break;
        }
        k = { ...k, operatives: [...new Set([...k.operatives, o.id])] };
        const top = Object.entries(o.skills)
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .slice(0, 3)
          .map(([s, v]) => `${SKILLS[s as keyof typeof SKILLS].label} ${v}`)
          .join(", ");
        say(`Fiche — ${r.label}`, `${operativeTitle(o)}, ${AGENCIES[o.agency].name}. ${o.nationality}, ${o.age} ans. Points forts : ${top}. Dernière position connue : ||${findCity(o.cityId)?.name ?? "inconnue"}||.`);
        lines.push(`Fiche reçue : ${r.label}.`);
        notices.push(`Fiche d'agent : ${r.label}`);
        break;
      }
      case "faction": {
        const f = findFaction(r.target);
        if (!f) break;
        if (!r.truthful) {
          nothing();
          break;
        }
        k = { ...k, factions: [...new Set([...k.factions, f.id])] };
        const d = addDossier(state.world.geo, f.id, 1, rng);
        state = { ...state, world: { ...state.world, geo: d.geo } };
        say(`Profil — ${f.name}`, `Méthodes : ${f.style}.\nFigures connues : ${f.figures.slice(0, 3).join(" ; ")}.\nDossier : ||${Math.min(DOSSIER_FULL, d.geo.dossiers[f.id] ?? 0)}/${DOSSIER_FULL} pièces||.`);
        lines.push(`Profil reçu : ${f.name}.`);
        notices.push(`Profil de faction : ${f.name}`);
        if (d.notice) notices.push(d.notice);
        break;
      }
      case "cercle": {
        const a = r.target as AgencyId;
        if (!r.truthful) {
          nothing();
          break;
        }
        k = { ...k, circles: [...new Set([...k.circles, a])] };
        const members = state.roster.filter((o) => o.agency === a && o.role === "titulaire" && o.status !== "mort");
        // Connaître un Cercle, c'est connaître ceux qui y siègent.
        k = { ...k, operatives: [...new Set([...k.operatives, ...members.map((o) => o.id)])] };
        say(`${AGENCIES[a].circle.name.replace(/^./, (x) => x.toUpperCase())} — état des lieux`, `${members.length}/${AGENCIES[a].seats.length} sièges occupés.\n${members.map((o) => `· « ${o.codename} » ${o.name}${o.status === "en_mission" ? " — en mission" : o.status === "blesse" ? " — blessé" : ""}`).join("\n")}`);
        lines.push(`Le Cercle de ${AGENCIES[a].name} n'a plus de secrets pour toi.`);
        notices.push(`Cercle percé : ${AGENCIES[a].name}`);
        break;
      }
    }
    // Les courtiers vendent aussi leurs clients.
    if (r.source === "courtier" && chance(0.15, rng)) {
      const home = findCity(state.character.station ?? state.world.cityId)?.country ?? "";
      if (home) state = { ...state, character: { ...state.character, heat: { ...state.character.heat, [home]: Math.min(100, (state.character.heat?.[home] ?? 0) + 15) } } };
      lines.push(`${r.sourceLabel} a vendu ton nom à quelqu'un d'autre : ta notoriété grimpe chez toi.`);
      notices.push(`Trahi par ${r.sourceLabel}`);
    }
  }
  state = { ...state, knowledge: k, pieces: [...(state.pieces ?? []), ...docs].slice(-60) };
  return { state, lines, notices };
}

/** La cotation, en mots. */
export function gradeLabel(grade: string): string {
  const [rel, cred] = grade.split("-");
  const r = { A: "source sûre", B: "source habituellement fiable", C: "source assez fiable", D: "source peu fiable", E: "source douteuse" }[rel] ?? "source inconnue";
  const c = { "1": "confirmée", "2": "probablement vraie", "3": "possiblement vraie", "4": "douteuse", "5": "improbable" }[cred] ?? "";
  return `${r}, information ${c}`;
}

