"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENCIES } from "@/lib/game/agencies";
import { parseIso } from "@/lib/game/calendar";
import { POSSESSIONS, weeklyUpkeep } from "@/lib/game/economy";
import { RELATION_LIMIT } from "@/lib/game/engine";
import { ACTIVITIES, planError } from "@/lib/game/planner";
import { RANKS, SKILLS, formatEuros } from "@/lib/game/rules";
import { SCHEDULE_KINDS, dayToIso, isoToDay, schedule, type ScheduleItem } from "@/lib/game/schedule";
import { TOPICS, gradeLabel } from "@/lib/game/sources";
import type { ActivityChoice, GameState, PlayerAction, Relation, SkillId } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { REGIONS, findCity } from "@/lib/world/geo";
import { CONTACT_INTENTS, Carnet, KIND_LABELS } from "./CharacterSheet";
import { AskPerson, GRADE_COLOR } from "./IntelUI";
import { DOC_LABELS, StoryDocView } from "./StoryCards";
import type { NavTarget } from "./Terminal";
import { Possessions } from "./WeekPlanner";

export type PhoneApp = "agenda" | "messages" | "reseau" | "banque" | "sante" | "notes" | "photos" | "infos";

const APPS: { id: PhoneApp; label: string; icon: string; color: string }[] = [
  { id: "agenda", label: "Agenda", icon: "▦", color: "#c8553d" },
  { id: "messages", label: "Messages", icon: "✉", color: "#3f9a5b" },
  { id: "reseau", label: "Réseau", icon: "⌕", color: "#3a66c4" },
  { id: "banque", label: "Banque", icon: "€", color: "#b08a3e" },
  { id: "sante", label: "Santé", icon: "✚", color: "#c2414b" },
  { id: "notes", label: "Notes", icon: "✎", color: "#d1a93a" },
  { id: "photos", label: "Pièces", icon: "▣", color: "#7b5cc4" },
  { id: "infos", label: "Dépêches", icon: "◎", color: "#4b8e9c" },
];

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const dayName = (iso: string) => parseIso(iso).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
const shortDate = (iso: string) => parseIso(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const inDays = (n: number) => (n <= 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} j`);

/**
 * Le téléphone de service : toujours dans la poche. L'agenda, les contacts, les réponses
 * attendues, le compte en banque, la santé, les notes, les pièces gardées et les dépêches.
 */
export function Phone({
  state,
  plan,
  app: initialApp,
  onChange,
  onAction,
  onClose,
  go,
}: {
  state: GameState;
  plan: ActivityChoice[];
  app?: PhoneApp | null;
  onChange?: (s: GameState) => void;
  onAction?: (a: PlayerAction) => void;
  onClose: () => void;
  go: (t: NavTarget) => void;
}) {
  const [app, setApp] = useState<PhoneApp | null>(initialApp ?? null);
  useEffect(() => setApp(initialApp ?? null), [initialApp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const items = useMemo(() => schedule(state), [state]);
  const today = state.world.day;
  const urgent = items.filter((i) => i.urgent).length;
  const battery = Math.max(5, 100 - (c.fatigue ?? 0));
  const signal = Math.round(((c.cover ?? 50) / 100) * 4);
  const current = APPS.find((a) => a.id === app);
  const badges: Partial<Record<PhoneApp, number>> = {
    agenda: urgent,
    reseau: state.knowledge?.requests?.length ?? 0,
    sante: (c.injuries ?? []).length,
  };

  return (
    <div className="animate-rise fixed inset-2 z-[66] sm:inset-auto sm:bottom-4 sm:left-4 sm:h-[min(690px,calc(100dvh-5rem))] sm:w-[340px]" role="dialog" aria-label="Téléphone">
      <div className="flex h-full flex-col overflow-hidden rounded-[2.2rem] border-[9px] border-[#0b0c10] bg-ink shadow-[0_25px_70px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {/* Barre d'état. */}
        <div className="relative flex shrink-0 items-center justify-between px-5 pt-2 pb-1 text-[11px] font-semibold">
          <span className="font-mono">{shortDate(dayToIso(state, today))}</span>
          <span aria-hidden className="absolute top-1.5 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0b0c10]" />
          <span className="flex items-center gap-1.5">
            <span className="flex items-end gap-px" title={`Couverture civile ${c.cover ?? 0}`}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={`w-[3px] rounded-[1px] ${i <= signal ? "bg-ivory" : "bg-ivory/25"}`} style={{ height: 3 + i * 2 }} />
              ))}
            </span>
            <span className="flex items-center" title={`Énergie ${battery} %`}>
              <span className="relative h-2.5 w-5 rounded-[3px] border border-ivory/70 p-px">
                <span className="block h-full rounded-[1px]" style={{ width: `${battery}%`, background: battery < 25 ? "var(--color-fail)" : "var(--color-ivory)" }} />
              </span>
              <span className="h-1 w-0.5 rounded-r bg-ivory/70" />
            </span>
            <button onClick={onClose} className="ml-1 text-faint hover:text-ivory" aria-label="Ranger le téléphone" title="Ranger (Échap)">
              ✕
            </button>
          </span>
        </div>

        {current ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <button onClick={() => setApp(null)} className="text-lg leading-none text-brass hover:text-brass-soft" aria-label="Accueil">
              ‹
            </button>
            <span className="grid h-6 w-6 place-items-center rounded-md text-xs text-white" style={{ background: current.color }}>
              {current.icon}
            </span>
            <span className="font-semibold">{current.label}</span>
          </div>
        ) : null}

        <div key={app ?? "home"} className="scrollbar-thin animate-rise min-h-0 flex-1 overflow-y-auto">
          {app === null && (
            <Home state={state} items={items} badges={badges} onOpen={setApp} agencyColor={agency.color} />
          )}
          {app === "agenda" && <AgendaApp state={state} items={items} plan={plan} go={go} />}
          {app === "messages" && <MessagesApp state={state} onChange={onChange} onAction={onAction} />}
          {app === "reseau" && <NetworkApp state={state} go={go} />}
          {app === "banque" && <BankApp state={state} onChange={onChange} />}
          {app === "sante" && <HealthApp state={state} />}
          {app === "notes" && (
            <div className="p-4">
              <Carnet state={state} />
            </div>
          )}
          {app === "photos" && <PhotosApp state={state} />}
          {app === "infos" && <NewsApp state={state} />}
        </div>

        {/* La barre d'accueil. */}
        <button onClick={() => setApp(null)} className="flex shrink-0 justify-center py-2" aria-label="Écran d'accueil">
          <span className="h-1 w-28 rounded-full bg-ivory/40 hover:bg-ivory/70" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accueil                                                             */
/* ------------------------------------------------------------------ */

function Home({ state, items, badges, onOpen, agencyColor }: { state: GameState; items: ScheduleItem[]; badges: Partial<Record<PhoneApp, number>>; onOpen: (a: PhoneApp) => void; agencyColor: string }) {
  const iso = dayToIso(state, state.world.day);
  const next = items.filter((i) => i.day >= state.world.day).slice(0, 3);
  const city = findCity(state.world.cityId);
  return (
    <div className="min-h-full px-4 pt-4 pb-6" style={{ background: `radial-gradient(circle at 30% 0%, ${tint(agencyColor, 30)}, transparent 60%)` }}>
      <div className="text-center">
        <p className="text-xs tracking-wide text-muted capitalize">{dayName(iso)}</p>
        <p className="font-serif text-5xl leading-none">{parseIso(iso).getUTCDate()}</p>
        <p className="text-xs text-muted capitalize">
          {parseIso(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}
          {city ? ` · ${city.name}` : ""}
        </p>
      </div>
      {/* Le widget de l'agenda. */}
      <button onClick={() => onOpen("agenda")} className="mt-4 block w-full rounded-2xl bg-panel/80 p-3 text-left shadow-lg ring-1 ring-white/5 backdrop-blur">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">À venir</p>
        {next.length === 0 ? (
          <p className="mt-1 text-xs text-faint">Rien de prévu. Profites-en.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {next.map((i, n) => (
              <li key={n} className="flex items-center gap-2 text-xs">
                <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: SCHEDULE_KINDS[i.kind].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{i.title}</span>
                  <span className={`text-[10px] ${i.urgent ? "text-fail" : "text-faint"}`}>
                    {inDays(i.day - state.world.day)} · {shortDate(i.date)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </button>
      <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-4">
        {APPS.map((a) => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="group flex flex-col items-center gap-1">
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl text-xl text-white shadow-md transition-transform group-hover:-translate-y-0.5" style={{ background: `linear-gradient(160deg, ${a.color}, color-mix(in srgb, ${a.color} 60%, black))` }}>
              {a.icon}
              {badges[a.id] ? <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-fail px-1 text-[10px] leading-4 font-bold text-white">{badges[a.id]}</span> : null}
            </span>
            <span className="text-[10px] text-ivory/85">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

function AgendaApp({ state, items, plan, go }: { state: GameState; items: ScheduleItem[]; plan: ActivityChoice[]; go: (t: NavTarget) => void }) {
  const todayIso = dayToIso(state, state.world.day);
  const t = parseIso(todayIso);
  const [month, setMonth] = useState({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  const [picked, setPicked] = useState<string>(todayIso);
  const first = new Date(Date.UTC(month.y, month.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const byDate = new Map<string, ScheduleItem[]>();
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  const iso = (d: number) => `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const list = byDate.get(picked) ?? [];
  const pickedDay = isoToDay(state, picked);
  const atBase = state.world.phase === "base" && !state.mission;
  const err = atBase ? planError(state, plan) : null;
  // La semaine en cours : les sept jours à venir.
  const weekEnd = state.world.day + 7;
  const thisWeek = items.filter((i) => i.day >= state.world.day && i.day < weekEnd);

  return (
    <div className="space-y-4 p-3">
      {atBase && (
        <div className="rounded-xl bg-panel p-3 ring-1 ring-line">
          <p className="flex items-baseline justify-between text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">
            Cette semaine
            <button onClick={() => go({ to: "qg" })} className="tracking-normal text-brass-soft normal-case hover:underline">
              Modifier au QG ›
            </button>
          </p>
          <ol className="mt-2 grid grid-cols-3 gap-1.5">
            {plan.map((p, i) => (
              <li key={i} className="rounded-lg bg-night/60 px-1.5 py-2 text-center">
                <span className="block text-lg leading-none">{ACTIVITIES[p.activity]?.icon}</span>
                <span className="mt-1 block truncate text-[10px]">{ACTIVITIES[p.activity]?.label}</span>
              </li>
            ))}
          </ol>
          {err && <p className="mt-1.5 text-[10px] text-fail">{err}</p>}
          {thisWeek.length > 0 && <p className="mt-1.5 text-[10px] text-muted">{thisWeek.length} chose{thisWeek.length > 1 ? "s" : ""} d'ici sept jours.</p>}
        </div>
      )}

      <div className="rounded-xl bg-panel p-3 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))} className="px-2 text-brass" aria-label="Mois précédent">
            ‹
          </button>
          <p className="text-sm font-semibold capitalize">{first.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
          <button onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))} className="px-2 text-brass" aria-label="Mois suivant">
            ›
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[10px] text-faint">
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`x${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1;
            const key = iso(d);
            const ev = byDate.get(key) ?? [];
            const isToday = key === todayIso;
            const past = key < todayIso;
            return (
              <button
                key={key}
                onClick={() => setPicked(key)}
                className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-xs transition-colors ${
                  key === picked ? "bg-brass text-ink" : isToday ? "ring-1 ring-brass" : past ? "text-faint" : "text-ivory/90 hover:bg-ivory/5"
                }`}
              >
                {d}
                <span className="flex h-1 gap-0.5">
                  {ev.slice(0, 3).map((e, n) => (
                    <span key={n} className="h-1 w-1 rounded-full" style={{ background: key === picked ? "var(--color-ink)" : SCHEDULE_KINDS[e.kind].color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="px-1 text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">
          {picked === todayIso ? "Aujourd'hui" : `${dayName(picked)} ${shortDate(picked)}`}
          {pickedDay !== state.world.day && <span className="ml-1 tracking-normal normal-case">· {pickedDay < state.world.day ? "passé" : inDays(pickedDay - state.world.day)}</span>}
        </p>
        {list.length === 0 ? (
          <p className="px-1 pt-1 text-xs text-faint">Rien ce jour-là.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {list.map((i, n) => (
              <EventRow key={n} item={i} go={go} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="px-1 text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Prochainement</p>
        <ul className="mt-1.5 space-y-1.5">
          {items
            .filter((i) => i.day >= state.world.day)
            .slice(0, 8)
            .map((i, n) => (
              <EventRow key={n} item={i} go={go} when={`${inDays(i.day - state.world.day)} · ${shortDate(i.date)}`} />
            ))}
        </ul>
      </div>
    </div>
  );
}

function EventRow({ item, go, when }: { item: ScheduleItem; go: (t: NavTarget) => void; when?: string }) {
  const k = SCHEDULE_KINDS[item.kind];
  const target: NavTarget | null = item.kind === "mission" && item.ref ? { to: "qg", offer: item.ref } : item.kind === "devoir" ? { to: "qg" } : item.cityId ? { to: "carte", city: item.cityId } : null;
  const body = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm" style={{ background: tint(k.color, 18), color: k.color }}>
        {k.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{item.title}</span>
        <span className={`block truncate text-[10px] ${item.urgent ? "text-fail" : "text-faint"}`}>
          {when ?? k.label}
          {item.detail ? ` · ${item.detail}` : ""}
        </span>
      </span>
      {target && <span className="text-faint">›</span>}
    </>
  );
  return (
    <li>
      {target ? (
        <button onClick={() => go(target)} className="flex w-full items-center gap-2.5 rounded-xl bg-panel px-2.5 py-2 text-left ring-1 ring-line hover:ring-brass/50">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-panel px-2.5 py-2 ring-1 ring-line">{body}</div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

function Avatar({ r, size = 40 }: { r: Relation; size?: number }) {
  const kind = KIND_LABELS[r.kind] ?? KIND_LABELS.contact;
  const initials = r.name
    .replace(/[«»"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size / 2.8, background: `linear-gradient(150deg, ${kind.color}, color-mix(in srgb, ${kind.color} 55%, black))` }}>
      {initials}
      {r.status === "actif" && <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-ink bg-success" />}
    </span>
  );
}

function MessagesApp({ state, onChange, onAction }: { state: GameState; onChange?: (s: GameState) => void; onAction?: (a: PlayerAction) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const day = state.world.day;
  const active = state.relations.filter((r) => r.status !== "archive" && r.status !== "mort").sort((a, b) => b.lastSeenDay - a.lastSeenDay);
  const r = state.relations.find((x) => x.name === open);
  if (r) return <Conversation state={state} r={r} onBack={() => setOpen(null)} onChange={onChange} onAction={onAction} />;
  const shown = active.filter((x) => `${x.name} ${x.role}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="p-3">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher" className="w-full rounded-lg bg-panel px-3 py-1.5 text-xs ring-1 ring-line outline-none focus:ring-brass/50" />
      <p className="mt-2 px-1 text-[10px] text-faint">
        {active.length}/{RELATION_LIMIT} contacts suivis
      </p>
      {shown.length === 0 ? (
        <p className="mt-6 text-center text-xs text-faint">{active.length ? "Personne de ce nom." : "Ton répertoire est vide. Ça viendra."}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {shown.map((x) => {
            const waiting = state.knowledge?.requests?.find((q) => q.source === "relation" && q.sourceRef === x.name);
            const since = day - x.lastSeenDay;
            return (
              <li key={x.name}>
                <button onClick={() => setOpen(x.name)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <Avatar r={x} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{x.name}</span>
                      <span className="shrink-0 text-[10px] text-faint">{since <= 0 ? "auj." : `${since} j`}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted">{waiting ? `⌛ réponse attendue J${waiting.readyDay}` : x.status !== "actif" ? x.status : x.role}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Conversation({ state, r, onBack, onChange, onAction }: { state: GameState; r: Relation; onBack: () => void; onChange?: (s: GameState) => void; onAction?: (a: PlayerAction) => void }) {
  const [text, setText] = useState("");
  const kind = KIND_LABELS[r.kind] ?? KIND_LABELS.contact;
  const reachable = r.status === "actif";
  const city = findCity(r.cityId);
  const send = (t: string) => {
    if (!onAction || !t.trim()) return;
    onAction({ type: "contact", name: r.name, intent: t.trim() });
    setText("");
  };
  const meter = (label: string, value: number, color: string, signed = false) => (
    <div>
      <p className="flex justify-between text-[9px] tracking-[0.12em] text-muted uppercase">
        {label}
        <span className="font-mono text-ivory/80">{signed && value > 0 ? `+${value}` : value}</span>
      </p>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${signed ? (value + 100) / 2 : value}%`, background: color }} />
      </div>
    </div>
  );
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col items-center gap-1 border-b border-line px-4 pt-3 pb-3 text-center">
        <button onClick={onBack} className="self-start text-[11px] text-brass">
          ‹ Contacts
        </button>
        <Avatar r={r} size={56} />
        <p className="font-serif text-xl leading-tight">{r.name}</p>
        <p className="text-[11px] text-muted">
          <span style={{ color: kind.color }}>{kind.label}</span> · {r.role}
        </p>
        <p className="text-[10px] text-faint">
          {city ? city.name : r.location}
          {r.knownAs && r.knownAs !== "reel" ? ` · te connaît comme « ${r.knownAs === "code" ? "ton nom de code" : r.knownAs} »` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        {meter("Affinité", r.affinity, r.affinity >= 25 ? "var(--color-success)" : r.affinity <= -25 ? "var(--color-fail)" : "var(--color-muted)", true)}
        {meter("Lien", r.bond ?? 50, (r.bond ?? 50) < 25 ? "var(--color-fail)" : "var(--pole-ame)")}
      </div>
      <div className="flex-1 space-y-2 px-4 pb-3">
        {/* La « conversation » : ce que tu sais, en bulles. */}
        <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-panel px-3 py-2 text-xs ring-1 ring-line">
          {r.favors > 0 ? `Je te dois ${r.favors === 1 ? "une faveur" : `${r.favors} faveurs`}.` : r.favors < 0 ? `Tu me dois ${-r.favors === 1 ? "une faveur" : `${-r.favors} faveurs`}.` : "On est quittes."}
        </p>
        {r.knows && <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-panel px-3 py-2 text-xs ring-1 ring-line">Je sais : {r.knows}.</p>}
        {r.notes && <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brass/20 px-3 py-2 text-xs">{r.notes}</p>}
        <p className="pt-1 text-center text-[10px] text-faint">Dernier échange il y a {Math.max(0, state.world.day - r.lastSeenDay)} j</p>
      </div>
      {reachable ? (
        <div className="sticky bottom-0 space-y-2 border-t border-line bg-ink/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between">
            <AskPerson state={state} source="relation" refId={r.name} onChange={onChange} />
          </div>
          {onAction && (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {CONTACT_INTENTS.map((i) => (
                  <button key={i} onClick={() => send(i)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[10px] text-muted hover:border-brass hover:text-ivory">
                    {i}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
                className="flex gap-1.5"
              >
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Écrire un message…" className="min-w-0 flex-1 rounded-full bg-panel px-3 py-1.5 text-xs ring-1 ring-line outline-none focus:ring-brass/50" />
                <button type="submit" disabled={!text.trim()} className="grid h-7 w-7 place-items-center rounded-full bg-brass text-ink disabled:opacity-40" aria-label="Envoyer">
                  ↑
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-xs text-faint">Injoignable.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Réseau                                                              */
/* ------------------------------------------------------------------ */

function NetworkApp({ state, go }: { state: GameState; go: (t: NavTarget) => void }) {
  const requests = state.knowledge?.requests ?? [];
  const answers = (state.pieces ?? []).filter((p) => p.topic).slice(-5).reverse();
  return (
    <div className="space-y-4 p-3">
      <div>
        <p className="px-1 text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">En attente · {requests.length}</p>
        {requests.length === 0 ? (
          <p className="px-1 pt-1 text-xs text-faint">Aucune question en vol.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {requests.map((r) => {
              const total = Math.max(1, r.readyDay - r.filedDay);
              const done = Math.min(1, Math.max(0, (state.world.day - r.filedDay) / total));
              return (
                <li key={r.id} className="rounded-xl bg-panel px-3 py-2 ring-1 ring-line">
                  <p className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{TOPICS[r.kind].label}</span>
                    <span className="shrink-0 font-mono text-[10px]" style={{ color: GRADE_COLOR[r.grade[0]] }} title={gradeLabel(r.grade)}>
                      {r.grade}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-muted">{r.label}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-[var(--pole-esprit)]" style={{ width: `${done * 100}%` }} />
                  </div>
                  <p className="mt-0.5 flex justify-between text-[10px] text-faint">
                    <span className="truncate">{r.sourceLabel}</span>
                    <span>{inDays(r.readyDay - state.world.day)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <p className="px-1 text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Dernières réponses</p>
        {answers.length === 0 ? (
          <p className="px-1 pt-1 text-xs text-faint">Rien reçu pour l'instant.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {answers.map((a, i) => (
              <li key={i} className="flex items-baseline gap-2 px-1 text-xs">
                <span className="font-mono text-[10px]" style={{ color: GRADE_COLOR[a.grade?.[0] ?? "C"] }}>
                  {a.grade}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.titre}</span>
                <span className="text-[10px] text-faint">J{a.day}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => go({ to: "renseignement" })} className="rounded-xl bg-panel py-2 text-xs ring-1 ring-line hover:ring-brass/50">
          ⌕ Poser une question
        </button>
        <button onClick={() => go({ to: "archives" })} className="rounded-xl bg-panel py-2 text-xs ring-1 ring-line hover:ring-brass/50">
          ▤ Archives
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Banque                                                              */
/* ------------------------------------------------------------------ */

function BankApp({ state, onChange }: { state: GameState; onChange?: (s: GameState) => void }) {
  const c = state.character;
  const income = RANKS[c.rank].allowance ?? 0;
  const upkeep = weeklyUpkeep(state);
  const net = income - upkeep;
  const owned = (c.possessions ?? []).map((id) => POSSESSIONS.find((p) => p.id === id)).filter(Boolean);
  return (
    <div className="space-y-4 p-3">
      <div className="rounded-2xl p-4 text-white shadow-lg" style={{ background: "linear-gradient(135deg, #2c3e50, #1a252f 60%, #b08a3e)" }}>
        <p className="text-[10px] tracking-[0.2em] uppercase opacity-70">Compte courant</p>
        <p className="mt-1 font-mono text-3xl">{formatEuros(c.money)}</p>
        <p className="mt-3 flex justify-between font-mono text-[11px] opacity-80">
          <span>{c.matricule ?? "•••• ••••"}</span>
          <span>
            {c.identity.firstName[0]}. {c.identity.lastName.toUpperCase()}
          </span>
        </p>
      </div>
      <div className="rounded-xl bg-panel p-3 ring-1 ring-line">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Chaque semaine</p>
        <dl className="mt-1.5 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted">Solde versée</dt>
            <dd className="font-mono text-success">+{formatEuros(income)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Entretien</dt>
            <dd className="font-mono text-partial">−{formatEuros(upkeep)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1">
            <dt>Reste</dt>
            <dd className={`font-mono ${net < 0 ? "text-fail" : ""}`}>
              {net >= 0 ? "+" : ""}
              {formatEuros(net)}
            </dd>
          </div>
        </dl>
        {state.world.phase === "mission" && (
          <p className="mt-2 flex justify-between text-xs">
            <span className="text-muted">Fonds d'opération</span>
            <span className="font-mono">{formatEuros(c.missionFunds)}</span>
          </p>
        )}
        <p className="mt-2 text-[10px] text-faint">
          Plafond des fonds d'opération : {RANKS[c.rank].fundsCap ? formatEuros(RANKS[c.rank].fundsCap) : "—"}
          {RANKS[c.rank].order >= RANKS.agent.order ? " · prime : 1 000 € par point de mérite" : ""}
        </p>
      </div>
      {owned.length > 0 && (
        <p className="px-1 text-[11px] text-muted">Tes biens : {owned.map((p) => p!.name).join(", ")}</p>
      )}
      {RANKS[c.rank].order >= RANKS.aspirant.order && !c.prison && <Possessions state={state} onChange={onChange} compact />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Santé                                                               */
/* ------------------------------------------------------------------ */

function Ring({ value, max, color, label, sub }: { value: number; max: number; color: string; label: string; sub: string }) {
  const r = 26;
  const p = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * r * p} ${2 * Math.PI * r}`} className="transition-all duration-700" />
      </svg>
      <p className="-mt-11 mb-5 font-mono text-sm">{sub}</p>
      <p className="text-[10px] tracking-[0.12em] text-muted uppercase">{label}</p>
    </div>
  );
}

function HealthApp({ state }: { state: GameState }) {
  const c = state.character;
  const day = state.world.day;
  const energy = 100 - (c.fatigue ?? 0);
  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-panel py-4 ring-1 ring-line">
        <Ring value={c.health} max={c.healthMax} color="var(--pole-corps)" label="Santé" sub={`${c.health}/${c.healthMax}`} />
        <Ring value={c.morale} max={c.moraleMax} color="var(--pole-ame)" label="Moral" sub={`${c.morale}/${c.moraleMax}`} />
        <Ring value={energy} max={100} color={energy < 40 ? "var(--color-fail)" : "var(--color-success)"} label="Énergie" sub={`${energy}`} />
      </div>
      {(c.fatigue ?? 0) >= 60 && <p className="rounded-xl bg-fail/10 px-3 py-2 text-xs text-fail">Épuisement : tes jets en souffrent. Une semaine de repos s'impose.</p>}
      <div>
        <p className="px-1 text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Blessures et séquelles</p>
        {(c.injuries ?? []).length === 0 ? (
          <p className="px-1 pt-1 text-xs text-faint">Aucune. Pour l'instant.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {c.injuries.map((i) => (
              <li key={i.id} className="rounded-xl bg-panel px-3 py-2 ring-1 ring-line">
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span>{i.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{i.healDay === undefined ? "à vie" : i.healDay > day ? inDays(i.healDay - day) : "presque guérie"}</span>
                </p>
                <p className="text-[11px] text-fail/90">
                  {Object.entries(i.malus)
                    .map(([k, v]) => `${SKILLS[k as SkillId]?.label ?? k} ${v}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl bg-panel px-3 py-2 ring-1 ring-line">
        <p className="flex justify-between text-xs">
          <span className="text-muted">Couverture civile</span>
          <span className="font-mono">{c.cover ?? 0}/100</span>
        </p>
        <p className="text-[10px] text-faint">Ta vie officielle : études, famille, voisins. Trop basse, on finit par poser des questions.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pièces et dépêches                                                  */
/* ------------------------------------------------------------------ */

function PhotosApp({ state }: { state: GameState }) {
  const pieces = [...(state.pieces ?? [])].reverse();
  const [open, setOpen] = useState<number | null>(null);
  if (open !== null && pieces[open])
    return (
      <div className="p-2">
        <button onClick={() => setOpen(null)} className="px-1 pb-1 text-[11px] text-brass">
          ‹ Toutes les pièces
        </button>
        <div className="text-base">
          <StoryDocView doc={pieces[open]} />
        </div>
      </div>
    );
  if (!pieces.length) return <p className="p-6 text-center text-xs text-faint">Les messages, lettres, coupures et photos que tu garderas s'afficheront ici.</p>;
  return (
    <div className="grid grid-cols-3 gap-1 p-1">
      {pieces.map((d, i) => (
        <button key={i} onClick={() => setOpen(i)} className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-md p-1.5 text-left" style={{ background: d.type === "photo" ? "linear-gradient(160deg, #3a3f47, #15171b)" : d.type === "presse" ? "#e9e2cf" : d.type === "lettre" ? "#efe7d3" : d.type === "chiffre" ? "#0f1a12" : "var(--color-panel)" }}>
          <span className={`absolute top-1 left-1.5 text-lg ${d.type === "presse" || d.type === "lettre" ? "text-[#24201a]/60" : "text-ivory/60"}`}>{DOC_LABELS[d.type].icon}</span>
          <span className={`line-clamp-2 text-[9px] leading-tight ${d.type === "presse" || d.type === "lettre" ? "text-[#24201a]" : d.type === "chiffre" ? "text-[#7fd36b]" : "text-ivory/90"}`}>{d.titre}</span>
        </button>
      ))}
    </div>
  );
}

function NewsApp({ state }: { state: GameState }) {
  const news = state.world.geo.news;
  if (!news.length) return <p className="p-6 text-center text-xs text-faint">Rien d'inhabituel… pour l'instant.</p>;
  return (
    <ul className="divide-y divide-line">
      {news.slice(0, 30).map((n, i) => (
        <li key={i} className="px-4 py-3">
          <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
            {REGIONS[n.region as keyof typeof REGIONS]?.label ?? n.region} · J{n.day}
            {n.player && <span className="ml-1 text-brass">· ton œuvre</span>}
          </p>
          <p className="mt-0.5 text-sm leading-snug">{n.text}</p>
        </li>
      ))}
    </ul>
  );
}
