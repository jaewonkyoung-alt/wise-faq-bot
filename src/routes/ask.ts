import { Router } from 'express';
import { ask } from '../services/askService';

export const askRouter = Router();

askRouter.post('/ask', async (req, res) => {
  try {
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    const result = await ask(question);
    res.json({ question, ...result });
  } catch (err) {
    console.error('[ask]', err);
    res.status(500).json({
      error: 'ask failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
