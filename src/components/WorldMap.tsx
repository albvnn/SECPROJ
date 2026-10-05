"use client";

import { geoArea, geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { currentDate } from "@/lib/game/engine";
import { heatLabel } from "@/lib/game/field";
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
import { clearance, knownRegions, operativeKnown, rumourVisible, threatVisible } from "@/lib/game/intel";
import { Classified, RequestButton } from "./IntelUI";

type Layer = "blocs" | "tensions" | "notoriete" | "ressources";
type Selection = { kind: "country"; id: string } | { kind: "city"; id: string } | null;
type Rotation = [number, number];

const K_MIN = 0.85;
const K_MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Les pays, une fois pour toutes : la Confédération du Sahel fusionne trois pays ; l'Extrême-Orient est taillé dans la Russie. */
function useGeoData() {
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
    // Kosovo, Chypre du Nord et Somaliland n'ont pas de code dans l'atlas : leur nom sert d'identifiant (unique).
    const shapes = features.map((f) => ({ id: f.id === undefined ? `sans-code:${f.properties?.name}` : String(f.id), f }));
    // Sur la sphère, le sens de l'anneau compte : s'il couvre plus d'un hémisphère, il est à l'envers.
    let farEast: Polygon = { type: "Polygon", coordinates: [[...FAR_EAST_OUTLINE, FAR_EAST_OUTLINE[0]]] };
    if (geoArea(farEast) > 2 * Math.PI) farEast = { type: "Polygon", coordinates: [[...FAR_EAST_OUTLINE, FAR_EAST_OUTLINE[0]].reverse()] };
    return { shapes, farEast, graticule: geoGraticule10() };
  }, []);
}

/** Le point où le soleil est au zénith : la date du jeu donne la saison, l'horloge l'heure. */
function subsolar(isoDate: string): [number, number] {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const doy = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const now = new Date();
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
  return [-15 * (hours - 12), decl];
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
  /** Menaces que tu as le droit de connaître, qui se préparent ici. */
  threats: { label: string; progress: number; capstone?: boolean }[];
  /** Quelque chose se prépare ici, sans plus de détails. */
  rumours: number;
}

function cityInfos(state: GameState): Map<string, CityInfo> {
  const map = new Map<string, CityInfo>();
  const get = (id: string) => {
    const city = findCity(id);
    if (!city) return null;
    if (!map.has(id))
      map.set(id, { city, player: false, hq: [], academy: [], mission: false, offers: [], relations: [], agents: [], assets: [], station: false, threats: [], rumours: 0 });
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
  // Seuls les agents dont tu connais le dossier ont une position sur ta carte.
  for (const o of state.roster)
    if (o.status !== "mort" && (o.agency === agency || o.missionsWithPlayer > 0) && operativeKnown(state, o))
      get(o.cityId)?.agents.push({ name: o.name, codename: o.codename, agency: o.agency, day: o.positionDay, status: o.status });
  for (const a of state.command.assets) if (a.status === "actif") get(a.cityId)?.assets.push(`${a.name}, ${a.role}`);
  const stationCity = state.command.station?.cityId ?? state.character.station;
  if (stationCity) {
    const s = get(stationCity);
    if (s) s.station = true;
  }
  for (const t of state.world.geo.threats) {
    if (threatVisible(state, t)) get(t.cityId)?.threats.push({ label: t.title, progress: t.progress, capstone: t.capstone });
    else if (rumourVisible(state, t)) {
      const c = get(t.cityId);
      if (c) c.rumours += 1;
    }
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
/* Le globe                                                            */
/* ------------------------------------------------------------------ */

/**
 * Le monde en globe : on le fait tourner à la main (avec de l'élan), on zoome à la molette,
 * il vole jusqu'à la ville qu'on demande. La nuit avance sur la face cachée du soleil.
 * Les régions que tu ne surveilles pas restent dans le brouillard.
 */
export function WorldMap({ state, onChange, focus }: { state: GameState; onChange?: (s: GameState) => void; focus?: { id: string; n: number } | null }) {
  const { shapes, farEast, graticule } = useGeoData();
  const lvl = clearance(state);
  const watched = useMemo(() => knownRegions(state), [state]);
  const seen = (region: string) => lvl >= 4 || watched.has(region);
  const geo = state.world.geo;
  const infos = useMemo(() => cityInfos(state), [state]);
  const agency = state.character.identity.agency;
  const here = findCity(state.world.cityId);

  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(280, e.contentRect.width), h: Math.max(300, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [rot, setRot] = useState<Rotation>(() => (here ? [-here.lon, clamp(-here.lat, -60, 60)] : [-10, -30]));
  const [k, setK] = useState(1.6);
  const [layer, setLayer] = useState<Layer>("blocs");
  const [resource, setResource] = useState<ResourceId>("terres_rares");
  const [show, setShow] = useState({ people: true, agents: true, ops: true });
  const [legend, setLegend] = useState(false);
  const [folded, setFolded] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [hover, setHover] = useState<{ x: number; y: number; country: CountryDef } | null>(null);
  const anim = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; r: Rotation; moved: boolean; vx: number; vy: number; t: number } | null>(null);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const kRef = useRef(k);
  kRef.current = k;

  const radius = (Math.min(size.w, size.h) / 2 - 22) * k;
  const projection = useMemo(
    () => geoOrthographic().translate([size.w / 2, size.h / 2]).scale(radius).rotate([rot[0], rot[1], 0]).clipAngle(90).precision(0.6),
    [size, radius, rot],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const center: [number, number] = [-rot[0], -rot[1]];
  const visible = (lon: number, lat: number) => geoDistance([lon, lat], center) < Math.PI / 2 - 0.03;
  const project = (lat: number, lon: number) => projection([lon, lat]) ?? [0, 0];
  const sun = subsolar(currentDate(state));
  const night = useMemo(() => geoCircle().center([sun[0] + 180, -sun[1]]).radius(90)(), [sun[0], sun[1]]);

  const stop = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };
  /** Vole jusqu'à un point du globe, en tournant par le plus court chemin. */
  const flyTo = (lon: number, lat: number, kTo = Math.max(kRef.current, 3)) => {
    stop();
    const from = rotRef.current;
    let toL = -lon;
    while (toL - from[0] > 180) toL -= 360;
    while (toL - from[0] < -180) toL += 360;
    const to: Rotation = [toL, clamp(-lat, -75, 75)];
    const k0 = kRef.current;
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1100);
      const e = ease(t);
      setRot([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]);
      // Le zoom recule un peu à mi-course, comme un avion qui prend de l'altitude.
      setK(k0 + (kTo - k0) * e - Math.sin(Math.PI * t) * Math.min(1.2, Math.abs(to[0] - from[0]) / 90));
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => stop, []);

  // Le terminal demande une ville : on la sélectionne et on y vole.
  useEffect(() => {
    const city = focus ? findCity(focus.id) : undefined;
    if (!city) return;
    setSel({ kind: "city", id: city.id });
    flyTo(city.lon, city.lat, 4);
  }, [focus]);

  const zoomBy = (f: number) => setK((v) => clamp(v * f, K_MIN, K_MAX));

  const fill = (c: CountryDef | undefined) => {
    if (!c) return "var(--map-land)";
    if (layer === "blocs") return c.bloc === "neutre" ? "var(--map-land)" : tint(BLOCS[c.bloc].color, c.bloc === agency ? 80 : 55);
    if (layer === "tensions") {
      if (!seen(c.region)) return "var(--map-land)";
      const t = geo.tensions[c.region] ?? 50;
      return `color-mix(in srgb, var(--heat-high) ${t}%, var(--heat-low))`;
    }
    if (layer === "notoriete") {
      const h = state.character.heat?.[c.id] ?? 0;
      return h > 0 ? `color-mix(in srgb, var(--heat-high) ${Math.max(15, h)}%, var(--map-land))` : "var(--map-land)";
    }
    return c.resources.includes(resource) ? tint("var(--color-brass)", 80) : "var(--map-land)";
  };

  const routes = here && !state.mission ? state.offers.map((o) => ({ id: o.id, to: findCity(o.cityId), assigned: o.assigned })).filter((r) => r.to && r.to.id !== here.id) : [];
  const missionRoute = here && state.mission && findCity(state.mission.cityId)?.id !== here.id ? findCity(state.mission.cityId) : undefined;
  const important = (info: CityInfo) => info.player || info.station || info.mission || info.offers.length > 0 || info.threats.length > 0 || info.hq.includes(agency);
  const selected = sel?.kind === "country" ? findCountry(sel.id) : undefined;
  const selectedCity = sel?.kind === "city" ? infos.get(sel.id) ?? (findCity(sel.id) ? emptyInfo(findCity(sel.id)!) : undefined) : undefined;
  const pick = (next: Selection) => {
    if (drag.current?.moved) return;
    setSel(next);
    setFolded(false);
  };
  const cx = size.w / 2;
  const cy = size.h / 2;

  return (
    <div
      ref={boxRef}
      className="relative h-full min-h-[360px] overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--map-ocean) 70%, var(--color-ivory) 6%) 0%, var(--color-ink) 75%), var(--color-ink)",
      }}
      onMouseLeave={() => setHover(null)}
    >
      {/* Un ciel discret. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, var(--color-ivory) 50%, transparent 51%), radial-gradient(1px 1px at 75% 12%, var(--color-ivory) 50%, transparent 51%), radial-gradient(1px 1px at 88% 70%, var(--color-ivory) 50%, transparent 51%), radial-gradient(1px 1px at 8% 82%, var(--color-ivory) 50%, transparent 51%), radial-gradient(1px 1px at 55% 92%, var(--color-ivory) 50%, transparent 51%)", backgroundSize: "340px 340px" }} />
      <svg
        width={size.w}
        height={size.h}
        className="absolute inset-0 touch-none"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onPointerDown={(e) => {
          stop();
          drag.current = { x: e.clientX, y: e.clientY, r: rotRef.current, moved: false, vx: 0, vy: 0, t: performance.now() };
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          setHover(null);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          // Un pixel tourne d'autant moins que le globe est grand.
          const deg = 57.3 / radius;
          const next: Rotation = [d.r[0] + dx * deg, clamp(d.r[1] - dy * deg, -80, 80)];
          const now = performance.now();
          const dt = Math.max(1, now - d.t);
          d.vx = ((next[0] - rotRef.current[0]) / dt) * 16;
          d.vy = ((next[1] - rotRef.current[1]) / dt) * 16;
          d.t = now;
          setRot(next);
        }}
        onPointerUp={() => {
          const d = drag.current;
          setTimeout(() => (drag.current = null), 0);
          if (!d?.moved) return;
          // L'élan : le globe continue sur sa lancée, puis ralentit.
          let { vx, vy } = d;
          const step = () => {
            vx *= 0.93;
            vy *= 0.93;
            if (Math.abs(vx) + Math.abs(vy) < 0.02) return (anim.current = null);
            setRot(([l, p]) => [l + vx, clamp(p + vy, -80, 80)]);
            anim.current = requestAnimationFrame(step);
          };
          if (Math.abs(vx) + Math.abs(vy) > 0.15) anim.current = requestAnimationFrame(step);
        }}
      >
        <defs>
          <radialGradient id="globe-ocean" cx={cx - radius * 0.35} cy={cy - radius * 0.4} r={radius * 1.45} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--map-ocean) 82%, var(--color-ivory) 12%)" />
            <stop offset="100%" stopColor="var(--map-ocean)" />
          </radialGradient>
          <radialGradient id="globe-halo" cx={cx} cy={cy} r={radius * 1.12} gradientUnits="userSpaceOnUse">
            <stop offset="86%" stopColor="var(--color-brass)" stopOpacity="0" />
            <stop offset="90%" stopColor="var(--color-brass)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-brass)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="globe-shade" cx={cx - radius * 0.3} cy={cy - radius * 0.35} r={radius * 1.35} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
          <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--bloc-hostile)" strokeWidth="1.4" />
          </pattern>
          {/* Le brouillard : les régions que tu ne surveilles pas. */}
          <pattern id="fog" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="6" height="6" fill="var(--map-ocean)" opacity="0.55" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-ivory)" strokeOpacity="0.07" strokeWidth="1.5" />
          </pattern>
        </defs>

        <circle cx={cx} cy={cy} r={radius * 1.12} fill="url(#globe-halo)" pointerEvents="none" />
        <circle cx={cx} cy={cy} r={radius} fill="url(#globe-ocean)" />
        <path d={path(graticule) ?? ""} fill="none" stroke="var(--hairline)" strokeWidth={0.5} pointerEvents="none" />
        {shapes.map((s) => {
          const c = countryOfShape(s.id);
          const d = path(s.f);
          if (!d) return null;
          const active = (sel?.kind === "country" && c?.id === sel.id) || (selectedCity && c?.id === selectedCity.city.country);
          return (
            <path
              key={s.id}
              d={d}
              fill={fill(c)}
              stroke={active ? "var(--color-brass)" : "var(--map-border)"}
              strokeWidth={active ? 1.6 : 0.5}
              className="transition-[fill] duration-300 hover:brightness-125"
              onClick={() => c && pick({ kind: "country", id: c.id })}
              onMouseMove={(e) => {
                if (!c || drag.current) return;
                const r = boxRef.current!.getBoundingClientRect();
                setHover({ x: e.clientX - r.left, y: e.clientY - r.top, country: c });
              }}
            />
          );
        })}
        {lvl < 4 &&
          shapes.map((s) => {
            const c = countryOfShape(s.id);
            if (!c || seen(c.region)) return null;
            const d = path(s.f);
            return d ? <path key={`fog-${s.id}`} d={d} fill="url(#fog)" stroke="none" pointerEvents="none" /> : null;
          })}
        <path
          d={path(farEast) ?? ""}
          fill={layer === "blocs" ? tint(BLOCS.gris.color, 75) : "url(#hatch)"}
          stroke="var(--bloc-gris)"
          strokeDasharray="3 2"
          strokeWidth={0.8}
          onClick={() => pick({ kind: "country", id: "EXO" })}
        >
          <title>République d'Extrême-Orient — Zone grise</title>
        </path>
        {/* La nuit. */}
        <path d={path(night) ?? ""} fill="#02040a" opacity={0.32} pointerEvents="none" />
        {/* Micro-États et entités sans forme. */}
        {COUNTRIES.filter((c) => c.marker && visible(c.marker[1], c.marker[0])).map((c) => {
          const [x, y] = project(c.marker![0], c.marker![1]);
          return (
            <rect key={c.id} x={x - 2.5} y={y - 2.5} width={5} height={5} transform={`rotate(45 ${x} ${y})`} fill={fill(c)} stroke="var(--map-border)" strokeWidth={0.6} onClick={() => pick({ kind: "country", id: c.id })}>
              <title>{c.name}</title>
            </rect>
          );
        })}
        {/* Itinéraires : grands cercles, cachés derrière l'horizon. */}
        {show.ops &&
          here &&
          routes.map((r) => (
            <path key={r.id} d={path({ type: "LineString", coordinates: [[here.lon, here.lat], [r.to!.lon, r.to!.lat]] }) ?? ""} fill="none" stroke="var(--color-fail)" strokeWidth={1.3} strokeDasharray="5 4" opacity={r.assigned ? 0.9 : 0.55} pointerEvents="none" className="map-dash" />
          ))}
        {missionRoute && here && <path d={path({ type: "LineString", coordinates: [[here.lon, here.lat], [missionRoute.lon, missionRoute.lat]] }) ?? ""} fill="none" stroke="var(--color-brass)" strokeWidth={1.4} strokeDasharray="5 4" pointerEvents="none" />}
        <circle cx={cx} cy={cy} r={radius} fill="url(#globe-shade)" pointerEvents="none" />
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-brass)" strokeOpacity={0.25} strokeWidth={1} pointerEvents="none" />
        {/* De près, toutes les villes de la carte apparaissent. */}
        {k >= 3.5 &&
          CITIES.filter((c) => !infos.has(c.id) && visible(c.lon, c.lat)).map((c) => {
            const [x, y] = project(c.lat, c.lon);
            return (
              <g key={`dot-${c.id}`} className="cursor-pointer" onClick={() => pick({ kind: "city", id: c.id })}>
                <circle cx={x} cy={y} r={2.2} fill="var(--color-ivory)" opacity={0.55} />
                <text x={x + 6} y={y + 3} fontSize={10} fill="var(--color-ivory)" opacity={0.55} stroke="var(--map-ocean)" strokeWidth={2.5} paintOrder="stroke" style={{ fontFamily: "var(--font-sans)" }}>
                  {c.name}
                </text>
              </g>
            );
          })}
        {/* Les villes, sur la face visible seulement. */}
        {[...infos.values()]
          .filter((info) => visible(info.city.lon, info.city.lat))
          .map((info) => (
            <CityMarker key={info.city.id} info={info} project={project} scale={1} show={show} agency={agency} selected={selectedCity?.city.id === info.city.id} onClick={() => pick({ kind: "city", id: info.city.id })} />
          ))}
        {[...infos.values()]
          .filter((info) => visible(info.city.lon, info.city.lat) && (k >= 3 || important(info) || selectedCity?.city.id === info.city.id))
          .map((info) => {
            const [x, y] = project(info.city.lat, info.city.lon);
            return (
              <text
                key={`label-${info.city.id}`}
                x={x + 9}
                y={y + 3.5}
                fontSize={k >= 4 ? 12 : 10.5}
                fill={info.player ? "var(--color-brass-soft)" : "var(--color-ivory)"}
                stroke="var(--map-ocean)"
                strokeWidth={3}
                paintOrder="stroke"
                opacity={info.player || important(info) ? 0.95 : 0.72}
                pointerEvents="none"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {info.city.name}
              </text>
            );
          })}
      </svg>

      {/* Commandes : couches et filtres, en une barre. */}
      <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded-full border border-line bg-panel/85 backdrop-blur">
          {(["blocs", "tensions", "notoriete", "ressources"] as Layer[]).map((l) => (
            <button key={l} onClick={() => setLayer(l)} className={`px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${layer === l ? "bg-brass/25 text-brass-soft" : "text-muted hover:text-ivory"}`}>
              {l === "notoriete" ? "notoriété" : l}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-full border border-line bg-panel/85 backdrop-blur">
          {(
            [
              ["people", "Liens"],
              ["agents", "Agents"],
              ["ops", "Ops"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} onClick={() => setShow((v) => ({ ...v, [key]: !v[key] }))} className={`px-2.5 py-1 text-[10px] tracking-wide ${show[key] ? "text-ivory" : "text-faint line-through"}`}>
              {label}
            </button>
          ))}
        </div>
        {layer === "ressources" && (
          <div className="flex w-full max-w-[24rem] flex-wrap gap-1 rounded-sm border border-line bg-panel/85 p-1.5 backdrop-blur">
            {(Object.keys(RESOURCES) as ResourceId[]).map((r) => (
              <button key={r} onClick={() => setResource(r)} className={`rounded-sm px-1.5 py-0.5 text-[10px] ${resource === r ? "bg-brass text-ink" : "text-muted hover:text-ivory"}`}>
                {RESOURCES[r].icon} {RESOURCES[r].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {hover && !sel && (
        <div className="pointer-events-none absolute z-10 rounded-sm border border-line-strong bg-panel/95 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur" style={{ left: Math.min(hover.x + 14, size.w - 220), top: Math.max(8, hover.y - 10) }}>
          <p className="font-serif text-sm leading-tight">{hover.country.name}</p>
          <p className="text-[10px] tracking-[0.1em] uppercase" style={{ color: hover.country.bloc === "neutre" ? "var(--color-muted)" : BLOCS[hover.country.bloc].color }}>
            {BLOCS[hover.country.bloc].label}
            {seen(hover.country.region) ? <span className="text-muted"> · {tensionLabel(geo.tensions[hover.country.region] ?? 50)}</span> : <span className="text-faint"> · hors de ta zone</span>}
          </p>
        </div>
      )}

      {/* Navigation. */}
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-full border border-line bg-panel/85 backdrop-blur">
        {here && (
          <button onClick={() => flyTo(here.lon, here.lat, 3)} className="px-2.5 py-1.5 text-sm text-brass hover:text-brass-soft" aria-label="Aller où je suis" title="Aller où je suis">
            ◎
          </button>
        )}
        <button onClick={() => zoomBy(1.4)} className="border-t border-line px-2.5 py-1 text-sm text-muted hover:text-ivory" aria-label="Zoomer">
          +
        </button>
        <button onClick={() => zoomBy(1 / 1.4)} className="border-t border-line px-2.5 py-1 text-sm text-muted hover:text-ivory" aria-label="Dézoomer">
          −
        </button>
        <button onClick={() => setLegend((v) => !v)} className={`border-t border-line px-2.5 py-1 text-[11px] ${legend ? "text-brass" : "text-muted hover:text-ivory"}`} aria-label="Légende" title="Légende">
          ?
        </button>
      </div>
      {legend && <Legend layer={layer} fog={lvl < 4} />}
      <p className="pointer-events-none absolute bottom-3 left-3 hidden font-mono text-[10px] text-faint sm:block">
        {Math.abs(center[1]).toFixed(0)}°{center[1] >= 0 ? "N" : "S"} {Math.abs(((center[0] + 540) % 360) - 180).toFixed(0)}°{((center[0] + 540) % 360) - 180 >= 0 ? "E" : "O"} · ×{k.toFixed(1)}
      </p>

      {/* La fiche flottante : un résumé, pas un mur de texte. */}
      <div className="absolute inset-x-2 bottom-14 flex max-h-[55%] flex-col sm:inset-x-auto sm:top-14 sm:right-3 sm:bottom-auto sm:w-80 sm:max-h-[calc(100%-13rem)]">
        <div key={sel ? `${sel.kind}:${sel.id}` : "monde"} className="animate-rise scrollbar-thin relative min-h-0 overflow-y-auto rounded-md border border-line-strong bg-panel/92 p-4 shadow-2xl backdrop-blur">
          <button onClick={() => setFolded((f) => !f)} className="absolute top-1.5 right-2 z-10 px-1 text-xs text-faint hover:text-ivory" aria-label={folded ? "Déplier" : "Replier"} title={folded ? "Déplier" : "Replier"}>
            {folded ? "▴" : "▾"}
          </button>
          {folded ? (
            <button onClick={() => setFolded(false)} className="label block pr-5 text-left">
              {selected ? selected.name : selectedCity ? selectedCity.city.name : `Situation · J${state.world.day}`}
            </button>
          ) : selected ? (
            <CountryPanel state={state} country={selected} infos={infos} onCity={(id) => (setSel({ kind: "city", id }), flyTo(findCity(id)!.lon, findCity(id)!.lat))} onBack={() => setSel(null)} onChange={onChange} seen={seen(selected.region)} />
          ) : selectedCity ? (
            <CityPanel state={state} info={selectedCity} onCountry={(id) => setSel({ kind: "country", id })} onBack={() => setSel(null)} onFly={() => flyTo(selectedCity.city.lon, selectedCity.city.lat, 4.5)} />
          ) : (
            <WorldPanel state={state} onChange={onChange} onFly={(lon, lat) => flyTo(lon, lat, 2.4)} />
          )}
        </div>
      </div>
    </div>
  );
}

function emptyInfo(city: CityDef): CityInfo {
  return { city, player: false, hq: [], academy: [], mission: false, offers: [], relations: [], agents: [], assets: [], station: false, threats: [], rumours: 0 };
}

function CityMarker({
  info,
  project,
  scale,
  show,
  agency,
  selected,
  onClick,
}: {
  info: CityInfo;
  project: (lat: number, lon: number) => [number, number];
  scale: number;
  show: { people: boolean; agents: boolean; ops: boolean };
  agency: AgencyId;
  selected: boolean;
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
        opacity={a === agency ? 1 : 0.6}
      />,
    );
    label.push(`${isHq ? "Siège" : "Académie"} de ${AGENCIES[a].name}`);
  }
  if (show.ops && (info.mission || info.offers.length)) {
    parts.push(
      <g key="ops" stroke="var(--color-fail)" strokeWidth={1.4} fill="none">
        <circle cx={x} cy={y} r={6 * s} />
        <path d={`M${x - 9 * s},${y}H${x - 3 * s}M${x + 3 * s},${y}H${x + 9 * s}M${x},${y - 9 * s}V${y - 3 * s}M${x},${y + 3 * s}V${y + 9 * s}`} />
      </g>,
    );
    if (info.mission) label.push("Mission en cours");
    for (const o of info.offers) label.push(`Mission proposée : ${o}`);
  }
  if (show.ops && info.station) {
    parts.push(<rect key="st" x={x + 4 * s} y={y - 9 * s} width={5 * s} height={5 * s} fill="var(--color-brass)" />);
    label.push("Ta Station");
  }
  if (show.ops && info.threats.length) {
    const worst = Math.max(...info.threats.map((t) => (t.capstone ? 100 : t.progress)));
    parts.push(
      <g key="th" pointerEvents="none">
        {worst >= 75 && <circle cx={x} cy={y} r={3} fill="none" stroke="var(--color-fail)" strokeWidth={1.5} className="map-pulse" />}
        <circle cx={x} cy={y} r={(4 + worst / 14) * s} fill="none" stroke="var(--color-fail)" strokeWidth={1} strokeDasharray="2 2" opacity={0.85} />
        <text x={x - 9 * s} y={y + 3 * s} fontSize={9 * s} textAnchor="middle" fill="var(--color-fail)" fontWeight={700}>
          !
        </text>
      </g>,
    );
    label.push(...info.threats.map((t) => `Menace : ${t.label}${t.capstone ? " (opération décisive)" : ` — ${t.progress}/100`}`));
  }
  if (show.ops && info.rumours) {
    parts.push(
      <text key="ru" x={x - 9 * s} y={y + 3 * s} fontSize={9 * s} textAnchor="middle" fill="var(--color-partial)" fontWeight={700} pointerEvents="none">
        ?
      </text>,
    );
    label.push("Rumeur : quelque chose se prépare ici");
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
      parts.push(<circle key={`r${i}`} cx={x - 6 * s - i * 3 * s} cy={y - 6 * s} r={2.4 * s} fill={RELATION_COLORS[r.kind] ?? "var(--color-muted)"} stroke="var(--map-border)" strokeWidth={0.5} />);
    });
    label.push(...info.relations.map((r) => r.name));
  }
  if (info.player) {
    parts.push(
      <g key="me">
        <circle cx={x} cy={y} r={3} fill="none" stroke="var(--color-brass)" strokeWidth={1.5} className="map-pulse" />
        <circle cx={x} cy={y} r={3 * s} fill="var(--color-brass)" stroke="var(--map-border)" strokeWidth={1} />
      </g>,
    );
    label.splice(1, 0, "Tu es ici");
  }
  if (parts.length === 0) return null;
  return (
    <g className="cursor-pointer" onClick={onClick}>
      <title>{label.join("\n")}</title>
      <circle cx={x} cy={y} r={11 * s} fill="transparent" />
      {selected && <circle cx={x} cy={y} r={13 * s} fill="none" stroke="var(--color-brass)" strokeWidth={1.2} strokeDasharray="3 3" />}
      {parts}
    </g>
  );
}

function Legend({ layer, fog }: { layer: Layer; fog: boolean }) {
  return (
    <div className="animate-rise absolute right-14 bottom-3 flex max-w-[20rem] flex-col gap-1 rounded-md border border-line bg-panel/92 px-3 py-2 text-[10px] text-muted shadow-xl backdrop-blur">
      {layer === "blocs" && (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(BLOCS) as (keyof typeof BLOCS)[]).map((b) => (
            <span key={b} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: b === "neutre" ? "var(--map-land)" : BLOCS[b].color }} />
              {BLOCS[b].label}
            </span>
          ))}
        </span>
      )}
      {layer === "tensions" && (
        <span className="flex items-center gap-1.5">
          calme
          <span className="h-2 w-20 rounded-full" style={{ background: "linear-gradient(90deg, var(--heat-low), var(--heat-high))" }} />
          explosive
        </span>
      )}
      {layer === "notoriete" && (
        <span className="flex items-center gap-1.5">
          inconnu
          <span className="h-2 w-20 rounded-full" style={{ background: "linear-gradient(90deg, var(--map-land), var(--heat-high))" }} />
          recherché
        </span>
      )}
      {layer === "ressources" && <span>Les pays dorés possèdent la ressource choisie.</span>}
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brass" /> toi
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--pole-esprit)" }} /> agents
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--pole-ame)" }} /> liens
        </span>
        <span className="text-fail">⌖ opérations</span>
        <span className="text-fail">! menaces</span>
        <span className="text-partial">? rumeurs</span>
        <span>▒ nuit</span>
        {fog && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm border border-line" style={{ background: "repeating-linear-gradient(-45deg, var(--map-land) 0 2px, var(--map-ocean) 2px 4px)" }} /> hors de tes régions
          </span>
        )}
      </span>
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

/** Le centre approximatif d'une région : la moyenne de ses villes. */
function regionCenter(region: string): [number, number] | null {
  const cities = CITIES.filter((c) => findCountry(c.country)?.region === region);
  if (!cities.length) return null;
  return [cities.reduce((s, c) => s + c.lon, 0) / cities.length, cities.reduce((s, c) => s + c.lat, 0) / cities.length];
}

/** Une petite jauge chiffrée, pour les résumés. */
function Stat({ label, value, color, text }: { label: string; value: number | null; color: string; text?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className="truncate text-xs" style={{ color: value === null ? "var(--color-faint)" : color }}>
        {text ?? (value === null ? "?" : value)}
      </p>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line">{value !== null && <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />}</div>
    </div>
  );
}

/** Le résumé du monde : les points chauds, la menace la plus avancée, la dernière dépêche ; le reste sur demande. */
function WorldPanel({ state, onChange, onFly }: { state: GameState; onChange?: (s: GameState) => void; onFly: (lon: number, lat: number) => void }) {
  const [more, setMore] = useState(false);
  const geo = state.world.geo;
  const me = state.character.identity.agency;
  const lvl = clearance(state);
  const watched = knownRegions(state);
  const seen = (r: string) => lvl >= 4 || watched.has(r);
  const hot = REGION_IDS.filter(seen)
    .sort((a, b) => (geo.tensions[b] ?? 0) - (geo.tensions[a] ?? 0))
    .slice(0, 3);
  const threats = geo.threats.filter((t) => threatVisible(state, t)).sort((a, b) => b.progress - a.progress);
  const worst = threats[0];
  const worstCity = worst ? findCity(worst.cityId) : undefined;
  const pairs: [AgencyId, AgencyId][] = [
    ["argos", "meridian"],
    ["meridian", "monsoon"],
    ["argos", "monsoon"],
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="label pr-5">Situation · J{state.world.day}</p>
        <p className="mt-0.5 text-xs text-muted">
          {watched.size} région{watched.size > 1 ? "s" : ""} suivie{watched.size > 1 ? "s" : ""} · {threats.length} menace{threats.length > 1 ? "s" : ""} identifiée{threats.length > 1 ? "s" : ""}
        </p>
      </div>
      {hot.length > 0 && (
        <ul className="space-y-1.5">
          {hot.map((r) => {
            const t = geo.tensions[r] ?? 50;
            const c = regionCenter(r);
            return (
              <li key={r}>
                <button onClick={() => c && onFly(c[0], c[1])} className="group flex w-full items-center gap-2 text-left text-xs">
                  <span className="min-w-0 flex-1 truncate group-hover:text-brass-soft">{REGIONS[r].label}</span>
                  <span className="h-1 w-14 overflow-hidden rounded-full bg-line">
                    <span className="block h-full" style={{ width: `${t}%`, background: `color-mix(in srgb, var(--heat-high) ${t}%, var(--heat-low))` }} />
                  </span>
                  <span className="w-16 text-right text-[10px] text-muted">{tensionLabel(t)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {worst && worstCity && (
        <button onClick={() => onFly(worstCity.lon, worstCity.lat)} className="block w-full rounded-sm border border-fail/40 bg-fail/[0.06] px-2.5 py-2 text-left hover:border-fail/70">
          <p className="text-[9px] tracking-[0.14em] text-fail uppercase">Menace la plus avancée · {worst.progress}/100</p>
          <p className="truncate text-xs">{worst.title}</p>
          <p className="text-[10px] text-muted">{worstCity.name}</p>
        </button>
      )}
      {geo.news[0] && (
        <p className={`border-l-2 pl-2 text-xs leading-snug ${geo.news[0].player ? "border-brass" : "border-line"} text-ivory/85`}>
          <span className="font-mono text-[10px] text-faint">J{geo.news[0].day} · </span>
          {geo.news[0].text}
        </p>
      )}
      <button onClick={() => setMore((v) => !v)} className="w-full border-t border-line pt-2 text-left text-[10px] tracking-[0.15em] text-muted uppercase hover:text-ivory">
        {more ? "▾ Réduire" : "▸ Tout le tableau : agences, régions, dépêches"}
      </button>
      {more && (
        <div className="space-y-5">
          <section>
            <h3 className="label mb-2">Relations entre agences</h3>
            <ul className="space-y-2.5">
              {pairs.map(([a, b]) => {
                const v = diplomacyBetween(geo.diplomacy, a, b);
                const l = diplomacyLabel(v);
                const mine = a === me || b === me;
                const names = (
                  <span>
                    <span style={{ color: AGENCIES[a].color }}>{AGENCIES[a].name}</span> · <span style={{ color: AGENCIES[b].color }}>{AGENCIES[b].name}</span>
                  </span>
                );
                if (!mine && lvl < 3)
                  return (
                    <li key={`${a}${b}`}>
                      <p className="mb-1 text-xs">{names}</p>
                      <Classified need={3} />
                    </li>
                  );
                return (
                  <li key={`${a}${b}`} className={mine ? "" : "opacity-70"} title={l.description}>
                    <p className="flex items-baseline justify-between text-xs">
                      {names}
                      <span className={v >= 25 ? "text-success" : v <= -40 ? "text-fail" : "text-muted"}>{l.label}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h3 className="label mb-2">Régions</h3>
            <ul className="space-y-1">
              {[...REGION_IDS]
                .sort((x, y) => Number(seen(y)) - Number(seen(x)) || (geo.tensions[y] ?? 0) - (geo.tensions[x] ?? 0))
                .map((r) => {
                  const t = geo.tensions[r] ?? 50;
                  if (!seen(r))
                    return (
                      <li key={r} className="flex items-center gap-2 text-xs text-faint" title={REGIONS[r].stakes}>
                        <span className="flex-1 truncate">{REGIONS[r].label}</span>
                        {lvl >= 2 ? <RequestButton state={state} kind="region" target={r} onChange={onChange} label="Rapport" /> : <span className="text-[10px]">?</span>}
                      </li>
                    );
                  return (
                    <li key={r} className="flex items-center gap-2 text-xs" title={REGIONS[r].stakes}>
                      <span className="flex-1 truncate">
                        {watched.has(r) && lvl < 4 && <span className="mr-1 text-brass">◉</span>}
                        {REGIONS[r].label}
                      </span>
                      <span className="w-16 text-right text-[10px] text-muted">{tensionLabel(t)}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
          <section>
            <h3 className="label mb-2">Dépêches</h3>
            <ul className="space-y-2">
              {geo.news.slice(0, 8).map((n, i) => (
                <li key={i} className={`border-l-2 pl-2 text-xs leading-snug ${n.player ? "border-brass text-ivory" : "border-line text-muted"}`}>
                  <span className="font-mono text-[10px] text-faint">J{n.day} · </span>
                  {n.text}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function CountryPanel({
  state,
  country,
  infos,
  onCity,
  onBack,
  onChange,
  seen,
}: {
  state: GameState;
  country: CountryDef;
  infos: Map<string, CityInfo>;
  onCity: (id: string) => void;
  onBack: () => void;
  onChange?: (s: GameState) => void;
  /** La région du pays est-elle surveillée ? */
  seen: boolean;
}) {
  const bloc = BLOCS[country.bloc];
  const blocColor = country.bloc === "neutre" ? "var(--color-muted)" : bloc.color;
  const t = state.world.geo.tensions[country.region] ?? 50;
  const heat = state.character.heat?.[country.id] ?? 0;
  const cities = CITIES.filter((c) => c.country === country.id);
  return (
    <div className="space-y-3.5">
      <PanelHead onBack={onBack} title={country.name}>
        <span className="rounded-sm px-1.5 py-px text-[9px] font-semibold tracking-[0.12em] uppercase" style={{ color: blocColor, background: tint(blocColor, 15) }}>
          {bloc.label}
        </span>
        <span className="text-muted">{REGIONS[country.region].label}</span>
      </PanelHead>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Stabilité" value={country.stability} color={country.stability >= 60 ? "var(--color-success)" : country.stability >= 30 ? "var(--color-partial)" : "var(--color-fail)"} />
        <Stat label="Tension" value={seen ? t : null} color={`color-mix(in srgb, var(--heat-high) ${t}%, var(--heat-low))`} text={seen ? tensionLabel(t) : undefined} />
        <Stat label="Notoriété" value={heat} color={heat >= 60 ? "var(--color-fail)" : heat > 0 ? "var(--color-partial)" : "var(--color-muted)"} text={heat > 0 ? heatLabel(heat) : "inconnu"} />
      </div>
      {country.note && <p className="line-clamp-3 border-l-2 border-brass/60 pl-2.5 text-xs leading-relaxed text-ivory/85" title={country.note}>{country.note}</p>}
      {!seen && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-faint italic">
          Région que tu ne surveilles pas.
          {clearance(state) >= 2 && <RequestButton state={state} kind="region" target={country.region} onChange={onChange} label="Rapport régional" />}
        </div>
      )}
      {country.resources.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {country.resources.map((r) => (
            <span key={r} className="rounded-sm bg-ivory/5 px-1.5 py-0.5 text-[10px]" title={RESOURCES[r].label}>
              {RESOURCES[r].icon} {RESOURCES[r].label}
            </span>
          ))}
        </p>
      )}
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cities.map((c) => {
            const info = infos.get(c.id);
            const n = info ? info.relations.length + info.agents.length + info.assets.length : 0;
            return (
              <button key={c.id} onClick={() => onCity(c.id)} className={`rounded-full border px-2 py-0.5 text-[11px] hover:border-brass ${info?.player ? "border-brass/60 text-brass-soft" : "border-line text-ivory/85"}`}>
                {c.name}
                {n > 0 && <span className="ml-1 text-[9px] text-muted">·{n}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelHead({ onBack, title, children, action }: { onBack: () => void; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between pr-5">
        <button onClick={onBack} className="text-[10px] tracking-[0.15em] text-faint uppercase hover:text-ivory">
          ← Le monde
        </button>
        {action}
      </div>
      <h3 className="mt-1 font-serif text-2xl leading-tight">{title}</h3>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">{children}</p>
    </div>
  );
}

/** Une ville en résumé : ce qui s'y trouve, une ligne par chose. */
function CityPanel({ state, info, onCountry, onBack, onFly }: { state: GameState; info: CityInfo; onCountry: (id: string) => void; onBack: () => void; onFly: () => void }) {
  const country = findCountry(info.city.country);
  const now = state.world.day;
  const heat = country ? (state.character.heat?.[country.id] ?? 0) : 0;
  const [all, setAll] = useState(false);
  const rows: { icon: string; color: string; text: React.ReactNode; meta?: string }[] = [
    ...info.threats.map((t) => ({ icon: "!", color: "var(--color-fail)", text: t.label, meta: t.capstone ? "décisive" : `${t.progress}/100` })),
    ...(info.rumours ? [{ icon: "?", color: "var(--color-partial)", text: "Quelque chose se prépare ici" }] : []),
    ...(info.mission && state.mission ? [{ icon: "⌖", color: "var(--color-fail)", text: state.mission.name, meta: MISSION_IMPORTANCE[state.mission.importance].label.toLowerCase() }] : []),
    ...info.offers.map((o) => ({ icon: "⌖", color: "var(--color-fail)", text: o, meta: "proposée" })),
    ...info.relations.map((r) => ({ icon: "●", color: RELATION_COLORS[r.kind] ?? "var(--color-muted)", text: r.name, meta: ago(r.day, now) })),
    ...info.agents.map((a) => ({
      icon: "■",
      color: AGENCIES[a.agency].color,
      text: (
        <>
          {a.codename ? `« ${a.codename} » ` : ""}
          <span className="text-muted">{a.name}</span>
        </>
      ),
      meta: a.status !== "apte" ? a.status.replace("_", " ") : ago(a.day, now),
    })),
    ...info.assets.map((a) => ({ icon: "▲", color: "var(--color-partial)", text: a })),
  ];
  const shown = all ? rows : rows.slice(0, 6);
  const chips: { label: string; color: string }[] = [
    ...(info.player ? [{ label: "Tu es ici", color: "var(--color-brass)" }] : []),
    ...(info.station ? [{ label: "Ta Station", color: "var(--color-brass)" }] : []),
    ...info.hq.map((a) => ({ label: `Siège ${AGENCIES[a].name}`, color: AGENCIES[a].color })),
    ...info.academy.map((a) => ({ label: `Académie ${AGENCIES[a].name}`, color: AGENCIES[a].color })),
    ...(heat > 0 ? [{ label: `${heatLabel(heat)} ${heat}`, color: heat >= 60 ? "var(--color-fail)" : "var(--color-partial)" }] : []),
  ];
  return (
    <div className="space-y-3">
      <PanelHead
        onBack={onBack}
        title={info.city.name}
        action={
          <button onClick={onFly} className="text-[10px] tracking-[0.12em] text-brass-soft uppercase hover:underline">
            ◎ Survoler
          </button>
        }
      >
        {country && (
          <button onClick={() => onCountry(country.id)} className="text-muted hover:text-ivory">
            {country.name} · {BLOCS[country.bloc].label} ▸
          </button>
        )}
      </PanelHead>
      {chips.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.label} className="rounded-sm px-1.5 py-px text-[10px]" style={{ color: c.color, background: tint(c.color, 14) }}>
              {c.label}
            </span>
          ))}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-faint italic">Personne que tu connaisses ici.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <span className="w-3 shrink-0 text-center font-bold" style={{ color: r.color }}>
                {r.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.text}</span>
              {r.meta && <span className="shrink-0 text-[10px] text-faint">{r.meta}</span>}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 6 && (
        <button onClick={() => setAll((v) => !v)} className="text-[10px] tracking-[0.12em] text-muted uppercase hover:text-ivory">
          {all ? "Réduire" : `+ ${rows.length - 6} autres`}
        </button>
      )}
    </div>
  );
}
