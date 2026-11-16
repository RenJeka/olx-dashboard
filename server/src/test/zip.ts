// Читання ZIP у тестах (без залежності): імена й вміст файлів за центральним каталогом архіву.
import { inflateRawSync } from 'node:zlib';

const CENTRAL_SIGNATURE = 0x02014b50;
const METHOD_DEFLATE = 8;

/** Файли архіву в порядку запису: імʼя → текст (UTF-8). */
export function readZip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  for (let pos = buffer.indexOf('PK\x01\x02', 0, 'latin1'); pos >= 0 && buffer.readUInt32LE(pos) === CENTRAL_SIGNATURE; ) {
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);

    // Локальний заголовок: 30 байтів + імʼя + extra, далі дані.
    const dataStart =
      localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    files.set(name, (method === METHOD_DEFLATE ? inflateRawSync(data) : data).toString('utf8'));

    pos += 46 + nameLength + extraLength + commentLength;
    if (pos + 4 > buffer.length) break;
  }
  return files;
}
