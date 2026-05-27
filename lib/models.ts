export interface ModelOption {
  id: string;
  label: string;
  description: string;
  tier: "fast" | "balanced" | "powerful";
  // Pricing in USD per million tokens
  inputPerMTok: number;
  outputPerMTok: number;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku",
    description: "Fast & cheap — great for Q&A, summaries, simple tasks",
    tier: "fast",
    inputPerMTok: 0.80,
    outputPerMTok: 4.00,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet",
    description: "Balanced — strong reasoning, code, and analysis",
    tier: "balanced",
    inputPerMTok: 3.00,
    outputPerMTok: 15.00,
  },
  {
    id: "claude-opus-4-7",
    label: "Opus",
    description: "Most capable — complex multi-step reasoning and planning",
    tier: "powerful",
    inputPerMTok: 15.00,
    outputPerMTok: 75.00,
  },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";
