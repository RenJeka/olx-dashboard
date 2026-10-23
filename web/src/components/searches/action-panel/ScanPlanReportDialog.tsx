import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { LuHistory, LuTriangleAlert } from 'react-icons/lu';
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
import { DIALOG_SIZE } from '../../../theme';
import type { ScanPlan } from '../../../types';
import { formatShortDateTime } from '../../../utils/format';
import { QuerySection } from './scan-plan/QuerySection';
import { ScanPlanSummary } from './scan-plan/ScanPlanSummary';
import { ScanPlanWarnings } from './scan-plan/ScanPlanWarnings';

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

/**
 * Звіт аналітичної фази глибокого скану (docs/plans/old/two-phase-deep-scan.md): показує точну
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
    <DialogRoot open={open} onOpenChange={(d) => onOpenChange(d.open)} size={DIALOG_SIZE.wide} placement="center" modal={false}>
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
                    {formatShortDateTime(analyzedAt)}
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
            <ScanPlanSummary plan={plan} priceFilterLabel={priceFilterLabel} />

            {/* Розбивка по варіантах запиту (синоніми) — кожен зі своїм ціновим спектром */}
            <Stack gap={4}>
              {plan.perQuery.map((q) => (
                <QuerySection key={q.query} q={q} showLabel={multi} />
              ))}
            </Stack>

            <ScanPlanWarnings warnings={plan.warnings} />
          </Stack>
        </DialogBody>

        <DialogFooter flexDirection="column" alignItems="stretch" gap={2}>
          <HStack justify="flex-end" gap={3} align="center">
            {!planValid && (
              <Tooltip
                content={`План застарів (діє ${SCAN_PLAN_TTL_MIN} хвилин і одноразовий) — запуск повторно зробить аналіз.`}
              >
                <HStack gap={1} cursor="help">
                  <Box as={LuTriangleAlert} color="warning.fg" fontSize="sm" />
                  <Text fontSize="2xs" color="warning.fg">
                    План застарів
                  </Text>
                </HStack>
              </Tooltip>
            )}
            <Button variant="outline" onClick={onNewAnalysis}>
              Зробити новий аналіз
            </Button>
            <Button colorPalette="warning" onClick={onConfirm}>
              Запустити повний скан
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
