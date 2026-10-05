"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Divider, Emblem, RankBadge } from "@/components/ui";
import { PHASES, RANKS } from "@/lib/game/rules";
import { AGENCIES, AGENCY_IDS } from "@/lib/game/agencies";
import { deleteSave, exportSave, importSave, listSaves, loadRaw, loadSave, type SaveSummary } from "@/lib/client/storage";

export default function Home() {
  const router = useRouter();
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSaves(listSaves()), []);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const state = await importSave(file);
      router.push(`/jeu?id=${state.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    }
  };

  return (
    <main className="bg-weave relative min-h-dvh">
      <ThemeToggle className="absolute top-4 right-4" />
      <section className="pinstripe relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-20 pb-14 text-center sm:pt-28">
        <Emblem className="h-20 w-20 text-brass" />
        <p className="label mt-8 tracking-[0.5em]">Concordat de Lucerne · 1961</p>
        <h1 className="mt-4 font-serif text-6xl font-semibold tracking-[0.12em] sm:text-8xl">LUCERNE</h1>
        <p className="mt-3 font-serif text-2xl text-brass-soft italic">Trois agences. Un seul monde à tenir.</p>
        <div className="mt-10 max-w-2xl space-y-4 font-serif text-lg leading-relaxed text-ivory/80 sm:text-xl">
          <p>
            Au-dessus des nations, trois agences que personne n'a élues veillent sur ce que les gouvernements ne savent plus protéger seuls.
            Officiellement, elles n'existent pas.
          </p>
          <p className="text-muted">Tu as entre 14 et 17 ans. On vient de t'offrir une bourse que tu n'as jamais demandée.</p>
        </div>
        <div className="mt-10 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          {AGENCY_IDS.map((id) => {
            const a = AGENCIES[id];
            return (
              <div key={id} className="rounded-sm border border-line bg-panel/50 p-3" style={{ borderTopColor: a.color, borderTopWidth: 2 }}>
                <p className="font-serif text-xl tracking-[0.12em]" style={{ color: a.color }}>
                  {a.name}
                </p>
                <p className="text-[10px] tracking-[0.18em] text-muted uppercase">{a.region}</p>
                <p className="mt-1 text-xs text-ivory/75 italic">« {a.motto} »</p>
              </div>
            );
          })}
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link href="/creation" className="btn btn-primary px-8 py-4">
            Ouvrir un nouveau dossier
          </Link>
          <Link href="/codex" className="btn btn-ghost px-6 py-4">
            Codex
          </Link>
          <button className="btn btn-ghost px-6 py-4" onClick={() => fileRef.current?.click()}>
            Importer une sauvegarde
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </div>
        {error && <p className="mt-4 text-sm text-fail">{error}</p>}
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-24">
        {saves && saves.length > 0 && (
          <>
            <Divider>
              <span className="label text-brass/80">Agents en activité</span>
            </Divider>
            <ul className="mt-8 space-y-3">
              {saves.map((s) => {
                const legacy = !RANKS[s.rank] || !s.agency;
                const agency = s.agency ? AGENCIES[s.agency] : null;
                return (
                <li
                  key={s.id}
                  className="group flex items-center gap-4 rounded-sm border border-line bg-panel/70 p-4 transition-colors hover:border-brass/50"
                >
                  {legacy ? <span className="w-8 shrink-0 text-center text-faint">✕</span> : <RankBadge rank={s.rank} className="h-10 w-8 shrink-0" />}
                  <Link href={legacy ? "#" : `/jeu?id=${s.id}`} className={`min-w-0 flex-1 ${legacy ? "pointer-events-none opacity-60" : ""}`}>
                    <p className="font-serif text-xl leading-tight">
                      {s.name}
                      {s.codename && <span className="ml-2 font-mono text-xs tracking-[0.25em] text-brass uppercase">« {s.codename} »</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {legacy ? (
                        "Ancien format (avant le Concordat) : plus jouable, exporte-la pour la garder."
                      ) : (
                        <>
                          <span style={{ color: agency!.color }}>{agency!.name}</span> · {RANKS[s.rank].label} · {PHASES[s.phase]?.label} · {s.chapter}
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-faint">
                      {new Date(s.updatedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </Link>
                  <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      className="px-2 py-1 text-xs text-muted hover:text-ivory"
                      onClick={() => {
                        const st = loadSave(s.id) ?? loadRaw(s.id);
                        if (st) exportSave(st);
                      }}
                      title="Exporter"
                    >
                      Exporter
                    </button>
                    <button
                      className="px-2 py-1 text-xs text-muted hover:text-fail"
                      onClick={() => {
                        if (confirm(`Détruire définitivement le dossier de ${s.name} ?`)) {
                          deleteSave(s.id);
                          setSaves(listSaves());
                        }
                      }}
                      title="Supprimer"
                    >
                      Détruire
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-20 grid gap-8 text-left sm:grid-cols-3">
          {[
            ["I. Le dossier", "Choisis ton agence et ton pays, crée ton personnage. Quelqu'un t'observe depuis des mois et a reconstitué ta vie."],
            ["II. La Sélection", "Cent jours dans un programme qui n'est pas ce qu'il prétend. À peine un sur dix est retenu, et apprend enfin la vérité."],
            ["III. Le Brevet", "Un matricule, une Station, et les missions à travers le monde. Puis, un jour, un siège au Cercle et son nom de code."],
          ].map(([title, text]) => (
            <div key={title}>
              <h2 className="font-serif text-xl text-brass-soft">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
