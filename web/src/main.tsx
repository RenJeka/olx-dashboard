import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Provider } from './components/ui/provider';
import { App } from './App';

const queryClient = new QueryClient();

// Client ID для Google Identity Services. У режимі AUTH_DISABLED гейт не показується,
// тож порожнє значення безпечне (кнопка Google не рендериться).
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <Provider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </Provider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
