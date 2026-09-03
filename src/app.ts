import express from 'express';
import cors from 'cors';
import path from 'path';
import { healthRouter } from './routes/health';
import { askRouter } from './routes/ask';
import { adminRouter } from './routes/admin';
import { unansweredRouter } from './routes/unanswered';
import { kakaoRouter } from './routes/kakao';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.use(healthRouter);
  app.use('/api', askRouter);
  app.use('/api', unansweredRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/kakao', kakaoRouter);

  app.get('/admin', (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public/admin/index.html'));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}
