"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      ← Back
    </button>
  );
}
