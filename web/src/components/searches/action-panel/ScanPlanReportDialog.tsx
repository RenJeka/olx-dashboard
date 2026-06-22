import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { LuHistory, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { Tooltip } from '../../ui/tooltip';
import { SCAN_PLAN_TTL_MIN } from '../../../constants';
import type { ScanPlan, ScanPlanQuery } from '../../../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: ScanPlan | null;
  onConfirm: () => void;
  /** Зробити новий аналіз (перезондувати) — замість показу збереженого. */
  onNewAnalysis: () => void;
  /** false — planToken протермінований: можна лише переглянути, запуск недоступний. */
  planValid: boolean;
  /** Коли цей аналіз зроблено (ISO) — показуємо для збереженого звіту. */
  analyzedAt: string | null;
  /** Людиномовний активний фільтр ціни пошуку (напр. «200 – 800 грн») або null — фільтра немає. */
  priceFilterLabel: string | null;
}

function formatNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

function formatDuration(sec: number): string {
  if (sec < 60) return `~${Math.max(1, Math.round(sec))} с`;
  return `~${Math.round(sec / 60)} хв`;
}

function formatAnalyzedAt(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Людиномовний переклад внутрішніх fallbackReason з аналітичної фази (scanner.ts/fetcher.ts). */
function describeFallback(reason: string): string {
  if (reason === 'no upper price bound') {
    return 'не вдалося визначити верхню межу ціни — повний скан пройде без розбиття на діапазони';
  }
  if (reason.startsWith('graphql analyze failed')) {
    return 'аналіз GraphQL не вдався — повний скан спробує ще раз і перейде на HTML, якщо потрібно';
  }
  return reason;
}

/** Внутрішній маркер у тексті серверного warning — рендериться скорочено з повним поясненням у тултіпі. */
const COVERAGE_WARNING_PREFIX = 'вікно покриття буде пропущено';

/** Іконка «i» з тултіпом — для виносу довшого пояснення з основного тексту звіту. */
function InfoTooltip({ content }: { content: React.ReactNode }) {
  return (
    <Tooltip content={content} contentProps={{ maxW: '280px' }}>
      <Box as={LuInfo} display="inline-block" color="fg.muted" fontSize="xs" verticalAlign="middle" cursor="help" />
    </Tooltip>
  );
}

/** Невелика статистична картка в стилі ScanWarningSummary (orange.subtle + мono-цифра). */
function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap={0} lineHeight="1.1" minW="20" px={3} py={2} rounded="md" bg="orange.subtle" borderWidth="1px" borderColor="orange.muted">
      <Text fontSize="lg" fontWeight="bold" fontFamily="mono" color="orange.fg">
        {value}
      </Text>
      <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
    </Stack>
  );
}

/**
 * Сигнатурний елемент звіту: «ціновий спектр» — горизонтальна стрічка на весь ціновий
 * діапазон варіанта запиту. Ширина сегмента ∝ ширині цінового діапазону бакету, інтенсивність
 * ∝ кількості оголошень у ньому. `noSplit` — суцільний блок без розбиття (малий пошук).
 */
function PriceSpectrum({ q }: { q: ScanPlanQuery }) {
  if (q.noSplit) {
    return (
      <HStack
        h="28px"
        rounded="md"
        bg="orange.subtle"
        borderWidth="1px"
        borderColor="orange.muted"
        px={3}
        role="img"
        aria-label={q.rootCount != null ? `Без розбиття: ${q.rootCount} оголошень` : 'Без розбиття на цінові діапазони'}
      >
        {q.rootCount != null && (
          <Text fontSize="2xs" color="orange.fg" fontWeight="semibold">
            {formatNumber(q.rootCount)} оголошень
          </Text>
        )}
      </HStack>
    );
  }

  const maxCount = Math.max(1, ...q.buckets.map((b) => b.count));

  return (
    <HStack
      gap="2px"
      h="28px"
      w="full"
      role="img"
      aria-label={`Ціновий спектр: ${q.buckets.length} діапазонів від ${formatNumber(q.buckets[0]?.from ?? 0)} грн`}
    >
      {q.buckets.map((b, idx) => {
        const width = Math.max(b.to != null ? b.to - b.from : 1, 1);
        const intensity = 0.3 + 0.7 * (b.count / maxCount);
        const rangeLabel = `${formatNumber(b.from)}–${b.to != null ? formatNumber(b.to) : '∞'} грн`;
        return (
          <Box
            key={idx}
            flex={width}
            minW="3px"
            h="full"
            rounded="sm"
            bg="orange.solid"
            opacity={intensity}
            title={`${rangeLabel}: ${formatNumber(b.count)} оголошень`}
            aria-label={`${rangeLabel}: ${formatNumber(b.count)} оголошень`}
          />
        );
      })}
    </HStack>
  );
}

function QuerySection({ q, showLabel }: { q: ScanPlanQuery; showLabel: boolean }) {
  return (
    <Stack gap={1.5}>
      {showLabel && (
        <HStack justify="space-between">
          <Text fontSize="xs" fontWeight="semibold" color="fg.default" lineClamp={1}>
            «{q.query}»
          </Text>
          <Text fontSize="2xs" color="fg.muted" flexShrink={0}>
            {q.rootCount != null ? `${formatNumber(q.rootCount)} оголошень` : '—'}
            {q.buckets.length > 1 ? ` · ${q.buckets.length} діапазонів` : ''}
          </Text>
        </HStack>
      )}
      <PriceSpectrum q={q} />
      {showLabel && q.sampleUnique != null && (
        <Text fontSize="2xs" color="fg.muted">
          внесок: ~{formatNumber(q.sampleUnique)} унікальних у вибірці
        </Text>
      )}
      {q.fallbackReason && (
        <HStack gap={1.5} align="start">
          <Box as={LuTriangleAlert} color="orange.fg" fontSize="xs" mt="2px" flexShrink={0} />
          <Text fontSize="2xs" color="orange.fg" lineHeight="1.4">
            {describeFallback(q.fallbackReason)}
          </Text>
        </HStack>
      )}
    </Stack>
  );
}

/**
 * Звіт аналітичної фази глибокого скану (docs/plans/two-phase-deep-scan.md): показує точну
 * картину перед запуском повного скану — ETA, скільки оголошень/запитів/діапазонів, оцінку
 * нових, і ціновий спектр на кожен варіант запиту (основний query + синоніми). Жодного «Більше
 * не питати» — звіт інформативний, не повторюване підтвердження.
 */
export function ScanPlanReportDialog({
  open,
  onOpenChange,
  plan,
  onConfirm,
  onNewAnalysis,
  planValid,
  analyzedAt,
  priceFilterLabel,
}: Props) {
  if (!plan) return null;

  const multi = plan.perQuery.length > 1;

  return (
    // modal={false}: цей діалог відкривається ПОВЕРХ модалки скану. Із modal=true Ark запускає
    // hideOthers і ставить aria-hidden на модалку скану; при закритті звіту cleanup не знімає його —
    // модалка скану лишається inert і блокує всі кліки (не зупинити скан, не закрити). modal=false
    // не чіпає сусідню модалку, тож після закриття звіту скан повністю інтерактивний.
    <DialogRoot open={open} onOpenChange={(d) => onOpenChange(d.open)} size="lg" placement="center" modal={false}>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <HStack justify="space-between" align="center" wrap="wrap" gap={2}>
            <DialogTitle>Аналіз перед сканом</DialogTitle>
            {analyzedAt && (
              <Tooltip content="Збережений аналіз — дані не оновлювались із моменту зондування. Нижче картина останнього аналізу.">
                <HStack
                  gap={1.5}
                  px={2.5}
                  py={1}
                  rounded="full"
                  bg="bg.muted"
                  borderWidth="1px"
                  borderColor="border.subtle"
                  cursor="help"
                  flexShrink={0}
                >
                  <Box as={LuHistory} fontSize="xs" color="fg.muted" />
                  <Text fontSize="2xs" fontFamily="mono" fontWeight="medium" color="fg.muted" letterSpacing="wide">
                    {formatAnalyzedAt(analyzedAt)}
                  </Text>
                </HStack>
              </Tooltip>
            )}
          </HStack>
          {!analyzedAt && (
            <Text textStyle="xs" color="fg.muted" mt={1}>
              Видачу й цінові діапазони вже зондовано — нижче точна картина перед повним сканом.
            </Text>
          )}
        </DialogHeader>

        <DialogBody pb={6}>
          <Stack gap={5}>
            {/* Hero: ETA + опорні числа */}
            <Stack gap={3}>
              <Stack gap={0}>
                <Text fontSize="4xl" fontWeight="bold" fontFamily="mono" color="orange.fg" lineHeight="1">
                  {formatDuration(plan.estimatedDurationSec)}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  орієнтовний час повного скану
                </Text>
              </Stack>
              <HStack gap={2} wrap="wrap">
                {/* Для кількох синонімів головне число — оцінка унікальних після дедупу;
                    сума по варіантах стає вторинною з явною міткою «з дублями». */}
                {multi && plan.estimatedUnique != null && (
                  <StatChip value={`≈ ${formatNumber(plan.estimatedUnique)}`} label="унікальних (оцінка)" />
                )}
                <StatChip
                  value={formatNumber(plan.totalListings)}
                  label={multi ? 'сума варіантів · з дублями' : 'оголошень'}
                />
                <StatChip value={formatNumber(plan.remainingRequests)} label="запитів лишилось" />
                {plan.totalBuckets > 0 && (
                  <StatChip value={formatNumber(plan.totalBuckets)} label="діапазонів" />
                )}
                {plan.estimatedNew != null && (
                  <StatChip
                    value={`≈ ${formatNumber(plan.estimatedNew)}`}
                    label={plan.estimatedNewIsSample ? '~нових (за вибіркою)' : '~нових'}
                  />
                )}
              </HStack>
              {multi && (
                <HStack gap={1} align="center">
                  <Text textStyle="2xs" color="fg.muted">
                    «Сума варіантів» рахує дублі між синонімами двічі.
                  </Text>
                  <InfoTooltip
                    content={
                      <Stack gap={1.5}>
                        <Text fontSize="2xs">
                          Те саме оголошення під «біговел» і «беговел» враховане окремо. У базі
                          після злиття по olx_id лишиться
                          {plan.estimatedUnique != null ? ` ≈ ${formatNumber(plan.estimatedUnique)} ` : ' '}
                          унікальних.
                        </Text>
                        <Text fontSize="2xs">
                          На сайті OLX один рядок пошуку вже об'єднує словоформи, тож його число
                          більше за окремий синонім, але менше за цю суму — це не пропажа даних.
                        </Text>
                      </Stack>
                    }
                  />
                </HStack>
              )}
              {priceFilterLabel && (
                <HStack
                  gap={1.5}
                  align="start"
                  p={2.5}
                  rounded="md"
                  bg="bg.subtle"
                  borderWidth="1px"
                  borderColor="border.muted"
                >
                  <Box as={LuInfo} color="fg.muted" fontSize="xs" mt="2px" flexShrink={0} />
                  <Text fontSize="2xs" color="fg.default" lineHeight="1.4">
                    Усі числа — лише в межах вашого фільтра ціни{' '}
                    <Text as="span" fontWeight="semibold">{priceFilterLabel}</Text>.
                    {plan.unfilteredTotal != null && (
                      <>
                        {' '}На OLX без фільтра ціни (по «{plan.perQuery[0]?.query}») —{' '}
                        <Text as="span" fontWeight="semibold">~{formatNumber(plan.unfilteredTotal)}</Text>.
                        Менше число у звіті — це ваш фільтр, а не недозбір.
                      </>
                    )}
                  </Text>
                </HStack>
              )}
              {plan.lastScanUnique != null && (
                <Text textStyle="2xs" color="fg.muted">
                  Минулий скан:{' '}
                  {plan.lastScanRaw != null ? `${formatNumber(plan.lastScanRaw)} сирих → ` : ''}
                  {formatNumber(plan.lastScanUnique)} унікальних у базі.
                </Text>
              )}
            </Stack>

            {/* Розбивка по варіантах запиту (синоніми) — кожен зі своїм ціновим спектром */}
            <Stack gap={4}>
              {plan.perQuery.map((q) => (
                <QuerySection key={q.query} q={q} showLabel={multi} />
              ))}
            </Stack>

            {plan.warnings.length > 0 && (
              <Stack gap={1.5} p={3} rounded="lg" bg="orange.subtle/40" borderWidth="1px" borderColor="orange.muted">
                {plan.warnings.map((w, idx) => {
                  const isCoverage = w.startsWith(COVERAGE_WARNING_PREFIX);
                  return (
                    <HStack key={idx} gap={1.5} align="start">
                      <Box as={LuTriangleAlert} color="orange.fg" fontSize="xs" mt="2px" flexShrink={0} />
                      <Text fontSize="xs" color="orange.fg" lineHeight="1.4">
                        {isCoverage ? 'Вікно покриття пропущено.' : w}
                      </Text>
                      {isCoverage && (
                        <InfoTooltip content="Декілька варіантів запиту (синоніми) дають об'єднану видачу, не відсортовану глобально за датою підняття, тож авто-вимкнення зниклих оголошень за цим сканом не спрацює. Живість таких оголошень перевіряє ручний прохід «Перевірити неактивні»." />
                      )}
                    </HStack>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogBody>

        <DialogFooter flexDirection="column" alignItems="stretch" gap={2}>
          <HStack justify="flex-end" gap={3} align="center">
            {!planValid && (
              <Tooltip
                content={`План застарів (діє ${SCAN_PLAN_TTL_MIN} хвилин і одноразовий) — запуск повторно зробить аналіз.`}
              >
                <HStack gap={1} cursor="help">
                  <Box as={LuTriangleAlert} color="orange.fg" fontSize="sm" />
                  <Text fontSize="2xs" color="orange.fg">
                    План застарів
                  </Text>
                </HStack>
              </Tooltip>
            )}
            <Button variant="outline" onClick={onNewAnalysis}>
              Зробити новий аналіз
            </Button>
            <Button colorPalette="orange" onClick={onConfirm}>
              Запустити повний скан
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
