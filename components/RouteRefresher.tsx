"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Triggers router.refresh() on every mount so server data is always up-to-date
// when navigating back to this page via the browser's back button or client-side nav.
export function RouteRefresher() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
