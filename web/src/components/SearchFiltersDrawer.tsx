import { useEffect, useState } from 'react';
import { Button, HStack, IconButton, Input, NativeSelect, Stack, Tag, Text, Wrap } from '@chakra-ui/react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from './ui/drawer';
import { toaster } from './ui/toaster';
import { useParamKeys, useUpdateSearchFilters } from '../api/client';
import type { LocalFilters, Search } from '../types';

interface Props {
  search: Search;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RangeRow {
  key: string;
  min: string;
  max: string;
}

function parseLocalFilters(raw: string): LocalFilters {
  try {
    return JSON.parse(raw || '{}') as LocalFilters;
  } catch {
    return {};
  }
}

/** Drawer редактора локальних фільтрів пошуку: стоп-слова + числові діапазони по params. */
export function SearchFiltersDrawer({ search, open, onOpenChange }: Props) {
  const { data: paramKeys } = useParamKeys(search.id, open);
  const updateFilters = useUpdateSearchFilters();

  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [ranges, setRanges] = useState<RangeRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const filters = parseLocalFilters(search.local_filters);
    setKeywords(filters.exclude_keywords ?? []);
    setRanges(
      Object.entries(filters.ranges ?? {}).map(([key, range]) => ({
        key,
        min: range.min != null ? String(range.min) : '',
        max: range.max != null ? String(range.max) : '',
      })),
    );
    setNewKeyword('');
  }, [open, search.local_filters]);

  function addKeyword() {
    const value = newKeyword.trim();
    if (!value || keywords.includes(value)) {
      setNewKeyword('');
      return;
    }
    setKeywords((prev) => [...prev, value]);
    setNewKeyword('');
  }

  function removeKeyword(value: string) {
    setKeywords((prev) => prev.filter((kw) => kw !== value));
  }

  function addRange() {
    const usedKeys = new Set(ranges.map((r) => r.key));
    const nextKey = paramKeys?.find((p) => !usedKeys.has(p.key))?.key ?? paramKeys?.[0]?.key ?? '';
    setRanges((prev) => [...prev, { key: nextKey, min: '', max: '' }]);
  }

  function updateRange(index: number, patch: Partial<RangeRow>) {
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    const local_filters: LocalFilters = {};
    if (keywords.length > 0) local_filters.exclude_keywords = keywords;

    const rangeEntries: Record<string, { min?: number; max?: number }> = {};
    for (const row of ranges) {
      if (!row.key) continue;
      const range: { min?: number; max?: number } = {};
      if (row.min.trim() !== '') range.min = Number(row.min);
      if (row.max.trim() !== '') range.max = Number(row.max);
      if (range.min !== undefined || range.max !== undefined) rangeEntries[row.key] = range;
    }
    if (Object.keys(rangeEntries).length > 0) local_filters.ranges = rangeEntries;

    updateFilters.mutate(
      { searchId: search.id, local_filters },
      {
        onSuccess: (result) =>
          toaster.create({
            type: 'success',
            title: 'Фільтри збережено',
            description: `Перераховано: ${result.filtered_out_count ?? 0} приховано`,
          }),
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка збереження фільтрів',
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    );
  }

  return (
    <DrawerRoot size="sm" open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>
          <DrawerTitle>Локальні фільтри — {search.name}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack gap={6}>
            <Stack gap={2}>
              <Text fontWeight="medium">Стоп-слова</Text>
              <Text textStyle="xs" color="fg.muted">
                Оголошення, де назва або опис містять одне зі слів — будуть приховані.
              </Text>
              <Wrap gap={2}>
                {keywords.map((kw) => (
                  <Tag.Root key={kw} size="md">
                    <Tag.Label>{kw}</Tag.Label>
                    <Tag.EndElement>
                      <Tag.CloseTrigger onClick={() => removeKeyword(kw)} />
                    </Tag.EndElement>
                  </Tag.Root>
                ))}
              </Wrap>
              <Input
                size="sm"
                placeholder="Додати слово і натиснути Enter"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
            </Stack>

            <Stack gap={2}>
              <Text fontWeight="medium">Діапазони параметрів</Text>
              <Text textStyle="xs" color="fg.muted">
                Оголошення, де значення параметра виходить за межі діапазону — будуть приховані.
              </Text>
              <Stack gap={2}>
                {ranges.map((row, index) => (
                  <HStack key={index} gap={2}>
                    <NativeSelect.Root size="sm" flex="1">
                      <NativeSelect.Field
                        value={row.key}
                        onChange={(e) => updateRange(index, { key: e.target.value })}
                      >
                        {row.key && !paramKeys?.some((p) => p.key === row.key) && (
                          <option value={row.key}>{row.key}</option>
                        )}
                        {paramKeys?.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.key}
                            {p.samples[0] ? ` (напр. ${p.samples[0]})` : ''}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                    <Input
                      size="sm"
                      w="90px"
                      placeholder="мін"
                      inputMode="decimal"
                      value={row.min}
                      onChange={(e) => updateRange(index, { min: e.target.value })}
                    />
                    <Input
                      size="sm"
                      w="90px"
                      placeholder="макс"
                      inputMode="decimal"
                      value={row.max}
                      onChange={(e) => updateRange(index, { max: e.target.value })}
                    />
                    <IconButton
                      aria-label="Видалити правило"
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => removeRange(index)}
                    >
                      <LuTrash2 />
                    </IconButton>
                  </HStack>
                ))}
              </Stack>
              <Button size="sm" variant="outline" onClick={addRange}>
                <LuPlus /> Додати правило
              </Button>
            </Stack>
          </Stack>
        </DrawerBody>
        <DrawerFooter>
          <Button colorPalette="blue" loading={updateFilters.isPending} onClick={handleSave}>
            Зберегти
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}
