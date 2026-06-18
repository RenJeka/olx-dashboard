import { useEffect, useMemo, useState } from 'react';
import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import type { AnalysisScope } from '../../stores/analysisWizardStore';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { STATUS_LABELS } from '../../utils/status';
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Image,
  Input,
  Progress,
  Stack,
  Table,
  Text,
  Wrap,
} from '@chakra-ui/react';
import {
  LuSparkles,
  LuWandSparkles,
  LuRefreshCw,
  LuPlus,
  LuFileSpreadsheet,
  LuFileJson,
  LuSearch,
  LuDownload,
} from 'react-icons/lu';
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
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import { DescriptionDialog } from '../DescriptionDialog';
import { ManualAssistant } from './ManualAssistant';
import { DescriptionTooltip } from '../table/DescriptionTooltip';
import { HighlightText } from '../table/HighlightText';
import { Tooltip } from '../ui/tooltip';
import { toaster } from '../ui/toaster';
import {
  useAnalysisStatus,
  useSavedCriteria,
  useGenerateCriteria,
  fetchCriteriaPrompt,
  useImportCriteria,
  useSaveCriteria,
  useAnalyze,
  fetchAnalyzePackageZip,
  useImportAnalysis,
  useCommitAnalysis,
  exportPreview,
  useListings,
} from '../../api/client';
import {
  loadAnalysisModel,
  loadAnalysisReasoning,
  loadAnalysisExtraCriteria,
} from '../../utils/storage';
import { stripDescriptionHtml } from '../../utils/format';
import { chunk } from '../../utils/array';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  ANALYSIS_SOURCE,
  ANALYSIS_STEPS,
  ANALYZE_CHUNK,
  COMMIT_CHUNK,
  MANUAL_MODEL,
  MODE_LABELS,
} from '../../constants';
import type { AnalyzedListing, Listing, MatchedItem, PackagePart, Search } from '../../types';

function showErrorToast(title: string, err: unknown) {
  toaster.create({
    type: 'error',
    title,
    description: err instanceof Error ? err.message : String(err),
  });
}

interface Props {
  search: Search;
  /** Id вибраних рядків (чекбокси) — для режиму «вибрані». */
  selectedIds: number[];
}

export function AnalysisWizardDialog({ search, selectedIds }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { data: status } = useAnalysisStatus();
  const { data: savedCriteria } = useSavedCriteria(open ? search.id : null);
  const { data: listings } = useListings(open ? search.id : null);

  // Flow state — Zustand (переживає закриття/відкриття модалки в межах сесії)
  const {
    mode, setMode,
    scope, setScope,
    step, setStep,
    available, setAvailable,
    selected, setSelected,
    customInput, setCustomInput,
    accumulated, setAccumulated,
    includedOverrides, setIncludedOverrides,
    criteriaLoadedMode, setCriteriaLoadedMode,
    bindSearch,
    reset,
  } = useAnalysisWizardStore();
  const statusFilter = useListingsUiStore((s) => s.statusFilter);

  // Ephemeral UI — скидаються при remount (прийнятно)
  // Крок 1
  const [showCriteriaAssistant, setShowCriteriaAssistant] = useState(false);
  const [criteriaParts, setCriteriaParts] = useState<PackagePart[]>([]);

  // Крок 2
  const [showMatchAssistant, setShowMatchAssistant] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  // Крок 3
  const [openDescriptionListing, setOpenDescriptionListing] = useState<Listing | null>(null);

  // Крок 4
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  // 'append' — додати до наявних (без дублів); 'replace' — перезаписати поле.
  const [mergeMode, setMergeMode] = useState<'append' | 'replace'>('append');

  const generateCriteria = useGenerateCriteria();
  const importCriteria = useImportCriteria();
  const saveCriteria = useSaveCriteria();
  const analyze = useAnalyze();
  const importAnalysis = useImportAnalysis();
  const commit = useCommitAnalysis();

  const allIds = useMemo(() => (listings ?? []).map((l) => l.id), [listings]);
  const listingById = useMemo(() => {
    const m = new Map<number, Listing>();
    for (const l of listings ?? []) m.set(l.id, l);
    return m;
  }, [listings]);

  const effectiveIds = useMemo(() => {
    if (scope === 'selected') return selectedIds;
    if (scope === 'tab') {
      if (statusFilter === 'all') return allIds;
      return allIds.filter((id) => listingById.get(id)?.status === statusFilter);
    }
    return allIds;
  }, [scope, selectedIds, allIds, listingById, statusFilter]);
  const apiAvailable = status?.apiAvailable ?? false;
  const model = loadAnalysisModel();
  const reasoning = loadAnalysisReasoning();
  const extra = loadAnalysisExtraCriteria();

  // Розумний дефолт scope при свіжому відкритті Flow.
  function computeDefaultScope(): AnalysisScope {
    if (selectedIds.length > 0) return 'selected';
    if (statusFilter !== 'all') return 'tab';
    return 'all';
  }

  // Завантажуємо критерії лише при першому відкритті або зміні режиму на кроці 1.
  // На кроках 2–4 не перезаписуємо прогрес при повторному відкритті.
  useEffect(() => {
    if (!open || !savedCriteria) return;
    if (step !== 1 || mode === criteriaLoadedMode) return;
    const saved = savedCriteria[mode] ?? [];
    setAvailable(saved);
    setSelected(new Set(saved));
    setCriteriaLoadedMode(mode);
  }, [open, mode, savedCriteria, step, criteriaLoadedMode]);

  function mergeCriteria(incoming: string[]) {
    setAvailable((prev) => {
      const set = new Set(prev.map((c) => c.toLowerCase()));
      const merged = [...prev];
      for (const c of incoming) {
        if (!set.has(c.toLowerCase())) {
          merged.push(c);
          set.add(c.toLowerCase());
        }
      }
      return merged;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of incoming) next.add(c);
      return next;
    });
  }

  function toggleCriterion(c: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function addCustom() {
    const c = customInput.trim();
    if (!c) return;
    mergeCriteria([c]);
    setCustomInput('');
  }

  async function handleGenerateCriteria() {
    try {
      const { criteria } = await generateCriteria.mutateAsync({
        searchId: search.id,
        mode,
        model,
        reasoning,
        extra,
      });
      mergeCriteria(criteria);
      toaster.create({ type: 'success', title: `Згенеровано критеріїв: ${criteria.length}` });
    } catch (err) {
      showErrorToast('Помилка генерації', err);
    }
  }

  async function openCriteriaAssistant() {
    setShowCriteriaAssistant(true);
    try {
      const { prompt } = await fetchCriteriaPrompt(search.id, mode, extra);
      setCriteriaParts([{ name: `критерії-${mode}.txt`, content: prompt }]);
    } catch (err) {
      showErrorToast('Не вдалося підготувати промпт', err);
    }
  }

  function handleImportCriteria(raw: string) {
    importCriteria.mutate(
      { searchId: search.id, mode, raw },
      {
        onSuccess: ({ criteria }) => {
          mergeCriteria(criteria);
          toaster.create({ type: 'success', title: `Розпізнано критеріїв: ${criteria.length}` });
        },
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  async function goToMatching() {
    const chosen = available.filter((c) => selected.has(c));
    if (chosen.length === 0) {
      toaster.create({ type: 'error', title: 'Оберіть хоча б один критерій' });
      return;
    }
    try {
      await saveCriteria.mutateAsync(
        mode === 'cons' ? { searchId: search.id, cons: chosen } : { searchId: search.id, pros: chosen },
      );
      setStep(2);
    } catch (err) {
      showErrorToast('Не вдалося зберегти критерії', err);
    }
  }

  async function runAutoAnalyze() {
    if (effectiveIds.length === 0) {
      toaster.create({ type: 'error', title: 'Немає оголошень для аналізу' });
      return;
    }
    const chunks = chunk(effectiveIds, ANALYZE_CHUNK);
    setAnalyzeProgress({ done: 0, total: effectiveIds.length });
    let acc: AnalyzedListing[] = [];
    const errors: string[] = [];
    try {
      let done = 0;
      for (const ids of chunks) {
        const res = await analyze.mutateAsync({ searchId: search.id, mode, ids, model, reasoning });
        acc = [...acc, ...res.results];
        errors.push(...res.errors);
        done += ids.length;
        setAnalyzeProgress({ done, total: effectiveIds.length });
      }
      setAccumulated(acc);
      if (errors.length > 0) {
        toaster.create({
          type: 'warning',
          title: `Аналіз завершено з ${errors.length} помилками батчів`,
          description: errors[0],
        });
      }
      setStep(3);
    } catch (err) {
      showErrorToast('Помилка аналізу', err);
    } finally {
      setAnalyzeProgress(null);
    }
  }

  async function downloadZipPackage() {
    if (effectiveIds.length === 0) {
      toaster.create({ type: 'error', title: 'Немає оголошень для аналізу' });
      return;
    }
    setZipDownloading(true);
    try {
      await fetchAnalyzePackageZip(search.id, mode, effectiveIds);
      setShowMatchAssistant(true);
    } catch (err) {
      showErrorToast('Не вдалося підготувати ZIP-пакет', err);
    } finally {
      setZipDownloading(false);
    }
  }

  function handleImportMatching(raw: string) {
    importAnalysis.mutate(
      { searchId: search.id, mode, raw, accumulated },
      {
        onSuccess: (res) => {
          setAccumulated(res.results);
          toaster.create({
            type: 'success',
            title: `Опрацьовано оголошень: ${res.results.length}`,
          });
        },
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  // Ключ ручного toggle-override для пари (оголошення, критерій).
  function criterionKey(id: number, criterion: string): string {
    return `${id}:${criterion.toLowerCase()}`;
  }

  /** Чи включений критерій у результат: ручний override, або `item.ok` за замовчуванням. */
  function isIncluded(id: number, item: MatchedItem): boolean {
    return includedOverrides.get(criterionKey(id, item.criterion)) ?? item.ok;
  }

  function toggleIncluded(id: number, item: MatchedItem) {
    const key = criterionKey(id, item.criterion);
    setIncludedOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isIncluded(id, item));
      return next;
    });
  }

  // Рядки з результатами (приховуємо ті, де LLM нічого не знайшов).
  const visibleRows = useMemo(() => accumulated.filter((r) => r.items.length > 0), [accumulated]);
  const hiddenCount = accumulated.length - visibleRows.length;

  // Елементи для запису: включені критерії (ручний toggle або item.ok за замовчуванням).
  const commitItems = useMemo(
    () =>
      accumulated.map((r) => ({
        id: r.id,
        criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accumulated, includedOverrides],
  );

  const overwriteCount = useMemo(() => {
    let n = 0;
    for (const item of commitItems) {
      const l = listingById.get(item.id);
      if (l && (mode === 'cons' ? l.cons : l.pros)) n++;
    }
    return n;
  }, [commitItems, listingById, mode]);

  async function doCommit() {
    setCommitProgress({ done: 0, total: commitItems.length });
    try {
      let done = 0;
      for (const batch of chunk(commitItems, COMMIT_CHUNK)) {
        await commit.mutateAsync({
          searchId: search.id,
          mode,
          items: batch,
          model: apiAvailable && status ? model : MANUAL_MODEL,
          source: apiAvailable ? ANALYSIS_SOURCE.API : ANALYSIS_SOURCE.IMPORT,
          merge: mergeMode,
        });
        done += batch.length;
        setCommitProgress({ done, total: commitItems.length });
      }
      toaster.create({
        type: 'success',
        title: `Записано в таблицю: ${commitItems.length}`,
      });
      reset();
      setOpen(false);
    } catch (err) {
      showErrorToast('Помилка запису', err);
    } finally {
      setCommitProgress(null);
    }
  }

  function handleCommitClick() {
    if (commitItems.length === 0) {
      toaster.create({ type: 'error', title: 'Немає результатів для запису' });
      return;
    }
    if (mergeMode === 'replace' && overwriteCount > 0) setConfirmOverwrite(true);
    else void doCommit();
  }

  async function handleExport(format: 'xlsx' | 'json') {
    const rows = accumulated.map((r) => {
      const l = listingById.get(r.id);
      return {
        title: l?.title ?? '',
        description: l?.description ?? '',
        criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
      };
    });
    try {
      await exportPreview(search.id, mode, format, rows);
    } catch (err) {
      showErrorToast('Помилка експорту', err);
    }
  }

  const modeLabel = MODE_LABELS[mode];
  const chosenCount = available.filter((c) => selected.has(c)).length;
  const tabCount = statusFilter !== 'all'
    ? allIds.filter((id) => listingById.get(id)?.status === statusFilter).length
    : 0;
  const scopeLabel =
    scope === 'selected' ? 'Вибрані'
    : scope === 'tab' && statusFilter !== 'all' && statusFilter !== 'ai_picks'
      ? STATUS_LABELS[statusFilter]
    : 'Весь пошук';

  // Крок 3: спільні фрагменти рядка для desktop-таблиці й mobile-карток.
  function renderPhotoTitle(l: Listing | undefined, fallbackId: number) {
    return (
      <HStack gap={2} align="start">
        {l?.photo_url ? (
          <Image src={l.photo_url} alt="" boxSize={12} rounded="md" objectFit="cover" flexShrink={0} />
        ) : (
          <Box boxSize={12} rounded="md" bg="bg.muted" flexShrink={0} />
        )}
        <Text fontWeight="semibold" fontSize="sm" lineClamp={2}>
          {l?.title ?? `#${fallbackId}`}
        </Text>
      </HStack>
    );
  }

  function renderDescriptionBlock(l: Listing | undefined, desc: string, evidence: string[]) {
    return (
      <DescriptionTooltip
        description={l?.description ?? null}
        query={evidence}
        onClick={() => l && setOpenDescriptionListing(l)}
      >
        <Text textStyle="xs" color="fg.muted" lineClamp={isMobile ? 4 : 3} whiteSpace="pre-line">
          <HighlightText text={desc} query={evidence} />
        </Text>
      </DescriptionTooltip>
    );
  }

  function renderCriteriaTags(r: AnalyzedListing) {
    return (
      <Wrap gap={1}>
        {r.items.map((it, i) => {
          const included = isIncluded(r.id, it);
          return (
            <Tooltip key={i} content={it.evidence} disabled={!it.evidence}>
              <Badge
                colorPalette={included ? (mode === 'cons' ? 'red' : 'green') : 'gray'}
                variant={included ? 'subtle' : 'outline'}
                textDecoration={included ? undefined : 'line-through'}
                borderWidth={it.ok ? undefined : '1px'}
                borderStyle={it.ok ? undefined : 'dashed'}
                cursor="pointer"
                role="button"
                tabIndex={0}
                onClick={() => toggleIncluded(r.id, it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') toggleIncluded(r.id, it);
                }}
              >
                {it.criterion}
              </Badge>
            </Tooltip>
          );
        })}
      </Wrap>
    );
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (d.open) {
          const prevBound = useAnalysisWizardStore.getState().boundSearchId;
          bindSearch(search.id);
          if (prevBound !== search.id) {
            // Свіжий Flow — виставляємо розумний дефолт scope
            setScope(computeDefaultScope());
          }
        }
      }}
      size={isMobile ? 'full' : 'xl'}
      placement="center"
      scrollBehavior="inside"
      closeOnInteractOutside={false}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="purple">
          <LuSparkles /> AI
        </Button>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <Stack gap={3} w="full">
            <DialogTitle>AI-аналіз: {modeLabel}</DialogTitle>
            {/* Степер */}
            <HStack gap={2} wrap="wrap" rowGap={2}>
              {ANALYSIS_STEPS.map((label, i) => (
                <HStack key={label} gap={1.5}>
                  <Box
                    boxSize={6}
                    rounded="full"
                    fontSize="xs"
                    fontWeight="bold"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    bg={step === i + 1 ? 'blue.solid' : step > i + 1 ? 'green.solid' : 'bg.muted'}
                    color={step >= i + 1 ? 'white' : 'fg.muted'}
                  >
                    {i + 1}
                  </Box>
                  <Text textStyle="xs" color={step === i + 1 ? 'fg.default' : 'fg.muted'} fontWeight={step === i + 1 ? 'bold' : 'normal'}>
                    {label}
                  </Text>
                  {i < ANALYSIS_STEPS.length - 1 && <Box w={4} h="1px" bg="border.subtle" />}
                </HStack>
              ))}
            </HStack>
            {/* Кроки 2–4: read-only підсумок режиму та scope */}
            {step > 1 && (
              <Text textStyle="xs" color="fg.muted">
                {modeLabel} · {scopeLabel} ({effectiveIds.length})
              </Text>
            )}
          </Stack>
        </DialogHeader>

        <DialogBody pb={6}>
          {step === 1 && (
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
                      {statusFilter !== 'ai_picks' ? STATUS_LABELS[statusFilter] : 'Таб'} ({tabCount})
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
                    <Button size="sm" colorPalette="purple" onClick={handleGenerateCriteria} loading={generateCriteria.isPending}>
                      <LuWandSparkles /> Згенерувати критерії
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleGenerateCriteria} loading={generateCriteria.isPending}>
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
                  submitting={importCriteria.isPending}
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
                      bindSearch(search.id);
                      setScope(computeDefaultScope());
                    }}
                  >
                    Почати заново
                  </Button>
                </HStack>
                <Button colorPalette="blue" onClick={goToMatching} loading={saveCriteria.isPending}>
                  Далі: пошук
                </Button>
              </HStack>
            </Stack>
          )}

          {step === 2 && (
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
                      <Progress.Root size="xs" colorPalette="purple" value={(analyzeProgress.done / analyzeProgress.total) * 100}>
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
                  submitting={importAnalysis.isPending}
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
                <Button colorPalette="blue" disabled={accumulated.length === 0} onClick={() => setStep(3)}>
                  Далі: перевірка ({accumulated.length})
                </Button>
              </HStack>
            </Stack>
          )}

          {step === 3 && (
            <Stack gap={4}>
              <HStack justify="space-between" wrap="wrap" gap={2}>
                <Stack gap={0}>
                  <Text textStyle="sm" color="fg.muted">
                    Перевір знайдені {modeLabel.toLowerCase()}. Клікни на тег, щоб включити/виключити з результату.
                  </Text>
                  <Text textStyle="xs" color="fg.subtle">
                    Показано {visibleRows.length} із {accumulated.length}
                    {hiddenCount > 0 && ` (приховано ${hiddenCount} без результатів)`}
                  </Text>
                </Stack>
                <HStack gap={2}>
                  <Button size="xs" variant="outline" onClick={() => handleExport('xlsx')}>
                    <LuFileSpreadsheet /> Excel
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleExport('json')}>
                    <LuFileJson /> JSON
                  </Button>
                </HStack>
              </HStack>

              {isMobile ? (
                <Stack gap={3} maxH="60vh" overflowY="auto">
                  {visibleRows.map((r) => {
                    const l = listingById.get(r.id);
                    const desc = stripDescriptionHtml(l?.description ?? null);
                    const includedEvidence = r.items
                      .filter((it) => isIncluded(r.id, it))
                      .map((it) => it.evidence);
                    return (
                      <Box key={r.id} p={3} borderWidth="1px" borderColor="border.subtle" rounded="md">
                        <Stack gap={2}>
                          {renderPhotoTitle(l, r.id)}
                          {renderDescriptionBlock(l, desc, includedEvidence)}
                          {renderCriteriaTags(r)}
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <Box maxH="50vh" overflowY="auto" borderWidth="1px" borderColor="border.subtle" rounded="md">
                  <Table.Root size="sm" css={{ tableLayout: 'fixed' }}>
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg" width="220px">
                          Оголошення
                        </Table.ColumnHeader>
                        <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg" width="50%">
                          Опис
                        </Table.ColumnHeader>
                        <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg">
                          {modeLabel}
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {visibleRows.map((r) => {
                        const l = listingById.get(r.id);
                        const desc = stripDescriptionHtml(l?.description ?? null);
                        const includedEvidence = r.items
                          .filter((it) => isIncluded(r.id, it))
                          .map((it) => it.evidence);
                        return (
                          <Table.Row key={r.id}>
                            <Table.Cell verticalAlign="top">{renderPhotoTitle(l, r.id)}</Table.Cell>
                            <Table.Cell verticalAlign="top" whiteSpace="normal">
                              {renderDescriptionBlock(l, desc, includedEvidence)}
                            </Table.Cell>
                            <Table.Cell verticalAlign="top">{renderCriteriaTags(r)}</Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}

              <HStack justify="space-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Назад
                </Button>
                <Button colorPalette="blue" onClick={() => setStep(4)}>
                  Далі: вставка
                </Button>
              </HStack>
            </Stack>
          )}

          {step === 4 && (
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
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Відмінити
                  </Button>
                  <Button colorPalette="blue" onClick={handleCommitClick} loading={commitProgress != null}>
                    {mergeMode === 'append'
                      ? `Додати ${modeLabel.toLowerCase()} у таблицю`
                      : `Перезаписати ${modeLabel.toLowerCase()} у таблиці`}
                  </Button>
                </HStack>
              </HStack>
            </Stack>
          )}
        </DialogBody>
      </DialogContent>

      <ConfirmActionDialog
        open={confirmOverwrite}
        onOpenChange={setConfirmOverwrite}
        title="Перезаписати наявні значення?"
        description={`У ${overwriteCount} оголошень поле «${modeLabel}» вже заповнене. Перезаписати результатами аналізу?`}
        confirmLabel="Перезаписати"
        onConfirm={() => void doCommit()}
      />
      <DescriptionDialog listing={openDescriptionListing} onClose={() => setOpenDescriptionListing(null)} />
    </DialogRoot>
  );
}
