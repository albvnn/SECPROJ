"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { circleVisible, clearance, clearanceDef, factionOpen, operativeKnown } from "@/lib/game/intel";
import { OPERATIVE_TRAITS, operativeTitle } from "@/lib/game/roster";
import { MISSION_IMPORTANCE, MISSION_RESULTS, PINS, RANK_IDS, RANKS } from "@/lib/game/rules";
import { RichText } from "./RichText";
import { RankBadge } from "./ui";
import { TOPICS, gradeLabel } from "@/lib/game/sources";
import type { GameState, MissionRecord, MissionResult, NodeStatus, StoryDoc } from "@/lib/game/types";
import { FACTIONS } from "@/lib/world/factions";
import { REGIONS, findCity, type RegionId } from "@/lib/world/geo";
import { DOSSIER_FULL } from "@/lib/world/threats";
import { SkillChips } from "./glyphs";
import { GRADE_COLOR } from "./IntelUI";
import { DOC_LABELS, StoryDocView } from "./StoryCards";

/* ------------------------------------------------------------------ */
/* Le classeur : des tiroirs, des chemises, des pièces                 */
/* ------------------------------------------------------------------ */

interface Folder {
  id: string;
  title: string;
  /** Sous-titre : lieu, date, cotation… */
  meta: string;
  /** Mots pour la recherche. */
  text: string;
  /** Accréditation nécessaire (sinon : 0). */
  need: number;
  stamp?: { label: string; color: string };
  render: () => React.ReactNode;
}

interface Drawer {
  id: string;
  label: string;
  hint: string;
  folders: Folder[];
}

const RESULT_COLOR: Record<MissionResult, string> = {
  eclatant: "var(--color-brass)",
  reussite: "var(--color-success)",
  partiel: "var(--color-partial)",
  echec: "var(--color-fail)",
};

const STEP_COLOR: Record<NodeStatus, string> = {
  a_venir: "rgba(36,32,26,0.35)",
  en_cours: "var(--color-brass)",
  reussi: "#3f7a4f",
  partiel: "#9a7414",
  echoue: "#b4483c",
};

/** Une demande d'ouverture venue d'ailleurs (le terminal) : `n` change à chaque demande. */
export interface Focus {
  id: string;
  n: number;
}

export function Archives({ state, focus }: { state: GameState; focus?: Focus | null }) {
  const drawers = useMemo(() => buildDrawers(state), [state]);
  const [openDrawer, setOpenDrawer] = useState(drawers.find((d) => d.folders.length)?.id ?? "operations");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const lvl = clearance(state);
  useEffect(() => {
    if (!focus) return;
    const drawer = drawers.find((d) => d.folders.some((f) => f.id === focus.id));
    if (drawer) setOpenDrawer(drawer.id);
    setFolderId(focus.id);
    setQuery("");
  }, [focus]);
  const agency = AGENCIES[state.character.identity.agency];
  const q = query.trim().toLowerCase();
  const matches = q ? drawers.flatMap((d) => d.folders.filter((f) => f.need <= lvl && `${f.title} ${f.meta} ${f.text}`.toLowerCase().includes(q)).map((f) => ({ ...f, drawer: d.label }))) : [];
  const all = drawers.flatMap((d) => d.folders);
  const folder = all.find((f) => f.id === folderId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-3xl">Archives</h2>
          <span className="font-typewriter text-[10px] tracking-[0.2em] uppercase" style={{ color: agency.color }}>
            {agency.name} · {clearanceDef(lvl).label}
          </span>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un nom, une ville, une opération…" className="field py-1.5 text-sm" />
        {q ? (
          <ul className="space-y-1">
            {matches.length === 0 && <li className="text-xs text-faint italic">Aucune chemise ne correspond.</li>}
            {matches.map((f) => (
              <li key={f.id}>
                <FolderTab folder={f} on={f.id === folderId} onClick={() => setFolderId(f.id)} extra={f.drawer} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {drawers.map((d, i) => {
              const open = d.id === openDrawer;
              const readable = d.folders.filter((f) => f.need <= lvl).length;
              return (
                <li key={d.id}>
                  {/* Le tiroir : une façade de métal, une plaque, une poignée. */}
                  <button
                    onClick={() => setOpenDrawer(open ? "" : d.id)}
                    aria-expanded={open}
                    className={`group relative flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-all ${open ? "border-brass/60 bg-panel" : "border-line bg-panel/60 hover:border-line-strong"}`}
                    style={{ boxShadow: open ? "inset 0 -3px 0 var(--color-brass)" : "inset 0 -2px 0 var(--color-line)" }}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] border border-line-strong font-typewriter text-[11px] text-muted">{["I", "II", "III", "IV", "V", "VI"][i]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-typewriter text-[12px] tracking-[0.18em] uppercase">{d.label}</span>
                      <span className="block truncate text-[10px] text-faint">{d.hint}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {readable}
                      {readable < d.folders.length ? <span className="text-fail"> +{d.folders.length - readable}🔒</span> : null}
                    </span>
                    <span aria-hidden className="absolute right-1/2 bottom-1 h-[3px] w-10 translate-x-1/2 rounded-full bg-line-strong group-hover:bg-brass/60" />
                  </button>
                  {open && (
                    <ul className="animate-rise mt-1 space-y-1 border-l border-line pl-3">
                      {d.folders.length === 0 && <li className="py-1 text-xs text-faint italic">Tiroir vide.</li>}
                      {d.folders.map((f) => (
                        <li key={f.id}>
                          <FolderTab folder={f} locked={f.need > lvl} on={f.id === folderId} onClick={() => f.need <= lvl && setFolderId(f.id)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="min-w-0">
        {folder ? (
          <article key={folder.id} className="animate-rise paper relative rounded-sm px-6 py-6 font-sans text-paper-ink sm:px-10">
            {/* L'onglet de la chemise. */}
            <span className="absolute -top-3 left-6 rounded-t-sm bg-paper px-3 pt-1 font-typewriter text-[10px] tracking-[0.25em] uppercase opacity-80">Archives · {agency.name}</span>
            {folder.stamp && (
              <span className="stamp animate-stamp absolute top-5 right-6 px-2 py-0.5 text-sm" style={{ borderColor: folder.stamp.color, color: folder.stamp.color }}>
                {folder.stamp.label}
              </span>
            )}
            <h3 className="pr-32 font-serif text-3xl leading-tight">{folder.title}</h3>
            <p className="mt-1 font-typewriter text-xs opacity-70">{folder.meta}</p>
            <div className="mt-5 border-t border-paper-ink/15 pt-4">{folder.render()}</div>
          </article>
        ) : (
          <div className="grid min-h-80 place-items-center rounded-sm border border-dashed border-line text-center">
            <div className="max-w-sm px-6">
              <p className="font-serif text-2xl text-ivory/80">Ouvre un tiroir, choisis une chemise.</p>
              <p className="mt-2 text-sm text-muted">Tes opérations, ce qu'on t'a répondu, les pièces que tu as gardées, les gens et les factions que tu connais, et ce que l'agence veut bien te montrer.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderTab({ folder, on, onClick, locked = false, extra }: { folder: Folder; on: boolean; onClick: () => void; locked?: boolean; extra?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left transition-colors ${on ? "bg-brass/15" : locked ? "cursor-not-allowed opacity-50" : "hover:bg-ivory/5"}`}
      title={locked ? `Accréditation ${clearanceDef(folder.need).label} requise` : folder.meta}
    >
      <span className={`w-3 shrink-0 text-[10px] ${locked ? "text-fail" : "text-brass"}`}>{locked ? "🔒" : "▸"}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs ${on ? "text-brass-soft" : "text-ivory/90"}`}>{locked ? "Chemise scellée" : folder.title}</span>
        <span className="block truncate text-[10px] text-faint">{locked ? `Accréditation ${clearanceDef(folder.need).label}` : extra ? `${extra} · ${folder.meta}` : folder.meta}</span>
      </span>
      {folder.stamp && !locked && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: folder.stamp.color }} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Contenu des chemises                                                */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-typewriter text-[10px] tracking-[0.22em] uppercase opacity-60">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Les pièces jointes d'une chemise : on les ouvre sur place. */
function Attachments({ docs }: { docs: StoryDoc[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!docs.length) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 font-typewriter text-[10px] tracking-[0.22em] uppercase opacity-60">Pièces jointes · {docs.length}</p>
      <ul className="space-y-1">
        {docs.map((d, i) => (
          <li key={i} className="rounded-sm border border-paper-ink/15">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm">
              <span className="w-4 shrink-0 text-center">{DOC_LABELS[d.type].icon}</span>
              <span className="min-w-0 flex-1 truncate">{d.titre}</span>
              {d.grade && <span className="font-mono text-[10px]">{d.grade}</span>}
              <span className="text-[10px] opacity-60">{d.day !== undefined ? `J${d.day}` : ""}</span>
            </button>
            {open === i && (
              <div className="border-t border-paper-ink/15 bg-ink/90 px-2 pb-1">
                <StoryDocView doc={d} />
                {d.grade && <p className="pb-2 text-center text-[10px] text-muted">Cotation {d.grade} : {gradeLabel(d.grade)}.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissionFolder({ r, docs }: { r: MissionRecord; docs: StoryDoc[] }) {
  return (
    <div>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Field label="Objectif">{r.objective}</Field>
        <Field label="Cible">{r.target}</Field>
        <Field label="Adversaire">{r.faction || "—"}</Field>
        <Field label="Couverture">{r.cover}</Field>
        <Field label="Équipe">{r.team.length ? r.team.join(", ") : "Seul."}</Field>
        <Field label="Exposition finale">
          {r.exposure}/100{r.blown ? " — couverture grillée" : ""}
        </Field>
        {r.nemesis && <Field label="Ennemi nommé">{r.nemesis}</Field>}
      </div>
      <div className="mt-5">
        <p className="mb-2 font-typewriter text-[10px] tracking-[0.22em] uppercase opacity-60">Déroulé</p>
        <ol className="space-y-1">
          {r.steps.map((s, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="grid h-5 min-w-5 place-items-center rounded-sm border px-1 font-mono text-[10px]" style={{ borderColor: STEP_COLOR[s.status], color: STEP_COLOR[s.status] }}>
                {s.dilemma ? "?" : s.key ? "★" : s.secondary ? "◇" : i + 1}
              </span>
              <span className={s.status === "a_venir" ? "opacity-50" : ""}>{s.title}</span>
              <span className="ml-auto text-[10px] uppercase opacity-60">{s.status === "reussi" ? "réussi" : s.status === "partiel" ? "partiel" : s.status === "echoue" ? "échoué" : s.status === "a_venir" ? "non tenté" : ""}</span>
            </li>
          ))}
        </ol>
      </div>
      {r.report.length > 0 && (
        <div className="mt-5">
          <p className="mb-1 font-typewriter text-[10px] tracking-[0.22em] uppercase opacity-60">Rapport de la Direction</p>
          <ul className="space-y-0.5 font-typewriter text-[13px]">
            {r.report.map((l, i) => (
              <li key={i}>— {l}</li>
            ))}
          </ul>
        </div>
      )}
      <Attachments docs={docs} />
    </div>
  );
}

/** L'index du classeur, pour la recherche du terminal : seulement ce que tu as le droit de lire. */
export function archiveIndex(state: GameState) {
  const lvl = clearance(state);
  return buildDrawers(state).flatMap((d) =>
    d.folders.filter((f) => f.need <= lvl).map((f) => ({ id: f.id, title: f.title, meta: f.meta, text: f.text, drawer: d.id, drawerLabel: d.label })),
  );
}

function buildDrawers(state: GameState): Drawer[] {
  const c = state.character;
  const me = c.identity.agency;
  const agency = AGENCIES[me];
  const pieces = state.pieces ?? [];
  const reports = pieces.filter((p) => p.topic);
  const narrative = pieces.filter((p) => !p.topic);
  const linked = (missionId?: string, offerId?: string) => pieces.filter((p) => (missionId && p.missionId === missionId) || (offerId && p.offerId === offerId));

  // I. Opérations : la mission en cours, puis toutes les missions terminées.
  const operations: Folder[] = [];
  if (state.mission) {
    const m = state.mission;
    operations.push({
      id: `op:${m.id}`,
      title: m.name,
      meta: `En cours · ${findCity(m.cityId)?.name ?? ""} · depuis J${m.startDay}`,
      text: `${m.objective} ${m.target}`,
      need: 0,
      stamp: { label: "En cours", color: "var(--color-brass)" },
      render: () => (
        <div>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="Objectif">{m.objective}</Field>
            <Field label="Cible">{m.target}</Field>
            <Field label="Couverture">{m.cover}</Field>
            <Field label="Avancement">
              Étape {m.current + 1}/{m.nodes.length} · exposition {m.exposure} · alerte {m.alert}
            </Field>
          </div>
          <Attachments docs={linked(m.id, m.offerId)} />
        </div>
      ),
    });
  }
  for (const r of [...(state.missionLog ?? [])].reverse())
    operations.push({
      id: `op:${r.id}`,
      title: r.name,
      meta: `${MISSION_IMPORTANCE[r.importance].label} · ${r.city}, ${r.country} · J${r.startDay}–${r.endDay}`,
      text: `${r.objective} ${r.target} ${r.faction} ${r.team.join(" ")}`,
      need: 0,
      stamp: { label: MISSION_RESULTS[r.result].label, color: RESULT_COLOR[r.result] },
      render: () => <MissionFolder r={r} docs={linked(r.id, r.offerId)} />,
    });
  // Les propositions en cours, avec ce qu'on a déjà appris sur elles.
  for (const o of state.offers) {
    const docs = linked(undefined, o.id);
    if (!docs.length) continue;
    operations.push({
      id: `offer:${o.id}`,
      title: o.title.split(" — ")[0],
      meta: `Proposée · ${findCity(o.cityId)?.name ?? ""} · expire J${o.expiresDay}`,
      text: `${o.summary} ${o.target}`,
      need: 0,
      stamp: { label: "En préparation", color: "var(--color-partial)" },
      render: () => (
        <div>
          <p className="text-sm">{o.summary}</p>
          <Attachments docs={docs} />
        </div>
      ),
    });
  }

  // II. Renseignement reçu : par mission d'abord, puis le général.
  const reportFolders: Folder[] = [...reports].reverse().map((d, i) => ({
    id: `rep:${i}:${d.titre}`,
    title: d.titre,
    meta: `${d.topic ? TOPICS[d.topic].label : "Rapport"} · ${d.de ?? ""} · J${d.day ?? "?"}${d.offerId || d.missionId ? " · lié à une mission" : " · général"}`,
    text: `${d.contenu} ${d.de ?? ""}`,
    need: 0,
    ...(d.grade ? { stamp: { label: d.grade, color: GRADE_COLOR[d.grade[0]] ?? "var(--color-muted)" } } : {}),
    render: () => (
      <div>
        {d.grade && (
          <p className="mb-3 text-sm">
            Cotation <span className="font-mono">{d.grade}</span> : {gradeLabel(d.grade)}.
          </p>
        )}
        <div className="rounded-sm bg-ink/90 px-2 py-1">
          <StoryDocView doc={d} />
        </div>
      </div>
    ),
  }));
  reportFolders.sort((a, b) => Number(b.meta.includes("lié à une mission")) - Number(a.meta.includes("lié à une mission")));

  // III. Pièces : ce que le récit t'a mis entre les mains.
  const pieceFolders: Folder[] = [...narrative].reverse().map((d, i) => ({
    id: `piece:${i}:${d.titre}`,
    title: d.titre,
    meta: `${DOC_LABELS[d.type].label}${d.de ? ` · ${d.de}` : ""} · J${d.day ?? "?"}${d.missionId ? " · trouvée en mission" : ""}`,
    text: `${d.contenu} ${(d.messages ?? []).map((m) => m.texte).join(" ")}`,
    need: 0,
    render: () => (
      <div className="rounded-sm bg-ink/90 px-2 py-1">
        <StoryDocView doc={d} />
      </div>
    ),
  }));

  // IV. Personnes : tes liens, les agents dont tu as le dossier, tes ennemis.
  const people: Folder[] = [
    ...(state.dossier
      ? [
          {
            id: "moi:dossier",
            title: `Ton dossier — ${c.identity.firstName} ${c.identity.lastName}`,
            meta: `${c.matricule ?? "sans matricule"} · rédigé à ton recrutement`,
            text: `${c.codename ?? ""} ${state.dossier.summary}`,
            need: 0,
            stamp: { label: "Personnel", color: "#b4483c" },
            render: () => (
              <div className="prose-narrative font-typewriter text-[13px] leading-relaxed">
                <RichText text={state.dossier!.text} variant="dossier" />
              </div>
            ),
          },
        ]
      : []),
    ...state.relations
      .filter((r) => r.status !== "archive")
      .map((r) => ({
        id: `rel:${r.name}`,
        title: r.name,
        meta: `${r.role} · ${r.status === "mort" ? "décédé" : findCity(r.cityId)?.name ?? r.location}`,
        text: `${r.notes} ${r.knows} ${r.location}`,
        need: 0,
        render: () => (
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="Qui">{r.role}</Field>
            <Field label="Où">{r.location || "—"}</Field>
            <Field label="Affinité">
              {r.affinity > 0 ? "+" : ""}
              {r.affinity} · lien {r.bond ?? 50}
            </Field>
            <Field label="Faveurs">{r.favors > 0 ? `te doit ${r.favors}` : r.favors < 0 ? `tu lui dois ${-r.favors}` : "quittes"}</Field>
            <Field label="Ce qu'il sait de toi">{r.knows || "—"}</Field>
            <Field label="Notes">{r.notes || "—"}</Field>
          </div>
        ),
      })),
    ...state.roster
      .filter((o) => o.status !== "mort" && o.missionsWithPlayer + Math.abs(o.affinity) > 0 && operativeKnown(state, o) && !state.relations.some((r) => r.name.startsWith(o.name)))
      .slice(0, 60)
      .map((o) => ({
        id: `op-${o.id}`,
        title: o.codename ? `« ${o.codename} » ${o.name}` : o.name,
        meta: `${operativeTitle(o)} · ${AGENCIES[o.agency].name}`,
        text: `${o.nationality} ${o.trait}`,
        need: 0,
        render: () => (
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="Fonction">{operativeTitle(o)}</Field>
            <Field label="Origine">
              {o.nationality}, {o.age} ans
            </Field>
            <div className="sm:col-span-2">
              <Field label="Compétences">
                <SkillChips skills={o.skills} max={6} size="md" />
              </Field>
            </div>
            <Field label="Caractère">{OPERATIVE_TRAITS[o.trait]?.label ?? o.trait}</Field>
            <Field label="Dernière position">{findCity(o.cityId)?.name ?? "?"}</Field>
            <Field label="Avec toi">
              {o.missionsWithPlayer} mission{o.missionsWithPlayer > 1 ? "s" : ""} · affinité {o.affinity}
            </Field>
          </div>
        ),
      })),
    ...state.world.geo.nemeses.map((n) => ({
      id: `nem:${n.id}`,
      title: n.name,
      meta: `${n.title} · ${n.status === "libre" ? "en liberté" : n.status === "capture" ? "capturé" : "mort"}`,
      text: `${n.history} ${n.faction}`,
      need: 0,
      stamp: { label: "Némésis", color: "var(--color-fail)" },
      render: () => (
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field label="Qui">{n.title}</Field>
          <Field label="Pour le compte de">{n.agency ? AGENCIES[n.agency].name : FACTIONS.find((f) => f.id === n.faction)?.name}</Field>
          <Field label="Ce qui s'est passé">{n.history}</Field>
          <Field label="Menace">
            niveau {n.level} · rancune {n.grudge} · {n.encounters} rencontre{n.encounters > 1 ? "s" : ""}
          </Field>
          <Field label="Vu pour la dernière fois">
            {findCity(n.cityId)?.name ?? "?"}, J{n.lastDay}
          </Field>
        </div>
      ),
    })),
  ];

  // V. Factions : les profils ouverts ; les autres restent scellés.
  const factions: Folder[] = FACTIONS.map((f) => {
    const n = state.world.geo.dossiers?.[f.id] ?? 0;
    return {
      id: `fac:${f.id}`,
      title: f.name,
      meta: `Dossier ${n}/${DOSSIER_FULL} · ${f.regions.map((r) => REGIONS[r as RegionId]?.label).slice(0, 2).join(", ")}`,
      text: `${f.style} ${f.figures.join(" ")}`,
      need: factionOpen(state, f.id) ? 0 : 3,
      render: () => (
        <div className="grid gap-x-8 gap-y-3">
          <Field label="Méthodes">{f.style}</Field>
          <Field label="Figures connues">{f.figures.join(" ; ")}</Field>
          <Field label="Terrains">{f.regions.map((r) => REGIONS[r as RegionId]?.label).join(", ")}</Field>
          <Field label="Dossier">
            <span className="flex gap-0.5">
              {Array.from({ length: DOSSIER_FULL }, (_, i) => (
                <span key={i} className="h-1.5 w-5 rounded-full" style={{ background: i < n ? "#3a66c4" : "rgba(36,32,26,0.15)" }} />
              ))}
            </span>
          </Field>
        </div>
      ),
    };
  });

  // VI. Archives de l'agence : ce que ton accréditation permet de consulter.
  const agencyFolders: Folder[] = [
    {
      id: "ag:charte",
      title: `${agency.name} — charte et organigramme`,
      meta: `« ${agency.motto} »`,
      text: `${agency.director.name} ${agency.hq} ${agency.academy} ${agency.lab.name}`,
      need: 0,
      render: () => (
        <div className="space-y-4">
          <p className="text-sm">{agency.organization}</p>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="Direction">
              {agency.director.name}, « {agency.director.codename} »
            </Field>
            <Field label="Quartier général">{agency.hq}</Field>
            <Field label="Académie">{agency.academy}</Field>
            <Field label="Laboratoire">
              {agency.lab.name}, {agency.lab.chief}
            </Field>
            <Field label="Région">{agency.region}</Field>
            <Field label="Noms de code">{agency.codenames.theme}</Field>
          </div>
          <Field label="Les trois Branches">
            <ul className="mt-1 space-y-1.5">
              {agency.branches.map((b) => (
                <li key={b.id}>
                  <span className="font-semibold">{b.name}</span> — {b.role} <span className="opacity-70">({b.chief.name})</span>
                </li>
              ))}
            </ul>
          </Field>
        </div>
      ),
    },
    {
      id: "ag:grades",
      title: "Les grades du Concordat",
      meta: "Conditions, pouvoirs et devoirs de chaque grade",
      text: RANK_IDS.map((r) => RANKS[r].label).join(" "),
      need: 0,
      render: () => (
        <ol className="space-y-3">
          {RANK_IDS.map((r) => {
            const def = RANKS[r];
            return (
              <li key={r} className={`flex gap-3 rounded-sm p-2 ${r === c.rank ? "bg-[#24201a]/10 ring-1 ring-[#24201a]/30" : ""}`}>
                <RankBadge rank={r} className="mt-0.5 h-7 w-6 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {def.label}
                    {r === c.rank && <span className="ml-2 font-typewriter text-[10px] tracking-[0.2em] uppercase opacity-70">ton grade</span>}
                    <span className="ml-2 font-typewriter text-[11px] font-normal opacity-60">{[def.merit > 0 && `${def.merit} mérite`, def.minAge > 0 && `${def.minAge} ans`, def.track === "terrain" && "voie du terrain", def.track === "commandement" && "voie du commandement"].filter(Boolean).join(" · ")}</span>
                  </p>
                  <p className="text-xs opacity-80">{def.requirement}</p>
                  <p className="text-xs">
                    <span className="opacity-60">Pouvoirs. </span>
                    {def.powers}
                  </p>
                  <p className="text-xs">
                    <span className="opacity-60">Devoirs. </span>
                    {def.duties}
                  </p>
                </div>
              </li>
            );
          })}
          <li className="font-typewriter text-xs opacity-70">
            Mérite d'une mission : importance (locale 1, régionale 2, continentale 4, mondiale 8) × résultat (partiel ×0,5, réussite ×1, éclatant ×1,5). Acte remarquable : +0,5 à +4. Blâme : −3.
          </li>
        </ol>
      ),
    },
    {
      id: "ag:distinctions",
      title: "Les distinctions du Concordat",
      meta: `${c.distinctions.length} obtenue${c.distinctions.length > 1 ? "s" : ""} sur ${PINS.length}`,
      text: PINS.map((p) => p.name).join(" "),
      need: 0,
      render: () => (
        <ul className="space-y-2">
          {PINS.map((p) => {
            const got = c.distinctions.find((d) => d.name === p.name);
            return (
              <li key={p.name} className={got ? "" : "opacity-60"}>
                <p className="text-sm">
                  <span className={got ? "text-[#9a7414]" : ""}>{got ? "✦" : "✧"}</span> <span className="font-semibold">{p.name}</span>
                </p>
                <p className="pl-4 text-xs">{got ? got.reason : p.description}</p>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: "ag:cercle",
      title: `Registre ${agency.circle.name.startsWith("les") ? "des" : "de"} ${agency.circle.name.replace(/^(les|la) /, "")}`,
      meta: `${agency.seats.length} ${agency.circle.seatTerm.plural} · traditions et titulaires`,
      text: agency.seats.map((s) => s.name).join(" "),
      need: 1,
      render: () => (
        <ul className="space-y-2">
          {agency.seats.map((s) => {
            const holder = c.seat === s.id ? `${c.identity.firstName} ${c.identity.lastName} (toi)` : state.roster.find((o) => o.agency === me && o.seat === s.id && o.status !== "mort" && o.status !== "retraite")?.name;
            return (
              <li key={s.id}>
                <p className="text-sm">
                  <span className="font-semibold">
                    {s.number}. {s.name}
                  </span>{" "}
                  — {holder ?? <span className="italic opacity-60">vacant</span>}
                </p>
                <p className="text-xs opacity-75">{s.heritage}</p>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: "ag:stations",
      title: "Les Stations",
      meta: `${agency.stations.length} antennes secrètes`,
      text: agency.stations.map((x) => findCity(x)?.name).join(" "),
      need: 2,
      render: () => (
        <ul className="grid gap-2 sm:grid-cols-2">
          {agency.stations.map((id) => {
            const chief = state.roster.find((o) => o.agency === me && o.station === id && o.rank === "chef_station");
            return (
              <li key={id} className="text-sm">
                <span className="font-semibold">{findCity(id)?.name}</span>
                <span className="block text-xs opacity-75">{chief ? `Chef : ${chief.name}` : "Chef : —"}</span>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: "ag:depeches",
      title: "Revue des dépêches",
      meta: `${state.world.geo.news.length} dépêches archivées`,
      text: state.world.geo.news.map((n) => n.text).join(" "),
      need: 1,
      render: () => (
        <ul className="space-y-1.5 font-typewriter text-[13px]">
          {state.world.geo.news.map((n, i) => (
            <li key={i}>
              <span className="opacity-60">J{n.day} · </span>
              {n.text}
              {n.player ? " ★" : ""}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "ag:moyens",
      title: "Moyens et satisfaction des gouvernements",
      meta: "Budgets, crédit, diplomatie",
      text: "budget satisfaction",
      need: 3,
      render: () => (
        <ul className="space-y-1 text-sm">
          {AGENCY_IDS.map((a) => (
            <li key={a}>
              {AGENCIES[a].name} : satisfaction {state.world.geo.satisfaction?.[a] ?? 60}/100
            </li>
          ))}
        </ul>
      ),
    },
    ...AGENCY_IDS.filter((a) => a !== me).map((a) => ({
      id: `ag:rival:${a}`,
      title: `Fiche d'agence — ${AGENCIES[a].name}`,
      meta: `${AGENCIES[a].circle.name} · ${AGENCIES[a].region}`,
      text: AGENCIES[a].identity,
      need: circleVisible(state, a) ? 0 : 4,
      render: () => (
        <div className="space-y-3">
          <p className="text-sm">{AGENCIES[a].identity}</p>
          <Field label="Direction">
            {AGENCIES[a].director.name}, « {AGENCIES[a].director.codename} »
          </Field>
          <Field label={AGENCIES[a].circle.name}>
            {state.roster
              .filter((o) => o.agency === a && o.role === "titulaire" && o.status !== "mort")
              .map((o) => `« ${o.codename} » ${o.name}`)
              .join(" · ") || "—"}
          </Field>
        </div>
      ),
    })),
  ];

  return [
    { id: "operations", label: "Opérations", hint: "Tes missions, de l'ordre au rapport", folders: operations },
    { id: "rapports", label: "Renseignement", hint: "Les réponses de ton réseau, cotées", folders: reportFolders },
    { id: "pieces", label: "Pièces", hint: "Messages, lettres, photos gardés", folders: pieceFolders },
    { id: "personnes", label: "Personnes", hint: "Liens, agents connus, ennemis", folders: people },
    { id: "factions", label: "Factions", hint: "Profils et dossiers", folders: factions },
    { id: "agence", label: "Agence", hint: "Ce que l'agence te laisse lire", folders: agencyFolders },
  ];
}
