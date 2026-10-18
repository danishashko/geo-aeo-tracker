import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { siteOrigin } from "@/lib/agent-discovery";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "Open-source, self-hosted dashboard that tracks how ChatGPT, Perplexity, Gemini, Copilot and Google AI Mode mention your brand. Bring your own API keys and keep your data in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "GEO/AEO Tracker",
  description,
  openGraph: {
    title: "GEO/AEO Tracker",
    description,
    type: "website",
    url: "/",
    siteName: "GEO/AEO Tracker",
  },
};

/** Inline script to apply theme before first paint — prevents flash */
const themeScript = `(function(){try{var t=localStorage.getItem('sovereign-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
