import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'wise-faq-bot',
    campus: 'Dongguk University WISE',
    timestamp: new Date().toISOString(),
  });
});
