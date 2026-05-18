import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = {
  title: "AI Hub",
  description: "Project-based AI context vault and prompt workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-teal-900 bg-[#021a17]/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 grid grid-cols-3 items-center">
            <div><BackButton /></div>
            <div className="flex justify-center">
              <Link href="/" className="font-semibold tracking-tight flex items-center gap-2 text-base">
                🛸 AI Hub
              </Link>
            </div>
            <div className="flex justify-end">
              <span className="text-xs text-zinc-500">v0 · single-user</span>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
