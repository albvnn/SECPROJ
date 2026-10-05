"use client";

import { useState } from "react";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { CLEARANCES, circleVisible, clearance, clearanceDef, clearanceOf, factionOpen, knownRegions, operativeKnown, rumourVisible, satisfactionVisible, threatVisible } from "@/lib/game/intel";
import { BROKERS, MAX_REQUESTS, SOURCE_KINDS, TOPICS, analysisCapacity, cancelRequest, gradeLabel } from "@/lib/game/sources";
import { RANKS, RANK_IDS } from "@/lib/game/rules";
import type { GameState, IntelRequestKind, Nemesis, Threat } from "@/lib/game/types";
import { Classified, ClearanceBadge, GRADE_COLOR, RequestButton, SourceList } from "./IntelUI";
import { tint } from "@/lib/ui/color";
import { FACTIONS, findFaction } from "@/lib/world/factions";
import { REGION_IDS, REGIONS, findCity, type RegionId } from "@/lib/world/geo";
import { DOSSIER_FULL, fundingFactor, satisfactionOf } from "@/lib/world/threats";
import { diplomacyBetween, diplomacyLabel } from "@/lib/world/world";

/**
 * Le monde vivant, vu du bureau d'analyse : ce que ton accréditation te laisse voir,
 * ce que tu as demandé, et ce qui reste classifié.
 */
export function IntelBoard({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  if (clearance(state) === 0)
    return (
      <Classified need={1}>
        Tu n'es qu'un nom sur une liste. Le renseignement, ce sera pour ceux qui passeront la Sélection.
      </Classified>
    );
  return (
    <div className="space-y-8">
      <Access state={state} onChange={onChange} />
      <Threats state={state} onChange={onChange} />
      <div className="grid gap-8 lg:grid-cols-2">
        <Dossiers state={state} onChange={onChange} />
        <Nemeses state={state} />
      </div>
      <Satisfaction state={state} />
      <Rivals state={state} />
    </div>
  );
}

/** Ton accréditation, et ton réseau : les questions en vol, et celles à poser. */
function Access({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const lvl = clearance(state);
  const def = clearanceDef(lvl);
  const next = CLEARANCES.find((c) => c.level === lvl + 1);
  const nextRanks = next ? RANK_IDS.filter((r) => clearanceOf(r) === next.level).map((r) => RANKS[r].label) : [];
  const requests = state.knowledge.requests;
  const regions = knownRegions(state);
  const me = state.character.identity.agency;
  const network = [
    { label: "liens", n: state.relations.filter((r) => r.status === "actif" && r.kind !== "ennemi" && r.cityId).length },
    { label: "informateurs", n: state.command.assets.filter((a) => a.status === "actif").length },
    { label: "agents rivaux amicaux", n: state.roster.filter((o) => o.agency !== me && o.affinity >= 20 && operativeKnown(state, o)).length },
    { label: "courtiers", n: lvl >= 2 ? BROKERS.length : 0 },
  ];
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="rounded-sm border border-line bg-panel/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="label">Ton accréditation</h3>
          <ClearanceBadge state={state} />
        </div>
        <p className="mt-2 text-sm text-ivory/90">{def.grants}</p>
        {next && (
          <p className="mt-2 text-xs text-muted">
            <span className="text-faint">Niveau suivant, {next.label}</span> ({nextRanks.join(" ou ")}) : {next.grants}
          </p>
        )}
        {lvl < 4 && (
          <p className="mt-3 text-xs text-muted">
            <span className="text-faint">Régions que tu surveilles :</span>{" "}
            {regions.size ? [...regions].map(([r, why]) => `${REGIONS[r as RegionId]?.label ?? r} (${why})`).join(" · ") : "aucune"}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          <span className="text-faint">Ton réseau :</span> {network.map((n) => `${n.n} ${n.label}`).join(" · ")}. L'analyse traite {analysisCapacity(state)} question{analysisCapacity(state) > 1 ? "s" : ""} à la fois.
        </p>
      </div>
      <div className="rounded-sm border border-line bg-panel/50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="label">Questions en vol</h3>
          <span className="text-[10px] text-faint">
            {requests.length}/{MAX_REQUESTS}
          </span>
        </div>
        {requests.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {requests.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 shrink-0 text-center text-brass">{SOURCE_KINDS[r.source].icon}</span>
                <span className="min-w-0 flex-1 truncate">
                  {TOPICS[r.kind].label} · <span className="text-ivory/90">{r.label}</span> <span className="text-faint">— {r.sourceLabel}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px]" style={{ color: GRADE_COLOR[r.grade[0]] }} title={gradeLabel(r.grade)}>
                  {r.grade}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">J{r.readyDay}</span>
                {onChange && (
                  <button onClick={() => onChange(cancelRequest(state, r.id))} className="text-[10px] text-faint hover:text-ivory" title="Oublier la question (ce qui a été payé l'est)">
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">Rien en cours. Les réponses arrivent avec la semaine et se rangent dans tes archives.</p>
        )}
        <NewRequest state={state} onChange={onChange} />
      </div>
    </section>
  );
}

function requestTargets(state: GameState, kind: IntelRequestKind): { id: string; label: string }[] {
  const me = state.character.identity.agency;
  switch (kind) {
    case "reperages":
      return state.offers.map((o) => ({ id: o.id, label: o.title.split(" — ")[0] }));
    case "menace":
      return state.world.geo.threats
        .filter((t) => threatVisible(state, t) || rumourVisible(state, t))
        .map((t) => ({ id: t.id, label: threatVisible(state, t) ? t.title : `Rumeur — ${REGIONS[t.region as RegionId]?.label}` }));
    case "region":
      return REGION_IDS.map((r) => ({ id: r, label: REGIONS[r].label }));
    case "agent":
      return state.roster
        .filter((o) => o.status !== "mort" && !operativeKnown(state, o) && (o.agency === me ? o.role !== "cadet" : o.role === "titulaire"))
        .map((o) => ({ id: o.id, label: `${o.agency === me ? o.name : `« ${o.codename} »`} — ${AGENCIES[o.agency].name}` }));
    case "faction":
      return FACTIONS.filter((f) => !factionOpen(state, f.id)).map((f) => ({ id: f.id, label: f.name }));
    case "cercle":
      return AGENCY_IDS.filter((a) => a !== me && !circleVisible(state, a)).map((a) => ({ id: a, label: `${AGENCIES[a].name} — ${AGENCIES[a].circle.name}` }));
  }
}

/** Poser une question : le sujet, la cible, puis toutes les sources qui pourraient répondre, comparées. */
function NewRequest({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const kinds = (Object.keys(TOPICS) as IntelRequestKind[]).filter((k) => requestTargets(state, k).length > 0);
  const [kind, setKind] = useState<IntelRequestKind>(kinds[0] ?? "region");
  const targets = requestTargets(state, kind);
  const [target, setTarget] = useState("");
  const chosen = targets.some((t) => t.id === target) ? target : (targets[0]?.id ?? "");
  if (!kinds.length || !onChange || clearance(state) < 1) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="label mb-2">Poser une question</p>
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto flex-none py-1.5 text-xs" value={kind} onChange={(e) => setKind(e.target.value as IntelRequestKind)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {TOPICS[k].label}
            </option>
          ))}
        </select>
        <select className="field min-w-0 flex-1 py-1.5 text-xs" value={chosen} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 mb-2 text-[11px] text-faint">{TOPICS[kind].gives}</p>
      {chosen && <SourceList state={state} kind={kind} target={chosen} onChange={onChange} />}
    </div>
  );
}

function Satisfaction({ state }: { state: GameState }) {
  const geo = state.world.geo;
  const me = state.character.identity.agency;
  return (
    <section>
      <h3 className="label mb-1">Les gouvernements membres</h3>
      <p className="mb-3 text-xs text-muted">Leur satisfaction fixe les moyens de chaque agence : budget des Stations, réquisitions, fonds d'opération. Une menace qui frappe dans une région d'intérêt la fait chuter ; une menace déjouée la remonte.</p>
      <ul className="grid gap-3 md:grid-cols-3">
        {AGENCY_IDS.map((a) => {
          const def = AGENCIES[a];
          const v = satisfactionOf(geo, a);
          const f = fundingFactor(geo, a);
          if (!satisfactionVisible(state, a))
            return (
              <li key={a}>
                <p className="mb-1 font-serif text-lg tracking-[0.1em]" style={{ color: def.color }}>
                  {def.name}
                </p>
                <Classified need={a === me ? 2 : 3} />
              </li>
            );
          return (
            <li key={a} className="rounded-sm border p-3" style={{ borderColor: a === me ? def.color : "var(--color-line)", background: tint(def.color, a === me ? 8 : 3) }}>
              <p className="flex items-baseline justify-between">
                <span className="font-serif text-lg tracking-[0.1em]" style={{ color: def.color }}>
                  {def.name}
                  {a === me && <span className="ml-1.5 text-[10px] tracking-[0.15em] text-muted uppercase">toi</span>}
                </span>
                <span className="font-mono text-sm">{v}/100</span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 60 ? "var(--color-success)" : v >= 40 ? "var(--color-partial)" : "var(--color-fail)" }} />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Moyens ×{f.toFixed(2)}
                {a !== me && (
                  <>
                    {" "}· relations : <span>{diplomacyLabel(diplomacyBetween(geo.diplomacy, me, a)).label}</span>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Threats({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const geo = state.world.geo;
  const visible = geo.threats.filter((t) => threatVisible(state, t));
  const rumours = geo.threats.filter((t) => rumourVisible(state, t));
  const hidden = geo.threats.length - visible.length - rumours.length;
  const list = [...visible, ...rumours].sort((a, b) => Number(b.capstone ?? 0) - Number(a.capstone ?? 0) || Number(threatVisible(state, b)) - Number(threatVisible(state, a)) || b.progress - a.progress);
  return (
    <section>
      <h3 className="label mb-1">Menaces · {visible.length} identifiée{visible.length > 1 ? "s" : ""}</h3>
      <p className="mb-3 text-xs text-muted">Chaque faction avance semaine après semaine. Ignorée, une menace frappe à 100 : une dépêche, une région qui s'embrase, des gouvernements mécontents.</p>
      {list.length === 0 && !hidden && <p className="text-sm text-faint italic">Calme plat. Ça ne dure jamais.</p>}
      {list.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((t) => (
            <ThreatCard key={t.id} state={state} t={t} onChange={onChange} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <div className="mt-2">
          <Classified need={3}>
            {hidden} autre{hidden > 1 ? "s" : ""} opération{hidden > 1 ? "s" : ""} adverse{hidden > 1 ? "s" : ""} hors de tes régions. Un rapport régional, ou l'accréditation Cercle, les ferait apparaître.
          </Classified>
        </div>
      )}
    </section>
  );
}

function ThreatCard({ state, t, onChange }: { state: GameState; t: Threat; onChange?: (s: GameState) => void }) {
  const studied = state.knowledge.threats[t.id] !== undefined;
  const f = findFaction(t.faction);
  const nemesis = t.nemesis ? state.world.geo.nemeses.find((n) => n.id === t.nemesis) : undefined;
  const offered = state.offers.some((o) => o.threat === t.id) || state.mission?.threat === t.id;
  const color = t.capstone ? "var(--color-brass)" : t.progress >= 75 ? "var(--color-fail)" : t.progress >= 45 ? "var(--color-partial)" : "var(--color-muted)";
  return (
    <li className={`rounded-sm border p-3 ${t.capstone ? "border-brass/60 bg-brass/5" : "border-line bg-panel/50"}`}>
      {t.known ? (
        <>
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-serif text-lg leading-tight">{t.title}</span>
            {t.capstone && <span className="text-[9px] font-semibold tracking-[0.15em] text-brass uppercase">Opération décisive</span>}
          </p>
          <p className="text-[11px] text-muted">
            {f?.name} · {findCity(t.cityId)?.name}, {REGIONS[t.region as RegionId]?.label}
            {nemesis && <span className="text-fail"> · {nemesis.name}</span>}
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-lg leading-tight text-muted italic">Rumeur : quelque chose se prépare</p>
          <p className="text-[11px] text-faint">{REGIONS[t.region as RegionId]?.label} · une Station ou un informateur dans la région l'identifierait.</p>
        </>
      )}
      {!t.capstone && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-faint">
          avancement
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full" style={{ width: `${t.progress}%`, background: color }} />
          </span>
          <span className="font-mono">{t.progress}</span>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        {offered ? <p className="text-[10px] text-brass-soft">Un dossier sur cette menace t'attend au QG.</p> : <span />}
        {studied ? (
          <span className="text-[10px] text-success">Étudiée : +{state.knowledge.threats[t.id]} renseignement au départ</span>
        ) : (
          !t.capstone && <RequestButton state={state} kind="menace" target={t.id} onChange={onChange} label={t.known ? "Étudier" : "Enquêter"} />
        )}
      </div>
    </li>
  );
}

function Dossiers({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const geo = state.world.geo;
  const day = state.world.day;
  const rows = FACTIONS.map((f) => ({ f, n: geo.dossiers?.[f.id] ?? 0, dormant: (geo.dormant?.[f.id] ?? 0) > day ? geo.dormant[f.id] : 0, open: factionOpen(state, f.id) })).sort(
    (a, b) => Number(b.open) - Number(a.open) || b.n - a.n || a.f.name.localeCompare(b.f.name, "fr"),
  );
  const closed = rows.filter((r) => !r.open);
  return (
    <section>
      <h3 className="label mb-1">Dossiers de renseignement</h3>
      <p className="mb-3 text-xs text-muted">
        Objectifs secondaires, informateurs et dilemmes y ajoutent des pièces. À {DOSSIER_FULL}/{DOSSIER_FULL}, l'opération décisive contre la tête de la faction devient possible ; décapitée, elle se tait un temps.
      </p>
      <ul className="space-y-1.5">
        {rows
          .filter((r) => r.open)
          .map(({ f, n, dormant }) => (
            <li key={f.id} className="text-xs" title={f.style}>
              <p className="flex items-baseline justify-between gap-2">
                <span className={n ? "text-ivory/90" : "text-muted"}>{f.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{dormant ? `en sommeil (J${dormant})` : `${n}/${DOSSIER_FULL}`}</span>
              </p>
              <span className="mt-0.5 flex gap-0.5">
                {Array.from({ length: DOSSIER_FULL }, (_, i) => (
                  <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < n ? (n >= DOSSIER_FULL ? "var(--color-brass)" : "var(--pole-esprit)") : "var(--hairline)" }} />
                ))}
              </span>
            </li>
          ))}
      </ul>
      {closed.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <Classified need={3}>
            {closed.length} dossier{closed.length > 1 ? "s" : ""} de faction réservé{closed.length > 1 ? "s" : ""} au Cercle.
          </Classified>
          {clearance(state) >= 2 && (
            <ul className="space-y-1">
              {closed.map(({ f }) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{f.name}</span>
                  <RequestButton state={state} kind="faction" target={f.id} onChange={onChange} label="Profil" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const NEMESIS_STATUS: Record<Nemesis["status"], { label: string; className: string }> = {
  libre: { label: "en liberté", className: "text-fail" },
  capture: { label: "capturé", className: "text-success" },
  mort: { label: "mort", className: "text-faint" },
};

function Nemeses({ state }: { state: GameState }) {
  const list = [...state.world.geo.nemeses].sort((a, b) => Number(a.status !== "libre") - Number(b.status !== "libre") || b.grudge - a.grudge);
  return (
    <section>
      <h3 className="label mb-1">Némésis</h3>
      <p className="mb-3 text-xs text-muted">Ceux qui t'ont échappé se souviennent. Ils montent en puissance, reviennent, et s'en prennent parfois à tes proches.</p>
      {list.length === 0 ? (
        <p className="text-sm text-faint italic">Personne ne t'en veut encore personnellement.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const st = NEMESIS_STATUS[n.status];
            return (
              <li key={n.id} className={`rounded-sm border p-2.5 ${n.status === "libre" ? "border-fail/40 bg-fail/[0.04]" : "border-line opacity-70"}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-base">{n.name}</span>
                  <span className={`text-[10px] tracking-[0.12em] uppercase ${st.className}`}>{st.label}</span>
                </p>
                <p className="text-[11px] text-muted">
                  {n.title} · {n.agency ? AGENCIES[n.agency].name : findFaction(n.faction)?.name}
                </p>
                <p className="mt-1 text-xs text-ivory/80">{n.history}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-faint">
                  <span>niveau {"◆".repeat(n.level)}</span>
                  <span>rancune {n.grudge}</span>
                  <span>
                    {n.encounters} rencontre{n.encounters > 1 ? "s" : ""}
                  </span>
                  <span>vu à {findCity(n.cityId)?.name ?? "?"} (J{n.lastDay})</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Ce que l'on sait des Cercles : qui siège, qui est en mission, qui est tombé. */
function Rivals({ state }: { state: GameState }) {
  return (
    <section>
      <h3 className="label mb-1">Les trois Cercles</h3>
      <p className="mb-3 text-xs text-muted">Les titulaires des autres agences mènent leurs propres missions : on les croise, on se double, on échange des prisonniers au Conseil des Trois.</p>
      <ul className="grid gap-3 md:grid-cols-3">
        {AGENCY_IDS.map((a) => {
          const def = AGENCIES[a];
          const members = state.roster.filter((o) => o.agency === a && o.role === "titulaire");
          const seated = members.filter((o) => o.status !== "mort" && o.status !== "retraite" && o.status !== "disparu");
          const away = seated.filter((o) => o.status === "en_mission").length;
          const hurt = seated.filter((o) => o.status === "blesse").length;
          const fallen = members.filter((o) => o.status === "mort" || o.status === "disparu").length;
          const playerSeat = a === state.character.identity.agency && state.character.seat ? 1 : 0;
          if (!circleVisible(state, a))
            return (
              <li key={a}>
                <p className="mb-1 font-serif text-lg" style={{ color: def.color }}>
                  {def.circle.name.replace(/^./, (x) => x.toUpperCase())}
                </p>
                <Classified need={4} />
              </li>
            );
          return (
            <li key={a} className="rounded-sm border border-line bg-panel/50 p-3">
              <p className="font-serif text-lg" style={{ color: def.color }}>
                {def.circle.name.replace(/^./, (x) => x.toUpperCase())}
              </p>
              <p className="text-[11px] text-muted">
                {seated.length + playerSeat}/{def.seats.length} {def.circle.seatTerm.plural} occupés · {away} en mission
                {hurt ? ` · ${hurt} blessé${hurt > 1 ? "s" : ""}` : ""}
                {fallen ? ` · ${fallen} tombé${fallen > 1 ? "s" : ""}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
