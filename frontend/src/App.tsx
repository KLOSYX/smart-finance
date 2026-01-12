import { useState } from 'react';
import { Container, Box, CssBaseline, ThemeProvider } from '@mui/material';
import theme from './theme';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Chat from './pages/Chat';
import SettingsPage from './pages/Settings';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return <Transactions />;
      case 'chat':
        return <Chat />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Navbar onNavigate={setCurrentPage} activePage={currentPage} />
      <Container maxWidth="xl" sx={{ mt: 10, mb: 4, px: { xs: 2, sm: 3, md: 4 } }}>
        <Box>
          {renderPage()}
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
