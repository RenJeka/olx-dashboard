import { useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { ManualAssistant } from './ManualAssistant';
import { AiRankCard } from './AiRankCard';
import { toaster } from '../ui/toaster';
import {
  useListings,
  useRunAiPicks,
  useImportAiPicks,
  useCommitAiPicks,
  fetchAiPicksPrompt,
} from '../../api/client';
import { loadAnalysisModel } from '../../utils/storage';
import { isMutedStatus } from '../../utils/status';
import type { PickItem, PickResult, Search } from '../../types';

interface Props {
  search: Search;
}

type Step = 'idle' | 'running' | 'done';

export function AiPicksDialog({ search }: Props) {
  const { data: listings } = useListings(search.id);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [pendingPicks, setPendingPicks] = useState<PickItem[]>([]);
  const [summary, setSummary] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const runAiPicks = useRunAiPicks();
  const importAiPicks = useImportAiPicks();
  const commitAiPicks = useCommitAiPicks();

  const candidateCount = (listings ?? []).filter(
    (l) => !l.cons && !isMutedStatus(l.status) && l.filtered_out === 0,
  ).length;

  function applyResult(result: PickResult) {
    setPendingPicks(result.picks);
    setSummary(result.summary);
    setStep('done');
  }

  async function handleRun() {
    setStep('running');
    try {
      const result = await runAiPicks.mutateAsync({
        searchId: search.id,
        model: loadAnalysisModel(),
      });
      applyResult(result);
    } catch (err) {
      setStep('idle');
      toaster.create({
        type: 'error',
        title: 'Помилка AI-ранжування',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleImport(raw: string) {
    try {
      const result = await importAiPicks.mutateAsync({ searchId: search.id, raw });
      applyResult(result);
    } catch (err) {
      toaster.create({
        type: 'error',
        title: 'Помилка парсингу відповіді',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCommit() {
    try {
      await commitAiPicks.mutateAsync({ searchId: search.id, picks: pendingPicks });
      toaster.create({ type: 'success', title: `Збережено ${pendingPicks.length} оголошень` });
      setOpen(false);
      reset();
    } catch (err) {
      toaster.create({
        type: 'error',
        title: 'Помилка збереження',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function loadPrompt() {
    if (prompt !== null) return;
    setLoadingPrompt(true);
    try {
      const { prompt: p } = await fetchAiPicksPrompt(search.id);
      setPrompt(p);
    } catch {
      setPrompt('');
    } finally {
      setLoadingPrompt(false);
    }
  }

  function reset() {
    setStep('idle');
    setPendingPicks([]);
    setSummary('');
    setPrompt(null);
  }

  const listingsMap = new Map((listings ?? []).map((l) => [l.id, l]));

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (!d.open) reset();
      }}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="teal">
          <LuSparkles /> AI Вибір
        </Button>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>AI Вибір — {search.name}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          {step === 'idle' && (
            <Stack gap={4}>
              <Text textStyle="sm" color="fg.muted">
                Кандидати для ранжування: оголошення без мінусів, активні, не відфільтровані.
                Знайдено <strong>{candidateCount}</strong> кандидатів.
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
                  title="Скопіюй промпт та вставте відповідь"
                  parts={
                    prompt !== null
                      ? [{ name: 'Промпт AI Вибір', content: prompt }]
                      : []
                  }
                  pasteLabel="Застосувати відповідь"
                  onSubmit={handleImport}
                  submitting={importAiPicks.isPending}
                  emptyHint={
                    <Button
                      size="xs"
                      variant="outline"
                      loading={loadingPrompt}
                      disabled={candidateCount === 0}
                      onClick={loadPrompt}
                    >
                      Завантажити промпт
                    </Button>
                  }
                />
              </Box>
            </Stack>
          )}

          {step === 'running' && (
            <HStack gap={3} p={4} justify="center">
              <Spinner color="teal.500" />
              <Text>Аналізую {candidateCount} оголошень…</Text>
            </HStack>
          )}

          {step === 'done' && (
            <Stack gap={4}>
              {summary && (
                <Box
                  p={3}
                  bg="bg.subtle"
                  borderWidth="1px"
                  borderColor="border.subtle"
                  rounded="md"
                >
                  <Text textStyle="sm" fontStyle="italic" color="fg.muted">
                    {summary}
                  </Text>
                </Box>
              )}

              {pendingPicks.length === 0 ? (
                <Text color="fg.muted" textStyle="sm">
                  AI не знайшов гідних кандидатів серед поданих оголошень.
                </Text>
              ) : (
                <Box overflowX="auto">
                  <HStack gap={3} align="stretch" pb={2}>
                    {pendingPicks.map((pick) => (
                      <AiRankCard
                        key={pick.id}
                        pick={pick}
                        listing={listingsMap.get(pick.id)}
                      />
                    ))}
                  </HStack>
                </Box>
              )}

              <HStack gap={2} justify="flex-end">
                <Button size="sm" variant="ghost" onClick={reset}>
                  Повторити
                </Button>
                <Button
                  size="sm"
                  colorPalette="teal"
                  loading={commitAiPicks.isPending}
                  onClick={handleCommit}
                >
                  Зберегти результат
                </Button>
              </HStack>
            </Stack>
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
