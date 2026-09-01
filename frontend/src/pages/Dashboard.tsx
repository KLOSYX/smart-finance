import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { AccountBalanceWalletOutlined, ArrowForwardRounded, AutoAwesomeOutlined, PaidOutlined, SavingsOutlined, TrendingUpOutlined, WarningAmberRounded } from '@mui/icons-material';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { api, money, shortMoney } from '../api';
import { EmptyState, MetricCard, PageHeader, SectionCard } from '../components/FinanceUI';
import ExpenseReconciliation from '../components/ExpenseReconciliation';

interface Overview {
  month: string;
  metrics: { total_assets_cents: number; income_cents: number; expense_cents: number; balance_cents: number };
  asset_trend: Array<{ month: string; value_cents: number }>;
  asset_structure: Array<{ name: string; value_cents: number }>;
  cashflow_trend: Array<{ month: string; income_cents: number; expense_cents: number; balance_cents: number }>;
  top_income: Array<{ name: string; value_cents: number }>;
  top_expense: Array<{ name: string; value_cents: number }>;
  attention: { stale_assets: Array<{ asset_id: number; name: string; valuation_date: string }>; pending_review_count: number };
}

const colors = ['#3976D8', '#56A5A7', '#8A71D6', '#E5A24B', '#67A76D', '#D97878'];
const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

export default function Dashboard() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.get<Overview>('/analytics/overview', { params: { month } })
      .then((response) => {
        setData(response.data);
        setError('');
      })
      .catch(() => setError('暂时无法加载家庭数据'));
    void load();
    window.addEventListener('finance-data-changed', load);
    return () => window.removeEventListener('finance-data-changed', load);
  }, [month]);
  const metrics = data?.metrics;
  return (
    <Box>
      <PageHeader title="家庭财务总览" subtitle="从资产、收入与支出三个角度，看清这个月的家庭财务状态。"
        actions={<Stack direction="row" gap={1}><Button variant="contained" startIcon={<AutoAwesomeOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('open-smart-entry'))}>智能录入</Button><TextField label="总览月份" type="month" size="small" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} /></Stack>} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={1.8}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="家庭总资产" value={money(metrics?.total_assets_cents ?? 0)} hint="以最新资产快照计算" icon={<AccountBalanceWalletOutlined />} loading={!data} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="本月收入" value={money(metrics?.income_cents ?? 0)} hint="不包含账户间转账" icon={<TrendingUpOutlined />} tone="green" loading={!data} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="本月支出" value={money(metrics?.expense_cents ?? 0)} hint="已扣除支出退款" icon={<PaidOutlined />} tone="orange" loading={!data} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard label="本月现金结余" value={money(metrics?.balance_cents ?? 0)} hint="收入减去净支出" icon={<SavingsOutlined />} tone="violet" loading={!data} /></Grid>
        <Grid size={{ xs: 12 }}><ExpenseReconciliation month={month} /></Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionCard title="家庭资产趋势" subtitle="最近 6 个月的月末资产快照" minHeight={330}>
            <ResponsiveContainer width="100%" height={245}>
              <AreaChart data={data?.asset_trend ?? []}><defs><linearGradient id="assetFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3976D8" stopOpacity=".24" /><stop offset="100%" stopColor="#3976D8" stopOpacity=".02" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F4" /><XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={shortMoney} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={72} /><Tooltip formatter={(value) => money(Number(value))} /><Area type="monotone" dataKey="value_cents" stroke="#3976D8" strokeWidth={2.5} fill="url(#assetFill)" /></AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="资产结构" subtitle="按资产类别汇总" action={<Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => navigate('/assets')}>查看明细</Button>} minHeight={330}>
            {data?.asset_structure.length ? <Stack direction="row" alignItems="center" gap={1}>
              <ResponsiveContainer width="46%" height={210}><PieChart><Pie data={data.asset_structure} dataKey="value_cents" nameKey="name" innerRadius={48} outerRadius={73} paddingAngle={2}>{data.asset_structure.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} /></PieChart></ResponsiveContainer>
              <Stack gap={1.1} flex={1}>{data.asset_structure.slice(0, 5).map((item, index) => <Box key={item.name}><Stack direction="row" justifyContent="space-between"><Typography variant="caption"><Box component="span" sx={{ display: 'inline-block', width: 7, height: 7, borderRadius: 9, bgcolor: colors[index % colors.length], mr: .8 }} />{item.name}</Typography><Typography variant="caption" fontWeight={700}>{shortMoney(item.value_cents)}</Typography></Stack></Box>)}</Stack>
            </Stack> : <EmptyState title="还没有资产数据" description="添加第一项资产后，这里会显示家庭资产结构。" />}
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionCard title="收入与支出趋势" subtitle="转账不计入收支">
            <ResponsiveContainer width="100%" height={235}><BarChart data={data?.cashflow_trend ?? []} barGap={3}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F4" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis tickFormatter={shortMoney} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={72} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="income_cents" name="收入" fill="#4FA37C" radius={[4, 4, 0, 0]} /><Bar dataKey="expense_cents" name="支出" fill="#E28A65" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="本月主要收支" subtitle="按分类显示金额较大的项目">
            <Typography variant="caption" fontWeight={700} color="success.main">收入 TOP</Typography>
            <Stack gap={1} sx={{ mt: 1, mb: 2 }}>{(data?.top_income ?? []).slice(0, 3).map((item) => <Stack key={item.name} direction="row" justifyContent="space-between"><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight={700}>{shortMoney(item.value_cents)}</Typography></Stack>)}{!data?.top_income.length && <Typography variant="caption" color="text.secondary">暂无收入</Typography>}</Stack>
            <Typography variant="caption" fontWeight={700} color="warning.main">支出 TOP</Typography>
            <Stack gap={1.2} sx={{ mt: 1 }}>{(data?.top_expense ?? []).slice(0, 3).map((item) => <Box key={item.name}><Stack direction="row" justifyContent="space-between"><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight={700}>{shortMoney(item.value_cents)}</Typography></Stack><LinearProgress variant="determinate" value={item.value_cents / Math.max(1, data?.top_expense[0]?.value_cents ?? 1) * 100} sx={{ mt: .5, height: 4, bgcolor: '#F2F3F5', '& .MuiLinearProgress-bar': { bgcolor: '#E28A65' } }} /></Box>)}</Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <SectionCard title="需要关注" subtitle="尚未更新或仍待人工确认的项目">
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.2}>
              <Chip icon={<WarningAmberRounded />} label={`${data?.attention.stale_assets.length ?? 0} 项资产快照待更新`} onClick={() => navigate('/assets?status=stale')} sx={{ justifyContent: 'flex-start', bgcolor: '#FFF7E9' }} />
              <Chip icon={<WarningAmberRounded />} label={`${data?.attention.pending_review_count ?? 0} 条智能录入待复核`} onClick={() => window.dispatchEvent(new CustomEvent('open-review-center'))} sx={{ justifyContent: 'flex-start', bgcolor: '#EEF4FF' }} />
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}
