/**
 * Очікувані помилки з HTTP-кодом (docs/plans/refactor-clean-architecture.md). Сервіси кидають їх замість
 * `reply.code(…)`; глобальний обробник (`routes/errorHandler.ts`) відповідає `{ error: message }` з цим кодом.
 * Fastify-незалежні — сервісний шар не знає про HTTP-фреймворк, лише про код помилки.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — невалідний запит (поле, режим, напрям). */
export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

/** 404 — сутності немає. */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

/** 409 — конфлікт стану (паралельний збір, немає ключа AI). */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** 410 — ресурс застарів (план глибокого скану). */
export class GoneError extends HttpError {
  constructor(message: string) {
    super(410, message);
  }
}
