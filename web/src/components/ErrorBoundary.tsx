import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Глобальний перехоплювач помилок рендеру. Без нього неперехоплена помилка в дереві
 * React розмонтовує весь застосунок у білий/застиглий екран (саме такий «не відповідає»
 * симптом важко діагностувати — у консолі може не бути явної помилки).
 *
 * Fallback навмисно на чистому HTML/inline-стилях (без Chakra), щоб лишатися робочим,
 * навіть якщо джерело збою — провайдер теми чи UI-бібліотека.
 *
 * `logError` — єдина точка логування: сюди легко під'єднати зовнішній сервіс
 * (Sentry/LogRocket тощо), не чіпаючи решту коду.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(error, info.componentStack ?? undefined);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#0f1115',
          color: '#e6e6e6',
        }}
      >
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Щось пішло не так</h1>
          <p style={{ fontSize: 14, color: '#9aa0a6', marginBottom: 20 }}>
            Сталася неочікувана помилка в інтерфейсі. Деталі — у консолі браузера.
          </p>
          <pre
            style={{
              textAlign: 'left',
              fontSize: 12,
              background: '#1a1d23',
              border: '1px solid #2a2e35',
              borderRadius: 8,
              padding: 12,
              overflow: 'auto',
              maxHeight: 180,
              marginBottom: 20,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              cursor: 'pointer',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Централізоване логування помилок застосунку. Поки що — у консоль; точка розширення
 * для зовнішнього сервісу моніторингу.
 */
export function logError(error: unknown, componentStack?: string): void {
  // eslint-disable-next-line no-console
  console.error('[app-error]', error, componentStack ? `\n${componentStack}` : '');
}
