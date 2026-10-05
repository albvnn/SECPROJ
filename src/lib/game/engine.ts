import {
  ATTR_MAX,
  ATTRIBUTE_IDS,
  ATTRIBUTES,
  BREVET_AGE,
  DIFFICULTIES,
  INTRIGUE_MAX_TURNS,
  LOW_THRESHOLD,
  MISSION_IMPORTANCE,
  MISSION_RESULTS,
  PACES,
  PARTIAL_MARGIN,
  POINTS_PER_BREVET,
  POINTS_PER_MISSION,
  POINTS_PER_RANK,
  POLE_POINT_COST,
  RANK_IDS,
  RANKS,
  SKILL_IDS,
  SKILLS,
  findFlaw,
  findOrigin,
  findQuality,
  formatEuros,
  formatMerit,
  healthMaxFor,
  missionBonus,
  missionMerit,
  moraleMaxFor,
  progressKind,
  skillCap,
  xpToNext,
  type Trait,
  missionTurns,
} from "./rules";
import { AGENCIES, SEAT_XP_BONUS, findSeat, type SeatDef } from "./agencies";
import type {
  AttributeId,
  Character,
  CheckOutcome,
  CheckResult,
  Difficulty,
  GameState,
  Identity,
  Item,
  ItemCategory,
  MissionImportance,
  MissionResult,
  PhaseId,
  RankId,
  Relation,
  RelationKind,
  RelationStatus,
  SkillId,
  SkillState,
  World,
} from "./types";
import { addDays, addYears, ageAt, isoDate } from "./calendar";
import { commandOnPromotion, emptyCommand } from "./command";
import { canonicalLanguages, injuryMalus } from "./field";
import { bodyMod, initialBody } from "./body";
import { pushLedger } from "./ledger";
import { findOperative, romanceAllowed, withHistory } from "./bonds";

const KIND_STEP: Partial<Record<RelationKind, (n: string) => string>> = {
  ami: (n) => `${n} devient un·e ami·e`,
  proche: (n) => `${n} devient un·e proche`,
  amour: (n) => `${n} et toi : une histoire commence`,
  ex: (n) => `Rupture avec ${n}`,
  rival: (n) => `${n} devient un·e rival·e`,
  ennemi: (n) => `${n} devient un·e ennemi·e`,
  allie: (n) => `${n} devient un·e allié·e`,
  mentor: (n) => `${n} devient ton mentor`,
  equipier: (n) => `${n} devient ton équipier·e`,
};
import { clearanceDef, clearanceOf } from "./intel";
import { generateRoster } from "./roster";
import { findCity, findCountryByName, matchCity, CITIES as MAP_CITIES } from "@/lib/world/geo";
import { initialGeo } from "@/lib/world/world";
import { initialThreats } from "@/lib/world/threats";

const withThreats = (geo: ReturnType<typeof initialGeo>) => ({ ...geo, threats: initialThreats(geo) });

/** Objets portés sur soi au maximum ; le reste est au casier de la base. */
export const CARRY_LIMIT = 8;
/** Relations suivies au maximum (hors archivées et décédées). */
export const RELATION_LIMIT = 12;

/* ------------------------------------------------------------------ */
/* Création                                                            */
/* ------------------------------------------------------------------ */

export interface CharacterDraft {
  identity: Identity;
  originId: string;
  dramaId: string;
  motivationId: string;
  qualities: string[];
  flaw: string;
  playerNotes: string;
  attributes: Record<AttributeId, number>;
  signature: SkillId;
  /** Rangs choisis à la création (hors origine et signature). */
  skillPicks: Partial<Record<SkillId, number>>;
}

export function characterTraits(c: Pick<Character, "qualities" | "flaw">): Trait[] {
  return [...c.qualities.map(findQuality), findFlaw(c.flaw)].filter((t): t is Trait => Boolean(t));
}

/** Rangs de départ : origine + compétence signature + choix du joueur. */
export function startingRanks(
  originId: string,
  signature: SkillId | null,
  picks: Partial<Record<SkillId, number>>,
): Record<SkillId, number> {
  const ranks = Object.fromEntries(SKILL_IDS.map((s) => [s, 0])) as Record<SkillId, number>;
  for (const [s, v] of Object.entries(findOrigin(originId)?.skills ?? {})) ranks[s as SkillId] += v ?? 0;
  if (signature) ranks[signature] += 1;
  for (const [s, v] of Object.entries(picks)) ranks[s as SkillId] += v ?? 0;
  return ranks;
}

function traitSum(c: Pick<Character, "qualities" | "flaw">, key: "healthMax" | "moraleMax" | "reputation") {
  return characterTraits(c).reduce((n, t) => n + (t[key] ?? 0), 0);
}

/** Date de naissance aléatoire telle que le personnage ait exactement `age` ans à `startIso`. */
function randomBirthDate(age: number, startIso: string): string {
  return addDays(addYears(startIso, -age - 1), 1 + Math.floor(Math.random() * 364));
}

export function createGameState(draft: CharacterDraft): GameState {
  const startDate = isoDate(new Date());
  const origin = findOrigin(draft.originId);
  const ranks = startingRanks(draft.originId, draft.signature, draft.skillPicks);
  const skills = Object.fromEntries(
    SKILL_IDS.map((s) => [
      s,
      {
        // Les bonus d'origine ne dépassent jamais le plafond du pôle.
        rank: Math.min(ranks[s], skillCap(draft.attributes[SKILLS[s].attribute], s === draft.signature)),
        xp: 0,
      } satisfies SkillState,
    ]),
  ) as Record<SkillId, SkillState>;

  const healthMax = healthMaxFor(draft.attributes.corps) + traitSum(draft, "healthMax");
  const moraleMax = Math.max(4, moraleMaxFor(draft.attributes.ame) + traitSum(draft, "moraleMax"));
  const reputation = clamp(50 + traitSum(draft, "reputation"), 0, 100);

  const character: Character = {
    identity: { ...draft.identity, birthDate: draft.identity.birthDate ?? randomBirthDate(draft.identity.age, startDate) },
    originId: draft.originId,
    dramaId: draft.dramaId,
    motivationId: draft.motivationId,
    qualities: draft.qualities,
    flaw: draft.flaw,
    playerNotes: draft.playerNotes,
    attributes: draft.attributes,
    skills,
    signature: draft.signature,
    health: healthMax,
    healthMax,
    morale: moraleMax,
    moraleMax,
    reputation,
    rank: "prospect",
    merit: 0,
    blames: 0,
    feats: { majorMission: false, commanded: false },
    codename: null,
    inventory: origin ? [{ ...origin.item, category: "souvenir", carried: true }] : [],
    distinctions: [],
    skillPoints: 0,
    matricule: null,
    seat: null,
    station: null,
    money: origin?.money ?? 0,
    missionFunds: 0,
    fatigue: 0,
    cover: 80,
    armband: "blanc",
    youthOps: 0,
    legends: [],
    heat: {},
    injuries: [],
    body: initialBody(draft),
    spoken: parseLanguages(draft.identity.languages),
    learning: {},
    possessions: [],
    prison: null,
  };

  const now = Date.now();
  return {
    version: 4,
    id: randomId(),
    createdAt: now,
    updatedAt: now,
    character,
    world: {
      startDate,
      phase: "dossier",
      day: 0,
      location: draft.identity.birthplace || draft.identity.nationality,
      chapter: "Dossier de prospect",
      missionsCompleted: 0,
      cityId: homeCity(draft.identity),
      restUntil: 0,
      geo: withThreats(initialGeo()),
    },
    relations: [],
    journal: [],
    journalResolved: [],
    dossier: null,
    saga: "",
    archives: [],
    chronicle: "",
    chronicleChapter: "",
    chronicleUpTo: 0,
    gmNotes: "",
    progress: [],
    pieces: [],
    knowledge: emptyKnowledge(),
    missionLog: [],
    log: [],
    choices: [],
    settings: { narration: "eco", pace: "rapide" },
    scene: null,
    phaseTurns: 0,
    chapterTurns: 0,
    mission: null,
    lastMission: null,
    offers: [],
    roster: generateRoster(draft.identity.agency, draft.identity.age),
    duties: [],
    lastWeek: null,
    command: emptyCommand(),
    intrigue: null,
    nextIntensity: "forte",
    routing: null,
    usage: emptyUsage(),
  };
}

/** « Français, arabe » → ["français", "arabe"]. */
export function parseLanguages(text: string): string[] {
  return canonicalLanguages(
    (text ?? "")
      .split(/[,;/+]| et |\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

/** Ville de la carte la plus proche de l'histoire du personnage : son lieu de naissance, ou une ville de son pays. */
function homeCity(identity: Identity): string {
  const byName = matchCity(identity.birthplace);
  if (byName) return byName.id;
  const country = findCountryByName(identity.nationality);
  const city = MAP_CITIES.find((c) => c.country === country?.id && !c.tags?.includes("secret"));
  return city?.id ?? AGENCIES[identity.agency].academyCity;
}

export function emptyKnowledge(): GameState["knowledge"] {
  return { regions: {}, operatives: [], factions: [], recon: {}, threats: {}, requests: [], circles: [] };
}

export function emptyUsage(): GameState["usage"] {
  return { turns: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0 };
}

/**
 * Remet la partie au stade « dossier à rédiger », en effaçant ce que la
 * rédaction précédente avait ajouté. Possible uniquement avant le premier tour.
 */
export function resetDossier(state: GameState): GameState {
  if (state.log.length > 0) throw new Error("La partie a déjà commencé : le dossier ne peut plus être réécrit.");
  return {
    ...state,
    dossier: null,
    relations: [],
    journal: [],
    journalResolved: [],
    gmNotes: "",
    choices: [],
    world: {
      ...state.world,
      phase: "dossier",
      day: 0,
      chapter: "Dossier de prospect",
      location: state.character.identity.birthplace || state.character.identity.nationality,
    },
    updatedAt: Date.now(),
  };
}

/** Complète les champs optionnels (robustesse face aux sauvegardes éditées à la main). */
export function normalizeState(s: GameState): GameState {
  const startDate = s.world.startDate ?? isoDate(new Date(s.createdAt));
  const birthDate = s.character.identity.birthDate ?? addYears(startDate, -s.character.identity.age);
  const agency = AGENCIES[s.character.identity.agency] ?? AGENCIES.argos;
  // Grades de l'ancienne organisation (v3) → nouvelle organisation.
  const OLD_RANKS: Record<string, RankId> = { special: "titulaire", chef: "doyen", commandeur: "controleur" };
  const rank: RankId = OLD_RANKS[s.character.rank as string] ?? s.character.rank;
  const cadet = rank === "aspirant";
  const officer = rank === "agent" || rank === "chef_station";
  const seat = s.character.seat ?? (rank === "titulaire" || rank === "doyen" ? agency.seats[0].id : null);
  // Les missions de l'ancien format (racontées par le narrateur) n'ont pas d'étapes : on les clôt.
  const legacyMission = s.mission && !Array.isArray((s.mission as { nodes?: unknown }).nodes);
  const phase = legacyMission && s.world.phase === "mission" ? "base" : s.world.phase;
  const home = cadet ? agency.academyCity : RANKS[rank]?.order >= RANKS.agent.order ? agency.hqCity : undefined;
  return {
    ...s,
    version: 4,
    world: {
      ...s.world,
      startDate,
      phase,
      cityId: s.world.cityId ?? matchCity(s.world.location)?.id ?? home ?? agency.academyCity,
      restUntil: s.world.restUntil ?? 0,
      geo: s.world.geo ? { ...initialGeo(), ...s.world.geo } : withThreats(initialGeo()),
    },
    character: {
      ...s.character,
      identity: { ...s.character.identity, birthDate },
      rank,
      feats: { ...{ majorMission: false, commanded: false }, ...(s.character.feats ?? {}), seated: s.character.feats?.seated ?? Boolean(seat) },
      seat,
      codename: seat ? seatCodename(agency.seats.find((x) => x.id === seat)!) : (s.character.codename ?? null),
      matricule: s.character.matricule ?? (officer ? `${agency.name[0]}-${100 + (s.id.charCodeAt(0) % 900)}` : null),
      station: s.character.station ?? (officer ? agency.stations[0] : null),
      inventory: (s.character.inventory ?? []).map((i) => ({ ...i, category: i.category ?? "equipement", carried: i.carried ?? true })),
      fatigue: s.character.fatigue ?? 0,
      cover: s.character.cover ?? 70,
      armband: s.character.armband ?? (cadet ? "gris" : rank === "prospect" ? "blanc" : "gris"),
      youthOps: s.character.youthOps ?? 0,
      legends: s.character.legends ?? [],
      heat: s.character.heat ?? {},
      injuries: s.character.injuries ?? [],
      body: s.character.body ?? initialBody(s.character),
      spoken: s.character.spoken ? canonicalLanguages(s.character.spoken) : parseLanguages(s.character.identity.languages),
      learning: s.character.learning ?? {},
      possessions: s.character.possessions ?? [],
      prison: s.character.prison ?? null,
    },
    relations: (s.relations ?? []).map((r) => ({
      ...r,
      kind: r.kind ?? "contact",
      status: r.status ?? "actif",
      favors: r.favors ?? 0,
      location: r.location ?? "",
      knows: r.knows ?? "",
      lastSeenDay: r.lastSeenDay ?? 0,
      bond: r.bond ?? 60,
      ...(r.cityId ? {} : matchCity(r.location) ? { cityId: matchCity(r.location)!.id, positionDay: r.lastSeenDay ?? 0 } : {}),
      operativeId: r.operativeId ?? findOperative(s.roster ?? [], r.name)?.id,
      history: r.history ?? [],
    })),
    progress: s.progress ?? [],
    pieces: s.pieces ?? [],
    // Les demandes d'avant le réseau de sources n'ont pas de source : elles sont abandonnées.
    knowledge: { ...emptyKnowledge(), ...(s.knowledge ?? {}), requests: (s.knowledge?.requests ?? []).filter((r) => r.source) },
    missionLog: s.missionLog ?? [],
    settings: { narration: s.settings?.narration ?? "eco", pace: s.settings?.pace ?? "rapide" },
    scene: s.scene ?? null,
    phaseTurns: s.phaseTurns ?? 0,
    chapterTurns: s.chapterTurns ?? 0,
    mission: legacyMission ? null : (s.mission ?? null),
    lastMission: s.lastMission ?? null,
    offers: s.offers ?? [],
    roster: s.roster?.length ? s.roster : generateRoster(agency.id, s.character.identity.age, s.world.day),
    duties: s.duties ?? [],
    lastWeek: s.lastWeek ?? null,
    command: { ...emptyCommand(), ...(s.command ?? {}) },
    intrigue: s.intrigue ?? null,
    nextIntensity: s.nextIntensity ?? "courante",
    routing: s.routing ?? null,
    usage: s.usage ?? emptyUsage(),
  };
}

/* ------------------------------------------------------------------ */
/* Valeurs effectives                                                  */
/* ------------------------------------------------------------------ */

export function traitSkillMod(c: Pick<Character, "qualities" | "flaw">, s: SkillId): number {
  return characterTraits(c).reduce((n, t) => n + (t.skills?.[s] ?? 0), 0);
}

export function capFor(c: Character, s: SkillId) {
  return skillCap(c.attributes[SKILLS[s].attribute], s === c.signature);
}

/** Valeur d'une compétence : pôle + rangs appris + talents. */
export function skillTotal(c: Character, s: SkillId): number {
  return c.attributes[SKILLS[s].attribute] + c.skills[s].rank + traitSkillMod(c, s);
}

/** Date du jour dans la partie. */
export function currentDate(state: Pick<GameState, "world">): string {
  return addDays(state.world.startDate ?? "2026-09-01", Math.max(0, state.world.day));
}

/** Âge exact, calculé à partir de la date de naissance et de la date du jour. */
export function currentAge(state: Pick<GameState, "character" | "world">): number {
  const birth = state.character.identity.birthDate;
  if (birth) return ageAt(birth, currentDate(state));
  return state.character.identity.age + Math.floor(Math.max(0, state.world.day) / 365);
}

/** Date à laquelle le personnage atteint un âge donné. */
export function dateOfAge(state: Pick<GameState, "character" | "world">, age: number): string | null {
  const birth = state.character.identity.birthDate;
  return birth ? addYears(birth, age) : null;
}

/* ------------------------------------------------------------------ */
/* Jets                                                                */
/* ------------------------------------------------------------------ */

export interface CheckRequest {
  skill: SkillId;
  difficulty: Difficulty;
  modifier?: number;
  reason: string;
  red?: boolean;
  /** Nom d'un objet de l'inventaire utilisé pour ce jet. */
  item?: string;
  /** Bonus et malus nommés (renseignement, aide d'un équipier, alerte…). */
  bonuses?: { label: string; value: number }[];
}

export interface EngineResult {
  state: GameState;
  notices: string[];
}

export function performCheck(
  state: GameState,
  req: CheckRequest,
  rollD6: () => number,
): EngineResult & { check: CheckResult; itemNote: string } {
  const c = state.character;
  const s = req.skill;
  const attr = SKILLS[s].attribute;
  const breakdown: string[] = [];
  const notices: string[] = [];
  let inventory = c.inventory;
  let itemNote = "";
  let usedItem: string | undefined;

  let bonus = c.attributes[attr];
  breakdown.push(`${ATTRIBUTES[attr].label} ${signed(c.attributes[attr])}`);
  if (c.skills[s].rank) {
    bonus += c.skills[s].rank;
    breakdown.push(`Rangs ${signed(c.skills[s].rank)}`);
  }
  const talent = traitSkillMod(c, s);
  if (talent) {
    bonus += talent;
    breakdown.push(`Traits ${signed(talent)}`);
  }
  if (req.item) {
    const i = c.inventory.findIndex((o) => sameName(o.name, req.item!));
    const it = c.inventory[i];
    if (!it) itemNote = `Objet « ${req.item} » absent de l'inventaire : aucun bonus.`;
    else if (!it.carried) itemNote = `${it.name} est resté au casier : aucun bonus.`;
    else if (!it.bonus || it.bonus.skill !== s) itemNote = `${it.name} n'apporte pas de bonus chiffré en ${SKILLS[s].label}.`;
    else if (it.charges !== undefined && it.charges <= 0) itemNote = `${it.name} est épuisé : aucun bonus.`;
    else {
      bonus += it.bonus.value;
      breakdown.push(`${it.name} ${signed(it.bonus.value)}`);
      usedItem = it.name;
      if (it.charges !== undefined) {
        const left = it.charges - 1;
        inventory = c.inventory.map((o, j) => (j === i ? { ...o, charges: left } : o));
        itemNote = `${it.name} utilisé (${left} utilisation${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}).`;
        if (left === 0) notices.push(`${it.name} est épuisé`);
      } else itemNote = `${it.name} utilisé.`;
    }
  }
  for (const b of req.bonuses ?? []) {
    if (!b.value) continue;
    bonus += b.value;
    breakdown.push(`${b.label} ${signed(b.value)}`);
  }
  const situational = clamp(Math.round(req.modifier ?? 0), -6, 6);
  if (situational) {
    bonus += situational;
    breakdown.push(`Situation ${signed(situational)}`);
  }
  if (c.health <= LOW_THRESHOLD) {
    bonus -= 1;
    breakdown.push("Blessé −1");
  }
  if (c.morale <= LOW_THRESHOLD) {
    bonus -= 1;
    breakdown.push("Moral en berne −1");
  }
  const physique = bodyMod(c, s);
  if (physique) {
    bonus += physique.value;
    breakdown.push(`${physique.label} ${signed(physique.value)}`);
  }
  const wound = injuryMalus(c, s);
  if (wound) {
    bonus += wound;
    breakdown.push(`Blessure ${signed(wound)}`);
  }
  const tired = (c.fatigue ?? 0) >= 85 ? 2 : (c.fatigue ?? 0) >= 60 ? 1 : 0;
  if (tired) {
    bonus -= tired;
    breakdown.push(`Fatigue −${tired}`);
  }

  const dice: [number, number] = [rollD6(), rollD6()];
  const total = dice[0] + dice[1] + bonus;
  const dc = DIFFICULTIES[req.difficulty].dc;
  const outcome: CheckOutcome =
    dice[0] === 6 && dice[1] === 6
      ? "reussite_critique"
      : dice[0] === 1 && dice[1] === 1
        ? "echec_critique"
        : total >= dc
          ? "reussite"
          : total >= dc - PARTIAL_MARGIN
            ? "reussite_partielle"
            : "echec";

  const check: CheckResult = {
    skill: s,
    difficulty: req.difficulty,
    reason: req.reason,
    item: usedItem,
    red: Boolean(req.red),
    dice,
    bonus,
    bonusBreakdown: breakdown,
    total,
    dc,
    outcome,
  };

  // On apprend en pratiquant — et davantage en échouant.
  const xp = outcome === "echec" || outcome === "reussite_critique" ? 2 : 1;
  const withInventory = { ...state, character: { ...c, inventory } };
  const gained = gainSkillXp(withInventory, s, xp);
  return { state: gained.state, notices: [...notices, ...gained.notices], check, itemNote };
}

export function gainSkillXp(state: GameState, s: SkillId, xp: number): EngineResult {
  const c = state.character;
  // Le siège accélère l'apprentissage de ses compétences, hors mission.
  if (state.world.phase !== "mission" && findSeat(c.identity.agency, c.seat)?.specialty.includes(s)) xp += SEAT_XP_BONUS;
  const cap = capFor(c, s);
  let { rank, xp: total } = c.skills[s];
  if (rank >= cap) {
    // Au plafond : l'expérience ne s'accumule pas au-delà d'un palier.
    const capped = Math.min(total + xp, xpToNext(rank));
    const notices =
      capped >= xpToNext(rank) && total < xpToNext(rank)
        ? [`${SKILLS[s].label} plafonne : il faut renforcer le pôle ${ATTRIBUTES[SKILLS[s].attribute].label}`]
        : [];
    return { state: withSkill(state, s, { rank, xp: capped }), notices };
  }
  total += xp;
  const notices: string[] = [];
  while (rank < cap && total >= xpToNext(rank)) {
    total -= xpToNext(rank);
    rank += 1;
    notices.push(`${SKILLS[s].label} progresse : rang ${rank}`);
  }
  return { state: withSkill(state, s, { rank, xp: total }), notices };
}

function withSkill(state: GameState, s: SkillId, value: SkillState): GameState {
  return {
    ...state,
    character: { ...state.character, skills: { ...state.character.skills, [s]: value } },
  };
}

/* ------------------------------------------------------------------ */
/* Grades : mérite et conditions                                       */
/* ------------------------------------------------------------------ */

/** Le nom de code d'un siège : il se transmet avec lui, comme 007. */
export function seatCodename(seat: SeatDef): string {
  return seat.name.replace(/^le Banc d(?:e |')/, "");
}

/** Sièges du Cercle occupés (par l'effectif ou par le joueur). */
export function occupiedSeats(state: GameState): Set<string> {
  const agency = state.character.identity.agency;
  const taken = new Set(
    state.roster.filter((o) => o.agency === agency && o.seat && o.status !== "mort" && o.status !== "retraite" && o.status !== "disparu").map((o) => o.seat!),
  );
  if (state.character.seat) taken.add(state.character.seat);
  return taken;
}

export function freeSeats(state: GameState): SeatDef[] {
  const taken = occupiedSeats(state);
  return AGENCIES[state.character.identity.agency].seats.filter((s) => !taken.has(s.id));
}

/** Grades accessibles depuis le grade actuel (deux voies après Officier). */
export function nextRanks(state: Pick<GameState, "character">): RankId[] {
  return RANK_IDS.filter((r) => RANKS[r].from.includes(state.character.rank));
}

/** Ce qui manque pour obtenir un grade (liste vide = éligible). */
export function rankMissing(state: GameState, to: RankId): string[] {
  const c = state.character;
  const w = state.world;
  const age = currentAge(state);
  const def = RANKS[to];
  const missing: string[] = [];
  if (!def.from.includes(c.rank)) missing.push(`accessible seulement depuis : ${def.from.map((r) => RANKS[r].label).join(" ou ")}`);
  if (to === "aspirant") {
    if (w.phase !== "selection" && w.phase !== "base") missing.push("uniquement à la fin de la Sélection, après la Révélation");
    return missing;
  }
  if (to === "agent") {
    if (age < BREVET_AGE) missing.push(`le Brevet se passe à ${BREVET_AGE} ans (le personnage en a ${age})`);
    if (w.phase !== "base") missing.push("le Brevet se passe à l'Académie, hors mission");
    return missing;
  }
  if (c.merit < def.merit) missing.push(`mérite ${formatMerit(c.merit)} sur ${def.merit}`);
  if (age < def.minAge) missing.push(`${def.minAge} ans minimum`);
  if (to === "titulaire") {
    if (!freeSeats(state).length) missing.push("aucun siège libre au Cercle pour l'instant");
    if (w.missionsCompleted < 3) missing.push(`trois missions réussies (${w.missionsCompleted} pour l'instant)`);
  }
  if (to === "doyen" && c.blames > 0) missing.push("aucun blâme");
  if (to === "directeur") {
    if (!c.feats.seated) missing.push("avoir siégé au Cercle");
    if (!state.command.directorVacant) missing.push("le Directeur en place ne s'en va pas");
  }
  if (w.phase !== "base" || state.mission) missing.push("une promotion se demande à la base");
  return missing;
}

/** Les promotions que le joueur peut demander maintenant. */
export function promotionsAvailable(state: GameState): RankId[] {
  return nextRanks(state).filter((r) => r !== "aspirant" && rankMissing(state, r).length === 0);
}

/** Matricule d'officier, avant le siège : « M-417 ». */
function makeMatricule(agency: string): string {
  const prefix = agency === "argos" ? "A" : agency === "meridian" ? "M" : "S";
  return `${prefix}-${100 + Math.floor(Math.random() * 900)}`;
}

/**
 * Une promotion choisie par le joueur : le moteur l'applique, le narrateur la met en scène.
 * Officier et chef de station reçoivent une Station ; un titulaire prend un siège libre (et son nom de code).
 */
export function promote(state: GameState, to: RankId, opts: { seat?: string; station?: string } = {}): EngineResult {
  const missing = rankMissing(state, to);
  if (missing.length) throw new Error(`Promotion impossible : ${missing.join(" ; ")}.`);
  const agency = AGENCIES[state.character.identity.agency];
  let c: Character = { ...state.character, feats: { ...state.character.feats }, rank: to };
  const w = { ...state.world };
  let command = state.command;
  const notices: string[] = [`Nouveau grade : ${RANKS[to].label}`];
  const pts = to === "agent" ? POINTS_PER_BREVET : POINTS_PER_RANK;
  c.skillPoints += pts;
  notices.push(`+${pts} point${pts > 1 ? "s" : ""} de compétence à répartir (nouveau grade)`);
  const goTo = (cityId: string) => {
    w.cityId = cityId;
    w.location = findCity(cityId)?.name ?? w.location;
  };

  if (to === "agent" || to === "chef_station") {
    const station = opts.station ?? c.station ?? undefined;
    if (!station || !agency.stations.includes(station)) throw new Error("Choisis une Station de l'agence.");
    c.station = station;
    if (to === "agent") {
      c.matricule = makeMatricule(agency.id);
      notices.push(`Matricule : ${c.matricule}`);
    }
    notices.push(`Affectation : Station de ${findCity(station)?.name}`);
    goTo(station);
    if (to === "chef_station") command = { ...command, station: command.station?.cityId === station ? command.station : { cityId: station, budget: 60000, modules: [], intel: 0, cover: 70 } };
  }
  if (to === "titulaire") {
    const seat = freeSeats(state).find((s) => s.id === opts.seat);
    if (!seat) throw new Error("Ce siège n'est pas libre.");
    c = { ...c, seat: seat.id, codename: seatCodename(seat), station: null, feats: { ...c.feats, seated: true } };
    const vacant = { ...(command.vacantSince ?? {}) };
    delete vacant[`${agency.id}:${seat.id}`];
    command = { ...command, vacantSince: vacant };
    notices.push(`Siège au Cercle : ${seat.name}`, `Nom de code : ${seatCodename(seat)}`);
    goTo(agency.hqCity);
  }
  if (to === "controleur") {
    if (c.seat) {
      notices.push(`Tu quittes ${findSeat(agency.id, c.seat)?.name} : il est libre pour un autre`);
      command = { ...command, vacantSince: { ...(command.vacantSince ?? {}), [`${agency.id}:${c.seat}`]: w.day } };
      c = { ...c, seat: null };
    }
    c.station = null;
    goTo(agency.hqCity);
  }
  if (to === "directeur") {
    command = { ...command, directorVacant: false };
    goTo(agency.hqCity);
  }
  const before = clearanceOf(state.character.rank);
  const after = clearanceOf(to);
  if (after > before) notices.push(`Accréditation ${clearanceDef(after).label} : ${clearanceDef(after).grants}`);
  return { state: commandOnPromotion({ ...state, character: c, world: w, command, updatedAt: Date.now() }), notices };
}

/* ------------------------------------------------------------------ */
/* Mises à jour d'état demandées par le narrateur                      */
/* ------------------------------------------------------------------ */

interface ItemInput {
  nom: string;
  description: string;
  categorie?: ItemCategory;
  bonus?: { competence: SkillId; valeur: number; condition: string };
  charges?: number;
  laboratoire?: boolean;
}

export interface StateUpdate {
  sante?: number;
  moral?: number;
  reputation?: number;
  jours_ecoules?: number;
  lieu?: string;
  chapitre?: string;
  phase?: PhaseId;
  rang?: RankId;
  nom_de_code?: string;
  pole_ameliore?: AttributeId;
  entrainement?: { competence: SkillId; xp: number }[];
  objets_gagnes?: ItemInput[];
  objets_perdus?: string[];
  points_competence?: number;
  /** Mérite pour un acte remarquable (positif) ; un blâme se donne avec `blame`. */
  merite?: { montant: number; motif: string };
  blame?: string;
  argent?: { montant: number; motif: string };
  fonds_mission?: { montant: number; motif: string };
  achats?: (ItemInput & { prix: number; fonds?: "solde" | "operation" })[];
  relations?: {
    nom: string;
    role?: string;
    type?: RelationKind;
    statut?: RelationStatus;
    affinite?: number;
    faveurs?: number;
    lieu?: string;
    sait?: string;
    note?: string;
    connait_sous?: string;
  }[];
  carnet?: string[];
  carnet_resolus?: number[];
  notes_mj?: string;
  intrigue_ouverte?: { titre: string; question: string; reponse: string; tours_prevus: number };
  intrigue_resolue?: boolean;
  scene?: { titre: string; objectif: string; tours_prevus: number };
  distinction?: { nom: string; raison: string };
}

const PHASE_TRANSITIONS: Record<PhaseId, PhaseId[]> = {
  dossier: ["recrutement"],
  recrutement: ["selection", "apres"],
  selection: ["base", "apres"],
  base: ["mission", "apres"],
  mission: ["base"],
  apres: [],
};

const JOURNAL_MAX = 40;

export interface UpdateOptions {
  /** Correction demandée par le joueur : le nom de code peut être remplacé. */
  correction?: boolean;
}

function toItem(o: ItemInput, carried: boolean): Item {
  return {
    name: o.nom.slice(0, 80),
    description: o.description.slice(0, 240),
    category: o.categorie ?? (o.laboratoire ? "gadget" : "equipement"),
    carried,
    ...(o.bonus
      ? { bonus: { skill: o.bonus.competence, value: clamp(Math.round(o.bonus.valeur), 1, 3), condition: o.bonus.condition.slice(0, 120) } }
      : {}),
    ...(o.charges ? { charges: clamp(Math.round(o.charges), 1, 9) } : {}),
    ...(o.laboratoire ? { lab: true } : {}),
  };
}

const activeRelations = (rs: Relation[]) => rs.filter((r) => r.status !== "archive" && r.status !== "mort").length;
const carriedCount = (c: Character) => c.inventory.filter((i) => i.carried).length;

export function applyUpdate(
  state: GameState,
  u: StateUpdate,
  options: UpdateOptions = {},
): EngineResult & { rejected: string[] } {
  const notices: string[] = [];
  const rejected: string[] = [];
  let c: Character = { ...state.character, feats: { ...state.character.feats } };
  const w = { ...state.world };
  const relations = [...state.relations];
  let journal = [...state.journal];
  let journalResolved = [...state.journalResolved];
  let gmNotes = state.gmNotes;
  let mission = state.mission;
  const agency = AGENCIES[c.identity.agency];
  const ageNow = () => currentAge({ character: c, world: w });

  if (u.pole_ameliore) {
    const a = u.pole_ameliore;
    if (c.attributes[a] >= ATTR_MAX) rejected.push(`pôle ${a} déjà au maximum`);
    else {
      c = raisePole(c, a);
      notices.push(`${ATTRIBUTES[a].label} passe à ${c.attributes[a]} — plafonds d'apprentissage relevés`);
    }
  }
  if (u.sante) {
    const before = c.health;
    c.health = clamp(c.health + clamp(Math.round(u.sante), -12, 12), 0, c.healthMax);
    if (c.health !== before) notices.push(`Santé ${signed(c.health - before)} (${c.health}/${c.healthMax})`);
    if (c.health === 0) notices.push("Tu es hors de combat.");
  }
  if (u.moral) {
    const before = c.morale;
    c.morale = clamp(c.morale + clamp(Math.round(u.moral), -12, 12), 0, c.moraleMax);
    if (c.morale !== before) notices.push(`Moral ${signed(c.morale - before)} (${c.morale}/${c.moraleMax})`);
    if (c.morale === 0) notices.push("Ton moral s'effondre.");
  }
  if (u.reputation) {
    const before = c.reputation;
    c.reputation = clamp(c.reputation + clamp(Math.round(u.reputation), -20, 20), 0, 100);
    if (c.reputation !== before) notices.push(`Réputation ${signed(c.reputation - before)}`);
  }

  if (u.phase && u.phase !== w.phase) {
    if (u.phase === "mission" || w.phase === "mission") {
      rejected.push("les missions sont ouvertes et closes par le moteur (tableau des missions) : ne change pas de phase");
    } else if (!PHASE_TRANSITIONS[w.phase].includes(u.phase)) {
      rejected.push(`phase ${w.phase} → ${u.phase} interdite`);
    } else {
      if (u.phase === "selection") {
        if (w.day < 1) w.day = 1;
        w.cityId = agency.academyCity;
        c.armband = "blanc";
      }
      // Seuls les retenus quittent la Sélection pour l'Académie : la Révélation fait d'eux des Aspirants.
      if (w.phase === "selection" && u.phase === "base" && c.rank === "prospect") {
        c.rank = "aspirant";
        c.skillPoints += POINTS_PER_RANK;
        notices.push(`Nouveau grade : ${RANKS.aspirant.label}`);
        notices.push(`+${POINTS_PER_RANK} point de compétence à répartir (nouveau grade)`);
        // Pour la famille, c'est une école d'excellence : la couverture commence fraîche.
        c.armband = "gris";
        c.cover = 75;
        notices.push("Brassard gris : cadet de l'Académie");
      }
      w.phase = u.phase;
    }
  }

  if (u.jours_ecoules && u.jours_ecoules > 0) {
    const ageBefore = ageNow();
    const days = clamp(Math.round(u.jours_ecoules), 0, 730);
    const weeksBefore = Math.floor(Math.max(w.day, 0) / 7);
    w.day = Math.max(w.day, 0) + days;
    const weeks = Math.floor(w.day / 7) - weeksBefore;
    const allowance = RANKS[c.rank].allowance;
    if (weeks > 0 && allowance > 0 && w.phase !== "apres") {
      // Un échelon élevé dans le poste : solde +10 %.
      const pay = Math.round(weeks * allowance * ((state.post?.echelon ?? 0) >= 1 ? 1.1 : 1));
      c.money += pay;
      c.ledger = pushLedger(c.ledger, w.day, `Solde versée (${weeks} sem.)`, pay);
      notices.push(`Solde : +${formatEuros(pay)} (${weeks} semaine${weeks > 1 ? "s" : ""})`);
    }
    notices.push(days === 1 ? "Un jour passe." : `${days} jours passent.`);
    const ageAfter = ageNow();
    if (ageAfter > ageBefore) {
      notices.push(`Anniversaire : tu as ${ageAfter} ans`);
      if (ageBefore < BREVET_AGE && ageAfter >= BREVET_AGE) notices.push("Majorité : l'heure du Brevet est venue");
    }
  }
  if (u.lieu) {
    w.location = u.lieu.slice(0, 120);
    const city = matchCity(u.lieu);
    if (city) w.cityId = city.id;
  }
  if (u.chapitre) w.chapter = u.chapitre.slice(0, 120);

  if (u.points_competence && u.points_competence > 0) {
    const n = clamp(Math.round(u.points_competence), 1, 3);
    c.skillPoints += n;
    notices.push(`+${n} point${n > 1 ? "s" : ""} de compétence à répartir`);
  }
  if (u.merite && u.merite.montant > 0) {
    const m = clamp(Math.round(u.merite.montant * 2) / 2, 0.5, 4);
    c.merit += m;
    notices.push(`Mérite +${formatMerit(m)} : ${u.merite.motif.slice(0, 80)} (total ${formatMerit(c.merit)})`);
  }
  if (u.blame) {
    c.blames += 1;
    c.merit = Math.max(0, c.merit - 3);
    notices.push(`Blâme : ${u.blame.slice(0, 100)} (mérite −3)`);
  }

  if (u.distinction) {
    c.distinctions = [...c.distinctions, { name: u.distinction.nom.slice(0, 80), reason: u.distinction.raison.slice(0, 240) }];
    notices.push(`Distinction : ${u.distinction.nom}`);
  }

  let next: GameState = { ...state, character: c, world: w };
  for (const t of (u.entrainement ?? []).slice(0, 3)) {
    const gained = gainSkillXp(next, t.competence, clamp(Math.round(t.xp), 1, 3));
    next = gained.state;
    notices.push(...gained.notices);
  }
  c = next.character;

  if (u.argent && u.argent.montant) {
    const m = Math.round(u.argent.montant);
    if (m < 0 && c.money + m < 0)
      rejected.push(`dépense refusée : ${formatEuros(-m)} demandés, la solde n'en contient que ${formatEuros(c.money)}`);
    else {
      c = { ...c, money: c.money + m, ledger: pushLedger(c.ledger, w.day, u.argent.motif.slice(0, 60), m) };
      notices.push(`${m > 0 ? "+" : "−"}${formatEuros(Math.abs(m))} — ${u.argent.motif.slice(0, 80)} (solde : ${formatEuros(c.money)})`);
    }
  }
  if (u.fonds_mission && u.fonds_mission.montant) {
    let m = Math.round(u.fonds_mission.montant);
    const cap = RANKS[c.rank].fundsCap;
    if (w.phase !== "mission") rejected.push("les fonds opérationnels n'existent que pendant une mission");
    else if (m < 0 && c.missionFunds + m < 0)
      rejected.push(`dépense refusée : ${formatEuros(-m)} demandés, il reste ${formatEuros(c.missionFunds)} de fonds opérationnels`);
    else {
      if (m > 0 && c.missionFunds + m > cap) {
        m = Math.max(0, cap - c.missionFunds);
        notices.push(`Fonds plafonnés à ${formatEuros(cap)} pour le grade ${RANKS[c.rank].label}`);
      }
      c = { ...c, missionFunds: c.missionFunds + m };
      if (m) notices.push(`Fonds ${m > 0 ? "+" : "−"}${formatEuros(Math.abs(m))} — ${u.fonds_mission.motif.slice(0, 80)} (reste ${formatEuros(c.missionFunds)})`);
    }
  }
  for (const a of (u.achats ?? []).slice(0, 5)) {
    const price = Math.max(0, Math.round(a.prix));
    const fromMission = a.fonds === "operation";
    const balance = fromMission ? c.missionFunds : c.money;
    if (fromMission && w.phase !== "mission") rejected.push(`achat « ${a.nom} » : pas de fonds opérationnels hors mission`);
    else if (price > balance)
      rejected.push(`achat « ${a.nom} » refusé : ${formatEuros(price)}, il n'y a que ${formatEuros(balance)}`);
    else {
      const item = toItem(a, carriedCount(c) < CARRY_LIMIT);
      c = { ...c, inventory: [...c.inventory, item], ...(fromMission ? { missionFunds: c.missionFunds - price } : { money: c.money - price, ledger: pushLedger(c.ledger, w.day, `Achat : ${item.name}`, -price) }) };
      notices.push(`Obtenu : ${item.name} (acheté ${formatEuros(price)})${item.carried ? "" : " — rangé au casier, tu portes déjà trop"}`);
    }
  }
  for (const o of (u.objets_gagnes ?? []).slice(0, 5)) {
    const item = toItem(o, carriedCount(c) < CARRY_LIMIT);
    c = { ...c, inventory: [...c.inventory, item] };
    notices.push(`Obtenu : ${item.name}${item.carried ? "" : " — rangé au casier, tu portes déjà trop"}`);
  }
  if (u.objets_perdus?.length) {
    const inv = [...c.inventory];
    for (const name of u.objets_perdus) {
      const i = inv.findIndex((o) => sameName(o.name, name));
      if (i < 0) continue;
      notices.push(`Perdu : ${inv[i].name}`);
      if (inv[i].lab) {
        c = { ...c, merit: Math.max(0, c.merit - 1) };
        notices.push(`Mérite −1 : gadget du laboratoire perdu`);
      }
      inv.splice(i, 1);
    }
    c = { ...c, inventory: inv };
  }

  for (const r of (u.relations ?? []).slice(0, 6)) {
    const i = relations.findIndex((x) => sameName(x.name, r.nom));
    // Une histoire d'amour : entre adultes seulement.
    if (r.type === "amour") {
      const blocked = romanceAllowed(state, i >= 0 ? relations[i] : { name: r.nom }, ageNow());
      if (blocked) {
        rejected.push(`relation « ${r.nom} » : ${blocked}`);
        r.type = i >= 0 ? relations[i].kind : "proche";
      }
    }
    const raw = Math.round(r.affinite ?? 0);
    if (i < 0) {
      if (activeRelations(relations) >= RELATION_LIMIT && r.statut !== "archive") {
        rejected.push(
          `relation « ${r.nom} » non créée : ${RELATION_LIMIT} relations suivies au maximum. Archive d'abord une relation devenue secondaire (statut "archive"), ou garde ce personnage comme simple figurant.`,
        );
        continue;
      }
      relations.push({
        name: r.nom.slice(0, 60),
        role: (r.role ?? "").slice(0, 120),
        kind: r.type ?? "contact",
        status: r.statut ?? "actif",
        affinity: clamp(raw, -100, 100),
        favors: clamp(Math.round(r.faveurs ?? 0), -5, 5),
        location: (r.lieu ?? "").slice(0, 120),
        knows: (r.sait ?? "").slice(0, 240),
        notes: (r.note ?? "").slice(0, 400),
        lastSeenDay: w.day,
        bond: r.type === "rival" || r.type === "ennemi" ? 50 : 60,
        knownAs: r.connait_sous?.slice(0, 60) ?? "reel",
        ...(matchCity(r.lieu) ? { cityId: matchCity(r.lieu)!.id, positionDay: w.day } : {}),
        operativeId: findOperative(state.roster, r.nom)?.id,
        metDay: w.day,
        history: [{ day: w.day, text: `Rencontre${r.role ? ` : ${r.role.slice(0, 80)}` : ""}` }],
      });
      notices.push(`Nouvelle relation : ${r.nom}`);
    } else {
      const prev = relations[i];
      const delta = clamp(raw, -30, 30);
      const favors = clamp(prev.favors + Math.round(r.faveurs ?? 0), -5, 5);
      relations[i] = {
        ...prev,
        role: r.role ? r.role.slice(0, 120) : prev.role,
        kind: r.type ?? prev.kind,
        status: r.statut ?? prev.status,
        affinity: clamp(prev.affinity + delta, -100, 100),
        favors,
        location: r.lieu ? r.lieu.slice(0, 120) : prev.location,
        knows: r.sait ? r.sait.slice(0, 240) : prev.knows,
        notes: r.note ? r.note.slice(0, 400) : prev.notes,
        lastSeenDay: w.day,
        // Un échange dans la scène entretient le lien.
        bond: clamp((prev.bond ?? 50) + 10, 0, 100),
        knownAs: r.connait_sous ? r.connait_sous.slice(0, 60) : prev.knownAs,
        ...(r.lieu && matchCity(r.lieu) ? { cityId: matchCity(r.lieu)!.id, positionDay: w.day } : {}),
      };
      if (delta) notices.push(`${prev.name} ${delta > 0 ? "t'apprécie davantage" : "t'apprécie moins"}`);
      if (favors !== prev.favors)
        notices.push(favors > prev.favors ? `${prev.name} te doit une faveur` : `Tu dois une faveur à ${prev.name}`);
      if (r.statut && r.statut !== prev.status) notices.push(`${prev.name} : ${r.statut}`);
      // L'historique garde les grandes étapes.
      let h = relations[i];
      if (r.type && r.type !== prev.kind) {
        h = withHistory(h, w.day, KIND_STEP[r.type]?.(prev.name) ?? `${prev.name} : ${r.type}`);
        if (r.type === "amour" || r.type === "ex") notices.push(r.type === "amour" ? `${prev.name} et toi : une histoire commence` : `${prev.name} et toi : c'est fini`);
      }
      if (r.role && r.role !== prev.role) h = withHistory(h, w.day, `${prev.name} : ${r.role.slice(0, 80)}`);
      if (r.statut && r.statut !== prev.status && r.statut !== "archive") h = withHistory(h, w.day, `${prev.name} : ${r.statut}`);
      relations[i] = h;
    }
  }

  if (u.carnet_resolus?.length) {
    const drop = new Set(u.carnet_resolus.map((n) => n - 1).filter((i) => i >= 0 && i < journal.length));
    const resolved = journal.filter((_, i) => drop.has(i));
    journal = journal.filter((_, i) => !drop.has(i));
    journalResolved = [...journalResolved, ...resolved].slice(-200);
    for (const r of resolved) notices.push(`Résolu : ${r.length > 60 ? `${r.slice(0, 57)}…` : r}`);
  }
  if (u.carnet?.length) {
    journal = [...journal, ...u.carnet.slice(0, 5).map((n) => n.slice(0, 300))];
    if (journal.length > JOURNAL_MAX) {
      journalResolved = [...journalResolved, ...journal.slice(0, journal.length - JOURNAL_MAX)].slice(-200);
      journal = journal.slice(-JOURNAL_MAX);
    }
    notices.push(u.carnet.length === 1 ? "Carnet mis à jour" : `Carnet : ${u.carnet.length} notes`);
  }
  if (u.notes_mj !== undefined) gmNotes = u.notes_mj.slice(0, 2500);

  next = { ...next, character: c, world: w, mission };
  if (u.intrigue_resolue && next.intrigue) {
    notices.push(`Intrigue résolue : ${next.intrigue.title}`);
    next = { ...next, intrigue: null };
  }
  if (u.intrigue_ouverte) {
    if (next.intrigue) rejected.push(`une intrigue est déjà en cours (« ${next.intrigue.title} ») : résous-la avant d'en ouvrir une autre`);
    else {
      const max = INTRIGUE_MAX_TURNS[PACES[next.settings.pace].index];
      next = {
        ...next,
        intrigue: {
          title: u.intrigue_ouverte.titre.slice(0, 100),
          question: u.intrigue_ouverte.question.slice(0, 240),
          answer: u.intrigue_ouverte.reponse.slice(0, 400),
          turns: 0,
          planned: clamp(Math.round(u.intrigue_ouverte.tours_prevus), 3, max),
        },
      };
      notices.push(`Intrigue ouverte : ${next.intrigue!.title}`);
    }
  }
  if (u.scene) {
    next = {
      ...next,
      scene: {
        title: u.scene.titre.slice(0, 100),
        goal: u.scene.objectif.slice(0, 240),
        turns: 0,
        planned: clamp(Math.round(u.scene.tours_prevus), 1, 8),
      },
    };
  }

  let final: GameState = { ...next, character: c, relations, journal, journalResolved, gmNotes };
  if (c.rank !== state.character.rank) final = commandOnPromotion(final);
  // Une promotion devient possible : le joueur la demandera depuis sa fiche.
  const before = new Set(promotionsAvailable(state));
  for (const r of promotionsAvailable(final)) if (!before.has(r)) notices.push(`Promotion possible : ${RANKS[r].label}`);
  return { state: final, notices, rejected };
}

/* ------------------------------------------------------------------ */
/* Actions directes du joueur (hors tour)                              */
/* ------------------------------------------------------------------ */

/** Prendre un objet sur soi ou le ranger au casier (à la base seulement). */
export function toggleCarried(state: GameState, index: number): GameState {
  const c = state.character;
  const item = c.inventory[index];
  if (!item || state.world.phase === "mission") return state;
  if (!item.carried && carriedCount(c) >= CARRY_LIMIT) return state;
  const inventory = c.inventory.map((o, i) => (i === index ? { ...o, carried: !o.carried } : o));
  return { ...state, character: { ...c, inventory }, updatedAt: Date.now() };
}

/**
 * Les soutiens de mission : le coup signature du siège (« seat ») sur les étapes de sa spécialité,
 * ou le coup de main d'une Branche (si son chef ne t'en veut pas). Une fois chacun par mission.
 */
export function resourceAvailable(state: GameState, source: string): boolean {
  const m = state.mission;
  if (state.world.phase !== "mission" || !m || m.stage !== "terrain" || m.resourcesUsed.includes(source)) return false;
  const c = state.character;
  const node = m.nodes[m.current];
  if (!node) return false;
  if (source === "seat") {
    const seat = findSeat(c.identity.agency, c.seat);
    return Boolean(seat && seat.signature.nodes.includes(node.type));
  }
  const branch = AGENCIES[c.identity.agency].branches.find((b) => b.id === source);
  if (!branch || c.rank === "aspirant") return false;
  // Le chef de la Branche ne rend service que si la relation le permet.
  if ((state.command.branchFavor?.[branch.id] ?? 0) < BRANCH_FAVOR_MIN) return false;
  const chief = state.relations.find((r) => r.name === branch.chief.name);
  return !chief || chief.affinity >= -10;
}

/** En dessous de cette estime, une Branche refuse son soutien en mission. */
export const BRANCH_FAVOR_MIN = -20;

/** Marque un soutien comme utilisé pour la mission en cours. */
export function markResourceUsed(state: GameState, source: string): GameState {
  if (!state.mission || !resourceAvailable(state, source)) return state;
  return { ...state, mission: { ...state.mission, resourcesUsed: [...state.mission.resourcesUsed, source] } };
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function signed(n: number) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function sameName(a: string, b: string) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return norm(a) === norm(b);
}

export function randomId() {
  return globalThis.crypto.randomUUID();
}

export function attributeTotal(attrs: Record<AttributeId, number>) {
  return ATTRIBUTE_IDS.reduce((n, a) => n + attrs[a], 0);
}

/* ------------------------------------------------------------------ */
/* Progression choisie par le joueur                                   */
/* ------------------------------------------------------------------ */

function raisePole(c: Character, a: AttributeId): Character {
  const next = { ...c, attributes: { ...c.attributes, [a]: c.attributes[a] + 1 } };
  if (a === "corps") {
    next.healthMax += 2;
    next.health += 2;
  }
  if (a === "ame") {
    next.moraleMax += 2;
    next.morale += 2;
  }
  return next;
}

const PROGRESS_MAX = 150;

/** Ajoute à l'historique de progression les notifications qui en relèvent. */
export function recordProgress(state: GameState, notices: string[]): GameState {
  const entries = notices.flatMap((text) => {
    const kind = progressKind(text);
    return kind ? [{ ts: Date.now(), day: state.world.day, kind, text }] : [];
  });
  if (!entries.length) return state;
  return { ...state, progress: [...state.progress, ...entries].slice(-PROGRESS_MAX) };
}

export function canSpendOnSkill(c: Character, s: SkillId): boolean {
  return c.skillPoints > 0 && c.skills[s].rank < capFor(c, s);
}

export function canSpendOnPole(c: Character, a: AttributeId): boolean {
  return c.skillPoints >= POLE_POINT_COST && c.attributes[a] < ATTR_MAX;
}

/** Le joueur dépense un point pour gagner un rang dans une compétence. */
export function spendSkillPoint(state: GameState, s: SkillId): GameState {
  const c = state.character;
  if (!canSpendOnSkill(c, s)) return state;
  const rank = c.skills[s].rank + 1;
  const next: GameState = {
    ...state,
    character: { ...c, skillPoints: c.skillPoints - 1, skills: { ...c.skills, [s]: { ...c.skills[s], rank } } },
    updatedAt: Date.now(),
  };
  return recordProgress(next, [`${SKILLS[s].label} progresse : rang ${rank} (point dépensé)`]);
}

/** Le joueur dépense des points pour renforcer un pôle. */
export function spendPolePoint(state: GameState, a: AttributeId): GameState {
  const c = state.character;
  if (!canSpendOnPole(c, a)) return state;
  const raised = raisePole({ ...c, skillPoints: c.skillPoints - POLE_POINT_COST }, a);
  return recordProgress({ ...state, character: raised, updatedAt: Date.now() }, [
    `${ATTRIBUTES[a].label} passe à ${raised.attributes[a]} (${POLE_POINT_COST} points dépensés)`,
  ]);
}

/** Remplace un nom (nom de code, PNJ…) dans tous les textes de mémoire de la partie. */
export function renameEverywhere(state: GameState, from: string, to: string): GameState {
  if (!from || from === to) return state;
  const swap = (t: string) => t.split(from).join(to);
  return {
    ...state,
    journal: state.journal.map(swap),
    journalResolved: state.journalResolved.map(swap),
    gmNotes: swap(state.gmNotes),
    chronicle: swap(state.chronicle),
    saga: swap(state.saga),
    archives: state.archives.map((a) => ({ ...a, summary: swap(a.summary) })),
    relations: state.relations.map((r) => ({ ...r, notes: swap(r.notes), role: swap(r.role) })),
    progress: state.progress.map((p) => ({ ...p, text: swap(p.text) })),
  };
}
