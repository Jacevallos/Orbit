import Anthropic from "@anthropic-ai/sdk";

export type FileAttachment = {
  name: string;
  mediaType: string; // e.g. "image/jpeg", "application/pdf", "text/plain"
  data: string;      // base64 for images/PDFs, raw text for text files
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: FileAttachment[];
};

// Context-vault files (images/PDFs stored as data URLs) injected into the first user message
export type ContextFileBlock = {
  name: string;
  mediaType: string;
  data: string; // base64 without the "data:...;base64," prefix
};

export interface ModelRunInput {
  model: string;
  messages: ChatMessage[];
  contextFileBlocks?: ContextFileBlock[]; // injected into first user message
  system?: string;
  maxTokens?: number;
}

export interface ModelRunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// Anthropic only accepts these four image types
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function normalizeMediaType(mt: string): string {
  // Windows commonly uses image/jpg — normalize to the IANA-correct image/jpeg
  return mt === "image/jpg" ? "image/jpeg" : mt;
}

function isSupportedImage(mt: string): boolean {
  return SUPPORTED_IMAGE_TYPES.has(normalizeMediaType(mt));
}

function buildContent(
  text: string,
  attachments?: FileAttachment[],
  contextFiles?: ContextFileBlock[]
): string | any[] {
  const att = attachments ?? [];
  const ctx = contextFiles ?? [];
  if (!att.length && !ctx.length) return text;

  const blocks: any[] = [];
  if (text) blocks.push({ type: "text", text });

  for (const a of att) {
    if (a.mediaType.startsWith("image/")) {
      if (!isSupportedImage(a.mediaType)) continue; // skip unsupported types silently
      blocks.push({ type: "image", source: { type: "base64", media_type: normalizeMediaType(a.mediaType), data: a.data } });
    } else if (a.mediaType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } });
    } else {
      blocks.push({ type: "text", text: `\n\n**File: ${a.name}**\n\`\`\`\n${a.data}\n\`\`\`` });
    }
  }

  for (const c of ctx) {
    if (c.mediaType.startsWith("image/")) {
      if (!isSupportedImage(c.mediaType)) continue; // skip unsupported types silently
      blocks.push({ type: "image", source: { type: "base64", media_type: normalizeMediaType(c.mediaType), data: c.data } });
    } else if (c.mediaType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: c.data } });
    }
  }

  return blocks;
}

export function toAnthropicMessages(
  messages: ChatMessage[],
  contextFileBlocks?: ContextFileBlock[]
): any[] {
  return messages.map((msg, idx) => ({
    role: msg.role,
    content: buildContent(
      msg.content,
      msg.attachments,
      idx === 0 ? contextFileBlocks : undefined
    ),
  }));
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

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

export async function runAnthropic(input: ModelRunInput): Promise<ModelRunResult> {
  const anthropicMessages = toAnthropicMessages(input.messages, input.contextFileBlocks);

  const res = await client().messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 8192,
    // Wrap the system prompt in a cacheable block so Anthropic reuses it across
    // requests in the same conversation instead of re-processing it every time.
    // Cache hits cost ~10% of normal input token price (90% discount).
    ...(input.system ? {
      system: [{
        type: "text" as const,
        text: input.system,
        cache_control: { type: "ephemeral" as const, ttl: "1h" } as any,
      }] as any,
    } : {}),
    messages: anthropicMessages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const usage = res.usage as any;
  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}
