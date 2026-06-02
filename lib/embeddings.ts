import { VoyageAIClient } from "voyageai";
import { logger } from "@/lib/logger";

let _client: VoyageAIClient | null = null;
function client(): VoyageAIClient {
  if (!_client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");
    _client = new VoyageAIClient({ apiKey });
  }
  return _client;
}

const MODEL = "voyage-code-2";
const MAX_CHARS = 32_000;
const BATCH_SIZE = 128;

// Generate a single query embedding (used at search time)
export async function embedQuery(text: string): Promise<number[]> {
  const result = await client().embed({
    input: [text.slice(0, MAX_CHARS)],
    model: MODEL,
    inputType: "query",
  });
  return result.data?.[0]?.embedding ?? [];
}

// Generate document embeddings in batches (used at index time)
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, MAX_CHARS));
    const result = await client().embed({
      input: batch,
      model: MODEL,
      inputType: "document",
    });
    const batchEmbeddings = (result.data ?? []).map((d) => d.embedding ?? []);
    all.push(...batchEmbeddings);
    logger.info("embeddings.batch", { from: i, to: i + batch.length, total: texts.length });
  }
  return all;
}

// Format a float array as a Postgres vector literal: '[0.1,0.2,...]'
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
