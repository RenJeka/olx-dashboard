import { Box, Button, Stack, Text } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import { ScopeSelector } from '../ScopeSelector';
import type { useAiPicksFlow } from '../../../hooks/useAiPicksFlow';

type Flow = ReturnType<typeof useAiPicksFlow>;

interface Props {
  flow: Flow;
}

/** Крок idle: вибір режиму запуску AI-ранжування (авто або ручний). */
export function AiPicksIdleStep({ flow }: Props) {
  const {
    scope,
    setScope,
    counts,
    statusFilter,
    candidateCount,
    promptCount,
    useZip,
    PICK_TOP_N,
    PICK_CANDIDATES_LIMIT,
    prompt,
    loadingPrompt,
    loadPrompt,
    zipDownload,
    handleRun,
    handleImport,
    importIsPending,
  } = flow;

  const manualEmptyHint = useZip ? (
    zipDownload.downloaded ? (
      <Text textStyle="xs" color="fg.muted">
        ZIP завантажено. Опрацюй усі candidates/chunk-NNN.json за 2-етапною
        інструкцією у prompt.txt і встав сюди лише ОДНУ фінальну JSON-відповідь.
      </Text>
    ) : (
      <Button
        size="xs"
        variant="outline"
        loading={zipDownload.downloading}
        disabled={candidateCount === 0}
        onClick={zipDownload.download}
      >
        Завантажити ZIP-пакет
      </Button>
    )
  ) : (
    <Button
      size="xs"
      variant="outline"
      loading={loadingPrompt}
      disabled={candidateCount === 0}
      onClick={loadPrompt}
    >
      Завантажити промпт
    </Button>
  );

  return (
    <Stack gap={4}>
      <ScopeSelector value={scope} onChange={setScope} counts={counts} statusFilter={statusFilter} />

      <Text textStyle="sm" color="fg.muted">
        У пул ранжування піде <strong>{candidateCount}</strong> оголошень обраного обсягу, з них у
        промпт — <strong>{promptCount}</strong> найдешевших (ліміт {PICK_CANDIDATES_LIMIT}).
        AI обере та відсортує топ-{PICK_TOP_N} найкращих.
      </Text>

      <Button
        colorPalette="teal"
        size="sm"
        alignSelf="start"
        disabled={candidateCount === 0}
        onClick={handleRun}
      >
        <LuSparkles /> Запустити AI ранжування
      </Button>

      <Box>
        <Text textStyle="xs" color="fg.muted" mb={2} fontWeight="semibold">
          Ручний режим (без API-ключа)
        </Text>
        <ManualAssistant
          title={
            useZip
              ? 'Завантаж ZIP-пакет та вставте фінальну відповідь'
              : 'Скопіюй промпт та вставте відповідь'
          }
          parts={
            !useZip && prompt !== null
              ? [{ name: 'Промпт AI Вибір', content: prompt }]
              : []
          }
          pasteLabel="Застосувати відповідь"
          onSubmit={handleImport}
          submitting={importIsPending}
          emptyHint={manualEmptyHint}
        />
      </Box>
    </Stack>
  );
}
