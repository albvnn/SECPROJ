"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENCIES } from "@/lib/game/agencies";
import { parseIso } from "@/lib/game/calendar";
import { weeklyUpkeep } from "@/lib/game/economy";
import { RELATION_LIMIT, currentAge } from "@/lib/game/engine";
import { ACTIVITIES, planError } from "@/lib/game/planner";
import { RANKS, SKILLS, formatEuros } from "@/lib/game/rules";
import { SCHEDULE_KINDS, dayToIso, isoToDay, schedule, type ScheduleItem } from "@/lib/game/schedule";
import { TOPICS, gradeLabel } from "@/lib/game/sources";
import type { ActivityChoice, GameState, PlayerAction, Relation, SkillId } from "@/lib/game/types";
import { tint } from "@/lib/ui/color";
import { REGIONS, findCity } from "@/lib/world/geo";
import { CONTACT_INTENTS, Carnet, KIND_LABELS } from "./CharacterSheet";
import { AskPerson, GRADE_COLOR } from "./IntelUI";
import { BodyChart } from "./BodyChart";
import { LADDER, romancePossible } from "@/lib/game/bonds";
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

/** Une notification : d'où elle vient, ce qu'elle dit, quelle app elle ouvre. */
interface Notif {
  id: string;
  app: PhoneApp;
  title: string;
  text: string;
  day: number;
}

function notifications(state: GameState, items: ScheduleItem[]): Notif[] {
  const today = state.world.day;
  const out: Notif[] = [];
  for (const [i, p] of (state.pieces ?? []).entries()) {
    if (p.day === undefined || today - p.day > 7) continue;
    if (p.topic) out.push({ id: `rep:${i}`, app: "reseau", title: "Réponse reçue", text: p.titre, day: p.day });
    else if (p.type === "message") out.push({ id: `msg:${i}`, app: "messages", title: p.de ?? "Message", text: p.messages?.at(-1)?.texte ?? p.titre, day: p.day });
    else out.push({ id: `pc:${i}`, app: "photos", title: `${DOC_LABELS[p.type].label} gardée`, text: p.titre, day: p.day });
  }
  for (const it of items) if (it.urgent && it.day - today <= 3 && it.day >= today) out.push({ id: `ag:${it.kind}:${it.ref ?? it.title}`, app: "agenda", title: inDays(it.day - today).replace(/^./, (x) => x.toUpperCase()), text: it.title, day: today });
  for (const [i, p] of state.progress.entries()) if (p.kind === "money" && today - p.day <= 7) out.push({ id: `bk:${i}`, app: "banque", title: "Virement reçu", text: p.text, day: p.day });
  if ((state.character.fatigue ?? 0) >= 60) out.push({ id: `bat:${today}`, app: "sante", title: "Batterie faible", text: "Tu es à bout. Une semaine de repos s'impose.", day: today });
  for (const [i, n] of state.world.geo.news.entries()) if (n.player && today - n.day <= 7) out.push({ id: `nw:${n.day}:${i}`, app: "infos", title: "On parle de toi", text: n.text, day: n.day });
  return out.sort((a, b) => b.day - a.day).slice(0, 8);
}

const ago = (today: number, day: number) => (today - day <= 0 ? "auj." : `il y a ${today - day} j`);

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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
      if (app) setApp(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, app]);
  const clock = useClock();
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const items = useMemo(() => schedule(state), [state]);
  const battery = Math.max(5, 100 - (c.fatigue ?? 0));
  const signal = Math.round(((c.cover ?? 50) / 100) * 4);
  const current = APPS.find((a) => a.id === app);

  // Les notifications balayées restent balayées (pour cette partie, dans ce navigateur).
  const storeKey = `lucerne:notifs:${state.id}`;
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(storeKey) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, [storeKey]);
  const dismiss = (ids: string[]) => {
    const next = [...new Set([...dismissed, ...ids])].slice(-200);
    setDismissed(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* stockage indisponible */
    }
  };
  const notifs = notifications(state, items).filter((n) => !dismissed.includes(n.id));
  const badges: Partial<Record<PhoneApp, number>> = {};
  for (const n of notifs) badges[n.app] = (badges[n.app] ?? 0) + 1;
  const open = (a: PhoneApp) => {
    dismiss(notifs.filter((n) => n.app === a).map((n) => n.id));
    setApp(a);
  };

  return (
    <div className="animate-rise fixed inset-2 z-[66] sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(700px,calc(100dvh-5rem))] sm:w-[350px]" role="dialog" aria-label="Téléphone">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[2.4rem] border-[9px] border-[#0b0c10] bg-ink shadow-[0_25px_70px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {/* Barre d'état. */}
        <div className="relative z-10 flex shrink-0 items-center justify-between px-6 pt-2.5 pb-1 text-[12px] font-semibold">
          <span className="tabular-nums">{clock}</span>
          <span aria-hidden className="absolute top-2 left-1/2 h-[22px] w-24 -translate-x-1/2 rounded-full bg-[#0b0c10]" />
          <span className="flex items-center gap-1.5">
            <span className="flex items-end gap-px" title={`Couverture civile ${c.cover ?? 0}`}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={`w-[3px] rounded-[1px] ${i <= signal ? "bg-ivory" : "bg-ivory/25"}`} style={{ height: 3 + i * 2 }} />
              ))}
            </span>
            <span className="flex items-center" title={`Énergie ${battery} %`}>
              <span className="relative h-[11px] w-[22px] rounded-[3px] border border-ivory/70 p-px">
                <span className="block h-full rounded-[1px]" style={{ width: `${battery}%`, background: battery < 25 ? "var(--color-fail)" : "var(--color-ivory)" }} />
              </span>
              <span className="h-1 w-0.5 rounded-r bg-ivory/70" />
            </span>
          </span>
        </div>

        {current && (
          <div className="shrink-0 px-4 pt-1 pb-2">
            <button onClick={() => setApp(null)} className="text-[13px] text-brass hover:text-brass-soft" aria-label="Accueil">
              ‹ Accueil
            </button>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] text-sm text-white shadow" style={{ background: `linear-gradient(160deg, ${current.color}, color-mix(in srgb, ${current.color} 60%, black))` }}>
                {current.icon}
              </span>
              <span className="text-2xl font-bold tracking-tight">{current.label}</span>
            </div>
          </div>
        )}

        <div key={app ?? "home"} className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto ${app ? "animate-app-open" : "animate-home-in"}`}>
          {app === null && <Home state={state} items={items} notifs={notifs} badges={badges} onOpen={open} onDismiss={dismiss} agencyColor={agency.color} />}
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

        {/* La barre d'accueil : un tap ramène à l'accueil ; depuis l'accueil, range le téléphone. */}
        <button onClick={() => (app ? setApp(null) : onClose())} className="group flex shrink-0 justify-center pt-1.5 pb-2" aria-label={app ? "Écran d'accueil" : "Ranger le téléphone"} title={app ? "Accueil (Échap)" : "Ranger (Échap)"}>
          <span className="h-[5px] w-32 rounded-full bg-ivory/40 transition-colors group-hover:bg-ivory/80" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accueil                                                             */
/* ------------------------------------------------------------------ */

const DOCK: PhoneApp[] = ["messages", "agenda", "reseau", "banque"];

function AppIcon({ a, badge, onOpen, small = false }: { a: (typeof APPS)[number]; badge?: number; onOpen: (a: PhoneApp) => void; small?: boolean }) {
  return (
    <button onClick={() => onOpen(a.id)} aria-label={a.label} className="group flex flex-col items-center gap-1 transition-transform active:scale-90">
      <span
        className="relative grid h-[52px] w-[52px] place-items-center rounded-[15px] text-xl text-white shadow-md transition-transform group-hover:-translate-y-0.5"
        style={{ background: `linear-gradient(160deg, ${a.color}, color-mix(in srgb, ${a.color} 55%, black))` }}
      >
        <span aria-hidden className="absolute inset-x-1 top-0.5 h-1/2 rounded-t-[13px] bg-white/10" />
        {a.icon}
        {badge ? <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full border-2 border-ink bg-fail px-1 text-[10px] leading-4 font-bold text-white">{badge}</span> : null}
      </span>
      {!small && <span className="text-[10px] text-ivory/90">{a.label}</span>}
    </button>
  );
}

function Home({
  state,
  items,
  notifs,
  badges,
  onOpen,
  onDismiss,
  agencyColor,
}: {
  state: GameState;
  items: ScheduleItem[];
  notifs: Notif[];
  badges: Partial<Record<PhoneApp, number>>;
  onOpen: (a: PhoneApp) => void;
  onDismiss: (ids: string[]) => void;
  agencyColor: string;
}) {
  const iso = dayToIso(state, state.world.day);
  const next = items.filter((i) => i.day >= state.world.day).slice(0, 2);
  const city = findCity(state.world.cityId);
  const [allNotifs, setAllNotifs] = useState(false);
  const shown = allNotifs ? notifs : notifs.slice(0, 3);
  return (
    <div className="flex min-h-full flex-col px-3.5 pt-3 pb-3" style={{ background: `radial-gradient(120% 70% at 20% 0%, ${tint(agencyColor, 38)}, transparent 60%), radial-gradient(90% 60% at 100% 100%, ${tint(agencyColor, 18)}, transparent 70%)` }}>
      {/* Date et agenda, en widget. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[20px] bg-panel/75 p-3 shadow-lg ring-1 ring-white/5 backdrop-blur">
          <p className="text-[10px] font-semibold tracking-wide text-fail uppercase">{dayName(iso)}</p>
          <p className="text-4xl leading-none font-light">{parseIso(iso).getUTCDate()}</p>
          <p className="mt-1 truncate text-[10px] text-muted capitalize">
            {parseIso(iso).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}
            {city ? ` · ${city.name}` : ""}
          </p>
        </div>
        <button onClick={() => onOpen("agenda")} className="rounded-[20px] bg-panel/75 p-3 text-left shadow-lg ring-1 ring-white/5 backdrop-blur active:scale-[0.98]">
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">À venir</p>
          {next.length === 0 ? (
            <p className="mt-1 text-[11px] text-faint">Rien de prévu.</p>
          ) : (
            next.map((i, n) => (
              <p key={n} className="mt-1 flex gap-1.5 text-[11px] leading-tight">
                <span className="w-0.5 shrink-0 rounded-full" style={{ background: SCHEDULE_KINDS[i.kind].color }} />
                <span className="min-w-0">
                  <span className="line-clamp-2">{i.title}</span>
                  <span className={`text-[9px] ${i.urgent ? "text-fail" : "text-faint"}`}>{inDays(i.day - state.world.day)}</span>
                </span>
              </p>
            ))
          )}
        </button>
      </div>

      {/* Les notifications. */}
      {notifs.length > 0 && (
        <div className="mt-3">
          <p className="flex items-baseline justify-between px-1 text-[11px] font-semibold text-ivory/80">
            Notifications
            <button onClick={() => onDismiss(notifs.map((n) => n.id))} className="text-[10px] font-normal text-muted hover:text-ivory">
              Tout effacer
            </button>
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {shown.map((n) => {
              const a = APPS.find((x) => x.id === n.app)!;
              return (
                <li key={n.id} className="animate-rise group relative">
                  <button onClick={() => onOpen(n.app)} className="flex w-full items-start gap-2.5 rounded-[18px] bg-panel/85 px-3 py-2 text-left shadow ring-1 ring-white/5 backdrop-blur active:scale-[0.98]">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-xs text-white" style={{ background: a.color }}>
                      {a.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold">{n.title}</span>
                        <span className="shrink-0 text-[9px] text-faint">{ago(state.world.day, n.day)}</span>
                      </span>
                      <span className="line-clamp-2 text-[11px] text-ivory/75">{n.text}</span>
                    </span>
                  </button>
                  <button onClick={() => onDismiss([n.id])} className="absolute -top-1 -left-1 hidden h-5 w-5 place-items-center rounded-full bg-line-strong text-[10px] text-ivory group-hover:grid" aria-label="Effacer">
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          {notifs.length > 3 && (
            <button onClick={() => setAllNotifs((v) => !v)} className="mt-1 w-full text-center text-[10px] text-muted hover:text-ivory">
              {allNotifs ? "Moins" : `${notifs.length - 3} de plus`}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3">
        {APPS.filter((a) => !DOCK.includes(a.id)).map((a) => (
          <AppIcon key={a.id} a={a} badge={badges[a.id]} onOpen={onOpen} />
        ))}
      </div>

      <div className="flex-1" />
      <p className="my-2 flex justify-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-ivory/80" />
        <span className="h-1.5 w-1.5 rounded-full bg-ivory/30" />
      </p>
      {/* Le dock. */}
      <div className="grid grid-cols-4 gap-2 rounded-[26px] bg-ivory/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-md">
        {DOCK.map((id) => (
          <AppIcon key={id} a={APPS.find((x) => x.id === id)!} badge={badges[id]} onOpen={onOpen} small />
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
  const [view, setView] = useState<"mois" | "semaine" | "liste">("semaine");
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

      <Segmented value={view} onChange={setView} options={[["semaine", "Semaine"], ["mois", "Mois"], ["liste", "À venir"]]} />
      {view === "liste" ? (
        <UpcomingList state={state} items={items} go={go} />
      ) : view === "semaine" ? (
        <WeekView state={state} items={items} go={go} />
      ) : (
      <>
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

      </>
      )}
    </div>
  );
}

/** La semaine, du lundi au dimanche : un jour par ligne, ce qui y tombe à côté. */
function WeekView({ state, items, go }: { state: GameState; items: ScheduleItem[]; go: (t: NavTarget) => void }) {
  const [offset, setOffset] = useState(0);
  const todayIso = dayToIso(state, state.world.day);
  const t = parseIso(todayIso);
  const monday = state.world.day - ((t.getUTCDay() + 6) % 7) + offset * 7;
  const days = Array.from({ length: 7 }, (_, i) => monday + i);
  const label = `${shortDate(dayToIso(state, days[0]))} – ${shortDate(dayToIso(state, days[6]))}`;
  return (
    <div className="rounded-xl bg-panel ring-1 ring-line">
      <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
        <button onClick={() => setOffset((o) => o - 1)} className="px-2 text-brass" aria-label="Semaine précédente">
          ‹
        </button>
        <button onClick={() => setOffset(0)} className="text-xs font-semibold" title="Revenir à cette semaine">
          {offset === 0 ? "Cette semaine" : offset === 1 ? "Semaine prochaine" : label}
          {offset === 0 || offset === 1 ? <span className="ml-1 font-normal text-faint">{label}</span> : null}
        </button>
        <button onClick={() => setOffset((o) => o + 1)} className="px-2 text-brass" aria-label="Semaine suivante">
          ›
        </button>
      </div>
      <ul className="divide-y divide-line">
        {days.map((d) => {
          const iso = dayToIso(state, d);
          const list = items.filter((i) => i.day === d);
          const today = d === state.world.day;
          const past = d < state.world.day;
          return (
            <li key={d} className={`flex gap-2.5 px-2.5 py-2 ${past ? "opacity-45" : ""}`}>
              <div className="w-9 shrink-0 text-center">
                <p className="text-[9px] tracking-wide text-muted uppercase">{dayName(iso).slice(0, 3)}</p>
                <p className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-sm ${today ? "bg-brass font-semibold text-ink" : ""}`}>{parseIso(iso).getUTCDate()}</p>
              </div>
              <div className="min-w-0 flex-1 space-y-1 py-0.5">
                {list.length === 0 ? (
                  <p className="pt-1.5 text-[10px] text-faint">—</p>
                ) : (
                  list.map((i, n) => {
                    const k = SCHEDULE_KINDS[i.kind];
                    const target: NavTarget | null = i.kind === "mission" && i.ref ? { to: "qg", offer: i.ref } : i.kind === "devoir" ? { to: "qg" } : i.cityId ? { to: "carte", city: i.cityId } : null;
                    return (
                      <button
                        key={n}
                        disabled={!target}
                        onClick={() => target && go(target)}
                        className="block w-full rounded-md border-l-[3px] px-2 py-1 text-left text-[11px] leading-tight"
                        style={{ borderColor: k.color, background: tint(k.color, 12) }}
                      >
                        <span className="block truncate">{i.title}</span>
                        {i.detail && <span className="block truncate text-[9px] text-muted">{i.detail}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tout ce qui vient, jour par jour. */
function UpcomingList({ state, items, go }: { state: GameState; items: ScheduleItem[]; go: (t: NavTarget) => void }) {
  const future = items.filter((i) => i.day >= state.world.day);
  if (!future.length) return <p className="py-6 text-center text-xs text-faint">Rien à l'horizon.</p>;
  const groups: { date: string; day: number; list: ScheduleItem[] }[] = [];
  for (const i of future) {
    const g = groups.at(-1);
    if (g && g.date === i.date) g.list.push(i);
    else groups.push({ date: i.date, day: i.day, list: [i] });
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.date}>
          <p className="px-1 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
            <span className="capitalize">{dayName(g.date)}</span> {shortDate(g.date)} <span className="font-normal tracking-normal normal-case text-faint">· {inDays(g.day - state.world.day)}</span>
          </p>
          <ul className="space-y-1.5">
            {g.list.map((i, n) => (
              <EventRow key={n} item={i} go={go} />
            ))}
          </ul>
        </div>
      ))}
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
      {r.kind === "amour" && <span className="absolute -top-1 -left-1 text-[11px] leading-none text-[#e0607e] drop-shadow">♥</span>}
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
                    <span className="block truncate text-[11px] text-muted">
                      {waiting ? `⌛ réponse attendue J${waiting.readyDay}` : x.status !== "actif" ? x.status : (() => {
                        const last = thread(state, x).filter((b) => b.from !== "recit").at(-1);
                        return last ? `${last.from === "moi" ? "Toi : " : ""}${last.text}` : x.role;
                      })()}
                    </span>
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

type Bubble = { from: "moi" | "eux" | "recit"; text: string; day?: number };

/** Le fil d'une conversation : les messages montrés par le narrateur, et tes prises de contact avec ce qu'il en a raconté. */
function thread(state: GameState, r: Relation): Bubble[] {
  const out: Bubble[] = [];
  const first = r.name.split(/\s+/)[0].toLowerCase();
  const isThem = (who?: string) => !!who && (who === r.name || who.toLowerCase().includes(first));
  for (const p of state.pieces ?? []) {
    if (p.type !== "message") continue;
    const involved = isThem(p.de) || (p.messages ?? []).some((m) => isThem(m.de));
    if (!involved) continue;
    for (const m of p.messages ?? []) out.push({ from: m.de === "moi" || m.de?.toLowerCase() === "moi" ? "moi" : "eux", text: m.texte, day: p.day });
    if (!p.messages?.length && p.contenu) out.push({ from: "eux", text: p.contenu, day: p.day });
  }
  const log = state.log;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.role !== "player") continue;
    const t = e.segments.find((x) => x.kind === "text");
    const text = t && "text" in t ? t.text : "";
    const m = text.match(/Contacter (.+?) — (.+)/);
    if (!m || !isThem(m[1])) continue;
    out.push({ from: "moi", text: m[2] });
    const reply = log[i + 1];
    const rt = reply?.role === "narrator" ? reply.segments.find((x) => x.kind === "text") : undefined;
    if (rt && "text" in rt) out.push({ from: "recit", text: rt.text.length > 220 ? `${rt.text.slice(0, 220).trim()}…` : rt.text });
  }
  return out;
}

function Conversation({ state, r, onBack, onChange, onAction }: { state: GameState; r: Relation; onBack: () => void; onChange?: (s: GameState) => void; onAction?: (a: PlayerAction) => void }) {
  const [text, setText] = useState("");
  const [info, setInfo] = useState(false);
  const kind = KIND_LABELS[r.kind] ?? KIND_LABELS.contact;
  const reachable = r.status === "actif";
  const city = findCity(r.cityId);
  const bubbles = thread(state, r);
  const since = Math.max(0, state.world.day - r.lastSeenDay);
  const spark = romancePossible(state, r, currentAge(state));
  const op = r.operativeId ? state.roster.find((o) => o.id === r.operativeId) : undefined;
  const step = LADDER.indexOf(r.kind);
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
  let lastDay: number | undefined;
  return (
    <div className="flex min-h-full flex-col">
      {/* L'en-tête de la conversation. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-ink/95 px-3 py-2 backdrop-blur">
        <button onClick={onBack} className="text-lg leading-none text-brass" aria-label="Contacts">
          ‹
        </button>
        <Avatar r={r} size={32} />
        <button onClick={() => setInfo((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{r.name}</span>
          <span className="block truncate text-[10px] text-muted">{reachable ? (since <= 1 ? "en ligne récemment" : `vu il y a ${since} j`) : "injoignable"}</span>
        </button>
        <button onClick={() => setInfo((v) => !v)} className={`grid h-7 w-7 place-items-center rounded-full text-xs ring-1 ${info ? "bg-brass text-ink ring-brass" : "text-muted ring-line"}`} aria-label="Fiche du contact">
          i
        </button>
      </div>
      {info && (
        <div className="animate-rise space-y-3 border-b border-line bg-panel/60 px-4 py-3">
          {/* Où en est ce lien. */}
          {step >= 0 ? (
            <div className="flex items-center gap-1">
              {LADDER.map((k, i) => (
                <div key={k} className="flex flex-1 flex-col items-center gap-0.5">
                  <span className="h-1 w-full rounded-full" style={{ background: i <= step ? KIND_LABELS[k].color : "var(--color-line)" }} />
                  <span className={`text-[9px] ${i === step ? "font-semibold" : "text-faint"}`} style={i === step ? { color: KIND_LABELS[k].color } : undefined}>
                    {KIND_LABELS[k].label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-semibold" style={{ color: kind.color }}>
              {r.kind === "ex" ? "♡ " : ""}
              {kind.label}
            </p>
          )}
          {op && (
            <p className="rounded-lg bg-night/60 px-2 py-1 text-[10px] text-muted">
              Membre de l'effectif · {op.codename ? `« ${op.codename} » · ` : ""}
              {op.status === "en_mission" ? "en mission" : op.status === "blesse" ? "blessé·e" : op.status}
            </p>
          )}
          <p className="text-[11px] text-muted">
            <span style={{ color: kind.color }}>{kind.label}</span> · {r.role} · {city ? city.name : r.location}
            {r.knownAs && r.knownAs !== "reel" ? ` · te connaît comme « ${r.knownAs === "code" ? "ton nom de code" : r.knownAs} »` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {meter("Affinité", r.affinity, r.affinity >= 25 ? "var(--color-success)" : r.affinity <= -25 ? "var(--color-fail)" : "var(--color-muted)", true)}
            {meter("Lien", r.bond ?? 50, (r.bond ?? 50) < 25 ? "var(--color-fail)" : "var(--pole-ame)")}
          </div>
          <p className="text-[11px]">
            {r.favors > 0 ? `Te doit ${r.favors === 1 ? "une faveur" : `${r.favors} faveurs`}.` : r.favors < 0 ? `Tu lui dois ${-r.favors === 1 ? "une faveur" : `${-r.favors} faveurs`}.` : "Vous êtes quittes."}
            {r.knows ? <span className="text-muted"> Sait : {r.knows}.</span> : null}
          </p>
          {r.notes && <p className="text-[11px] text-muted italic">{r.notes}</p>}
          {(r.history ?? []).length > 0 && (
            <ol className="relative space-y-1 border-l border-line pl-3">
              {[...(r.history ?? [])].reverse().map((h, i) => (
                <li key={i} className="relative text-[10px] leading-snug">
                  <span className="absolute top-1 -left-[15.5px] h-1.5 w-1.5 rounded-full bg-brass" />
                  <span className="font-mono text-faint">{shortDate(dayToIso(state, h.day))}</span> <span className="text-ivory/85">{h.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {spark && (
        <p className="mx-3 mt-2 rounded-full bg-[#e0607e]/15 px-3 py-1 text-center text-[11px] text-[#e0607e]">♥ Il se passe quelque chose entre vous.</p>
      )}
      {/* Le fil. */}
      <div className="flex-1 space-y-1.5 px-3 py-3">
        {bubbles.length === 0 && <p className="py-6 text-center text-[11px] text-faint">Aucun message. Écris-lui : le narrateur racontera la suite.</p>}
        {bubbles.map((b, i) => {
          const sep = b.day !== undefined && b.day !== lastDay;
          if (b.day !== undefined) lastDay = b.day;
          return (
            <div key={i}>
              {sep && <p className="py-1 text-center text-[9px] tracking-wide text-faint uppercase">{shortDate(dayToIso(state, b.day!))}</p>}
              {b.from === "recit" ? (
                <p className="mx-auto max-w-[90%] px-2 text-center text-[11px] leading-snug text-muted italic">{b.text}</p>
              ) : (
                <p className={`max-w-[80%] px-3 py-1.5 text-[13px] leading-snug ${b.from === "moi" ? "ml-auto rounded-[18px] rounded-br-[5px] bg-[#3a66c4] text-white" : "rounded-[18px] rounded-bl-[5px] bg-panel ring-1 ring-line"}`}>{b.text}</p>
              )}
            </div>
          );
        })}
      </div>
      {reachable ? (
        <div className="sticky bottom-0 space-y-2 border-t border-line bg-ink/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <span className="shrink-0">
              <AskPerson state={state} source="relation" refId={r.name} onChange={onChange} />
            </span>
            {onAction && spark && (
              <button onClick={() => send("Lui dire ce que tu ressens")} className="shrink-0 rounded-full border border-[#e0607e]/60 px-2.5 py-1 text-[10px] text-[#e0607e] hover:bg-[#e0607e]/10 active:scale-95">
                ♥ Lui dire ce que tu ressens
              </button>
            )}
            {onAction &&
              CONTACT_INTENTS.map((i) => (
                <button key={i} onClick={() => send(i)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[10px] text-muted hover:border-brass hover:text-ivory active:scale-95">
                  {i}
                </button>
              ))}
          </div>
          {onAction && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex items-center gap-1.5"
            >
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Message" className="min-w-0 flex-1 rounded-full bg-panel px-3.5 py-1.5 text-[13px] ring-1 ring-line outline-none focus:ring-brass/50" />
              <button type="submit" disabled={!text.trim()} className="grid h-8 w-8 place-items-center rounded-full bg-[#3a66c4] text-white transition-transform active:scale-90 disabled:opacity-30" aria-label="Envoyer">
                ↑
              </button>
            </form>
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
  const [tab, setTab] = useState<"compte" | "biens">("compte");
  const income = RANKS[c.rank].allowance ?? 0;
  const upkeep = weeklyUpkeep(state);
  const net = income - upkeep;
  const ledger = [...(c.ledger ?? [])].reverse();
  // Le solde, remonté opération par opération, pour la courbe.
  const history: number[] = [c.money];
  for (const e of ledger.slice(0, 24)) history.push(history[history.length - 1] - e.amount);
  history.reverse();
  const lo = Math.min(...history);
  const hi = Math.max(...history);
  const pts = history.map((v, i) => `${((i / Math.max(1, history.length - 1)) * 100).toFixed(1)},${(30 - ((v - lo) / Math.max(1, hi - lo)) * 26 - 2).toFixed(1)}`).join(" ");
  let lastDay: number | undefined;
  return (
    <div className="space-y-3 p-3">
      <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg" style={{ background: "linear-gradient(135deg, #2c3e50, #1a252f 60%, #b08a3e)" }}>
        <p className="text-[10px] tracking-[0.2em] uppercase opacity-70">Compte courant</p>
        <p className="mt-1 font-mono text-3xl">{formatEuros(c.money)}</p>
        {history.length > 2 && (
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-label="Évolution du solde">
            <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <p className="mt-2 flex justify-between font-mono text-[11px] opacity-80">
          <span>{c.matricule ?? "•••• ••••"}</span>
          <span>
            {c.identity.firstName[0]}. {c.identity.lastName.toUpperCase()}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-xl bg-panel py-2 ring-1 ring-line">
          <p className="text-[9px] tracking-wide text-muted uppercase">Solde / sem.</p>
          <p className="font-mono text-xs text-success">+{formatEuros(income)}</p>
        </div>
        <div className="rounded-xl bg-panel py-2 ring-1 ring-line">
          <p className="text-[9px] tracking-wide text-muted uppercase">Entretien</p>
          <p className="font-mono text-xs text-partial">−{formatEuros(upkeep)}</p>
        </div>
        <div className="rounded-xl bg-panel py-2 ring-1 ring-line">
          <p className="text-[9px] tracking-wide text-muted uppercase">Reste</p>
          <p className={`font-mono text-xs ${net < 0 ? "text-fail" : ""}`}>
            {net >= 0 ? "+" : ""}
            {formatEuros(net)}
          </p>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[["compte", "Relevé"], ["biens", "Patrimoine"]]} />
      {tab === "compte" ? (
        ledger.length === 0 ? (
          <p className="py-4 text-center text-xs text-faint">Aucune opération pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl bg-panel px-3 ring-1 ring-line">
            {ledger.map((e, i) => {
              const sep = e.day !== lastDay;
              lastDay = e.day;
              return (
                <li key={i} className="py-2">
                  {sep && <p className="pb-1 text-[9px] tracking-wide text-faint uppercase">{shortDate(dayToIso(state, e.day))}</p>}
                  <p className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{e.label}</span>
                    <span className={`shrink-0 font-mono ${e.amount > 0 ? "text-success" : ""}`}>
                      {e.amount > 0 ? "+" : "−"}
                      {formatEuros(Math.abs(e.amount))}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          {state.world.phase === "mission" && (
            <p className="flex justify-between rounded-xl bg-panel px-3 py-2 text-xs ring-1 ring-line">
              <span className="text-muted">Fonds d'opération</span>
              <span className="font-mono">{formatEuros(c.missionFunds)}</span>
            </p>
          )}
          <p className="px-1 text-[10px] text-faint">
            Plafond des fonds d'opération : {RANKS[c.rank].fundsCap ? formatEuros(RANKS[c.rank].fundsCap) : "—"}
            {RANKS[c.rank].order >= RANKS.agent.order ? " · prime : 1 000 € par point de mérite" : ""}
          </p>
          {RANKS[c.rank].order >= RANKS.aspirant.order && !c.prison ? <Possessions state={state} onChange={onChange} compact /> : <p className="text-xs text-faint">L'Académie fournit tout.</p>}
        </>
      )}
    </div>
  );
}

/** Le sélecteur à segments, comme dans les vraies apps. */
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-[10px] bg-panel p-0.5 ring-1 ring-line">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`flex-1 rounded-[8px] py-1 text-[11px] font-medium transition-colors ${value === id ? "bg-line-strong text-ivory shadow" : "text-muted hover:text-ivory"}`}>
          {label}
        </button>
      ))}
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
      <BodyChart state={state} />
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
