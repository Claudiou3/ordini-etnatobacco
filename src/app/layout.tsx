import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLogos } from "@/lib/logos";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Next.js 16: il colore del tema va nell'export `viewport`, non in `metadata`
// (altrimenti Next emette il warning "Unsupported metadata themeColor").
export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export async function generateMetadata(): Promise<Metadata> {
  // Icona dell'app installata ("Logo catalogo da scaricare" caricato
  // dall'amministratore). L'URL include il timestamp del caricamento
  // (?v=...): cosi' dopo un nuovo upload il dispositivo usa l'icona giusta.
  const logos = await getLogos();
  const appleIcon = logos.logo3.present
    ? logos.logo3.src
    : "/app-icon-512.png";

  return {
    title: "Ordini",
    description: "Gestione ordini per agenti IOI",
    manifest: "/manifest.webmanifest",
    applicationName: "ordini etnatobacco",
    appleWebApp: {
      capable: true,
      title: "ordini etnatobacco",
      statusBarStyle: "default",
    },
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
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
