// Спільна HTTP-механіка маршрутів: розбір типових полів тіла й відповідь ZIP-архівом.
import { ZipArchive } from 'archiver';
import type { FastifyReply, FastifyRequest } from 'fastify';

const MIME_ZIP = 'application/zip';

/** Список числових id з тіла запиту; не масив → порожній, нечислові елементи відкидаються. */
export function parseIds(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
}

/** Файл архіву: шлях усередині ZIP і вміст. */
export interface ZipEntry {
  name: string;
  content: string | Buffer;
}

/** Відповідь-завантаження: ZIP із `entries` у заданому порядку під іменем `filename`. */
export function sendZip(
  req: FastifyRequest,
  reply: FastifyReply,
  filename: string,
  entries: ZipEntry[],
): FastifyReply {
  const archive = new ZipArchive();
  archive.on('error', (err: Error) => req.log.error(err));
  for (const { name, content } of entries) archive.append(content, { name });
  void archive.finalize();

  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  reply.type(MIME_ZIP);
  return reply.send(archive);
}
