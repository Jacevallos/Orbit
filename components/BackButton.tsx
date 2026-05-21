"use client";

import { useRouter, usePathname } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <button
      onClick={() => {
        // router.back() always serves the router cache, so the projects list stays
        // stale. Push to the parent instead — push navigation always re-fetches.
        // /projects/[id] → "/" (the project list lives at root, not /projects)
        if (pathname.startsWith("/projects/")) {
          router.push("/");
        } else {
          const segments = pathname.split("/").filter(Boolean);
          const parent = segments.slice(0, -1).join("/");
          router.push(parent ? `/${parent}` : "/");
        }
      }}
      title="Go back"
      className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors group"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" className="opacity-20 group-hover:opacity-30 transition-opacity" />
        <polyline points="12 8 8 12 12 16" />
        <line x1="16" y1="12" x2="8" y2="12" />
      </svg>
    </button>
  );
}
