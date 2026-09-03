/**
 * Embedding provider interface.
 * Mock: deterministic bag-of-char n-gram hash vectors (no network).
 * OpenAI / Gemini: real embedding APIs when keys are set.
 */

const MOCK_DIM = 256;

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Simple Korean/English friendly tokenizer */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function charNgrams(token: string, n = 2): string[] {
  if (token.length < n) return [token];
  const grams: string[] = [];
  for (let i = 0; i <= token.length - n; i++) {
    grams.push(token.slice(i, i + n));
  }
  return grams;
}

export function mockEmbed(text: string): number[] {
  const vec = new Array(MOCK_DIM).fill(0);
  const tokens = tokenize(text);
  const features: string[] = [...tokens];
  for (const t of tokens) {
    features.push(...charNgrams(t, 2));
    features.push(...charNgrams(t, 3));
  }
  for (const f of features) {
    const h = hashToken(f);
    const idx = h % MOCK_DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

async function openaiEmbed(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

async function geminiEmbed(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embeddings failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    embedding?: { values?: number[] };
  };
  const values = data.embedding?.values;
  if (!values) throw new Error('Gemini embedding missing values');
  return values;
}

export type EmbedProvider = 'mock' | 'openai' | 'gemini';

export function getEmbedProvider(): EmbedProvider {
  const p = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (p === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export async function embedText(text: string): Promise<number[]> {
  const provider = getEmbedProvider();
  if (provider === 'openai') return openaiEmbed(text);
  if (provider === 'gemini') return geminiEmbed(text);
  return mockEmbed(text);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embedText(t));
  }
  return out;
}
