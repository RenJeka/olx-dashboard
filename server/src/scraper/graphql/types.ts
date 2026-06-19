/**
 * Типи відповіді OLX GraphQL API (`/apigateway/graphql`).
 * Локальні для GraphQL-збирача — зовнішній код використовує RawListing/FetchSearchResult
 * з server/src/types.ts.
 */

/** Пара ключ-значення для масиву searchParameters у GraphQL-запиті. */
export interface SearchParameter {
  key: string;
  value: string;
}

/** Значення параметра оголошення. Поля заповнені залежно від __typename (PriceParam/GenericParam/інше). */
export interface GraphqlParamValue {
  __typename: string;
  value?: number;
  currency?: string;
  negotiable?: boolean;
  label?: string;
  key?: string;
}

/** Параметр оголошення (ціна, стан, категорійні ключі). */
export interface GraphqlParam {
  key: string;
  name: string;
  type: string;
  value: GraphqlParamValue;
}

/** Оголошення у відповіді GraphQL (поля `data[]` у ListingSuccess). */
export interface GraphqlListing {
  id: number;
  title: string;
  url: string;
  status: string;
  created_time: string;
  last_refresh_time: string;
  business: boolean;
  location?: {
    city?: { name: string } | null;
    district?: { name: string } | null;
  } | null;
  photos?: Array<{ link: string }>;
  params?: GraphqlParam[];
  description?: string | null;
  user?: { name?: string | null } | null;
  contact?: { name?: string | null } | null;
}

/** Успішна відповідь GraphQL (data.clientCompatibleListings.__typename === 'ListingSuccess'). */
export interface ListingSuccess {
  __typename: 'ListingSuccess';
  data: GraphqlListing[];
  metadata?: { total_elements: number; visible_total_count: number };
}

/** Помилка-відповідь GraphQL (напр. offset > 1000 → 400 "Data validation error occurred"). */
export interface ListingError {
  __typename: 'ListingError';
  error: { code?: string; title?: string; detail?: string; status?: number };
}

/** Повна відповідь JSON від /apigateway/graphql. */
export interface GraphqlResponse {
  data?: {
    clientCompatibleListings?: ListingSuccess | ListingError;
  };
  errors?: Array<{ message: string }>;
}

/** Ціновий бакет для split-скану (бісекція діапазону цін, docs/plans/price-range-split.md). */
export interface PriceBucket {
  from: number;
  to: number;
  /** visible_total_count цього піддіапазону (0 — якщо ListingError або відсутнє). */
  count: number;
  /** Оголошення з 0-ї сторінки бакету (вже завантажені під час бісекції). */
  page0: import('../../types.js').RawListing[];
}
