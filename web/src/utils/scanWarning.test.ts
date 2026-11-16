import { describe, expect } from 'vitest';
import { makeScanWarning, SCAN_WARNING_PARTS as PARTS } from '../test/factories';
import { runCases } from '../test/table';
import { parseScanWarning, type ScanWarningContext } from './scanWarning';

// Перевіряємо розбір (вид і тон нотаток, числа), а не тексти для людини.
const kinds = (raw: string) => parseScanWarning(raw).notes.map((n) => n.kind);
const stats = (raw: string) => parseScanWarning(raw).stats.map((s) => [s.kind, s.value]);
const coverageDetail = (context?: ScanWarningContext) =>
  parseScanWarning(PARTS.unionCoverageSkipped, context).notes[0]?.detail;

const synonyms = makeScanWarning(PARTS.multiQuery(3), PARTS.unionCoverageSkipped);
const splitScan = makeScanWarning(PARTS.multiQuery(2), PARTS.split('iphone 13', 4), PARTS.split('айфон 13', 6), PARTS.capHit);

describe('scanWarning', () => {
  runCases([
    { name: 'синоніми — нотатки: пропуск покриття й об’єднання', run: () => kinds(synonyms), expected: ['coverage-skipped', 'multi-query'] },
    { name: 'синоніми — число варіантів', run: () => stats(synonyms), expected: [['variants', 3]] },
    { name: 'розбиття за ціною — діапазони варіантів додаються', run: () => stats(splitScan), expected: [['variants', 2], ['buckets', 10]] },
    {
      name: 'розбиття за ціною — нотатки: спершу дієві, далі пояснення',
      run: () => parseScanWarning(splitScan).notes.map((n) => n.tone),
      expected: ['attention', 'attention', 'info', 'info'],
    },
    {
      name: 'межа глибокого скану — дієва нотатка',
      run: () => parseScanWarning(PARTS.capHit).notes,
      expected: [expect.objectContaining({ kind: 'cap-hit', tone: 'attention' })],
    },
    { name: 'межа видачі OLX без розбиття', run: () => kinds(PARTS.windowCap), expected: ['window-cap'] },
    {
      name: 'межа видачі OLX з розбиттям — окремої нотатки немає',
      run: () => kinds(makeScanWarning(PARTS.windowCap, PARTS.split('iphone 13', 4))),
      expected: ['coverage-skipped', 'split'],
    },
    { name: 'резервний метод збору', run: () => kinds(PARTS.htmlFallback), expected: ['html-fallback'] },
    { name: 'верхню межу ціни не визначено', run: () => kinds(PARTS.noPriceBound), expected: ['no-price-bound'] },
    {
      name: 'пропуск покриття — порада залежить від кандидатів на перевірку',
      run: () => coverageDetail({ verifyCandidates: 2 }) !== coverageDetail(),
      expected: true,
    },
    {
      name: 'невідомий формат — показуємо як є',
      run: () => parseScanWarning('щось нове').notes,
      expected: [expect.objectContaining({ kind: 'generic', detail: 'щось нове' })],
    },
    { name: 'без попередження', run: () => parseScanWarning(''), expected: { stats: [], notes: [], raw: '' } },
  ]);
});
