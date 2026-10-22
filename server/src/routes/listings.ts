import type { FastifyInstance } from 'fastify';
import {
  getDetails,
  getDetailsBatch,
  listListings,
  patchListing,
  searchListingIds,
} from '../services/listings.js';
import type { ListingPatch } from '../types.js';

// Помилки сервісу (404/400) відповідає глобальний обробник (routes/errorHandler.ts).
export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  // Легкі рядки таблиці (без повного опису й галереї — docs/plans/old/listings-light-payload.md).
  app.get<{ Params: { id: string }; Querystring: { sort?: string; order?: string } }>(
    '/api/searches/:id/listings',
    (req) => listListings(Number(req.params.id), req.query.sort, req.query.order),
  );

  // Повний опис і галерея одного оголошення — на вимогу (підказка, діалог, галерея).
  app.get<{ Params: { id: string } }>('/api/listings/:id/details', (req) => getDetails(Number(req.params.id)));

  // Те саме пакетом (крок перегляду AI-майстра) — лише рядки цього пошуку.
  app.post<{ Params: { id: string }; Body: { ids?: unknown } }>('/api/searches/:id/listings/details', (req) =>
    getDetailsBatch(Number(req.params.id), req.body?.ids),
  );

  // Пошук у назві та/або описі (булевий запит, як у таблиці) → id збігів.
  app.get<{ Params: { id: string }; Querystring: { q?: string; title?: string; description?: string } }>(
    '/api/searches/:id/listings/search',
    (req) =>
      searchListingIds(Number(req.params.id), req.query.q, req.query.title !== '0', req.query.description !== '0'),
  );

  // Ручна зміна статусу/нотатки. Будь-яка зміна статусу → status_source='manual', miss_count=0.
  app.patch<{ Params: { id: string }; Body: ListingPatch }>('/api/listings/:id', (req) =>
    patchListing(Number(req.params.id), req.body),
  );
}
