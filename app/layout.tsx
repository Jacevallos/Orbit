import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { GlobalSearch } from "@/components/GlobalSearch";

export const metadata: Metadata = {
  title: "Orbit",
  description: "Project-based AI context vault and prompt workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col h-screen">
        <header className="border-b border-teal-900 bg-[#021a17]/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 grid grid-cols-3 items-center">
            <div><BackButton /></div>
            <div className="flex justify-center">
              <Link href="/" className="font-semibold tracking-tight flex items-center gap-2.5 text-base">
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Orbital ring */}
                  <ellipse cx="16" cy="16" rx="15" ry="6" stroke="#2ee6a6" strokeWidth="1.5" fill="none" transform="rotate(-30 16 16)" />
                  {/* Planet */}
                  <circle cx="16" cy="16" r="5.5" fill="#2ee6a6" opacity="0.15" stroke="#2ee6a6" strokeWidth="1.5" />
                  <circle cx="16" cy="16" r="2.5" fill="#2ee6a6" />
                  {/* Satellite dot on ring */}
                  <circle cx="27.5" cy="12.8" r="2" fill="#2ee6a6" />
                </svg>
                Orbit
              </Link>
            </div>
            <div className="flex justify-end">
              <GlobalSearch />
            </div>
          </div>
        </header>
        <main className="flex-1 min-h-0">{children}</main>
      </body>
    </html>
  );
}
