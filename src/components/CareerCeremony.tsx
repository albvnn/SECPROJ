"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENCIES, SEAT_XP_BONUS, type SeatDef } from "@/lib/game/agencies";
import { freeSeats, occupiedSeats, rankMissing, skillTotal } from "@/lib/game/engine";
import { languagesOf, speaksLanguage } from "@/lib/game/field";
import { ATTRIBUTES, RANKS, SKILLS } from "@/lib/game/rules";
import type { GameState, RankId } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { REGIONS, findCity, findCountry, type RegionId } from "@/lib/world/geo";
import { tensionLabel } from "@/lib/world/world";
import { SkillGlyph } from "./glyphs";
import { SeatSigil } from "./sigils";
import { RankBadge } from "./ui";

/**
 * La cérémonie d'une promotion choisie par le joueur :
 * le Brevet (choix de la Station), la prise d'un siège au Cercle, ou une nomination.
 */
export function CareerCeremony({
  state,
  rank,
  onConfirm,
  onClose,
}: {
  state: GameState;
  rank: RankId;
  onConfirm: (opts: { seat?: string; station?: string }) => void;
  onClose: () => void;
}) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const color = agency.color;
  const mode = rank === "agent" || rank === "chef_station" ? "station" : rank === "titulaire" ? "seat" : "confirm";
  const [selected, setSelected] = useState<string | null>(mode === "station" && rank === "chef_station" ? c.station : null);
  const [confirming, setConfirming] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const missing = rankMissing(state, rank);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (confirming ? setConfirming(false) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, onClose]);

  const pick = (id: string) => {
    setSelected(id);
    setConfirming(false);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const header =
    mode === "seat"
      ? { kicker: `${agency.name} · ${agency.ceremony.place}`, title: agency.ceremony.name, text: agency.ceremony.text }
      : rank === "agent"
        ? {
            kicker: `${agency.name} · ${agency.academy.split(",")[0]}`,
            title: "Le Brevet",
            text: "Le Serment de Lucerne, un matricule, et une affectation. Choisis la Station où tu feras tes premières armes : sa région deviendra ton terrain.",
          }
        : rank === "chef_station"
          ? { kicker: `${agency.name} · Direction`, title: "Prendre une Station", text: "Une ville, un budget, des officiers, des informateurs. Choisis la Station que tu diriges." }
          : { kicker: `${agency.name} · Direction`, title: `Nomination : ${RANKS[rank].label}`, text: RANKS[rank].powers };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={header.title}
      className="fixed inset-0 z-[60] overflow-y-auto"
      style={{ background: `radial-gradient(ellipse 90% 60% at 50% -10%, ${tint(color, 22)}, transparent 70%), var(--color-ink)` }}
    >
      <button onClick={onClose} className="fixed top-4 right-4 z-10 rounded-sm border border-line bg-ink/70 px-3 py-1.5 text-[11px] tracking-[0.15em] text-muted uppercase backdrop-blur hover:text-ivory">
        Plus tard ✕
      </button>
      <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6">
        <header className="animate-rise text-center">
          <p className="label tracking-[0.45em]" style={{ color }}>
            {header.kicker}
          </p>
          <h1 className="mt-4 font-serif text-5xl leading-tight sm:text-6xl">{header.title}</h1>
          <p className="mx-auto mt-5 max-w-2xl font-serif text-lg leading-relaxed text-ivory/75 italic">{header.text}</p>
          {missing.length > 0 && <p className="mt-4 text-sm text-fail">Pas encore : {missing.join(" ; ")}.</p>}
        </header>

        {mode === "station" && <StationChoice state={state} selected={selected} onPick={pick} />}
        {mode === "seat" && <SeatChoice state={state} selected={selected} onPick={pick} />}

        <div ref={detailRef} className="scroll-mt-6">
          {(mode === "confirm" || selected) && missing.length === 0 && (
            <section className="animate-rise mx-auto mt-10 max-w-2xl rounded-sm border p-6 text-center" style={{ borderColor: tint(color, 45), background: tint(color, 6) }}>
              <RankBadge rank={rank} className="mx-auto h-12 w-10" />
              <p className="mt-3 font-serif text-2xl">{RANKS[rank].label}</p>
              <p className="mt-1 text-sm text-ivory/80">{RANKS[rank].powers}</p>
              <p className="mt-1 text-xs text-muted">{RANKS[rank].duties}</p>
              {rank === "controleur" && c.seat && <p className="mt-2 text-xs text-partial">Tu quittes ton siège au Cercle : il sera libre pour un autre.</p>}
              <button
                onClick={() => (confirming ? onConfirm(mode === "station" ? { station: selected! } : mode === "seat" ? { seat: selected! } : {}) : setConfirming(true))}
                className="mt-5 w-full rounded-sm px-5 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all hover:brightness-110"
                style={{ background: color, color: "var(--color-ink)", boxShadow: confirming ? `0 0 0 3px ${tint(color, 35)}` : undefined }}
              >
                {confirming ? "Je confirme" : mode === "seat" ? `Prendre ${AGENCIES[c.identity.agency].seats.find((x) => x.id === selected)?.name}` : mode === "station" ? `Station de ${findCity(selected!)?.name}` : "Accepter"}
              </button>
              <p className="mt-2 text-[11px] text-faint">{confirming ? "La cérémonie va se jouer dans le récit." : "Un choix qui engage toute ta carrière."}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StationChoice({ state, selected, onPick }: { state: GameState; selected: string | null; onPick: (id: string) => void }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const color = agency.color;
  return (
    <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {agency.stations.map((id, i) => {
        const city = findCity(id)!;
        const country = findCountry(city.country);
        const region = country?.region as RegionId;
        const t = state.world.geo.tensions[region] ?? 50;
        const langs = languagesOf(city.country);
        const speaks = langs.some((l) => speaksLanguage(c, l));
        const threats = state.world.geo.threats.filter((x) => x.region === region && x.known).length;
        const people = state.relations.filter((r) => r.cityId === id).length;
        const on = selected === id;
        return (
          <li key={id} className="animate-rise" style={{ animationDelay: `${80 + i * 50}ms`, animationFillMode: "backwards" }}>
            <button
              onClick={() => onPick(id)}
              className={`flex h-full w-full flex-col rounded-sm border p-4 text-left transition-all ${on ? "-translate-y-1" : "hover:-translate-y-0.5"}`}
              style={{ borderColor: on ? color : "var(--color-line)", background: on ? tint(color, 12) : tint(color, 4) }}
            >
              <p className="font-serif text-2xl leading-tight" style={{ color: on ? color : undefined }}>
                {city.name}
              </p>
              <p className="text-[11px] tracking-wide text-muted uppercase">
                {country?.name} · {REGIONS[region]?.label}
              </p>
              {country?.note && <p className="mt-2 line-clamp-3 text-xs text-ivory/70">{country.note}</p>}
              <div className="mt-auto space-y-1 pt-3 text-[11px]">
                <p>
                  Région <span className={t >= 60 ? "text-fail" : "text-muted"}>{tensionLabel(t)}</span>
                  {threats ? <span className="text-fail"> · {threats} menace{threats > 1 ? "s" : ""}</span> : null}
                </p>
                <p className={speaks ? "text-success" : "text-faint"}>
                  {langs.join(", ")} {speaks ? "✓" : ""}
                </p>
                {people > 0 && <p className="text-brass">{people} de tes liens y vivent</p>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SeatChoice({ state, selected, onPick }: { state: GameState; selected: string | null; onPick: (id: string) => void }) {
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const color = agency.color;
  const free = new Set(freeSeats(state).map((s) => s.id));
  const taken = occupiedSeats(state);
  const holder = (seat: SeatDef) => state.roster.find((o) => o.agency === agency.id && o.seat === seat.id && o.status !== "mort" && o.status !== "retraite");
  const affinity = useMemo(() => {
    const avg = (s: SeatDef) => s.specialty.reduce((n, k) => n + skillTotal(c, k), 0) / s.specialty.length;
    const best = Math.max(...agency.seats.filter((s) => free.has(s.id)).map(avg), 1);
    return (s: SeatDef) => Math.max(1, Math.round((avg(s) / best) * 5));
  }, [agency, c, free]);
  const chosen = agency.seats.find((s) => s.id === selected);

  return (
    <>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {agency.seats.map((s, i) => {
          const isFree = free.has(s.id);
          const h = holder(s);
          const on = selected === s.id;
          return (
            <li key={s.id} className="animate-rise" style={{ animationDelay: `${80 + i * 50}ms`, animationFillMode: "backwards" }}>
              <button
                disabled={!isFree}
                onClick={() => onPick(s.id)}
                className={`flex h-full w-full flex-col items-center rounded-sm border px-3 pt-5 pb-4 text-center transition-all ${isFree ? (on ? "-translate-y-1" : "hover:-translate-y-1") : "opacity-45"}`}
                style={{ borderColor: on ? color : isFree ? tint(color, 50) : "var(--color-line)", background: on ? tint(color, 12) : tint(color, isFree ? 6 : 2) }}
              >
                <span style={{ color }}>
                  <SeatSigil agency={agency.id} seat={s.id} number={s.number} className="h-16 w-16" />
                </span>
                <p className="mt-2 font-serif text-lg leading-tight" style={{ color: on ? color : undefined }}>
                  {s.name}
                </p>
                <p className="mt-1 text-[10px] tracking-wide text-muted">{s.specialty.map((k) => SKILLS[k].label).join(" · ")}</p>
                <p className="mt-auto pt-3 text-[10px] tracking-[0.15em] uppercase">
                  {isFree ? (
                    <span style={{ color }}>Vacant · {"◆".repeat(affinity(s))}</span>
                  ) : (
                    <span className="text-faint">{h ? `« ${h.codename} »${h.status === "en_mission" ? " · en mission" : ""}` : taken.has(s.id) ? "occupé" : ""}</span>
                  )}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen && (
        <section className="animate-rise mt-8 grid gap-6 rounded-sm border p-6 lg:grid-cols-[180px_1fr]" style={{ borderColor: tint(color, 45), background: tint(color, 5) }}>
          <div className="text-center" style={{ color }}>
            <SeatSigil agency={agency.id} seat={chosen.id} number={chosen.number} className="mx-auto h-28 w-28" />
            <p className="mt-2 font-serif text-2xl">{chosen.name}</p>
            <p className="text-xs text-muted">Nom de code : « {chosen.name.replace(/^le Banc d(?:e |')/, "")} »</p>
          </div>
          <div>
            <p className="font-serif text-lg text-ivory/90 italic">{chosen.heritage}</p>
            <p className="mt-3 text-sm">
              <span style={{ color }}>✦ {chosen.signature.name}.</span> {chosen.signature.description} <span className="text-faint">(une fois par mission)</span>
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {chosen.specialty.map((k) => (
                <li key={k} className="flex items-center gap-2 rounded-sm border border-line/70 px-2.5 py-1.5 text-sm">
                  <SkillGlyph skill={k} className="h-4 w-4" />
                  <span className="flex-1">{SKILLS[k].label}</span>
                  <span className="font-mono" style={{ color: ATTRIBUTES[SKILLS[k].attribute].color }}>
                    {skillTotal(c, k)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Hors mission, l'expérience sur ces compétences rapporte +{SEAT_XP_BONUS}.</p>
          </div>
        </section>
      )}
    </>
  );
}
