import { Router } from 'express';
import {
  getCategories,
  getFaqById,
  searchFaqs,
} from '../services/faqStore';

export const faqRouter = Router();

faqRouter.get('/search', (req, res) => {
  const q = String(req.query.q ?? '');
  if (!q.trim()) {
    res.status(400).json({ error: 'query parameter q is required' });
    return;
  }
  const results = searchFaqs(q).map(({ item, score }) => ({
    ...item,
    score,
  }));
  res.json({ query: q, count: results.length, results });
});

faqRouter.get('/categories', (_req, res) => {
  res.json({ categories: getCategories() });
});

faqRouter.get('/:id', (req, res) => {
  const item = getFaqById(req.params.id);
  if (!item) {
    res.status(404).json({ error: 'FAQ not found', id: req.params.id });
    return;
  }
  res.json(item);
});
