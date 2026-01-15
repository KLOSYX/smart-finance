import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Card, CardContent, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Alert
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { TrendingUp, AccountBalance } from '@mui/icons-material';
import { getStats, getTransactions } from '../api';
import type { Transaction } from '../api';
import { colors } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

interface CategorySummary {
    Category: string;
    Amount: number;
    [key: string]: string | number;
}


interface CardSummary {
    CardLastFour: string;
    Amount: number;
    [key: string]: string | number;
}

interface Stats {
    total_expense: number;
    category_summary: CategorySummary[];
    card_summary: CardSummary[];
}

// Trust Blue color palette for charts
const CHART_COLORS = [
    colors.primary.main,
    colors.primary.light,
    colors.cta.main,
    colors.success.main,
    '#8B5CF6',
    '#EC4899',
    '#F59E0B',
    '#10B981',
];

export default function Dashboard() {
    const { t } = useLanguage();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    // Drill down state
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categoryTransactions, setCategoryTransactions] = useState<Transaction[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getStats();
                setStats(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const openDetails = async (category: string) => {
        setSelectedCategory(category);
        setOpenDialog(true);
        setLoadingDetails(true);
        try {
            const allTx = await getTransactions();
            const filtered = allTx.filter(t => t.category === category);
            setCategoryTransactions(filtered);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleItemClick = (_event: React.MouseEvent<SVGElement, MouseEvent>, itemIdentifier: { dataIndex?: number }) => {
        if (itemIdentifier && typeof itemIdentifier.dataIndex === 'number' && stats) {
            const category = stats.category_summary[itemIdentifier.dataIndex].Category;
            openDetails(category);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
                <CircularProgress size={60} thickness={4} />
                <Typography variant="body1" color="text.secondary">{t('common.loading')}</Typography>
            </Box>
        );
    }

    if (!stats || stats.category_summary.length === 0) {
        return (
            <Box sx={{ py: 8 }}>
                <Alert severity="info" sx={{ maxWidth: 600, mx: 'auto', borderRadius: 3 }}>
                    <Typography variant="h6" gutterBottom>{t('common.no_data')}</Typography>
                    <Typography variant="body2">
                        {t('common.no_data_helper')}
                    </Typography>
                </Alert>
            </Box>
        );
    }

    // Prepare data for charts
    // Abbreviate long category names for bar chart display
    const abbreviateCategory = (name: string): string => {
        const abbrevMap: Record<string, string> = {
            // English categories - use short forms
            'Entertainment': 'Entertain',
            'Food & Dining': 'Food',
            'Health & Fitness': 'Health',
            'Housing': 'Housing',
            'Other': 'Other',
            'Savings/Investments': 'Savings',
            'Shopping': 'Shopping',
            'Transportation': 'Transport',
            'Travel': 'Travel',
            'Utilities': 'Utilities',
            // Chinese categories
            '娱乐': '娱乐',
            '餐饮': '餐饮',
            '健康与健身': '健康',
            '住房': '住房',
            '其他': '其他',
            '储蓄/投资': '储蓄',
            '购物': '购物',
            '交通': '交通',
            '旅行': '旅行',
            '水电煤': '水电煤',
            '需要复核': '待核',
        };
        return abbrevMap[name] || (name.length > 10 ? name.slice(0, 9) + '…' : name);
    };

    const barChartData = stats.category_summary.map((item: CategorySummary) => ({
        ...item,
        ShortCategory: abbreviateCategory(item.Category),
    }));

    const pieChartData = stats.category_summary.map((item: CategorySummary, index: number) => ({
        id: index,
        value: item.Amount,
        label: item.Category,
        color: CHART_COLORS[index % CHART_COLORS.length]
    }));

    return (
        <Box sx={{ width: '100%', pb: 4 }}>
            <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrendingUp sx={{ fontSize: 40, color: 'primary.main' }} />
                <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>
                    {t('dashboard.title')}
                </Typography>
            </Box>

            {/* Key Metrics Card */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card
                        elevation={0}
                        sx={{
                            background: `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 100%)`,
                            color: 'white',
                            borderRadius: 4,
                            cursor: 'default',
                            transition: 'transform 200ms ease-in-out, box-shadow 200ms ease-in-out',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 12px 24px rgba(59, 130, 246, 0.3)',
                            }
                        }}
                    >
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <AccountBalance sx={{ fontSize: 28, opacity: 0.9 }} />
                                <Typography variant="subtitle1" sx={{ opacity: 0.9, fontWeight: 500 }}>
                                    {t('dashboard.total_expense')}
                                </Typography>
                            </Box>
                            <Typography variant="h3" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>
                                ¥{stats.total_expense.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Charts Section */}
            <Grid container spacing={3}>
                {/* Bar Chart */}
                <Grid size={{ xs: 12, lg: 6 }}>
                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            borderRadius: 4,
                            border: `1px solid ${colors.border.main}`,
                            height: { xs: 400, md: 500 },
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'box-shadow 200ms ease-in-out',
                            '&:hover': {
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                            }
                        }}
                    >
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                            {t('dashboard.bar_title')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                            {t('dashboard.bar_helper')}
                        </Typography>
                        <Box sx={{ flexGrow: 1, width: '100%', cursor: 'pointer' }}>
                            <BarChart
                                dataset={barChartData}
                                layout="horizontal"
                                yAxis={[{
                                    scaleType: 'band',
                                    dataKey: 'ShortCategory',
                                    tickLabelStyle: {
                                        fontSize: 12,
                                    }
                                }]}
                                xAxis={[{
                                    valueFormatter: (value: number) => {
                                        if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
                                        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                                        return value.toString();
                                    },
                                }]}
                                series={[{
                                    dataKey: 'Amount',
                                    label: t('transactions.table.amount') + ' (¥)',
                                    color: colors.primary.main,
                                    valueFormatter: (value) => value ? `¥${value.toLocaleString()}` : '',
                                }]}
                                onItemClick={handleItemClick}
                                margin={{ left: 70, bottom: 40, right: 80, top: 20 }}
                                grid={{ vertical: true }}
                            />
                        </Box>
                    </Paper>
                </Grid>

                {/* Pie Chart */}
                <Grid size={{ xs: 12, lg: 6 }}>
                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            borderRadius: 4,
                            border: `1px solid ${colors.border.main}`,
                            height: { xs: 400, md: 500 },
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'box-shadow 200ms ease-in-out',
                            '&:hover': {
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                            }
                        }}
                    >
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                            {t('dashboard.pie_title')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                            {t('dashboard.pie_helper')}
                        </Typography>
                        <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
                            <PieChart
                                series={[
                                    {
                                        data: pieChartData,
                                        highlightScope: { fade: 'global', highlight: 'item' },
                                        faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                                        innerRadius: 40,
                                        outerRadius: 140,
                                        paddingAngle: 2,
                                        cornerRadius: 6,
                                    },
                                ]}
                                onItemClick={handleItemClick}
                                margin={{ right: 180, left: 80 }}
                            />
                        </Box>
                    </Paper>
                </Grid>

                {/* Card Usage Chart */}
                <Grid size={{ xs: 12, lg: 6 }}>
                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            borderRadius: 4,
                            border: `1px solid ${colors.border.main}`,
                            height: { xs: 400, md: 500 },
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'box-shadow 200ms ease-in-out',
                            '&:hover': {
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                            }
                        }}
                    >
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                            {t('dashboard.card_title')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                            {t('dashboard.card_helper')}
                        </Typography>
                        <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
                            {stats.card_summary && stats.card_summary.length > 0 ? (
                                <PieChart
                                    series={[
                                        {
                                            data: stats.card_summary.map((item: CardSummary, index: number) => ({
                                                id: index,
                                                value: item.Amount,
                                                label: `尾号 ${item.CardLastFour || '未知'}`,
                                                color: CHART_COLORS[(index + 3) % CHART_COLORS.length]
                                            })),
                                            highlightScope: { fade: 'global', highlight: 'item' },
                                            faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                                            innerRadius: 40,
                                            outerRadius: 140,
                                            paddingAngle: 2,
                                            cornerRadius: 6,
                                        },
                                    ]}
                                    margin={{ right: 200, left: 100 }}
                                />
                            ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Typography color="text.secondary">{t('common.no_card_data')}</Typography>
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Category Details Dialog */}
            <Dialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 3 }
                }}
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {selectedCategory} {t('dashboard.detail_title')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('dashboard.total_transactions').replace('{count}', categoryTransactions.length.toString())}
                    </Typography>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    {loadingDetails ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table size="small" sx={{ minWidth: 500 }}>
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: 'background.default' }}>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('transactions.table.date')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('transactions.table.desc')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{t('transactions.table.amount')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {categoryTransactions.map((tx) => (
                                        <TableRow
                                            key={tx.id}
                                            sx={{
                                                '&:hover': { backgroundColor: 'action.hover' },
                                                transition: 'background-color 150ms ease-in-out',
                                            }}
                                        >
                                            <TableCell>{new Date(tx.date).toLocaleDateString('zh-CN')}</TableCell>
                                            <TableCell>{tx.description}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>
                                                ¥{tx.amount.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {categoryTransactions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                {t('common.no_data')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenDialog(false)} variant="outlined">
                        {t('common.close')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
