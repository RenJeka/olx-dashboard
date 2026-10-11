import { useState } from 'react';
import { Badge, Button, Heading, HStack, Input, SegmentGroup, Stack, Text, Textarea } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useAnalysisStatus } from '../../../api';
import { useSettingsStore } from '../../../stores/settingsStore';
import {
  ANALYSIS_ENGINE_LABELS,
  JEV_CRITERIA_THRESHOLD_DEFAULT,
  JEV_CRITERIA_THRESHOLD_MAX,
  JEV_CRITERIA_THRESHOLD_MIN,
} from '../../../constants';
import type { AnalysisEngine } from '../../../types';

const ENGINE_ITEMS = (Object.keys(ANALYSIS_ENGINE_LABELS) as AnalysisEngine[]).map((value) => ({
  value,
  label: ANALYSIS_ENGINE_LABELS[value],
}));

/** Введене значення порогу → у межах MIN…MAX, кроком 0.05; не число — типовий. */
function clampThreshold(raw: string): number {
  const v = Number(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return JEV_CRITERIA_THRESHOLD_DEFAULT;
  const clamped = Math.min(JEV_CRITERIA_THRESHOLD_MAX, Math.max(JEV_CRITERIA_THRESHOLD_MIN, v));
  return Math.round(clamped * 20) / 20;
}

/** Секція налаштувань «AI-аналіз»: статус ключа, рушій кроків 1–2, поріг Jev, модель, reasoning, додаткові критерії. */
export function AnalysisSection() {
  const { data: status } = useAnalysisStatus();
  const analysisModel = useSettingsStore((s) => s.analysisModel);
  const setAnalysisModel = useSettingsStore((s) => s.setAnalysisModel);
  const analysisReasoning = useSettingsStore((s) => s.analysisReasoning);
  const setAnalysisReasoning = useSettingsStore((s) => s.setAnalysisReasoning);
  const analysisEngine = useSettingsStore((s) => s.analysisEngine);
  const setAnalysisEngine = useSettingsStore((s) => s.setAnalysisEngine);
  const jevThreshold = useSettingsStore((s) => s.jevCriteriaThreshold);
  const setJevThreshold = useSettingsStore((s) => s.setJevCriteriaThreshold);
  const [localThreshold, setLocalThreshold] = useState(String(jevThreshold));
  const analysisExtraCriteria = useSettingsStore((s) => s.analysisExtraCriteria);
  const setAnalysisExtraCriteria = useSettingsStore((s) => s.setAnalysisExtraCriteria);
  
  const [localModel, setLocalModel] = useState(analysisModel);
  const [localExtra, setLocalExtra] = useState(analysisExtraCriteria);

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Heading size="sm">
          <HStack gap={1}>
            <LuSparkles /> AI-аналіз
          </HStack>
        </Heading>
        <Badge colorPalette={status?.apiAvailable ? 'success' : 'gray'} variant="subtle">
          {status?.apiAvailable ? 'ключ є (авто)' : 'ручний режим'}
        </Badge>
      </HStack>

      <Stack gap={1}>
        <Text textStyle="xs" color="fg.muted">
          Рушій фільтра релевантності й пошуку мінусів/плюсів (авто)
        </Text>
        <SegmentGroup.Root
          size="sm"
          value={analysisEngine}
          disabled={!status?.jevAvailable}
          onValueChange={(d) => setAnalysisEngine(d.value === 'jev' ? 'jev' : 'llm')}
        >
          <SegmentGroup.Indicator cursor="pointer" />
          <SegmentGroup.Items items={ENGINE_ITEMS} cursor="pointer" />
        </SegmentGroup.Root>
        <Text textStyle="xs" color="fg.subtle">
          {analysisEngine === 'jev'
            ? `Jev (${status?.jevModel ?? 'decision-модель'}) — дешевше; замість цитат — ймовірність. Генерація критеріїв і AI Вибір — завжди LLM.`
            : 'LLM — модель нижче; знайдене підтверджується цитатою з опису.'}
        </Text>
      </Stack>

      {analysisEngine === 'jev' && (
        <Stack gap={1}>
          <Text textStyle="xs" color="fg.muted">
            Поріг Jev для мінусів/плюсів ({JEV_CRITERIA_THRESHOLD_MIN}–{JEV_CRITERIA_THRESHOLD_MAX})
          </Text>
          <HStack gap={2}>
            <Input
              size="sm"
              maxW="100px"
              type="number"
              inputMode="decimal"
              step={0.05}
              min={JEV_CRITERIA_THRESHOLD_MIN}
              max={JEV_CRITERIA_THRESHOLD_MAX}
              value={localThreshold}
              onChange={(e) => setLocalThreshold(e.target.value)}
              onBlur={() => {
                const next = clampThreshold(localThreshold);
                setJevThreshold(next);
                setLocalThreshold(String(next));
              }}
            />
            {jevThreshold !== JEV_CRITERIA_THRESHOLD_DEFAULT && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setJevThreshold(JEV_CRITERIA_THRESHOLD_DEFAULT);
                  setLocalThreshold(String(JEV_CRITERIA_THRESHOLD_DEFAULT));
                }}
              >
                Типово ({JEV_CRITERIA_THRESHOLD_DEFAULT})
              </Button>
            )}
          </HStack>
          <Text textStyle="xs" color="fg.subtle">
            Категорія знайдена, якщо ймовірність Jev ≥ порогу. Вище — менше хибних, але більше пропусків; нижче — навпаки.
          </Text>
        </Stack>
      )}

      <Stack gap={1}>
        <Text textStyle="xs" color="fg.muted">
          Модель (OpenRouter)
        </Text>
        <Input
          size="sm"
          value={localModel}
          onChange={(e) => setLocalModel(e.target.value)}
          onBlur={() => setAnalysisModel(localModel)}
          placeholder="google/gemini-2.5-flash-lite"
        />
      </Stack>

      <Switch
        checked={analysisReasoning}
        onCheckedChange={(d) => setAnalysisReasoning(d.checked)}
      >
        <Text>reasoning для пошуку (повільніше, точніше)</Text>
      </Switch>

      <Stack gap={1}>
        <Text textStyle="xs" color="fg.muted">
          Додаткові критерії (дотекст до промпту генерації)
        </Text>
        <Textarea
          size="sm"
          rows={2}
          value={localExtra}
          onChange={(e) => setLocalExtra(e.target.value)}
          onBlur={() => setAnalysisExtraCriteria(localExtra)}
          placeholder="Напр.: звертай увагу на стан акумулятора, гарантію…"
        />
      </Stack>
    </Stack>
  );
}
