import fs from 'fs';
import path from 'path';
import type { FaqItem, FaqSearchResult } from '../types/faq';

const FAQ_DIR = path.resolve(__dirname, '../../data/faq');

let cache: FaqItem[] | null = null;

export function loadAllFaqs(): FaqItem[] {
  if (cache) return cache;

  if (!fs.existsSync(FAQ_DIR)) {
    cache = [];
    return cache;
  }

  const files = fs.readdirSync(FAQ_DIR).filter((f) => f.endsWith('.json'));
  const items: FaqItem[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(FAQ_DIR, file), 'utf-8');
    const parsed = JSON.parse(raw) as FaqItem | FaqItem[];
    if (Array.isArray(parsed)) {
      items.push(...parsed);
    } else {
      items.push(parsed);
    }
  }

  cache = items;
  return cache;
}

/** Clear in-memory cache (useful after hot-reload / tests) */
export function clearFaqCache(): void {
  cache = null;
}

export function getCategories(): string[] {
  const set = new Set(loadAllFaqs().map((f) => f.category));
  return Array.from(set).sort();
}

export function getFaqById(id: string): FaqItem | undefined {
  return loadAllFaqs().find((f) => f.id === id);
}

/**
 * Simple keyword / substring scoring for MVP.
 * No external search engine — FAQ JSON only.
 */
export function searchFaqs(query: string, limit = 10): FaqSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const results: FaqSearchResult[] = [];

  for (const item of loadAllFaqs()) {
    let score = 0;
    const haystack = [
      item.question,
      item.answer,
      item.category,
      ...item.keywords,
    ]
      .join(' ')
      .toLowerCase();

    if (haystack.includes(q)) score += 10;

    for (const token of tokens) {
      if (item.question.toLowerCase().includes(token)) score += 5;
      if (item.keywords.some((k) => k.toLowerCase().includes(token))) score += 4;
      if (item.category.toLowerCase().includes(token)) score += 2;
      if (item.answer.toLowerCase().includes(token)) score += 1;
    }

    if (score > 0) {
      results.push({ item, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
