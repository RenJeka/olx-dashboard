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
import { ScopeSelector } from '../ScopeSelector';
import { Tooltip } from '../../ui/tooltip';
import { sortAlpha } from '../../../utils/sort';
import type { useWizard } from '../../../hooks/analysis/useWizard';

type Actions = ReturnType<typeof useWizard>;

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
    modeLabel, chosenCount, counts,
    apiAvailable,
    toggleCriterion, addCustom,
    handleGenerateCriteria, generateCriteriaIsPending,
    openCriteriaAssistant,
    showCriteriaAssistant, criteriaParts,
    handleImportCriteria, importCriteriaIsPending,
    goToMatching, saveCriteriaIsPending,
    reset, bindSearch, computeDefaultScope,
    statusFilter,
  } = w;

  return (
    <Stack gap={4}>
      {/* Перемикач режиму */}
      <HStack gap={1}>
        <Button size="xs" variant={mode === 'cons' ? 'solid' : 'outline'} colorPalette="danger" onClick={() => setMode('cons')}>
          Мінуси
        </Button>
        <Button size="xs" variant={mode === 'pros' ? 'solid' : 'outline'} colorPalette="success" onClick={() => setMode('pros')}>
          Плюси
        </Button>
      </HStack>

      {/* Перемикач обсягу */}
      <ScopeSelector value={scope} onChange={setScope} counts={counts} statusFilter={statusFilter} />

      <Text textStyle="sm" color="fg.muted">
        Обери критерії, за якими шукати {modeLabel.toLowerCase()}. Tap по чипу — обрати/зняти.
      </Text>
      <Wrap gap={2}>
        {sortAlpha(available).map((c) => (
          <Tooltip key={c} content={c} openDelay={300}>
            <Button
              size="xs"
              variant={selected.has(c) ? 'solid' : 'outline'}
              colorPalette={mode === 'cons' ? 'danger' : 'success'}
              onClick={() => toggleCriterion(c)}
              maxW="260px"
            >
              <Text as="span" lineClamp={1}>
                {c}
              </Text>
            </Button>
          </Tooltip>
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
        <Button colorPalette="accent" onClick={goToMatching} loading={saveCriteriaIsPending}>
          Далі: пошук
        </Button>
      </HStack>
    </Stack>
  );
}
