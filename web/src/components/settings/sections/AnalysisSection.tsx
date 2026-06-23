import { useState } from 'react';
import { Badge, Heading, HStack, Input, Stack, Text, Textarea } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useAnalysisStatus } from '../../../api';
import { useSettingsStore } from '../../../stores/settingsStore';

/** Секція налаштувань «AI-аналіз»: статус ключа, модель, reasoning, додаткові критерії. */
export function AnalysisSection() {
  const { data: status } = useAnalysisStatus();
  const analysisModel = useSettingsStore((s) => s.analysisModel);
  const setAnalysisModel = useSettingsStore((s) => s.setAnalysisModel);
  const analysisReasoning = useSettingsStore((s) => s.analysisReasoning);
  const setAnalysisReasoning = useSettingsStore((s) => s.setAnalysisReasoning);
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
