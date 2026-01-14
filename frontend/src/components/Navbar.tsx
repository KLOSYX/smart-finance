import { useState, useEffect } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { TrendingUp, Language } from '@mui/icons-material';
import { colors } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

interface NavbarProps {
  onNavigate: (page: string) => void;
  activePage: string;
}

export default function Navbar({ onNavigate, activePage }: NavbarProps) {
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);
  const { t, toggleLanguage, language } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      const isVisible = prevScrollPos > currentScrollPos || currentScrollPos < 10;

      setPrevScrollPos(currentScrollPos);
      setVisible(isVisible);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prevScrollPos]);

  const getButtonStyle = (page: string) => ({
    fontWeight: activePage === page ? 600 : 400,
    backgroundColor: activePage === page ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
    color: 'white',
    px: 2.5,
    py: 1,
    mx: 0.5,
    transition: 'all 200ms ease-in-out',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: activePage === page
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(255, 255, 255, 0.1)',
    },
  });

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        top: visible ? 0 : -80,
        left: 0,
        right: 0,
        transition: 'top 300ms ease-in-out',
        background: `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 100%)`,
        backdropFilter: 'blur(20px)',
        borderRadius: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TrendingUp sx={{ fontSize: 32, color: 'white' }} />
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 700,
              fontFamily: 'Poppins, sans-serif',
              letterSpacing: '-0.5px',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {t('navbar.title')}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button onClick={() => onNavigate('dashboard')} sx={getButtonStyle('dashboard')}>
            {t('navbar.dashboard')}
          </Button>
          <Button onClick={() => onNavigate('transactions')} sx={getButtonStyle('transactions')}>
            {t('navbar.transactions')}
          </Button>
          <Button onClick={() => onNavigate('chat')} sx={getButtonStyle('chat')}>
            {t('navbar.chat')}
          </Button>
          <Button onClick={() => onNavigate('settings')} sx={getButtonStyle('settings')}>
            {t('navbar.settings')}
          </Button>

          <IconButton onClick={toggleLanguage} sx={{ color: 'white', ml: 1 }}>
            <Language />
            <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600 }}>
              {language === 'zh' ? 'EN' : '中'}
            </Typography>
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
