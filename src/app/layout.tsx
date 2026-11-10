import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Billfold", template: "%s · Billfold" },
  description: "Collect your recurring bills, file them neatly and send one clear summary.",
  applicationName: "Billfold",
  openGraph: { type: "website", siteName: "Billfold", title: "Billfold", description: "Every bill, filed and summarised." },
  twitter: { card: "summary_large_image", title: "Billfold", description: "Every bill, filed and summarised." },
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f3ec" }, { media: "(prefers-color-scheme: dark)", color: "#14130f" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
