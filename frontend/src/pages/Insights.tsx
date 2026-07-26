import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { ArrowForwardRounded, AutoAwesomeOutlined, ChatBubbleOutlineRounded, CheckCircleOutlineRounded, InfoOutlined, WarningAmberRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api, sendChatMessageStream } from '../api';
import { EmptyState, PageHeader } from '../components/FinanceUI';

interface Insight { severity: 'positive' | 'neutral' | 'warning'; title: string; summary: string; evidence: string; source: string; link: string; }
const currentMonth = new Date().toISOString().slice(0, 7);

export default function Insights() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Insight[]>([]);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/insights', { params: { month } }).then((r) => setItems(r.data.items)).catch(() => setError('洞察加载失败')); }, [month]);
  const ask = async () => {
    setBusy(true); setAnswer('');
    try {
      const response = await sendChatMessageStream(question, []);
      if (!response.ok) throw new Error(await response.text());
      const reader = response.body?.getReader(); const decoder = new TextDecoder();
      if (!reader) return;
      let text = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); setAnswer(text); }
    } catch { setAnswer('暂时无法回答。请检查设置中的 LLM 配置。'); }
    finally { setBusy(false); }
  };
  const icon = (severity: Insight['severity']) => severity === 'warning' ? <WarningAmberRounded /> : severity === 'positive' ? <CheckCircleOutlineRounded /> : <InfoOutlined />;
  return (
    <Box>
      <PageHeader title="家庭财务洞察" subtitle="只展示可行动的发现，不重复前面看板中的图表和明细表。"
        actions={<Stack direction="row" gap={1}><Select size="small" value={month} onChange={(e) => setMonth(e.target.value)} sx={{ bgcolor: '#fff' }}><MenuItem value={currentMonth}>{currentMonth.replace('-', ' 年 ')} 月</MenuItem></Select><Button variant="contained" startIcon={<ChatBubbleOutlineRounded />} onClick={() => setChatOpen(true)}>继续追问</Button></Stack>} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Alert icon={<AutoAwesomeOutlined />} severity="info" sx={{ mb: 2.2 }}>洞察先由确定性规则计算，再将有限的汇总数据提供给模型解释；不会生成投资建议或预测。</Alert>
      <Stack gap={1.5}>
        {items.map((item) => <Card key={item.title} variant="outlined" sx={{ borderColor: '#E4E9F0', borderLeft: `4px solid ${item.severity === 'warning' ? '#E6A23C' : item.severity === 'positive' ? '#3BA272' : '#4D80D8'}` }}>
          <CardContent sx={{ p: '20px !important' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
            <Stack direction="row" gap={1.5} alignItems="flex-start"><Box sx={{ color: item.severity === 'warning' ? 'warning.main' : item.severity === 'positive' ? 'success.main' : 'primary.main', mt: .2 }}>{icon(item.severity)}</Box><Box><Typography fontWeight={800}>{item.title}</Typography><Typography sx={{ mt: .6 }}>{item.summary}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 1.3 }}><Chip size="small" label={item.evidence} sx={{ bgcolor: '#F4F6F9' }} /><Chip size="small" variant="outlined" label={`来源：${item.source}`} /></Stack></Box></Stack>
            <Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => navigate(item.link)} sx={{ alignSelf: { sm: 'center' }, whiteSpace: 'nowrap' }}>查看依据</Button>
          </Stack></CardContent>
        </Card>)}
        {!items.length && !error && <EmptyState title="暂时没有需要关注的洞察" description="随着资产快照和收支流水增加，这里会给出有依据的变化说明。" />}
      </Stack>
      <Dialog open={chatOpen} onClose={() => setChatOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>基于家庭数据继续追问</DialogTitle>
        <DialogContent><Alert severity="info" sx={{ mb: 2 }}>模型只会读取家庭账本的有限字段与汇总结果，不会提供投资预测。</Alert><TextField fullWidth multiline minRows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="例如：这个月支出增加主要来自哪些已确认分类？" />{(answer || busy) && <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: '#F7F9FC', whiteSpace: 'pre-wrap' }}><Typography variant="body2">{busy && !answer ? '正在分析…' : answer}</Typography></Box>}</DialogContent>
        <DialogActions><Button onClick={() => setChatOpen(false)}>关闭</Button><Button variant="contained" disabled={!question.trim() || busy} onClick={() => void ask()}>发送</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
