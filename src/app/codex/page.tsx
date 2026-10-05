import Link from "next/link";
import { tint } from "@/lib/ui/color";
import { PoleEmblem, SkillGlyph } from "@/components/glyphs";
import { RichText } from "@/components/RichText";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Emblem } from "@/components/ui";
import { LORE } from "@/lib/ai/lore";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { ATTRIBUTE_IDS, ATTRIBUTES, DIFFICULTIES, SKILLS, skillsOf } from "@/lib/game/rules";
import { findCity } from "@/lib/world/geo";

export const metadata = { title: "Codex — LUCERNE" };

export default function CodexPage() {
  return (
    <main className="bg-weave min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-brass">
            <Emblem className="h-8 w-8" />
            <span className="font-serif text-lg tracking-[0.2em] text-ivory">LUCERNE</span>
          </Link>
          <span className="label ml-auto">Codex · Concordat de Lucerne</span>
          <ThemeToggle />
        </div>
      </header>

      <article className="prose-narrative mx-auto max-w-3xl px-5 py-14 font-serif text-lg leading-relaxed text-ivory/90">
        <RichText text={LORE} variant="codex" />

        <h2 className="mt-16 mb-4 border-b border-brass/30 pb-2 font-serif text-3xl text-brass-soft">L'organisation</h2>
        <p>
          Les trois agences ont la même charpente, chacune avec ses noms : une Direction (le Directeur et son Second), un Cercle d'élite aux
          sièges nommés, une dizaine de Stations dans de vraies villes, trois Branches de soutien et une Académie. On ne rejoint pas une
          Branche : on s'entend (ou non) avec son chef. La spécialisation vient de la Station d'affectation et du siège.
        </p>
        <p>
          Prospect, Cadet, Officier ; puis deux voies. Le terrain : Titulaire d'un siège, puis Doyen du Cercle. Le commandement : Chef de
          station, puis Contrôleur. Pour diriger l'agence, il faut avoir siégé au Cercle et commandé.
        </p>
      </article>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-12 lg:grid-cols-3">
        {AGENCY_IDS.map((id) => {
          const a = AGENCIES[id];
          return (
            <div key={id} className="rounded-sm border" style={{ borderColor: tint(a.color, 35), background: tint(a.color, 4) }}>
              <div className="px-4 py-3" style={{ background: tint(a.color, 11) }}>
                <p className="font-serif text-2xl tracking-[0.12em]" style={{ color: a.color }}>
                  {a.name} · {a.circle.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{a.circle.description}</p>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {a.seats.map((s) => (
                  <li key={s.id} className="px-4 py-2.5">
                    <p className="font-serif text-lg" style={{ color: a.color }}>
                      {s.number}. {s.name}
                    </p>
                    <p className="text-xs text-ivory/80">{s.heritage}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {s.specialty.map((k) => (
                        <span key={k} className="inline-flex items-center gap-1 text-[11px]" style={{ color: ATTRIBUTES[SKILLS[k].attribute].color }}>
                          <SkillGlyph skill={k} className="h-3 w-3" />
                          {SKILLS[k].label}
                        </span>
                      ))}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <span style={{ color: a.color }}>✦ {s.signature.name}.</span> {s.signature.description}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="border-t px-4 py-3" style={{ borderColor: tint(a.color, 25) }}>
                <p className="label mb-2" style={{ color: a.color }}>
                  Les Branches
                </p>
                <ul className="space-y-2">
                  {a.branches.map((b) => (
                    <li key={b.id}>
                      <p className="font-serif text-base">{b.name}</p>
                      <p className="text-xs text-muted">
                        {b.role} Chef : {b.chief.name}.
                      </p>
                      <p className="text-xs text-ivory/80">
                        <span style={{ color: a.color }}>⚙ {b.support.name}.</span> {b.support.description}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="label mt-3 mb-1" style={{ color: a.color }}>
                  Les Stations
                </p>
                <p className="text-xs text-muted">{a.stations.map((c) => findCity(c)?.name ?? c).join(" · ")}</p>
              </div>
            </div>
          );
        })}
      </section>

      <article className="prose-narrative mx-auto max-w-3xl px-5 pb-6 font-serif text-lg leading-relaxed text-ivory/90">

        <h2 className="mt-16 mb-4 border-b border-brass/30 pb-2 font-serif text-3xl text-brass-soft">Les pôles et les voix</h2>
        <p>
          Quatre pôles, vingt-quatre compétences. Chacune est aussi une voix dans ta tête : plus elle est forte, plus elle parle — et
          plus elle a raison.
        </p>
      </article>

      <section className="mx-auto grid max-w-5xl gap-5 px-5 pb-12 md:grid-cols-2">
        {ATTRIBUTE_IDS.map((a) => {
          const def = ATTRIBUTES[a];
          return (
            <div key={a} className="overflow-hidden rounded-sm border" style={{ borderColor: tint(def.color, 33), background: tint(def.color, 4) }}>
              <div className="flex items-center gap-4 px-5 py-4" style={{ background: tint(def.color, 11) }}>
                <PoleEmblem pole={a} className="h-12 w-12" />
                <div>
                  <p className="text-sm font-bold tracking-[0.3em] uppercase" style={{ color: def.color }}>
                    {def.label}
                  </p>
                  <p className="text-sm text-muted">{def.description}</p>
                </div>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {skillsOf(a).map((s) => (
                  <li key={s} className="flex gap-4 px-5 py-3">
                    <SkillGlyph skill={s} className="mt-0.5 h-7 w-7 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold tracking-[0.15em] uppercase" style={{ color: def.color }}>
                        {SKILLS[s].label}
                      </p>
                      <p className="text-sm text-ivory/85">{SKILLS[s].description}</p>
                      <p className="mt-1 text-xs text-muted italic">Voix — {SKILLS[s].voice}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-24 font-serif text-lg text-ivory/90">
        <h3 className="mb-3 font-serif text-2xl text-brass-soft">Les jets</h3>
        <p className="mb-4">2d6 + valeur de la compétence, contre un seuil. Double six : réussite critique. Double un : échec critique.</p>
        <div className="flex flex-wrap gap-2 font-sans">
          {Object.values(DIFFICULTIES).map((d) => (
            <span key={d.label} className="rounded-sm border border-line bg-panel/70 px-3 py-1.5 text-xs">
              {d.label} <span className="font-mono text-brass">{d.dc}</span>
            </span>
          ))}
        </div>
        <p className="mt-4 text-base text-muted">
          <span className="text-ivory">Jet blanc</span> : peut être retenté si la situation change.{" "}
          <span className="text-[#e0675e]">Jet rouge</span> : une seule chance.
        </p>
      </section>
    </main>
  );
}
