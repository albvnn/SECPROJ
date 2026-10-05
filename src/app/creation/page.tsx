"use client";

import Link from "next/link";
import { tint } from "@/lib/ui/color";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PoleEmblem, SkillGlyph } from "@/components/glyphs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Emblem } from "@/components/ui";
import { attributeTotal, createGameState, startingRanks, type CharacterDraft } from "@/lib/game/engine";
import {
  AGE_MAX,
  AGE_MIN,
  BREVET_AGE,
  ATTR_CREATION_MAX,
  ATTR_CREATION_POINTS,
  ATTR_MIN,
  ATTRIBUTE_IDS,
  ATTRIBUTES,
  DRAMAS,
  FLAWS,
  GENDERS,
  MOTIVATIONS,
  ORIGINS,
  QUALITIES,
  QUALITY_COUNT,
  SKILL_CREATION_POINTS,
  SKILLS,
  skillCap,
  skillsOf,
  findDrama,
  findFlaw,
  findMotivation,
  findOrigin,
  findQuality,
  type Trait,
} from "@/lib/game/rules";
import type { AgencyId, AttributeId, SkillId } from "@/lib/game/types";
import { saveGame } from "@/lib/client/storage";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { BIRTHPLACES, randomName } from "@/lib/game/names";

type Draft = Omit<CharacterDraft, "signature"> & { signature: SkillId | null };

const STEPS = ["Agence", "Identité", "Origine", "Passé", "Traits", "Aptitudes", "Signature"] as const;

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function initialAttributes(): Record<AttributeId, number> {
  return Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, ATTR_MIN])) as Record<AttributeId, number>;
}

export default function CreationPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    identity: {
      firstName: "",
      lastName: "",
      age: 15,
      gender: "garcon",
      birthplace: "",
      appearance: "",
      languages: "Français",
      agency: "argos",
      nationality: "",
    },
    originId: "",
    dramaId: "",
    motivationId: "",
    qualities: [],
    flaw: "",
    playerNotes: "",
    attributes: initialAttributes(),
    signature: null,
    skillPicks: {},
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setId = <K extends keyof Draft["identity"]>(key: K, value: Draft["identity"][K]) =>
    setDraft((d) => ({ ...d, identity: { ...d.identity, [key]: value } }));

  const attrSpent = attributeTotal(draft.attributes) - ATTRIBUTE_IDS.length * ATTR_MIN;
  const skillSpent = Object.values(draft.skillPicks).reduce((n, v) => n + (v ?? 0), 0);

  const stepValid = [
    draft.identity.nationality !== "",
    draft.identity.firstName.trim() !== "" && draft.identity.lastName.trim() !== "",
    draft.originId !== "",
    draft.dramaId !== "" && draft.motivationId !== "",
    draft.qualities.length === QUALITY_COUNT && draft.flaw !== "",
    attrSpent === ATTR_CREATION_POINTS && skillSpent === SKILL_CREATION_POINTS && draft.signature !== null,
    true,
  ];
  const allValid = stepValid.every(Boolean);

  const finish = () => {
    if (!allValid || !draft.signature) return;
    const state = createGameState({
      ...draft,
      signature: draft.signature,
      identity: {
        ...draft.identity,
        firstName: draft.identity.firstName.trim(),
        lastName: draft.identity.lastName.trim(),
        birthplace: draft.identity.birthplace.trim(),
        appearance: draft.identity.appearance.trim(),
      },
      playerNotes: draft.playerNotes.trim(),
    });
    if (!saveGame(state)) {
      setSaveError("Impossible d'enregistrer : le stockage du navigateur est plein ou désactivé.");
      return;
    }
    router.push(`/jeu?id=${state.id}`);
  };

  return (
    <main className="bg-weave min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-brass">
            <Emblem className="h-8 w-8" />
            <span className="hidden font-serif text-lg tracking-[0.2em] text-ivory sm:inline">LUCERNE</span>
          </Link>
          <ol className="flex flex-1 items-center justify-end gap-1 overflow-x-auto sm:gap-2">
            {STEPS.map((label, i) => {
              const reachable = i <= step || stepValid.slice(0, i).every(Boolean);
              return (
                <li key={label}>
                  <button
                    disabled={!reachable}
                    onClick={() => setStep(i)}
                    className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors ${
                      i === step ? "bg-brass/15 text-brass-soft" : reachable ? "text-muted hover:text-ivory" : "text-faint/50"
                    }`}
                  >
                    <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hidden md:inline">{label}</span>
                    {stepValid[i] && i !== step && i < STEPS.length - 1 && <span className="text-success">✓</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0">
          <p className="label text-brass/80">Étape {step + 1} sur {STEPS.length}</p>
          <h1 className="mt-2 mb-8 font-serif text-4xl">{STEP_TITLES[step]}</h1>

          {step === 0 && <AgencyStep draft={draft} setDraft={setDraft} />}

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom">
                  <input className="field" value={draft.identity.firstName} onChange={(e) => setId("firstName", e.target.value)} placeholder="Prénom" maxLength={40} />
                </Field>
                <Field label="Nom">
                  <input className="field" value={draft.identity.lastName} onChange={(e) => setId("lastName", e.target.value)} placeholder="Nom de famille" maxLength={40} />
                </Field>
              </div>
              <button
                className="text-xs text-brass hover:text-brass-soft"
                onClick={() =>
                  setDraft((d) => {
                    const n = randomName(d.identity.nationality, d.identity.gender);
                    return {
                      ...d,
                      identity: {
                        ...d.identity,
                        firstName: n.first,
                        lastName: n.last,
                        birthplace: d.identity.birthplace || `${pick(BIRTHPLACES[d.identity.nationality] ?? [d.identity.nationality])}, ${d.identity.nationality}`,
                      },
                    };
                  })
                }
              >
                ↻ Tirer une identité au hasard
              </button>
              <Field label="Genre">
                <div className="flex flex-wrap gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setId("gender", g.id)}
                      className={`rounded-sm border px-4 py-2 text-sm transition-colors ${
                        draft.identity.gender === g.id ? "border-brass bg-brass/10 text-brass-soft" : "border-line text-muted hover:border-line-strong hover:text-ivory"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`Âge : ${draft.identity.age} ans`} hint={`Les pays membres proposent leurs prospects entre ${AGE_MIN} et ${AGE_MAX} ans. Aucune vraie mission avant le Brevet, à ${BREVET_AGE} ans : plus tu es jeune, plus tu passeras de temps à l'Académie.`}>
                <input
                  type="range"
                  min={AGE_MIN}
                  max={AGE_MAX}
                  value={draft.identity.age}
                  onChange={(e) => setId("age", Number(e.target.value))}
                  className="w-full accent-[var(--color-brass)]"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Lieu de naissance">
                  <input className="field" value={draft.identity.birthplace} onChange={(e) => setId("birthplace", e.target.value)} placeholder={draft.identity.nationality ? `Ville, ${draft.identity.nationality}` : "Ville, pays"} maxLength={60} />
                </Field>
                <Field label="Langues parlées">
                  <input className="field" value={draft.identity.languages} onChange={(e) => setId("languages", e.target.value)} placeholder="Français, arabe…" maxLength={100} />
                </Field>
              </div>
              <Field label="Apparence" hint="Ce qu'on remarque — ou pas — quand on te croise.">
                <textarea
                  className="field min-h-24 resize-y"
                  value={draft.identity.appearance}
                  onChange={(e) => setId("appearance", e.target.value)}
                  placeholder="Petit pour ton âge, cheveux bruns en bataille, une cicatrice au sourcil, toujours le même sweat gris…"
                  maxLength={400}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {ORIGINS.map((o) => (
                <Card key={o.id} selected={draft.originId === o.id} onClick={() => setDraft((d) => ({ ...d, originId: o.id, skillPicks: {} }))}>
                  <p className="font-serif text-xl">{o.label}</p>
                  <p className="mt-1 text-sm text-brass-soft/90 italic">{o.tagline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{o.description}</p>
                  <p className="mt-3 text-xs text-ivory/80">
                    {Object.entries(o.skills).map(([s, v]) => `${SKILLS[s as SkillId].label} +${v}`).join(" · ")}
                    <span className="text-faint"> · {o.item.name}</span>
                  </p>
                </Card>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-10">
              <div>
                <h2 className="label mb-3">Le drame fondateur</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DRAMAS.map((d) => (
                    <Card key={d.id} selected={draft.dramaId === d.id} onClick={() => set("dramaId", d.id)}>
                      <p className="font-serif text-lg">{d.label}</p>
                      <p className="mt-1 text-sm text-muted">{d.description}</p>
                    </Card>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="label mb-3">Ce qui te fait tenir</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {MOTIVATIONS.map((m) => (
                    <Card key={m.id} selected={draft.motivationId === m.id} onClick={() => set("motivationId", m.id)}>
                      <p className="font-serif text-lg">{m.label}</p>
                      <p className="mt-1 text-sm text-muted">{m.description}</p>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-10">
              <div>
                <h2 className="label mb-3">
                  Qualités — {draft.qualities.length}/{QUALITY_COUNT}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {QUALITIES.map((q) => {
                    const selected = draft.qualities.includes(q.id);
                    const full = draft.qualities.length >= QUALITY_COUNT;
                    return (
                      <Card
                        key={q.id}
                        selected={selected}
                        disabled={!selected && full}
                        onClick={() =>
                          set("qualities", selected ? draft.qualities.filter((x) => x !== q.id) : [...draft.qualities, q.id])
                        }
                      >
                        <p className="font-serif text-lg">{q.label}</p>
                        <p className="mt-1 text-sm text-muted">{q.description}</p>
                        <TraitEffects trait={q} />
                      </Card>
                    );
                  })}
                </div>
              </div>
              <div>
                <h2 className="label mb-3">Un défaut — parce que personne n'est parfait</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {FLAWS.map((f) => (
                    <Card key={f.id} selected={draft.flaw === f.id} onClick={() => set("flaw", f.id)} tone="flaw">
                      <p className="font-serif text-lg">{f.label}</p>
                      <p className="mt-1 text-sm text-muted">{f.description}</p>
                      <TraitEffects trait={f} />
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && <Aptitudes draft={draft} setDraft={setDraft} attrSpent={attrSpent} skillSpent={skillSpent} />}

          {step === 6 && (
            <div className="space-y-6">
              <Field
                label="Souhaits pour ton histoire (facultatif)"
                hint="Un détail, un secret, une personne, un objet, un rêve… Le recruteur en tiendra compte en rédigeant ton dossier."
              >
                <textarea
                  className="field min-h-36 resize-y"
                  value={draft.playerNotes}
                  onChange={(e) => set("playerNotes", e.target.value)}
                  placeholder="Mon personnage a une petite sœur placée dans une autre famille, qu'il n'a pas vue depuis trois ans. Il dessine tout le temps. Il déteste l'eau…"
                  maxLength={1200}
                />
              </Field>
              <div className="rounded-sm border border-line bg-panel/60 p-5 text-sm leading-relaxed text-muted">
                <p>
                  Un Correspondant de ton pays vient de signaler ton nom à {AGENCIES[draft.identity.agency].name}. Un recruteur va reconstituer ta
                  vie, de ta naissance jusqu'au jour où l'Invitation te parvient. Ton personnage, lui, ignore tout. Lis le dossier attentivement :
                  tout ce qui y figure pourra ressurgir.
                </p>
              </div>
              {!allValid && <p className="text-sm text-fail">Certaines étapes sont incomplètes.</p>}
              {saveError && <p className="text-sm text-fail">{saveError}</p>}
            </div>
          )}

          <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              ← Retour
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" disabled={!stepValid[step]} onClick={() => setStep((s) => s + 1)}>
                Continuer →
              </button>
            ) : (
              <button className="btn btn-primary px-8" disabled={!allValid} onClick={finish}>
                Transmettre le dossier
              </button>
            )}
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Preview draft={draft} />
          </div>
        </aside>
      </div>
    </main>
  );
}

const STEP_TITLES = [
  "Qui te propose ?",
  "Qui es-tu ?",
  "D'où viens-tu ?",
  "Ce qui t'a brisé. Ce qui te tient debout.",
  "Ce qui te rend unique",
  "Ce que tu sais faire",
  "Le dernier mot",
];

function AgencyStep({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const chosen = AGENCIES[draft.identity.agency];
  const choose = (agency: AgencyId) =>
    setDraft((d) =>
      d.identity.agency === agency ? d : { ...d, identity: { ...d.identity, agency, nationality: "", birthplace: "", languages: "" } },
    );
  const setCountry = (country: string) =>
    setDraft((d) => {
      const member = AGENCIES[d.identity.agency].members.find((m) => m.country === country);
      return { ...d, identity: { ...d.identity, nationality: country, languages: member?.languages ?? d.identity.languages, birthplace: "" } };
    });
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Depuis le Concordat de Lucerne (1961), trois agences secrètes se partagent le monde. Dans chaque pays membre, des Correspondants
        repèrent les adolescents hors normes et les signalent à l'agence de leur région, qui les invite sous un paravent. Ton personnage, lui,
        n'en saura rien avant la fin de la Sélection. Choisis son agence : elle décidera de son Académie, du style de ses missions et de son
        nom de code.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {AGENCY_IDS.map((id) => {
          const a = AGENCIES[id];
          const selected = draft.identity.agency === id;
          return (
            <button
              key={id}
              onClick={() => choose(id)}
              className="relative w-full rounded-sm border p-4 text-left transition-all"
              style={{
                borderColor: selected ? a.color : "var(--color-line)",
                background: selected ? tint(a.color, 9) : "color-mix(in srgb, var(--color-panel) 50%, transparent)",
              }}
            >
              {selected && (
                <span className="absolute top-3 right-3 text-xs" style={{ color: a.color }}>
                  ◆
                </span>
              )}
              <p className="font-serif text-3xl tracking-[0.12em]" style={{ color: a.color }}>
                {a.name}
              </p>
              <p className="text-xs tracking-[0.15em] text-muted uppercase">{a.region}</p>
              <p className="mt-2 text-sm text-ivory/85 italic">« {a.motto} »</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a.identity}</p>
              <p className="mt-2 text-xs text-faint">{a.style}</p>
              <p className="mt-2 text-xs">
                <span className="text-ivory/70">Noms de code : </span>
                <span className="text-muted">{a.codenames.examples.slice(0, 4).join(", ")}…</span>
              </p>
            </button>
          );
        })}
      </div>
      <div className="grid gap-6 rounded-sm border p-5 md:grid-cols-[1fr_1fr]" style={{ borderColor: tint(chosen.color, 35) }}>
        <div className="space-y-2 text-sm leading-relaxed text-muted">
          <p>
            <span className="text-ivory/80">Académie. </span>
            {chosen.academy}
          </p>
          <p>
            <span className="text-ivory/80">Direction. </span>
            {chosen.director.name}, « {chosen.director.codename} ». {chosen.director.description}
          </p>
          <p>
            <span className="text-ivory/80">Le Cercle. </span>
            {chosen.circle.name.replace(/^./, (x) => x.toUpperCase())} : {chosen.seats.length} {chosen.circle.seatTerm.plural}, l'élite de terrain.
          </p>
          <p>
            <span className="text-ivory/80">Les Branches. </span>
            {chosen.branches.map((b) => b.name).join(", ")}.
          </p>
        </div>
        <Field label="Pays qui te propose" hint="Ta nationalité : elle fixe tes langues de départ et l'endroit où tout a commencé.">
          <select className="field" value={draft.identity.nationality} onChange={(e) => setCountry(e.target.value)}>
            <option value="" disabled>
              Choisir un pays membre…
            </option>
            {chosen.members.map((m) => (
              <option key={m.country} value={m.country}>
                {m.country}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label mb-2 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>}
    </div>
  );
}

function Card({
  selected,
  disabled,
  onClick,
  tone = "default",
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "flaw";
  children: React.ReactNode;
}) {
  const accent = tone === "flaw" ? "border-bordeaux bg-bordeaux/10" : "border-brass bg-brass/[0.07]";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full rounded-sm border p-4 text-left transition-all ${
        selected ? accent : "border-line bg-panel/50 hover:border-line-strong"
      } ${disabled ? "opacity-35" : ""}`}
    >
      {selected && <span className={`absolute top-3 right-3 text-xs ${tone === "flaw" ? "text-fail" : "text-brass"}`}>◆</span>}
      {children}
    </button>
  );
}

function TraitEffects({ trait }: { trait: Trait }) {
  const parts: React.ReactNode[] = [];
  for (const [sk, v] of Object.entries(trait.skills ?? {})) {
    const id = sk as SkillId;
    parts.push(
      <span key={sk} className="inline-flex items-center gap-1" style={{ color: ATTRIBUTES[SKILLS[id].attribute].color }}>
        <SkillGlyph skill={id} className="h-3 w-3" />
        {SKILLS[id].label} {v! > 0 ? "+" : "−"}
        {Math.abs(v!)}
      </span>,
    );
  }
  if (trait.healthMax) parts.push(<span key="h">Santé max +{trait.healthMax}</span>);
  if (trait.moraleMax) parts.push(<span key="m">Moral max {trait.moraleMax}</span>);
  if (trait.reputation) parts.push(<span key="r">Réputation {trait.reputation}</span>);
  if (!parts.length) parts.push(<span key="n">Effet narratif</span>);
  return <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-brass/80">{parts}</p>;
}

function Aptitudes({
  draft,
  setDraft,
  attrSpent,
  skillSpent,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  attrSpent: number;
  skillSpent: number;
}) {
  const attrLeft = ATTR_CREATION_POINTS - attrSpent;
  const skillLeft = SKILL_CREATION_POINTS - skillSpent;
  const baseRanks = useMemo(() => startingRanks(draft.originId, draft.signature, {}), [draft.originId, draft.signature]);

  const cap = (d: Draft, s: SkillId) => skillCap(d.attributes[SKILLS[s].attribute], s === d.signature);

  /** Retire les points de compétence qui dépasseraient leur plafond. */
  const trimPicks = (d: Draft): Draft => {
    const base = startingRanks(d.originId, d.signature, {});
    const picks = { ...d.skillPicks };
    for (const [sk, v] of Object.entries(picks)) {
      const id = sk as SkillId;
      const allowed = Math.max(0, cap(d, id) - base[id]);
      if ((v ?? 0) > allowed) picks[id] = allowed;
    }
    return { ...d, skillPicks: picks };
  };

  const changeAttr = (a: AttributeId, delta: number) =>
    setDraft((d) => {
      const v = d.attributes[a] + delta;
      if (v < ATTR_MIN || v > ATTR_CREATION_MAX || (delta > 0 && attrLeft <= 0)) return d;
      return trimPicks({ ...d, attributes: { ...d.attributes, [a]: v } });
    });

  const changeSkill = (s: SkillId, delta: number) =>
    setDraft((d) => {
      const current = d.skillPicks[s] ?? 0;
      const next = current + delta;
      if (next < 0 || baseRanks[s] + next > cap(d, s) || (delta > 0 && skillLeft <= 0)) return d;
      return { ...d, skillPicks: { ...d.skillPicks, [s]: next } };
    });

  const toggleSignature = (s: SkillId) => setDraft((d) => trimPicks({ ...d, signature: d.signature === s ? null : s }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-sm border border-line bg-panel/60 px-4 py-3 text-sm">
        <span>
          Pôles : <span className={`font-mono ${attrLeft === 0 ? "text-success" : "text-brass"}`}>{attrLeft}</span> point
          {attrLeft > 1 ? "s" : ""}
        </span>
        <span>
          Compétences : <span className={`font-mono ${skillLeft === 0 ? "text-success" : "text-brass"}`}>{skillLeft}</span> point
          {skillLeft > 1 ? "s" : ""}
        </span>
        <span>
          Signature : <span className={draft.signature ? "text-success" : "text-brass"}>{draft.signature ? SKILLS[draft.signature].label : "à choisir ★"}</span>
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ATTRIBUTE_IDS.map((a) => {
          const def = ATTRIBUTES[a];
          const value = draft.attributes[a];
          return (
            <div key={a} className="overflow-hidden rounded-sm border" style={{ borderColor: tint(def.color, 33), background: tint(def.color, 4) }}>
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: tint(def.color, 11) }}>
                <PoleEmblem pole={a} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-[0.25em] uppercase" style={{ color: def.color }}>
                    {def.label}
                  </p>
                  <p className="text-xs text-muted italic">{def.tagline}</p>
                </div>
                <MiniBtn disabled={value <= ATTR_MIN} onClick={() => changeAttr(a, -1)}>−</MiniBtn>
                <span className="w-7 text-center font-serif text-4xl leading-none lining-nums" style={{ color: def.color }}>
                  {value}
                </span>
                <MiniBtn disabled={value >= ATTR_CREATION_MAX || attrLeft <= 0} onClick={() => changeAttr(a, +1)}>+</MiniBtn>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {skillsOf(a).map((s) => {
                  const pick = draft.skillPicks[s] ?? 0;
                  const ranks = Math.min(baseRanks[s] + pick, cap(draft, s));
                  const total = value + ranks;
                  const isSig = draft.signature === s;
                  return (
                    <li key={s} className="flex items-center gap-3 px-4 py-2" title={SKILLS[s].description}>
                      <SkillGlyph skill={s} className="h-5 w-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{SKILLS[s].label}</p>
                        <div className="mt-1 flex gap-1">
                          {Array.from({ length: cap(draft, s) }, (_, i) => (
                            <span key={i} className="h-[3px] w-3 rounded-full" style={{ background: i < ranks ? def.color : "var(--hairline)" }} />
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleSignature(s)}
                        title="Compétence signature : +1 rang et +1 au plafond"
                        className={`text-base transition-colors ${isSig ? "text-brass" : "text-faint/40 hover:text-brass/70"}`}
                      >
                        ★
                      </button>
                      <div className="flex gap-1">
                        <MiniBtn disabled={pick <= 0} onClick={() => changeSkill(s, -1)}>−</MiniBtn>
                        <MiniBtn disabled={baseRanks[s] + pick >= cap(draft, s) || skillLeft <= 0} onClick={() => changeSkill(s, +1)}>+</MiniBtn>
                      </div>
                      <span className="w-6 text-right font-mono text-lg font-semibold" style={{ color: def.color }}>
                        {total}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="space-y-1 text-xs text-faint">
        <p>
          Un pôle va de {ATTR_MIN} à {ATTR_CREATION_MAX} à la création (6 au maximum en jeu). Valeur d'une compétence = pôle + rangs appris + traits.
        </p>
        <p>
          On ne peut pas apprendre plus de rangs que la valeur du pôle : un Corps à 2 plafonne Combat à 2 rangs. La compétence signature ★
          gagne un rang et un cran de plafond.
        </p>
        <p>Jets : 2d6 + compétence contre un seuil (facile 8, moyenne 10, ardue 12…). Les compétences fortes te parleront souvent.</p>
      </div>
    </div>
  );
}

function Stepper({
  value,
  onMinus,
  onPlus,
  canMinus,
  canPlus,
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  canMinus: boolean;
  canPlus: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <MiniBtn disabled={!canMinus} onClick={onMinus}>−</MiniBtn>
      <span className="w-6 text-center font-serif text-3xl">{value}</span>
      <MiniBtn disabled={!canPlus} onClick={onPlus}>+</MiniBtn>
    </div>
  );
}

function MiniBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-sm border border-line-strong text-sm text-ivory transition-colors hover:border-brass hover:text-brass disabled:opacity-25 disabled:hover:border-line-strong disabled:hover:text-ivory"
    >
      {children}
    </button>
  );
}

function Preview({ draft }: { draft: Draft }) {
  const origin = findOrigin(draft.originId);
  const drama = findDrama(draft.dramaId);
  const motivation = findMotivation(draft.motivationId);
  const name = `${draft.identity.firstName} ${draft.identity.lastName}`.trim();
  return (
    <div className="paper relative overflow-hidden rounded-sm p-6 font-typewriter text-[13px] leading-relaxed">
      <div className="stamp absolute top-6 right-[-6px] px-3 py-1 text-[11px]">Confidentiel</div>
      <p className="text-[10px] tracking-[0.25em] uppercase opacity-70">
        {AGENCIES[draft.identity.agency].name} · Fiche de prospect
      </p>
      <p className="mt-4 text-xl">{name || "_______ _______"}</p>
      <p className="opacity-75">
        {draft.identity.age} ans · {GENDERS.find((g) => g.id === draft.identity.gender)?.label}
        {draft.identity.birthplace && ` · ${draft.identity.birthplace}`}
      </p>
      {draft.identity.nationality && <p className="opacity-75">Signalé par : {draft.identity.nationality}</p>}
      <dl className="mt-5 space-y-2">
        <Row label="Origine" value={origin?.label} />
        <Row label="Drame" value={drama?.label} />
        <Row label="Moteur" value={motivation?.label} />
        <Row label="Qualités" value={draft.qualities.map((q) => findQuality(q)?.label).join(", ")} />
        <Row label="Défaut" value={findFlaw(draft.flaw)?.label} />
        <Row label="Signature" value={draft.signature ? SKILLS[draft.signature].label : undefined} />
      </dl>
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-paper-ink/25 pt-4">
        {ATTRIBUTE_IDS.map((a) => (
          <div key={a} className="flex justify-between">
            <span className="opacity-70">{ATTRIBUTES[a].short}</span>
            <span>{draft.attributes[a]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 opacity-60">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
