import type { Metadata, Viewport } from "next";
import ToastProvider from "@/components/ToastProvider";
import AssistantGate from "@/components/AssistantGate";
import { nomContact, nomDeploiement } from "@/lib/notify";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTC37 — Système 30 Secondes",
  description: "Système 30 Secondes par IONNYX",
  manifest: "/manifest.json",
  // Favicon = logo IONNYX (sur fond blanc), comme ATG. Le triangle précédent
  // (app/favicon.ico + app/icon.png) a été retiré pour ne pas l'écraser.
  // `?v=3` = cache-busting : les navigateurs gardent les favicons en cache très
  // longtemps (insensible au Cmd+Shift+R). Changer la version force le re-téléchargement.
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "any" },
      { url: "/favicon-32.png?v=3", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png?v=3", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=3",
  },
  appleWebApp: { title: "Système 30 Secondes", capable: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Nécessaire pour que env(safe-area-inset-*) — donc pt-safe/pb-safe des barres
  // haut/bas — s'applique réellement à l'encoche sur iPhone (parité ATG).
  viewportFit: "cover",
  themeColor: "#1A1A1A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      {/* App-shell (parité ATG) : hauteur viewport figée + UN SEUL conteneur
          scrollable au milieu → évite le double-scroll iOS. Le bg/texte/safe-area
          et la fonte viennent de globals.css (@layer base). */}
      <body className="h-screen-safe flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ToastProvider>{children}</ToastProvider>
        </div>
        {/* Assistant flottant (lecture seule) — masqué sur /login par AssistantGate.
            Personnalisé : il salue l'artisan par son prénom (CONTACT_NOM) et connaît
            son entreprise (DEPLOYMENT_NAME). Défauts : Hendrix / MTC37. */}
        <AssistantGate nom={nomContact()} entreprise={nomDeploiement()} />
      </body>
    </html>
  );
}
