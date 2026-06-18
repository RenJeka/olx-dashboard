import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuScanSearch, LuSparkles, LuDownload } from 'react-icons/lu';
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
import { toaster } from '../ui/toaster';
import {
  useAnalysisStatus,
  useListings,
  useRelevanceTarget,
  useSaveRelevanceTarget,
  useRunRelevance,
  useImportRelevance,
  useCommitRelevance,
  fetchRelevancePackageZip,
} from '../../api/client';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { loadAnalysisModel } from '../../utils/storage';
import { showErrorToast } from '../../utils/toast';
import { useListingsMap } from '../../hooks/useListingsMap';
import { chunk } from '../../utils/array';
import { ANALYZE_CHUNK } from '../../constants';
import type { RelevanceItem, Search } from '../../types';

interface Props {
  search: Search;
  selectedIds: number[];
}

type Step = 'idle' | 'running' | 'done';
type Scope = 'selected' | 'tab' | 'all';

export function RelevanceFilterDialog({ search, selectedIds }: Props) {
  const { data: listings } = useListings(search.id);
  const { data: status } = useAnalysisStatus();
  const { data: targetData } = useRelevanceTarget(search.id);
  const statusFilter = useListingsUiStore((s) => s.statusFilter);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [results, setResults] = useState<RelevanceItem[]>([]);
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [source, setSource] = useState<'api' | 'import'>('api');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const saveTarget = useSaveRelevanceTarget();
  const runRelevance = useRunRelevance();
  const importRelevance = useImportRelevance();
  const commitRelevance = useCommitRelevance();

  const apiAvailable = status?.apiAvailable ?? false;

  // Передзаповнення цільового товару (query або збережений) при першому завантаженні.
  useEffect(() => {
    if (targetData) setTarget(targetData.target);
  }, [targetData]);

  // Дефолтний scope: вибрані → таб → весь пошук.
  useEffect(() => {
    if (!open) return;
    setScope(
      selectedIds.length > 0 ? 'selected' : statusFilter !== 'all' && statusFilter !== 'ai_picks' ? 'tab' : 'all',
    );
  }, [open, selectedIds.length, statusFilter]);

  const all = listings ?? [];
  const effectiveIds =
    scope === 'selected'
      ? selectedIds
      : scope === 'tab'
        ? all.filter((l) => l.status === statusFilter).map((l) => l.id)
        : all.map((l) => l.id);

  const listingsMap = useListingsMap(listings);

  function reset() {
    setStep('idle');
    setResults([]);
    setOverrides(new Map());
    setProgress(null);
  }

  async function handleRun() {
    if (!target.trim()) {
      toaster.create({ type: 'warning', title: 'Вкажіть цільовий товар' });
      return;
    }
    setStep('running');
    setProgress({ done: 0, total: effectiveIds.length });
    const acc: RelevanceItem[] = [];
    try {
      for (const batch of chunk(effectiveIds, ANALYZE_CHUNK)) {
        const res = await runRelevance.mutateAsync({
          searchId: search.id,
          target: target.trim(),
          ids: batch,
          model: loadAnalysisModel(),
        });
        acc.push(...res.results);
        setProgress((p) => (p ? { ...p, done: p.done + batch.length } : p));
      }
      setSource('api');
      setResults(acc);
      setStep('done');
    } catch (err) {
      setStep('idle');
      setProgress(null);
      showErrorToast('Помилка класифікації', err);
    }
  }

  async function handleDownloadZip() {
    if (!target.trim()) {
      toaster.create({ type: 'warning', title: 'Вкажіть цільовий товар' });
      return;
    }
    try {
      await fetchRelevancePackageZip(search.id, target.trim(), effectiveIds);
    } catch (err) {
      showErrorToast('Помилка завантаження ZIP', err);
    }
  }

  async function handleImport(raw: string) {
    try {
      const res = await importRelevance.mutateAsync({ searchId: search.id, raw, accumulated: results });
      setSource('import');
      setResults(res.results);
      setStep('done');
    } catch (err) {
      showErrorToast('Помилка парсингу відповіді', err);
    }
  }

  function isRelevant(item: RelevanceItem): boolean {
    return overrides.has(item.id) ? (overrides.get(item.id) as boolean) : item.relevant;
  }

  function toggle(id: number, current: boolean) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, !current);
      return next;
    });
  }

  async function handleCommit() {
    const items: RelevanceItem[] = results.map((r) => ({ ...r, relevant: isRelevant(r) }));
    try {
      if (target.trim()) await saveTarget.mutateAsync({ searchId: search.id, target: target.trim() });
      const { committed } = await commitRelevance.mutateAsync({ searchId: search.id, items, source });
      const irrelevant = items.filter((i) => !i.relevant).length;
      toaster.create({
        type: 'success',
        title: `Збережено ${committed} оголошень`,
        description: `Нерелевантних: ${irrelevant}`,
      });
      setOpen(false);
      reset();
    } catch (err) {
      showErrorToast('Помилка збереження', err);
    }
  }

  const irrelevantCount = results.filter((r) => !isRelevant(r)).length;

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
        <Button size="sm" variant="outline" colorPalette="cyan">
          <LuScanSearch /> AI Фільтр
        </Button>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>AI Фільтр релевантності — {search.name}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          {step !== 'done' && (
            <Stack gap={4}>
              <Box>
                <Text textStyle="sm" fontWeight="semibold" mb={1}>
                  Цільовий товар
                </Text>
                <Input
                  size="sm"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
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
                  {selectedIds.length > 0 && (
                    <Button
                      size="xs"
                      variant={scope === 'selected' ? 'solid' : 'outline'}
                      colorPalette="blue"
                      onClick={() => setScope('selected')}
                    >
                      Вибрані ({selectedIds.length})
                    </Button>
                  )}
                  {statusFilter !== 'all' && statusFilter !== 'ai_picks' && (
                    <Button
                      size="xs"
                      variant={scope === 'tab' ? 'solid' : 'outline'}
                      colorPalette="blue"
                      onClick={() => setScope('tab')}
                    >
                      Статус
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant={scope === 'all' ? 'solid' : 'outline'}
                    colorPalette="blue"
                    onClick={() => setScope('all')}
                  >
                    Весь пошук ({all.length})
                  </Button>
                </HStack>
                <Text textStyle="xs" color="fg.muted" mt={1}>
                  До класифікації: <strong>{effectiveIds.length}</strong> оголошень.
                </Text>
              </Box>

              {apiAvailable && (
                <Button
                  colorPalette="cyan"
                  size="sm"
                  alignSelf="start"
                  loading={step === 'running'}
                  disabled={effectiveIds.length === 0 || !target.trim()}
                  onClick={handleRun}
                >
                  <LuSparkles /> Запустити (авто)
                </Button>
              )}

              {step === 'running' && progress && (
                <Stack gap={1}>
                  <Text textStyle="xs" color="fg.muted">
                    Опрацьовано {progress.done}/{progress.total}
                  </Text>
                  <Progress.Root
                    size="xs"
                    colorPalette="cyan"
                    value={progress.total ? (progress.done / progress.total) * 100 : 0}
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
                  title="Завантаж ZIP, проженеш через будь-який чат, встав JSON-відповідь"
                  parts={[]}
                  pasteLabel="Додати відповідь"
                  onSubmit={handleImport}
                  submitting={importRelevance.isPending}
                  emptyHint={
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={effectiveIds.length === 0 || !target.trim()}
                      onClick={handleDownloadZip}
                    >
                      <LuDownload /> Завантажити ZIP-пакет
                    </Button>
                  }
                />
              </Box>
            </Stack>
          )}

          {step === 'done' && (
            <Stack gap={4}>
              <Text textStyle="sm" color="fg.muted">
                Класифіковано <strong>{results.length}</strong>, нерелевантних:{' '}
                <strong>{irrelevantCount}</strong>. Натисни на вердикт, щоб виправити.
              </Text>

              <Stack gap={2} maxH="50vh" overflowY="auto">
                {results.map((r) => {
                  const listing = listingsMap.get(r.id);
                  const relevant = isRelevant(r);
                  return (
                    <Box
                      key={r.id}
                      p={2}
                      borderWidth="1px"
                      borderColor="border.subtle"
                      rounded="md"
                    >
                      <HStack gap={2} align="start">
                        <Badge
                          colorPalette={relevant ? 'green' : 'red'}
                          variant="solid"
                          cursor="pointer"
                          flexShrink={0}
                          onClick={() => toggle(r.id, relevant)}
                        >
                          {relevant ? 'продає' : 'нерелевантне'}
                        </Badge>
                        <Box flex="1" minW={0}>
                          <Text textStyle="sm" lineClamp={1}>
                            {listing?.title ?? `#${r.id}`}
                          </Text>
                          {r.reason && (
                            <Text textStyle="xs" color="fg.muted">
                              {r.reason}
                            </Text>
                          )}
                        </Box>
                      </HStack>
                    </Box>
                  );
                })}
              </Stack>

              <HStack gap={2} justify="flex-end">
                <Button size="sm" variant="ghost" onClick={reset}>
                  Повторити
                </Button>
                <Button
                  size="sm"
                  colorPalette="cyan"
                  loading={commitRelevance.isPending || saveTarget.isPending}
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
