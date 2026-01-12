import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

interface NavbarProps {
    onNavigate: (page: string) => void;
    activePage: string;
}

export default function Navbar({ onNavigate, activePage }: NavbarProps) {
  const getButtonStyle = (page: string) => ({
    fontWeight: activePage === page ? 'bold' : 'normal',
    borderBottom: activePage === page ? '2px solid white' : '2px solid transparent',
    borderRadius: 0,
    mx: 1
  });

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" elevation={2}>
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
          >
            <AccountBalanceWalletIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            AI 智能理财
          </Typography>
          <Button color="inherit" onClick={() => onNavigate('dashboard')} sx={getButtonStyle('dashboard')}>仪表盘</Button>
          <Button color="inherit" onClick={() => onNavigate('transactions')} sx={getButtonStyle('transactions')}>交易明细</Button>
          <Button color="inherit" onClick={() => onNavigate('chat')} sx={getButtonStyle('chat')}>AI 顾问</Button>
          <Button color="inherit" onClick={() => onNavigate('settings')} sx={getButtonStyle('settings')}>设置</Button>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
