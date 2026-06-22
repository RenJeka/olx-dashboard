import {
  Box,
  Button,
  HStack,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuSearch, LuDownload } from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import type { useWizard } from '../../../hooks/analysis/useWizard';

type Actions = ReturnType<typeof useWizard>;

interface Props {
  w: Actions;
}

/** Крок 2: запуск/імпорт аналізу (авто або ручний ZIP). */
export function MatchingStep({ w }: Props) {
  const {
    modeLabel, effectiveIds, accumulated,
    apiAvailable,
    analyzeProgress,
    runAutoAnalyze,
    zipDownloading, downloadZipPackage,
    showMatchAssistant,
    handleImportMatching, importAnalysisIsPending,
    setStep,
  } = w;

  return (
    <Stack gap={4}>
      <Text textStyle="sm" color="fg.muted">
        Пошук {modeLabel.toLowerCase()} у {effectiveIds.length} оголошеннях за обраними критеріями.
      </Text>

      {apiAvailable && (
        <Box>
          <Button colorPalette="purple" onClick={runAutoAnalyze} loading={analyzeProgress != null}>
            <LuSearch /> Знайти (авто)
          </Button>
          {analyzeProgress && (
            <Stack gap={1} mt={3}>
              <Text textStyle="xs" color="fg.muted">
                Опрацьовано {analyzeProgress.done}/{analyzeProgress.total}
              </Text>
              <Progress.Root
                size="xs"
                colorPalette="purple"
                value={analyzeProgress.total > 0 ? (analyzeProgress.done / analyzeProgress.total) * 100 : null}
              >
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            </Stack>
          )}
        </Box>
      )}

      <Button size="sm" variant="outline" onClick={downloadZipPackage} loading={zipDownloading}>
        <LuDownload /> Завантажити ZIP-пакет
      </Button>

      {showMatchAssistant && (
        <ManualAssistant
          title="Помічник: пошук збігів"
          parts={[]}
          pasteLabel="Додати відповідь"
          onSubmit={handleImportMatching}
          submitting={importAnalysisIsPending}
          emptyHint={
            <Text textStyle="xs" color="fg.muted">
              Завантаж ZIP, проженеш через Claude (Projects/Code за один прохід), встав
              єдиний JSON-результат нижче.
            </Text>
          }
          footer={
            <Text textStyle="xs" color="fg.muted">
              Опрацьовано {accumulated.length} оголошень
            </Text>
          }
        />
      )}

      <HStack justify="space-between">
        <Button variant="ghost" onClick={() => setStep(1)}>
          Назад
        </Button>
        <Button colorPalette="accent" disabled={accumulated.length === 0} onClick={() => setStep(3)}>
          Далі: перевірка ({accumulated.length})
        </Button>
      </HStack>
    </Stack>
  );
}
