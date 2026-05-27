// ~4 chars per token is a good approximation for English/code
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// Estimate the total cost in USD for a single message send.
// inputTokens = full context (history + system + current message), outputTokens = expected response.
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPerMTok: number,
  outputPerMTok: number,
): number {
  return (inputTokens * inputPerMTok + outputTokens * outputPerMTok) / 1_000_000;
}

export function formatCost(cost: number): string {
  if (cost < 0.0005) return "<$0.01";
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function estimateMessageTokens(
  text: string,
  attachments: Array<{ mediaType: string; data: string }>
): number {
  const textTokens = estimateTokens(text);
  const attachmentTokens = attachments.reduce((sum, att) => {
    if (att.mediaType.startsWith("image/")) return sum + 1500; // Claude image tile estimate
    return sum + Math.ceil(att.data.length / 4); // text / PDF via content length
  }, 0);
  return textTokens + attachmentTokens;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function tokenColorClass(n: number): string {
  if (n >= 50_000) return "text-red-400";
  if (n >= 10_000) return "text-amber-400";
  return "text-zinc-500";
}
