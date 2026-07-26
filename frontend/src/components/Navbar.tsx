import { useState, type ReactNode } from 'react';
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack,
  Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined, DashboardOutlined, InsightsOutlined, MenuRounded, PaidOutlined, SettingsOutlined,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import ReviewCenter from './ReviewCenter';
import SmartEntryDialog from './SmartEntryDialog';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';

const drawerWidth = 208;
const nav = [
  { label: '总览', path: '/', icon: <DashboardOutlined /> },
  { label: '资产', path: '/assets', icon: <AccountBalanceWalletOutlined /> },
  { label: '收支', path: '/cashflow', icon: <PaidOutlined /> },
  { label: '洞察', path: '/insights', icon: <InsightsOutlined /> },
  { label: '设置', path: '/settings', icon: <SettingsOutlined /> },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const compact = useMediaQuery('(max-width:900px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { roleLabels } = useHouseholdSettings();

  const drawer = (
    <Box sx={{ height: '100%', px: 1.5, py: 2.2, bgcolor: '#fff' }}>
      <List sx={{ display: 'grid', gap: 0.5 }}>
        {nav.map((item) => {
          const selected = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          return (
            <ListItemButton key={item.path} selected={selected} onClick={() => { navigate(item.path); setMobileOpen(false); }}
              sx={{ borderRadius: 2, minHeight: 44, '&.Mui-selected': { bgcolor: '#EAF2FF', color: 'primary.main' } }}>
              <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 700 : 500, fontSize: 14 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ position: 'absolute', bottom: 20, left: 18, right: 18, p: 1.5, borderRadius: 2.5, bgcolor: '#F6F8FC', border: '1px solid #E9EDF5' }}>
        <Typography variant="caption" fontWeight={700}>家庭角色</Typography>
        <Typography variant="caption" color="text.secondary" display="block">{roleLabels.husband} · {roleLabels.wife} · {roleLabels.shared}</Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: 1300, bgcolor: '#1764D8', backgroundImage: 'linear-gradient(90deg,#1764D8,#2E78E7)', borderBottom: '1px solid rgba(255,255,255,.16)' }}>
        <Toolbar sx={{ minHeight: '58px !important', px: { xs: 1.5, md: 2.25 } }}>
          {compact && <IconButton edge="start" aria-label="打开导航" onClick={() => setMobileOpen(true)} sx={{ color: '#fff', mr: 1 }}><MenuRounded /></IconButton>}
          <Stack direction="row" alignItems="center" gap={1}>
            <AccountBalanceWalletOutlined sx={{ color: '#fff' }} />
            <Box><Typography fontWeight={800} color="#fff" lineHeight={1.05}>家庭资产</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)', display: { xs: 'none', sm: 'block' } }}>我们的财务空间</Typography></Box>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" gap={1} alignItems="center">
            <ReviewCenter />
          </Stack>
        </Toolbar>
      </AppBar>
      <Drawer variant={compact ? 'temporary' : 'permanent'} open={compact ? mobileOpen : true} onClose={() => setMobileOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: drawerWidth, borderRight: '1px solid #E6EAF0', top: '58px', height: 'calc(100% - 58px)' } }}>
        {drawer}
      </Drawer>
      <Box component="main" sx={{ ml: { md: `${drawerWidth}px` }, pt: '58px', minHeight: '100vh' }}>
        <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 2, sm: 3, lg: 3.5 } }}>{children}</Box>
      </Box>
      <SmartEntryDialog />
    </Box>
  );
}
