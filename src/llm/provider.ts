import type { AskRoute, SemanticSearchArgs, StructuredQueryArgs } from '../types/ask';

export interface ToolCallDecision {
  route: AskRoute;
  structured?: StructuredQueryArgs;
  semantic?: SemanticSearchArgs;
  refuse_reason?: string;
}

export interface LlmProvider {
  name: string;
  /** Route a user question to one of the tools. */
  decideRoute(question: string): Promise<ToolCallDecision>;
  /** Compose a final Korean answer from tool results (optional polish). */
  composeAnswer(input: {
    question: string;
    route: AskRoute;
    facts: string;
    citationsNote: string;
  }): Promise<string>;
}

const STRUCTURED_HINTS =
  /연락처|컨택|문의|회장|이메일|전화|모임\s*시간|정기\s*모임|언제\s*모여|장소|어디|위치|호실|분류|카테고리|분과|동아리\s*목록|리스트|어떤\s*동아리|동아리\s*있어|몇\s*개/;

const SEMANTIC_HINTS =
  /소개|활동|무엇을|뭐\s*하|어떤\s*일|목적|분위기|모집|가입|체험|공연|연습|프로젝트|하는\s*일|하는가|해\?/;

const REFUSE_HINTS =
  /수강신청|학사일정|졸업|성적|도서관|기숙사|장학|등록금|학식|증명서|날씨|주식|연예|정치/;

/**
 * Heuristic router used by mock mode and as fallback when LLM fails.
 */
export function heuristicDecide(question: string): ToolCallDecision {
  const q = question.trim();
  if (!q) {
    return { route: 'refuse', refuse_reason: 'empty question' };
  }

  if (REFUSE_HINTS.test(q) && !/동아리|클럽|club/i.test(q)) {
    return {
      route: 'refuse',
      refuse_reason: 'out of clubs MVP domain',
    };
  }

  // Prefer structured when asking for discrete fields / listing
  if (STRUCTURED_HINTS.test(q)) {
    const nameMatch = q.match(
      /([가-힣A-Za-z0-9]+)(?:\s*(?:동아리|클럽))?/
    );
    const categoryHints = [
      '학술',
      '체육',
      '문화',
      '봉사',
      '종교',
      '예술',
      '공연',
      'IT',
      '취미',
    ];
    const category = categoryHints.find((c) => q.includes(c));

    const fields: StructuredQueryArgs['fields'] = [];
    if (/연락|컨택|문의|회장|이메일|전화/.test(q)) fields.push('contact');
    if (/시간|언제|모임/.test(q)) fields.push('meeting_time');
    if (/장소|어디|위치|호실/.test(q)) fields.push('location');
    if (/분류|카테고리|분과/.test(q)) fields.push('category');
    if (/목록|리스트|어떤\s*동아리|동아리\s*있어/.test(q)) {
      fields.push('name', 'category');
    }
    if (fields.length === 0) {
      fields.push('name', 'category', 'contact', 'meeting_time', 'location');
    }

    // Try extract club name tokens excluding common words
    const stop = new Set([
      '동아리',
      '클럽',
      '알려줘',
      '알려',
      '뭐야',
      '무엇',
      '어디',
      '언제',
      '연락처',
      '문의',
      '소개',
      '활동',
      '목록',
      '리스트',
      '있어',
      '있는',
      '대해',
      '대한',
      '알려주세요',
      '해주세요',
      '좀',
      '의',
      '은',
      '는',
      '이',
      '가',
      '를',
      '을',
      '와',
      '과',
      '캠퍼스',
      '와이즈',
      'WISE',
      '동국대',
      '동국대학교',
    ]);
    const tokens = q
      .replace(/[?？]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stop.has(t) && !STRUCTURED_HINTS.test(t));

    const structured: StructuredQueryArgs = {
      fields,
      category,
    };
    if (tokens.length === 1) structured.name = tokens[0];
    else if (tokens.length > 1) {
      // Prefer longest Korean-ish token as name candidate
      structured.name = tokens.sort((a, b) => b.length - a.length)[0];
    }

    // If listing all / by category without specific name
    if (/목록|리스트|어떤\s*동아리|동아리\s*있어|동아리\s*알려/.test(q)) {
      delete structured.name;
    }

    return { route: 'structured_query', structured };
  }

  if (SEMANTIC_HINTS.test(q) || /동아리|클럽|club/i.test(q)) {
    return {
      route: 'semantic_search',
      semantic: { query: q, top_k: 3 },
    };
  }

  // Default: try semantic within clubs domain if "동아리" mentioned else refuse
  if (/동아리|클럽|club/i.test(q)) {
    return {
      route: 'semantic_search',
      semantic: { query: q, top_k: 3 },
    };
  }

  return {
    route: 'refuse',
    refuse_reason: 'MVP covers clubs (동아리) only',
  };
}

function composeFromFacts(input: {
  question: string;
  route: AskRoute;
  facts: string;
  citationsNote: string;
}): string {
  if (input.route === 'refuse' || !input.facts.trim()) {
    return (
      '확인되지 않음. 현재 MVP는 동국대학교 WISE 캠퍼스 동아리(클럽) 정보만 답변합니다.\n' +
      (input.citationsNote || '')
    );
  }
  return `${input.facts.trim()}\n\n${input.citationsNote}`.trim();
}

export class MockLlmProvider implements LlmProvider {
  name = 'mock';

  async decideRoute(question: string): Promise<ToolCallDecision> {
    return heuristicDecide(question);
  }

  async composeAnswer(input: {
    question: string;
    route: AskRoute;
    facts: string;
    citationsNote: string;
  }): Promise<string> {
    return composeFromFacts(input);
  }
}

function isOpenRouter(): boolean {
  return (process.env.LLM_PROVIDER || '').toLowerCase() === 'openrouter';
}

function openaiCompatibleApiKey(): string {
  if (isOpenRouter()) {
    const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY or OPENAI_API_KEY missing');
    return key;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  return key;
}

function openaiCompatibleBaseUrl(): string {
  if (process.env.OPENAI_BASE_URL) {
    return process.env.OPENAI_BASE_URL.replace(/\/$/, '');
  }
  if (isOpenRouter()) return 'https://openrouter.ai/api/v1';
  return 'https://api.openai.com/v1';
}

function openaiCompatibleModel(): string {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (isOpenRouter()) return 'openai/gpt-oss-120b';
  return 'gpt-4o-mini';
}

function openaiCompatibleHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (isOpenRouter() || openaiCompatibleBaseUrl().includes('openrouter.ai')) {
    headers['HTTP-Referer'] =
      process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/jaewonkyoung-alt/wise-faq-bot';
    headers['X-Title'] = process.env.OPENROUTER_X_TITLE || 'WISE FAQ Bot';
  }
  return headers;
}

async function openaiChat(system: string, user: string): Promise<string> {
  const key = openaiCompatibleApiKey();
  const model = openaiCompatibleModel();
  const base = openaiCompatibleBaseUrl();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: openaiCompatibleHeaders(key),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI-compatible chat failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || '{}';
}

async function geminiChat(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini chat failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

const ROUTE_SYSTEM = `You are a router for Dongguk University WISE campus club Q&A.
MVP domain: clubs (동아리) only.
Return JSON only with one of:
{"route":"structured_query","structured":{"name":"...","category":"...","fields":["contact","meeting_time","location","name","category"]}}
{"route":"semantic_search","semantic":{"query":"...","top_k":3}}
{"route":"refuse","refuse_reason":"..."}
Use structured_query for contact/time/location/category/list.
Use semantic_search for intro/activities/purpose.
Refuse anything outside clubs.`;

function parseDecision(raw: string): ToolCallDecision {
  try {
    const obj = JSON.parse(raw) as ToolCallDecision;
    if (
      obj.route === 'structured_query' ||
      obj.route === 'semantic_search' ||
      obj.route === 'refuse'
    ) {
      return obj;
    }
  } catch {
    /* fallthrough */
  }
  return heuristicDecide(raw);
}

export class OpenAILlmProvider implements LlmProvider {
  name = 'openai';

  async decideRoute(question: string): Promise<ToolCallDecision> {
    try {
      const raw = await openaiChat(ROUTE_SYSTEM, question);
      return parseDecision(raw);
    } catch {
      return heuristicDecide(question);
    }
  }

  async composeAnswer(input: {
    question: string;
    route: AskRoute;
    facts: string;
    citationsNote: string;
  }): Promise<string> {
    if (input.route === 'refuse' || !input.facts.trim()) {
      return composeFromFacts(input);
    }
    try {
      const raw = await openaiChat(
        'Answer in Korean using ONLY the provided facts. Do not invent. Include citations note verbatim at the end. Return JSON {"answer":"..."}',
        JSON.stringify(input)
      );
      const parsed = JSON.parse(raw) as { answer?: string };
      if (parsed.answer) return parsed.answer;
    } catch {
      /* fallthrough */
    }
    return composeFromFacts(input);
  }
}

export class GeminiLlmProvider implements LlmProvider {
  name = 'gemini';

  async decideRoute(question: string): Promise<ToolCallDecision> {
    try {
      const raw = await geminiChat(ROUTE_SYSTEM, question);
      return parseDecision(raw);
    } catch {
      return heuristicDecide(question);
    }
  }

  async composeAnswer(input: {
    question: string;
    route: AskRoute;
    facts: string;
    citationsNote: string;
  }): Promise<string> {
    if (input.route === 'refuse' || !input.facts.trim()) {
      return composeFromFacts(input);
    }
    try {
      const raw = await geminiChat(
        'Answer in Korean using ONLY the provided facts. Do not invent. Include citations note verbatim at the end. Return JSON {"answer":"..."}',
        JSON.stringify(input)
      );
      const parsed = JSON.parse(raw) as { answer?: string };
      if (parsed.answer) return parsed.answer;
    } catch {
      /* fallthrough */
    }
    return composeFromFacts(input);
  }
}

export function createLlmProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  if (p === 'openrouter') {
    if (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY) {
      const provider = new OpenAILlmProvider();
      provider.name = 'openrouter';
      return provider;
    }
    return new MockLlmProvider();
  }
  if (p === 'openai' && process.env.OPENAI_API_KEY) return new OpenAILlmProvider();
  if (p === 'gemini' && process.env.GEMINI_API_KEY) return new GeminiLlmProvider();
  return new MockLlmProvider();
}
