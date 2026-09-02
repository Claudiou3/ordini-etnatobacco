import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLogos } from "@/lib/logos";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // Icona dell'app installata ("Logo catalogo da scaricare" caricato
  // dall'amministratore). L'URL include il timestamp del caricamento
  // (?v=...): cosi' dopo un nuovo upload il dispositivo usa l'icona giusta.
  const logos = await getLogos();
  const appleIcon = logos.logo3.present
    ? logos.logo3.src
    : "/logo-files/logo-3.png";

  return {
    title: "IOI Orders",
    description: "Gestione ordini per agenti IOI",
    manifest: "/manifest.webmanifest",
    applicationName: "IOI Orders",
    appleWebApp: {
      capable: true,
      title: "Catalogo",
      statusBarStyle: "default",
    },
    themeColor: "#2563eb",
    icons: {
      icon: "/favicon.ico",
      apple: appleIcon,
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
