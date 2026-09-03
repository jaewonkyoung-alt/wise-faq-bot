import { Router } from 'express';
import { getEmbedProvider } from '../embeddings/embedder';
import { createLlmProvider } from '../llm/provider';
import { listClubs } from '../services/clubStore';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  let clubs = 0;
  try {
    clubs = listClubs().length;
  } catch {
    clubs = -1;
  }
  res.json({
    status: 'ok',
    service: 'wise-faq-bot',
    phase: 'phase-1-hybrid-rag',
    domain: 'clubs',
    campus: 'Dongguk University WISE',
    llm: createLlmProvider().name,
    embed: getEmbedProvider(),
    clubs,
    timestamp: new Date().toISOString(),
  });
});
