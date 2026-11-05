import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "hostedmcp.dev",
  description: "AppVitals for Google Play. ShipVitals for iOS and App Store Connect. MerchantOps for Lemon Squeezy and Paddle.",
  metadataBase: new URL("https://hostedmcp.dev"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <header className="site-header">
            <Link className="wordmark" href="/" aria-label="hostedmcp.dev home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="hostedmcp.dev" width={120} height={60} />
            </Link>
            <nav>
              <Link href="/appvitals">AppVitals</Link>
              <Link href="/shipvitals">ShipVitals</Link>
              <Link href="/merchantops">MerchantOps</Link>
              <Link href="/account">Account</Link>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <span className="footer-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/monogram.svg" alt="" width={40} height={40} />
              made by builtby_James
            </span>
            <span>The MCP is <a href="https://github.com/jemesct/appvitals-mcp">open source (MIT)</a></span>
            <span>
              <Link href="/privacy">Privacy</Link>
              {" · "}
              <Link href="/terms">Terms</Link>
            </span>
            <span className="legal">
              AppVitals is Google Play. ShipVitals is iOS, via App Store Connect. MerchantOps is Lemon Squeezy and Paddle, not the app stores.
              Google Play and Google Play Console are trademarks of Google LLC. AppVitals is not affiliated with Google.
              App Store, App Store Connect, and TestFlight are trademarks of Apple Inc. ShipVitals is not affiliated with Apple.
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
