import { useEffect, useState } from 'react';
import { Button, HStack, IconButton, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { LuPlus, LuWandSparkles, LuX } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../ui/dialog';
import { Tooltip } from '../ui/tooltip';
import { ManualAssistant } from '../analysis/ManualAssistant';
import {
  useAnalysisStatus,
  useGenerateSynonyms,
  useImportSynonyms,
  fetchSynonymsPrompt,
} from '../../api';
import { showErrorToast } from '../../utils/toast';
import { sortAlpha } from '../../utils/sort';
import { DIALOG_SIZE } from '../../theme';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Основний пошуковий запит — контекст для генерації синонімів. */
  query: string;
  /** Поточний список синонімів. */
  value: string[];
  /** Викликається при збереженні (кнопка «Зберегти») з новим списком. */
  onChange: (next: string[]) => void;
}

/**
 * Модал «Варіанти пошуку»: синоніми пошукового запиту (docs/plans/search-synonyms.md) — інші
 * назви того самого товару на OLX («біговел»/«велобіг»). Скануються разом з основним query,
 * видача зливається. Генерація — авто (OpenRouter) або ручна копія/вставка (як CriteriaStep).
 * Контрольований (як SearchFiltersDrawer) — відкриття керує викликач (кнопка форми / пункт меню).
 */
export function SearchVariantsDialog({ open, onOpenChange, query, value, onChange }: Props) {
  const [draft, setDraft] = useState<string[]>(value);
  const [newSynonym, setNewSynonym] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);
  const [promptText, setPromptText] = useState('');

  const { data: status } = useAnalysisStatus();
  const apiAvailable = status?.apiAvailable ?? false;
  const generate = useGenerateSynonyms();
  const importSynonyms = useImportSynonyms();

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  function mergeSynonyms(list: string[]) {
    setDraft((prev) => {
      const seen = new Set(prev.map((p) => p.toLowerCase()));
      const merged = [...prev];
      for (const s of list) {
        const trimmed = s.trim();
        if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
        seen.add(trimmed.toLowerCase());
        merged.push(trimmed);
      }
      return merged;
    });
  }

  function addSynonym() {
    mergeSynonyms([newSynonym]);
    setNewSynonym('');
  }

  function removeSynonym(s: string) {
    setDraft((prev) => prev.filter((d) => d !== s));
  }

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({ query: query.trim() });
      mergeSynonyms(res.synonyms);
    } catch (err) {
      showErrorToast('Помилка генерації синонімів', err);
    }
  }

  async function openManualAssistant() {
    try {
      const { prompt } = await fetchSynonymsPrompt(query.trim());
      setPromptText(prompt);
      setShowAssistant(true);
    } catch (err) {
      showErrorToast('Помилка підготовки промпту', err);
    }
  }

  async function handleImport(raw: string) {
    try {
      const res = await importSynonyms.mutateAsync({ raw });
      mergeSynonyms(res.synonyms);
    } catch (err) {
      showErrorToast('Помилка парсингу відповіді', err);
    }
  }

  function handleSave() {
    onChange(draft);
    onOpenChange(false);
  }

  const queryReady = query.trim().length > 0;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      size={DIALOG_SIZE.form}
      placement="center"
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Варіанти пошуку — синоніми запиту</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          <Stack gap={4}>
            <Text textStyle="sm" color="fg.muted">
              Основний запит: <strong>{query || '—'}</strong>. Додай синоніми — інші назви того
              самого товару на OLX (напр. «велобіг» для «біговел»). Кожен синонім буде
              проскановано окремо, а видача об'єднана в цей же пошук.
            </Text>

            {draft.length === 0 ? (
              <Text textStyle="sm" color="fg.muted">
                Синонімів ще немає — додай вручну або згенеруй нижче.
              </Text>
            ) : (
              <SimpleGrid columns={{ base: 2, sm: 3 }} gap={2}>
                {sortAlpha(draft).map((s) => (
                  <Tooltip key={s} content={s}>
                    <HStack
                      justify="space-between"
                      gap={1}
                      pl={3}
                      pr={1}
                      py={2}
                      borderWidth="1px"
                      borderColor="border.subtle"
                      rounded="lg"
                      bg="bg.subtle"
                      _hover={{ borderColor: 'colorPalette.solid', shadow: 'xs' }}
                      colorPalette="accent"
                    >
                      <Text textStyle="sm" fontWeight="medium" lineClamp={1}>
                        {s}
                      </Text>
                      <IconButton
                        size="2xs"
                        variant="ghost"
                        aria-label="Видалити синонім"
                        onClick={() => removeSynonym(s)}
                        flexShrink={0}
                      >
                        <LuX />
                      </IconButton>
                    </HStack>
                  </Tooltip>
                ))}
              </SimpleGrid>
            )}

            <HStack gap={2}>
              <Input
                size="sm"
                placeholder="напр. велобіг"
                value={newSynonym}
                onChange={(e) => setNewSynonym(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSynonym()}
              />
              <IconButton size="sm" variant="outline" aria-label="Додати" onClick={addSynonym}>
                <LuPlus />
              </IconButton>
            </HStack>

            <HStack gap={2} wrap="wrap">
              {apiAvailable && (
                <Button
                  size="sm"
                  colorPalette="purple"
                  disabled={!queryReady}
                  loading={generate.isPending}
                  onClick={handleGenerate}
                >
                  <LuWandSparkles /> Згенерувати
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={!queryReady} onClick={openManualAssistant}>
                Згенерувати вручну
              </Button>
            </HStack>

            {showAssistant && (
              <ManualAssistant
                title="Помічник: генерація синонімів"
                parts={[{ name: 'synonyms-prompt.txt', content: promptText }]}
                pasteLabel="Розпізнати синоніми"
                onSubmit={handleImport}
                submitting={importSynonyms.isPending}
              />
            )}

            <HStack justify="flex-end" gap={2}>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Відмінити
              </Button>
              <Button size="sm" colorPalette="accent" onClick={handleSave}>
                Зберегти
              </Button>
            </HStack>
          </Stack>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
