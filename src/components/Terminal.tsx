"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENCIES } from "@/lib/game/agencies";
import { clearance, clearanceDef, knownRegions } from "@/lib/game/intel";
import { MISSION_IMPORTANCE } from "@/lib/game/rules";
import type { GameState } from "@/lib/game/types";
import { CITIES, findCountry } from "@/lib/world/geo";
import { archiveIndex } from "./Archives";
import type { SheetTab } from "./CharacterSheet";
import type { PhoneApp } from "./Phone";

/** Où le terminal peut t'emmener. */
export type NavTarget =
  | { to: "recit" }
  | { to: "qg"; offer?: string }
  | { to: "carte"; city?: string }
  | { to: "renseignement" }
  | { to: "effectif" }
  | { to: "commandement" }
  | { to: "archives"; folder?: string }
  | { to: "fiche"; tab: SheetTab }
  | { to: "mallette" }
  | { to: "phone"; app?: PhoneApp };

type Group = "Récents" | "Agir" | "Aller" | "Missions" | "Lieux" | "Personnes" | "Dossiers";

interface Entry {
  id: string;
  group: Group;
  icon: string;
  label: string;
  hint: string;
  /** Mots supplémentaires pour la recherche. */
  words?: string;
  /** Lignes affichées dans le volet d'aperçu. */
  preview?: string[];
  /** N'apparaît que si l'on tape quelque chose (les lieux, les dossiers). */
  searchOnly?: boolean;
  run: () => void;
}

/** Les préfixes qui restreignent la recherche, comme sur un vrai terminal. */
const PREFIXES: { key: string; group: Group; label: string }[] = [
  { key: ">", group: "Agir", label: "actions" },
  { key: "/", group: "Lieux", label: "lieux" },
  { key: "#", group: "Dossiers", label: "archives" },
  { key: "@", group: "Personnes", label: "personnes" },
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const RECENT_KEY = "lucerne:terminal";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 6)));
  } catch {
    /* stockage indisponible : pas d'historique */
  }
}

/**
 * Le terminal sécurisé (Ctrl/⌘ K) : on tape ce qu'on cherche, il trouve l'écran, la mission,
 * la ville, le dossier ou l'action, et y va. Les préfixes > / # @ restreignent la recherche.
 */
export function Terminal({
  state,
  onClose,
  go,
  actions,
}: {
  state: GameState;
  onClose: () => void;
  go: (target: NavTarget) => void;
  /** Les actions de jeu possibles maintenant (absentes pendant que le narrateur écrit). */
  actions: { id: string; icon: string; label: string; hint: string; run: () => void }[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recent] = useState(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const c = state.character;
  const agency = AGENCIES[c.identity.agency];
  const lvl = clearance(state);
  const cadet = c.rank === "prospect" || c.rank === "aspirant";

  const entries = useMemo(() => {
    const out: Entry[] = [];
    const nav = (id: string, icon: string, label: string, hint: string, target: NavTarget, words = "") => out.push({ id, group: "Aller", icon, label, hint, words, run: () => go(target) });

    // Agir : ce que le jeu permet là, maintenant.
    for (const a of actions) out.push({ ...a, group: "Agir" });
    out.push({ id: "act:mallette", group: "Agir", icon: "▣", label: "Ouvrir la mallette", hint: "Inventaire, casier, fiche technique des objets", words: "inventaire objets sac gadgets", run: () => go({ to: "mallette" }) });

    // Aller : les écrans.
    nav("nav:recit", "¶", "Récit", "Le fil de l'histoire et tes choix", { to: "recit" }, "histoire narrateur");
    nav("nav:qg", "⌂", "QG", "Ta semaine, tes missions, tes obligations", { to: "qg" }, "semaine planning agenda");
    nav("nav:carte", "◎", "Carte du monde", "Villes, routes, menaces, tes gens", { to: "carte" }, "monde map");
    nav("nav:renseignement", "⌕", "Renseignement", "Accréditation, réseau de sources, questions en cours", { to: "renseignement" }, "intel sources demander analyse menaces");
    nav("nav:effectif", "☷", "Effectif et Cercles", "Les agents, les Cercles des trois agences", { to: "effectif" }, "agence agents equipe");
    if (!cadet) nav("nav:commandement", "▲", "Ce que tu diriges", "Station, équipe, informateurs", { to: "commandement" }, "station sources informateurs");
    nav("nav:archives", "▤", "Archives", "Tes dossiers et ceux que l'agence te laisse lire", { to: "archives" }, "dossiers classeur");
    nav("nav:fiche", "◐", "Fiche · Aptitudes", "Compétences, traits, blessures, langues", { to: "fiche", tab: "fiche" }, "competences personnage perso");
    nav("nav:carriere", "◐", "Fiche · Carrière", "Grade, mérite, siège, Branches, légendes", { to: "fiche", tab: "agent" }, "grade promotion legendes merite");
    nav("nav:couvertures", "◐", "Fiche · Couvertures", "Légendes, couverture civile, fiché par pays", { to: "fiche", tab: "legendes" }, "legendes passeports notoriete fiche");
    nav("tel:agenda", "▦", "Téléphone · Agenda", "Calendrier, semaine, échéances", { to: "phone", app: "agenda" }, "calendrier planning echeances devoirs");
    nav("tel:messages", "✉", "Téléphone · Messages", "Tes contacts : écrire, demander un service", { to: "phone", app: "messages" }, "liens relations contacts");
    nav("tel:reseau", "⌕", "Téléphone · Réseau", "Les réponses que tu attends", { to: "phone", app: "reseau" }, "questions sources");
    nav("tel:banque", "€", "Téléphone · Banque", "Compte, entretien, patrimoine", { to: "phone", app: "banque" }, "argent finances biens solde");
    nav("tel:sante", "✚", "Téléphone · Santé", "Santé, moral, énergie, blessures", { to: "phone", app: "sante" }, "blessures fatigue");
    nav("tel:notes", "✎", "Téléphone · Notes", "Faits établis, chapitres", { to: "phone", app: "notes" }, "carnet journal");
    nav("tel:pieces", "▣", "Téléphone · Pièces", "Messages, lettres, photos gardés", { to: "phone", app: "photos" }, "photos documents");

    // Missions.
    if (state.mission)
      out.push({
        id: "mis:current",
        group: "Missions",
        icon: "✦",
        label: `Reprendre : ${state.mission.name}`,
        hint: `${CITIES.find((x) => x.id === state.mission!.cityId)?.name ?? state.mission.cityId} · ${state.mission.objective}`,
        run: () => go({ to: "recit" }),
      });
    for (const o of state.offers) {
      const city = CITIES.find((x) => x.id === o.cityId);
      out.push({
        id: `mis:${o.id}`,
        group: "Missions",
        icon: o.assigned ? "!" : "◇",
        label: `${state.mission ? "Mission" : "Préparer"} : ${o.title}`,
        hint: `${city?.name ?? o.cityId} · ${MISSION_IMPORTANCE[o.importance].label}${o.assigned ? " · assignée" : ""} · expire J${o.expiresDay}`,
        words: `${o.target} ${o.faction} ${o.objective}`,
        preview: [o.summary, `Objectif : ${o.objective}`],
        run: () => go(state.mission ? { to: "qg" } : { to: "qg", offer: o.id }),
      });
    }

    // Lieux : toutes les villes de la carte, avec ce qu'on y a.
    const watched = knownRegions(state);
    for (const city of CITIES) {
      const country = findCountry(city.country);
      const tags: string[] = [];
      if (state.world.cityId === city.id) tags.push("tu y es");
      if (c.station === city.id || state.command.station?.cityId === city.id) tags.push("ta Station");
      const offers = state.offers.filter((o) => o.cityId === city.id).length;
      if (offers) tags.push(`${offers} mission${offers > 1 ? "s" : ""}`);
      const people = state.relations.filter((r) => r.cityId === city.id && r.status === "actif").map((r) => r.name);
      if (people.length) tags.push(people.join(", "));
      const assets = state.command.assets.filter((a) => a.cityId === city.id && a.status === "actif").length;
      if (assets) tags.push(`${assets} source${assets > 1 ? "s" : ""}`);
      const region = country?.region;
      out.push({
        id: `geo:${city.id}`,
        group: "Lieux",
        icon: "⌖",
        label: city.name,
        hint: [country?.name, ...tags].filter(Boolean).join(" · "),
        words: `${country?.name ?? ""} ${people.join(" ")}`,
        preview: [region && (lvl >= 4 || watched.has(region)) ? `Région suivie (${watched.get(region) ?? "accréditation"}).` : "Hors de ta zone : la carte n'en montre que la géographie."],
        searchOnly: tags.length === 0,
        run: () => go({ to: "carte", city: city.id }),
      });
    }

    // Dossiers : tout ce que le classeur te laisse lire.
    for (const f of archiveIndex(state))
      out.push({
        id: `arc:${f.id}`,
        group: f.drawer === "personnes" ? "Personnes" : "Dossiers",
        icon: f.drawer === "personnes" ? "@" : "#",
        label: f.title,
        hint: `${f.drawerLabel} · ${f.meta}`,
        words: `${f.drawer} ${f.text}`,
        searchOnly: true,
        run: () => go({ to: "archives", folder: f.id }),
      });
    return out;
  }, [state, actions, go, c, cadet, lvl]);

  const results = useMemo(() => {
    const raw = query.trimStart();
    const prefix = PREFIXES.find((p) => raw.startsWith(p.key));
    const q = fold((prefix ? raw.slice(1) : raw).trim());
    // « # » fouille tout le classeur, personnes comprises.
    const inGroup = (e: Entry) => !prefix || e.group === prefix.group || (prefix.group === "Dossiers" && e.group === "Personnes");
    if (!q && !prefix) {
      const byId = new Map(entries.map((e) => [e.id, e]));
      const recents = recent.map((id) => byId.get(id)).filter((e): e is Entry => Boolean(e)).map((e) => ({ ...e, group: "Récents" as Group }));
      return [...recents, ...entries.filter((e) => !e.searchOnly && e.group !== "Lieux")];
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored: { e: Entry; score: number }[] = [];
    for (const e of entries) {
      if (!inGroup(e)) continue;
      const label = fold(e.label);
      const hay = `${label} ${fold(e.hint)} ${fold(e.words ?? "")}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 0;
      if (tokens.length && label.startsWith(tokens[0])) score += 30;
      else if (tokens.length && label.split(/[\s:·'’-]+/).some((w) => w.startsWith(tokens[0]))) score += 18;
      if (tokens.every((t) => label.includes(t))) score += 10;
      score += { Agir: 6, Missions: 5, Aller: 4, Récents: 0, Lieux: 2, Personnes: 2, Dossiers: 1 }[e.group];
      scored.push({ e, score });
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.e);
  }, [entries, query, recent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const pick = (e: Entry | undefined) => {
    if (!e) return;
    pushRecent(e.id);
    onClose();
    e.run();
  };

  const selected = results[Math.min(cursor, results.length - 1)];
  // Les résultats, regroupés dans l'ordre où ils arrivent.
  const groups: { group: Group; items: { e: Entry; i: number }[] }[] = [];
  results.forEach((e, i) => {
    const last = groups.at(-1);
    if (last && last.group === e.group) last.items.push({ e, i });
    else groups.push({ group: e.group, items: [{ e, i }] });
  });

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 px-3 pt-[9vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Terminal"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-rise relative mx-auto flex max-h-[78vh] max-w-4xl flex-col overflow-hidden rounded-md border border-[#2f3a2c] font-mono text-[#cfe3c4] shadow-2xl"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #0f1a12, #070a08 70%)" }}
      >
        {/* Les lignes de balayage d'un vieil écran. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(180deg, #cfe3c4 0 1px, transparent 1px 3px)" }} />

        <div className="flex items-center gap-2 border-b border-[#2f3a2c] px-4 py-2 text-[10px] tracking-[0.18em] text-[#7f9a75] uppercase">
          <span className="h-2 w-2 rounded-full bg-[#7fd36b] shadow-[0_0_6px_#7fd36b]" />
          <span className="truncate">
            Terminal sécurisé · <span style={{ color: agency.color }}>{agency.name}</span> · accréd. {clearanceDef(lvl).label} · J{state.world.day}
          </span>
          <span className="ml-auto hidden sm:inline">Échap pour fermer</span>
        </div>

        <label className="flex items-center gap-2 border-b border-[#2f3a2c] px-4 py-3">
          <span className="text-[#7fd36b]">{fold(c.codename || c.matricule || c.identity.lastName).replace(/[^a-z0-9-]+/g, "")}@{agency.name.toLowerCase()}:~$</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(selected);
              } else if (e.key === "Escape") {
                e.preventDefault();
                if (query) setQuery("");
                else onClose();
              } else if (e.key === "Tab" && selected) {
                // Tab complète avec le libellé choisi.
                e.preventDefault();
                setQuery(selected.label);
              }
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder="cherche une mission, une ville, un nom, un écran…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#e6f4dd] caret-[#7fd36b] outline-none placeholder:text-[#4c5f47]"
            aria-controls="terminal-results"
            aria-activedescendant={selected ? `term-${cursor}` : undefined}
          />
        </label>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_16rem]">
          <ul ref={listRef} id="terminal-results" role="listbox" className="scrollbar-thin min-h-0 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-4 py-6 text-sm text-[#7f9a75]">
                <span className="text-[#d9826b]">introuvable</span> : rien dans tes accès ne répond à « {query.trim()} ».
              </li>
            )}
            {groups.map((g, gi) => (
              <li key={`${g.group}:${gi}`}>
                <p className="px-4 pt-2 pb-1 text-[10px] tracking-[0.25em] text-[#5f7a57] uppercase">{g.group}</p>
                <ul>
                  {g.items.map(({ e, i }) => (
                    <li
                      key={`${e.id}:${i}`}
                      id={`term-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={i === cursor}
                      onMouseMove={() => i !== cursor && setCursor(i)}
                      onClick={() => pick(e)}
                      className={`flex cursor-pointer items-baseline gap-3 border-l-2 px-4 py-1.5 ${i === cursor ? "border-[#7fd36b] bg-[#7fd36b]/10" : "border-transparent"}`}
                    >
                      <span className="w-4 shrink-0 text-center text-[#7fd36b]">{e.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${i === cursor ? "text-[#f0fae9]" : "text-[#cfe3c4]"}`}>{e.label}</span>
                        <span className="block truncate text-[11px] text-[#6d8665]">{e.hint}</span>
                      </span>
                      {i === cursor && <span className="shrink-0 text-[10px] text-[#7fd36b]">↵</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {/* L'aperçu : ce que tu vas ouvrir. */}
          <aside className="hidden min-h-0 overflow-y-auto border-l border-[#2f3a2c] p-4 text-xs md:block">
            {selected ? (
              <div key={selected.id}>
                <p className="text-[10px] tracking-[0.25em] text-[#5f7a57] uppercase">{selected.group === "Récents" ? "Récent" : selected.group}</p>
                <p className="mt-1 text-sm leading-snug text-[#f0fae9]">{selected.label}</p>
                <p className="mt-2 leading-relaxed text-[#9db592]">{selected.hint}</p>
                {selected.preview?.map((line, i) => (
                  <p key={i} className="mt-2 leading-relaxed text-[#b9d0ae]">
                    {line}
                  </p>
                ))}
                <p className="mt-4 text-[#5f7a57]">
                  <span className="text-[#7fd36b]">↵</span> ouvrir · <span className="text-[#7fd36b]">⇥</span> compléter
                </p>
              </div>
            ) : (
              <p className="text-[#5f7a57]">—</p>
            )}
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#2f3a2c] px-4 py-2 text-[10px] text-[#6d8665]">
          {PREFIXES.map((p) => (
            <button key={p.key} onClick={() => (setQuery(p.key), setCursor(0), inputRef.current?.focus())} className="hover:text-[#cfe3c4]">
              <span className="text-[#7fd36b]">{p.key}</span> {p.label}
            </button>
          ))}
          <span className="ml-auto">
            <span className="text-[#7fd36b]">↑↓</span> naviguer · <span className="text-[#7fd36b]">Ctrl K</span> ouvrir/fermer · <span className="text-[#7fd36b]">M</span> mallette
          </span>
        </div>
      </div>
    </div>
  );
}
