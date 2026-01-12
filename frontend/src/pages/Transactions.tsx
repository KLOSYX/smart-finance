import React, { useEffect, useState } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, CircularProgress, Alert,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import type { GridRenderCellParams } from '@mui/x-data-grid';
import type { SelectChangeEvent } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { getTransactions, parsePdf, analyzeText, updateTransaction, clearAllTransactions, createTransaction } from '../api';
import type { Transaction, TransactionCreate } from '../api';

const CATEGORIES = [
    "住房", "餐饮", "交通", "公用事业", "购物", "娱乐",
    "健康与健身", "旅行", "教育", "债务", "储蓄/投资", "需要复核", "其他"
];

export default function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Review Dialog State
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewText, setReviewText] = useState('');
    const [currentFilename, setCurrentFilename] = useState('');

    // Clear All Confirmation Dialog State
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

    // Needs Review Dialog State
    const [needsReviewOpen, setNeedsReviewOpen] = useState(false);
    const [reviewTransactions, setReviewTransactions] = useState<Transaction[]>([]);

    // Add Transaction Dialog State
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newTransaction, setNewTransaction] = useState<TransactionCreate>({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: 0,
        category: '其他',
        source: 'manual'
    });

    useEffect(() => {
        loadTransactions();
    }, []);

    const loadTransactions = async () => {
        setLoading(true);
        try {
            const data = await getTransactions();
            setTransactions(data);
        } catch (error) {
            console.error(error);
            setErrorMsg("无法加载交易记录，请检查后端服务。");
        } finally {
            setLoading(false);
        }
    };

    const handleClearAll = async () => {
        try {
            await clearAllTransactions();
            setClearConfirmOpen(false);
            await loadTransactions();
        } catch (error) {
            console.error(error);
            alert("清除失败，请重试。");
        }
    };

    const handleAddTransaction = async () => {
        try {
            await createTransaction(newTransaction);
            setAddDialogOpen(false);
            setNewTransaction({
                date: new Date().toISOString().split('T')[0],
                description: '',
                amount: 0,
                category: '其他',
                source: 'manual'
            });
            await loadTransactions();
        } catch (error) {
            console.error(error);
            alert("添加失败，请检查输入。");
        }
    };

    const handleNewTransactionChange = (prop: keyof TransactionCreate) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        let value: string | number = rawValue;
        if (prop === 'amount') {
            value = rawValue === '' ? 0 : parseFloat(rawValue);
        }
        setNewTransaction({ ...newTransaction, [prop]: value });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setUploading(true);
            setErrorMsg(null);
            try {
                // Step 1: Parse and Anonymize
                const result = await parsePdf(event.target.files[0]);
                setReviewText(result.text);
                setCurrentFilename(result.filename);
                setReviewOpen(true); // Open Dialog
            } catch (error) {
                setErrorMsg("解析失败。请检查 API 配置或 PDF 格式。");
                console.error(error);
            } finally {
                setUploading(false);
                event.target.value = '';
            }
        }
    };

    const handleConfirmAnalysis = async () => {
        setAnalyzing(true);
        try {
            // Step 2: Analyze Edited Text
            const response = await analyzeText(reviewText, currentFilename);
            setReviewOpen(false);
            await loadTransactions(); // Refresh list

            // Check for transactions needing review
            if (response.transactions) {
                const needingReview = response.transactions.filter(t => t.category === "需要复核");
                if (needingReview.length > 0) {
                    setReviewTransactions(needingReview);
                    setNeedsReviewOpen(true);
                }
            }
        } catch (error) {
            console.error(error);
            alert("分析失败，请稍后重试。");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCategoryChange = async (id: number, event: SelectChangeEvent) => {
        const newCategory = event.target.value;
        // Optimistic update
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: newCategory } : t));

        try {
            await updateTransaction(id, { category: newCategory });
        } catch (error) {
            console.error("Failed to update category", error);
            // Revert on error
            alert("更新分类失败");
            loadTransactions();
        }
    };

    const handleReviewCategoryChange = async (id: number, event: SelectChangeEvent) => {
        const newCategory = event.target.value;
        // Update local state for review dialog
        setReviewTransactions(prev => prev.map(t => t.id === id ? { ...t, category: newCategory } : t));
        // Update main transactions list optimistically
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: newCategory } : t));

        try {
            await updateTransaction(id, { category: newCategory });
        } catch (error) {
            console.error("Failed to update category", error);
            alert("更新分类失败");
        }
    };

    const exportCSV = () => {
        if (transactions.length === 0) return;

        // Define CSV headers
        const headers = ["ID", "Date", "Description", "Amount", "Category", "Source"];

        // Convert rows
        const csvRows = [
            headers.join(','),
            ...transactions.map(row => {
                const date = new Date(row.date).toISOString().split('T')[0];
                const desc = `"${row.description.replace(/"/g, '""')}"`;
                const amount = row.amount;
                const cat = row.category;
                const src = row.source;
                return [row.id, date, desc, amount, cat, src].join(',');
            })
        ];

        const csvContent = "data:text/csv;charset=utf-8,﻿" + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>交易明细</Typography>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddIcon />}
                        onClick={() => setAddDialogOpen(true)}
                    >
                        手动添加
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => setClearConfirmOpen(true)}
                        disabled={transactions.length === 0 || loading}
                    >
                        清空所有
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownloadIcon />}
                        onClick={exportCSV}
                        disabled={transactions.length === 0}
                    >
                        导出 CSV
                    </Button>
                    <Button
                        component="label"
                        variant="contained"
                        startIcon={uploading ? <CircularProgress size={20} color="inherit"/> : <CloudUploadIcon />}
                        disabled={uploading}
                    >
                        上传 PDF 账单
                        <input
                            type="file"
                            hidden
                            accept=".pdf"
                            onChange={handleFileUpload}
                        />
                    </Button>
                </Box>
            </Box>

            {errorMsg && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMsg(null)}>
                    {errorMsg}
                </Alert>
            )}

            <Paper elevation={3} sx={{ height: 600, width: '100%', mb: 3 }}>
                <DataGrid
                    rows={transactions}
                    columns={[
                        {
                            field: 'date',
                            headerName: '日期',
                            width: 150,
                            valueGetter: (value, row) => new Date(row.date),
                            valueFormatter: (value) => value ? value.toLocaleDateString('zh-CN') : ''
                        },
                        { field: 'description', headerName: '描述', flex: 1, minWidth: 200 },
                        {
                            field: 'category',
                            headerName: '类别',
                            width: 180,
                            renderCell: (params: GridRenderCellParams) => (
                                <Select
                                    value={params.value}
                                    onChange={(e) => handleCategoryChange(params.row.id, e as SelectChangeEvent)}
                                    size="small"
                                    variant="standard"
                                    disableUnderline
                                    fullWidth
                                    sx={{
                                        '& .MuiSelect-select': { py: 0.5, px: 1, borderRadius: 1, bgcolor: params.value === '需要复核' ? '#fff3e0' : 'transparent' }
                                    }}
                                >
                                    {CATEGORIES.map(cat => (
                                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                    ))}
                                </Select>
                            )
                        },
                        {
                            field: 'amount',
                            headerName: '金额 (¥)',
                            width: 120,
                            align: 'right',
                            headerAlign: 'right',
                            renderCell: (params: GridRenderCellParams) => (
                                <span style={{ color: params.value > 0 ? '#d32f2f' : '#2e7d32', fontWeight: 'bold' }}>
                                    {Number(params.value).toFixed(2)}
                                </span>
                            )
                        },
                        { field: 'source', headerName: '来源', width: 150 },
                    ]}
                    loading={loading}
                    initialState={{
                        pagination: {
                            paginationModel: { page: 0, pageSize: 10 },
                        },
                        sorting: {
                            sortModel: [{ field: 'date', sort: 'desc' }],
                        },
                    }}
                    pageSizeOptions={[10, 25, 50, 100]}
                    disableRowSelectionOnClick
                    sx={{ border: 0 }}
                />
            </Paper>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>🛡️ 隐私审查</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        请检查下方提取的文本，确保所有敏感信息（如姓名、卡号、电话）已被移除或脱敏。
                    </Alert>
                    <TextField
                        multiline
                        rows={15}
                        fullWidth
                        variant="outlined"
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        sx={{ fontFamily: 'monospace' }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setReviewOpen(false)} color="inherit">
                        取消
                    </Button>
                    <Button
                        onClick={handleConfirmAnalysis}
                        variant="contained"
                        disabled={analyzing}
                        startIcon={analyzing && <CircularProgress size={20} color="inherit" />}
                    >
                        确认并开始分析
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Clear All Confirmation Dialog */}
            <Dialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)}>
                <DialogTitle>⚠️ 确认清空</DialogTitle>
                <DialogContent>
                    <Typography>您确定要清空所有交易记录吗？此操作不可撤销。</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setClearConfirmOpen(false)} color="inherit">
                        取消
                    </Button>
                    <Button
                        onClick={handleClearAll}
                        variant="contained"
                        color="error"
                    >
                        确认清空
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Needs Review Dialog */}
            <Dialog open={needsReviewOpen} onClose={() => setNeedsReviewOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>🔍 交易复核</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        以下交易被标记为“需要复核”，请检查并更新其类别。
                    </Alert>
                    <TableContainer component={Paper} elevation={0} variant="outlined">
                        <Table>
                            <TableHead sx={{ bgcolor: '#fff3e0' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>日期</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>描述</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>类别</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>金额</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {reviewTransactions.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{new Date(row.date).toLocaleDateString('zh-CN')}</TableCell>
                                        <TableCell>{row.description}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={row.category}
                                                onChange={(e) => handleReviewCategoryChange(row.id, e)}
                                                size="small"
                                                fullWidth
                                                sx={{ minWidth: 120 }}
                                            >
                                                {CATEGORIES.map(cat => (
                                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                                ))}
                                            </Select>
                                        </TableCell>
                                        <TableCell align="right">
                                            {row.amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setNeedsReviewOpen(false)} variant="contained">
                        完成
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Add Transaction Dialog */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>➕ 添加交易</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="日期"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={newTransaction.date}
                            onChange={handleNewTransactionChange('date')}
                        />
                        <TextField
                            label="描述"
                            fullWidth
                            value={newTransaction.description}
                            onChange={handleNewTransactionChange('description')}
                        />
                        <TextField
                            label="金额 (¥)"
                            type="number"
                            fullWidth
                            value={newTransaction.amount}
                            onChange={handleNewTransactionChange('amount')}
                        />
                        <TextField
                            select
                            label="类别"
                            fullWidth
                            value={newTransaction.category}
                            onChange={handleNewTransactionChange('category')}
                        >
                            {CATEGORIES.map((option) => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setAddDialogOpen(false)} color="inherit">
                        取消
                    </Button>
                    <Button
                        onClick={handleAddTransaction}
                        variant="contained"
                        disabled={!newTransaction.description || !newTransaction.amount}
                    >
                        添加
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
