import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, FormControlLabel, Grid, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { AddRounded, CloudDownloadOutlined, DeleteForeverOutlined, LockOutlined, SaveOutlined } from '@mui/icons-material';
import { api, type Category, type Domain, type Role } from '../api';
import { PageHeader } from '../components/FinanceUI';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';

export default function Settings() {
  const { settings, setSettings } = useHouseholdSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState({ domain: 'expense' as Domain, name: '' });
  const [message, setMessage] = useState('');
  const load = async () => { const c = await api.get<Category[]>('/metadata/categories'); setCategories(c.data); };
  useEffect(() => {
    api.get<Category[]>('/metadata/categories').then((response) => setCategories(response.data));
  }, []);
  const save = async () => { await api.put('/settings', settings); setMessage('设置已保存'); };
  const addCategory = async () => { if (!newCategory.name.trim()) return; await api.post('/metadata/categories', newCategory); setNewCategory({ ...newCategory, name: '' }); await load(); };
  const labels: Record<Domain, string> = { asset: '资产分类', income: '收入分类', expense: '支出分类' };
  return (
    <Box>
      <PageHeader title="设置" subtitle="管理家庭角色、分类、智能识别与本地数据。界面固定使用简体中文。" actions={<Button variant="contained" startIcon={<SaveOutlined />} onClick={() => void save()}>保存设置</Button>} />
      {message && <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack gap={2}>
            <Card variant="outlined"><CardContent><Typography fontWeight={800} sx={{ mb: .5 }}>家庭角色</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>账本只区分丈夫、妻子和家庭共享，不建立个人账户。</Typography><Grid container spacing={2}><Grid size={{ xs: 12, sm: 6 }}><TextField label="丈夫显示名称" fullWidth value={settings.husband_name} onChange={(e) => setSettings({ ...settings, husband_name: e.target.value })} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField label="妻子显示名称" fullWidth value={settings.wife_name} onChange={(e) => setSettings({ ...settings, wife_name: e.target.value })} /></Grid><Grid size={{ xs: 12 }}><TextField select label="默认家庭角色" fullWidth value={settings.default_role} onChange={(e) => setSettings({ ...settings, default_role: e.target.value as Role })}><MenuItem value="shared">家庭共享</MenuItem><MenuItem value="husband">{settings.husband_name || '丈夫'}</MenuItem><MenuItem value="wife">{settings.wife_name || '妻子'}</MenuItem></TextField></Grid></Grid></CardContent></Card>
            <Card variant="outlined"><CardContent><Typography fontWeight={800}>自定义分类</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>默认分类不可删除；自定义分类可以按资产、收入、支出分别增加。</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField select size="small" value={newCategory.domain} onChange={(e) => setNewCategory({ ...newCategory, domain: e.target.value as Domain })} sx={{ minWidth: 125 }}>{Object.entries(labels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField><TextField size="small" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="输入分类名称" fullWidth /><Button variant="outlined" startIcon={<AddRounded />} onClick={() => void addCategory()}>添加</Button></Stack><Divider sx={{ my: 2 }} />{(['asset', 'income', 'expense'] as Domain[]).map((domain) => <Box key={domain} sx={{ mb: 1.5 }}><Typography variant="caption" fontWeight={700}>{labels[domain]}</Typography><Stack direction="row" flexWrap="wrap" gap={.7} sx={{ mt: .7 }}>{categories.filter((item) => item.domain === domain).map((item) => <Chip key={item.id} size="small" label={item.name} variant={item.is_default ? 'filled' : 'outlined'} onDelete={!item.is_default ? async () => { await api.delete(`/metadata/categories/${item.id}`); await load(); } : undefined} />)}</Stack></Box>)}</CardContent></Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack gap={2}>
            <Card variant="outlined"><CardContent><Stack direction="row" gap={1} alignItems="center"><LockOutlined color="primary" /><Typography fontWeight={800}>LLM 与智能识别</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .7, mb: 2 }}>API Key 只保存在本地设置中。分类明确的结果自动入账；资产、收入或支出分类为“待复核”时才需要人工确认。</Typography><Stack gap={2}><TextField label="API Key" type="password" value={settings.api_key} onChange={(e) => setSettings({ ...settings, api_key: e.target.value })} /><TextField label="Base URL" value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} /><TextField label="模型名称" value={settings.model_name} onChange={(e) => setSettings({ ...settings, model_name: e.target.value })} helperText="图片识别需要支持视觉输入的多模态模型；默认使用 GPT-5.6 Luna。" /><FormControlLabel control={<Switch checked={settings.llm_extraction_enabled} onChange={(e) => setSettings({ ...settings, llm_extraction_enabled: e.target.checked })} />} label="启用文本、图片与 PDF 智能提取" /></Stack></CardContent></Card>
            <Card variant="outlined"><CardContent><Typography fontWeight={800}>数据与隐私</Typography><Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>数据默认保存在这台设备上。导出包含资产现值和收支流水，不包含 LLM API Key。</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button startIcon={<CloudDownloadOutlined />} variant="outlined" href="/api/data/export">导出 CSV 备份</Button><Button startIcon={<DeleteForeverOutlined />} color="error" variant="outlined" onClick={async () => { const value = window.prompt('危险操作：输入“清空全部数据”确认。'); if (value === '清空全部数据') { await api.delete('/data/reset', { params: { confirmation: value } }); setMessage('资产与收支数据已清空'); } }}>清空全部数据</Button></Stack></CardContent></Card>
            <Card variant="outlined"><CardContent><Typography fontWeight={800}>界面语言</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>简体中文（固定）</Typography></CardContent></Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
