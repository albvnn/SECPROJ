import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  ATTRIBUTE_IDS,
  DIFFICULTY_IDS,
  PHASE_IDS,
  RANK_IDS,
  SKILL_IDS,
} from "@/lib/game/rules";
import type { AttributeId, Difficulty, PhaseId, RankId, SkillId } from "@/lib/game/types";

const attribute = z.enum(ATTRIBUTE_IDS as [AttributeId, ...AttributeId[]]);
const skill = z.enum(SKILL_IDS as [SkillId, ...SkillId[]]);
const difficulty = z.enum(DIFFICULTY_IDS as [Difficulty, ...Difficulty[]]);
const phase = z.enum(PHASE_IDS as [PhaseId, ...PhaseId[]]);

export const NarrateInput = z.object({
  texte: z
    .string()
    .min(1)
    .describe("Le passage de narration, exactement tel que le joueur le lira (voix intérieures comprises, au format {{competence}} …)."),
});

export const CheckInput = z.object({
  motif: z.string().min(1).describe("Ce que le personnage tente, en une phrase courte (affichée au joueur)."),
  competence: skill.describe("Compétence testée."),
  difficulte: difficulty.describe(
    "Seuil : triviale 6, facile 8, moyenne 10, ardue 12, redoutable 13, legendaire 14, heroique 15, surhumaine 16, impossible 18.",
  ),
  modificateur: z
    .number()
    .int()
    .min(-4)
    .max(4)
    .optional()
    .describe("Modificateur situationnel justifié par la scène (−4 à +4)."),
  rouge: z
    .boolean()
    .optional()
    .describe("true pour un jet rouge (une seule chance, ne pourra pas être retenté)."),
  objet: z
    .string()
    .optional()
    .describe("Nom exact d'un objet de l'inventaire utilisé pour cette action : son bonus chiffré s'applique et une utilisation est décomptée."),
});

const itemFields = {
  nom: z.string(),
  description: z.string(),
  categorie: z.enum(["gadget", "arme", "equipement", "document", "consommable", "souvenir"]).optional(),
  bonus: z
    .object({
      competence: skill,
      valeur: z.number().int().min(1).max(3),
      condition: z.string().describe("Quand le bonus s'applique (ex. « serrures mécaniques »)."),
    })
    .optional()
    .describe("Bonus chiffré quand l'objet sert à cette compétence. Gadgets : presque toujours ; objets ordinaires : seulement s'ils aident vraiment."),
  charges: z.number().int().min(1).max(9).optional().describe("Nombre d'utilisations (absent = illimité)."),
};

export const UpdateInput = z.object({
  sante: z.number().int().optional().describe("Variation de santé (négatif = blessure, positif = soin)."),
  moral: z.number().int().optional().describe("Variation de moral (négatif = peur, honte, chagrin ; positif = réconfort, fierté)."),
  reputation: z.number().int().optional().describe("Variation de réputation dans l'agence (−20 à +20)."),
  jours_ecoules: z.number().int().min(0).optional().describe("Nombre de jours qui passent."),
  lieu: z.string().optional().describe("Nouveau lieu actuel."),
  chapitre: z.string().optional().describe("Titre du nouveau chapitre de l'histoire."),
  phase: phase
    .optional()
    .describe("Nouvelle phase : dossier → recrutement (l'Invitation) → selection → base (Académie puis siège) ; quitter la Sélection pour base fait du prospect un Aspirant ; recalé ou refus → apres ; base → apres (retraite). Les missions sont ouvertes et closes par le jeu, jamais par toi."),
  pole_ameliore: attribute.optional().describe("+1 à un pôle. Rare : fin de la Sélection, Brevet, accomplissement majeur."),
  entrainement: z
    .array(z.object({ competence: skill, xp: z.number().int().min(1).max(3) }))
    .max(3)
    .optional()
    .describe("Gains d'expérience dus à un entraînement (1 à 3 xp par compétence)."),
  objets_gagnes: z
    .array(z.object({ ...itemFields, laboratoire: z.boolean().optional().describe("true pour un gadget prêté par le laboratoire de l'agence (rendu à la fin de la mission).") }))
    .optional(),
  objets_perdus: z.array(z.string()).optional().describe("Noms exacts des objets perdus, cassés ou confisqués."),
  points_competence: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe("Points de compétence offerts au joueur (il les répartit lui-même) : fin d'une épreuve majeure de l'Académie."),
  merite: z
    .object({ montant: z.number().min(0.5).max(4), motif: z.string() })
    .optional()
    .describe("Mérite pour un acte remarquable hors bilan de mission (sauver un équipier, coup de génie) : 0,5 à 4."),
  blame: z.string().optional().describe("Motif d'un blâme (désobéissance grave, négligence, perte évitable) : −3 de mérite."),
  argent: z
    .object({ montant: z.number().int(), motif: z.string() })
    .optional()
    .describe("Gain (positif) ou dépense (négatif) sur la solde personnelle, en euros. Refusé si le personnage n'a pas la somme."),
  fonds_mission: z
    .object({ montant: z.number().int(), motif: z.string() })
    .optional()
    .describe("Pendant une mission : versement de fonds opérationnels (positif, plafonné selon le grade) ou dépense de couverture (négatif)."),
  achats: z
    .array(
      z.object({
        ...itemFields,
        prix: z.number().int().min(0),
        fonds: z.enum(["solde", "operation"]).optional().describe("solde par défaut ; operation pour un achat sur les fonds de la mission."),
      }),
    )
    .max(5)
    .optional()
    .describe("Achats : le moteur vérifie les fonds, débite et ajoute l'objet à l'inventaire en une fois."),
  relations: z
    .array(
      z.object({
        nom: z.string().describe("Nom du personnage (identique d'un tour à l'autre)."),
        role: z.string().optional().describe("Qui il est pour le joueur (ex. « instructrice de tir au Lycée »)."),
        type: z.enum(["proche", "mentor", "equipier", "allie", "contact", "rival", "ennemi"]).optional(),
        statut: z
          .enum(["actif", "injoignable", "disparu", "mort", "archive"])
          .optional()
          .describe("« archive » pour sortir une relation devenue secondaire du suivi."),
        affinite: z
          .number()
          .int()
          .optional()
          .describe("Variation d'affinité (−30 à +30). Pour une nouvelle relation : affinité de départ (−100 à +100)."),
        faveurs: z.number().int().optional().describe("Variation des faveurs : +1 il te doit une faveur, −1 tu lui en dois une."),
        lieu: z.string().optional().describe("Où le trouver ou le joindre."),
        sait: z.string().optional().describe("Ce qu'il sait de toi (remplace la valeur précédente)."),
        connait_sous: z
          .string()
          .optional()
          .describe("Sous quelle identité il te connaît : « reel » (ton vrai nom), « code » (ton nom de code) ou le nom exact d'une de tes légendes."),
        note: z.string().optional().describe("Ce qu'il faut retenir sur lui (remplace la note précédente)."),
      }),
    )
    .optional()
    .describe("12 relations suivies au maximum : seulement les personnes qui comptent vraiment."),
  carnet: z
    .array(z.string())
    .optional()
    .describe("Faits établis à retenir à long terme (promesses, dettes, secrets, blessures durables). Une phrase autonome et précise par fait."),
  carnet_resolus: z
    .array(z.number().int().min(1))
    .optional()
    .describe("Numéros (#) des faits du carnet désormais résolus ou obsolètes."),
  notes_mj: z
    .string()
    .optional()
    .describe("Remplace tes notes secrètes de narrateur (invisibles pour le joueur) : plan de la mission en cours, méchant, retournement prévu. 1500 caractères max."),
  intrigue_ouverte: z
    .object({
      titre: z.string(),
      question: z.string(),
      reponse: z.string().describe("La vérité, décidée maintenant et définitive."),
      tours_prevus: z.number().int().min(3).max(10),
    })
    .optional()
    .describe("RARE : un mystère court, une seule fois à la fois. La plupart du temps, n'en ouvre pas."),
  intrigue_resolue: z.boolean().optional(),
  scene: z
    .object({
      titre: z.string(),
      objectif: z.string().describe("Ce que la scène doit accomplir ; une fois atteint, on coupe."),
      tours_prevus: z.number().int().min(1).max(8),
    })
    .optional()
    .describe("Ouvre une nouvelle scène. À chaque changement de scène, notamment après une ellipse."),
  distinction: z.object({ nom: z.string(), raison: z.string() }).optional().describe("Distinction du Concordat remise au personnage."),
});

export const ChoicesInput = z.object({
  choix: z
    .array(
      z.object({
        texte: z.string().min(1).describe("Option à l'infinitif, moins de 90 caractères."),
        ton: z
          .enum(["audace", "prudence", "ruse", "social", "ellipse", "autre"])
          .describe("« ellipse » pour une option qui conclut la scène et fait avancer le temps."),
        competence: skill.optional().describe("Compétence sur laquelle repose clairement cette option, s'il y en a une."),
      }),
    )
    .min(2)
    .max(4),
  intensite_suivante: z
    .enum(["courante", "forte"])
    .describe(
      "Intensité probable du tour suivant. « forte » pour un moment clé : combat, poursuite, climax de mission, cérémonie, choix moral lourd. « courante » sinon (trajets, dialogues ordinaires, entraînement).",
    ),
});

export const ArbitrateInput = z.object({
  verdict: z
    .enum(["recevable", "reformulee", "refusee"])
    .describe("recevable : on joue tel quel. reformulee : on joue la version plausible. refusee : on ne joue pas."),
  action_retenue: z
    .string()
    .optional()
    .describe("Pour « reformulee » : l'action réellement tentée, à la première personne, courte (ex. « Je tente d'assommer le garde avec la lampe »)."),
  raison: z.string().optional().describe("Pour « reformulee » ou « refusee » : explication courte, bienveillante, adressée au joueur."),
  suggestion: z.string().optional().describe("Pour « refusee » : une alternative jouable dans la scène."),
});

export const CorrectionInput = z.object({
  passages: z
    .array(z.string())
    .describe("Les morceaux de texte du passage, corrigés, dans le même ordre et en même nombre que ceux fournis ([T1], [T2]…)."),
});

export const DossierInput = z.object({
  texte: z
    .string()
    .min(1)
    .describe("Le dossier complet, exactement tel que le joueur le lira (en-tête, parties ### en chiffres romains, évaluation)."),
  resume: z
    .string()
    .min(1)
    .describe(
      "Résumé factuel du dossier (150 à 250 mots) : faits, personnes, lieux, forces et failles, pour la mémoire du narrateur.",
    ),
  relations: z
    .array(
      z.object({
        nom: z.string(),
        role: z.string(),
        type: z.enum(["proche", "mentor", "equipier", "allie", "contact", "rival", "ennemi"]),
        affinite: z.number().int().min(-100).max(100),
        lieu: z.string().describe("Où cette personne se trouve aujourd'hui."),
        note: z.string(),
      }),
    )
    .max(4)
    .describe("Au plus 4 personnes du passé qui comptent encore vraiment."),
  carnet: z.array(z.string()).max(3).describe("Faits marquants du passé à garder en mémoire (pas de mystère à rallonge)."),
  lieu: z.string().describe("Lieu où se trouve le personnage à la fin du dossier."),
});

function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json as Anthropic.Tool.InputSchema;
}

function tool(name: string, description: string, schema: z.ZodType): Anthropic.Tool {
  return {
    name,
    description,
    input_schema: toInputSchema(schema),
    eager_input_streaming: true,
  };
}

export const TOOL_NARRATE = "raconter";
export const TOOL_CORRECT = "corriger_passage";
export const TOOL_ARBITRATE = "arbitrer_action";
export const TOOL_CHECK = "jet_de_competence";
export const TOOL_UPDATE = "maj_etat";
export const TOOL_CHOICES = "proposer_choix";
export const TOOL_DOSSIER = "clore_dossier";

export const GAME_TOOLS: Anthropic.Tool[] = [
  tool(
    TOOL_NARRATE,
    "Affiche au joueur un passage de narration, mot pour mot. TOUTE la narration passe par cet outil : le texte écrit en dehors n'est jamais montré au joueur. Appelle-le autant de fois que nécessaire dans un tour (avant un jet, après son résultat…).",
    NarrateInput,
  ),
  tool(
    TOOL_ARBITRATE,
    "Pour une action libre écrite par le joueur uniquement : rends ton verdict AVANT toute narration. Ne l'utilise jamais pour un choix proposé.",
    ArbitrateInput,
  ),
  tool(
    TOOL_CHECK,
    "Lance 2d6 pour une action à l'issue incertaine. Le moteur ajoute la valeur de la compétence (pôle + rangs + traits), le modificateur et les pénalités, compare au seuil et renvoie le résultat que tu dois raconter fidèlement.",
    CheckInput,
  ),
  tool(
    TOOL_UPDATE,
    "Enregistre les changements d'état du jeu (santé, moral, temps, lieu, relations, objets, carnet, phase, rang…). Seuls les champs fournis sont modifiés. Le moteur renvoie ce qui a été appliqué ou refusé.",
    UpdateInput,
  ),
  tool(
    TOOL_CHOICES,
    "Termine le tour en proposant 2 à 4 options au joueur. Appelle-le une seule fois, en dernier.",
    ChoicesInput,
  ),
];

export const DOSSIER_TOOLS: Anthropic.Tool[] = [
  tool(
    TOOL_DOSSIER,
    "Rédige et archive le dossier : le texte complet (affiché au joueur pendant que tu l'écris), puis le résumé, les personnes du passé et les mystères. Remplis « texte » en premier.",
    DossierInput,
  ),
];

export const CORRECTION_TOOLS: Anthropic.Tool[] = [
  tool(
    TOOL_CORRECT,
    "Renvoie le passage corrigé, morceau par morceau. Appelle-le une seule fois, en dernier.",
    CorrectionInput,
  ),
  tool(
    TOOL_UPDATE,
    "Corrige aussi l'état du jeu si la correction porte sur un fait enregistré (nom de code, lieu, relation…). Seuls les champs fournis sont modifiés.",
    UpdateInput,
  ),
];
