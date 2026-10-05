# SÉRAPHIN — *Invisibles. Impeccables.*

Jeu de rôle narratif d'espionnage dans le navigateur. Tu incarnes un adolescent recruté par SÉRAPHIN, la section secrète du renseignement français qui forme des agents de 10 à 17 ans, derrière la vitrine d'un tailleur parisien. Le narrateur est Claude (API Anthropic). Le moteur de règles (dés, stats, progression) est du code déterministe.

## Lancer le projet

```bash
npm install
```

```bash
cp .env.example .env.local
```

Renseigne `ANTHROPIC_API_KEY` dans `.env.local`, puis :

```bash
npm run dev
```

Ouvre http://localhost:3000.

> Si ta clé n'est rattachée à aucun workspace, ajoute `ANTHROPIC_WORKSPACE_ID=wrkspc_…` dans `.env.local`.
> Le jeu ignore `ANTHROPIC_BASE_URL` (souvent défini par d'autres outils) ; pour viser un autre serveur, utilise `SERAPHIN_API_BASE_URL`.

Pour vérifier que tout fonctionne avec la vraie API avant de jouer (quelques centimes) :

```bash
npm run smoke
```

## Déroulé d'une partie

1. **Création** : identité, origine, drame fondateur, motivation, traits, pôles et compétences, compétence signature.
2. **Dossier** : l'IA rédige ton passé sous la forme d'un dossier confidentiel (avec passages censurés et mystères).
3. **Recrutement** : puis **le Creuset** (100 jours), **le Domaine**, les **essayages** (missions), les **Aînés** de 18 à 20 ans, puis à 20 ans **la Dernière Mesure** et **l'Après**. Pas d'essayage avant 15 ans.

## Système de jeu (inspiré de Disco Elysium)

- **4 pôles** colorés : Esprit (bleu), Âme (violet), Corps (rouge), Geste (jaune). Chacun contient **6 compétences** avec un glyphe abstrait.
- **Valeur d'une compétence** = pôle + rangs appris + traits. Les rangs appris sont plafonnés par la valeur du pôle (+1 pour la compétence signature).
- **Jets** : 2d6 + compétence contre un seuil (facile 8, moyenne 10, ardue 12, … impossible 18). Il y a des jets **blancs** (qu'on peut retenter) et **rouges** (une seule chance).
- **Voix intérieures** : les compétences commentent la scène (`{{logique}} …`) quand leur valeur passive est assez haute.
- **Santé** (Corps) et **Moral** (Âme). **8 rangs** de cravate, des **épingles** de distinction, l'âge qui avance avec le temps de jeu.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/lib/ai/lore.ts` | Bible de l'univers + règles du narrateur (prompt système, mis en cache). Aussi affichée dans `/codex`. |
| `src/lib/game/rules.ts` | Données : pôles, compétences, origines, traits, rangs, difficultés. |
| `src/lib/game/engine.ts` | Moteur : création, jets, progression, mises à jour d'état avec garde-fous. |
| `src/lib/ai/tools.ts` | Outils du narrateur (`jet_de_competence`, `maj_etat`, `proposer_choix`, `clore_dossier`). |
| `src/lib/ai/narrator.ts` | Boucle Claude en streaming + exécution des outils. |
| `src/lib/ai/prompts.ts` | Fiche perso, consignes par phase, chronique. |
| `src/app/api/{turn,dossier}` | Routes SSE. |
| `src/components/` | Interface (récit, dés, fiche, glyphes). |

- Les sauvegardes sont stockées dans le `localStorage` du navigateur, avec export et import en JSON.

## Progression

- **Apprentissage par la pratique** : chaque jet donne de l'expérience à la compétence (davantage en cas d'échec), dans la limite du pôle.
- **Points de compétence** : +1 par essayage réussi, +1 par nouveau rang, plus ceux offerts par le narrateur après les grandes épreuves. Le joueur les dépense lui-même depuis la fiche : 1 point = 1 rang, ou 3 points = +1 à un pôle.
- **Objets** : bonus chiffré sur une compétence (avec une condition d'usage) et nombre d'utilisations. Les gadgets de l'Atelier sont rendus à la fin de l'essayage ; en perdre un coûte de la réputation.
- **Âge** : il avance avec les jours de jeu (+1 an tous les 365 jours depuis l'arrivée au Domaine). Entre deux essayages, le narrateur fait passer 3 semaines à 3 mois. Pas d'essayage avant 15 ans (faufilures seulement), Aînés de 18 à 20 ans, Dernière Mesure à 20 ans.
- **Salons** : six clubs du Domaine, rejoints à la cravate bordeaux (Nuit des Cartons, au choix du joueur). Chacun accélère l'apprentissage de 4 compétences hors essayage (+1 XP par gain).
- **Argent** :
  - *la Pochette* : argent personnel ; argent de départ selon l'origine, solde hebdomadaire selon la cravate (10 à 100 €), prime à chaque essayage réussi, Dot à la Dernière Mesure ;
  - *la Bourse* : fonds de couverture confiés pendant un essayage et restitués à la fin.

  Le narrateur enregistre les gains, les dépenses et les achats ; le moteur refuse ce qu'on ne peut pas payer.
- **Onglet Agent** : carrière, échelle des cravates et conditions, épingles, historique de progression.

## Mémoire et cohérence

À chaque tour, le narrateur reçoit, du plus ancien au plus récent :

| Niveau | Contenu | Taille max |
|---|---|---|
| Saga | toute la campagne condensée | ~350 mots |
| Chapitres précédents | un résumé par chapitre terminé (10 max, puis fusion dans la saga) | ~180 mots chacun |
| Chronique | résumé glissant du chapitre en cours | ~400 mots |
| Récit récent | les 10 à 24 dernières entrées, mot pour mot | — |
| Carnet | faits établis à ne jamais contredire (40 actifs, les résolus sortent) | 1 phrase chacun |
| Relations | chaque PNJ important : rôle, affinité, ce qu'il sait/veut | — |
| Notes du narrateur | plan secret : arc en cours, twists prévus, secrets des PNJ | 1500 caractères |

Les états chiffrés (stats, santé, rang, inventaire, jours) ne sont jamais « retenus » par l'IA : ils viennent du moteur, et sont donc toujours exacts.

## Actions libres

Avant de raconter une action libre, le narrateur rend un verdict :
- **recevable** : jouée telle quelle ;
- **reformulée** : on joue la version plausible, et le joueur voit ce qui a été changé ;
- **refusée** : hors sujet, triche ou surnaturel. Rien n'est joué, et le texte reste dans le champ pour être corrigé.

## Narration et rythme (menu ⚙ en jeu)

- **Narration** :
  - *Éco* : toujours le modèle rapide (Sonnet 5.5) ;
  - *Prestige* : toujours le modèle fort (Opus 5.5) ;
  - *Hybride* : le modèle rapide pour les scènes courantes, le modèle fort quand le narrateur annonce une scène forte (combat, révélation, climax, cérémonie) ou à un changement de phase. Comme le cache est propre à chaque modèle, l'hybride ne redescend vers le modèle rapide qu'aux moments où le cache est perdu de toute façon (mémoire réarchivée, pause de plus d'une heure).
- **Rythme** (Posé / Normal / Rapide) : le narrateur joue par scènes à objectif. Le moteur compte les tours de chaque scène et de chaque phase, et le narrateur voit s'il est en retard (par exemple le Creuset en 50 / 32 / 20 tours). Le Creuset se raconte par semaines, avec des montages.
- **⏭ Avancer** : conclut la scène et saute au prochain moment important. L'ellipse doit être enregistrée (nouvelle scène, jours, lieu), sinon le moteur la redemande.

## Coûts

Le contexte est découpé pour le cache de prompt : système, puis mémoire et récit (qui ne font que s'allonger d'un tour à l'autre), puis le contexte du tour. Le lore et le récit restent en cache 1 heure, pour survivre aux pauses de lecture. Le narrateur regroupe ses outils pour faire 1 appel par tour (2 s'il y a un jet). Le coût estimé du dernier tour et de la partie s'affiche en bas du récit.
# SECPROJ
