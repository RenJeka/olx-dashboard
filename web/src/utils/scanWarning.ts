/**
 * Розбір технічного `scan_runs.warning` у людино-зрозумілу форму для панелі дій.
 * Warning — це `; `-зчеплений рядок фрагментів, які генерують scanner.ts (multi-query)
 * і graphql/fetcher.ts (split / window cap). Замість дослівної реконструкції витягуємо
 * значущі факти, дедуплікуємо й перекладаємо на наслідки для користувача.
 *
 * Джерела фрагментів (тримати синхронно з бекендом):
 * - `multi-query: N варіантів запиту змерджено` + `вікно покриття пропущено (union кількох видач)`
 * - `«variant»: split: K price buckets; coverage window skipped`
 * - `some buckets hit pagination/request cap`
 * - `graphql window cap hit at offset=N`
 * - `split skipped: no upper price bound`
 * - `graphql failed: ...; fallback html OK`
 */

export type ScanNoteKind =
  | 'coverage-skipped'
  | 'cap-hit'
  | 'html-fallback'
  | 'window-cap'
  | 'split'
  | 'multi-query'
  | 'no-price-bound'
  | 'generic';

export interface ScanWarningStat {
  value: number;
  /** Підпис-категорія під числом (родовий відмінок — читається під будь-яким числом). */
  label: string;
  kind: 'variants' | 'buckets';
}

export interface ScanWarningNote {
  kind: ScanNoteKind;
  /** 'attention' — є практичний наслідок/дія; 'info' — просто пояснення. */
  tone: 'attention' | 'info';
  title: string;
  detail: string;
}

export interface ParsedScanWarning {
  stats: ScanWarningStat[];
  notes: ScanWarningNote[];
  raw: string;
}

export interface ScanWarningContext {
  /** Скільки оголошень зараз є кандидатами на verify-прохід (для чесності CTA в нотатках). */
  verifyCandidates?: number;
}

export function parseScanWarning(raw: string, context: ScanWarningContext = {}): ParsedScanWarning {
  const text = raw ?? '';
  const lower = text.toLowerCase();

  const variantMatch = text.match(/multi-query:\s*(\d+)/i);
  const variantCount = variantMatch ? Number(variantMatch[1]) : 1;

  const bucketMatches = [...text.matchAll(/split:\s*(\d+)\s*price buckets/gi)];
  const totalBuckets = bucketMatches.reduce((sum, m) => sum + Number(m[1]), 0);
  const splitUsed = bucketMatches.length > 0;

  const coverageSkipped =
    lower.includes('coverage window skipped') || lower.includes('вікно покриття пропущено');
  const capHit = lower.includes('pagination/request cap');
  const windowCap = lower.includes('window cap hit');
  const htmlFallback = lower.includes('fallback html') || lower.includes('graphql failed');
  const noPriceBound = lower.includes('no upper price bound');

  const stats: ScanWarningStat[] = [];
  if (variantCount > 1) stats.push({ value: variantCount, label: 'варіантів запиту', kind: 'variants' });
  if (totalBuckets > 0) stats.push({ value: totalBuckets, label: 'цінових діапазонів', kind: 'buckets' });

  const notes: ScanWarningNote[] = [];

  // Дієві (attention) — спершу: мають практичний наслідок чи підказують дію.
  if (coverageSkipped) {
    const hasCandidates = (context.verifyCandidates ?? 0) > 0;
    notes.push({
      kind: 'coverage-skipped',
      tone: 'attention',
      title: 'Авто-вимкнення зниклих пропущено',
      detail: hasCandidates
        ? 'Цей скан об’єднав кілька видач, які не можна порівняти між собою, тож статуси «зникло» не оновлювались. Щоб підтвердити, що ще активне, запустіть «Перевірити неактивні».'
        : 'Цей скан об’єднав кілька видач, які не можна порівняти між собою, тож статуси «зникло» не оновлювались. Кнопка «Перевірити неактивні» поки порожня — кандидати з’являться самі, коли якісь оголошення не потраплять у видачу кілька днів поспіль.',
    });
  }
  if (capHit) {
    notes.push({
      kind: 'cap-hit',
      tone: 'attention',
      title: 'Сягнуто межі глибокого скану',
      detail:
        'Пошук дуже великий: збір зупинився на запобіжному ліміті (щоб не перевантажувати OLX), тож кілька оголошень із найгустіших цінових діапазонів могли не потрапити. Звузьте діапазон ціни у фільтрах і проскануйте сегменти окремо — повтор того самого скану впреться в ті самі ліміти.',
    });
  }
  if (htmlFallback) {
    notes.push({
      kind: 'html-fallback',
      tone: 'attention',
      title: 'Резервний метод збору (HTML)',
      detail:
        'GraphQL був недоступний — дані зібрано парсингом сторінки. Ціни й дати можуть бути неповними до наступного успішного скану.',
    });
  }

  // Інформаційні — пояснюють поведінку, дії не потребують.
  if (windowCap && !splitUsed) {
    notes.push({
      kind: 'window-cap',
      tone: 'info',
      title: 'Досягнуто межі видачі OLX',
      detail:
        'OLX віддає не більше ~1000 оголошень на один запит. Щоб зібрати глибше, скан розбиває видачу за ціною.',
    });
  }
  if (splitUsed) {
    notes.push({
      kind: 'split',
      tone: 'info',
      title: 'Видачу розбито за ціною',
      detail:
        'Великий пошук зібрано по кількох цінових діапазонах, щоб обійти межу OLX у ~1000 оголошень на запит.',
    });
  }
  if (variantCount > 1) {
    notes.push({
      kind: 'multi-query',
      tone: 'info',
      title: 'Синоніми запиту об’єднано',
      detail:
        'Основний запит і його синоніми просканували окремо й злили в один список без дублікатів.',
    });
  }
  if (noPriceBound) {
    notes.push({
      kind: 'no-price-bound',
      tone: 'info',
      title: 'Не визначено верхню межу ціни',
      detail: 'Розбиття за ціною пропущено — не вдалося визначити максимальну ціну у видачі.',
    });
  }

  // Невідомий формат — показуємо як є, щоб нічого не загубити.
  if (notes.length === 0 && text.trim() !== '') {
    notes.push({
      kind: 'generic',
      tone: 'info',
      title: 'Скан завершився із застереженням',
      detail: text,
    });
  }

  return { stats, notes, raw: text };
}
