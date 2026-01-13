import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Alert, Snackbar } from '@mui/material';
import { Settings as SettingsIcon, Save, Api, AccountBalance } from '@mui/icons-material';
import { getSettings, updateSettings } from '../api';
import { colors } from '../theme';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        api_key: '',
        base_url: '',
        model_name: '',
        monthly_income: '',
        investments: ''
    });
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await getSettings();
                setSettings({
                    api_key: data.api_key || '',
                    base_url: data.base_url || '',
                    model_name: data.model_name || '',
                    monthly_income: data.monthly_income || '',
                    investments: data.investments || ''
                });
            } catch (error) {
                console.error(error);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Convert empty strings to null for numeric fields to satisfy Pydantic schema
            const payload = {
                ...settings,
                monthly_income: settings.monthly_income === '' ? null : Number(settings.monthly_income),
                investments: settings.investments === '' ? null : Number(settings.investments)
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await updateSettings(payload as any);
            setMsg({ type: 'success', text: '配置已保存！' });
        } catch (error) {
            console.error(error);
            setMsg({ type: 'error', text: '保存失败，请检查输入格式。' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                <SettingsIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>
                    系统设置
                </Typography>
            </Box>

            <Box sx={{ maxWidth: 700 }}>
                {/* LLM API Configuration Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 4,
                        mb: 3,
                        border: `1px solid ${colors.border.main}`,
                        borderRadius: 4,
                        transition: 'box-shadow 200ms ease-in-out',
                        '&:hover': {
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                        }
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                        <Api sx={{ fontSize: 28, color: 'primary.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            LLM API 配置
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField
                            label="API Key"
                            name="api_key"
                            type="password"
                            value={settings.api_key}
                            onChange={handleChange}
                            fullWidth
                            helperText="请输入您的 LLM 提供商 API 密钥"
                            variant="outlined"
                        />
                        <TextField
                            label="Base URL"
                            name="base_url"
                            value={settings.base_url}
                            onChange={handleChange}
                            fullWidth
                            helperText="例如: https://openrouter.ai/api/v1"
                            placeholder="https://openrouter.ai/api/v1"
                        />
                        <TextField
                            label="模型名称"
                            name="model_name"
                            value={settings.model_name}
                            onChange={handleChange}
                            fullWidth
                            helperText="例如: qwen/qwen3-next-80b-a3b-instruct"
                            placeholder="qwen/qwen3-next-80b-a3b-instruct"
                        />
                    </Box>
                </Paper>

                {/* Financial Background Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 4,
                        border: `1px solid ${colors.border.main}`,
                        borderRadius: 4,
                        transition: 'box-shadow 200ms ease-in-out',
                        '&:hover': {
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                        }
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <AccountBalance sx={{ fontSize: 28, color: 'primary.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            财务背景
                        </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
                        可选信息，帮助 AI 提供更个性化的财务建议
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField
                            label="月收入 (¥)"
                            name="monthly_income"
                            type="number"
                            value={settings.monthly_income}
                            onChange={handleChange}
                            fullWidth
                            InputProps={{ inputProps: { min: 0, step: 100 } }}
                            placeholder="10000"
                        />
                        <TextField
                            label="当前投资总额 (¥)"
                            name="investments"
                            type="number"
                            value={settings.investments}
                            onChange={handleChange}
                            fullWidth
                            InputProps={{ inputProps: { min: 0, step: 1000 } }}
                            placeholder="50000"
                        />
                    </Box>
                </Paper>

                {/* Save Button */}
                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={<Save />}
                        onClick={handleSave}
                        disabled={saving}
                        sx={{
                            px: 4,
                            py: 1.5,
                            cursor: 'pointer',
                            minWidth: 140,
                        }}
                    >
                        {saving ? '保存中...' : '保存配置'}
                    </Button>
                </Box>
            </Box>

            {/* Success/Error Notification */}
            <Snackbar
                open={!!msg}
                autoHideDuration={4000}
                onClose={() => setMsg(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={() => setMsg(null)}
                    severity={msg?.type || 'info'}
                    variant="filled"
                    sx={{ width: '100%', borderRadius: 2 }}
                >
                    {msg?.text}
                </Alert>
            </Snackbar>
        </Box>
    );
}
