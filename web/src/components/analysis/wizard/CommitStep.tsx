import {
  Button,
  HStack,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { useWizardActions } from '../../../hooks/analysis/useWizardActions';

type Actions = ReturnType<typeof useWizardActions>;

interface Props {
  w: Actions;
  onClose: () => void;
}

/** Крок 4: вибір merge-режиму та запис результатів у БД. */
export function CommitStep({ w, onClose }: Props) {
  const {
    modeLabel, commitItems, overwriteCount,
    commitProgress,
    mergeMode, setMergeMode,
    handleCommitClick,
    setStep,
  } = w;

  return (
    <Stack gap={4}>
      <Text textStyle="sm">
        Записати {modeLabel.toLowerCase()} у таблицю для {commitItems.length} оголошень?
      </Text>

      <Stack gap={1}>
        <Text textStyle="xs" color="fg.muted">
          Режим запису в поле «{modeLabel}»:
        </Text>
        <HStack gap={1}>
          <Button
            size="xs"
            variant={mergeMode === 'append' ? 'solid' : 'outline'}
            colorPalette="blue"
            onClick={() => setMergeMode('append')}
          >
            Додати до наявних
          </Button>
          <Button
            size="xs"
            variant={mergeMode === 'replace' ? 'solid' : 'outline'}
            colorPalette="orange"
            onClick={() => setMergeMode('replace')}
          >
            Перезаписати
          </Button>
        </HStack>
      </Stack>

      {mergeMode === 'append' ? (
        <Text textStyle="sm" color="fg.muted">
          Нові пункти буде додано до наявних значень (без дублікатів). Нічого не затирається.
        </Text>
      ) : (
        overwriteCount > 0 && (
          <Text textStyle="sm" color="orange.fg">
            Увага: у {overwriteCount} оголошень поле «{modeLabel}» вже заповнене — буде перезаписано.
          </Text>
        )
      )}
      {commitProgress && (
        <Stack gap={1}>
          <Text textStyle="xs" color="fg.muted">
            Записано {commitProgress.done}/{commitProgress.total}
          </Text>
          <Progress.Root size="xs" colorPalette="blue" value={(commitProgress.done / commitProgress.total) * 100}>
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        </Stack>
      )}
      <HStack justify="space-between">
        <Button variant="ghost" onClick={() => setStep(3)}>
          Назад
        </Button>
        <HStack gap={2}>
          <Button variant="outline" onClick={onClose}>
            Відмінити
          </Button>
          <Button colorPalette="blue" onClick={() => handleCommitClick(onClose)} loading={commitProgress != null}>
            {mergeMode === 'append'
              ? `Додати ${modeLabel.toLowerCase()} у таблицю`
              : `Перезаписати ${modeLabel.toLowerCase()} у таблиці`}
          </Button>
        </HStack>
      </HStack>
    </Stack>
  );
}
