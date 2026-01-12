import { useState } from 'react';
import { Container, Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Chat from './pages/Chat';
import SettingsPage from './pages/Settings';

const darkTheme = createTheme({
  palette: {
    mode: 'light', // You can switch to 'dark'
    primary: {
      main: '#1976d2',
    },
  },
});

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
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Navbar onNavigate={setCurrentPage} activePage={currentPage} />
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box>
          {renderPage()}
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
