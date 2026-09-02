import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
    // Icona usata da iPhone/iPad quando si aggiunge l'app alla Home
    // (immagine caricata dall'amministratore come "Logo catalogo da scaricare").
    apple: "/logo-files/logo-3.png",
  },
};

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
