import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, LinearProgress, MenuItem, Paper, Select, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  AddRounded, DeleteOutlineRounded,
  DeleteSweepOutlined, EditOutlined, FileUploadOutlined, HourglassTopOutlined,
  PaidOutlined, SavingsOutlined, TrendingUpOutlined,
} from '@mui/icons-material';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage, type Cashflow as CashflowRow, type Category, type FlowType, type Role, money } from '../api';
import { EmptyState, MetricCard, PageHeader, RoleChip, SectionCard } from '../components/FinanceUI';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';
import ExpenseReconciliation from '../components/ExpenseReconciliation';

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const flowLabels: Record<FlowType, string> = { income: '收入', expense: '支出', expense_refund: '支出退款', transfer: '转账' };
const colors = ['#3976D8', '#56A57D', '#E4A252', '#8A71D6', '#D97878', '#5B9CB5'];
const empty = { transaction_date: new Date().toISOString().slice(0, 10), description: '', amount: '', flow_type: 'expense' as FlowType, category_id: 0, channel: '', household_role: 'shared' as Role, card_last_four: '' };

interface Analytics { month: string; income_cents: number; expense_cents: number; balance_cents: number; pending_review_count: number; income_breakdown: Array<{ name: string; value_cents: number }>; expense_breakdown: Array<{ name: string; value_cents: number }>; }
type CashflowSort = 'transaction_date' | 'description' | 'flow_type' | 'category_name' | 'channel' | 'amount_cents';
export default function Cashflow() {
  const { settings, roleLabels } = useHouseholdSettings();
  const [params] = useSearchParams();
  const [month, setMonth] = useState(params.get('month') || currentMonth);
  const [type, setType] = useState(params.get('type') || 'all');
  const [rows, setRows] = useState<CashflowRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ month, income_cents: 0, expense_cents: 0, balance_cents: 0, pending_review_count: 0, income_breakdown: [], expense_breakdown: [] });
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CashflowRow | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [pdfFilename, setPdfFilename] = useState('');
  const [pdfElapsedSeconds, setPdfElapsedSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortBy, setSortBy] = useState<CashflowSort>('transaction_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const load = useCallback(async () => {
    try {
      const [r, c, a] = await Promise.all([
        api.get('/cashflows', { params: { month, flow_type: type === 'all' ? undefined : type, page_size: 200 } }),
        api.get<Category[]>('/metadata/categories'),
        api.get<Analytics>('/analytics/cashflow', { params: { month } }),
      ]);
      setRows(r.data.items); setCategories(c.data); setAnalytics(a.data); setSelectedIds([]);
    } catch { setError('收支数据加载失败'); }
  }, [month, type]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (params.get('review') === 'pending') window.dispatchEvent(new CustomEvent('open-review-center'));
  }, [params]);
  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(() => {
      setPdfElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const refreshReviewCount = () => {
      api.get<Analytics>('/analytics/cashflow', { params: { month } }).then((response) => setAnalytics(response.data)).catch(() => undefined);
    };
    window.addEventListener('review-queue-changed', refreshReviewCount);
    window.addEventListener('finance-data-changed', load);
    return () => {
      window.removeEventListener('review-queue-changed', refreshReviewCount);
      window.removeEventListener('finance-data-changed', load);
    };
  }, [load, month]);
  const availableCategories = useMemo(() => categories.filter((item) => item.domain === (form.flow_type === 'income' ? 'income' : 'expense')), [categories, form.flow_type]);
  const startAdd = () => { setEditing(null); const next = { ...empty }; setForm({ ...next, category_id: categories.find((item) => item.domain === 'expense')?.id ?? 0, household_role: settings.default_role }); setOpen(true); };
  const startEdit = (row: CashflowRow) => { setEditing(row); setForm({ transaction_date: row.transaction_date, description: row.description, amount: (row.amount_cents / 100).toFixed(2), flow_type: row.flow_type, category_id: row.category_id ?? 0, channel: row.channel ?? '', household_role: row.household_role, card_last_four: row.card_last_four ?? '' }); setOpen(true); };
  const save = async () => {
    const payload = { transaction_date: form.transaction_date, description: form.description, amount_cents: Math.round(Number(form.amount) * 100), flow_type: form.flow_type, category_id: form.flow_type === 'transfer' ? null : form.category_id, channel: form.channel || null, household_role: form.household_role, card_last_four: form.card_last_four || null };
    try { if (editing) await api.patch(`/cashflows/${editing.id}`, payload); else await api.post('/cashflows', payload); setOpen(false); await load(); } catch { setError('保存失败，请检查日期、金额、类型和分类'); }
  };
  const uploadPdf = async (file?: File) => {
    if (!file) return;
    setError('');
    setPdfFilename(file.name);
    setPdfElapsedSeconds(0);
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file);
      const preview = await api.post('/imports/preview', body);
      window.dispatchEvent(new CustomEvent('open-smart-entry', {
        detail: {
          text: preview.data.text,
          kind: 'cashflow',
          source: {
            filename: preview.data.filename,
            content_sha256: preview.data.content_sha256,
            source_type: preview.data.source_type,
          },
        },
      }));
    } catch (e: unknown) { setError(apiErrorMessage(e, 'PDF 上传失败，请检查文件后重试')); }
    finally { setBusy(false); }
  };
  const breakdown = tab === 'income' ? analytics.income_breakdown : analytics.expense_breakdown;
  const pdfProgressMessage = pdfElapsedSeconds < 2
    ? '正在上传并读取文件'
    : pdfElapsedSeconds < 12
      ? '正在识别页面布局与表格结构'
      : '仍在解析复杂表格，请继续等待';
  const visibleRows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return rows
      .filter((row) =>
        (categoryFilter === 'all' || row.category_id === Number(categoryFilter))
        && (roleFilter === 'all' || row.household_role === roleFilter)
        && (!keyword || [row.description, row.category_name ?? '', row.channel ?? '', row.card_last_four ?? ''].some((value) => value.toLocaleLowerCase().includes(keyword))))
      .sort((a, b) => {
        const left = a[sortBy] ?? '';
        const right = b[sortBy] ?? '';
        const comparison = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'zh-CN');
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [rows, categoryFilter, roleFilter, query, sortBy, sortDirection]);
  const sort = (key: CashflowSort) => {
    if (sortBy === key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDirection('asc'); }
  };
  const sortable = (key: CashflowSort, label: string) => (
    <TableSortLabel active={sortBy === key} direction={sortBy === key ? sortDirection : 'asc'} onClick={() => sort(key)}>{label}</TableSortLabel>
  );
  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm(`确认删除选中的 ${selectedIds.length} 条流水吗？`)) return;
    try {
      const result = await api.post('/cashflows/bulk-delete', { ids: selectedIds });
      setNotice(`已删除 ${result.data.deleted_count} 条流水`);
      await load();
    } catch { setError('批量删除失败，请稍后重试'); }
  };
  const deleteMonth = async () => {
    if (!window.confirm(`确认删除 ${month} 自然月的全部流水吗？该操作不会删除其他月份。`)) return;
    try {
      const result = await api.delete(`/cashflows/month/${month}`);
      setNotice(`已删除 ${month} 的 ${result.data.deleted_count} 条流水`);
      await load();
    } catch { setError('删除整月流水失败，请稍后重试'); }
  };
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));
  return (
    <Box>
      <PageHeader title="家庭收支" subtitle="收入、支出、退款和转账分别记账，避免重复计算。"
        actions={<Stack direction="row" gap={1}><Button component="label" variant="outlined" disabled={busy} startIcon={<FileUploadOutlined />}>{busy ? '解析中…' : '上传 PDF'}<input hidden type="file" accept=".pdf,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void uploadPdf(file); }} /></Button><Button variant="contained" startIcon={<AddRounded />} onClick={startAdd}>新增流水</Button></Stack>} />
      {busy && (
        <Paper variant="outlined" aria-live="polite" sx={{ mb: 2, p: 1.6, borderColor: 'primary.light', bgcolor: 'rgba(57, 118, 216, 0.035)' }}>
          <Stack direction="row" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={750} noWrap>正在解析 {pdfFilename}</Typography>
              <Typography variant="caption" color="text.secondary">{pdfProgressMessage}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{pdfElapsedSeconds} 秒</Typography>
          </Stack>
          <LinearProgress aria-label="PDF 解析进行中" />
        </Paper>
      )}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
      <Grid container spacing={1.8} sx={{ mb: 2.2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="本月收入" value={money(analytics.income_cents)} icon={<TrendingUpOutlined />} tone="green" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="本月支出" value={money(analytics.expense_cents)} hint="已扣除退款" icon={<PaidOutlined />} tone="orange" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="现金结余" value={money(analytics.balance_cents)} icon={<SavingsOutlined />} tone="violet" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="智能录入待复核" value={`${analytics.pending_review_count} 条`} hint="资产与收支 · 点击进入复核中心" icon={<HourglassTopOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('open-review-center'))} /></Grid>
      </Grid>
      <Grid container spacing={1.8}>
        <Grid size={{ xs: 12 }}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}><TextField label="统计月份" type="month" size="small" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} /></Stack>
          <ExpenseReconciliation month={month} refreshKey={analytics} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <SectionCard title="分类占比" subtitle="退款已从对应支出中抵扣">
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ minHeight: 36, mb: 1 }}><Tab value="expense" label="支出" /><Tab value="income" label="收入" /></Tabs>
            {breakdown.length ? <Grid container spacing={2} alignItems="center"><Grid size={{ xs: 12, md: 6 }}><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={breakdown} dataKey="value_cents" nameKey="name" innerRadius={52} outerRadius={78}>{breakdown.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><ChartTooltip formatter={(value) => money(Number(value))} /></PieChart></ResponsiveContainer></Grid><Grid size={{ xs: 12, md: 6 }}><Stack gap={1}>{breakdown.slice(0, 6).map((item, i) => <Stack key={item.name} direction="row" justifyContent="space-between"><Typography variant="body2"><Box component="span" sx={{ width: 8, height: 8, borderRadius: 8, display: 'inline-block', bgcolor: colors[i % colors.length], mr: 1 }} />{item.name}</Typography><Typography variant="body2" fontWeight={700}>{money(item.value_cents)}</Typography></Stack>)}</Stack></Grid></Grid> : <EmptyState title="暂无分类数据" description="录入流水后可查看分类占比。" />}
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Paper variant="outlined" sx={{ borderColor: '#E5EAF1', overflow: 'hidden' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.2} alignItems={{ sm: 'center' }} sx={{ p: 2, borderBottom: '1px solid #E9EDF2' }}>
              <TextField type="month" size="small" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} />
              <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索描述、渠道或卡号" sx={{ minWidth: { sm: 210 } }} />
              <Select size="small" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="all">全部类型</MenuItem>{Object.entries(flowLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select>
              <Select size="small" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="all">全部分类</MenuItem>{categories.filter((item) => item.domain === 'income' || item.domain === 'expense').map((item) => <MenuItem key={item.id} value={String(item.id)}>{item.name}</MenuItem>)}</Select>
              <Select size="small" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="all">全部角色</MenuItem><MenuItem value="husband">{roleLabels.husband}</MenuItem><MenuItem value="wife">{roleLabels.wife}</MenuItem><MenuItem value="shared">{roleLabels.shared}</MenuItem></Select>
              <Box sx={{ flexGrow: 1 }} />
              {selectedIds.length > 0 && <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} onClick={() => void deleteSelected()}>删除所选（{selectedIds.length}）</Button>}
              <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepOutlined />} onClick={() => void deleteMonth()}>删除整月</Button>
            </Stack>
            <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" sx={{ width: '100%', minWidth: { xs: 720, md: 980 }, tableLayout: 'fixed' }}><TableHead><TableRow><TableCell padding="checkbox" sx={{ width: 46 }}><Checkbox size="small" checked={allVisibleSelected} indeterminate={selectedIds.length > 0 && !allVisibleSelected} onChange={(event) => setSelectedIds(event.target.checked ? visibleRows.map((row) => row.id) : [])} inputProps={{ 'aria-label': '选择当前列表全部流水' }} /></TableCell><TableCell sx={{ width: 104 }}>{sortable('transaction_date', '日期')}</TableCell><TableCell>{sortable('description', '描述')}</TableCell><TableCell sx={{ width: 92 }}>{sortable('flow_type', '类型')}</TableCell><TableCell sx={{ width: 108 }}>{sortable('category_name', '分类')}</TableCell><TableCell sx={{ width: 110, display: { xs: 'none', md: 'table-cell' } }}>{sortable('channel', '渠道')}</TableCell><TableCell sx={{ width: 108, display: { xs: 'none', md: 'table-cell' } }}>家庭角色</TableCell><TableCell align="right" sx={{ width: 142 }}>{sortable('amount_cents', '金额')}</TableCell><TableCell align="right" sx={{ width: 92 }}>操作</TableCell></TableRow></TableHead>
              <TableBody>{visibleRows.map((row) => <TableRow key={row.id} hover selected={selectedIds.includes(row.id)}><TableCell padding="checkbox"><Checkbox size="small" checked={selectedIds.includes(row.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} inputProps={{ 'aria-label': `选择流水 ${row.description}` }} /></TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{row.transaction_date}</TableCell><TableCell><Tooltip title={row.description} enterDelay={600}><Typography variant="body2" fontWeight={650} noWrap>{row.description}</Typography></Tooltip></TableCell><TableCell><Chip size="small" label={flowLabels[row.flow_type]} color={row.flow_type === 'income' ? 'success' : row.flow_type === 'expense' ? 'warning' : 'default'} variant="outlined" /></TableCell><TableCell><Typography variant="body2" noWrap>{row.category_name ?? '—'}</Typography></TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Typography variant="body2" noWrap>{row.channel ?? '—'}</Typography></TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><RoleChip role={row.household_role} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 750, fontVariantNumeric: 'tabular-nums', color: row.flow_type === 'income' || row.flow_type === 'expense_refund' ? 'success.main' : 'text.primary' }}>{row.flow_type === 'income' || row.flow_type === 'expense_refund' ? '+' : row.flow_type === 'expense' ? '−' : ''}{money(row.amount_cents)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><Tooltip title="编辑"><IconButton size="small" onClick={() => startEdit(row)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="删除"><IconButton size="small" color="error" onClick={async () => { if (window.confirm('确认删除这条流水吗？')) { await api.delete(`/cashflows/${row.id}`); await load(); } }}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}</TableBody>
            </Table></TableContainer>
             {!visibleRows.length && <EmptyState title={rows.length ? '没有符合筛选条件的流水' : '这个月还没有流水'} description={rows.length ? '可以调整搜索词或筛选条件。' : '可以手动新增、上传 PDF，或回到总览使用智能录入。'} />}
          </Paper>
        </Grid>
      </Grid>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth><DialogTitle>{editing ? '编辑流水' : '新增流水'}</DialogTitle><DialogContent sx={{ pt: '14px !important' }}><Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}><TextField label="日期" type="date" fullWidth value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField select label="类型" fullWidth value={form.flow_type} onChange={(e) => { const next = e.target.value as FlowType; setForm({ ...form, flow_type: next, category_id: categories.find((item) => item.domain === (next === 'income' ? 'income' : 'expense'))?.id ?? 0 }); }}>{Object.entries(flowLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12 }}><TextField label="描述" fullWidth value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField label="金额（元）" type="number" fullWidth value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} helperText="金额始终填正数，由类型决定方向" /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField select label="分类" fullWidth disabled={form.flow_type === 'transfer'} value={form.flow_type === 'transfer' ? '' : form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>{availableCategories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField label="渠道" fullWidth value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField select label="家庭角色" fullWidth value={form.household_role} onChange={(e) => setForm({ ...form, household_role: e.target.value as Role })}><MenuItem value="shared">{roleLabels.shared}</MenuItem><MenuItem value="husband">{roleLabels.husband}</MenuItem><MenuItem value="wife">{roleLabels.wife}</MenuItem></TextField></Grid>
      </Grid></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>取消</Button><Button variant="contained" disabled={!form.description || !form.amount || (form.flow_type !== 'transfer' && !form.category_id)} onClick={() => void save()}>保存</Button></DialogActions></Dialog>
    </Box>
  );
}
