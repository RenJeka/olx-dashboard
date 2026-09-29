/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth 2.0 Client ID для Google Identity Services (гейт). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Базовий URL API у проді (фронт і API на різних доменах). Локально порожній — Vite-проксі. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
