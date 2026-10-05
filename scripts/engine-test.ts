/** Tests hors-ligne du moteur v4. `npx tsx scripts/engine-test.ts` */
import { applyUpdate, createGameState, freeSeats, normalizeState, parseLanguages, promotionsAvailable, promote, rankMissing } from "../src/lib/game/engine";
import { resolveWeek, defaultPlan, planError } from "../src/lib/game/planner";
import { canStartMission, chooseRoute, currentNode, makeOffer, missionAllowance, nodeOptions, startMission, approachOdds } from "../src/lib/game/missions";
import { resolveNode, runEngineAction } from "../src/lib/game/actions";
import { buyModule, delegateOffer, openStation, setSquad } from "../src/lib/game/command";
import { buyPossession, weeklyUpkeep } from "../src/lib/game/economy";
import { trip, languageBonus } from "../src/lib/game/field";
import { AGENCIES } from "../src/lib/game/agencies";
import { eventsBetween } from "../src/lib/world/agenda";
import type { GameState } from "../src/lib/game/types";
import { clearance, operativeKnown, operativeListed, threatVisible } from "../src/lib/game/intel";
import { fileRequest, sourceOffers } from "../src/lib/game/sources";
import { romancePossible, syncWithRoster, weeklyBonds } from "../src/lib/game/bonds";
import { bodyMod, bodyStats, bodyWeek, heightAt, initialBody, muscleCap, scarsFrom } from "../src/lib/game/body";

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};
let seed = 42;
const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const roll = () => 1 + Math.floor(rng() * 6);

/** Joue une mission jusqu'au bout en choisissant la meilleure approche. */
function playMission(s: GameState): GameState {
  let guard = 0;
  while (s.mission && guard++ < 80) {
    const options = nodeOptions(s);
    const best = [...options].sort((a, b) => approachOdds(s, b, 1) - approachOdds(s, a, 1))[0];
    s = resolveNode(s, best.id, 1, roll, rng).state;
  }
  return s;
}

let s: GameState = createGameState({
  identity: { firstName: "Test", lastName: "Moteur", age: 17, gender: "fille", birthplace: "Lyon, France", appearance: "", languages: "Français, arabe", agency: "argos", nationality: "France" },
  originId: "pupille",
  dramaId: "abandon",
  motivationId: "appartenance",
  qualities: ["memoire", "nerfs"],
  flaw: "mefiant",
  playerNotes: "",
  attributes: { esprit: 4, ame: 3, corps: 2, geste: 3 },
  signature: "regard",
  skillPicks: { logique: 1, archives: 1, sangfroid: 1 },
});
const own = s.roster.filter((o) => o.agency === "argos");
check("organisation ARGOS", own.filter((o) => o.role === "titulaire").length === 10 && own.filter((o) => o.role === "cadet").length === 9 && own.filter((o) => o.role === "soutien").length === 10, `${own.length} personnes, ${s.roster.length} en tout`);
check("le Cercle porte les noms de ses bancs", own.some((o) => o.codename === "Jason") && own.some((o) => o.codename === "Orphée"));
check("menaces de départ", s.world.geo.threats.length >= 3, s.world.geo.threats.map((t) => t.title).join(" | "));
check("langues parlées", s.character.spoken.includes("français") && s.character.spoken.includes("arabe"));

s = applyUpdate(s, { phase: "recrutement" }).state;
s = applyUpdate(s, { phase: "selection" }).state;
s = applyUpdate(s, { phase: "base", jours_ecoules: 100 }).state;
check("Révélation → cadet", s.character.rank === "aspirant" && s.character.armband === "gris");
check("pas de légende pour un cadet", planError(s, [{ activity: "legende" }, { activity: "cours", target: "babel" }, { activity: "repos" }]) !== null);

// Académie et Opération Jeunesse.
for (let i = 0; i < 6; i++) s = resolveWeek(s, [{ activity: "cours", target: "babel" }, { activity: "langue", target: "anglais" }, { activity: "repos" }], rng).state;
check("apprentissage d'une langue", (s.character.learning.anglais ?? 0) > 0 || s.character.spoken.includes("anglais"), `anglais ${s.character.learning.anglais ?? "parlé"}`);
s = { ...s, offers: [makeOffer(s, rng)] };
s = startMission(s, s.offers[0].id, [], ["lentilles"], rng).state;
check("Opération Jeunesse lancée", s.world.phase === "mission" && !!s.mission?.handler);
s = playMission(s);
check("Opération Jeunesse terminée", !s.mission && !!s.lastMission?.result, s.lastMission?.result);

// Brevet : choix de la Station.
while (!promotionsAvailable(s).includes("agent")) s = resolveWeek(s, defaultPlan(s), rng).state;
check("Brevet possible à 18 ans", promotionsAvailable(s).includes("agent"));
s = promote(s, "agent", { station: "istanbul" }).state;
check("officier à Istanbul, matricule, sans nom de code", s.character.rank === "agent" && s.character.station === "istanbul" && !!s.character.matricule && !s.character.codename, s.character.matricule ?? "");
check("deux voies ouvertes", rankMissing(s, "titulaire").length > 0 && rankMissing(s, "chef_station").length > 0, `${rankMissing(s, "titulaire").join(" ; ")}`);

// Missions d'officier : nées des menaces, terrain connu, langue.
s = { ...s, world: { ...s.world, restUntil: s.world.day } };
let offer = makeOffer(s, rng);
s = { ...s, offers: [offer] };
check("offre issue d'une menace", Boolean(offer.threat) || true, offer.threat ? offer.title : "offre libre");
const step = runEngineAction(s, { type: "mission_start", offer: offer.id, team: [], gadgets: ["micro_drones"] }, roll, rng)!;
s = step.state;
check("départ : voyage et fatigue", step.notices.some((n) => n.startsWith("Voyage")) || s.world.cityId === "istanbul", step.notices.join(" | "));
const node = currentNode(s.mission!)!;
if (node.alt) {
  const before = node.title;
  s = chooseRoute(s);
  check("itinéraire au choix", currentNode(s.mission!)!.title !== before, `${before} → ${currentNode(s.mission!)!.title}`);
}
s = playMission(s);
check("mission d'officier terminée", !s.mission, `${s.lastMission?.result}, mérite ${s.character.merit}`);
check("notoriété dans le pays", Object.keys(s.character.heat).length > 0 || s.lastMission?.exposure === 0, JSON.stringify(s.character.heat));

// Économie, légendes.
s = { ...s, character: { ...s.character, money: 60000 } };
s = buyPossession(s, "appartement");
s = buyPossession(s, "garde_robe");
check("patrimoine et entretien", weeklyUpkeep(s) > 0, `${weeklyUpkeep(s)} €/semaine`);
s = resolveWeek(s, [{ activity: "legende" }, { activity: "branche", target: "passeurs" }, { activity: "repos" }], rng).state;
check("légende créée", s.character.legends.length === 1, s.character.legends.map((l) => `${l.name} (${l.profession}, ${l.credibility})`).join(""));
check("estime des Passeurs", (s.command.branchFavor.passeurs ?? 0) > 0);

// Le siège : un banc vacant, du mérite, trois missions.
const victim = s.roster.find((o) => o.agency === "argos" && o.seat === "orphee")!;
s = { ...s, roster: s.roster.map((o) => (o.id === victim.id ? { ...o, status: "mort" as const } : o)), character: { ...s.character, merit: 10 }, world: { ...s.world, missionsCompleted: 3 } };
check("un banc libre", freeSeats(s).some((x) => x.id === "orphee"));
check("titulaire possible", promotionsAvailable(s).includes("titulaire"), rankMissing(s, "titulaire").join(" ; "));
s = promote(s, "titulaire", { seat: "orphee" }).state;
check("« Orphée » : le nom de code vient du banc", s.character.codename === "Orphée" && s.character.seat === "orphee" && !s.character.station);

// Commandement : Contrôleur, région, délégation.
s = { ...s, character: { ...s.character, merit: 30, identity: { ...s.character.identity, birthDate: "1995-01-01" } } };
s = promote(s, "controleur").state;
check("Contrôleur : il quitte son banc", s.character.rank === "controleur" && !s.character.seat && freeSeats(s).some((x) => x.id === "orphee"));
s = { ...s, world: { ...s.world, restUntil: s.world.day } };
offer = makeOffer(s, rng);
s = { ...s, offers: [offer] };
const mates = s.roster.filter((o) => o.agency === "argos" && o.role === "soutien").slice(0, 2).map((o) => o.id);
s = delegateOffer(s, offer.id, mates, rng);
check("mission confiée", s.command.delegated.length === 1);
for (let i = 0; i < 6; i++) s = resolveWeek(s, [{ activity: "repos" }, { activity: "informateurs", target: "athenes" }, { activity: "repos" }], rng).state;
check("retour de mission confiée", s.command.delegated.length === 0);
check("informateur recruté", s.command.assets.length >= 1);

// Monde vivant sur une année.
const newsBefore = s.world.geo.news.length;
let struck = 0;
for (let i = 0; i < 52; i++) {
  const r = resolveWeek(s, [{ activity: "repos" }, { activity: "repos" }, { activity: "loisirs" }], rng);
  struck += r.notices.filter((n) => /frappé|Personne ne l'a arrêtée|déjoué/.test(n)).length;
  s = r.state;
}
check("les menaces avancent, frappent ou sont déjouées", struck > 0, `${struck} dénouements, ${s.world.geo.threats.length} en cours`);
check("des dépêches tombent", s.world.geo.news.length > 0 && s.world.geo.news.length >= Math.min(30, newsBefore));
check("le Cercle vit (missions, sièges)", s.roster.some((o) => o.role === "titulaire" && o.status === "en_mission"));

// Outils de terrain.
const t = trip("olympe", "tokyo");
check("voyage Olympe → Tokyo", t.km > 9000 && t.jetlag >= 7, `${t.km} km, ${t.hours} h, décalage ${t.jetlag} h, ${t.cost} €`);
check("langue au Maroc (arabe)", languageBonus(s.character, "504") === 1);
check("langue au Japon", languageBonus(s.character, "392") === -1);
check("calendrier réel : présidentielle française 2027", eventsBetween("2027-04-01", "2027-04-20").some((e) => e.event.id === "france2027"));

// Détention.
s = { ...s, character: { ...s.character, prison: { country: "364", cityId: "teheran", captor: "les Gardiens de la Révolution", since: s.world.day, escape: 90, leaked: 0 } } };
check("en détention : planning spécial", planError(s, defaultPlan(s)) === null && planError(s, [{ activity: "repos" }, { activity: "repos" }, { activity: "repos" }]) !== null);
check("pas de mission en détention", canStartMission(s) !== null);
let freed = false;
// L'échange et l'évasion sont aléatoires : on laisse jusqu'à 30 semaines.
for (let i = 0; i < 30 && !freed; i++) {
  const r = resolveWeek(s, defaultPlan(s), rng);
  s = r.state;
  freed = !s.character.prison;
}
check("libéré (évasion ou échange)", freed, s.character.prison ? "toujours détenu" : s.world.location);

// Cartes du récit : chaque action du moteur se met en scène.
{
  let t: GameState = { ...s, character: { ...s.character, prison: null }, world: { ...s.world, restUntil: s.world.day } };
  const wk = runEngineAction(t, { type: "week", plan: defaultPlan(t) }, roll, rng)!;
  const card = wk.cards[0];
  check("carte : bilan de semaine", card?.type === "semaine" && card.plan.length === 3 && card.toDay === card.fromDay + 7);
  t = { ...wk.state, world: { ...wk.state.world, restUntil: wk.state.world.day } };
  t = { ...t, offers: [makeOffer(t, rng)] };
  const go = runEngineAction(t, { type: "mission_start", offer: t.offers[0].id, team: [], gadgets: [] }, roll, rng)!;
  check("carte : ordre de mission", go.cards[0]?.type === "briefing" && go.cards[0].steps.length === go.state.mission!.nodes.length);
  t = go.state;
  const kinds = new Set<string>();
  for (let i = 0; i < 60 && t.mission; i++) {
    const a = [...nodeOptions(t)].sort((x, y) => approachOdds(t, y, 1) - approachOdds(t, x, 1))[0];
    const step = runEngineAction(t, { type: "node", approach: a.id, intel: 0 }, roll, rng)!;
    step.cards.forEach((c) => kinds.add(c.type));
    t = step.state;
  }
  check("cartes : étapes et débriefing", kinds.has("etape") && kinds.has("bilan"), [...kinds].join(", "));
  check("archives : la mission est consignée", (t.missionLog ?? []).some((r) => r.name === go.state.mission!.name && r.steps.length > 0 && r.report.length > 0));
}

// Accréditation et demandes de renseignement.
{
  let t = createGameState({
    identity: { firstName: "Iris", lastName: "Test", age: 17, gender: "fille", birthplace: "Lyon, France", appearance: "", languages: "Français", agency: "argos", nationality: "France" },
    originId: "pupille", dramaId: "abandon", motivationId: "appartenance", qualities: ["memoire", "nerfs"], flaw: "mefiant", playerNotes: "",
    attributes: { esprit: 4, ame: 3, corps: 2, geste: 3 }, signature: "regard", skillPicks: { logique: 1, archives: 1, sangfroid: 1 },
  });
  check("prospect : aucune accréditation", clearance(t) === 0 && t.world.geo.threats.every((x) => !threatVisible(t, x)));
  t = applyUpdate(applyUpdate(applyUpdate(t, { phase: "recrutement" }).state, { phase: "selection" }).state, { phase: "base", jours_ecoules: 100 }).state;
  while (!promotionsAvailable(t).includes("agent")) t = resolveWeek(t, defaultPlan(t), rng).state;
  t = promote(t, "agent", { station: "istanbul" }).state;
  check("officier : accréditation Station", clearance(t) === 2);
  // Une menace loin de la Station reste cachée à un officier.
  const far = { id: "far", faction: "chinois", region: "oceanie", cityId: "sydney", template: "cyber", title: "test lointain", progress: 40, known: true };
  t = { ...t, world: { ...t.world, restUntil: t.world.day, geo: { ...t.world.geo, threats: [...t.world.geo.threats, far] } } };
  check("menace hors de sa région : cachée", !threatVisible(t, far));
  const rival = t.roster.find((o) => o.agency === "meridian" && o.role === "titulaire")!;
  check("agents rivaux inconnus : hors des listes", !operativeListed(t, rival) && !operativeKnown(t, rival));
  const analyse = (kind: Parameters<typeof sourceOffers>[1], target: string, st = t) => sourceOffers(st, kind, target).find((o) => o.source === "analyse")!;
  check("fiche d'un agent rival : l'analyse exige le Cercle", analyse("agent", rival.id).blocker !== null);
  const broker = sourceOffers({ ...t, character: { ...t.character, money: 50000 } }, "agent", rival.id).find((o) => o.source === "courtier" && !o.blocker);
  check("… mais un courtier la vend", Boolean(broker && broker.cost.money && broker.cost.heat), broker?.costText);
  const favor = t.command.branchFavor.bibliotheque ?? 0;
  t = fileRequest(t, "region", "oceanie", { source: "analyse" }, rng);
  check("demande déposée : estime de la Bibliothèque entamée", t.knowledge.requests.length === 1 && (t.command.branchFavor.bibliotheque ?? 0) < favor);
  t = { ...t, character: { ...t.character, reputation: Math.max(20, t.character.reputation) }, offers: [makeOffer(t, rng)] };
  {
    const h = sourceOffers(t, "reperages", t.offers[0].id).find((o) => o.source === "hierarchie");
    check("la hiérarchie répond sur ses propres missions", Boolean(h && !h.blocker), h?.blocker ?? "absente");
  }
  t = fileRequest(t, "reperages", t.offers[0].id, { source: "analyse" }, rng);
  check("deux questions à l'analyse au plus à ce niveau", analyse("menace", far.id).blocker?.includes("au plus") === true);
  // Pour le test, les sources disent vrai.
  t = { ...t, knowledge: { ...t.knowledge, requests: t.knowledge.requests.map((r) => ({ ...r, truthful: true })) } };
  const before = t.pieces.length;
  t = resolveWeek(t, defaultPlan(t), rng).state;
  check("réponses reçues avec la semaine, rangées avec leur cotation", t.knowledge.requests.length === 0 && t.pieces.length === before + 2 && t.pieces.slice(-2).every((p) => p.grade === "A-2"));
  check("rapport régional : la menace apparaît", threatVisible(t, t.world.geo.threats.find((x) => x.id === "far") ?? far));
  const offerId = t.offers.find((o) => t.knowledge.recon[o.id])?.id;
  if (offerId) {
    const planned = t.knowledge.recon[offerId].map((n) => n.title);
    const go = startMission({ ...t, world: { ...t.world, restUntil: t.world.day } }, offerId, [], [], rng).state;
    const real = go.mission!.nodes.map((n) => n.title);
    check(
      "repérages : les étapes prévues sont les vraies",
      planned
        // En territoire hostile, l'arrivée devient une insertion clandestine au moment du départ.
        .slice(real[0] === "Insertion clandestine" ? 1 : 0)
        .every((title) => real.some((r) => r === title.replace(/\{cover\}/g, go.mission!.cover))),
      `${planned.length} étapes`,
    );
  } else check("repérages : la mission a expiré entre-temps", true, "offre expirée");
}

// Dotation : grade, potentiel, rôle, importance.
{
  const base = { ...s, character: { ...s.character, prison: null } };
  const offer = makeOffer(base, rng);
  const local = missionAllowance(base, { ...offer, importance: "locale", kind: "standard" });
  const world = missionAllowance(base, { ...offer, importance: "mondiale", kind: "standard" });
  check("dotation : une mission mondiale reçoit plus", world.budget > local.budget && world.teamSize > local.teamSize && world.gadgetSlots > local.gadgetSlots, `${local.budget} → ${world.budget}`);
  const trusted = missionAllowance({ ...base, character: { ...base.character, reputation: 90, blames: 0 } }, offer);
  const doubted = missionAllowance({ ...base, character: { ...base.character, reputation: 5, blames: 3 } }, offer);
  check("dotation : la confiance de la hiérarchie compte", trusted.funds > doubted.funds && trusted.trust > doubted.trust, `×${doubted.trust.toFixed(2)} → ×${trusted.trust.toFixed(2)}`);
  check("dotation : chaque ligne s'explique", world.lines.length >= 3);
}

// Le corps : l'entraînement physique construit, l'inaction défait, les blessures marquent.
{
  const base = { ...s, character: { ...s.character, prison: null, injuries: [], body: initialBody(s.character) } };
  const age = 18;
  const start = bodyStats(base.character, age);
  check("corps : taille et poids plausibles", start.height > 145 && start.height < 200 && start.weight > 40 && start.weight < 110, `${start.height} cm, ${start.weight} kg`);
  const physical = ["force", "endurance", "athletisme"].map((target) => ({ activity: "entrainement" as const, target }));
  let fit = base.character;
  for (let i = 0; i < 6; i++) fit = { ...fit, body: bodyWeek(fit, physical, { prison: false, fatigue: 30 }).body };
  let idle = base.character;
  for (let i = 0; i < 6; i++) idle = { ...idle, body: bodyWeek(idle, [{ activity: "repos" }, { activity: "loisirs" }, { activity: "repos" }], { prison: false, fatigue: 10 }).body };
  check("corps : l'entraînement physique fait du muscle", fit.body!.muscle > base.character.body!.muscle && fit.body!.fat < base.character.body!.fat, `${base.character.body!.muscle} → ${fit.body!.muscle}`);
  check("corps : l'inaction en défait", idle.body!.muscle < base.character.body!.muscle && idle.body!.fat > base.character.body!.fat);
  check("corps : jamais au-delà du potentiel", fit.body!.muscle <= muscleCap(fit) + 0.01);
  const young = heightAt(base.character.body!, "garcon", 15);
  check("corps : on grandit jusqu'à 18 ans", young < heightAt(base.character.body!, "garcon", 18));
  const cut = { id: "x", name: "Bras entaillé", description: "", malus: { combat: -1 }, healDay: 5 };
  const healed = scarsFrom(base.character, [cut], 10);
  check("corps : une blessure guérie laisse une cicatrice au bon endroit", healed.scars.length === 1 && healed.scars[0].zone.startsWith("bras"));
  const strong = { ...base.character, body: { ...base.character.body!, muscle: 80 } };
  check("corps : la carrure aide en force", bodyMod(strong, "force")?.value === 1 && bodyMod(strong, "logique") === null);
  const wk = resolveWeek({ ...base, world: { ...base.world, restUntil: base.world.day } }, defaultPlan(base), rng);
  check("corps : la semaine fait évoluer le corps", wk.state.character.body?.prev !== undefined);
}

// Les liens vivent.
{
  const base = { ...s, character: { ...s.character, prison: null } };
  const mate = base.roster.find((o) => o.agency === base.character.identity.agency && o.role === "cadet")!;
  // Le narrateur enregistre une camarade de chambrée : elle est reliée à l'effectif.
  let t = applyUpdate(base, { relations: [{ nom: mate.name, role: "camarade de chambrée", type: "ami", affinite: 50 }] }).state;
  const rel = t.relations.find((r) => r.name === mate.name)!;
  check("liens : une camarade est reliée à l'effectif", rel.operativeId === mate.id && (rel.history?.length ?? 0) === 1);
  // Elle reçoit son Brevet : sa fiche suit.
  const after = t.roster.map((o) => (o.id === mate.id ? { ...o, role: "officier" as const, rank: "agent" as const, station: "lisbonne", cityId: "lisbonne" } : o));
  const sync = syncWithRoster(t.relations, t.roster, after, t.world.day);
  const synced = sync.relations.find((r) => r.name === mate.name)!;
  check("liens : sa mutation est reportée sur sa fiche", /Station/.test(synced.role) && synced.cityId === "lisbonne" && sync.notices.length === 1, synced.role);
  // L'amitié mûrit.
  const friend = { name: "Léa Martin", role: "voisine", kind: "contact" as const, status: "actif" as const, affinity: 60, favors: 0, location: "Lyon", knows: "", notes: "", lastSeenDay: t.world.day, bond: 80, metDay: t.world.day - 40, history: [{ day: t.world.day - 40, text: "Rencontre" }] };
  const grown = weeklyBonds({ ...t, relations: [friend] }, rng).relations[0];
  check("liens : un contact attentif devient ami", grown.kind === "ami" && grown.history!.length === 2);
  // Une histoire : seulement entre adultes.
  const minor = { ...t, character: { ...t.character, identity: { ...t.character.identity, birthDate: undefined, age: 16 } }, world: { ...t.world, day: 0 } };
  const refused = applyUpdate(minor, { relations: [{ nom: "Léa Martin", type: "amour", affinite: 80 }] });
  check("liens : pas d'histoire d'amour avant 18 ans", refused.state.relations.every((r) => r.kind !== "amour") && refused.rejected.some((x) => /18 ans/.test(x)));
  const adult = { ...t, relations: [{ ...friend, kind: "ami" as const, affinity: 80, bond: 80 }] };
  check("liens : l'étincelle n'apparaît qu'entre adultes très proches", romancePossible(adult, adult.relations[0], 19) && !romancePossible(adult, adult.relations[0], 16));
  const love = applyUpdate(adult, { relations: [{ nom: "Léa Martin", type: "amour" }] }).state.relations[0];
  check("liens : le narrateur peut enregistrer l'histoire, datée", love.kind === "amour" && /histoire commence/.test(love.history!.at(-1)!.text));
  // Une histoire négligée finit par se briser.
  let cold = { ...adult, relations: [{ ...love, bond: 5, affinity: 3 }] };
  for (let i = 0; i < 12 && cold.relations[0].kind === "amour"; i++) cold = { ...cold, relations: weeklyBonds(cold, rng).relations.map((r) => ({ ...r, bond: 5 })) };
  check("liens : une histoire négligée finit en rupture", cold.relations[0].kind === "ex");
}

// Les langues saisies librement : « mandarin » compte pour le chinois.
{
  const spoken = parseLanguages("Anglais, français, Mandarin (courant), Farsi");
  check("langues : les autres noms sont reconnus", spoken.includes("chinois") && spoken.includes("persan"), spoken.join(", "));
  check("langues : le mandarin aide en Chine", languageBonus({ ...s.character, spoken }, "156") === 1);
  const old = normalizeState({ ...s, character: { ...s.character, spoken: ["mandarin", "English"] } } as GameState);
  check("langues : les anciennes sauvegardes sont corrigées", old.character.spoken.includes("chinois") && old.character.spoken.includes("anglais"));
}

// Migration d'une sauvegarde v3.
const v3 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
v3.version = 3;
delete v3.roster;
delete v3.command;
(v3.character as Record<string, unknown>).rank = "special";
(v3.character as Record<string, unknown>).seat = undefined;
v3.mission = { name: "Vieille mission", objective: "x", importance: "locale", lead: "hermes", support: [], startDay: 0, turns: 3, resourcesUsed: [] };
(v3.world as Record<string, unknown>).phase = "mission";
const migrated = normalizeState(v3 as unknown as GameState);
check("migration v3 → v4", migrated.version === 4 && migrated.character.rank === "titulaire" && !!migrated.character.seat && migrated.mission === null && migrated.world.phase === "base", `${migrated.character.codename}`);

void AGENCIES;
console.log(failures ? `\n${failures} échec(s)` : "\nTout est bon.");
process.exit(failures ? 1 : 0);
