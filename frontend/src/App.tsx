import { CssBaseline, ThemeProvider } from '@mui/material';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppShell from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Cashflow from './pages/Cashflow';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import theme from './theme';
import { HouseholdSettingsProvider } from './contexts/HouseholdSettingsContext';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <HouseholdSettingsProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/cashflow" element={<Cashflow />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </AppShell>
        </HouseholdSettingsProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
