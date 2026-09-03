import { Router } from 'express';
import { clearUnanswered, listUnanswered } from '../services/unanswered';

export const unansweredRouter = Router();

unansweredRouter.get('/unanswered', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const items = listUnanswered(limit);
  res.json({ count: items.length, items });
});

unansweredRouter.delete('/unanswered', (_req, res) => {
  const deleted = clearUnanswered();
  res.json({ deleted });
});
