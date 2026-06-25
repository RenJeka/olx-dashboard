// Одноразова міграція: текстові posted_at з HTML-fallback («30 травня 2026 р.»,
// «Сьогодні о 14:30») → ISO. Запуск: npm run migrate:posted-at
import { db, dbAll, initDb } from './db/db.js';
import { parseOlxDate } from './scraper/dateParser.js';

interface Row {
  id: number;
  posted_at: string;
}

await initDb();

const rows = await dbAll<Row>(
  `SELECT id, posted_at FROM listings
   WHERE posted_at IS NOT NULL AND posted_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'`,
);

let converted = 0;
let nulled = 0;

// Чистий набір UPDATE-ів без проміжних рішень на читаннях → batch у неявній транзакції.
const statements = rows.map((row) => {
  const iso = parseOlxDate(row.posted_at);
  if (iso !== null) converted++;
  else nulled++;
  return { sql: 'UPDATE listings SET posted_at = ? WHERE id = ?', args: [iso, row.id] };
});

if (statements.length > 0) {
  await db.batch(statements, 'write');
}

console.log(
  `Міграція posted_at: знайдено ${rows.length} текстових значень, ` +
    `конвертовано ${converted}, занулено ${nulled}`,
);
