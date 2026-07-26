import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined, PaidOutlined, SwapHorizRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage, type Category } from '../api';
import { smartSourceHash, type ImageAttachment } from '../smartEntryImages';
import { ImageAttachmentPicker } from './ImageAttachmentPicker';
import { CandidateReviewList, type Candidate } from './ReviewCenter';

export type ImportKind = 'cashflow' | 'asset' | 'mixed' | '';

interface OpenSmartEntryDetail {
  text?: string;
  instruction?: string;
  images?: ImageAttachment[];
  kind?: ImportKind;
}

const importKindLabels: Record<Exclude<ImportKind, ''>, string> = {
  cashflow: '收支流水',
  asset: '资产快照',
  mixed: '混合内容',
};

export default function SmartEntryDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [kind, setKind] = useState<ImportKind>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [importId, setImportId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [assetCount, setAssetCount] = useState(0);
  const [cashflowCount, setCashflowCount] = useState(0);
  const [cashflowMonth, setCashflowMonth] = useState('');

  const reset = (detail: OpenSmartEntryDetail = {}) => {
    setText(detail.text ?? '');
    setInstruction(detail.instruction ?? '');
    setImages(detail.images ?? []);
    setKind(detail.kind ?? '');
    setCandidates([]);
    setImportId(null);
    setError('');
    setSuccess('');
    setAssetCount(0);
    setCashflowCount(0);
    setCashflowMonth('');
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenSmartEntryDetail>).detail ?? {};
      reset(detail);
      setOpen(true);
      api.get<Category[]>('/metadata/categories').then((response) => setCategories(response.data))
        .catch(() => setError('分类数据加载失败，请稍后重试'));
    };
    window.addEventListener('open-smart-entry', handleOpen);
    return () => window.removeEventListener('open-smart-entry', handleOpen);
  }, []);

  const announceChange = () => {
    window.dispatchEvent(new CustomEvent('review-queue-changed'));
    window.dispatchEvent(new CustomEvent('finance-data-changed'));
  };

  const extract = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      let source;
      if (images.length) {
        source = {
          filename: images.length === 1 ? images[0].filename : `智能录入图片-${images.length}张`,
          content_sha256: await smartSourceHash(text, images),
          text,
          source_type: 'file',
        };
      } else {
        const preview = await api.post('/imports/text-preview', { text, filename: '智能录入文本' });
        source = preview.data;
      }
      const result = await api.post('/imports/extract', {
        ...source,
        import_kind: kind,
        instruction: instruction.trim() || null,
        images: images.map(({ filename, mime_type, data_url }) => ({ filename, mime_type, data_url })),
      });
      const pending = result.data.candidates.map((item: Candidate) => ({ ...item, include: true }));
      const assets = Number(result.data.auto_committed_assets ?? 0);
      const cashflows = Number(result.data.auto_committed_cashflows ?? 0);
      setImportId(result.data.import_id);
      setCandidates(pending);
      setAssetCount(assets);
      setCashflowCount(cashflows);
      setCashflowMonth(result.data.cashflow_months?.[0] ?? '');

      const destinations = [
        assets ? `资产快照 ${assets} 条` : '',
        cashflows ? `收支流水 ${cashflows} 条` : '',
      ].filter(Boolean);
      if (pending.length) {
        setSuccess(`${destinations.length ? `已自动入账：${destinations.join('；')}；` : ''}另有 ${pending.length} 条待复核`);
      } else {
        setSuccess(destinations.length ? `智能录入完成：${destinations.join('；')}` : '本次没有识别出可录入的数据');
      }
      announceChange();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason, '智能提取失败，请检查 LLM 设置'));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!importId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/imports/${importId}/commit`, {
        candidates: candidates.map((item) => ({
          id: item.id,
          candidate_type: item.candidate_type,
          payload: item.payload,
          include: item.include !== false,
        })),
      });
      setCandidates([]);
      setImportId(null);
      setSuccess('待复核记录已确认入账');
      announceChange();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason, '提交失败，请检查候选记录中的必填字段'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) setOpen(false);
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>智能录入</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {success && <Alert severity={candidates.length ? 'info' : 'success'}>{success}</Alert>}
          {!candidates.length && !success && (
            <>
              <Alert severity="warning">系统不会自动修改或隐藏原文。提交前请手动删除文字中的姓名、账号等隐私信息；图片也会原样发送，请在添加前自行检查。</Alert>
              <Box>
                <Typography fontWeight={800} sx={{ mb: 1 }}>本次录入内容（必选）</Typography>
                <ToggleButtonGroup exclusive fullWidth value={kind} onChange={(_event, value: ImportKind | null) => value && setKind(value)} aria-label="本次录入内容">
                  <ToggleButton value="asset"><Stack alignItems="center" gap={0.5}><AccountBalanceWalletOutlined /><Typography fontWeight={750}>资产快照</Typography></Stack></ToggleButton>
                  <ToggleButton value="cashflow"><Stack alignItems="center" gap={0.5}><PaidOutlined /><Typography fontWeight={750}>收支流水</Typography></Stack></ToggleButton>
                  <ToggleButton value="mixed"><Stack alignItems="center" gap={0.5}><SwapHorizRounded /><Typography fontWeight={750}>混合内容</Typography></Stack></ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <TextField label="录入指令（可选）" value={instruction} onChange={(event) => setInstruction(event.target.value)} multiline minRows={2} placeholder="例如：图片每一列对应一个月份；忽略表格最后一行合计" helperText="这里只写处理规则，指令中的示例不会被录入" />
              <TextField label="待识别文字（提交前手动检查隐私）" value={text} onChange={(event) => setText(event.target.value)} multiline minRows={6} placeholder="粘贴银行通知、理财 APP 摘要、聊天记录；也可以留空并上传图片" helperText="系统不会自动脱敏；请手动删除不希望发送给模型的信息" />
              <ImageAttachmentPicker images={images} setImages={setImages} onError={setError} />
            </>
          )}
          {candidates.length > 0 && <CandidateReviewList candidates={candidates} setCandidates={setCandidates} categories={categories} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {success && assetCount > 0 && <Button onClick={() => { setOpen(false); navigate('/assets'); }}>查看资产</Button>}
        {success && cashflowCount > 0 && <Button onClick={() => { setOpen(false); navigate(cashflowMonth ? `/cashflow?month=${cashflowMonth}` : '/cashflow'); }}>查看收支</Button>}
        <Button onClick={close}>{success ? '关闭' : '取消'}</Button>
        {!candidates.length && !success && (
          <Button variant="contained" disabled={busy || !kind || (!text.trim() && !images.length)} onClick={() => void extract()}>
            {busy ? '识别中…' : kind ? `开始识别 · ${importKindLabels[kind]}` : '请先选择录入内容'}
          </Button>
        )}
        {candidates.length > 0 && (
          <Button variant="contained" disabled={busy || !candidates.some((item) => item.include !== false)} onClick={() => void commit()}>
            {busy ? '提交中…' : '确认并入账'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
