import type { RefObject } from 'react';
import { Badge, Button, HStack, Stack, Text, Wrap } from '@chakra-ui/react';
import { LuListChecks } from 'react-icons/lu';
import { ModeToggle } from '../ModeToggle';
import { CriteriaInputBar } from '../criteria/CriteriaInputBar';
import { ScopeSelector } from '../ScopeSelector';
import { Tooltip } from '../../ui/tooltip';
import { MODE_PALETTE } from '../../../constants';
import { categoriesFirst } from '../../../utils/criteria';
import { sortAlpha } from '../../../utils/sort';
import type { useWizard } from '../../../hooks/analysis/useWizard';

type Actions = ReturnType<typeof useWizard>;

interface Props {
  w: Actions;
  /** Відкрити вікно «Плюси та мінуси» (перегляд, об'єднання, видалення). */
  onManageCriteria: () => void;
  /** Контент модалки майстра — для вікна вибору згенерованих критеріїв поверх неї. */
  portalRef: RefObject<HTMLElement | null>;
}

/** Крок 1: вибір режиму, scope, критеріїв (категорій пошуку). */
export function CriteriaStep({ w, onManageCriteria, portalRef }: Props) {
  const {
    mode, setMode,
    scope, setScope,
    available, selected,
    customInput, setCustomInput,
    modeLabel, chosenCount, counts,
    apiAvailable,
    toggleCriterion, addCustom,
    criteriaGeneration,
    goToMatching, saveCriteriaIsPending,
    reset, bindSearch, computeDefaultScope,
    statusFilter,
    savedGroups,
  } = w;
  const aliasesOf = new Map(savedGroups.map((g) => [g.name, g.aliases]));
  // Як у вікні «Плюси та мінуси»: спершу категорії (є синоніми), далі окремі.
  const chips = categoriesFirst(available, (c) => (aliasesOf.get(c)?.length ?? 0) > 0).flat();

  return (
    <Stack gap={4}>
      {/* Перемикач режиму */}
      <ModeToggle mode={mode} onChange={setMode} />

      {/* Перемикач обсягу */}
      <ScopeSelector value={scope} onChange={setScope} counts={counts} statusFilter={statusFilter} />

      <HStack justify="space-between" gap={2} wrap="wrap">
        <Text textStyle="sm" color="fg.muted">
          Обери критерії, за якими шукати {modeLabel.toLowerCase()}. Tap по чипу — обрати/зняти.
        </Text>
        <Button size="xs" variant="ghost" onClick={onManageCriteria}>
          <LuListChecks /> Керувати плюсами та мінусами…
        </Button>
      </HStack>
      <Wrap gap={2}>
        {chips.map((c) => {
          const aliases = aliasesOf.get(c) ?? [];
          return (
            <Tooltip
              key={c}
              content={aliases.length > 0 ? `${c} · сюди ж: ${sortAlpha(aliases).join(', ')}` : c}
              openDelay={300}
            >
              <Button
                size="xs"
                variant={selected.has(c) ? 'solid' : 'outline'}
                colorPalette={MODE_PALETTE[mode]}
                onClick={() => toggleCriterion(c)}
                maxW="260px"
              >
                <Text as="span" lineClamp={1}>
                  {c}
                </Text>
                {aliases.length > 0 && (
                  <Badge size="xs" variant="subtle">
                    +{aliases.length}
                  </Badge>
                )}
              </Button>
            </Tooltip>
          );
        })}
        {available.length === 0 && (
          <Text textStyle="sm" color="fg.muted">
            Критеріїв ще немає — згенеруй або додай вручну.
          </Text>
        )}
      </Wrap>

      <CriteriaInputBar
        value={customInput}
        onChange={setCustomInput}
        onAdd={addCustom}
        apiAvailable={apiAvailable}
        generation={criteriaGeneration}
        portalRef={portalRef}
      />

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
