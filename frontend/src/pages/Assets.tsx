import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton,
  MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import { AddRounded, DeleteOutlineRounded, EditOutlined, EventAvailableOutlined, SavingsOutlined, TrendingUpOutlined } from '@mui/icons-material';
import { api, type Asset, type Category, type Role, money } from '../api';
import { EmptyState, MetricCard, PageHeader, RoleChip } from '../components/FinanceUI';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';

const emptyForm = {
  name: '', category_id: 0, channel: '', household_role: 'shared' as Role,
  current_value: '', valuation_date: new Date().toISOString().slice(0, 10), note: '',
};
type AssetSort = 'name' | 'category_name' | 'channel' | 'current_value_cents' | 'monthly_change_cents' | 'valuation_date' | 'status';

export default function Assets() {
  const { settings, roleLabels } = useHouseholdSettings();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] = useState({ total_assets_cents: 0, monthly_change_cents: 0, snapshot_completeness: 0, updated_assets: 0, total_assets: 0 });
  const [role, setRole] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<AssetSort>('current_value_cents');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [a, c, m] = await Promise.all([api.get<Asset[]>('/assets'), api.get<Category[]>('/metadata/categories', { params: { domain: 'asset' } }), api.get('/analytics/assets')]);
      setAssets(a.data); setCategories(c.data); setAnalytics(m.data);
    } catch { setError('资产数据加载失败'); }
  };
  useEffect(() => {
    Promise.all([api.get<Asset[]>('/assets'), api.get<Category[]>('/metadata/categories', { params: { domain: 'asset' } }), api.get('/analytics/assets')])
      .then(([a, c, m]) => { setAssets(a.data); setCategories(c.data); setAnalytics(m.data); })
      .catch(() => setError('资产数据加载失败'));
  }, []);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return assets
      .filter((item) =>
        (role === 'all' || item.household_role === role)
        && (category === 'all' || item.category_id === Number(category))
        && (status === 'all' || item.status === status)
        && (!keyword || [item.name, item.category_name, item.channel, item.note ?? ''].some((value) => value.toLocaleLowerCase().includes(keyword))))
      .sort((a, b) => {
        const left = a[sortBy];
        const right = b[sortBy];
        const comparison = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'zh-CN');
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [assets, role, category, status, query, sortBy, sortDirection]);
  const sort = (key: AssetSort) => {
    if (sortBy === key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDirection('asc'); }
  };
  const sortable = (key: AssetSort, label: string) => (
    <TableSortLabel active={sortBy === key} direction={sortBy === key ? sortDirection : 'asc'} onClick={() => sort(key)}>{label}</TableSortLabel>
  );
  const startAdd = () => { setEditing(null); setForm({ ...emptyForm, category_id: categories[0]?.id ?? 0, household_role: settings.default_role }); setOpen(true); };
  const startEdit = (item: Asset) => { setEditing(item); setForm({ name: item.name, category_id: item.category_id, channel: item.channel, household_role: item.household_role, current_value: (item.current_value_cents / 100).toFixed(2), valuation_date: item.valuation_date, note: item.note ?? '' }); setOpen(true); };
  const save = async () => {
    const payload = { name: form.name, category_id: form.category_id, channel: form.channel, household_role: form.household_role, current_value_cents: Math.round(Number(form.current_value) * 100), valuation_date: form.valuation_date, note: form.note || null };
    try {
      if (editing) await api.patch(`/assets/${editing.id}`, payload); else await api.post('/assets', payload);
      setOpen(false); await load();
    } catch { setError('保存失败，请检查名称、分类、渠道和金额'); }
  };
  const remove = async (item: Asset) => {
    if (!window.confirm(`确认删除“${item.name}”及其全部历史快照吗？`)) return;
    await api.delete(`/assets/${item.id}`); await load();
  };
  return (
    <Box>
      <PageHeader title="家庭资产" subtitle="按渠道和家庭角色维护资产现值，每月更新一次快照即可。"
        actions={<Button variant="contained" startIcon={<AddRounded />} onClick={startAdd}>新增资产</Button>} />
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={1.8} sx={{ mb: 2.2 }}>
        <Grid size={{ xs: 12, md: 4 }}><MetricCard label="家庭总资产" value={money(analytics.total_assets_cents)} hint="所有未删除资产的最新现值" icon={<SavingsOutlined />} /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><MetricCard label="本月资产变化" value={money(analytics.monthly_change_cents)} hint="对比每项资产上个自然月末的基准值" icon={<TrendingUpOutlined />} tone={analytics.monthly_change_cents >= 0 ? 'green' : 'orange'} /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><MetricCard label="月末快照完整度" value={`${Math.round(analytics.snapshot_completeness * 100)}%`} hint={`${analytics.updated_assets} / ${analytics.total_assets} 项已更新`} icon={<EventAvailableOutlined />} tone="violet" /></Grid>
      </Grid>
      <Paper variant="outlined" sx={{ borderColor: '#E5EAF1', overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.2} sx={{ p: 2, borderBottom: '1px solid #E9EDF2' }}>
          <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索名称、渠道或备注" sx={{ minWidth: { sm: 220 } }} />
          <Select size="small" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 140 }}><MenuItem value="all">全部家庭角色</MenuItem><MenuItem value="husband">{roleLabels.husband}</MenuItem><MenuItem value="wife">{roleLabels.wife}</MenuItem><MenuItem value="shared">{roleLabels.shared}</MenuItem></Select>
          <Select size="small" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="all">全部资产分类</MenuItem>{categories.map((item) => <MenuItem key={item.id} value={String(item.id)}>{item.name}</MenuItem>)}</Select>
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="all">全部状态</MenuItem><MenuItem value="current">本月已更新</MenuItem><MenuItem value="stale">待更新</MenuItem></Select>
        </Stack>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead><TableRow><TableCell>{sortable('name', '资产名称')}</TableCell><TableCell>{sortable('category_name', '分类')}</TableCell><TableCell>{sortable('channel', '渠道')}</TableCell><TableCell>家庭角色</TableCell><TableCell align="right">{sortable('current_value_cents', '当前价值')}</TableCell><TableCell align="right">{sortable('monthly_change_cents', '月度变化')}</TableCell><TableCell>{sortable('valuation_date', '估值日期')}</TableCell><TableCell>{sortable('status', '状态')}</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
            <TableBody>{filtered.map((item) => <TableRow key={item.id} hover>
              <TableCell><Typography variant="body2" fontWeight={700}>{item.name}</Typography></TableCell><TableCell>{item.category_name}</TableCell><TableCell>{item.channel}</TableCell><TableCell><RoleChip role={item.household_role} /></TableCell>
              <TableCell align="right" sx={{ fontWeight: 750 }}>{money(item.current_value_cents)}</TableCell><TableCell align="right" sx={{ color: item.monthly_change_cents >= 0 ? 'success.main' : 'error.main' }}>{item.monthly_change_cents === 0 ? '—' : `${item.monthly_change_cents > 0 ? '+' : ''}${money(item.monthly_change_cents)}`}</TableCell><TableCell>{item.valuation_date}</TableCell><TableCell><Typography variant="caption" fontWeight={700} color={item.status === 'current' ? 'success.main' : 'warning.main'}>{item.status === 'current' ? '本月已更新' : '待更新'}</Typography></TableCell>
              <TableCell align="right"><Tooltip title="编辑"><IconButton size="small" onClick={() => startEdit(item)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="删除"><IconButton size="small" color="error" onClick={() => void remove(item)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        {!filtered.length && <EmptyState title="没有符合条件的资产" description="新增资产时只需要填写当前价值，不需要估算成本。" />}
      </Paper>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '编辑资产' : '新增资产'}</DialogTitle>
        <DialogContent><Grid container spacing={2} sx={{ mt: .2 }}>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="资产名称" fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：招商银行定期" /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="渠道" fullWidth value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="银行、支付宝、京东金融等" /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField select label="资产分类" fullWidth value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField select label="家庭角色" fullWidth value={form.household_role} onChange={(e) => setForm({ ...form, household_role: e.target.value as Role })}><MenuItem value="shared">{roleLabels.shared}</MenuItem><MenuItem value="husband">{roleLabels.husband}</MenuItem><MenuItem value="wife">{roleLabels.wife}</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="当前价值（元）" type="number" fullWidth value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="估值日期" type="date" fullWidth value={form.valuation_date} onChange={(e) => setForm({ ...form, valuation_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12 }}><TextField label="备注（可选）" fullWidth multiline minRows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Grid>
        </Grid></DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>取消</Button><Button variant="contained" disabled={!form.name || !form.channel || !form.category_id || !form.current_value} onClick={() => void save()}>保存</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
