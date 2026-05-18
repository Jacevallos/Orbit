// Model adapter for Anthropic. The point of this file is the *shape* —
// when we add OpenAI / Perplexity / OpenRouter, each one exports the same
// `runModel` function so callers don't change.

import Anthropic from "@anthropic-ai/sdk";

export interface ModelRunInput {
  model: string;
  prompt: string; // the assembled packet
  maxTokens?: number;
}

export interface ModelRunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Default to Sonnet — cheaper than Opus and fine for most MVP testing.
// Swap to claude-opus-4-7 for harder reasoning tasks.
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

export async function runAnthropic(
  input: ModelRunInput,
): Promise<ModelRunResult> {
  const res = await client().messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 2048,
    messages: [{ role: "user", content: input.prompt }],
  });

  // Concatenate all text blocks in the response.
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}
