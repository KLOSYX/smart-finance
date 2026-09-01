import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  ArrowForwardRounded, AutoAwesomeOutlined, CheckCircleOutlineRounded, DeleteOutlineRounded,
  InfoOutlined, InsightsOutlined, NorthRounded, PersonOutlineRounded, SmartToyOutlined,
  StopCircleOutlined, WarningAmberRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, sendChatMessageStream } from '../api';
import { EmptyState, PageHeader } from '../components/FinanceUI';
import ExpenseReconciliation from '../components/ExpenseReconciliation';

interface Insight {
  severity: 'positive' | 'neutral' | 'warning';
  title: string;
  summary: string;
  evidence: string;
  source: string;
  link: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
}

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const CHAT_STORAGE_KEY = 'smart-finance-insights-chat-v1';
const starterQuestions = [
  '这个月支出增加主要来自哪些分类？',
  '有哪些异常或值得复核的收支？',
  '结合现有数据，我接下来最该关注什么？',
];

function loadMessages(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.role && typeof item?.content === 'string')
      : [];
  } catch {
    return [];
  }
}

function stripToolEvents(text: string) {
  let status = '';
  const content = text
    .replace(/^>\s*调用工具:\s*(.+)$/gm, (_, tool: string) => {
      status = `正在查询 ${tool.trim()}…`;
      return '';
    })
    .replace(/^>\s*工具完成:\s*(.+)$/gm, () => {
      status = '';
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
  return { content, status };
}

export default function Insights() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Insight[]>([]);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setError('');
    api.get('/insights', { params: { month } })
      .then((response) => setItems(response.data.items))
      .catch(() => setError('洞察加载失败'));
  }, [month]);

  useEffect(() => {
    localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(messages.filter((message) => !message.pending && !message.error)),
    );
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const history = useMemo(
    () => messages
      .filter((message) => !message.pending && !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const ask = async (override?: string) => {
    const prompt = (override ?? question).trim();
    if (!prompt || busy) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      pending: true,
    };
    const requestHistory = history;

    setQuestion('');
    setBusy(true);
    setToolStatus('正在阅读家庭账本…');
    setMessages((current) => [...current, userMessage, assistantMessage]);
    abortRef.current = new AbortController();

    try {
      const response = await sendChatMessageStream(prompt, requestHistory, abortRef.current.signal);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'AI 服务暂时不可用');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取 AI 回复');

      const decoder = new TextDecoder();
      let rawText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawText += decoder.decode(value, { stream: true });
        const parsed = stripToolEvents(rawText);
        setToolStatus(parsed.status);
        setMessages((current) => current.map((message) => (
          message.id === assistantId ? { ...message, content: parsed.content } : message
        )));
      }
      rawText += decoder.decode();
      const parsed = stripToolEvents(rawText);
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, content: parsed.content || '没有收到有效回复。', pending: false }
          : message
      )));
    } catch (requestError) {
      const aborted = requestError instanceof DOMException && requestError.name === 'AbortError';
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? {
            ...message,
            content: aborted
              ? (message.content || '已停止生成。')
              : (requestError instanceof Error ? requestError.message : '暂时无法回答，请检查 LLM 配置。'),
            pending: false,
            error: !aborted,
          }
          : message
      )));
    } finally {
      abortRef.current = null;
      setBusy(false);
      setToolStatus('');
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setQuestion('');
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const askAboutInsight = (item: Insight) => {
    setQuestion(
      `请围绕 ${month} 的这条洞察继续分析：\n「${item.title}」\n${item.summary}\n依据：${item.evidence}\n请解释可能原因，并告诉我应该进一步核对哪些账目。`,
    );
  };

  const icon = (severity: Insight['severity']) => (
    severity === 'warning' ? <WarningAmberRounded />
      : severity === 'positive' ? <CheckCircleOutlineRounded />
        : <InfoOutlined />
  );

  return (
    <Box>
      <PageHeader
        title="家庭财务洞察"
        subtitle="从确定性发现出发，与 AI 一起追问原因、核对证据并找到下一步。"
        actions={(
          <TextField
            label="洞察月份"
            type="month"
            size="small"
            value={month}
            onChange={(event) => { if (event.target.value) setMonth(event.target.value); }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ bgcolor: '#fff', minWidth: 136 }}
          />
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ mb: 2 }}><ExpenseReconciliation month={month} /></Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(380px, .82fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Stack gap={1.5}>
          <Alert icon={<InsightsOutlined />} severity="info">
            洞察由规则从账本中计算，AI 只负责解释和追问；回答仅用于家庭财务复盘。
          </Alert>

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 0.5 }}>
            <Box>
              <Typography fontWeight={800}>本月值得关注</Typography>
              <Typography variant="caption" color="text.secondary">每条结论都附有可回到账本核对的依据</Typography>
            </Box>
            {!!items.length && <Chip size="small" label={`${items.length} 条发现`} />}
          </Stack>

          {items.map((item) => (
            <Card
              key={item.title}
              variant="outlined"
              sx={{
                borderColor: '#E4E9F0',
                borderLeft: `4px solid ${
                  item.severity === 'warning' ? '#E6A23C'
                    : item.severity === 'positive' ? '#3BA272' : '#4D80D8'
                }`,
              }}
            >
              <CardContent sx={{ p: '20px !important' }}>
                <Stack gap={1.7}>
                  <Stack direction="row" gap={1.5} alignItems="flex-start">
                    <Box
                      sx={{
                        color: item.severity === 'warning' ? 'warning.main'
                          : item.severity === 'positive' ? 'success.main' : 'primary.main',
                        mt: 0.2,
                      }}
                    >
                      {icon(item.severity)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={800}>{item.title}</Typography>
                      <Typography sx={{ mt: 0.6 }}>{item.summary}</Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 1.3 }}>
                        <Chip size="small" label={item.evidence} sx={{ bgcolor: '#F4F6F9' }} />
                        <Chip size="small" variant="outlined" label={`来源：${item.source}`} />
                      </Stack>
                    </Box>
                  </Stack>
                  <Stack direction="row" gap={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => askAboutInsight(item)} startIcon={<AutoAwesomeOutlined />}>
                      询问 AI
                    </Button>
                    <Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => navigate(item.link)}>
                      查看依据
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}

          {!items.length && !error && (
            <Card variant="outlined">
              <EmptyState
                title="暂时没有需要关注的洞察"
                description="你仍然可以在右侧询问 AI，让它基于现有账本进行复盘。"
              />
            </Card>
          )}
        </Stack>

        <Card
          variant="outlined"
          sx={{
            position: { lg: 'sticky' },
            top: { lg: 82 },
            height: { xs: 620, lg: 'calc(100vh - 116px)' },
            minHeight: 560,
            overflow: 'hidden',
            borderColor: '#DDE5F0',
            boxShadow: '0 10px 30px rgba(31,65,115,.07)',
          }}
        >
          <Stack sx={{ height: '100%' }}>
            <Stack
              direction="row"
              alignItems="center"
              gap={1.2}
              sx={{ px: 2, py: 1.6, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}>
                <SmartToyOutlined fontSize="small" />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={0.8}>
                  <Typography fontWeight={800}>AI 财务助手</Typography>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: busy ? 'warning.main' : 'success.main' }} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {busy ? (toolStatus || '正在组织回答…') : `已连接家庭账本 · ${month}`}
                </Typography>
              </Box>
              <Tooltip title="清空对话">
                <span>
                  <IconButton aria-label="清空对话" size="small" onClick={clearChat} disabled={!messages.length}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>

            <Box
              aria-live="polite"
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                px: { xs: 1.5, sm: 2 },
                py: 2,
                bgcolor: '#FAFBFD',
              }}
            >
              {!messages.length ? (
                <Stack alignItems="center" textAlign="center" sx={{ maxWidth: 360, mx: 'auto', pt: 5 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: '#EAF2FF', color: 'primary.main', mb: 1.5 }}>
                    <AutoAwesomeOutlined />
                  </Avatar>
                  <Typography fontWeight={800}>从你的家庭数据开始</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                    我可以结合资产与收支记录解释变化。回答会引用账本数据，但不做投资预测。
                  </Typography>
                  <Stack gap={1} sx={{ width: '100%', mt: 2.5 }}>
                    {starterQuestions.map((starter) => (
                      <Button
                        key={starter}
                        variant="outlined"
                        color="inherit"
                        onClick={() => void ask(starter)}
                        sx={{ justifyContent: 'flex-start', textAlign: 'left', bgcolor: '#fff', borderColor: '#E3E8EF' }}
                      >
                        {starter}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              ) : (
                <Stack gap={2}>
                  {messages.map((message) => (
                    <Stack
                      key={message.id}
                      direction={message.role === 'user' ? 'row-reverse' : 'row'}
                      alignItems="flex-start"
                      gap={1}
                    >
                      <Avatar
                        sx={{
                          width: 30,
                          height: 30,
                          bgcolor: message.role === 'user' ? '#EDF1F6' : 'primary.main',
                          color: message.role === 'user' ? 'text.secondary' : '#fff',
                        }}
                      >
                        {message.role === 'user'
                          ? <PersonOutlineRounded sx={{ fontSize: 18 }} />
                          : <SmartToyOutlined sx={{ fontSize: 18 }} />}
                      </Avatar>
                      <Box
                        sx={{
                          maxWidth: '82%',
                          px: 1.5,
                          py: 1.1,
                          borderRadius: message.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                          bgcolor: message.role === 'user' ? 'primary.main' : '#fff',
                          color: message.role === 'user' ? '#fff' : 'text.primary',
                          border: message.role === 'assistant' ? '1px solid #E5EAF1' : 'none',
                          boxShadow: message.role === 'assistant' ? '0 2px 7px rgba(25,42,70,.035)' : 'none',
                          wordBreak: 'break-word',
                          '& p': { m: 0, '& + p': { mt: 1 } },
                          '& ul, & ol': { my: 0.7, pl: 2.5 },
                          '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
                          '& th, & td': { border: '1px solid #E1E6ED', px: 1, py: 0.6, textAlign: 'left' },
                        }}
                      >
                        {message.content ? (
                          message.role === 'assistant'
                            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            : <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'inherit' }}>{message.content}</Typography>
                        ) : (
                          <Stack direction="row" alignItems="center" gap={1} sx={{ py: 0.2 }}>
                            <CircularProgress size={14} />
                            <Typography variant="body2" color="text.secondary">
                              {toolStatus || '正在思考…'}
                            </Typography>
                          </Stack>
                        )}
                        {message.error && (
                          <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.7 }}>
                            本次请求未完成，你可以检查设置后重试。
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  ))}
                  <div ref={messageEndRef} />
                </Stack>
              )}
            </Box>

            <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={5}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                placeholder="追问本月变化，或点击左侧洞察带入上下文…"
                disabled={busy}
                slotProps={{
                  input: {
                    endAdornment: busy ? (
                      <Tooltip title="停止生成">
                        <IconButton aria-label="停止生成" onClick={() => abortRef.current?.abort()} edge="end">
                          <StopCircleOutlined color="error" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="发送">
                        <span>
                          <IconButton
                            aria-label="发送消息"
                            onClick={() => void ask()}
                            disabled={!question.trim()}
                            edge="end"
                            sx={{ bgcolor: question.trim() ? 'primary.main' : 'action.disabledBackground', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }}
                          >
                            <NorthRounded fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ),
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.7, px: 0.4 }}>
                Enter 发送 · Shift + Enter 换行 · AI 可能出错，重要结论请查看原始账目
              </Typography>
            </Box>
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
