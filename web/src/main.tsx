import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Provider } from './components/ui/provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';

// Дефолти кешу: у межах staleTime дані вважаються свіжими (без зайвих рефетчів), і не
// перезавантажуємо весь список оголошень при кожному фокусі вікна. Дані оновлюються явно —
// скан/мутації точково інвалідують потрібні ключі. (Локальні staleTime у useSession/
// useAnalysisStatus лишаються чинними — вони перекривають ці дефолти.)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Client ID для Google Identity Services. У режимі AUTH_DISABLED гейт не показується,
// тож порожнє значення безпечне (кнопка Google не рендериться).
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <GoogleOAuthProvider clientId={googleClientId}>
      <Provider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </Provider>
    </GoogleOAuthProvider>
  </ErrorBoundary>,
);
