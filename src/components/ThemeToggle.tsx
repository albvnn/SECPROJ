"use client";

import { useEffect, useState } from "react";

const KEY = "seraphin:theme";

/** Bascule entre le thème sombre (par défaut) et le thème clair ; le choix est gardé dans le navigateur. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* stockage indisponible : le choix vaut pour cette page */
    }
  };

  return (
    <button
      onClick={toggle}
      title={theme === "light" ? "Passer au thème sombre" : "Passer au thème clair"}
      aria-label={theme === "light" ? "Passer au thème sombre" : "Passer au thème clair"}
      className={`grid h-8 w-8 place-items-center rounded-sm border border-line text-sm text-muted transition-colors hover:border-brass hover:text-ivory ${className}`}
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}

/** Script exécuté avant l'affichage, pour éviter un flash du mauvais thème. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
