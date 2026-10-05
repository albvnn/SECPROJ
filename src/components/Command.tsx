"use client";

import { useState } from "react";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { HQ_MODULES, RESEARCHABLE, SQUAD_SIZE, STATION_MODULES, buyModule, openStation, openTheatre, setBranchBudget, setPosture, setSquad, startProject, upgradeHq } from "@/lib/game/command";
import { RELATION_LIMIT, applyUpdate, recordProgress } from "@/lib/game/engine";
import { GADGETS } from "@/lib/game/gadgets";
import { assetCap } from "@/lib/game/planner";
import { OPERATIVE_TRAITS, operativeTitle } from "@/lib/game/roster";
import { RANKS, SKILLS, can, formatEuros, type Capability } from "@/lib/game/rules";
import type { AgencyId, GameState, HqModule, Operative, OperativeRole, RankId, StationModule } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { CITIES, REGION_IDS, REGIONS, findCity, findCountry, type RegionId } from "@/lib/world/geo";
import { SeatSigil } from "./sigils";
import { AskPerson, Classified, RequestButton } from "./IntelUI";
import { circleVisible, operativeKnown, operativeListed } from "@/lib/game/intel";
import { RankBadge } from "./ui";

function ago(day: number, now: number) {
  const d = now - day;
  return d <= 0 ? "aujourd'hui" : d < 7 ? `il y a ${d} j` : d < 60 ? `il y a ${Math.round(d / 7)} sem.` : `il y a ${Math.round(d / 30)} mois`;
}

/* ------------------------------------------------------------------ */
/* Équipe                                                              */
/* ------------------------------------------------------------------ */

export function TeamPanel({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const me = state.character.identity.agency;
  const cadet = state.character.rank === "aspirant" || state.character.rank === "prospect";
  const [tab, setTab] = useState<AgencyId | "chambree">(cadet ? "chambree" : me);
  const [onlyFree, setOnlyFree] = useState(false);
  const [role, setRole] = useState<OperativeRole | "tous">("tous");
  const trainsSeconds = can(state.character.rank, "seconds");
  const [error, setError] = useState<string | null>(null);
  const list = state.roster
    .filter((o) => (tab === "chambree" ? o.agency === me && o.role === "cadet" : o.agency === tab && o.role !== "cadet"))
    .filter((o) => tab === "chambree" || role === "tous" || o.role === role || (role === "officier" && o.rank === "chef_station"))
    .filter((o) => !onlyFree || o.status === "apte")
    .sort((a, b) => b.missionsWithPlayer - a.missionsWithPlayer || b.affinity - a.affinity);
  const listed = list.filter((o) => operativeListed(state, o));
  const unseen = list.length - listed.length;

  const toggleSquad = (id: string) => {
    if (!onChange) return;
    const squad = state.command.squad.includes(id) ? state.command.squad.filter((x) => x !== id) : [...state.command.squad, id].slice(0, SQUAD_SIZE);
    try {
      onChange(setSquad(state, squad));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible.");
    }
  };

  const keep = (o: Operative) => {
    if (!onChange) return;
    const r = applyUpdate(state, {
      relations: [
        {
          nom: o.codename ? `${o.name} « ${o.codename} »` : o.name,
          role: o.role === "cadet" ? `cadet de l'Académie (${o.nationality})` : `${operativeTitle(o)} (${AGENCIES[o.agency].name})`,
          type: o.agency === me ? "equipier" : "contact",
          affinite: o.affinity,
          lieu: findCity(o.cityId)?.name,
          note: `${OPERATIVE_TRAITS[o.trait]?.label} : ${OPERATIVE_TRAITS[o.trait]?.description}`,
        },
      ],
    });
    if (r.rejected.length) setError(r.rejected[0]);
    else onChange(recordProgress(r.state, r.notices));
  };
  const known = new Set(state.relations.map((r) => r.name.split(" « ")[0]));
  const circle = tab === "chambree" ? null : AGENCIES[tab];
  const room = state.relations.filter((r) => r.status !== "archive" && r.status !== "mort").length < RELATION_LIMIT;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {cadet && <TabBtn on={tab === "chambree"} onClick={() => setTab("chambree")} label="Ta chambrée" />}
        {AGENCY_IDS.map((a) => (
          <TabBtn key={a} on={tab === a} onClick={() => setTab(a)} label={a === me ? `${AGENCIES[a].name} (toi)` : AGENCIES[a].name} color={AGENCIES[a].color} />
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> disponibles
        </label>
      </div>
      {tab !== me && tab !== "chambree" && (
        <p className="text-xs text-faint">Agents d'une agence rivale : leurs titulaires ont leurs propres missions, réussissent, échouent, meurent. Leur dernière position connue est sur la carte.</p>
      )}
      {tab === "chambree" && <p className="text-xs text-faint">Toute l'Académie : une dizaine de cadets de tous âges, qui seront peut-être tes équipiers… ou tes rivaux pour un siège.</p>}
      {circle && <CircleBoard state={state} agency={circle.id} />}
      {tab !== "chambree" && (
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["tous", "Tous"],
              ["titulaire", circle?.circle.name ?? "Le Cercle"],
              ["officier", "Stations"],
              ["soutien", "Branches"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setRole(id)} className={`rounded-sm px-2 py-0.5 text-[11px] ${role === id ? "bg-brass/20 text-brass-soft" : "text-muted hover:text-ivory"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {trainsSeconds && tab === me && (
        <p className="text-xs text-muted">
          Tes seconds : {state.command.squad.length}/{SQUAD_SIZE}. Clique sur ⚑ pour former un officier ; ils partent avec toi par défaut et s'entraînent dans ton planning.
        </p>
      )}
      {error && <p className="text-xs text-fail">{error}</p>}
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {listed.map((o) => {
          const filed = operativeKnown(state, o);
          const trait = OPERATIVE_TRAITS[o.trait];
          const city = findCity(o.cityId);
          const inSquad = state.command.squad.includes(o.id);
          const top = Object.entries(o.skills)
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .slice(0, 4);
          return (
            <li key={o.id} className={`rounded-sm border bg-panel/50 p-3 ${inSquad ? "border-brass" : "border-line"}`}>
              <div className="flex items-start gap-2.5">
                <RankBadge rank={o.rank} className="mt-0.5 h-7 w-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {o.codename && <span className="font-mono text-[11px] tracking-[0.15em] uppercase" style={{ color: AGENCIES[o.agency].color }}>« {o.codename} » </span>}
                    {o.name}
                  </p>
                  <p className="text-[11px] text-muted">
                    {o.nationality}, {o.age} ans · {operativeTitle(o)}
                  </p>
                </div>
                {trainsSeconds && tab === me && o.role === "officier" && onChange && (
                  <button onClick={() => toggleSquad(o.id)} title={inSquad ? "Retirer de l'escouade" : "Affecter à ton escouade"} className={`text-sm ${inSquad ? "text-brass" : "text-faint hover:text-ivory"}`}>
                    ⚑
                  </button>
                )}
              </div>
              {filed ? (
                <>
                  <p className="mt-2 flex flex-wrap gap-x-2.5 text-[11px] text-ivory/80">
                    {top.map(([k, v]) => (
                      <span key={k}>
                        {SKILLS[k as keyof typeof SKILLS].label} <span className="font-mono">{v}</span>
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-[11px] text-faint" title={trait?.description}>
                    {trait?.label} — {trait?.description}
                  </p>
                </>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-faint">
                  <span>Dossier non consulté.</span>
                  <RequestButton state={state} kind="agent" target={o.id} onChange={onChange} label="Sa fiche" />
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                <span className={o.status === "apte" ? "text-success" : o.status === "blesse" ? "text-fail" : "text-partial"}>
                  {o.status === "apte" ? "disponible" : o.status.replace("_", " ")}
                  {o.fatigue >= 50 ? ` · fatigue ${o.fatigue}` : ""}
                </span>
                <span className="text-faint">{filed ? `${city?.name ?? "?"} · ${ago(o.positionDay, state.world.day)}` : "position inconnue"}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <span className={o.affinity >= 20 ? "text-success" : o.affinity <= -20 ? "text-fail" : "text-muted"}>
                  affinité {o.affinity > 0 ? "+" : ""}
                  {o.affinity}
                  {o.missionsWithPlayer ? ` · ${o.missionsWithPlayer} mission${o.missionsWithPlayer > 1 ? "s" : ""} ensemble` : ""}
                </span>
                {o.agency !== me && o.affinity >= 20 && filed && <AskPerson state={state} source="rival" refId={o.id} onChange={onChange} />}
                {onChange && !known.has(o.name) && room && (o.missionsWithPlayer > 0 || o.role === "cadet" || o.affinity >= 25) && (
                  <button onClick={() => keep(o)} className="tracking-[0.1em] text-brass-soft uppercase hover:underline" title="L'ajouter à tes liens suivis">
                    + Garder le contact
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {listed.length === 0 && !unseen && <p className="text-sm text-faint italic">Personne.</p>}
      {unseen > 0 && (
        <Classified need={tab === me ? 4 : 5}>
          {tab === me
            ? `${unseen} membre${unseen > 1 ? "s" : ""} de l'agence dont tu ne connais pas le dossier.`
            : `${unseen} agent${unseen > 1 ? "s" : ""} de ${AGENCIES[tab as AgencyId].name} que tu n'as jamais croisé${unseen > 1 ? "s" : ""}. On ne connaît un rival qu'en mission, ou par une fiche demandée à l'analyse.`}
        </Classified>
      )}
    </div>
  );
}

/** Les sièges du Cercle d'une agence : qui y siège, lesquels sont vacants. */
function CircleBoard({ state, agency }: { state: GameState; agency: AgencyId }) {
  const a = AGENCIES[agency];
  const mine = agency === state.character.identity.agency;
  if (!circleVisible(state, agency))
    return (
      <Classified need={4}>
        {a.circle.name.replace(/^./, (x) => x.toUpperCase())} : qui siège, qui est vacant, qui est en mission. Réservé à l'accréditation Région.
      </Classified>
    );
  return (
    <section className="rounded-sm border p-3" style={{ borderColor: tint(a.color, 35), background: tint(a.color, 4) }}>
      <p className="label" style={{ color: a.color }}>
        {a.circle.name} · {a.seats.length} {a.circle.seatTerm.plural}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{a.circle.description}</p>
      <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {a.seats.map((s) => {
          const player = mine && state.character.seat === s.id;
          const holder = state.roster.find((o) => o.agency === agency && o.seat === s.id && o.status !== "mort" && o.status !== "retraite" && o.status !== "disparu");
          const since = state.command.vacantSince?.[`${agency}:${s.id}`];
          return (
            <li
              key={s.id}
              className="flex items-center gap-1.5 rounded-sm border px-1.5 py-1"
              style={{ borderColor: player ? a.color : "var(--color-line)", background: player ? tint(a.color, 12) : undefined }}
              title={`${s.name} — ${s.heritage}`}
            >
              <span style={{ color: a.color, opacity: holder || player ? 1 : 0.4 }}>
                <SeatSigil agency={agency} seat={s.id} number={s.number} className="h-8 w-8" />
              </span>
              <span className="min-w-0 text-[10px] leading-tight">
                <span className="block truncate text-ivory/90">{s.name.replace(/^le Banc d(?:e |')/, "")}</span>
                <span className={`block truncate ${player ? "" : holder ? "text-muted" : "text-partial"}`} style={player ? { color: a.color } : undefined}>
                  {player ? "toi" : holder ? `${holder.name.split(" ")[0]}${holder.status === "en_mission" ? " · en mission" : holder.status === "blesse" ? " · blessé" : ""}` : `vacant${since !== undefined ? ` · ${Math.max(0, Math.round((state.world.day - since) / 7))} sem.` : ""}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TabBtn({ on, onClick, label, color }: { on: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase ${on ? "border-brass bg-brass/10" : "border-line text-muted hover:text-ivory"}`}
      style={on && color ? { color } : undefined}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Commandement                                                        */
/* ------------------------------------------------------------------ */

const LADDER: { rank: RankId; cap?: Capability; title: string; text: string }[] = [
  { rank: "agent", title: "Toi-même", text: "Ton planning, tes légendes, ton équipement, ta solde, ta couverture civile, tes liens, et tes rapports avec les trois Branches." },
  { rank: "titulaire", cap: "informants", title: "Un réseau d'informateurs", text: "Recrute des sources dans les villes du monde : elles te donnent du renseignement de départ dans leur région. Paie-les, rencontre-les, ou perds-les." },
  { rank: "doyen", cap: "seconds", title: "Deux seconds", text: "Deux officiers que tu formes : ils partent avec toi et s'entraînent sous tes ordres. Leur fatigue, leur moral et leur loyauté deviennent les tiens." },
  { rank: "chef_station", cap: "station", title: "Une Station", text: "Une antenne secrète dans une vraie ville : budget mensuel, modules (planques, écoutes, atelier…), et des missions que tu peux confier à tes officiers." },
  { rank: "controleur", cap: "region", title: "Une région", text: "Tu traites les titulaires, tu supervises les Stations d'une région, sa posture (renseignement, action, discrétion), et tu commandes des projets au laboratoire." },
  { rank: "directeur", cap: "agency", title: "L'agence", text: "Le siège et ses modules, le budget des Branches, le crédit auprès des gouvernements, et la diplomatie avec les deux agences rivales." },
];

export function CommandPanel({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const rank = state.character.rank;
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => GameState) => {
    if (!onChange) return;
    try {
      setError(null);
      onChange(fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible.");
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="label mb-3">Ce que tu diriges</h3>
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {LADDER.map((l) => {
            const on = l.cap ? can(rank, l.cap) : RANKS[rank].order >= RANKS.agent.order;
            return (
              <li key={l.rank} className={`flex gap-2.5 rounded-sm border p-3 ${on ? "border-brass/50 bg-brass/5" : "border-line opacity-55"}`}>
                <RankBadge rank={l.rank} className="h-7 w-6 shrink-0" />
                <div>
                  <p className="text-sm">
                    {l.title} <span className="text-[10px] text-faint">· {RANKS[l.rank].label}</span>
                  </p>
                  <p className="text-[11px] leading-snug text-muted">{l.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      {error && <p className="text-sm text-fail">{error}</p>}

      {can(rank, "informants") && <Assets state={state} onChange={onChange} />}
      {can(rank, "station") && <StationSection state={state} run={run} />}
      {can(rank, "region") && <TheatreSection state={state} run={run} />}
      {can(rank, "agency") && <AgencySection state={state} run={run} />}
    </div>
  );
}

function Assets({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const list = state.command.assets;
  return (
    <section>
      <h3 className="label mb-2">
        Informateurs · {list.filter((a) => a.status === "actif").length}/{assetCap(state.character.rank)}
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucun. Recrute-les depuis ton planning (activité « Informateurs ») : choisis une ville, paie, entretiens.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className={`rounded-sm border p-3 ${a.status === "actif" ? "border-line bg-panel/50" : "border-fail/40 opacity-60"}`}>
              <p className="flex justify-between gap-2 text-sm">
                <span>{a.name}</span>
                <span className="font-mono text-[10px] text-muted">{formatEuros(a.cost)}/sem.</span>
              </p>
              <p className="text-[11px] text-muted">
                {a.role} · {findCity(a.cityId)?.name}
              </p>
              {a.status === "actif" && (
                <div className="mt-1 text-right">
                  <AskPerson state={state} source="informateur" refId={a.id} onChange={onChange} />
                </div>
              )}
              {a.status === "actif" ? (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-faint">
                  fiabilité
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full" style={{ width: `${a.reliability}%`, background: a.reliability >= 50 ? "var(--color-success)" : "var(--color-fail)" }} />
                  </span>
                  {a.reliability}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-fail">{a.status === "grille" ? "Grillé : il ne répond plus." : "Retourné par l'ennemi."}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StationSection({ state, run }: { state: GameState; run: (fn: () => GameState) => void }) {
  const st = state.command.station;
  const [city, setCity] = useState("");
  if (!st) {
    const own = AGENCIES[state.character.identity.agency].stations;
    const cities = CITIES.filter((c) => own.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return (
      <section>
        <h3 className="label mb-2">Station</h3>
        <p className="mb-2 text-sm text-muted">Choisis la Station de l'agence que tu diriges : ses missions, ses écoutes et ses planques serviront toute sa région.</p>
        <div className="flex flex-wrap gap-2">
          <select className="field max-w-xs py-1.5 text-sm" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Choisir une ville…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {findCountry(c.country)?.name}
              </option>
            ))}
          </select>
          <button disabled={!city} onClick={() => run(() => openStation(state, city))} className="btn btn-primary">
            Prendre la Station
          </button>
        </div>
      </section>
    );
  }
  const c = findCity(st.cityId);
  return (
    <section>
      <h3 className="label mb-2">Station de {c?.name}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Budget du mois" value={formatEuros(st.budget)} />
        <Stat label="Renseignement régional" value={`${st.intel}/10`} />
        <Stat label="Discrétion" value={`${st.cover}/100`} />
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(STATION_MODULES) as StationModule[]).map((m) => {
          const def = STATION_MODULES[m];
          const owned = st.modules.includes(m);
          return (
            <li key={m} className={`rounded-sm border p-3 ${owned ? "border-brass/60 bg-brass/5" : "border-line bg-panel/50"}`}>
              <p className="flex justify-between gap-2 text-sm">
                {def.label}
                {owned ? <span className="text-[10px] text-brass">installé</span> : <span className="font-mono text-[10px] text-muted">{formatEuros(def.cost)}</span>}
              </p>
              <p className="text-[11px] text-muted">{def.effect}</p>
              {!owned && (
                <button disabled={st.budget < def.cost} onClick={() => run(() => buyModule(state, m))} className="mt-2 text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline disabled:opacity-40">
                  Installer
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-faint">
        Le budget se renouvelle chaque mois (selon la satisfaction des gouvernements). Depuis le tableau des missions, tu peux confier un dossier à tes officiers sans y aller.
      </p>
    </section>
  );
}

function TheatreSection({ state, run }: { state: GameState; run: (fn: () => GameState) => void }) {
  const th = state.command.theatre;
  const [region, setRegion] = useState<RegionId | "">("");
  if (!th)
    return (
      <section>
        <h3 className="label mb-2">Région supervisée</h3>
        <div className="flex flex-wrap gap-2">
          <select className="field max-w-xs py-1.5 text-sm" value={region} onChange={(e) => setRegion(e.target.value as RegionId)}>
            <option value="">Choisir une région…</option>
            {REGION_IDS.map((r) => (
              <option key={r} value={r}>
                {REGIONS[r].label}
              </option>
            ))}
          </select>
          <button disabled={!region} onClick={() => run(() => openTheatre(state, region as RegionId))} className="btn btn-primary">
            Prendre le commandement
          </button>
        </div>
      </section>
    );
  const researchable = RESEARCHABLE().filter((g) => !state.command.unlocked.includes(g.id) && !th.projects.some((p) => p.gadget === g.id));
  return (
    <section>
      <h3 className="label mb-2">Région : {REGIONS[th.region as RegionId]?.label}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Budget" value={formatEuros(th.budget)} />
        <Stat label="Stations" value={th.stations.map((s) => findCity(s)?.name).join(", ")} />
        <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
          <p className="label">Posture</p>
          <div className="mt-1 flex gap-1">
            {(["renseignement", "action", "discretion"] as const).map((p) => (
              <button key={p} onClick={() => run(() => setPosture(state, p))} className={`rounded-sm px-1.5 py-0.5 text-[10px] ${th.posture === p ? "bg-brass text-ink" : "text-muted hover:text-ivory"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <h4 className="label mt-4 mb-2">Recherche</h4>
      <ul className="space-y-1.5">
        {th.projects.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{GADGETS.find((g) => g.id === p.gadget)?.name}</span>
            <span className="h-1 w-24 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-brass" style={{ width: `${(p.progress / p.required) * 100}%` }} />
            </span>
            <span className="font-mono text-[10px] text-muted">
              {p.progress}/{p.required}
            </span>
          </li>
        ))}
        {state.command.unlocked.map((id) => (
          <li key={id} className="text-sm text-success">
            ✓ {GADGETS.find((g) => g.id === id)?.name}
          </li>
        ))}
      </ul>
      {researchable.length > 0 && th.projects.length < 2 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {researchable.map((g) => (
            <button key={g.id} onClick={() => run(() => startProject(state, g.id))} className="rounded-sm border border-line px-2 py-1 text-[11px] text-muted hover:border-brass hover:text-ivory" title={`${g.description} (250 000 €)`}>
              + {g.name}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-faint">Les projets du laboratoire avancent avec l'activité « Région » de ton planning.</p>
    </section>
  );
}

function AgencySection({ state, run }: { state: GameState; run: (fn: () => GameState) => void }) {
  const ag = state.command.agency;
  if (!ag) return null;
  const agency = AGENCIES[state.character.identity.agency];
  return (
    <section>
      <h3 className="label mb-2">L'agence</h3>
      <p className="mb-3 text-sm">
        Crédit auprès des gouvernements : <span className="font-mono text-brass-soft">{ag.councilFavor}/100</span>
      </p>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(HQ_MODULES) as HqModule[]).map((m) => (
          <li key={m} className="rounded-sm border border-line bg-panel/50 p-3">
            <p className="flex justify-between text-sm">
              {HQ_MODULES[m].label}
              <span className="font-mono text-[11px] text-brass">niv. {ag.hq[m]}</span>
            </p>
            <p className="text-[11px] text-muted">{HQ_MODULES[m].effect}</p>
            {ag.hq[m] < 5 && (
              <button onClick={() => run(() => upgradeHq(state, m))} className="mt-1.5 text-[10px] font-semibold tracking-[0.12em] text-brass-soft uppercase hover:underline">
                Améliorer ({10 * ag.hq[m]} de crédit)
              </button>
            )}
          </li>
        ))}
      </ul>
      <h4 className="label mt-4 mb-2">Budget des Branches (M€ / mois)</h4>
      <ul className="space-y-2">
        {agency.branches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 text-sm">
            <span className="w-36 truncate" style={{ color: agency.color }} title={b.role}>
              {b.name}
            </span>
            <input type="range" min={5} max={80} value={ag.branchBudget[b.id] ?? 30} onChange={(e) => run(() => setBranchBudget(state, b.id, Number(e.target.value)))} className="flex-1 accent-[var(--color-brass)]" />
            <span className="w-10 text-right font-mono text-xs">{ag.branchBudget[b.id] ?? 30}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line bg-panel/50 px-3 py-2">
      <p className="label">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

export { tint };
