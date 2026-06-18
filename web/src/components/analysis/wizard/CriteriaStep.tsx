import {
  Button,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
  Wrap,
} from '@chakra-ui/react';
import {
  LuWandSparkles,
  LuRefreshCw,
  LuPlus,
} from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import { STATUS_LABELS } from '../../../utils/status';
import type { useWizardActions } from '../../../hooks/useWizardActions';

type Actions = ReturnType<typeof useWizardActions>;

interface Props {
  w: Actions;
}

/** Крок 1: вибір режиму, scope, критеріїв. */
export function CriteriaStep({ w }: Props) {
  const {
    mode, setMode,
    scope, setScope,
    available, selected,
    customInput, setCustomInput,
    modeLabel, chosenCount, tabCount, allIds,
    apiAvailable,
    toggleCriterion, addCustom,
    handleGenerateCriteria, generateCriteriaIsPending,
    openCriteriaAssistant,
    showCriteriaAssistant, criteriaParts,
    handleImportCriteria, importCriteriaIsPending,
    goToMatching, saveCriteriaIsPending,
    reset, bindSearch, computeDefaultScope,
    statusFilter, selectedIds,
  } = w;

  return (
    <Stack gap={4}>
      {/* Перемикачі режиму та scope */}
      <HStack gap={4} wrap="wrap">
        <HStack gap={1}>
          <Button size="xs" variant={mode === 'cons' ? 'solid' : 'outline'} colorPalette="red" onClick={() => setMode('cons')}>
            Мінуси
          </Button>
          <Button size="xs" variant={mode === 'pros' ? 'solid' : 'outline'} colorPalette="green" onClick={() => setMode('pros')}>
            Плюси
          </Button>
        </HStack>
        <HStack gap={1}>
          <Button
            size="xs"
            variant={scope === 'selected' ? 'solid' : 'outline'}
            colorPalette="blue"
            disabled={selectedIds.length === 0}
            onClick={() => setScope('selected')}
          >
            Вибрані ({selectedIds.length})
          </Button>
          {statusFilter !== 'all' && (
            <Button
              size="xs"
              variant={scope === 'tab' ? 'solid' : 'outline'}
              colorPalette="blue"
              onClick={() => setScope('tab')}
            >
              {statusFilter !== 'ai_picks' ? STATUS_LABELS[statusFilter as keyof typeof STATUS_LABELS] : 'Таб'} ({tabCount})
            </Button>
          )}
          <Button size="xs" variant={scope === 'all' ? 'solid' : 'outline'} colorPalette="blue" onClick={() => setScope('all')}>
            Весь пошук ({allIds.length})
          </Button>
        </HStack>
      </HStack>

      <Text textStyle="sm" color="fg.muted">
        Обери критерії, за якими шукати {modeLabel.toLowerCase()}. Tap по чипу — обрати/зняти.
      </Text>
      <Wrap gap={2}>
        {available.map((c) => (
          <Button
            key={c}
            size="xs"
            variant={selected.has(c) ? 'solid' : 'outline'}
            colorPalette={mode === 'cons' ? 'red' : 'green'}
            onClick={() => toggleCriterion(c)}
          >
            {c}
          </Button>
        ))}
        {available.length === 0 && (
          <Text textStyle="sm" color="fg.muted">
            Критеріїв ще немає — згенеруй або додай вручну.
          </Text>
        )}
      </Wrap>

      <HStack gap={2}>
        <Input
          size="sm"
          placeholder="Додати свій критерій…"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
        />
        <IconButton size="sm" variant="outline" aria-label="Додати" onClick={addCustom}>
          <LuPlus />
        </IconButton>
      </HStack>

      <HStack gap={2} wrap="wrap">
        {apiAvailable && (
          <>
            <Button size="sm" colorPalette="purple" onClick={handleGenerateCriteria} loading={generateCriteriaIsPending}>
              <LuWandSparkles /> Згенерувати критерії
            </Button>
            <Button size="sm" variant="ghost" onClick={handleGenerateCriteria} loading={generateCriteriaIsPending}>
              <LuRefreshCw /> Ще варіанти
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={openCriteriaAssistant}>
          Згенерувати вручну
        </Button>
      </HStack>

      {showCriteriaAssistant && (
        <ManualAssistant
          title="Помічник: генерація критеріїв"
          parts={criteriaParts}
          pasteLabel="Розпізнати критерії"
          onSubmit={handleImportCriteria}
          submitting={importCriteriaIsPending}
        />
      )}

      <HStack justify="space-between">
        <HStack gap={2}>
          <Text textStyle="sm" color="fg.muted">
            Обрано {chosenCount} із {available.length}
          </Text>
          <Button
            size="xs"
            variant="ghost"
            colorPalette="gray"
            onClick={() => {
              reset();
              bindSearch(w.searchId);
              setScope(computeDefaultScope());
            }}
          >
            Почати заново
          </Button>
        </HStack>
        <Button colorPalette="blue" onClick={goToMatching} loading={saveCriteriaIsPending}>
          Далі: пошук
        </Button>
      </HStack>
    </Stack>
  );
}
