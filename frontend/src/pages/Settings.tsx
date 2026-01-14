import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Alert, Snackbar } from '@mui/material';
import { Settings as SettingsIcon, Save, Api, AccountBalance } from '@mui/icons-material';
import { getSettings, updateSettings } from '../api';
import { colors } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

export default function SettingsPage() {
    const { t } = useLanguage();
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
            setMsg({ type: 'success', text: t('settings.saved') });
        } catch (error) {
            console.error(error);
            setMsg({ type: 'error', text: t('settings.save_fail') });
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
                    {t('settings.title')}
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
                            {t('settings.llm_config')}
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
                            helperText={t('settings.api_key_helper')}
                            variant="outlined"
                        />
                        <TextField
                            label="Base URL"
                            name="base_url"
                            value={settings.base_url}
                            onChange={handleChange}
                            fullWidth
                            helperText={t('settings.base_url_helper')}
                            placeholder="https://openrouter.ai/api/v1"
                        />
                        <TextField
                            label={t('settings.model_name') || "模型名称"}
                            name="model_name"
                            value={settings.model_name}
                            onChange={handleChange}
                            fullWidth
                            helperText={t('settings.model_name_helper')}
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
                            {t('settings.finance_bg')}
                        </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
                        {t('settings.finance_bg_helper')}
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField
                            label={t('settings.monthly_income')}
                            name="monthly_income"
                            type="number"
                            value={settings.monthly_income}
                            onChange={handleChange}
                            fullWidth
                            InputProps={{ inputProps: { min: 0, step: 100 } }}
                            placeholder="10000"
                        />
                        <TextField
                            label={t('settings.investments')}
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
                        {saving ? t('settings.saving') : t('settings.save')}
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
