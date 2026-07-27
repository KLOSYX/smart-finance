import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, IconButton, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircleOutlineRounded, CloseRounded, ErrorOutlineRounded, FactCheckOutlined,
  HistoryRounded, HourglassTopRounded, RefreshRounded, ReplayRounded,
  UndoRounded,
} from '@mui/icons-material';
import { api, apiErrorMessage, type ImportHistory as ImportHistoryData, type ImportSummary } from '../api';

const statusMeta: Record<ImportSummary['status'], { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  processing: { label: '处理中', color: 'info' },
  review: { label: '待复核', color: 'warning' },
  committed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  discarded: { label: '已放弃', color: 'default' },
  reverted: { label: '已撤回', color: 'default' },
};
const kindLabels: Record<string, string> = { cashflow: '收支流水', asset: '资产快照', mixed: '混合内容' };
const time = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

function StatCard({ label, value, hint, color, icon }: {
  label: string; value: number; hint: string; color: string; icon: ReactNode;
}) {
  return <Paper variant="outlined" sx={{ p: 1.6, height: '100%', borderColor: '#E2E8F0' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
      <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={850}>{value}</Typography></Box>
      <Box sx={{ color, display: 'grid', placeItems: 'center' }}>{icon}</Box>
    </Stack>
    <Typography variant="caption" color="text.secondary">{hint}</Typography>
  </Paper>;
}

export default function ImportHistory() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ImportHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Array<{ id: number; candidate_type: string; payload: Record<string, unknown>; status: string }>>>({});
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData((await api.get<ImportHistoryData>('/imports')).data); }
    catch (reason) { setError(apiErrorMessage(reason, '录入历史加载失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const show = () => { setOpen(true); void load(); };
    window.addEventListener('open-import-history', show);
    return () => window.removeEventListener('open-import-history', show);
  }, []);

  const retry = async (item: ImportSummary) => {
    setRetryingId(item.id); setError('');
    try {
      const result = await api.post(`/imports/${item.id}/retry`);
      window.dispatchEvent(new CustomEvent('review-queue-changed'));
      window.dispatchEvent(new CustomEvent('finance-data-changed'));
      await load();
      if (result.data.pending_review_count) window.dispatchEvent(new CustomEvent('open-review-center'));
    } catch (reason) {
      setError(apiErrorMessage(reason, '重试失败，请检查 LLM 设置或网络连接'));
      await load();
    } finally { setRetryingId(null); }
  };
  const toggleDetail = async (item: ImportSummary) => {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    if (details[item.id] || !item.candidate_count) return;
    try {
      const detail = await api.get(`/imports/${item.id}`);
      setDetails((current) => ({ ...current, [item.id]: detail.data.candidates }));
    } catch (reason) {
      setError(apiErrorMessage(reason, '录入明细加载失败'));
    }
  };
  const revert = async (item: ImportSummary) => {
    if (!window.confirm(`确认整批撤回“${item.filename}”吗？\n\n本次录入产生的 ${item.committed_count} 条正式记录将被删除或恢复到录入前状态；录入历史会保留。`)) return;
    setRevertingId(item.id); setError('');
    try {
      await api.post(`/imports/${item.id}/revert`);
      setExpandedId(null);
      setDetails((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      window.dispatchEvent(new CustomEvent('finance-data-changed'));
      window.dispatchEvent(new CustomEvent('review-queue-changed'));
      await load();
    } catch (reason) {
      setError(apiErrorMessage(reason, '整批撤回失败，未修改任何数据'));
    } finally { setRevertingId(null); }
  };
  const stats = data?.stats;

  return <>
    <Tooltip title="查看每次智能录入的进度和结果">
      <Button variant="text" size="small" startIcon={<HistoryRounded />} onClick={() => { setOpen(true); void load(); }}
        sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.08)', px: { xs: 1, sm: 1.5 }, '&:hover': { bgcolor: 'rgba(255,255,255,.16)' } }}>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>录入历史</Box>
      </Button>
    </Tooltip>
    <Dialog open={open} onClose={() => !retryingId && setOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box><Typography variant="h6" fontWeight={850}>智能录入历史</Typography><Typography variant="body2" color="text.secondary">跟进每个批次的识别、复核和入账结果</Typography></Box>
          <Stack direction="row"><IconButton aria-label="刷新" onClick={() => void load()} disabled={loading}><RefreshRounded /></IconButton><IconButton aria-label="关闭" onClick={() => setOpen(false)}><CloseRounded /></IconButton></Stack>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {stats && <Grid container spacing={1.2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 3 }}><StatCard label="识别记录" value={stats.total_records} hint={`${stats.total_batches} 个录入批次`} color="#3976D8" icon={<HistoryRounded />} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><StatCard label="成功入账" value={stats.committed_records} hint={`${stats.completed_batches} 个批次完成`} color="#168B5B" icon={<CheckCircleOutlineRounded />} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><StatCard label="等待处理" value={stats.pending_records} hint={`${stats.review_batches} 个批次待复核`} color="#D97706" icon={<HourglassTopRounded />} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><StatCard label="录入失败" value={stats.failed_batches} hint="可从下方直接重试" color="#D14343" icon={<ErrorOutlineRounded />} /></Grid>
        </Grid>}
        {loading && !data ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box> :
          data?.items.length ? <Stack divider={<Divider flexItem />} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
            {data.items.map((item) => {
              const meta = statusMeta[item.status];
              return <Box key={item.id} sx={{ p: 1.8, bgcolor: '#fff' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.2}>
                  <Stack gap={0.6}>
                    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography fontWeight={800}>{item.filename}</Typography>
                      <Chip size="small" color={meta.color} label={meta.label} />
                      {item.attempt_count > 1 && <Chip size="small" variant="outlined" label={`已尝试 ${item.attempt_count} 次`} />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{time(item.imported_at)} · {kindLabels[item.import_kind] ?? item.import_kind} · 共识别 {item.candidate_count} 条</Typography>
                    <Stack direction="row" gap={1.5} flexWrap="wrap">
                      <Typography variant="body2" color="success.main">成功 {item.committed_count}</Typography>
                      <Typography variant="body2" color="warning.main">待复核 {item.pending_count}</Typography>
                      <Typography variant="body2" color="text.secondary">未录入 {item.ignored_count}</Typography>
                      {item.reverted_count > 0 && <Typography variant="body2" color="text.secondary">已撤回 {item.reverted_count}</Typography>}
                    </Stack>
                    {item.error_message && <Alert severity="error" variant="outlined" sx={{ mt: 0.4, py: 0, '& .MuiAlert-message': { py: 0.6 } }}>{item.error_message}</Alert>}
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {item.candidate_count > 0 && <Button size="small" onClick={() => void toggleDetail(item)}>{expandedId === item.id ? '收起明细' : '查看明细'}</Button>}
                    {item.status === 'review' && <Button size="small" startIcon={<FactCheckOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('open-review-center'))}>去复核</Button>}
                    {item.status === 'committed' && item.committed_count > 0 && <Button size="small" color="error" startIcon={revertingId === item.id ? <CircularProgress size={15} color="inherit" /> : <UndoRounded />} disabled={revertingId !== null} onClick={() => void revert(item)}>{revertingId === item.id ? '撤回中…' : '整批撤回'}</Button>}
                    {item.status === 'failed' && <Button size="small" variant="contained" startIcon={retryingId === item.id ? <CircularProgress size={15} color="inherit" /> : <ReplayRounded />} disabled={retryingId !== null} onClick={() => void retry(item)}>{retryingId === item.id ? '重试中…' : '重试'}</Button>}
                  </Stack>
                </Stack>
                <Collapse in={expandedId === item.id}>
                  <Stack gap={0.7} sx={{ mt: 1.5, pt: 1.3, borderTop: '1px dashed #D9E1EC' }}>
                    {(details[item.id] ?? []).map((candidate, index) => {
                      const payload = candidate.payload;
                      const title = String(payload.description ?? payload.name ?? `记录 ${index + 1}`);
                      const recordDate = String(payload.transaction_date ?? payload.valuation_date ?? '');
                      const amount = payload.amount ?? payload.value;
                      const recordStatus = candidate.status === 'confirmed' ? '已入账' : candidate.status === 'pending' ? '待复核' : candidate.status === 'reverted' ? '已撤回' : '未录入';
                      return <Stack key={candidate.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={0.5} sx={{ px: 1.2, py: 0.8, bgcolor: '#F8FAFD', borderRadius: 1.5 }}>
                        <Box><Typography variant="body2" fontWeight={750}>{title}</Typography><Typography variant="caption" color="text.secondary">{recordDate}{amount != null ? ` · ¥${Number(amount).toLocaleString('zh-CN')}` : ''} · {candidate.candidate_type === 'cashflow' ? '收支流水' : '资产快照'}</Typography></Box>
                        <Chip size="small" label={recordStatus} color={candidate.status === 'confirmed' ? 'success' : candidate.status === 'pending' ? 'warning' : 'default'} />
                      </Stack>;
                    })}
                    {!details[item.id] && <Box sx={{ py: 1, textAlign: 'center' }}><CircularProgress size={20} /></Box>}
                  </Stack>
                </Collapse>
              </Box>;
            })}
          </Stack> : !loading && <Box sx={{ py: 8, textAlign: 'center' }}><HistoryRounded sx={{ fontSize: 44, color: 'text.disabled' }} /><Typography fontWeight={800}>还没有录入历史</Typography><Typography variant="body2" color="text.secondary">完成一次智能录入后，这里会显示处理进度和结果。</Typography></Box>}
      </DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)}>关闭</Button></DialogActions>
    </Dialog>
  </>;
}
