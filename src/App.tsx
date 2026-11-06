import { AppHeader } from './components/AppHeader';
import { ChatPage } from './features/chat/ChatPage';
import { ThemeProvider } from './theme/ThemeProvider';

// Phase 1: the patient AI chat is the only screen and opens by default.
export default function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <AppHeader />
        <ChatPage />
      </div>
    </ThemeProvider>
  );
}
