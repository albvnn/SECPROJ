import {
  ATTRIBUTE_IDS,
  ATTRIBUTES,
  BREVET_AGE,
  GENDERS,
  MISSION_IMPORTANCE,
  OUTCOMES,
  PACES,
  PASSIVE_BONUS,
  PHASE_TURN_BUDGET,
  RANKS,
  SELECTION_DAYS,
  SKILLS,
  ageStage,
  findDrama,
  findFlaw,
  findMotivation,
  findOrigin,
  findQuality,
  formatEuros,
  formatMerit,
  phaseLabel,
  skillsOf,
} from "@/lib/game/rules";
import { AGENCIES, findSeat } from "@/lib/game/agencies";
import { branchFavor } from "@/lib/game/command";
import { capFor, currentAge, currentDate, dateOfAge, nextRanks, rankMissing, signed, skillTotal } from "@/lib/game/engine";
import { missionBrief } from "@/lib/game/actions";
import { lifeSummary } from "@/lib/game/planner";
import { chambree, OPERATIVE_TRAITS } from "@/lib/game/roster";
import { findCity, findCountry } from "@/lib/world/geo";
import { worldSummary } from "@/lib/world/world";
import { threatsSummary } from "@/lib/world/threats";
import { findPossession } from "@/lib/game/economy";
import { daysBetween, formatDate } from "@/lib/game/calendar";
import type { GameState, LogEntry, PhaseId, PlayerAction } from "@/lib/game/types";

/* ------------------------------------------------------------------ */
/* Fiche personnage                                                    */
/* ------------------------------------------------------------------ */

export function characterSheet(state: GameState): string {
  const c = state.character;
  const id = c.identity;
  const agency = AGENCIES[id.agency];
  const origin = findOrigin(c.originId);
  const drama = findDrama(c.dramaId);
  const motivation = findMotivation(c.motivationId);
  const gender = GENDERS.find((g) => g.id === id.gender)?.label ?? id.gender;
  const age = currentAge(state);

  const poles = ATTRIBUTE_IDS.map((a) => {
    const skills = skillsOf(a)
      .map((sk) => {
        const total = skillTotal(c, sk);
        const sig = sk === c.signature ? ", signature" : "";
        return `${SKILLS[sk].label} ${total} (passif ${total + PASSIVE_BONUS}, rangs ${c.skills[sk].rank}/${capFor(c, sk)}${sig})`;
      })
      .join(" ; ");
    return `- ${ATTRIBUTES[a].label} ${c.attributes[a]} : ${skills}`;
  }).join("\n");

  const qualities = c.qualities
    .map(findQuality)
    .filter(Boolean)
    .map((q) => `${q!.label} [voix : {{${q!.id}}}] (${q!.description})`)
    .join(" ; ");
  const flaw = findFlaw(c.flaw);

  const rank = RANKS[c.rank];
  const options = nextRanks(state).filter((r) => r !== "aspirant");
  const career = options
    .map((r) => {
      const miss = rankMissing(state, r);
      return `${RANKS[r].label} : ${miss.length ? `manque ${miss.join(" ; ")}` : "POSSIBLE (le joueur peut la demander dans le jeu)"}`;
    })
    .join(" — ");
  const seat = findSeat(id.agency, c.seat);
  const position = seat
    ? `${agency.circle.member} : ${seat.name} (nom de code « ${c.codename} »). ${seat.heritage} Coup signature : « ${seat.signature.name} »${
        state.world.phase === "mission" ? (state.mission?.resourcesUsed.includes("seat") ? " — déjà utilisé pour cette mission" : " — disponible") : ""
      }`
    : c.station
      ? `Station de ${findCity(c.station)?.name} (matricule ${c.matricule ?? "?"})`
      : RANKS[c.rank].order >= RANKS.agent.order
        ? "à l'état-major"
        : "pas encore d'affectation";
  const branches = agency.branches.map((b) => `${b.name} (${b.chief.name}) : estime ${branchFavor(state, b.id)}`).join(" ; ");
  const legends = (c.legends ?? []).map((l) => `${l.name} (${l.profession}, ${l.nationality}${l.burned.length ? `, grillée : ${l.burned.join(", ")}` : ""})`).join(" ; ");

  const inventory = c.inventory.length
    ? c.inventory
        .map((i) => {
          const extra = [
            i.category,
            i.carried ? "sur soi" : "au casier",
            i.bonus ? `${SKILLS[i.bonus.skill].label} +${i.bonus.value} : ${i.bonus.condition}` : null,
            i.charges !== undefined ? `${i.charges} utilisation${i.charges > 1 ? "s" : ""}` : null,
            i.lab ? "prêt du laboratoire" : null,
          ].filter(Boolean);
          return `${i.name} (${extra.join(" ; ")})`;
        })
        .join(", ")
    : "rien";

  return [
    `Nom : ${id.firstName} ${id.lastName}${c.codename ? ` — nom de code « ${c.codename} »` : c.matricule ? ` — matricule ${c.matricule}` : ""}`,
    `Identités : vrai nom (famille, vie d'avant, vie officielle)${c.codename ? ` ; « ${c.codename} » (l'agence, le Cercle, les rivaux qui le connaissent)` : ""}${legends ? ` ; légendes : ${legends}` : ""}. Chaque personne ne le connaît que sous une de ces identités.`,
    `Agence : ${agency.name} (${agency.region}) — proposé(e) par : ${id.nationality}`,
    `Âge actuel : ${age} ans — né(e) le ${id.birthDate ? formatDate(id.birthDate) : "?"} à ${id.birthplace || "lieu inconnu"} — ${gender}${
      dateOfAge(state, age + 1) ? ` — aura ${age + 1} ans le ${formatDate(dateOfAge(state, age + 1)!)}` : ""
    }`,
    `Apparence : ${id.appearance || "non précisée"}`,
    `Langues : ${id.languages || "—"}`,
    `Origine : ${origin?.label ?? c.originId} — ${origin?.description ?? ""}`,
    `Drame fondateur : ${drama?.label ?? c.dramaId} — ${drama?.description ?? ""}`,
    `Motivation profonde : ${motivation?.label ?? c.motivationId} — ${motivation?.description ?? ""}`,
    `Qualités : ${qualities}`,
    `Défaut : ${flaw ? `${flaw.label} [voix : {{${flaw.id}}}] (${flaw.description})` : "aucun"}`,
    c.playerNotes ? `Souhaits du joueur pour son personnage : ${c.playerNotes}` : null,
    `Pôles et compétences (valeur = pôle + rangs + traits ; passif = valeur + ${PASSIVE_BONUS}) :\n${poles}`,
    `Compétence signature : ${SKILLS[c.signature].label}`,
    `Santé ${c.health}/${c.healthMax} — Moral ${c.morale}/${c.moraleMax} — Réputation dans l'agence ${c.reputation}/100`,
    `Grade : ${rank.label}. Pouvoirs : ${rank.powers} Contraintes : ${rank.duties}`,
    `Mérite : ${formatMerit(c.merit)} — blâmes : ${c.blames}${career ? ` — suite de carrière : ${career}` : ""}`,
    `Place dans l'organisation : ${position}`,
    RANKS[c.rank].order >= RANKS.agent.order ? `Estime des Branches : ${branches}` : null,
    `Distinctions : ${c.distinctions.map((d) => d.name).join(", ") || "aucune"}`,
    `Inventaire (8 objets sur soi au maximum) : ${inventory}`,
    `Points de compétence non dépensés : ${c.skillPoints} (le joueur les répartit lui-même depuis sa fiche)`,
    `Argent : solde ${formatEuros(c.money)} (${formatEuros(rank.allowance)}/semaine)${
      state.world.phase === "mission" ? ` ; fonds opérationnels ${formatEuros(c.missionFunds)} (plafond ${formatEuros(rank.fundsCap)}, à restituer)` : ""
    }`,
  ]
    .filter(Boolean)
    .join("\n");
}

function worldBlock(state: GameState): string {
  const w = state.world;
  const age = currentAge(state);
  const m = state.mission;
  const city = findCity(w.cityId);
  const cadets = state.character.rank === "aspirant" || state.character.rank === "prospect" ? chambree(state) : [];
  return [
    `Phase : ${phaseLabel(w.phase, age)}`,
    `Chapitre : ${w.chapter}`,
    `Lieu : ${w.location}${city ? ` (carte : ${city.name}, ${findCountry(city.country)?.name ?? ""})` : ""}`,
    `Date du jour : ${formatDate(currentDate(state))} (jour ${w.day})`,
    w.phase === "selection" ? `Sélection : jour ${w.day} sur ${SELECTION_DAYS}` : null,
    `Missions réussies : ${w.missionsCompleted}`,
    `Étape : ${ageStage(age).label} — ${ageStage(age).description}`,
    age < BREVET_AGE && w.phase !== "dossier" && w.phase !== "recrutement"
      ? `Jours restants avant le Brevet (${BREVET_AGE} ans) : ${daysUntilAge(state, BREVET_AGE)}.`
      : null,
    state.character.rank === "aspirant" ? `Brassard : ${state.character.armband} ; Opérations Jeunesse menées : ${state.character.youthOps}.` : null,
    cadets.length
      ? `Camarades de chambrée (à utiliser comme les autres cadets ou prospects proches du personnage, avec ces noms) : ${cadets.map((o) => `${o.name} (${o.nationality}, ${o.age} ans, ${OPERATIVE_TRAITS[o.trait]?.label.toLowerCase()})`).join(" ; ")}.`
      : null,
    m ? `MISSION EN COURS (jouée par le moteur) :\n${missionBrief(state, m)}` : null,
    w.phase !== "dossier" && w.phase !== "recrutement" && w.phase !== "selection" ? `Vie hors mission :\n${lifeSummary(state)}` : null,
    `Monde :\n${worldSummary(w.geo, state.character.identity.agency)}`,
    `Menaces identifiées : ${threatsSummary(w.geo)}`,
    w.geo.nemeses.length
      ? `Ennemis nommés : ${w.geo.nemeses.map((n) => `${n.name}, ${n.title} (${n.status}, niveau ${n.level}, rancune ${n.grudge}) — ${n.history}`).join(" ; ")}`
      : null,
    state.character.prison
      ? `EN DÉTENTION à ${findCity(state.character.prison.cityId)?.name}, aux mains de ${state.character.prison.captor}, depuis le jour ${state.character.prison.since} (évasion ${state.character.prison.escape}/100, secrets livrés ${state.character.prison.leaked}/100).`
      : null,
    state.character.injuries?.length ? `Blessures : ${state.character.injuries.map((i) => `${i.name}${i.healDay ? "" : " (séquelle à vie)"}`).join(", ")}.` : null,
    Object.keys(state.character.heat ?? {}).length
      ? `Fiché dans : ${Object.entries(state.character.heat)
          .filter(([, v]) => v >= 30)
          .map(([k, v]) => `${findCountry(k)?.name} (${v})`)
          .join(", ") || "nulle part"}.`
      : null,
    `Langues parlées : ${state.character.spoken.join(", ") || "—"}.`,
    state.character.possessions?.length ? `Biens : ${state.character.possessions.map((id) => findPossession(id)?.name ?? id).join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function relationsBlock(state: GameState): string {
  const active = state.relations.filter((r) => r.status !== "archive");
  if (!active.length) return "Aucune pour l'instant.";
  return active
    .map(
      (r) =>
        `- ${r.name} — ${r.role} [${r.kind}, ${r.status}] — affinité ${r.affinity}${
          r.favors ? ` — ${r.favors > 0 ? `te doit ${r.favors} faveur(s)` : `tu lui dois ${-r.favors} faveur(s)`}` : ""
        }${r.location ? ` — joignable : ${r.location}` : ""}${r.knows ? ` — sait : ${r.knows}` : ""}${r.notes ? ` — ${r.notes}` : ""} (lien ${r.bond ?? 50}/100${(r.bond ?? 50) < 25 ? ", SE SENT NÉGLIGÉ" : ""} ; dernier échange : jour ${r.lastSeenDay})`,
    )
    .join("\n");
}

function journalBlock(state: GameState): string {
  return state.journal.length ? state.journal.map((j, i) => `#${i + 1} ${j}`).join("\n") : "Vide.";
}

function daysUntilAge(state: GameState, age: number): number {
  const target = dateOfAge(state, age);
  if (!target) return Math.max(0, (age - state.character.identity.age) * 365 - state.world.day);
  return Math.max(0, daysBetween(currentDate(state), target));
}

/* ------------------------------------------------------------------ */
/* Rythme                                                              */
/* ------------------------------------------------------------------ */

const PACE_GUIDES = {
  pose: "Rythme POSÉ : le joueur aime s'attarder. Scènes de 3 à 5 tours, dialogues développés, ellipses quand une scène est résolue.",
  normal: "Rythme NORMAL : scènes de 2 à 3 tours. Après la scène principale d'une journée, saute au prochain moment important. Ellipses fréquentes.",
  rapide: "Rythme RAPIDE : le joueur veut que ça avance. Scènes de 1 à 2 tours. Ellipses franches et montages à presque chaque tour ; ne joue en détail que les moments clés.",
} as const;

function paceBlock(state: GameState): string {
  const pace = state.settings.pace;
  const lines: string[] = [PACE_GUIDES[pace]];
  const phase = state.world.phase;

  if (phase === "base") {
    lines.push(
      "À la base (ou à l'Académie), LE TEMPS AVANCE PAR LE PLANNING DE LA SEMAINE, joué par le jeu : n'utilise pas jours_ecoules, sauf quelques heures ou un jour au sein d'une scène. Une scène d'événement dure 1 à 3 tours, puis rends la main (choix « ellipse » pour revenir au planning).",
    );
  } else if (phase !== "mission") {
    const sc = state.scene;
    if (!sc) lines.push("Aucune scène ouverte : ouvre-en une (maj_etat → scene) avec un objectif clair.");
    else {
      lines.push(`Scène en cours : « ${sc.title} » — objectif : ${sc.goal} — tour ${sc.turns + 1} sur ${sc.planned} prévus.`);
      if (sc.turns + 1 >= sc.planned)
        lines.push("⚠ La scène a atteint sa durée prévue : CONCLUS-LA dans ce tour, puis fais une ellipse vers la scène suivante et ouvre-la (maj_etat → scene).");
    }
    const budget = PHASE_TURN_BUDGET[phase][PACES[pace].index];
    if (budget > 0) {
      const played = state.phaseTurns;
      let progress = `Phase ${phaseLabel(phase, currentAge(state))} : ${played} tours joués sur un budget d'environ ${budget}.`;
      if (phase === "selection") {
        const expectedDay = Math.round((played / budget) * SELECTION_DAYS);
        progress += ` On en est au jour ${state.world.day} ; au rythme visé, on devrait être vers le jour ${Math.max(1, expectedDay)}.`;
        if (state.world.day < expectedDay - 10) progress += " TU ES EN RETARD : montages de plusieurs jours jusqu'au prochain grand moment.";
      } else if (played >= budget) progress += " BUDGET ATTEINT : amène la phase vers sa conclusion dans les 2 ou 3 prochains tours.";
      lines.push(progress);
    }
  }

  const it = state.intrigue;
  if (it) {
    lines.push(`Intrigue en cours : « ${it.title} » — question : ${it.question} — VÉRITÉ (secrète, définitive) : ${it.answer} — tour ${it.turns + 1} sur ${it.planned} prévus.`);
    if (it.turns + 1 >= it.planned) lines.push("⚠ Révèle la vérité dans ce tour, puis maj_etat → intrigue_resolue.");
  }
  if (state.chapterTurns >= 15 && phase !== "mission")
    lines.push(`Le chapitre « ${state.world.chapter} » dure depuis ${state.chapterTurns} tours : ouvre un nouveau chapitre à la prochaine transition.`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Historique                                                          */
/* ------------------------------------------------------------------ */

export function entryToText(entry: LogEntry): string {
  const body = entry.segments
    .map((s) => {
      if (s.kind === "text") return s.text.trim();
      if (s.kind === "event") return `[${s.text}]`;
      const k = s.check;
      return `[Jet ${k.red ? "rouge " : ""}${SKILLS[k.skill].label} — ${k.reason} : ${k.dice[0]}+${k.dice[1]}${signed(k.bonus)} = ${k.total} contre ${k.dc} → ${OUTCOMES[k.outcome].label}]`;
    })
    .filter(Boolean)
    .join("\n");
  if (entry.role === "player")
    return entry.original ? `JOUEUR (action reformulée, écrit : « ${entry.original} ») : ${body}` : `JOUEUR : ${body}`;
  return `NARRATEUR : ${body}`;
}

/* ------------------------------------------------------------------ */
/* Consignes par phase                                                 */
/* ------------------------------------------------------------------ */

function phaseGuide(state: GameState): string {
  const agency = AGENCIES[state.character.identity.agency];
  const age = currentAge(state);
  const guides: Record<PhaseId, string> = {
    dossier: "",
    recrutement: `Phase L'INVITATION. Le personnage ignore tout : ni ${agency.name}, ni le Concordat n'existent pour lui.
Le paravent de son agence : ${agency.cover.name}. ${agency.cover.pretext}
Ouvre au moment où sa vie bascule (lien direct avec la fin du dossier) par une scène forte. Puis l'Invitation arrive par ce paravent, portée par quelqu'un qui joue un rôle (le recruteur a une fausse identité de fondation, d'école ou de programme ; il ne prononce jamais le nom de l'agence, ne parle ni d'espionnage ni de missions). Ce qui intrigue : on sait trop de choses sur lui, personne n'a postulé, l'offre est trop belle. Un petit test déguisé peut déjà avoir lieu sans qu'il le sache.
S'il accepte : maj_etat avec phase "selection", lieu (${agency.academy.split(",")[0]}, sous le nom ${agency.cover.name}), chapitre. Pas de changement de grade : il reste Prospect. S'il refuse, laisse-le refuser, avec ce que ça coûte.
2 à 5 tours. Les voix intérieures flairent que quelque chose cloche.`,
    selection: `Phase LA SÉLECTION (100 jours, sous le paravent ${agency.cover.name}). Le personnage croit suivre un programme d'élite ; il ne sait pas qu'il est sélectionné par une agence secrète. Ne lui révèle rien avant la fin : laisse-le soupçonner, enquêter, se tromper.
Environ 40 prospects de tous les pays membres. Les épreuves ne sont jamais annoncées : elles se cachent dans le quotidien (tentation de tricher, fausse urgence, fausse arrestation, interrogatoire déguisé en malentendu, privation de sommeil, loyauté envers un camarade mise à l'épreuve, épreuve finale dans une vraie ville). C'est DUR : chaque semaine des prospects « terminent leur programme plus tôt » et disparaissent sans explication, y compris des amis du personnage. À peine un sur dix est retenu. Fais sentir que le personnage peut échouer : un échec grave à un moment clé compte.
Rythme par SEMAINES : quelques scènes fortes, et des MONTAGES de plusieurs jours (jours_ecoules 5 à 15, entrainement).
Le 100ᵉ jour, s'il est retenu : LA RÉVÉLATION. ${agency.director.name} (ou un instructeur de haut rang) dévoile le Concordat de Lucerne et ${agency.name}. Une nuit pour choisir : entrer et mentir à tous ceux qu'il aime, ou partir et oublier. S'il entre : maj_etat avec phase "base" (le moteur le fait Aspirant), pole_ameliore (le pôle le plus travaillé), éventuellement la distinction « Major de promotion ». S'il est recalé ou refuse : il rentre chez lui sans rien savoir de plus (phase "apres").`,
    base:
      state.character.rank === "aspirant"
        ? `Phase L'ACADÉMIE (cadet, avant le Brevet) — ${agency.academy}
Le personnage a appris la vérité : il vit maintenant parmi les « Pupilles de Lucerne ». Ton d'école d'élite secrète : exigeante, drôle parfois, dure souvent. Une dizaine de cadets en tout, de 14 à 17 ans (ils sont listés dans l'état du monde : utilise-les, avec leurs noms), les aînés qui font la loi, des instructeurs qui ont tous un passé, des corvées, des punitions collectives, des examens de saison, des rivalités entre chambrées, et chaque été les Jeux de Lucerne face aux cadets des deux agences rivales (une trêve tendue).
Brassards : blanc (prospect), gris (cadet), bleu (après une première Opération Jeunesse réussie), noir (l'élite). Les Opérations Jeunesse — de vraies missions locales, encadrées par un agent adulte, là où seul un adolescent passe inaperçu — sont proposées et jouées par le jeu, pas par toi.
Le jeu fait passer les semaines (planning du joueur) ; toi, tu racontes ces semaines et tu joues leurs événements. Fais exister les camarades de chambrée : ce sont eux, les vrais liens de ces années-là.
Quand le jeu annonce « Majorité : l'heure du Brevet est venue », amène ce moment (convocation, veille de cérémonie) : c'est le joueur qui déclenche le Brevet dans le jeu, en choisissant sa Station. Ne donne ni grade, ni matricule, ni nom de code toi-même.`
        : `Phase LA BASE (entre deux missions) — ${state.character.seat ? `le personnage siège au Cercle, à ${agency.hq.split(":")[0]}` : state.character.station ? `Station de ${findCity(state.character.station)?.name} : une antenne secrète dans une vraie ville, son chef, ses officiers, ses informateurs` : agency.hq.split(":")[0]}.
La vie hors mission compte autant que les missions : récupération, entraînement, devoirs (rapports, requalifications, informateurs, seconds…), relations à entretenir, couverture civile à tenir (une famille qui croit à une autre vie), estime des Branches, intrigues de couloir, nouvelles du Cercle (qui part, qui ne revient pas, quel siège se libère). Le jeu fait passer les semaines (planning du joueur) et propose les missions : n'en ouvre jamais toi-même, ne change jamais de phase.
Ton rôle : raconter chaque semaine en montage vivant (3 à 8 lignes, concrètes, sensorielles), puis jouer son événement s'il y en a un, avec de vrais choix. « Promotion possible » annoncée par le jeu : fais-le sentir (une rumeur, une convocation) ; c'est le joueur qui la demande.`,
    mission: `Phase MISSION — jouée par le moteur, racontée par toi, dans le style de ${agency.name} (${agency.style}).
Le jeu décide de tout ce qui est mécanique : étapes, jets, risques, jauges (exposition, alerte, renseignement), blessures, réussite ou échec. Toi, tu RACONTES le résultat qu'il te donne, fidèlement, de l'intérieur : un passage de 2 à 4 paragraphes par action, vivant, précis, avec les voix intérieures, les équipiers (leurs noms de code, leurs défauts), les gadgets, la ville réelle. Une réussite partielle coûte quelque chose ; un échec a des conséquences visibles.
Termine chaque passage sur la situation de l'ÉTAPE SUIVANTE (fournie), sans la résoudre : le joueur choisira son approche dans le jeu. N'appelle PAS proposer_choix, et ne touche pas à la santé, aux jauges, aux objets ni à la phase avec maj_etat (le jeu l'a déjà fait) ; maj_etat sert seulement aux relations, au carnet et à tes notes.
Quand le jeu annonce la fin de la mission, raconte le dénouement, l'extraction, puis le débriefing.`,
    apres: `Phase RETRAITE. Le personnage a quitté le service actif : raconte sa nouvelle vie en chapitres espacés, avec ses relations.`,
  };
  return guides[state.world.phase];
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * Le contexte d'un tour, découpé pour le cache de prompt :
 * - `memory` change rarement (archives, chronique) ;
 * - `entries` ne fait que s'allonger d'un tour à l'autre (récit récent, un bloc par entrée) ;
 * - `current` change à chaque tour (fiche, état, action).
 */
export interface TurnContext {
  memory: string;
  entries: string[];
  current: string;
}

function actionText(state: GameState, action: PlayerAction): string {
  switch (action.type) {
    case "start":
      return "(Début de la partie. Ouvre la première scène de la phase en cours, en enchaînant directement sur la fin du dossier.)";
    case "advance":
      if (state.world.phase === "mission")
        return "LE JOUEUR VEUT AVANCER dans la mission : passe rapidement la fin de la scène en cours et les temps morts (trajet, attente, préparation), jusqu'à la prochaine décision importante de la mission. Ne saute aucune étape de la structure et ne conclus pas la mission plus tôt que prévu.";
      return "LE JOUEUR VEUT AVANCER. Conclus la scène en cours en quelques phrases, puis fais une ellipse franche jusqu'au prochain moment important (prochaine épreuve, prochain briefing, prochain rebondissement), en résumant l'entre-deux. Enregistre l'ellipse avec maj_etat : scene, jours_ecoules, lieu. N'escamote pas une décision cruciale.";
    case "choice":
      return `Le joueur choisit : ${action.text}`;
    case "free":
      return `ACTION LIBRE du joueur : ${action.text}\nAppelle arbitrer_action en premier dans ton message ; si elle est recevable ou reformulée, enchaîne la suite dans le même message.`;
    case "contact": {
      const r = state.relations.find((x) => x.name === action.name);
      return `LE JOUEUR RECONTACTE ${action.name}${r ? ` (${r.role}, ${r.status}, joignable : ${r.location || "inconnu"})` : ""}. Intention : ${action.intent}.
Joue un court échange vivant et cohérent (appel, message ou rendez-vous selon le lieu et la situation), dans la scène en cours ou en aparté. Si la personne est injoignable, disparue ou morte, raconte-le. Une faveur demandée consomme une faveur due, ou crée une dette (relations → faveurs). Mets la relation à jour.`;
    }
    case "use": {
      const item = state.character.inventory.find((i) => i.name === action.item);
      return `LE JOUEUR UTILISE ${action.item}${item ? ` (${item.description})` : ""}${action.how ? `, ainsi : ${action.how}` : ""}.
Montre son effet concret dans la scène. Si l'usage est incertain, fais un jet en passant l'objet dans « objet ». S'il est consommé ou cassé, enregistre-le (objets_perdus).`;
    }
    case "promotion":
      return "LE JOUEUR A CHOISI SA PROMOTION dans le jeu (voir le résultat ci-dessous, déjà appliqué). Joue la cérémonie ou la convocation qui va avec, propre à l'agence : qui l'annonce, où, avec quels mots, et ce que ça change (nouveau bureau, nouveau siège et le poids de ses prédécesseurs, nouveaux ennemis, ce que les autres en pensent). Termine par proposer_choix.";
    case "resource":
      return action.source === "seat"
        ? "LE JOUEUR FAIT JOUER LE COUP SIGNATURE DE SON SIÈGE (voir le résultat du jeu) : un avantage décisif, digne de ceux qui l'ont occupé avant lui. Raconte-le avec panache, puis amène l'étape suivante."
        : "LE JOUEUR APPELLE UNE BRANCHE EN SOUTIEN (voir le résultat du jeu) : fais intervenir son chef ou ses gens (à la radio, en personne, par un colis), avec leur caractère. Puis amène l'étape suivante.";
    case "week":
      return "LE JOUEUR A JOUÉ UNE SEMAINE (voir le résultat du jeu ci-dessous). Raconte-la en montage vivant de 3 à 8 lignes (ce qu'il a fait, avec qui, ce qui a changé), sans contredire les chiffres. S'il y a un ÉVÉNEMENT, enchaîne en scène et termine par proposer_choix (une option « ellipse » pour revenir au planning). S'il n'y en a pas, termine sur une image forte, sans proposer_choix. Si le jeu annonce le Brevet ou une promotion possible, mets-les en scène.";
    case "mission_start":
      return "LE JOUEUR PART EN MISSION. Raconte le briefing (qui le donne, où, le ton de l'agence), le passage au laboratoire pour les gadgets réquisitionnés, la rencontre avec l'équipe (fais exister chaque équipier en une ligne), le voyage et l'arrivée. Termine sur la situation de la première étape, sans la résoudre. Pas de proposer_choix.";
    case "node":
      return "LE JOUEUR A CHOISI UNE APPROCHE ; le jeu a résolu l'étape (voir ci-dessous). Raconte-la fidèlement, puis amène la situation de l'étape suivante, sans la résoudre. Pas de proposer_choix.";
    case "node_free":
      return `LE JOUEUR IMPROVISE à l'étape en cours de la mission : « ${action.text} ».
Appelle arbitrer_action en premier. Si l'action est recevable ou reformulée, fais UN jet_de_competence (compétence et difficulté justes, rouge si c'est irréversible) : le jeu en tirera les conséquences pour l'étape et te les renverra. Raconte ensuite le résultat fidèlement et amène la situation suivante. Pas de proposer_choix.`;
  }
}

export function turnContext(state: GameState, recent: LogEntry[], action: PlayerAction, facts?: string): TurnContext {
  const memory = [
    `<saga>\n${state.saga || "Rien pour l'instant : la campagne commence."}\n</saga>`,
    `<chapitres_precedents>\n${state.archives.map((a, i) => `${i + 1}. ${a.title} — ${a.summary}`).join("\n\n") || "Aucun."}\n</chapitres_precedents>`,
    `<dossier_resume>\n${state.dossier?.summary ?? "Aucun."}\n</dossier_resume>`,
    `<chronique_du_chapitre chapitre="${state.chronicleChapter || state.world.chapter}">\n${state.chronicle || "Rien d'archivé pour ce chapitre."}\n</chronique_du_chapitre>`,
    "<recit_recent> (les entrées suivantes, dans l'ordre)",
  ].join("\n\n");

  const entries = recent.length ? recent.map(entryToText) : ["(aucune entrée)"];
  const engineTurn = action.type === "week" || action.type === "mission_start" || action.type === "node" || action.type === "node_free" || state.world.phase === "mission";
  const ending =
    action.type === "week"
      ? "Raconte la semaine avec raconter ; s'il y a un événement, joue-le et termine par proposer_choix."
      : engineTurn
        ? "Raconte avec raconter. Pas de proposer_choix : le jeu propose lui-même la suite."
        : "Joue le tour suivant avec les outils : la narration passe par raconter, et le tour se termine par proposer_choix.";

  const current = [
    "</recit_recent>",
    `<fiche_personnage>\n${characterSheet(state)}\n</fiche_personnage>`,
    `<etat_du_monde>\n${worldBlock(state)}\n</etat_du_monde>`,
    `<relations> (12 suivies au maximum)\n${relationsBlock(state)}\n</relations>`,
    `<carnet> (faits établis, à ne jamais contredire)\n${journalBlock(state)}\n</carnet>`,
    `<notes_du_narrateur> (secrètes, pour toi seul)\n${state.gmNotes || "Aucune."}\n</notes_du_narrateur>`,
    `<consignes_de_phase>\n${phaseGuide(state)}\n</consignes_de_phase>`,
    `<rythme>\n${paceBlock(state)}\n</rythme>`,
    `<action_du_joueur>\n${actionText(state, action)}\n</action_du_joueur>`,
    facts ? `<resultat_du_jeu>\n${facts}\n</resultat_du_jeu>` : null,
    ending,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { memory, entries, current };
}

export function dossierPrompt(state: GameState): string {
  const id = state.character.identity;
  const agency = AGENCIES[id.agency];
  return [
    `<fiche_personnage>\n${characterSheet(state)}\n</fiche_personnage>`,
    `<consigne>
Rédige le DOSSIER DE PROSPECT de ce personnage : l'histoire de sa vie, de sa naissance jusqu'au jour où ${agency.name} s'apprête à lui faire parvenir l'Invitation, à ${id.age} ans. Le personnage ignore tout de l'existence de l'agence.

Forme :
- C'est un document classé de ${agency.name}, compilé à partir du signalement d'un Correspondant de ${id.nationality} et de mois d'observation discrète par un recruteur de l'agence (le sujet ne s'en est jamais douté). En-tête : une ligne « ${agency.name} — CONCORDAT DE LUCERNE — DOSSIER DE PROSPECT » puis une ligne « Sujet : Prénom NOM — Âge — Proposé par : ${id.nationality} — Recruteur : [nom inventé] ».
- 4 ou 5 parties titrées en chiffres romains avec « ### », chacune de 80 à 150 mots.
- Le ton mêle la précision froide d'un rapport de renseignement (dates, lieux, sources, extraits de rapports) et des passages plus intimes qui font vivre les scènes clés.
- Termine par « ### Évaluation du recruteur » : forces, faiblesses, risques, et une recommandation en une phrase mémorable.

Fond :
- Respecte la nationalité, l'origine, le drame fondateur, la motivation, les qualités, le défaut, les compétences et les souhaits du joueur. Chaque compétence notable a une explication dans le passé.
- Invente 2 à 4 personnes qui comptent encore (un proche, un mentor, un rival).
- Pas de mystère à rallonge : le passé éclaire le personnage, il ne cache pas de complot.
- La dernière partie amène le personnage au moment où l'Invitation va lui parvenir sous le paravent « ${agency.cover.name} » — sans le raconter.
- L'évaluation peut rappeler froidement la statistique : à peine un prospect sur dix est retenu.
- Pas de contenu sexuel ; les drames sont évoqués avec pudeur.

Écris le dossier directement dans le champ « texte » de l'outil clore_dossier (c'est le seul texte que le joueur verra), puis remplis les autres champs. N'écris rien en dehors de l'outil.
</consigne>`,
  ].join("\n\n");
}

export function chroniclePrompt(previous: string, entries: LogEntry[]): string {
  return [
    `<chronique_precedente>\n${previous || "(vide)"}\n</chronique_precedente>`,
    `<nouveaux_evenements>\n${entries.map(entryToText).join("\n\n")}\n</nouveaux_evenements>`,
    `Mets à jour la chronique de la partie : un résumé factuel, chronologique et dense, en français, à la troisième personne, qui intègre les nouveaux événements à la chronique précédente. Conserve ce qui compte pour la suite (noms, promesses, dettes, blessures, résultats). Condense les détails anciens. 400 mots maximum. Réponds uniquement par le texte de la chronique.`,
  ].join("\n\n");
}

export function sealPrompt(chapter: string, chronicle: string): string {
  return [
    `<chapitre_termine titre="${chapter}">\n${chronicle}\n</chapitre_termine>`,
    "Ce chapitre est terminé. Résume-le pour les archives de la campagne : 120 à 180 mots, factuel, à la troisième personne. Garde uniquement ce qui compte pour la suite : décisions du personnage, conséquences, personnes rencontrées et leur attitude, promesses, blessures, objets clés. Réponds uniquement par le résumé.",
  ].join("\n\n");
}

export function sagaPrompt(previous: string, chapters: { title: string; summary: string }[]): string {
  return [
    `<saga_precedente>\n${previous || "(vide)"}\n</saga_precedente>`,
    `<chapitres_a_integrer>\n${chapters.map((c) => `${c.title} — ${c.summary}`).join("\n\n")}\n</chapitres_a_integrer>`,
    "Intègre ces chapitres à la saga : la carrière du personnage, en 350 mots maximum, factuelle, chronologique, à la troisième personne. Privilégie ce qui l'a façonné : relations durables, rivaux, grandes missions, réputation, réussites et échecs. Réponds uniquement par le texte de la saga.",
  ].join("\n\n");
}
