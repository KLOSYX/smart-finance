import { createTheme } from '@mui/material/styles';

// Color Palette - Financial Dashboard Theme
const colors = {
    primary: {
        main: '#3B82F6',      // Trust Blue
        light: '#60A5FA',     // Light Blue
        dark: '#2563EB',      // Dark Blue
    },
    secondary: {
        main: '#60A5FA',
        light: '#93C5FD',
        dark: '#3B82F6',
    },
    cta: {
        main: '#F97316',      // Orange CTA
        light: '#FB923C',
        dark: '#EA580C',
    },
    background: {
        default: '#F8FAFC',   // Light Gray
        paper: '#FFFFFF',
        glass: 'rgba(255, 255, 255, 0.8)',
    },
    text: {
        primary: '#1E293B',   // Slate
        secondary: '#475569', // Slate 600
        disabled: '#94A3B8',  // Slate 400
    },
    border: {
        main: '#E2E8F0',      // Gray 200
        light: '#F1F5F9',
    },
    success: {
        main: '#10B981',
        light: '#34D399',
        dark: '#059669',
    },
    error: {
        main: '#EF4444',
        light: '#F87171',
        dark: '#DC2626',
    },
};

// Theme Configuration
const theme = createTheme({
    palette: {
        mode: 'light',
        primary: colors.primary,
        secondary: colors.secondary,
        background: colors.background,
        text: colors.text,
        success: colors.success,
        error: colors.error,
    },
    typography: {
        fontFamily: [
            'Open Sans',
            'Poppins',
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            'sans-serif',
        ].join(','),
        h1: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 700,
        },
        h2: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 700,
        },
        h3: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
        },
        h4: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
        },
        h5: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
        },
        h6: {
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
        },
        body1: {
            fontFamily: 'Open Sans, sans-serif',
            fontWeight: 400,
        },
        body2: {
            fontFamily: 'Open Sans, sans-serif',
            fontWeight: 400,
        },
        button: {
            fontFamily: 'Open Sans, sans-serif',
            fontWeight: 500,
            textTransform: 'none', // No uppercase
        },
    },
    spacing: 8, // Base spacing unit (8px)
    shape: {
        borderRadius: 12, // Rounded corners
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    padding: '10px 24px',
                    transition: 'all 200ms ease-in-out',
                    cursor: 'pointer',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 16px rgba(59, 130, 246, 0.2)',
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 16,
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                    transition: 'all 200ms ease-in-out',
                    '&:hover': {
                        boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    borderRadius: 16,
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 12,
                        transition: 'all 200ms ease-in-out',
                        '&:hover': {
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: colors.primary.main,
                            },
                        },
                        '&.Mui-focused': {
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderWidth: 2,
                            },
                        },
                    },
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                },
            },
        },
    },
});

export default theme;
export { colors };
