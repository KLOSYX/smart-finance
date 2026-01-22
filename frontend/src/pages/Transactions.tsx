import React, { useEffect, useState } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, CircularProgress, Alert,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, Chip,
    Autocomplete, Menu
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import type { GridRenderCellParams } from '@mui/x-data-grid';
import type { SelectChangeEvent } from '@mui/material';
import { CloudUpload, FileDownload, Delete, Add, Receipt, Edit } from '@mui/icons-material';
import { getTransactions, parsePdf, analyzeText, updateTransaction, clearAllTransactions, createTransaction, deleteTransaction } from '../api';
import type { Transaction, TransactionCreate } from '../api';
import { colors } from '../theme';
import { isAxiosError } from 'axios';
import { useLanguage } from '../contexts/LanguageContext';

const CATEGORIES_ZH = [
    "住房", "餐饮", "交通", "公用事业", "购物", "娱乐",
    "健康与健身", "旅行", "教育", "债务", "储蓄/投资", "需要复核", "其他"
];

const CATEGORIES_EN = [
    "Housing", "Food & Dining", "Transportation", "Utilities", "Shopping", "Entertainment",
    "Health & Fitness", "Travel", "Education", "Debt", "Savings/Investments", "Needs Review", "Other"
];

const CATEGORY_COLORS: Record<string, string> = {
    // Chinese
    "住房": colors.primary.main,
    "餐饮": colors.cta.main,
    "交通": colors.success.main,
    "购物": '#8B5CF6',
    "娱乐": '#EC4899',
    "需要复核": '#F59E0B',
    // English
    "Housing": colors.primary.main,
    "Food & Dining": colors.cta.main,
    "Transportation": colors.success.main,
    "Shopping": '#8B5CF6',
    "Entertainment": '#EC4899',
    "Needs Review": '#F59E0B',
};

export default function Transactions() {
    const { t, language } = useLanguage();
    const categories = language === 'en' ? CATEGORIES_EN : CATEGORIES_ZH;
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Dialog states
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
        rowId: number;
    } | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);

    // Dialog states
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewText, setReviewText] = useState('');
    const [currentFilename, setCurrentFilename] = useState('');
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [transactionToDelete, setTransactionToDelete] = useState<number | null>(null);
    const [needsReviewOpen, setNeedsReviewOpen] = useState(false);
    const [reviewTransactions, setReviewTransactions] = useState<Transaction[]>([]);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newTransaction, setNewTransaction] = useState<TransactionCreate>({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: 0,
        category: language === 'en' ? 'Other' : '其他',
        source: 'manual'
    });

    useEffect(() => {
        const fetchTransactions = async () => {
            setLoading(true);
            try {
                const data = await getTransactions();
                setTransactions(data);
            } catch (error) {
                console.error(error);
                setErrorMsg(t('transactions.errors.load'));
            } finally {
                setLoading(false);
            }
        };
        fetchTransactions();
    }, [t]);

    const handleClearAll = async () => {
        try {
            await clearAllTransactions();
            setClearConfirmOpen(false);
            const data = await getTransactions();
            setTransactions(data);
        } catch (error) {
            console.error(error);
            setErrorMsg(t('transactions.errors.clear'));
        }
    };

    const handleSaveTransaction = async () => {
        try {
            if (editMode && selectedTransactionId) {
                await updateTransaction(selectedTransactionId, newTransaction);
            } else {
                await createTransaction(newTransaction);
            }
            setAddDialogOpen(false);
            resetForm();
            const data = await getTransactions();
            setTransactions(data);
        } catch (error) {
            console.error(error);
            setErrorMsg(editMode ? t('transactions.errors.update') : t('transactions.errors.add'));
        }
    };

    const resetForm = () => {
        setNewTransaction({
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: 0,
            category: language === 'en' ? 'Other' : '其他',
            source: 'manual'
        });
        setEditMode(false);
        setSelectedTransactionId(null);
    };

    const handleDeleteTransaction = async () => {
        if (!transactionToDelete) return;
        try {
            await deleteTransaction(transactionToDelete);
            setDeleteConfirmOpen(false);
            setTransactionToDelete(null);
            const data = await getTransactions();
            setTransactions(data);
        } catch (error) {
            console.error(error);
            setErrorMsg(t('transactions.errors.delete'));
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setUploading(true);
            setErrorMsg(null);
            try {
                const result = await parsePdf(event.target.files[0]);
                setReviewText(result.text);
                setCurrentFilename(result.filename);
                setReviewOpen(true);
            } catch (error) {
                setErrorMsg(t('transactions.errors.parse'));
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
            const response = await analyzeText(reviewText, currentFilename, language);
            setReviewOpen(false);
            const data = await getTransactions();
            setTransactions(data);

            if (response.transactions) {
                const reviewKey = language === 'en' ? "Needs Review" : "需要复核";
                const needingReview = response.transactions.filter(t => t.category === reviewKey);
                if (needingReview.length > 0) {
                    setReviewTransactions(needingReview);
                    setNeedsReviewOpen(true);
                }
            }
        } catch (error) {
            console.error(error);
            let detail = t('transactions.errors.analyze');
            if (isAxiosError(error) && error.response?.data?.detail) {
                detail = error.response.data.detail;
            } else if (error instanceof Error) {
                detail = error.message;
            }
            setErrorMsg(detail);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCategoryChange = async (id: number, event: SelectChangeEvent) => {
        const newCategory = event.target.value;
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: newCategory } : t));

        try {
            await updateTransaction(id, { category: newCategory });
        } catch (error) {
            console.error("Failed to update category", error);
            setErrorMsg(t('transactions.errors.update_cat'));
            const data = await getTransactions();
            setTransactions(data);
        }
    };

    const exportCSV = () => {
        if (transactions.length === 0) return;

        const headers = ["ID", "Date", "Description", "Amount", "Category", "Card Last 4", "Source"];
        const csvRows = [
            headers.join(','),
            ...transactions.map(row => {
                const date = new Date(row.date).toISOString().split('T')[0];
                const desc = `"${row.description.replace(/"/g, '""')}"`;
                return [row.id, date, desc, row.amount, row.category, row.card_last_four || '', row.source].join(',');
            })
        ];

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join('\n');
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleRowContextMenu = (event: React.MouseEvent, id: number) => {
        event.preventDefault(); // Check if needed, usually required for custom context menu
        setContextMenu(
            contextMenu === null
                ? {
                    mouseX: event.clientX + 2,
                    mouseY: event.clientY - 6,
                    rowId: id,
                }
                : null,
        );
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleEditClick = () => {
        handleCloseContextMenu();
        const transaction = transactions.find(t => t.id === contextMenu?.rowId);
        if (transaction) {
            setNewTransaction({
                date: new Date(transaction.date).toISOString().split('T')[0],
                description: transaction.description,
                amount: transaction.amount,
                category: transaction.category,
                source: transaction.source,
                card_last_four: transaction.card_last_four
            });
            setSelectedTransactionId(transaction.id);
            setEditMode(true);
            setAddDialogOpen(true);
        }
    };

    const handleDeleteClick = () => {
        handleCloseContextMenu();
        if (contextMenu?.rowId) {
            setTransactionToDelete(contextMenu.rowId);
            setDeleteConfirmOpen(true);
        }
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Receipt sx={{ fontSize: 40, color: 'primary.main' }} />
                <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif', flexGrow: 1 }}>
                    {t('transactions.title')}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => {
                            resetForm();
                            setAddDialogOpen(true);
                        }}
                        sx={{ cursor: 'pointer' }}
                    >
                        {t('transactions.actions.manual_add')}
                    </Button>
                    <Button
                        variant="contained"
                        component="label"
                        startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUpload />}
                        disabled={uploading}
                        sx={{ cursor: 'pointer' }}
                    >
                        {t('transactions.actions.upload')}
                        <input type="file" hidden accept=".pdf" onChange={handleFileUpload} />
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownload />}
                        onClick={exportCSV}
                        disabled={transactions.length === 0}
                        sx={{ cursor: 'pointer' }}
                    >
                        {t('transactions.actions.export')}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() => setClearConfirmOpen(true)}
                        disabled={transactions.length === 0 || loading}
                        sx={{ cursor: 'pointer' }}
                    >
                        {t('transactions.actions.clear')}
                    </Button>
                </Box>
            </Box>

            {errorMsg && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setErrorMsg(null)}>
                    {errorMsg}
                </Alert>
            )}

            {/* Data Grid */}
            <Paper
                elevation={0}
                sx={{
                    height: 650,
                    width: '100%',
                    border: `1px solid ${colors.border.main}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                }}
            >
                <DataGrid
                    rows={transactions}
                    columns={[
                        {
                            field: 'date',
                            headerName: t('transactions.table.date'),
                            width: 120,
                            valueGetter: (_value, row) => new Date(row.date),
                            valueFormatter: (value: Date) => value ? value.toLocaleDateString('zh-CN') : ''
                        },
                        {
                            field: 'description',
                            headerName: t('transactions.table.desc'),
                            flex: 1,
                            minWidth: 200,
                        },
                        {
                            field: 'card_last_four',
                            headerName: t('transactions.table.card'),
                            width: 100,
                            valueFormatter: (value: string) => value ? `****${value}` : '-'
                        },
                        {
                            field: 'category',
                            headerName: t('transactions.table.category'),
                            width: 140,
                            renderCell: (params: GridRenderCellParams) => (
                                <Chip
                                    label={params.value}
                                    size="small"
                                    sx={{
                                        backgroundColor: CATEGORY_COLORS[params.value] || colors.border.main,
                                        color: 'white',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => {
                                        const newCategoryIndex = (categories.indexOf(params.value) + 1) % categories.length;
                                        handleCategoryChange(params.row.id, { target: { value: categories[newCategoryIndex] } } as SelectChangeEvent);
                                    }}
                                />
                            )
                        },
                        {
                            field: 'amount',
                            headerName: t('transactions.table.amount') + ' (¥)',
                            width: 130,
                            align: 'right',
                            headerAlign: 'right',
                            renderCell: (params: GridRenderCellParams) => (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
                                    <Typography sx={{ color: params.value > 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
                                        {Number(params.value).toFixed(2)}
                                    </Typography>
                                </Box>
                            )
                        },
                        { field: 'source', headerName: t('transactions.table.source'), width: 140 },
                    ]}
                    loading={loading}
                    initialState={{
                        pagination: { paginationModel: { page: 0, pageSize: 10 } },
                        sorting: { sortModel: [{ field: 'date', sort: 'desc' }] },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                    slotProps={{
                        row: {
                            onContextMenu: (e) => {
                                handleRowContextMenu(e, Number(e.currentTarget.getAttribute('data-id')));
                            },
                            style: { cursor: 'context-menu' },
                        },
                    }}
                    sx={{
                        border: 0,
                        '& .MuiDataGrid-cell:focus': { outline: 'none' },
                        '& .MuiDataGrid-row:hover': { backgroundColor: 'action.hover' },
                    }}
                />
            </Paper>

            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={handleEditClick}>
                    <Edit fontSize="small" sx={{ mr: 1 }} />
                    {t('transactions.actions.edit')}
                </MenuItem>
                <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
                    <Delete fontSize="small" sx={{ mr: 1 }} />
                    {t('transactions.actions.delete')}
                </MenuItem>
            </Menu>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('transactions.dialogs.privacy_title')}</Typography>
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                        {t('transactions.dialogs.privacy_helper')}
                    </Alert>
                    <TextField
                        multiline
                        rows={15}
                        fullWidth
                        variant="outlined"
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setReviewOpen(false)} variant="outlined">{t('transactions.actions.cancel')}</Button>
                    <Button
                        onClick={handleConfirmAnalysis}
                        variant="contained"
                        disabled={analyzing}
                        startIcon={analyzing && <CircularProgress size={20} color="inherit" />}
                        sx={{ cursor: 'pointer' }}
                    >
                        {t('transactions.actions.confirm_analyze')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Clear Confirmation */}
            <Dialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>{t('transactions.dialogs.clear_title')}</DialogTitle>
                <DialogContent>
                    <Typography>{t('transactions.dialogs.clear_msg')}</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setClearConfirmOpen(false)} variant="outlined">{t('transactions.actions.cancel')}</Button>
                    <Button onClick={handleClearAll} variant="contained" color="error" sx={{ cursor: 'pointer' }}>{t('transactions.actions.confirm')}</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Single Confirmation */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>{t('transactions.dialogs.delete_title')}</DialogTitle>
                <DialogContent>
                    <Typography>{t('transactions.dialogs.delete_confirm')}</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} variant="outlined">{t('transactions.actions.cancel')}</Button>
                    <Button onClick={handleDeleteTransaction} variant="contained" color="error" sx={{ cursor: 'pointer' }}>{t('transactions.actions.delete')}</Button>
                </DialogActions>
            </Dialog>

            {/* Needs Review Dialog */}
            <Dialog open={needsReviewOpen} onClose={() => setNeedsReviewOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>{t('transactions.dialogs.review_title')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                        {t('transactions.dialogs.review_helper')}
                    </Alert>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'background.default' }}>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('transactions.table.date')}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('transactions.table.desc')}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('transactions.table.category')}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('transactions.table.amount')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {reviewTransactions.map((row) => (
                                    <TableRow key={row.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                                        <TableCell>{new Date(row.date).toLocaleDateString('zh-CN')}</TableCell>
                                        <TableCell>{row.description}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={row.category}
                                                onChange={(e) => {
                                                    handleCategoryChange(row.id, e);
                                                    setReviewTransactions(prev => prev.map(t => t.id === row.id ? { ...t, category: e.target.value } : t));
                                                }}
                                                size="small"
                                                sx={{ minWidth: 120 }}
                                            >
                                                {categories.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
                                            </Select>
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                                            ¥{row.amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setNeedsReviewOpen(false)} variant="contained" sx={{ cursor: 'pointer' }}>{t('transactions.actions.done')}</Button>
                </DialogActions>
            </Dialog>

            {/* Add/Edit Transaction Dialog */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>{editMode ? t('transactions.dialogs.edit_title') : t('transactions.dialogs.add_title')}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                        <TextField
                            label={t('transactions.table.date')}
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={newTransaction.date}
                            onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                        />
                        <TextField
                            label={t('transactions.table.desc')}
                            fullWidth
                            value={newTransaction.description}
                            onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                        />
                        <TextField
                            label={t('transactions.table.amount') + " (¥)"}
                            type="number"
                            fullWidth
                            value={newTransaction.amount}
                            onChange={(e) => setNewTransaction({ ...newTransaction, amount: parseFloat(e.target.value) || 0 })}
                        />
                        <Autocomplete
                            freeSolo
                            options={categories}
                            value={newTransaction.category}
                            onChange={(event, newValue) => {
                                setNewTransaction({ ...newTransaction, category: newValue || '' });
                            }}
                            onInputChange={(event, newInputValue) => {
                                setNewTransaction({ ...newTransaction, category: newInputValue });
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('transactions.table.category')}
                                    fullWidth
                                />
                            )}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setAddDialogOpen(false)} variant="outlined">{t('transactions.actions.cancel')}</Button>
                    <Button
                        onClick={handleSaveTransaction}
                        variant="contained"
                        disabled={!newTransaction.description || !newTransaction.amount}
                        sx={{ cursor: 'pointer' }}
                    >
                        {editMode ? t('transactions.actions.save') : t('transactions.actions.add')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
