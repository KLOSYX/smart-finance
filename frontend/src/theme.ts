import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3976D8', light: '#EAF2FF', dark: '#285EAF' },
    success: { main: '#27845C' },
    warning: { main: '#D9842A' },
    error: { main: '#D24F4F' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' },
    text: { primary: '#182230', secondary: '#667386' },
    divider: '#E6EAF0',
  },
  typography: {
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    button: { textTransform: 'none', fontWeight: 650 },
    body2: { lineHeight: 1.6 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 8, boxShadow: 'none', minHeight: 34 }, contained: { '&:hover': { boxShadow: 'none' } } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiTableHead: { styleOverrides: { root: { background: '#F7F9FB' } } },
    MuiTableCell: { styleOverrides: { head: { color: '#5D6979', fontWeight: 700, whiteSpace: 'nowrap' }, root: { borderColor: '#EDF0F4' } } },
    MuiTab: { styleOverrides: { root: { minHeight: 36, paddingTop: 6, paddingBottom: 6 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } },
  },
});

export default theme;
export const colors = { border: { main: '#E6EAF0' } };
