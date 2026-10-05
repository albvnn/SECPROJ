"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CharacterSheet } from "./CharacterSheet";
import { CareerCeremony } from "./CareerCeremony";
import { ThemeToggle } from "./ThemeToggle";
import { DiceCard } from "./DiceCard";
import { RichText } from "./RichText";
import { Emblem, RankBadge } from "./ui";
import { ATTRIBUTES, CHOICE_TONES, SELECTION_DAYS, SKILLS, actionLabel, phaseLabel, progressKind } from "@/lib/game/rules";
import { AGENCIES } from "@/lib/game/agencies";
import { SkillGlyph } from "./glyphs";
import { exportSave, fromWire, saveGame, toWire } from "@/lib/client/storage";
import { streamEvents } from "@/lib/client/stream";
import type {
  ChoiceTone,
  GameState,
  LogEntry,
  NarrationMode,
  Pace,
  PlayerAction,
  ProgressKind,
  Routing,
  Segment,
  Usage,
} from "@/lib/game/types";
import { modelLabel } from "@/lib/ai/router";
import { currentAge, currentDate, promotionsAvailable } from "@/lib/game/engine";
import { formatDate } from "@/lib/game/calendar";
import { tint } from "@/lib/ui/color";
import { MissionConsole } from "./Operations";
import { WorldMap } from "./WorldMap";
import { CommandPanel, TeamPanel } from "./Command";
import { IntelBoard } from "./Intel";
import { HQ } from "./HQ";
import { Archives } from "./Archives";
import { Mallette } from "./Mallette";
import { Terminal, type NavTarget } from "./Terminal";
import { Phone, type PhoneApp } from "./Phone";
import { schedule } from "@/lib/game/schedule";
import type { SheetTab } from "./CharacterSheet";
import { threatVisible } from "@/lib/game/intel";
import { StoryCardView, StoryDocView } from "./StoryCards";
import { weeklyUpkeep } from "@/lib/game/economy";
import { ACTIVITIES, defaultPlan, planError } from "@/lib/game/planner";
import { describeAction } from "@/lib/game/actions";
import { canStartMission } from "@/lib/game/missions";
import { RANKS, formatEuros } from "@/lib/game/rules";
import type { ActivityChoice, RankId } from "@/lib/game/types";

type MainTab = "recit" | "qg" | "monde" | "agence" | "archives";

interface LiveTurn {
  player: string | null;
  original?: string;
  reason?: string;
  segments: Segment[];
  status: string | null;
}

const TONE_STYLE: Record<ChoiceTone, string> = {
  audace: "text-fail",
  prudence: "text-success",
  ruse: "text-partial",
  social: "text-brass-soft",
  ellipse: "text-[#7fa6d9]",
  autre: "text-muted",
};

export function GameScreen({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<MainTab>("recit");
  const [plan, setPlan] = useState<ActivityChoice[]>(() => defaultPlan(initial));
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [error, setError] = useState<{ message: string; action: PlayerAction } | null>(null);
  const [draft, setDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  // Sur grand écran, la fiche peut être rangée pour laisser toute la place au récit.
  const [sheetPinned, setSheetPinned] = useState(true);
  useEffect(() => {
    try {
      setSheetPinned(localStorage.getItem("lucerne:fiche") !== "rangee");
    } catch {
      /* stockage indisponible : fiche affichée */
    }
  }, []);
  const toggleSheet = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setSheetPinned((p) => {
        try {
          localStorage.setItem("lucerne:fiche", p ? "rangee" : "affichee");
        } catch {
          /* rien */
        }
        return !p;
      });
    } else setSheetOpen((o) => !o);
  };
  const [worldView, setWorldView] = useState<"carte" | "renseignement">("carte");
  const [agencyView, setAgencyView] = useState<"effectif" | "commandement">("effectif");
  const [storageWarning, setStorageWarning] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [malletteOpen, setMalletteOpen] = useState(false);
  const [phone, setPhone] = useState<{ open: boolean; app: PhoneApp | null }>({ open: false, app: null });
  const [offerFocus, setOfferFocus] = useState<{ id: string; n: number } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ id: string; n: number } | null>(null);
  const [archiveFocus, setArchiveFocus] = useState<{ id: string; n: number } | null>(null);
  const [sheetFocus, setSheetFocus] = useState<{ id: SheetTab; n: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMalletteOpen(false);
        setTerminalOpen((o) => !o);
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "m" || e.key === "M") {
        setTerminalOpen(false);
        setMalletteOpen((o) => !o);
      }
      if (e.key === "t" || e.key === "T") setPhone((p) => ({ open: !p.open, app: p.app }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [rejection, setRejection] = useState<{ reason: string; suggestion: string; text: string } | null>(null);
  const [lastUsage, setLastUsage] = useState<Usage | null>(null);
  const [lastRouting, setLastRouting] = useState<Routing | null>(null);
  const [toasts, setToasts] = useState<{ id: number; kind: ProgressKind; text: string }[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((text: string) => {
    const kind = progressKind(text);
    if (!kind) return;
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const commit = (next: GameState) => {
    setState(next);
    setStorageWarning(!saveGame(next));
  };

  const updateSettings = (patch: Partial<GameState["settings"]>) => {
    const next = { ...state, settings: { ...state.settings, ...patch } };
    setState(next);
    saveGame(next);
  };
  const abortRef = useRef<AbortController | null>(null);
  const lastTurn = useRef<{ before: GameState; action: PlayerAction } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [correction, setCorrection] = useState<{ open: boolean; text: string; status: string | null; error: string | null }>({
    open: false,
    text: "",
    status: null,
    error: null,
  });
  const busy = live !== null || correction.status !== null;
  const [ceremonyRank, setCeremonyRank] = useState<RankId | null>(null);
  const promotions = state.log.length > 0 && !state.mission ? promotionsAvailable(state) : [];
  const promoKey = promotions.join(",");
  // La cérémonie s'ouvre d'elle-même quand une promotion devient possible (Brevet, siège libre…).
  const hadPromo = useRef(promoKey);
  useEffect(() => {
    if (promoKey && promoKey !== hadPromo.current && !busy) setCeremonyRank(promotions[0]);
    if (!busy) hadPromo.current = promoKey;
  }, [promoKey, busy, promotions]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Arrestation, libération, promotion : le planning prévu n'est plus valable, on repart d'un planning type.
  const planKey = `${Boolean(state.character.prison)}:${state.character.rank}`;
  useEffect(() => {
    setPlan((p) => (planError(state, p) ? defaultPlan(state) : p));
  }, [planKey]);

  const play = useCallback(
    async (action: PlayerAction, base?: GameState) => {
      if (abortRef.current) return;
      const before = base ?? state;
      if (base) setState(base);
      setError(null);
      setRejection(null);
      stickToBottom.current = true;
      setLive({ player: describeAction(before, action) ?? actionLabel(action), segments: [], status: action.type === "week" ? "Une semaine passe…" : action.type === "mission_start" ? "Briefing en cours…" : "Le narrateur prend la plume…" });
      if (action.type === "week" || action.type === "mission_start" || action.type === "promotion") setTab("recit");
      const controller = new AbortController();
      abortRef.current = controller;
      const result: { state: GameState | null; rejected: { reason: string; suggestion: string } | null } = {
        state: null,
        rejected: null,
      };

      const push = (seg: Segment) =>
        setLive((l) => {
          if (!l) return l;
          const segments = [...l.segments];
          const last = segments.at(-1);
          if (seg.kind === "text" && last?.kind === "text") {
            segments[segments.length - 1] = { kind: "text", text: last.text + seg.text };
          } else segments.push(seg);
          return { ...l, segments, status: null };
        });

      try {
        await streamEvents(
          "/api/turn",
          { state: toWire(before), action },
          (e) => {
            switch (e.type) {
              case "status":
                setLive((l) => (l ? { ...l, status: e.text } : l));
                break;
              case "text":
                push({ kind: "text", text: e.text });
                break;
              case "check":
                push({ kind: "check", check: e.check });
                break;
              case "event":
                push({ kind: "event", text: e.text });
                notify(e.text);
                break;
              case "segment":
                push(e.segment);
                break;
              case "reinterpreted":
                setLive((l) => (l ? { ...l, player: e.text, original: action.type === "free" ? action.text : undefined, reason: e.reason } : l));
                break;
              case "rejected":
                result.rejected = { reason: e.reason, suggestion: e.suggestion };
                break;
              case "usage":
                setLastUsage(e.usage);
                break;
              case "routing":
                setLastRouting(e.routing);
                setLive((l) => (l ? { ...l, status: `${modelLabel(e.routing.model)} prend la plume…` } : l));
                break;
              case "rollback":
                setLive((l) => (l ? { ...l, segments: e.segments } : l));
                break;
              case "state":
                result.state = fromWire(before, e.state);
                break;
              case "error":
                throw new Error(e.message);
            }
          },
          controller.signal,
        );
        if (result.rejected) {
          if (base) setState(before);
          setRejection({ ...result.rejected, text: action.type === "free" ? action.text : "" });
          return;
        }
        const next = result.state;
        if (!next) throw new Error("Le récit a été interrompu avant la fin du tour.");
        setStorageWarning(!saveGame(next));
        setState(next);
        lastTurn.current = { before, action };
        if (action.type === "free") setDraft("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setError({ message: err instanceof Error ? err.message : "Erreur inconnue.", action });
        }
      } finally {
        abortRef.current = null;
        setLive(null);
      }
    },
    [state, notify],
  );

  const rewrite = () => {
    const t = lastTurn.current;
    if (!t || busy) return;
    lastTurn.current = null;
    play(t.action, t.before);
  };

  /** Corrige le dernier passage du narrateur selon la consigne du joueur, sans rejouer le tour. */
  const correctLast = async () => {
    const instruction = correction.text.trim();
    if (!instruction || busy) return;
    const before = state;
    setCorrection((c) => ({ ...c, status: "Correction du passage…", error: null }));
    const controller = new AbortController();
    abortRef.current = controller;
    const result: { state: GameState | null } = { state: null };
    try {
      await streamEvents(
        "/api/correct",
        { state: toWire(before), instruction },
        (e) => {
          if (e.type === "status") setCorrection((c) => ({ ...c, status: e.text }));
          else if (e.type === "usage") setLastUsage(e.usage);
          else if (e.type === "event") notify(e.text);
          else if (e.type === "state") result.state = fromWire(before, e.state);
          else if (e.type === "error") throw new Error(e.message);
        },
        controller.signal,
      );
      if (!result.state) throw new Error("La correction a été interrompue.");
      commit(result.state);
      setLastRouting(null);
      setCorrection({ open: false, text: "", status: null, error: null });
    } catch (err) {
      if (!controller.signal.aborted)
        setCorrection((c) => ({ ...c, status: null, error: err instanceof Error ? err.message : "Erreur inconnue." }));
      else setCorrection((c) => ({ ...c, status: null }));
    } finally {
      abortRef.current = null;
    }
  };

  const submitFree = () => {
    const text = draft.trim();
    if (!text || busy) return;
    play({ type: "free", text });
  };

  // Défilement automatique tant que le joueur est en bas du récit.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [live, state.log.length, error]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const w = state.world;
  const c = state.character;

  // Le terminal (Ctrl/⌘ K) et la mallette (M) : on y arrive de partout.
  const go = (target: NavTarget) => {
    const n = Date.now();
    switch (target.to) {
      case "recit":
        return setTab("recit");
      case "qg":
        setTab("qg");
        if (target.offer) setOfferFocus({ id: target.offer, n });
        return;
      case "carte":
        setTab("monde");
        setWorldView("carte");
        if (target.city) setMapFocus({ id: target.city, n });
        return;
      case "renseignement":
        setTab("monde");
        return setWorldView("renseignement");
      case "effectif":
      case "commandement":
        setTab("agence");
        return setAgencyView(target.to);
      case "archives":
        setTab("archives");
        if (target.folder) setArchiveFocus({ id: target.folder, n });
        return;
      case "fiche":
        setSheetFocus({ id: target.tab, n });
        if (window.matchMedia("(min-width: 1024px)").matches) {
          setSheetPinned(true);
          try {
            localStorage.setItem("lucerne:fiche", "affichee");
          } catch {
            /* rien */
          }
        } else setSheetOpen(true);
        return;
      case "mallette":
        return setMalletteOpen(true);
      case "phone":
        return setPhone({ open: true, app: target.app ?? null });
    }
  };
  const atBase = w.phase === "base" && !state.mission;
  const urgentCount = schedule(state, 14).filter((i) => i.urgent).length;
  const terminalActions = busy || state.log.length === 0
    ? []
    : [
        ...state.choices.map((ch, i) => ({ id: `act:choix:${i}`, icon: String(i + 1), label: ch.label, hint: "Choix proposé par le narrateur", run: () => (setTab("recit"), play({ type: "choice", text: ch.label })) })),
        ...(atBase && state.choices.length === 0 && !planError(state, plan)
          ? [{ id: "act:semaine", icon: "▶", label: "Jouer la semaine", hint: plan.map((p) => ACTIVITIES[p.activity]?.label ?? p.activity).join(" · "), run: () => play({ type: "week", plan }) }]
          : []),
        { id: "act:export", icon: "⇩", label: "Exporter la sauvegarde", hint: "Un fichier JSON de ta partie", run: () => exportSave(state) },
      ];
  const dayLabel = w.phase === "selection" ? `Jour ${w.day}/${SELECTION_DAYS}` : null;
  const agency = AGENCIES[c.identity.agency];
  const dateLabel = formatDate(currentDate(state));
  const canRewrite = !busy && lastTurn.current !== null;
  const lastEntryId = state.log.at(-1)?.id;

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <header className="relative z-40 shrink-0 border-b border-line bg-night/95">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link href="/" className="text-brass" title="Accueil">
            <Emblem className="h-8 w-8" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-lg leading-tight">{w.chapter}</p>
            <p className="truncate text-[11px] tracking-wide text-muted">
              <span style={{ color: agency.color }}>{agency.name}</span> · {phaseLabel(w.phase, currentAge(state))}
              {dayLabel && ` · ${dayLabel}`} · {dateLabel} · {w.location}
            </p>
          </div>
          {w.phase !== "dossier" && <Hud state={state} onClick={toggleSheet} />}
          {w.phase !== "dossier" && (
            <>
              <button
                onClick={() => setTerminalOpen(true)}
                title="Terminal : chercher et aller partout (Ctrl K)"
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 font-mono text-xs text-muted transition-colors hover:border-brass hover:text-ivory"
              >
                <span className="text-success">$_</span>
                <kbd className="hidden text-[10px] text-faint md:inline">Ctrl K</kbd>
              </button>
              <button
                onClick={() => setPhone((p) => ({ open: !p.open, app: p.app }))}
                title="Téléphone : agenda, messages, banque… (T)"
                aria-label="Téléphone"
                className={`relative grid h-[30px] w-9 place-items-center rounded-sm border transition-colors hover:border-brass ${phone.open ? "border-brass text-brass" : "border-line text-ivory/80"}`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                  <path d="M10.5 18.5h3" />
                </svg>
                {urgentCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-fail px-1 text-[9px] leading-4 font-bold text-white">{urgentCount}</span>}
              </button>
              <button
                onClick={() => setMalletteOpen(true)}
                title="Mallette : inventaire (M)"
                aria-label="Mallette"
                className="grid h-[30px] w-9 place-items-center rounded-sm border border-line text-brass transition-colors hover:border-brass"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="7" width="18" height="12" rx="1.5" />
                  <path d="M9 7V5h6v2M3 12h18M11 12v2h2v-2" />
                </svg>
              </button>
            </>
          )}
          <SettingsMenu settings={state.settings} onChange={updateSettings} disabled={busy} onExport={() => exportSave(state)} />
          <ThemeToggle />
          <button
            onClick={toggleSheet}
            title="Afficher ou ranger ta fiche"
            className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs transition-colors hover:border-brass ${sheetPinned ? "lg:border-brass/50 lg:bg-brass/10" : ""} border-line`}
          >
            <RankBadge rank={c.rank} className="h-5 w-4" />
            <span className="hidden sm:inline">Fiche</span>
            {c.skillPoints > 0 && <span className="rounded-full bg-brass px-1.5 text-[9px] text-ink">{c.skillPoints}</span>}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col">
          <MainTabs state={state} tab={tab} setTab={setTab} />
          {tab !== "recit" ? (
            <div className={`min-h-0 flex-1 ${tab === "monde" && worldView === "carte" ? "flex flex-col" : "scrollbar-thin overflow-y-auto"}`}>
              {tab === "monde" && (
                <>
                  <SubTabs value={worldView} onChange={setWorldView} options={[["carte", "Carte"], ["renseignement", "Renseignement"]]} />
                  {worldView === "carte" ? (
                    <div className="min-h-0 flex-1">
                      <WorldMap state={state} onChange={busy ? undefined : commit} focus={mapFocus} />
                    </div>
                  ) : (
                    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
                      <IntelBoard state={state} onChange={busy ? undefined : commit} />
                    </div>
                  )}
                </>
              )}
              {tab === "qg" && (
                <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
                  <HQ state={state} plan={plan} setPlan={setPlan} busy={busy} onAction={(a) => play(a)} onChange={busy ? undefined : commit} onBackToStory={() => setTab("recit")} focusOffer={offerFocus} />
                </div>
              )}
              {tab === "archives" && (
                <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
                  <Archives state={state} focus={archiveFocus} />
                </div>
              )}
              {tab === "agence" && (
                <>
                  {RANKS[c.rank].order >= RANKS.agent.order && (
                    <SubTabs value={agencyView} onChange={setAgencyView} options={[["effectif", "Effectif et Cercles"], ["commandement", "Ce que tu diriges"]]} />
                  )}
                  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
                    {agencyView === "commandement" && RANKS[c.rank].order >= RANKS.agent.order ? (
                      <CommandPanel state={state} onChange={busy ? undefined : commit} />
                    ) : (
                      <TeamPanel state={state} onChange={busy ? undefined : commit} />
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
          <>
          <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin bg-weave min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[44rem] px-5 pt-10 pb-16 sm:px-8">
              {state.log.length === 0 && !busy && (
                <div className="py-24 text-center">
                  <p className="font-serif text-2xl text-ivory/90 italic">Le dossier est refermé. L'histoire peut commencer.</p>
                  <button onClick={() => play({ type: "start" })} className="btn btn-primary mt-8 px-8 py-4">
                    Commencer le récit
                  </button>
                </div>
              )}

              {state.log.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}

              {live && (
                <>
                  {live.player && <PlayerLine text={live.player} original={live.original} reason={live.reason} />}
                  <NarratorBlock segments={live.segments} animate streaming />
                  {live.status && (
                    <p className="mt-4 flex items-center gap-2 text-sm text-muted italic">
                      <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-brass" />
                      {live.status}
                    </p>
                  )}
                </>
              )}

              {rejection && (
                <div className="animate-rise mt-8 rounded-sm border border-partial/40 bg-partial/[0.07] p-4 text-sm">
                  <p className="label mb-1 text-partial">Action non retenue</p>
                  {rejection.text && <p className="mb-2 font-serif text-base text-muted italic line-through decoration-1">{rejection.text}</p>}
                  <p className="text-ivory">{rejection.reason}</p>
                  {rejection.suggestion && <p className="mt-2 text-muted">Suggestion : {rejection.suggestion}</p>}
                  <p className="mt-2 text-xs text-faint">Rien n'a été joué. Modifie ton action ou choisis une option.</p>
                </div>
              )}

              {error && (
                <div className="animate-rise mt-8 rounded-sm border border-stamp/50 bg-stamp/10 p-4 text-sm">
                  <p className="text-ivory">{error.message}</p>
                  <button onClick={() => play(error.action)} className="mt-2 font-semibold text-brass-soft hover:underline">
                    Réessayer
                  </button>
                </div>
              )}

              {!busy && (lastUsage || state.usage.turns > 0) && (
                <p className="mt-10 text-center font-mono text-[10px] text-faint/70" title="Estimation d'après les tarifs publics de l'API">
                  {lastUsage && (
                    <>
                      Dernier tour{lastRouting ? ` · ${modelLabel(lastRouting.model)} (${lastRouting.reason})` : ""} ≈ {formatUsd(lastUsage.costUsd)} · {formatTokens(lastUsage.cacheReadTokens)} jetons relus en cache,{" "}
                      {formatTokens(lastUsage.inputTokens + lastUsage.cacheWriteTokens)} nouveaux, {formatTokens(lastUsage.outputTokens)} écrits ·{" "}
                    </>
                  )}
                  Partie ≈ {formatUsd(state.usage.costUsd)} ({state.usage.turns} tours)
                </p>
              )}

              {lastEntryId && state.log.at(-1)?.role === "narrator" && (!busy || correction.status) && (
                <div className="mt-6">
                  {correction.open ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        correctLast();
                      }}
                      className="rounded-sm border border-line bg-panel/70 p-3"
                    >
                      <p className="label mb-2">Corriger le dernier passage</p>
                      <input
                        autoFocus
                        value={correction.text}
                        onChange={(e) => setCorrection((c) => ({ ...c, text: e.target.value }))}
                        disabled={correction.status !== null}
                        maxLength={600}
                        placeholder="Ex. : son nom de code est Atlas · Nour est une fille · on est à Lyon, pas à Paris"
                        className="field text-sm"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-faint">
                          {correction.status ?? correction.error ?? "Le passage est réécrit à l'identique sauf ce point, et la fiche est corrigée. Le tour n'est pas rejoué."}
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => (correction.status ? abortRef.current?.abort() : setCorrection({ open: false, text: "", status: null, error: null }))}
                            className="px-2 text-[11px] tracking-[0.15em] text-muted uppercase hover:text-ivory"
                          >
                            {correction.status ? "Stop" : "Annuler"}
                          </button>
                          <button type="submit" disabled={!correction.text.trim() || correction.status !== null} className="btn btn-primary px-3 py-1.5">
                            Corriger
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-end gap-5">
                      <button
                        onClick={() => setCorrection((c) => ({ ...c, open: true }))}
                        className="text-[11px] tracking-[0.15em] text-faint uppercase hover:text-muted"
                        title="Corriger un détail du dernier passage sans rejouer le tour"
                      >
                        ✎ Corriger
                      </button>
                      {canRewrite && (
                        <button
                          onClick={rewrite}
                          className="text-[11px] tracking-[0.15em] text-faint uppercase hover:text-muted"
                          title="Annule le dernier tour et le fait réécrire (les dés sont relancés)"
                        >
                          ↺ Réécrire ce tour
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {promotions.length > 0 && !busy && (
            <div className="shrink-0 border-t px-5 py-2.5" style={{ borderColor: tint(agency.color, 40), background: tint(agency.color, 8) }}>
              <div className="mx-auto flex max-w-[44rem] flex-wrap items-center gap-3">
                <span className="text-lg" style={{ color: agency.color }}>
                  ❖
                </span>
                <p className="flex-1 text-sm">
                  <span className="font-semibold" style={{ color: agency.color }}>
                    Promotion possible
                  </span>
                  <span className="text-muted"> — c'est à toi de la demander.</span>
                </p>
                {promotions.map((r) => (
                  <button
                    key={r}
                    onClick={() => setCeremonyRank(r)}
                    className="rounded-sm px-3 py-1.5 text-[11px] font-bold tracking-[0.15em] uppercase"
                    style={{ background: agency.color, color: "var(--color-ink)" }}
                  >
                    {RANKS[r].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Composer
            state={state}
            busy={busy}
            draft={draft}
            setDraft={setDraft}
            onChoice={(label) => play({ type: "choice", text: label })}
            onSubmit={submitFree}
            onAdvance={() => play({ type: "advance" })}
            onStop={() => abortRef.current?.abort()}
            storageWarning={storageWarning}
            plan={plan}
            onPlayWeek={() => play({ type: "week", plan })}
            onAction={(a) => play(a)}
            onChange={commit}
            openTab={(t) => setTab(t)}
          />
          </>
          )}
        </main>

        <aside
          className={`absolute inset-y-0 right-0 z-30 w-[22rem] max-w-[90vw] border-l border-line bg-panel shadow-2xl transition-transform lg:static lg:translate-x-0 lg:shadow-none ${
            sheetOpen ? "translate-x-0" : "translate-x-full"
          } ${sheetPinned ? "" : "lg:hidden"}`}
        >
          <CharacterSheet
            state={state}
            onChange={busy ? undefined : commit}
            onOpenPromotion={promotions.length && !busy ? () => (setSheetOpen(false), setCeremonyRank(promotions[0])) : undefined}
            onOpenMallette={() => (setSheetOpen(false), setMalletteOpen(true))}
            onOpenArchives={(folder) => (setSheetOpen(false), go({ to: "archives", folder }))}
            focusTab={sheetFocus}
            onAction={
              busy || state.log.length === 0
                ? undefined
                : (a) => {
                    setSheetOpen(false);
                    play(a);
                  }
            }
          />
        </aside>
        {sheetOpen && <div className="absolute inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSheetOpen(false)} />}
        {malletteOpen && (
          <Mallette
            state={state}
            onChange={busy ? undefined : commit}
            onAction={busy || state.log.length === 0 ? undefined : (a) => (setTab("recit"), play(a))}
            onClose={() => setMalletteOpen(false)}
          />
        )}
        {phone.open && w.phase !== "dossier" && (
          <Phone
            state={state}
            plan={plan}
            app={phone.app}
            onChange={busy ? undefined : commit}
            onAction={busy || state.log.length === 0 ? undefined : (a) => (setPhone((p) => ({ ...p, open: false })), setTab("recit"), play(a))}
            onClose={() => setPhone((p) => ({ ...p, open: false }))}
            go={(t) => {
              if (!window.matchMedia("(min-width: 640px)").matches) setPhone((p) => ({ ...p, open: false }));
              go(t);
            }}
          />
        )}
        {terminalOpen && <Terminal state={state} onClose={() => setTerminalOpen(false)} go={go} actions={terminalActions} />}
        {ceremonyRank && !busy && (
          <CareerCeremony
            state={state}
            rank={ceremonyRank}
            onClose={() => setCeremonyRank(null)}
            onConfirm={(opts) => {
              const rank = ceremonyRank;
              setCeremonyRank(null);
              play({ type: "promotion", rank, ...opts });
            }}
          />
        )}

        <div className={`pointer-events-none absolute top-3 right-3 z-50 flex w-72 flex-col gap-2 ${sheetPinned ? "lg:right-[23rem]" : ""}`} aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="animate-rise flex items-start gap-2.5 rounded-sm border bg-panel/95 px-3 py-2 text-sm shadow-xl backdrop-blur"
              style={{ borderColor: TOAST_COLORS[t.kind] }}
            >
              <span className="mt-0.5 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: TOAST_COLORS[t.kind] }}>
                {TOAST_LABELS[t.kind]}
              </span>
              <span className="flex-1 text-ivory/90">{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  if (entry.role === "player") {
    const text = entry.segments.map((s) => (s.kind === "text" ? s.text : "")).join(" ");
    return <PlayerLine text={text} original={entry.original} />;
  }
  return <NarratorBlock segments={entry.segments} />;
}

function PlayerLine({ text, original, reason }: { text: string; original?: string; reason?: string }) {
  return (
    <div className="animate-rise my-8 flex gap-3 border-l-2 border-brass/60 py-1 pl-4">
      <span className="label mt-1 shrink-0 text-brass/80">Toi</span>
      <div>
        {original && (
          <p className="font-serif text-base text-faint italic line-through decoration-1" title="Ce que tu avais écrit">
            {original}
          </p>
        )}
        <p className="font-serif text-lg text-brass-soft/95 italic">{text}</p>
        {original && (
          <p className="mt-1 font-sans text-[11px] text-partial/80">
            Action reformulée par le narrateur{reason ? ` — ${reason}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

const TOAST_COLORS: Record<ProgressKind, string> = {
  skill: "#5b8def",
  pole: "#a173d9",
  rank: "#c9a45c",
  merit: "#e2c88f",
  item: "#8f949c",
  pin: "#e2c88f",
  points: "#c9a45c",
  codename: "#e2c88f",
  seat: "#4fb3a8",
  age: "#9a9587",
  money: "#7fb08a",
};

const TOAST_LABELS: Record<ProgressKind, string> = {
  skill: "Compétence",
  pole: "Pôle",
  rank: "Grade",
  merit: "Mérite",
  item: "Objet",
  pin: "Distinction",
  points: "Points",
  codename: "Nom de code",
  seat: "Carrière",
  age: "Âge",
  money: "Argent",
};

const MODES: { id: NarrationMode; label: string; title: string }[] = [
  { id: "eco", label: "Éco", title: "Toujours le modèle rapide (≈ 2× moins cher)" },
  { id: "hybride", label: "Hybride", title: "Modèle rapide pour les scènes courantes, modèle fort pour les moments clés" },
  { id: "prestige", label: "Prestige", title: "Toujours le modèle fort (meilleure narration)" },
];

const PACE_OPTIONS: { id: Pace; label: string; title: string }[] = [
  { id: "pose", label: "Posé", title: "Scènes développées, on prend le temps" },
  { id: "normal", label: "Normal", title: "Scènes de 2 à 3 tours, ellipses fréquentes" },
  { id: "rapide", label: "Rapide", title: "Ellipses et montages presque à chaque tour" },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; title: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="flex overflow-hidden rounded-sm border border-line" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={value === o.id}
            disabled={disabled}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`flex-1 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors ${
              value === o.id ? "bg-brass/20 text-brass-soft" : "text-muted hover:text-ivory"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-faint">{options.find((o) => o.id === value)?.title}</p>
    </div>
  );
}

function SettingsMenu({
  settings,
  onChange,
  disabled,
  onExport,
}: {
  settings: GameState["settings"];
  onChange: (patch: Partial<GameState["settings"]>) => void;
  disabled: boolean;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Réglages, codex, sauvegarde"
        className="rounded-sm border border-line px-2.5 py-1.5 text-[11px] text-muted hover:border-brass hover:text-ivory"
      >
        ⚙
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 space-y-4 rounded-sm border border-line-strong bg-panel p-4 shadow-2xl">
            <Segmented label="Narration" value={settings.narration} options={MODES} onChange={(narration) => onChange({ narration })} disabled={disabled} />
            <Segmented label="Rythme" value={settings.pace} options={PACE_OPTIONS} onChange={(pace) => onChange({ pace })} disabled={disabled} />
            <div className="flex justify-between border-t border-line pt-3 text-[11px] tracking-[0.15em] uppercase">
              <Link href="/codex" target="_blank" className="text-muted hover:text-ivory">
                Codex ↗
              </Link>
              <button onClick={onExport} className="text-muted uppercase hover:text-ivory">
                Exporter la partie
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** L'état du personnage d'un coup d'œil, dans l'en-tête. */
function Hud({ state, onClick }: { state: GameState; onClick: () => void }) {
  const c = state.character;
  const upkeep = weeklyUpkeep(state);
  const items = [
    { label: "Santé", value: c.health, max: c.healthMax, color: c.health <= c.healthMax / 3 ? "var(--color-fail)" : "var(--pole-corps)" },
    { label: "Moral", value: c.morale, max: c.moraleMax, color: "var(--pole-ame)" },
    { label: "Fatigue", value: c.fatigue, max: 100, color: c.fatigue >= 60 ? "var(--color-fail)" : "var(--color-partial)" },
  ];
  return (
    <button onClick={onClick} className="hidden items-center gap-4 rounded-sm px-2 py-1 hover:bg-ivory/5 md:flex" title="Ouvrir ta fiche">
      {items.map((i) => (
        <span key={i.label} className="w-16 text-left">
          <span className="flex justify-between text-[9px] tracking-[0.15em] text-faint uppercase">
            {i.label}
            <span className="font-mono text-ivory/80">{i.value}</span>
          </span>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${(i.value / i.max) * 100}%`, background: i.color }} />
          </span>
        </span>
      ))}
      <span className="text-left">
        <span className="block text-[9px] tracking-[0.15em] text-faint uppercase">Solde</span>
        <span className="font-mono text-xs text-success" title={upkeep ? `Entretien ${formatEuros(upkeep)}/semaine` : undefined}>
          {formatEuros(c.money)}
        </span>
      </span>
      {(c.injuries?.length ?? 0) > 0 && (
        <span className="text-[10px] text-fail" title={c.injuries.map((i) => i.name).join(", ")}>
          ✚ {c.injuries.length}
        </span>
      )}
      {c.prison && <span className="text-[10px] font-semibold tracking-[0.15em] text-fail uppercase">Détenu</span>}
    </button>
  );
}

function SubTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex shrink-0 justify-center gap-1 border-b border-line bg-night/40 px-3 py-1.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-sm px-3 py-1 text-[11px] tracking-[0.1em] transition-colors ${value === id ? "bg-brass/15 text-brass-soft" : "text-muted hover:text-ivory"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function formatUsd(n: number) {
  return `${n < 0.1 ? n.toFixed(3) : n.toFixed(2)} $`;
}

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function NarratorBlock({
  segments,
  animate = false,
  streaming = false,
}: {
  segments: Segment[];
  animate?: boolean;
  streaming?: boolean;
}) {
  // Regroupe les événements consécutifs sur une même ligne.
  const groups: (Segment | { kind: "events"; texts: string[] })[] = [];
  for (const s of segments) {
    const last = groups.at(-1);
    if (s.kind === "event") {
      if (last?.kind === "events") last.texts.push(s.text);
      else groups.push({ kind: "events", texts: [s.text] });
    } else groups.push(s);
  }
  return (
    <div className="font-serif text-[1.2rem] leading-[1.75] text-ivory/95">
      {groups.map((g, i) => {
        const isLast = i === groups.length - 1;
        if (g.kind === "text")
          return (
            <div key={i} className={`prose-narrative ${streaming && isLast ? "caret" : ""}`}>
              <RichText text={g.text} />
            </div>
          );
        if (g.kind === "check") return <DiceCard key={i} check={g.check} animate={animate} />;
        if (g.kind === "card")
          return (
            <div key={i} className="text-base leading-normal">
              <StoryCardView card={g.card} animate={animate} />
            </div>
          );
        if (g.kind === "doc")
          return (
            <div key={i} className="text-base leading-normal">
              <StoryDocView doc={g.doc} animate={animate} />
            </div>
          );
        if (g.kind === "events")
          return (
            <div key={i} className="animate-rise my-4 flex flex-wrap gap-2 font-sans">
              {g.texts.map((t, j) => (
                <span key={j} className="rounded-sm border border-line bg-panel/70 px-2 py-1 text-[11px] tracking-wide text-muted">
                  <span className="text-brass">◆</span> {t}
                </span>
              ))}
            </div>
          );
        return null;
      })}
    </div>
  );
}

function MainTabs({ state, tab, setTab }: { state: GameState; tab: MainTab; setTab: (t: MainTab) => void }) {
  const c = state.character;
  const started = state.world.phase !== "dossier";
  const urgent = state.world.geo.threats.filter((t) => threatVisible(state, t) && (t.capstone || t.progress >= 75)).length;
  const hqLabel = state.mission ? "Mission" : c.prison ? "Cellule" : c.rank === "aspirant" ? "Académie" : "QG";
  const tabs: { id: MainTab; label: string; badge?: number; hint: string }[] = [
    { id: "recit", label: "Récit", hint: "L'histoire, tes choix" },
    ...(state.world.phase === "base" || state.mission
      ? [{ id: "qg" as const, label: hqLabel, badge: state.offers.length + state.duties.filter((d) => d.status === "ouvert" && d.dueDay - state.world.day <= 7).length, hint: "Ta semaine, les missions, tes obligations" }]
      : []),
    { id: "monde", label: "Monde", badge: c.rank !== "prospect" ? urgent : 0, hint: "Carte et renseignement" },
    { id: "agence", label: "Agence", hint: "Le Cercle, l'effectif, ce que tu diriges" },
    { id: "archives", label: "Archives", hint: "Tes opérations, tes rapports, tes pièces, les dossiers de l'agence" },
  ];
  if (!started) return null;
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-night/70 px-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          title={t.hint}
          className={`relative px-4 py-2.5 text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase transition-colors ${
            tab === t.id ? "text-brass-soft" : "text-muted hover:text-ivory"
          }`}
        >
          {t.label}
          {t.badge ? <span className="ml-1.5 rounded-full bg-brass px-1.5 text-[9px] text-ink">{t.badge}</span> : null}
          {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brass" />}
        </button>
      ))}
    </nav>
  );
}

/** À la base, entre deux scènes : les deux décisions possibles, côte à côte. */
function BaseDock({ state, plan, onPlayWeek, openTab }: { state: GameState; plan: ActivityChoice[]; onPlayWeek: () => void; openTab: (t: MainTab) => void }) {
  const error = planError(state, plan);
  const offer = state.offers[0];
  const canGo = Boolean(offer) && !canStartMission(state);
  return (
    <div className={`mb-3 grid gap-2 ${canGo ? "sm:grid-cols-2" : ""}`}>
      <div className="flex flex-col justify-between gap-2 rounded-sm border border-line bg-panel/60 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">{state.character.prison ? "En cellule" : "Cette semaine"}</span>
          <button onClick={() => openTab("qg")} className="text-[10px] tracking-[0.15em] text-muted uppercase hover:text-ivory">
            Planifier
          </button>
        </div>
        <p className="flex flex-wrap gap-1.5">
          {plan.map((p, i) => (
            <span key={i} className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ivory/85">
              <span className="text-brass">{ACTIVITIES[p.activity].icon}</span> {ACTIVITIES[p.activity].label}
            </span>
          ))}
        </p>
        {error && <p className="text-[11px] text-fail">{error}</p>}
        <button onClick={onPlayWeek} disabled={Boolean(error)} title={error ?? ""} className="btn btn-primary py-2">
          Jouer la semaine ▸
        </button>
      </div>
      {canGo && (
        <button onClick={() => openTab("qg")} className="group flex flex-col justify-between gap-2 rounded-sm border border-fail/40 bg-fail/[0.06] p-3 text-left transition-colors hover:border-fail/70">
          <span className="label text-fail">{offer.assigned ? "Mission assignée" : `${state.offers.length} mission${state.offers.length > 1 ? "s" : ""} au tableau`}</span>
          <span className="font-serif text-xl leading-tight">{offer.title.split(" — ")[0]}</span>
          <span className="line-clamp-2 text-xs text-muted">{offer.summary}</span>
          <span className="text-[11px] font-semibold tracking-[0.15em] text-fail uppercase group-hover:underline">Préparer le départ ▸</span>
        </button>
      )}
    </div>
  );
}

function Composer({
  state,
  busy,
  draft,
  setDraft,
  onChoice,
  onSubmit,
  onAdvance,
  onStop,
  storageWarning,
  plan,
  onPlayWeek,
  onAction,
  onChange,
  openTab,
}: {
  state: GameState;
  busy: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onChoice: (label: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onStop: () => void;
  storageWarning: boolean;
  plan: ActivityChoice[];
  onPlayWeek: () => void;
  onAction: (a: PlayerAction) => void;
  onChange: (s: GameState) => void;
  openTab: (t: MainTab) => void;
}) {
  const phase = state.world.phase;
  const atBase = phase === "base" && !state.mission;
  const choices = busy ? [] : state.choices;
  const [writing, setWriting] = useState(false);
  const pick = (i: number) => {
    const choice = choices[i];
    if (choice) onChoice(choice.skill ? `[${SKILLS[choice.skill].label}] ${choice.label}` : choice.label);
  };
  // Raccourcis : 1 à 4 pour les choix du narrateur (hors saisie).
  useEffect(() => {
    if (!choices.length || (phase === "mission" && state.mission)) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) pick(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (state.log.length === 0 && !busy) return null;
  // En mission : la console du moteur remplace les choix du narrateur.
  if (phase === "mission" && state.mission && !busy)
    return (
      <div className="scrollbar-thin max-h-[58vh] shrink-0 overflow-y-auto border-t border-line bg-night/95">
        <div className="mx-auto max-w-[56rem] px-5 py-4 sm:px-8">
          <MissionConsole state={state} busy={busy} onAction={onAction} onChange={onChange} />
        </div>
      </div>
    );
  // À la base sans scène en cours, on décide de la suite ; l'action libre reste à portée de main.
  const showInput = busy || !atBase || choices.length > 0 || writing || draft.length > 0;
  // Sur téléphone, quand le narrateur propose des choix, la saisie libre se replie derrière un lien.
  const foldOnPhone = choices.length > 0 && !writing && !draft && !busy;
  return (
    <div className="shrink-0 border-t border-line bg-night/95">
      <div className="mx-auto max-w-[44rem] px-5 py-4 sm:px-8">
        {storageWarning && (
          <p className="mb-2 text-xs text-fail">
            Sauvegarde impossible : stockage du navigateur plein. Exporte ta partie pour ne rien perdre.
          </p>
        )}
        {atBase && !busy && choices.length === 0 && <BaseDock state={state} plan={plan} onPlayWeek={onPlayWeek} openTab={openTab} />}
        {choices.length > 0 && (
          <ul className="mb-3 grid gap-2 sm:grid-cols-2">
            {choices.map((choice, i) => (
              <li key={i}>
                <button
                  onClick={() => pick(i)}
                  className="group flex h-full w-full items-start gap-3 rounded-sm border border-line bg-panel/60 px-3 py-2.5 text-left text-sm transition-all hover:border-brass/60 hover:bg-panel"
                >
                  {choice.skill ? (
                    <SkillGlyph skill={choice.skill} className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <span className={`mt-0.5 w-4 shrink-0 text-center font-mono text-[10px] ${TONE_STYLE[choice.tone]}`}>{i + 1}</span>
                  )}
                  <span className="flex-1">
                    {choice.skill && (
                      <span className="mr-1.5 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: ATTRIBUTES[SKILLS[choice.skill].attribute].color }}>
                        [{SKILLS[choice.skill].label}]
                      </span>
                    )}
                    {choice.label}
                    <span className={`ml-2 text-[10px] tracking-[0.15em] uppercase opacity-60 ${TONE_STYLE[choice.tone]}`}>{CHOICE_TONES[choice.tone].label}</span>
                  </span>
                  <kbd className="hidden shrink-0 font-mono text-[10px] text-faint sm:inline">{i + 1}</kbd>
                </button>
              </li>
            ))}
          </ul>
        )}
        {atBase && !busy && choices.length > 0 && (
          <p className="mb-2 text-right text-[11px] text-faint">
            Ou laisser filer :{" "}
            <button onClick={() => openTab("qg")} className="tracking-[0.12em] text-muted uppercase hover:text-ivory">
              passer à la semaine ▸
            </button>
          </p>
        )}
        {showInput ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className={`items-end gap-2 ${foldOnPhone ? "hidden sm:flex" : "flex"}`}
          >
            <textarea
              value={draft}
              autoFocus={writing}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              disabled={busy}
              rows={1}
              maxLength={1500}
              placeholder={busy ? "Le narrateur écrit…" : "Ou décris ton action, tes paroles…  ((hors-jeu entre doubles parenthèses))"}
              className="field max-h-40 min-h-[44px] flex-1 resize-none font-serif text-base"
            />
            {busy ? (
              <button type="button" onClick={onStop} className="btn btn-ghost h-[44px]">
                Stop
              </button>
            ) : (
              <>
                {!atBase && (
                  <button type="button" onClick={onAdvance} title="Conclure la scène et passer au prochain moment important" className="btn btn-ghost h-[44px] px-3">
                    ⏭<span className="hidden sm:inline">Avancer</span>
                  </button>
                )}
                <button type="submit" disabled={!draft.trim()} className="btn btn-primary h-[44px]">
                  Agir
                </button>
              </>
            )}
          </form>
        ) : null}
        {(!showInput || foldOnPhone) && (
          <button onClick={() => setWriting(true)} className={`text-[10px] tracking-[0.15em] text-muted uppercase hover:text-ivory ${showInput ? "sm:hidden" : ""}`}>
            ✎ Faire autre chose (action libre)
          </button>
        )}
      </div>
    </div>
  );
}
