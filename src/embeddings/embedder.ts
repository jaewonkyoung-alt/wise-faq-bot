/**
 * Embedding provider interface.
 * Mock: deterministic bag-of-char n-gram hash vectors (no network).
 * OpenAI / Gemini: real embedding APIs when keys are set.
 *
 * Ollama: 로컬 임베딩 모델 (기본 qwen3-embedding:0.6b, 1024차원) — 키 없이 이 Mac에서 돈다.
 *
 * When LLM_PROVIDER=openrouter, embeddings default to mock (chat-only models
 * like openai/gpt-oss-120b). Override with EMBED_PROVIDER=mock|openai|gemini|ollama.
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
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  const res = await fetch(`${base}/embeddings`, {
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

const OLLAMA_URL = () => (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = () => process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
// 카톡 스킬은 5초 안에 답해야 한다. 질문 임베딩이 이보다 늦으면 키워드 검색만으로 답한다.
const QUERY_TIMEOUT_MS = () => Number(process.env.EMBED_QUERY_TIMEOUT_MS) || 3000;

async function ollamaEmbed(texts: string[], timeoutMs?: number): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL()}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 모델(639MB)을 메모리에서 내리지 않는다 (-1). 내려가면 첫 질문이 다시 불러오느라 2초 가까이 걸려
    // 카톡 제한 안에 못 들어오고 키워드 검색으로 넘어간다 (10/15 확인).
    body: JSON.stringify({ model: OLLAMA_MODEL(), input: texts, keep_alive: -1 }),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length !== texts.length) throw new Error('Ollama embedding missing values');
  return data.embeddings;
}

/** qwen3-embedding 은 질문 쪽에만 지시문을 붙이도록 학습됐다 (문서 쪽은 그대로). */
function queryText(text: string): string {
  if (getEmbedProvider() === 'ollama' && /qwen3-embedding/i.test(OLLAMA_MODEL())) {
    return `Instruct: Given a student's question, retrieve the university club that matches it\nQuery: ${text}`;
  }
  return text;
}

export type EmbedProvider = 'mock' | 'openai' | 'gemini' | 'ollama';

export function getEmbedProvider(): EmbedProvider {
  // Explicit override: chat (e.g. openrouter) can stay separate from embeddings.
  const override = (process.env.EMBED_PROVIDER || '').toLowerCase();
  if (override === 'mock') return 'mock';
  if (override === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (override === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (override === 'ollama') return 'ollama';

  const p = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  // OpenRouter default chat model (gpt-oss-120b) is chat-only — keep mock embeddings.
  if (p === 'openrouter') return 'mock';
  if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (p === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

/** 저장된 벡터가 어느 모델로 만든 것인지 — 바뀌면 다시 임베딩해야 한다. */
export function embedModelId(): string {
  const p = getEmbedProvider();
  if (p === 'ollama') return `ollama:${OLLAMA_MODEL()}`;
  if (p === 'openai') return `openai:${process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'}`;
  if (p === 'gemini') return `gemini:${process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'}`;
  return `mock:${MOCK_DIM}`;
}

/** 검색 질문 임베딩 — 시간 제한이 있다. 실패하면 null (호출 쪽이 키워드 검색으로 대신한다). */
export async function embedQuery(text: string): Promise<number[] | null> {
  try {
    if (getEmbedProvider() === 'ollama') return (await ollamaEmbed([queryText(text)], QUERY_TIMEOUT_MS()))[0];
    return await embedText(text);
  } catch (e) {
    console.warn(`[embed] query embedding failed (${embedModelId()}): ${(e as Error).message}`);
    return null;
  }
}

/** 문서(동아리 소개) 임베딩 */
export async function embedText(text: string): Promise<number[]> {
  const provider = getEmbedProvider();
  if (provider === 'ollama') return (await ollamaEmbed([text]))[0];
  if (provider === 'openai') return openaiEmbed(text);
  if (provider === 'gemini') return geminiEmbed(text);
  return mockEmbed(text);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (getEmbedProvider() === 'ollama') return texts.length ? ollamaEmbed(texts) : [];
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embedText(t));
  }
  return out;
}
