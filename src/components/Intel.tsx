"use client";

import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { RANKS } from "@/lib/game/rules";
import type { GameState, Nemesis, Threat } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { FACTIONS, findFaction } from "@/lib/world/factions";
import { REGIONS, findCity, type RegionId } from "@/lib/world/geo";
import { DOSSIER_FULL, fundingFactor, satisfactionOf } from "@/lib/world/threats";
import { diplomacyBetween, diplomacyLabel } from "@/lib/world/world";

/**
 * Le monde vivant, vu du bureau d'analyse : les menaces qui avancent, les dossiers par faction,
 * les ennemis nommés, ce que les gouvernements pensent de chaque agence, et ce que font les rivales.
 */
export function IntelBoard({ state }: { state: GameState }) {
  const cadet = RANKS[state.character.rank].order < RANKS.agent.order;
  return (
    <div className="space-y-8">
      <Satisfaction state={state} />
      <Threats state={state} />
      <div className="grid gap-8 lg:grid-cols-2">
        <Dossiers state={state} />
        <Nemeses state={state} />
      </div>
      <Rivals state={state} />
      {cadet && <p className="text-[11px] text-faint">Cadet, tu n'as accès qu'à ce que les instructeurs laissent filtrer. Les menaces encore à l'état de rumeur ne disent rien de plus.</p>}
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

function Threats({ state }: { state: GameState }) {
  const geo = state.world.geo;
  const list = [...geo.threats].sort((a, b) => Number(b.capstone ?? 0) - Number(a.capstone ?? 0) || Number(b.known) - Number(a.known) || b.progress - a.progress);
  return (
    <section>
      <h3 className="label mb-1">Menaces en cours · {list.length}</h3>
      <p className="mb-3 text-xs text-muted">Chaque faction avance semaine après semaine. Ignorée, une menace frappe à 100 : une dépêche, une région qui s'embrase, des gouvernements mécontents.</p>
      {list.length === 0 ? (
        <p className="text-sm text-faint italic">Calme plat. Ça ne dure jamais.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((t) => (
            <ThreatCard key={t.id} state={state} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ThreatCard({ state, t }: { state: GameState; t: Threat }) {
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
      {offered && <p className="mt-1 text-[10px] text-brass-soft">Un dossier sur cette menace t'attend aux Opérations.</p>}
    </li>
  );
}

function Dossiers({ state }: { state: GameState }) {
  const geo = state.world.geo;
  const day = state.world.day;
  const rows = FACTIONS.map((f) => ({ f, n: geo.dossiers?.[f.id] ?? 0, dormant: (geo.dormant?.[f.id] ?? 0) > day ? geo.dormant[f.id] : 0 })).sort((a, b) => b.n - a.n || a.f.name.localeCompare(b.f.name, "fr"));
  return (
    <section>
      <h3 className="label mb-1">Dossiers de renseignement</h3>
      <p className="mb-3 text-xs text-muted">
        Objectifs secondaires, informateurs et dilemmes y ajoutent des pièces. À {DOSSIER_FULL}/{DOSSIER_FULL}, l'opération décisive contre la tête de la faction devient possible ; décapitée, elle se tait un temps.
      </p>
      <ul className="space-y-1.5">
        {rows.map(({ f, n, dormant }) => (
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
