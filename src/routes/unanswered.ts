import { Router } from 'express';
import {
  clearHandledUnanswered,
  clearUnanswered,
  listUnanswered,
  listUnansweredGroups,
  setUnansweredStatus,
  unansweredCounts,
  UNANSWERED_STATUSES,
  type UnansweredStatus,
} from '../services/unanswered';
import { checkAdmin } from '../middleware/adminAuth';

export const unansweredRouter = Router();

/** ?status=new|resolved|ignored|all — 같은 질문을 묶은 목록 + 상태별 개수 (관리자 화면) */
unansweredRouter.get('/unanswered', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const status = String(req.query.status || 'new') as UnansweredStatus | 'all';
  if (status !== 'all' && !UNANSWERED_STATUSES.includes(status)) {
    res.status(400).json({ error: 'status 는 new · resolved · ignored · all 중 하나' });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({
    counts: unansweredCounts(),
    groups: listUnansweredGroups(status),
    items: listUnanswered(limit),
  });
});

/** { ids: number[], status } — 묶음 단위 해결 · 무시 · 되돌리기 */
unansweredRouter.post('/unanswered/status', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const status = String(req.body?.status || '') as UnansweredStatus;
  try {
    res.json({ changed: setUnansweredStatus(ids, status), counts: unansweredCounts() });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** ?handled=1 이면 해결 · 무시한 기록만 지운다 (새 질문은 남김) */
unansweredRouter.delete('/unanswered', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const deleted = req.query.handled ? clearHandledUnanswered() : clearUnanswered();
  res.json({ deleted, counts: unansweredCounts() });
});
