import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Grid,
  LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material';
import { ExpandMoreRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api';
import { SectionCard } from './FinanceUI';

interface Reconciliation {
  month: string;
  opening_date: string;
  closing_date: string;
  status: 'unavailable' | 'estimated' | 'snapshots_ready';
  is_partial_month: boolean;
  opening_assets_cents: number | null;
  closing_assets_cents: number | null;
  asset_change_cents: number | null;
  income_cents: number;
  gross_expense_cents: number;
  refund_cents: number;
  recorded_expense_cents: number;
  inferred_expense_cents: number | null;
  gap_cents: number | null;
  record_count: number;
  asset_count: number;
  ready_asset_count: number;
  missing_opening_count: number;
  assets: Array<{
    asset_id: number; name: string; category: string; channel: string;
    opening_date: string | null; closing_date: string;
    opening_cents: number | null; closing_cents: number; change_cents: number | null;
    issues: string[];
  }>;
}

const issueLabels: Record<string, string> = {
  missing_opening: '缺少期初基准', stale_opening: '期初沿用旧快照',
  missing_closing_update: '本月尚未更新', stale_closing: '期末未更新至截止日',
};
const amount = (value: number | null) => value === null ? '—' : money(value);
const signedAmount = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${money(value)}`;

export default function ExpenseReconciliation({ month, refreshKey }: { month: string; refreshKey?: unknown }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Reconciliation | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let request = 0;
    const load = async () => {
      const current = ++request;
      setLoading(true);
      setError(false);
      try {
        const response = await api.get<Reconciliation>('/analytics/reconciliation', { params: { month } });
        if (active && current === request) setData(response.data);
      } catch {
        if (active && current === request) setError(true);
      } finally {
        if (active && current === request) setLoading(false);
      }
    };
    void load();
    window.addEventListener('finance-data-changed', load);
    window.addEventListener('review-queue-changed', load);
    return () => {
      active = false;
      window.removeEventListener('finance-data-changed', load);
      window.removeEventListener('review-queue-changed', load);
    };
  }, [month, refreshKey, retry]);

  const gap = data?.gap_cents;
  return (
    <SectionCard title="月度支出对账" subtitle={`${month} · 用资产变化交叉核对已记录收支，不自动补记流水`}
      action={<Button size="small" onClick={() => navigate('/assets')}>更新资产</Button>}>
      {loading ? <LinearProgress aria-label="正在计算支出对账" /> : error || !data || data.month !== month ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setRetry((value) => value + 1)}>重试</Button>}>支出对账加载失败，暂不显示旧结果。</Alert>
      ) : (
        <Stack gap={2}>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
            <Chip size="small" variant="outlined" sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} color={data.status === 'snapshots_ready' ? 'info' : 'warning'}
              label={data.status === 'unavailable' ? '暂无法推算' : data.status === 'estimated' ? '暂估 · 快照或月份未完整' : '两期快照齐全 · 仍需核对非消费变动'} />
            <Typography variant="caption" color="text.secondary">{data.opening_date} → {data.closing_date} · {data.ready_asset_count}/{data.asset_count} 项资产在两端日期均有快照</Typography>
          </Stack>
          {data.status === 'unavailable' ? (
            <Alert severity="info">
              {data.is_partial_month && data.closing_date < `${month}-01` ? '该月份尚未开始。' : !data.asset_count
                ? '还没有可用于本月对账的资产快照。请先录入上月末与本月末的资产余额。'
                : `${data.missing_opening_count} 项资产缺少上月末或更早的基准，暂不把缺失余额当作 0。请补录期初快照；只有确认当时期初余额为 0 时才填 0。`}
            </Alert>
          ) : (
            <>
              <Grid container spacing={2}>
                {[
                  { label: '资产推算支出', value: amount(data.inferred_expense_cents), hint: '期初资产 + 已记收入 − 期末资产' },
                  { label: '已记净支出', value: money(data.recorded_expense_cents), hint: `支出 ${money(data.gross_expense_cents)} − 退款 ${money(data.refund_cents)}` },
                  { label: '待解释差额', value: signedAmount(data.gap_cents), hint: '资产推算支出 − 已记净支出' },
                ].map((item) => (
                  <Grid key={item.label} size={{ xs: 12, sm: 4 }}>
                    <Box sx={{ p: 1.8, bgcolor: 'action.hover', borderRadius: 1.5, height: '100%' }}>
                      <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                      <Typography sx={{ my: 0.6, fontWeight: 800, fontSize: { xs: 23, md: 26 }, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{item.value}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.hint}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {amount(data.opening_assets_cents)}（期初） + {money(data.income_cents)}（收入） − {amount(data.closing_assets_cents)}（期末） = {amount(data.inferred_expense_cents)}
              </Typography>
              <Alert severity={gap === 0 ? 'info' : 'warning'}>
                {gap === 0 ? '当前记录与资产变化数值相符，但不代表流水一定完整，遗漏也可能相互抵消。'
                  : (gap ?? 0) > 0 ? '推算支出高于已记支出。可优先核对漏记支出、投资亏损、偿还旧债或转出到未纳入统计的账户。'
                    : '推算支出低于已记支出。可优先核对漏记收入、投资增值、新增借款、未还信用卡消费或重复入账。'}
                {data.is_partial_month && ' 本月尚未结束，仅比较截至今天的流水与可用快照。'}
                {data.status === 'estimated' && ' 非截止日快照会造成时间错位，请先展开明细核对。'}
              </Alert>
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            这是未校正的资产法估算，不是实际消费结论。当前没有负债余额与投资盈亏的独立记录；信用卡账单与还款跨月、公积金缴存、资产估值、漏记收入都会影响差额。仅统计当前未归档且在截止日前有记录的资产，删除或归档会影响历史口径。账户间转账不计收支，但仅在两端资产均纳入时才抵消。
          </Typography>
          <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography variant="body2" fontWeight={700}>排查差额：资产变化与快照明细（{data.asset_count} 项）</Typography></AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>按变动绝对值排序。这里显示余额变化，不能据此归因为消费或收益；新录入的资产也可能只是补登旧资产。</Typography>
              <TableContainer><Table size="small" sx={{ minWidth: 640 }} aria-label="支出对账资产快照明细">
                <TableHead><TableRow><TableCell>资产 / 渠道</TableCell><TableCell align="right">期初 / 快照日期</TableCell><TableCell align="right">期末 / 快照日期</TableCell><TableCell align="right">变化</TableCell><TableCell>数据状态</TableCell></TableRow></TableHead>
                <TableBody>{data.assets.map((asset) => (
                  <TableRow key={asset.asset_id}>
                    <TableCell>{asset.name}<Typography variant="caption" display="block" color="text.secondary">{asset.category} · {asset.channel}</Typography></TableCell>
                    <TableCell align="right">{amount(asset.opening_cents)}<Typography variant="caption" display="block">{asset.opening_date ?? '缺失'}</Typography></TableCell>
                    <TableCell align="right">{money(asset.closing_cents)}<Typography variant="caption" display="block">{asset.closing_date}</Typography></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{signedAmount(asset.change_cents)}</TableCell>
                    <TableCell>{asset.issues.length ? asset.issues.map((issue) => <Typography key={issue} variant="caption" display="block" color="warning.main">{issueLabels[issue] ?? issue}</Typography>) : '两期齐全'}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></TableContainer>
              <Typography variant="caption" display="block" sx={{ mt: 1.5 }}>本期共有 {data.record_count} 条已入账流水（含转账），金额按完整家庭账本计算，不受流水表的类型、分类或角色筛选影响。净退款月份保留负净支出。</Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate(`/cashflow?month=${month}`)}>核对本月流水</Button>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
    </SectionCard>
  );
}
