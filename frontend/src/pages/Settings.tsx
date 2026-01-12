import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Alert, Snackbar } from '@mui/material';
import { getSettings, updateSettings } from '../api';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        api_key: '',
        base_url: '',
        model_name: '',
        monthly_income: '',
        investments: ''
    });
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const loadSettings = async () => {
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

    useEffect(() => {
        loadSettings();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            // Pass settings directly - backend handles string conversion
            await updateSettings(settings);
            setMsg({ type: 'success', text: '配置已保存！' });
        } catch (error) {
            console.error(error);
            setMsg({ type: 'error', text: '保存失败，请检查输入格式。' });
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>系统设置</Typography>

            <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>LLM API 配置</Typography>
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
                />
                <TextField
                    label="模型名称 (Model Name)"
                    name="model_name"
                    value={settings.model_name}
                    onChange={handleChange}
                    fullWidth
                    helperText="例如: qwen/qwen3-next-80b-a3b-instruct"
                />

                <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold', mt: 2 }}>财务背景 (可选)</Typography>
                <TextField
                    label="月收入 (¥)"
                    name="monthly_income"
                    type="number"
                    value={settings.monthly_income}
                    onChange={handleChange}
                    fullWidth
                    InputProps={{ inputProps: { min: 0 } }}
                />
                <TextField
                    label="当前投资总额 (¥)"
                    name="investments"
                    type="number"
                    value={settings.investments}
                    onChange={handleChange}
                    fullWidth
                    InputProps={{ inputProps: { min: 0 } }}
                />

                <Button variant="contained" size="large" onClick={handleSave} sx={{ mt: 2, py: 1.5 }}>
                    保存配置
                </Button>
            </Box>

            <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg(null)}>
                <Alert onClose={() => setMsg(null)} severity={msg?.type || 'info'} sx={{ width: '100%' }}>
                    {msg?.text}
                </Alert>
            </Snackbar>
        </Paper>
    );
}
