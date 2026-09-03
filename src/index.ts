import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { loadAllFaqs } from './services/faqStore';

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

// Eager-load FAQ data so startup fails fast if JSON is broken
const faqs = loadAllFaqs();
console.log(`[wise-faq-bot] loaded ${faqs.length} FAQ items`);

app.listen(PORT, () => {
  console.log(`[wise-faq-bot] listening on http://localhost:${PORT}`);
  console.log(`[wise-faq-bot] health: GET /health`);
  console.log(`[wise-faq-bot] search: GET /api/faq/search?q=`);
  console.log(`[wise-faq-bot] kakao:  POST /api/kakao/skill`);
});
