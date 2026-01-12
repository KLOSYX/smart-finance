import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Card, CardContent, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    useTheme
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { getStats, getTransactions } from '../api';
import type { Transaction } from '../api';

interface CategorySummary {
    Category: string;
    Amount: number;
    [key: string]: string | number;
}

interface Stats {
    total_expense: number;
    category_summary: CategorySummary[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#8dd1e1', '#a4de6c'];

export default function Dashboard() {
    const theme = useTheme();
    const [stats, setStats] = useState<Stats | null>(null);

    // Drill down state
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categoryTransactions, setCategoryTransactions] = useState<Transaction[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await getStats();
            setStats(data);
        } catch (error) {
            console.error(error);
        }
    };

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

    if (!stats) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Prepare data for MUI X Charts Pie Chart
    const pieChartData = stats.category_summary.map((item: CategorySummary, index: number) => ({
        id: index,
        value: item.Amount,
        label: item.Category,
        color: COLORS[index % COLORS.length]
    }));

    return (
        <Box sx={{ width: '100%', pb: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ mb: 4, fontWeight: 'bold' }}>财务概览</Typography>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card elevation={3} sx={{
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        background: `linear-gradient(45deg, ${theme.palette.primary.main} 30%, ${theme.palette.primary.light} 90%)`
                    }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom sx={{ opacity: 0.9 }}>总支出</Typography>
                            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                                ¥{stats.total_expense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={3} sx={{ p: 3, display: 'flex', flexDirection: 'column', height: 450 }}>
                        <Typography variant="h6" gutterBottom>各类支出 (点击查看详情)</Typography>
                        <Box sx={{ flexGrow: 1, width: '100%' }}>
                            <BarChart
                                dataset={stats.category_summary}
                                xAxis={[{ scaleType: 'band', dataKey: 'Category' }]}
                                series={[{ dataKey: 'Amount', label: '金额', color: theme.palette.primary.main }]}
                                onItemClick={handleItemClick}
                                slotProps={{
                                    legend: { position: { vertical: 'bottom', horizontal: 'center' } }
                                }}
                                margin={{ left: 60, bottom: 50, right: 10, top: 20 }}
                                grid={{ horizontal: true }}
                            />
                        </Box>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={3} sx={{ p: 3, display: 'flex', flexDirection: 'column', height: 450 }}>
                        <Typography variant="h6" gutterBottom>各类支出占比 (点击查看详情)</Typography>
                        <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
                            <PieChart
                                series={[
                                    {
                                        data: pieChartData,
                                        highlightScope: { fade: 'global', highlight: 'item' },
                                        faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                                        innerRadius: 30,
                                        outerRadius: 120,
                                        paddingAngle: 2,
                                        cornerRadius: 5,
                                    },
                                ]}
                                slotProps={{
                                    legend: {
                                        position: { vertical: 'middle', horizontal: 'end' },
                                    }
                                }}
                                onItemClick={handleItemClick}
                                margin={{ right: 200 }}
                            />
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Drill Down Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        {selectedCategory} 支出明细
                        <Typography variant="caption" display="block" color="textSecondary">
                            共 {categoryTransactions.length} 笔交易
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {loadingDetails ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>日期</TableCell>
                                        <TableCell>描述</TableCell>
                                        <TableCell align="right">金额</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {categoryTransactions.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.date).toLocaleDateString('zh-CN')}</TableCell>
                                            <TableCell>{tx.description}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                                ¥{tx.amount.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {categoryTransactions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center">无数据</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>关闭</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
