import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, InputAdornment, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined, CalendarMonthOutlined, CategoryOutlined,
  DeleteOutlineRounded, DescriptionOutlined, FactCheckOutlined, PaidOutlined,
  PaymentsOutlined, PersonOutlineRounded, ReceiptLongOutlined, StorefrontOutlined,
  SwapVertRounded,
} from '@mui/icons-material';
import { api, apiErrorMessage, type Category, type FlowType } from '../api';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';
import type { ReactNode } from 'react';

export interface Candidate {
  id: number;
  candidate_type: 'cashflow' | 'asset_snapshot';
  payload: Record<string, unknown>;
  status: string;
  include?: boolean;
}

interface ReviewBatch {
  import_id: number;
  filename: string;
  source_type: string;
  import_kind: string;
  imported_at: string;
  candidates: Candidate[];
}

const flowLabels: Record<FlowType, string> = {
  income: '收入', expense: '支出', expense_refund: '支出退款', transfer: '转账',
};
function value(payload: Record<string, unknown>, key: string) {
  const current = payload[key];
  return current == null ? '' : String(current);
}

const fieldAdornment = (icon: ReactNode, color = '#3976D8') => (
  <InputAdornment position="start" sx={{ color, '& .MuiSvgIcon-root': { fontSize: 19 } }}>
    {icon}
  </InputAdornment>
);

export function CandidateReviewList({ candidates, setCandidates, categories }: {
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  categories: Category[];
}) {
  const { settings, roleLabels } = useHouseholdSettings();
  const update = (id: number, changes: Partial<Candidate>) => {
    setCandidates((rows) => rows.map((row) => row.id === id ? { ...row, ...changes } : row));
  };
  const updatePayload = (candidate: Candidate, key: string, nextValue: unknown) => {
    update(candidate.id, { payload: { ...candidate.payload, [key]: nextValue } });
  };
  const changeType = (candidate: Candidate, nextType: Candidate['candidate_type']) => {
    if (nextType === candidate.candidate_type) return;
    if (nextType === 'asset_snapshot') {
      update(candidate.id, {
        candidate_type: nextType,
        payload: {
          name: value(candidate.payload, 'description') || value(candidate.payload, 'name'),
          valuation_date: value(candidate.payload, 'transaction_date') || value(candidate.payload, 'valuation_date'),
          value: value(candidate.payload, 'amount') || value(candidate.payload, 'value'),
          category_code: 'other_asset',
          channel: value(candidate.payload, 'channel'),
          household_role: value(candidate.payload, 'household_role') || settings.default_role,
        },
      });
    } else {
      update(candidate.id, {
        candidate_type: nextType,
        payload: {
          transaction_date: value(candidate.payload, 'valuation_date') || value(candidate.payload, 'transaction_date'),
          description: value(candidate.payload, 'name') || value(candidate.payload, 'description'),
          amount: value(candidate.payload, 'value') || value(candidate.payload, 'amount'),
          flow_type: 'expense',
          category_code: 'other_expense',
          channel: value(candidate.payload, 'channel'),
          household_role: value(candidate.payload, 'household_role') || settings.default_role,
        },
      });
    }
  };

  return (
    <Stack gap={1.5}>
      {candidates.map((candidate, index) => {
        const domain = candidate.candidate_type === 'asset_snapshot'
          ? 'asset'
          : value(candidate.payload, 'flow_type') === 'income' ? 'income' : 'expense';
        const options = categories.filter((item) => item.domain === domain);
        const isAsset = candidate.candidate_type === 'asset_snapshot';
        const accent = isAsset ? '#7353C7' : '#3976D8';
        return (
          <Paper key={candidate.id} variant="outlined" sx={{
            p: 2, opacity: candidate.include === false ? .5 : 1, borderColor: '#DDE4EE',
            borderLeft: `4px solid ${accent}`, bgcolor: '#FCFDFE',
            boxShadow: '0 2px 8px rgba(31,53,84,.035)',
          }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Box sx={{ width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: isAsset ? '#F2ECFF' : '#EAF2FF', color: accent }}>
                  {isAsset ? <AccountBalanceWalletOutlined fontSize="small" /> : <ReceiptLongOutlined fontSize="small" />}
                </Box>
                <Typography fontWeight={800}>记录 #{index + 1}</Typography>
                <Chip size="small" label="待复核" color="warning" />
              </Stack>
              <Button size="small" color={candidate.include === false ? 'primary' : 'error'} onClick={() => update(candidate.id, { include: candidate.include === false })}>
                {candidate.include === false ? '恢复记录' : '暂不入账'}
              </Button>
            </Stack>
            <Grid container spacing={1.3}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField select fullWidth label="记录类型" value={candidate.candidate_type} onChange={(event) => changeType(candidate, event.target.value as Candidate['candidate_type'])}
                  slotProps={{ input: { startAdornment: fieldAdornment(<SwapVertRounded />, '#5E6C84') } }}>
                  <MenuItem value="asset_snapshot">资产快照</MenuItem>
                  <MenuItem value="cashflow">收支流水</MenuItem>
                </TextField>
              </Grid>
              {candidate.candidate_type === 'cashflow' ? <>
                <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="date" label="日期" value={value(candidate.payload, 'transaction_date')} onChange={(event) => updatePayload(candidate, 'transaction_date', event.target.value)} slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: fieldAdornment(<CalendarMonthOutlined />) } }} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField select fullWidth label="收支类型" value={value(candidate.payload, 'flow_type') || 'expense'} onChange={(event) => updatePayload(candidate, 'flow_type', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<PaidOutlined />, '#D97706') } }}>{Object.entries(flowLabels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="描述" value={value(candidate.payload, 'description')} onChange={(event) => updatePayload(candidate, 'description', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<DescriptionOutlined />, '#5E6C84') } }} /></Grid>
                <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth type="number" label="金额（元）" value={value(candidate.payload, 'amount')} onChange={(event) => updatePayload(candidate, 'amount', Number(event.target.value))} slotProps={{ input: { startAdornment: fieldAdornment(<PaymentsOutlined />, '#168B5B') } }} /></Grid>
                <Grid size={{ xs: 12, sm: 3 }}><TextField select fullWidth label="分类" value={value(candidate.payload, 'category_code')} onChange={(event) => updatePayload(candidate, 'category_code', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<CategoryOutlined />, '#7353C7') } }}>{options.map((item) => <MenuItem key={item.code} value={item.code}>{item.name}</MenuItem>)}</TextField></Grid>
              </> : <>
                <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="date" label="估值日期" value={value(candidate.payload, 'valuation_date')} onChange={(event) => updatePayload(candidate, 'valuation_date', event.target.value)} slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: fieldAdornment(<CalendarMonthOutlined />, accent) } }} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField select fullWidth label="资产分类" value={value(candidate.payload, 'category_code')} onChange={(event) => updatePayload(candidate, 'category_code', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<CategoryOutlined />, accent) } }}>{options.map((item) => <MenuItem key={item.code} value={item.code}>{item.name}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="资产名称" value={value(candidate.payload, 'name')} onChange={(event) => updatePayload(candidate, 'name', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<AccountBalanceWalletOutlined />, accent) } }} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="当前价值（元）" value={value(candidate.payload, 'value')} onChange={(event) => updatePayload(candidate, 'value', Number(event.target.value))} slotProps={{ input: { startAdornment: fieldAdornment(<PaymentsOutlined />, '#168B5B') } }} /></Grid>
              </>}
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="渠道" value={value(candidate.payload, 'channel')} onChange={(event) => updatePayload(candidate, 'channel', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<StorefrontOutlined />, '#2E7890') } }} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField select fullWidth label="家庭角色" value={value(candidate.payload, 'household_role') || settings.default_role} onChange={(event) => updatePayload(candidate, 'household_role', event.target.value)} slotProps={{ input: { startAdornment: fieldAdornment(<PersonOutlineRounded />, '#B45A86') } }}>{Object.entries(roleLabels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField></Grid>
            </Grid>
          </Paper>
        );
      })}
    </Stack>
  );
}

export default function ReviewCenter() {
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<ReviewBatch[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingCount = useMemo(() => batches.reduce((sum, batch) => sum + batch.candidates.length, 0), [batches]);

  const applyQueue = (queue: ReviewBatch[], preferredId?: number) => {
    setBatches(queue);
    const selected = queue.find((batch) => batch.import_id === preferredId) ?? queue[0];
    setSelectedId(selected?.import_id ?? '');
    setCandidates((selected?.candidates ?? []).map((item) => ({ ...item, include: true })));
  };
  const refresh = async (preferredId?: number) => {
    const [queue, categoryRows] = await Promise.all([
      api.get<ReviewBatch[]>('/imports/review-queue'),
      categories.length ? Promise.resolve({ data: categories }) : api.get<Category[]>('/metadata/categories'),
    ]);
    if (!categories.length) setCategories(categoryRows.data);
    applyQueue(queue.data, preferredId);
    return queue.data;
  };
  const show = async () => {
    setOpen(true); setError('');
    try { await refresh(); } catch (error) { setError(apiErrorMessage(error, '待复核内容加载失败')); }
  };
  useEffect(() => {
    api.get<ReviewBatch[]>('/imports/review-queue').then((response) => setBatches(response.data)).catch(() => undefined);
    const openHandler = () => {
      setOpen(true);
      setError('');
      Promise.all([api.get<ReviewBatch[]>('/imports/review-queue'), api.get<Category[]>('/metadata/categories')])
        .then(([queue, categoryRows]) => { setCategories(categoryRows.data); applyQueue(queue.data); })
        .catch((error) => setError(apiErrorMessage(error, '待复核内容加载失败')));
    };
    const syncHandler = () => {
      api.get<ReviewBatch[]>('/imports/review-queue').then((response) => setBatches(response.data)).catch(() => undefined);
    };
    window.addEventListener('open-review-center', openHandler);
    window.addEventListener('review-queue-changed', syncHandler);
    return () => {
      window.removeEventListener('open-review-center', openHandler);
      window.removeEventListener('review-queue-changed', syncHandler);
    };
  }, []);
  const selectBatch = (id: number) => {
    const selected = batches.find((batch) => batch.import_id === id);
    setSelectedId(id);
    setCandidates((selected?.candidates ?? []).map((item) => ({ ...item, include: true })));
  };
  const commit = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      await api.post(`/imports/${selectedId}/commit`, {
        candidates: candidates.map((item) => ({
          id: item.id,
          candidate_type: item.candidate_type,
          payload: item.payload,
          include: item.include !== false,
        })),
      });
      const queue = await refresh();
      window.dispatchEvent(new CustomEvent('review-queue-changed'));
      if (!queue.length) setOpen(false);
    } catch (error) {
      setError(apiErrorMessage(error, '确认入账失败，请检查日期、类型、分类和金额'));
    } finally { setBusy(false); }
  };
  const discard = async () => {
    if (!selectedId || !window.confirm('确认丢弃当前批次吗？未入账的候选记录会被删除，之后可以重新上传同一份资料。')) return;
    setBusy(true); setError('');
    try {
      await api.delete(`/imports/${selectedId}/review`);
      const queue = await refresh();
      window.dispatchEvent(new CustomEvent('review-queue-changed'));
      if (!queue.length) setOpen(false);
    } catch (error) {
      setError(apiErrorMessage(error, '丢弃批次失败，请稍后重试'));
    } finally { setBusy(false); }
  };

  return <>
    <Badge badgeContent={pendingCount} color="warning" max={99}>
      <Button variant="text" size="small" startIcon={<FactCheckOutlined />} onClick={() => void show()}
        sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.08)', px: { xs: 1, sm: 1.5 }, '&:hover': { bgcolor: 'rgba(255,255,255,.16)' } }}>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>复核中心</Box>
      </Button>
    </Badge>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>智能录入复核中心</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>这里只显示被归入固定“待复核”分类的记录。你可以修正分类、金额和记录类型；确认后才会写入正式数据。</Alert>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {batches.length ? <>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={700}>待复核批次</Typography>
            <Select size="small" value={selectedId} onChange={(event) => selectBatch(Number(event.target.value))} sx={{ minWidth: 250 }}>
              {batches.map((batch) => <MenuItem key={batch.import_id} value={batch.import_id}>{batch.filename} · {batch.candidates.length} 条</MenuItem>)}
            </Select>
            <Chip size="small" label={`共 ${pendingCount} 条待复核`} />
          </Stack>
          <CandidateReviewList candidates={candidates} setCandidates={setCandidates} categories={categories} />
        </> : <Box sx={{ py: 7, textAlign: 'center' }}><FactCheckOutlined sx={{ fontSize: 42, color: 'success.main' }} /><Typography fontWeight={800} sx={{ mt: 1 }}>没有待复核内容</Typography><Typography variant="body2" color="text.secondary">只有分类为“待复核”的智能提取记录会出现在这里。</Typography></Box>}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box>{batches.length > 0 && <Button color="error" startIcon={<DeleteOutlineRounded />} disabled={busy} onClick={() => void discard()}>丢弃当前批次</Button>}</Box>
        <Stack direction="row" gap={1}>
          <Button onClick={() => setOpen(false)}>关闭</Button>
          {batches.length > 0 && <Button variant="contained" disabled={busy || !candidates.some((item) => item.include !== false)} onClick={() => void commit()}>{busy ? '正在入账…' : '确认当前批次'}</Button>}
        </Stack>
      </DialogActions>
    </Dialog>
  </>;
}
