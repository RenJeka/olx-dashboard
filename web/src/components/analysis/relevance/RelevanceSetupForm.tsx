import {
  Box,
  Button,
  HStack,
  Input,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuSparkles, LuDownload } from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import type { useRelevanceFlow } from '../../../hooks/useRelevanceFlow';
import { useListingsUiStore } from '../../../stores/listingsUiStore';

interface Props {
  flow: ReturnType<typeof useRelevanceFlow>;
}

/**
 * Форма налаштування фільтрації релевантності: вибір товару, області дії та ручного або авто-запуску.
 */
export function RelevanceSetupForm({ flow }: Props) {
  const { state, actions, mutations } = flow;
  const statusFilter = useListingsUiStore((s) => s.statusFilter);
  const candidatesCount = state.preview?.candidates ?? null;

  return (
    <Stack gap={4}>
      <Box>
        <Text textStyle="sm" fontWeight="semibold" mb={1}>
          Цільовий товар
        </Text>
        <Input
          size="sm"
          value={state.target}
          onChange={(e) => actions.setTarget(e.target.value)}
          placeholder="Напр.: смартфон Apple iPhone 5 (не чохли/аксесуари/запчастини)"
        />
        <Text textStyle="xs" color="fg.muted" mt={1}>
          AI лишить тільки лоти, що ПРОДАЮТЬ цей товар. Решта (чохли, запчастини, згадки) —
          нерелевантні.
        </Text>
      </Box>

      <Box>
        <Text textStyle="xs" color="fg.muted" mb={1}>
          Обсяг
        </Text>
        <HStack gap={1} wrap="wrap">
          {state.selectedIds.length > 0 && (
            <Button
              size="xs"
              variant={state.scope === 'selected' ? 'solid' : 'outline'}
              colorPalette="blue"
              onClick={() => actions.setScope('selected')}
            >
              Вибрані ({state.selectedIds.length})
            </Button>
          )}
          {statusFilter !== 'all' && statusFilter !== 'ai_picks' && (
            <Button
              size="xs"
              variant={state.scope === 'tab' ? 'solid' : 'outline'}
              colorPalette="blue"
              onClick={() => actions.setScope('tab')}
            >
              Статус
            </Button>
          )}
          <Button
            size="xs"
            variant={state.scope === 'all' ? 'solid' : 'outline'}
            colorPalette="blue"
            onClick={() => actions.setScope('all')}
          >
            Весь пошук ({state.listings?.length ?? 0})
          </Button>
        </HStack>
        {state.preview && state.preview.autoRejected > 0 ? (
          <Text textStyle="xs" color="fg.muted" mt={1}>
            Всього <strong>{state.preview.total}</strong> · у ШІ піде{' '}
            <strong>{state.preview.candidates}</strong> · авто-відсіяно без ШІ{' '}
            <strong>{state.preview.autoRejected}</strong>.
          </Text>
        ) : (
          <Text textStyle="xs" color="fg.muted" mt={1}>
            До класифікації: <strong>{state.effectiveIds.length}</strong> оголошень.
          </Text>
        )}
        <Text textStyle="xs" color="fg.muted" mt={1}>
          Спершу спрацьовує швидкий авто-відсів без ШІ (бренд і номер моделі мають стояти
          поряд у тексті). У ШІ / ZIP-пакет потрапляють лише кандидати; решта одразу
          позначаються нерелевантними (їх видно у результаті й можна виправити).
        </Text>
      </Box>

      {state.apiAvailable && (
        <Button
          colorPalette="cyan"
          size="sm"
          alignSelf="start"
          loading={state.step === 'running'}
          disabled={state.effectiveIds.length === 0 || !state.target.trim()}
          onClick={actions.handleRun}
        >
          <LuSparkles /> Запустити (авто)
        </Button>
      )}

      {state.step === 'running' && state.progress && (
        <Stack gap={1}>
          <Text textStyle="xs" color="fg.muted">
            Опрацьовано {state.progress.done}/{state.progress.total}
          </Text>
          <Progress.Root
            size="xs"
            colorPalette="cyan"
            value={state.progress.total ? (state.progress.done / state.progress.total) * 100 : 0}
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        </Stack>
      )}

      <Box>
        <Text textStyle="xs" color="fg.muted" mb={2} fontWeight="semibold">
          Ручний режим (без API-ключа)
        </Text>
        <ManualAssistant
          title="Завантаж ZIP, проженеш через агента/чат, встав вміст output.json"
          parts={[]}
          pasteLabel="Додати відповідь"
          onSubmit={actions.handleImport}
          submitting={mutations.importRelevance.isPending}
          emptyHint={
            <Stack gap={2} align="start">
              <Text textStyle="xs" color="fg.muted">
                У ZIP — лише кандидати{candidatesCount != null ? ` (${candidatesCount})` : ''},
                готові `merge.py`/`verify.py` та інструкція. Агент класифікує чанки →
                `output.json`; встав його вміст нижче. Авто-відсіяні додадуться автоматично.
              </Text>
              <Button
                size="xs"
                variant="outline"
                disabled={state.effectiveIds.length === 0 || !state.target.trim()}
                onClick={actions.handleDownloadZip}
              >
                <LuDownload /> Завантажити ZIP-пакет
                {candidatesCount != null ? ` (${candidatesCount})` : ''}
              </Button>
            </Stack>
          }
        />
      </Box>
    </Stack>
  );
}
