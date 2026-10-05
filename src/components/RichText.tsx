import { Fragment } from "react";
import { ATTRIBUTES, SKILLS, resolveVoice } from "@/lib/game/rules";
import { splitVoices } from "@/lib/text/voices";
import { SkillGlyph } from "./glyphs";

/**
 * Rendu minimal du texte : paragraphes, titres « # », listes, **gras**,
 * *italique*, blocs censurés ████ et voix intérieures `{{competence}} texte`.
 */
export function RichText({ text, variant = "narrative" }: { text: string; variant?: "narrative" | "dossier" | "codex" }) {
  const pieces = variant === "narrative" ? splitVoices(text) : text.split(/\n+/).map((b) => b.trim()).filter(Boolean).map((t) => ({ kind: "text" as const, text: t }));
  return (
    <>
      {pieces.map((piece, i) => {
        if (piece.kind === "voice") return <VoiceBlock key={i} name={piece.name} text={piece.text} />;
        const block = piece.text;
        if (block.startsWith("#")) {
          const level = block.match(/^#+/)![0].length;
          const content = block.replace(/^#+\s*/, "");
          if (variant === "dossier")
            return (
              <h3 key={i} className="mt-7 mb-3 border-b border-paper-ink/30 pb-1 font-typewriter text-sm tracking-[0.18em] uppercase">
                <Inline text={content} />
              </h3>
            );
          if (variant === "codex")
            return level <= 1 ? (
              <h1 key={i} className="mb-6 font-serif text-5xl tracking-[0.1em]">
                <Inline text={content} />
              </h1>
            ) : (
              <h2 key={i} className="mt-12 mb-4 border-b border-brass/30 pb-2 font-serif text-3xl text-brass-soft">
                <Inline text={content} />
              </h2>
            );
          return (
            <h3 key={i} className="mt-6 mb-2 font-serif text-xl text-brass-soft">
              <Inline text={content} />
            </h3>
          );
        }
        if (/^-{3,}$/.test(block)) return <hr key={i} className="my-4 border-current opacity-20" />;
        const bullet = block.match(/^(?:[-•]|(\d+)\.)\s+(.*)$/);
        if (bullet)
          return (
            <p key={i} className="flex gap-3 pl-1">
              <span className="shrink-0 text-brass/80">{bullet[1] ? `${bullet[1]}.` : "◆"}</span>
              <span>
                <Inline text={bullet[2]} />
              </span>
            </p>
          );
        return (
          <p key={i}>
            <Inline text={block} />
          </p>
        );
      })}
    </>
  );
}

function VoiceBlock({ name, text }: { name: string; text: string }) {
  const who = resolveVoice(name);
  const color =
    who.kind === "skill"
      ? ATTRIBUTES[SKILLS[who.skill].attribute].color
      : who.kind === "trait"
        ? who.flaw
          ? "#c4475a"
          : "var(--color-success)"
        : "var(--color-muted)";
  const label = who.kind === "skill" ? SKILLS[who.skill].label : who.label;
  return (
    <div className="animate-rise my-4 flex gap-3 border-l-2 py-1 pl-3 font-sans text-[0.95rem] leading-relaxed" style={{ borderColor: color }}>
      {who.kind === "skill" ? (
        <SkillGlyph skill={who.skill} className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-sm" style={{ color }} aria-hidden>
          {who.kind === "trait" ? (who.flaw ? "✕" : "◆") : "◌"}
        </span>
      )}
      <p>
        <span className="mr-2 text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color }}>
          {label}
        </span>
        <span className={who.kind === "skill" ? "text-ivory/90" : "text-ivory/90 italic"}>
          <Inline text={text} />
        </span>
      </p>
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|█+|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("█"))
          return (
            <span key={i} className="redacted" title="Censuré">
              {" ".repeat(Math.max(4, part.length))}
            </span>
          );
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="font-mono text-[0.85em] opacity-70">
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
