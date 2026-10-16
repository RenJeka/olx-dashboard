import { createClient, type Client } from '@libsql/client';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COPY_PAGE_SIZE, copyDatabase } from './copyDb.js';

const files: string[] = [];
const clients: Client[] = [];

function tempClient(label: string): Client {
  // Префікс тимчасових БД тестів: залишки прибирає src/test/globalSetup.ts.
  const file = join(tmpdir(), `olx-dashboard-test-copy-${label}-${process.pid}-${Date.now()}.db`);
  files.push(file);
  const client = createClient({ url: `file:${file}`, intMode: 'bigint' });
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  for (const f of files.splice(0)) {
    try {
      rmSync(f, { force: true });
    } catch {
      // Windows: libSQL тримає файл до виходу з процесу — прибере globalSetup наступного прогону.
    }
  }
});

describe('copyDatabase', () => {
  it('копіює схему, усі сторінки рядків, NULL/BLOB/великі цілі та індекси', async () => {
    const source = tempClient('src');
    await source.batch(
      [
        'CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
        `CREATE TABLE items (id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
           big INTEGER, data BLOB, note TEXT, olx_id INTEGER UNIQUE)`,
        'CREATE INDEX idx_items_project ON items(project_id)',
        "INSERT INTO projects (id, name) VALUES (1, 'a'), (7, 'b')",
      ],
      'write',
    );
    const total = COPY_PAGE_SIZE * 2 + 5;
    await source.batch(
      Array.from({ length: total }, (_, i) => ({
        sql: 'INSERT INTO items (id, project_id, big, data, note, olx_id) VALUES (?, ?, ?, ?, ?, ?)',
        args: [i * 3 + 1, i % 2 ? 7 : 1, 9007199254740993n + BigInt(i), new Uint8Array([i % 256, 1]), i % 5 ? `n${i}` : null, 1000 + i],
      })),
      'write',
    );

    const target = tempClient('dst');
    const result = await copyDatabase(source, target);

    expect(result).toEqual([
      { table: 'projects', rows: 2 },
      { table: 'items', rows: total },
    ]);
    const dump = async (c: Client) =>
      (await c.execute('SELECT id, project_id, big, hex(data) AS data, note, olx_id FROM items ORDER BY id')).rows.map(
        (r) => ({ ...r }),
      );
    expect(await dump(target)).toEqual(await dump(source));

    const index = await target.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_items_project'");
    expect(index.rows).toHaveLength(1);
  });

  it('порожня таблиця — 0 рядків, схема створена', async () => {
    const source = tempClient('src');
    await source.execute('CREATE TABLE logs (id INTEGER PRIMARY KEY, msg TEXT)');
    const target = tempClient('dst');

    expect(await copyDatabase(source, target)).toEqual([{ table: 'logs', rows: 0 }]);
    const t = await target.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'logs'");
    expect(t.rows).toHaveLength(1);
  });
});
