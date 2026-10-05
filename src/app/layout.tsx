import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono, Special_Elite } from "next/font/google";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--nf-serif",
});
const sans = Inter({ subsets: ["latin"], variable: "--nf-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--nf-mono" });
const typewriter = Special_Elite({ subsets: ["latin"], weight: "400", variable: "--nf-typewriter" });

export const metadata: Metadata = {
  title: "LUCERNE — Trois agences, un seul monde à tenir",
  description: "Jeu de rôle narratif d'espionnage : prospect à 14 ans, agent à 18, au service d'une des trois agences du Concordat de Lucerne.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${typewriter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Certaines extensions de navigateur ajoutent des attributs au body : on ignore cet écart. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
