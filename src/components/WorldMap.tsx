"use client";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo, useRef, useState } from "react";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { MISSION_IMPORTANCE } from "@/lib/game/rules";
import type { AgencyId, GameState } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import {
  BLOCS,
  CITIES,
  COUNTRIES,
  FAR_EAST_OUTLINE,
  REGION_IDS,
  REGIONS,
  RESOURCES,
  countryOfShape,
  findCity,
  findCountry,
  type CityDef,
  type CountryDef,
  type ResourceId,
} from "@/lib/world/geo";
import { diplomacyBetween, diplomacyLabel, tensionLabel } from "@/lib/world/world";

const W = 1000;
const H = 520;

type Layer = "blocs" | "tensions" | "ressources";
type Selection = { kind: "country"; id: string } | { kind: "city"; id: string } | null;

interface Shape {
  id: string;
  d: string;
}

/** Formes des pays, calculées une fois : la Confédération du Sahel fusionne trois pays. */
function useShapes() {
  return useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
    const all = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
    const sahel = ["466", "854", "562"];
    const features: Feature<Geometry, { name: string }>[] = all.filter((f) => f.id !== "010" && !sahel.includes(String(f.id)));
    const merged = merge(
      topo,
      topo.objects.countries.geometries.filter((g) => sahel.includes(String(g.id))) as never,
    );
    features.push({ type: "Feature", id: "SAH", properties: { name: "Sahel" }, geometry: merged });
    const projection = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [W - 4, H - 4],
      ],
      { type: "FeatureCollection", features },
    );
    const path = geoPath(projection);
    const shapes: Shape[] = features.map((f) => ({ id: String(f.id), d: path(f) ?? "" }));
    const farEast = `M${FAR_EAST_OUTLINE.map((p) => projection(p)!.map((n) => n.toFixed(1)).join(",")).join("L")}Z`;
    const graticule = path({ type: "Sphere" }) ?? "";
    return { shapes, project: (lat: number, lon: number) => projection([lon, lat]) ?? [0, 0], farEast, graticule };
  }, []);
}

/* ------------------------------------------------------------------ */
/* Ce qui se trouve dans chaque ville                                  */
/* ------------------------------------------------------------------ */

interface CityInfo {
  city: CityDef;
  player: boolean;
  hq: AgencyId[];
  academy: AgencyId[];
  mission: boolean;
  offers: string[];
  relations: { name: string; kind: string; day?: number }[];
  agents: { name: string; codename: string; agency: AgencyId; day: number; status: string }[];
  assets: string[];
  station: boolean;
}

function cityInfos(state: GameState): Map<string, CityInfo> {
  const map = new Map<string, CityInfo>();
  const get = (id: string) => {
    const city = findCity(id);
    if (!city) return null;
    if (!map.has(id))
      map.set(id, { city, player: false, hq: [], academy: [], mission: false, offers: [], relations: [], agents: [], assets: [], station: false });
    return map.get(id)!;
  };
  for (const a of AGENCY_IDS) {
    get(AGENCIES[a].hqCity)?.hq.push(a);
    get(AGENCIES[a].academyCity)?.academy.push(a);
  }
  const p = get(state.world.cityId);
  if (p) p.player = true;
  if (state.mission) {
    const m = get(state.mission.cityId);
    if (m) m.mission = true;
  }
  for (const o of state.offers) get(o.cityId)?.offers.push(o.title.split(" — ")[0]);
  for (const r of state.relations) if (r.cityId && r.status !== "archive" && r.status !== "mort") get(r.cityId)?.relations.push({ name: r.name, kind: r.kind, day: r.positionDay });
  const agency = state.character.identity.agency;
  for (const o of state.roster)
    if (o.status !== "mort" && (o.agency === agency || o.missionsWithPlayer > 0))
      get(o.cityId)?.agents.push({ name: o.name, codename: o.codename, agency: o.agency, day: o.positionDay, status: o.status });
  for (const a of state.command.assets) if (a.status === "actif") get(a.cityId)?.assets.push(`${a.name}, ${a.role}`);
  if (state.command.station) {
    const s = get(state.command.station.cityId);
    if (s) s.station = true;
  }
  return map;
}

const RELATION_COLORS: Record<string, string> = {
  proche: "var(--pole-ame)",
  mentor: "var(--color-brass)",
  equipier: "var(--pole-esprit)",
  allie: "var(--color-success)",
  contact: "var(--color-muted)",
  rival: "var(--color-partial)",
  ennemi: "var(--color-fail)",
};

/* ------------------------------------------------------------------ */
/* Carte                                                               */
/* ------------------------------------------------------------------ */

export function WorldMap({ state }: { state: GameState }) {
  const { shapes, project, farEast, graticule } = useShapes();
  const [layer, setLayer] = useState<Layer>("blocs");
  const [resource, setResource] = useState<ResourceId>("terres_rares");
  const [show, setShow] = useState({ people: true, agents: true, ops: true });
  const [sel, setSel] = useState<Selection>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const geo = state.world.geo;
  const infos = useMemo(() => cityInfos(state), [state]);
  const agency = state.character.identity.agency;

  const fill = (c: CountryDef | undefined) => {
    if (!c) return "var(--map-land)";
    if (layer === "blocs") return c.bloc === "neutre" ? "var(--map-land)" : tint(BLOCS[c.bloc].color, c.bloc === agency ? 80 : 55);
    if (layer === "tensions") {
      const t = geo.tensions[c.region] ?? 50;
      return `color-mix(in srgb, var(--heat-high) ${t}%, var(--heat-low))`;
    }
    return c.resources.includes(resource) ? tint("var(--color-brass)", 80) : "var(--map-land)";
  };

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * H];
  };
  const zoomAt = (px: number, py: number, factor: number) =>
    setView((v) => {
      const k = Math.max(1, Math.min(10, v.k * factor));
      if (k === 1) return { k: 1, x: 0, y: 0 };
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const scale = 1 / view.k;
  const selected = sel?.kind === "country" ? findCountry(sel.id) : undefined;
  const selectedCity = sel?.kind === "city" ? infos.get(sel.id) ?? (findCity(sel.id) ? { ...emptyInfo(findCity(sel.id)!) } : undefined) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-[300px] flex-1 overflow-hidden" style={{ background: "var(--map-ocean)" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full touch-none select-none"
          preserveAspectRatio="xMidYMid meet"
          onWheel={(e) => {
            const [px, py] = toSvg(e.clientX, e.clientY);
            zoomAt(px, py, e.deltaY < 0 ? 1.25 : 0.8);
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || view.k === 1) return;
            const r = svgRef.current!.getBoundingClientRect();
            const dx = ((e.clientX - d.x) / r.width) * W;
            const dy = ((e.clientY - d.y) / r.height) * H;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
          }}
          onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        >
          <defs>
            <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--bloc-hostile)" strokeWidth="1.4" />
            </pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <path d={graticule} fill="none" stroke="var(--hairline)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            {shapes.map((s) => {
              const c = countryOfShape(s.id);
              const active = (sel?.kind === "country" && c?.id === sel.id) || (selectedCity && c?.id === selectedCity.city.country);
              return (
                <path
                  key={s.id}
                  d={s.d}
                  fill={fill(c)}
                  stroke={active ? "var(--color-brass)" : "var(--map-border)"}
                  strokeWidth={active ? 1.6 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer transition-[fill] duration-300 hover:brightness-125"
                  onClick={() => !drag.current?.moved && c && setSel({ kind: "country", id: c.id })}
                >
                  <title>{c ? `${c.name} — ${BLOCS[c.bloc].label}` : ""}</title>
                </path>
              );
            })}
            {/* La République d'Extrême-Orient, taillée dans la Russie. */}
            <path
              d={farEast}
              fill={layer === "blocs" ? tint(BLOCS.gris.color, 75) : "url(#hatch)"}
              stroke="var(--bloc-gris)"
              strokeDasharray="3 2"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={() => !drag.current?.moved && setSel({ kind: "country", id: "EXO" })}
            >
              <title>République d'Extrême-Orient — Zone grise</title>
            </path>
            {/* Micro-États et entités sans forme. */}
            {COUNTRIES.filter((c) => c.marker).map((c) => {
              const [x, y] = project(c.marker![0], c.marker![1]);
              return (
                <rect
                  key={c.id}
                  x={x - 2.5 * scale}
                  y={y - 2.5 * scale}
                  width={5 * scale}
                  height={5 * scale}
                  transform={`rotate(45 ${x} ${y})`}
                  fill={fill(c)}
                  stroke="var(--map-border)"
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onClick={() => !drag.current?.moved && setSel({ kind: "country", id: c.id })}
                >
                  <title>{c.name}</title>
                </rect>
              );
            })}
            {/* Marqueurs des villes. */}
            {[...infos.values()].map((info) => (
              <CityMarker key={info.city.id} info={info} project={project} scale={scale} show={show} agency={agency} onClick={() => !drag.current?.moved && setSel({ kind: "city", id: info.city.id })} />
            ))}
          </g>
        </svg>

        {/* Commandes */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <div className="flex overflow-hidden rounded-sm border border-line bg-panel/90 backdrop-blur">
            {(["blocs", "tensions", "ressources"] as Layer[]).map((l) => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={`px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase ${layer === l ? "bg-brass/20 text-brass-soft" : "text-muted hover:text-ivory"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {layer === "ressources" && (
            <div className="flex max-w-[22rem] flex-wrap gap-1 rounded-sm border border-line bg-panel/90 p-1.5 backdrop-blur">
              {(Object.keys(RESOURCES) as ResourceId[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setResource(r)}
                  className={`rounded-sm px-1.5 py-0.5 text-[10px] ${resource === r ? "bg-brass text-ink" : "text-muted hover:text-ivory"}`}
                >
                  {RESOURCES[r].icon} {RESOURCES[r].label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 rounded-sm border border-line bg-panel/90 p-1 backdrop-blur">
            {(
              [
                ["people", "Liens"],
                ["agents", "Agents"],
                ["ops", "Opérations"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                className={`rounded-sm px-2 py-1 text-[10px] tracking-wide ${show[k] ? "bg-ivory/10 text-ivory" : "text-faint line-through"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-sm border border-line bg-panel/90 backdrop-blur">
          <button onClick={() => zoomAt(W / 2, H / 2, 1.5)} className="px-2.5 py-1 text-sm text-muted hover:text-ivory" aria-label="Zoomer">
            +
          </button>
          <button onClick={() => zoomAt(W / 2, H / 2, 1 / 1.5)} className="border-t border-line px-2.5 py-1 text-sm text-muted hover:text-ivory" aria-label="Dézoomer">
            −
          </button>
          <button onClick={() => setView({ k: 1, x: 0, y: 0 })} className="border-t border-line px-2.5 py-1 text-[10px] text-muted hover:text-ivory" aria-label="Recentrer">
            ⟲
          </button>
        </div>
        <Legend layer={layer} />
      </div>

      <aside className="scrollbar-thin max-h-[45vh] w-full shrink-0 overflow-y-auto border-t border-line bg-panel/60 p-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
        {selected ? (
          <CountryPanel state={state} country={selected} infos={infos} onCity={(id) => setSel({ kind: "city", id })} onBack={() => setSel(null)} />
        ) : selectedCity ? (
          <CityPanel state={state} info={selectedCity} onCountry={(id) => setSel({ kind: "country", id })} onBack={() => setSel(null)} />
        ) : (
          <WorldPanel state={state} />
        )}
      </aside>
    </div>
  );
}

function emptyInfo(city: CityDef): CityInfo {
  return { city, player: false, hq: [], academy: [], mission: false, offers: [], relations: [], agents: [], assets: [], station: false };
}

function CityMarker({
  info,
  project,
  scale,
  show,
  agency,
  onClick,
}: {
  info: CityInfo;
  project: (lat: number, lon: number) => [number, number];
  scale: number;
  show: { people: boolean; agents: boolean; ops: boolean };
  agency: AgencyId;
  onClick: () => void;
}) {
  const [x, y] = project(info.city.lat, info.city.lon);
  const s = scale;
  const parts: React.ReactNode[] = [];
  const label: string[] = [info.city.name];
  for (const a of [...info.hq, ...info.academy]) {
    const isHq = info.hq.includes(a);
    parts.push(
      <rect
        key={`${a}-${isHq}`}
        x={x - 3.2 * s}
        y={y - 3.2 * s}
        width={6.4 * s}
        height={6.4 * s}
        transform={`rotate(45 ${x} ${y})`}
        fill={a === agency ? AGENCIES[a].color : "none"}
        stroke={AGENCIES[a].color}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
        opacity={a === agency ? 1 : 0.6}
      />,
    );
    label.push(`${isHq ? "Siège" : "Académie"} de ${AGENCIES[a].name}`);
  }
  if (show.ops && (info.mission || info.offers.length)) {
    parts.push(
      <g key="ops" stroke="var(--color-fail)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" fill="none">
        <circle cx={x} cy={y} r={6 * s} vectorEffect="non-scaling-stroke" />
        <path d={`M${x - 9 * s},${y}H${x - 3 * s}M${x + 3 * s},${y}H${x + 9 * s}M${x},${y - 9 * s}V${y - 3 * s}M${x},${y + 3 * s}V${y + 9 * s}`} vectorEffect="non-scaling-stroke" />
      </g>,
    );
    if (info.mission) label.push("Mission en cours");
    for (const o of info.offers) label.push(`Mission proposée : ${o}`);
  }
  if (show.ops && info.station) {
    parts.push(<rect key="st" x={x + 4 * s} y={y - 9 * s} width={5 * s} height={5 * s} fill="var(--color-brass)" />);
    label.push("Ton antenne");
  }
  if (show.ops && info.assets.length) {
    parts.push(<path key="as" d={`M${x - 8 * s},${y + 8 * s}l${3 * s},${-5 * s}l${3 * s},${5 * s}z`} fill="var(--color-partial)" />);
    label.push(...info.assets.map((a) => `Informateur : ${a}`));
  }
  if (show.agents && info.agents.length) {
    parts.push(
      <g key="ag">
        <rect x={x + 3 * s} y={y + 3 * s} width={6 * s} height={6 * s} rx={1 * s} fill="var(--pole-esprit)" opacity={0.85} />
        {info.agents.length > 1 && (
          <text x={x + 6 * s} y={y + 7.6 * s} fontSize={4.5 * s} textAnchor="middle" fill="white" fontWeight={700}>
            {info.agents.length}
          </text>
        )}
      </g>,
    );
    label.push(`${info.agents.length} agent${info.agents.length > 1 ? "s" : ""}`);
  }
  if (show.people && info.relations.length) {
    info.relations.slice(0, 4).forEach((r, i) => {
      parts.push(<circle key={`r${i}`} cx={x - 6 * s - i * 3 * s} cy={y - 6 * s} r={2.4 * s} fill={RELATION_COLORS[r.kind] ?? "var(--color-muted)"} stroke="var(--map-border)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />);
    });
    label.push(...info.relations.map((r) => r.name));
  }
  if (info.player) {
    parts.push(
      <g key="me">
        <circle cx={x} cy={y} r={3} fill="none" stroke="var(--color-brass)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="map-pulse" />
        <circle cx={x} cy={y} r={3 * s} fill="var(--color-brass)" stroke="var(--map-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>,
    );
    label.splice(1, 0, "Tu es ici");
  }
  if (parts.length === 0) return null;
  return (
    <g className="cursor-pointer" onClick={onClick}>
      <title>{label.join("\n")}</title>
      <circle cx={x} cy={y} r={10 * s} fill="transparent" />
      {parts}
    </g>
  );
}

function Legend({ layer }: { layer: Layer }) {
  return (
    <div className="absolute bottom-3 left-3 hidden flex-wrap gap-x-3 gap-y-1 rounded-sm border border-line bg-panel/90 px-2.5 py-1.5 text-[10px] text-muted backdrop-blur sm:flex">
      {layer === "blocs" &&
        (Object.keys(BLOCS) as (keyof typeof BLOCS)[]).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: b === "neutre" ? "var(--map-land)" : BLOCS[b].color }} />
            {BLOCS[b].label}
          </span>
        ))}
      {layer === "tensions" && (
        <span className="flex items-center gap-1.5">
          calme
          <span className="h-2 w-20 rounded-full" style={{ background: "linear-gradient(90deg, var(--heat-low), var(--heat-high))" }} />
          explosive
        </span>
      )}
      {layer === "ressources" && <span>Les pays dorés possèdent la ressource choisie.</span>}
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-brass" /> toi
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm" style={{ background: "var(--pole-esprit)" }} /> agents
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--pole-ame)" }} /> liens
      </span>
      <span className="flex items-center gap-1 text-fail">⌖ opérations</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneaux                                                            */
/* ------------------------------------------------------------------ */

function ago(day: number | undefined, now: number) {
  if (day === undefined) return "";
  const d = now - day;
  return d <= 0 ? "aujourd'hui" : d < 7 ? `il y a ${d} j` : d < 60 ? `il y a ${Math.round(d / 7)} sem.` : `il y a ${Math.round(d / 30)} mois`;
}

function WorldPanel({ state }: { state: GameState }) {
  const geo = state.world.geo;
  const me = state.character.identity.agency;
  const pairs: [AgencyId, AgencyId][] = [
    ["argos", "meridian"],
    ["meridian", "monsoon"],
    ["argos", "monsoon"],
  ];
  return (
    <div className="space-y-6">
      <section>
        <h3 className="label mb-2">Relations entre agences</h3>
        <ul className="space-y-3">
          {pairs.map(([a, b]) => {
            const v = diplomacyBetween(geo.diplomacy, a, b);
            const l = diplomacyLabel(v);
            const mine = a === me || b === me;
            return (
              <li key={`${a}${b}`} className={mine ? "" : "opacity-70"}>
                <p className="flex items-baseline justify-between text-xs">
                  <span>
                    <span style={{ color: AGENCIES[a].color }}>{AGENCIES[a].name}</span> · <span style={{ color: AGENCIES[b].color }}>{AGENCIES[b].name}</span>
                  </span>
                  <span className={v >= 25 ? "text-success" : v <= -40 ? "text-fail" : "text-muted"}>{l.label}</span>
                </p>
                <div className="relative mt-1 h-1.5 rounded-full bg-line">
                  <span className="absolute top-[-2px] left-1/2 h-2.5 w-px bg-line-strong" />
                  <span
                    className="absolute top-0 h-full rounded-full"
                    style={{
                      left: v >= 0 ? "50%" : `${50 + v / 2}%`,
                      width: `${Math.abs(v) / 2}%`,
                      background: v >= 0 ? "var(--color-success)" : "var(--color-fail)",
                    }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-faint">{l.description}</p>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="label mb-2">Régions</h3>
        <ul className="space-y-1">
          {[...REGION_IDS]
            .sort((x, y) => (geo.tensions[y] ?? 0) - (geo.tensions[x] ?? 0))
            .map((r) => {
              const t = geo.tensions[r] ?? 50;
              return (
                <li key={r} className="flex items-center gap-2 text-xs" title={REGIONS[r].stakes}>
                  <span className="flex-1 truncate">{REGIONS[r].label}</span>
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
                    <span className="block h-full" style={{ width: `${t}%`, background: `color-mix(in srgb, var(--heat-high) ${t}%, var(--heat-low))` }} />
                  </span>
                  <span className="w-16 text-right text-[10px] text-muted">{tensionLabel(t)}</span>
                </li>
              );
            })}
        </ul>
      </section>
      <section>
        <h3 className="label mb-2">Dépêches</h3>
        {geo.news.length === 0 ? (
          <p className="text-xs text-faint italic">Rien d'inhabituel… pour l'instant.</p>
        ) : (
          <ul className="space-y-2">
            {geo.news.slice(0, 10).map((n, i) => (
              <li key={i} className={`border-l-2 pl-2 text-xs leading-snug ${n.player ? "border-brass text-ivory" : "border-line text-muted"}`}>
                <span className="font-mono text-[10px] text-faint">J{n.day} · {REGIONS[n.region as keyof typeof REGIONS]?.label ?? n.region}</span>
                <br />
                {n.text}
                {n.player && <span className="ml-1 text-[10px] text-brass">(ton œuvre)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CountryPanel({
  state,
  country,
  infos,
  onCity,
  onBack,
}: {
  state: GameState;
  country: CountryDef;
  infos: Map<string, CityInfo>;
  onCity: (id: string) => void;
  onBack: () => void;
}) {
  const bloc = BLOCS[country.bloc];
  const t = state.world.geo.tensions[country.region] ?? 50;
  const cities = CITIES.filter((c) => c.country === country.id);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[10px] tracking-[0.15em] text-faint uppercase hover:text-ivory">
        ← Le monde
      </button>
      <div>
        <h3 className="font-serif text-2xl leading-tight">{country.name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: country.bloc === "neutre" ? "var(--color-muted)" : bloc.color, background: tint(country.bloc === "neutre" ? "var(--color-muted)" : bloc.color, 15) }}>
            {bloc.label}
          </span>
          <span className="text-muted">{REGIONS[country.region].label}</span>
        </p>
      </div>
      {country.note && <p className="rounded-sm border-l-2 border-brass/60 bg-brass/5 py-1.5 pl-2.5 text-xs leading-relaxed text-ivory/85">{country.note}</p>}
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="label mb-1">Stabilité</dt>
          <dd className="h-1.5 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full" style={{ width: `${country.stability}%`, background: country.stability >= 60 ? "var(--color-success)" : country.stability >= 30 ? "var(--color-partial)" : "var(--color-fail)" }} />
          </dd>
        </div>
        <div>
          <dt className="label mb-1">Tension régionale</dt>
          <dd className="text-muted">
            {tensionLabel(t)} ({t}/100) — {REGIONS[country.region].stakes}
          </dd>
        </div>
        <div>
          <dt className="label mb-1">Ressources</dt>
          <dd className="flex flex-wrap gap-1">
            {country.resources.length ? (
              country.resources.map((r) => (
                <span key={r} className="rounded-sm bg-ivory/5 px-1.5 py-0.5 text-[11px]">
                  {RESOURCES[r].icon} {RESOURCES[r].label}
                </span>
              ))
            ) : (
              <span className="text-faint">—</span>
            )}
          </dd>
        </div>
      </dl>
      {cities.length > 0 && (
        <div>
          <h4 className="label mb-1.5">Villes</h4>
          <ul className="space-y-1">
            {cities.map((c) => {
              const info = infos.get(c.id);
              const n = info ? info.relations.length + info.agents.length + info.assets.length : 0;
              return (
                <li key={c.id}>
                  <button onClick={() => onCity(c.id)} className="flex w-full items-center justify-between rounded-sm px-1.5 py-1 text-left text-xs hover:bg-ivory/5">
                    <span>
                      {c.name}
                      {info?.player && <span className="ml-1.5 text-brass">● toi</span>}
                    </span>
                    {n > 0 && <span className="text-[10px] text-muted">{n} connu{n > 1 ? "s" : ""}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function CityPanel({ state, info, onCountry, onBack }: { state: GameState; info: CityInfo; onCountry: (id: string) => void; onBack: () => void }) {
  const country = findCountry(info.city.country);
  const now = state.world.day;
  const empty = !info.player && !info.relations.length && !info.agents.length && !info.assets.length && !info.offers.length && !info.mission && !info.station && !info.hq.length && !info.academy.length;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[10px] tracking-[0.15em] text-faint uppercase hover:text-ivory">
        ← Le monde
      </button>
      <div>
        <h3 className="font-serif text-2xl leading-tight">{info.city.name}</h3>
        {country && (
          <button onClick={() => onCountry(country.id)} className="text-xs text-muted hover:text-ivory">
            {country.name} · {BLOCS[country.bloc].label}
          </button>
        )}
      </div>
      {info.player && <p className="text-xs text-brass-soft">● Tu es ici.</p>}
      {[...info.hq, ...info.academy].map((a) => (
        <p key={a + (info.hq.includes(a) ? "hq" : "ac")} className="text-xs" style={{ color: AGENCIES[a].color }}>
          ◆ {info.hq.includes(a) ? `Siège de ${AGENCIES[a].name}` : `Académie de ${AGENCIES[a].name}`}
        </p>
      ))}
      {info.mission && state.mission && (
        <p className="text-xs text-fail">
          ⌖ Mission en cours : {state.mission.name} ({MISSION_IMPORTANCE[state.mission.importance].label.toLowerCase()})
        </p>
      )}
      {info.offers.map((o) => (
        <p key={o} className="text-xs text-fail">
          ⌖ Mission proposée : {o}
        </p>
      ))}
      {info.station && <p className="text-xs text-brass">▣ Ton antenne</p>}
      {info.relations.length > 0 && (
        <div>
          <h4 className="label mb-1.5">Tes liens (dernière position connue)</h4>
          <ul className="space-y-1 text-xs">
            {info.relations.map((r) => (
              <li key={r.name} className="flex justify-between gap-2">
                <span>
                  <span style={{ color: RELATION_COLORS[r.kind] }}>●</span> {r.name}
                </span>
                <span className="text-[10px] text-faint">{ago(r.day, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.agents.length > 0 && (
        <div>
          <h4 className="label mb-1.5">Agents</h4>
          <ul className="space-y-1 text-xs">
            {info.agents.map((a) => (
              <li key={a.name} className="flex justify-between gap-2">
                <span>
                  <span style={{ color: AGENCIES[a.agency].color }}>■</span> {a.codename ? `« ${a.codename} » ` : ""}
                  <span className="text-muted">{a.name}</span>
                  {a.status !== "apte" && <span className="ml-1 text-[10px] text-partial">{a.status.replace("_", " ")}</span>}
                </span>
                <span className="shrink-0 text-[10px] text-faint">{ago(a.day, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.assets.length > 0 && (
        <div>
          <h4 className="label mb-1.5">Informateurs</h4>
          <ul className="space-y-1 text-xs text-muted">
            {info.assets.map((a) => (
              <li key={a}>▲ {a}</li>
            ))}
          </ul>
        </div>
      )}
      {empty && <p className="text-xs text-faint italic">Personne que tu connaisses ici.</p>}
    </div>
  );
}
