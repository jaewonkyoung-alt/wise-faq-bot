import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { faqRouter } from './routes/faq';
import { kakaoRouter } from './routes/kakao';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api/faq', faqRouter);
  app.use('/api/kakao', kakaoRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}
