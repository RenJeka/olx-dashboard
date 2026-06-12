// Одноразова міграція: текстові posted_at з HTML-fallback («30 травня 2026 р.»,
// «Сьогодні о 14:30») → ISO. Запуск: npm run migrate:posted-at
import { db } from './db/db.js';
import { parseOlxDate } from './scraper/dateParser.js';

interface Row {
  id: number;
  posted_at: string;
}

const rows = db
  .prepare(
    `SELECT id, posted_at FROM listings
     WHERE posted_at IS NOT NULL AND posted_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'`,
  )
  .all() as Row[];

const updateStmt = db.prepare('UPDATE listings SET posted_at = ? WHERE id = ?');

let converted = 0;
let nulled = 0;

const run = db.transaction((items: Row[]) => {
  for (const row of items) {
    const iso = parseOlxDate(row.posted_at);
    updateStmt.run(iso, row.id);
    if (iso !== null) converted++;
    else nulled++;
  }
});

run(rows);

console.log(
  `Міграція posted_at: знайдено ${rows.length} текстових значень, ` +
    `конвертовано ${converted}, занулено ${nulled}`,
);
