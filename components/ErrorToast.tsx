"use client";

import { useState, useEffect, useRef } from "react";
import { parseApiError } from "@/lib/parse-error";

interface Props {
  error: string;
  onDismiss: () => void;
  durationMs?: number;
}

export function ErrorToast({ error, onDismiss, durationMs = 10_000 }: Props) {
  const total = Math.ceil(durationMs / 1000);
  const [secondsLeft, setSecondsLeft] = useState(total);
  const [visible, setVisible] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const parsed = parseApiError(error);

  // Fade in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          dismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => onDismissRef.current(), 300);
  }

  const progress = (secondsLeft / total) * 100;

  return (
    <div
      className="rounded-xl border border-red-500/40 bg-red-950/70 backdrop-blur-sm overflow-hidden transition-all duration-300"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(-6px)" }}
    >
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {/* Warning icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-300 leading-tight">{parsed.title}</p>
              <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">{parsed.detail}</p>
              {parsed.retryable && (
                <p className="text-[11px] text-zinc-500 mt-1">Wait ~60s then try again.</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-[10px] text-zinc-600 tabular-nums">{secondsLeft}s</span>
            <button
              onClick={dismiss}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* Countdown bar */}
      <div className="h-0.5 bg-red-900/60">
        <div
          className="h-full bg-red-400/70 transition-all ease-linear"
          style={{ width: `${progress}%`, transitionDuration: "1s" }}
        />
      </div>
    </div>
  );
}
