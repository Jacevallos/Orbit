// ~4 chars per token is a good approximation for English/code
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
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
