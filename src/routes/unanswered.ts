import { Router } from 'express';
import { clearUnanswered, listUnanswered } from '../services/unanswered';
import { checkAdmin } from '../middleware/adminAuth';

export const unansweredRouter = Router();

unansweredRouter.get('/unanswered', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const items = listUnanswered(limit);
  res.json({ count: items.length, items });
});

unansweredRouter.delete('/unanswered', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const deleted = clearUnanswered();
  res.json({ deleted });
});
