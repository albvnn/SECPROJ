/**
 * La base de connaissance : tout ce que tu sais, sous forme d'informations qui ont une valeur.
 * On peut les verser au dossier de l'agence, les offrir à un lien, les échanger avec un agent
 * rival, ou les vendre à un courtier — avec ce que chaque marché a de risqué.
 * Fonctions pures.
 */
import { AGENCIES } from "./agencies";
import { shiftBranchFavor } from "./command";
import { pushLedger } from "./ledger";
import { chance, pick, uid, type Rng } from "./rng";
import { BROKERS, analysisBranch } from "./sources";
import type { GameState, InfoItem, MissionImportance } from "./types";
import { FACTIONS } from "@/lib/world/factions";
import { REGIONS, findCity, findCountry, type RegionId } from "@/lib/world/geo";

const GRADE_VALUE: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
const IMPORTANCE_VALUE: Record<MissionImportance, number> = { locale: 2, regionale: 3, continentale: 4, mondiale: 5 };

/** Une information perd de sa valeur avec le temps : −1 après trois mois, −2 après six. */
export function freshValue(item: InfoItem, today: number): number {
  const age = today - item.day;
  return Math.max(1, item.value - (age > 180 ? 2 : age > 90 ? 1 : 0));
}

const regionOf = (cityOrCountry?: string) => findCountry(findCity(cityOrCountry)?.country ?? cityOrCountry ?? "")?.region;

/** Tout ce que tu sais, des rapports reçus aux dossiers de tes opérations. */
export function knowledgeBase(state: GameState): InfoItem[] {
  const items: InfoItem[] = [];
  const me = state.character.identity.agency;
  (state.pieces ?? []).forEach((p, i) => {
    if (p.day === undefined) return;
    if (p.topic)
      items.push({ id: `rep:${i}`, title: p.titre, origin: "rapport", about: p.de ?? "ton réseau", value: GRADE_VALUE[p.grade?.[0] ?? "C"] ?? 3, day: p.day, sensitive: p.de === AGENCIES[me].branches.find((b) => b.kind === "analyse")?.name });
    else if (p.type === "chiffre" || p.type === "photo" || p.type === "message")
      items.push({ id: `pc:${i}`, title: p.titre, origin: "piece", about: p.de ?? "une pièce gardée", value: p.type === "chiffre" ? 3 : 2, day: p.day, sensitive: p.type === "chiffre" });
  });
  for (const m of state.missionLog ?? [])
    items.push({ id: `op:${m.id}`, title: `Dossier ${m.name}`, origin: "operation", about: `${m.city} · ${m.target}`, region: m.region, value: IMPORTANCE_VALUE[m.importance], day: m.endDay, sensitive: true });
  for (const f of state.knowledge?.factions ?? []) {
    const def = FACTIONS.find((x) => x.id === f);
    if (def) items.push({ id: `fac:${f}`, title: `Profil : ${def.name}`, origin: "faction", about: def.name, value: 3, day: 0, sensitive: false });
  }
  items.push(...(state.knowledge?.acquired ?? []));
  return items.sort((a, b) => b.day - a.day);
}

export type BuyerKind = "agence" | "lien" | "rival" | "courtier";

export interface Buyer {
  kind: BuyerKind;
  ref: string;
  label: string;
  detail: string;
  /** Ce que tu en tires, en clair. */
  gain: string;
  /** Ce que tu risques, en clair (vide si rien). */
  risk: string;
  blocker: string | null;
}

const BROKER_PRICE = 1400;

/** Qui voudrait de cette information, et à quel prix. */
export function buyers(state: GameState, item: InfoItem): Buyer[] {
  const out: Buyer[] = [];
  const v = freshValue(item, state.world.day);
  const given = state.knowledge?.traded?.[item.id] ?? [];
  const already = (ref: string) => (given.includes(ref) ? "déjà cédée à cette personne" : null);
  const me = state.character.identity.agency;
  const cadet = state.character.rank === "aspirant" || state.character.rank === "prospect";

  // Ton agence : sans risque, et ça se remarque.
  if (item.origin !== "operation") {
    const b = analysisBranch(state);
    out.push({
      kind: "agence",
      ref: "agence",
      label: cadet ? "Les instructeurs" : b.name,
      detail: "Verser au dossier de l'agence",
      gain: `estime +${v * 2}${v >= 4 ? " · mérite +0,5" : ""}`,
      risk: "",
      blocker: item.origin === "echange" && item.about === AGENCIES[me].name ? "elle vient de chez toi" : already("agence"),
    });
  }
  // Tes liens : un service rendu.
  for (const r of state.relations) {
    if (r.status !== "actif" || ["ennemi", "rival", "ex"].includes(r.kind) || r.operativeId) continue;
    out.push({
      kind: "lien",
      ref: r.name,
      label: r.name,
      detail: r.role,
      gain: `il te devra une faveur · affinité +${2 + v}${v >= 3 ? " · parfois une info en retour" : ""}`,
      risk: item.sensitive ? "secret de l'agence : si ça se sait, blâme" : "",
      blocker: already(r.name),
    });
  }
  // Les agents rivaux qui t'apprécient : info contre info.
  for (const o of state.roster) {
    if (o.agency === me || o.status === "mort" || o.affinity < 20) continue;
    if (!state.relations.some((r) => r.operativeId === o.id) && o.missionsWithPlayer === 0) continue;
    out.push({
      kind: "rival",
      ref: o.id,
      label: o.codename ? `« ${o.codename} » ${o.name}` : o.name,
      detail: AGENCIES[o.agency].name,
      gain: "une information de chez eux en échange · affinité +5",
      risk: item.sensitive ? "trahison si ça se sait (blâme, réputation −10)" : "ton agence n'aimera pas l'apprendre",
      blocker: cadet ? "pas à l'Académie" : already(o.id),
    });
  }
  // Les courtiers : de l'argent, et des ennuis possibles.
  for (const b of BROKERS) {
    const price = Math.round((v * BROKER_PRICE * (item.sensitive ? 2 : 1)) / 100) * 100;
    out.push({
      kind: "courtier",
      ref: b.id,
      label: b.name,
      detail: `${findCity(b.cityId)?.name ?? ""} — ${b.style}`,
      gain: `${price.toLocaleString("fr-FR")} €`,
      risk: item.sensitive ? "trahison : 30 % de risque d'être découvert (blâme, réputation −10) · notoriété +10" : "notoriété +10 dans le pays du courtier",
      blocker: cadet ? "pas à l'Académie" : already(b.id),
    });
  }
  return out;
}

/** Une information de chez l'autre, obtenue en échange. */
function infoFrom(state: GameState, label: string, region: string | undefined, rng: Rng): InfoItem {
  const r = (region as RegionId | undefined) ?? pick(Object.keys(REGIONS) as RegionId[], rng);
  const subjects = ["les mouvements d'un officier", "une planque", "un financement occulte", "une source compromise", "un convoi", "une réunion secrète"];
  return {
    id: `ech:${uid(rng)}`,
    title: `${pick(subjects, rng).replace(/^./, (x) => x.toUpperCase())} — ${REGIONS[r]?.label ?? r}`,
    origin: "echange",
    about: label,
    region: r,
    value: 2 + Math.floor(rng() * 3),
    day: state.world.day,
    sensitive: false,
  };
}

/** Céder une information : chaque marché a son prix et ses risques. */
export function tradeInfo(state: GameState, itemId: string, kind: BuyerKind, ref: string, rng: Rng = Math.random): { state: GameState; notices: string[] } {
  const item = knowledgeBase(state).find((x) => x.id === itemId);
  if (!item) throw new Error("Information introuvable.");
  const buyer = buyers(state, item).find((b) => b.kind === kind && b.ref === ref);
  if (!buyer) throw new Error("Personne ne la prendra.");
  if (buyer.blocker) throw new Error(buyer.blocker);
  const v = freshValue(item, state.world.day);
  const day = state.world.day;
  const notices: string[] = [];
  let s: GameState = { ...state, knowledge: { ...state.knowledge, traded: { ...(state.knowledge.traded ?? {}), [item.id]: [...(state.knowledge.traded?.[item.id] ?? []), ref] } } };
  let c = { ...s.character };
  const acquired = [...(s.knowledge.acquired ?? [])];
  const journal = [...s.journal];
  // Être découvert : une trahison se paie.
  const caught = (p: number) => {
    if (!item.sensitive || !chance(p, rng)) return;
    c = { ...c, blames: c.blames + 1, reputation: Math.max(0, c.reputation - 10) };
    notices.push("Blâme : on a su que tu avais vendu un secret de l'agence");
    journal.push(`J${day} : la hiérarchie a découvert que tu avais cédé « ${item.title} ».`);
  };

  if (kind === "agence") {
    s = shiftBranchFavor({ ...s, character: c }, analysisBranch(s).id, v * 2);
    c = { ...s.character };
    if (v >= 4) c = { ...c, merit: c.merit + 0.5 };
    notices.push(`Versé au dossier : ${item.title}`);
  } else if (kind === "lien") {
    s = { ...s, relations: s.relations.map((r) => (r.name === ref ? { ...r, favors: Math.min(5, r.favors + 1), affinity: Math.min(100, r.affinity + 2 + v), lastSeenDay: day } : r)) };
    notices.push(`${ref} te doit une faveur`);
    if (v >= 3 && chance(0.4, rng)) {
      const r = s.relations.find((x) => x.name === ref);
      const got = infoFrom(s, ref, regionOf(r?.cityId), rng);
      acquired.push(got);
      notices.push(`En retour : ${got.title}`);
    }
    caught(0.15);
  } else if (kind === "rival") {
    const o = s.roster.find((x) => x.id === ref)!;
    s = { ...s, roster: s.roster.map((x) => (x.id === ref ? { ...x, affinity: Math.min(100, x.affinity + 5) } : x)) };
    const got = infoFrom(s, AGENCIES[o.agency].name, regionOf(o.cityId), rng);
    acquired.push(got);
    notices.push(`Échange avec ${o.codename || o.name} : ${got.title}`);
    caught(0.2);
  } else {
    const broker = BROKERS.find((b) => b.id === ref)!;
    const price = Math.round((v * BROKER_PRICE * (item.sensitive ? 2 : 1)) / 100) * 100;
    const country = findCity(broker.cityId)?.country;
    c = {
      ...c,
      money: c.money + price,
      ledger: pushLedger(c.ledger, day, `Vente d'information (${broker.name})`, price),
      heat: country ? { ...c.heat, [country]: Math.min(100, (c.heat?.[country] ?? 0) + 10) } : c.heat,
    };
    notices.push(`Vendu à ${broker.name} : +${price.toLocaleString("fr-FR")} €`);
    caught(0.3);
  }
  journal.push(`J${day} : « ${item.title} » cédée à ${buyer.label}.`);
  return { state: { ...s, character: c, journal, knowledge: { ...s.knowledge, acquired: acquired.slice(-30) }, updatedAt: Date.now() }, notices };
}
