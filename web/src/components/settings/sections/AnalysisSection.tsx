import { useState } from 'react';
import { Badge, Heading, HStack, Input, Stack, Text, Textarea } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useAnalysisStatus } from '../../../api';
import {
  loadAnalysisModel,
  saveAnalysisModel,
  loadAnalysisReasoning,
  saveAnalysisReasoning,
  loadAnalysisExtraCriteria,
  saveAnalysisExtraCriteria,
} from '../../../utils/storage';

/** Секція налаштувань «AI-аналіз»: статус ключа, модель, reasoning, додаткові критерії. */
export function AnalysisSection() {
  const { data: status } = useAnalysisStatus();
  const [model, setModel] = useState(() => loadAnalysisModel());
  const [reasoning, setReasoning] = useState(() => loadAnalysisReasoning());
  const [extra, setExtra] = useState(() => loadAnalysisExtraCriteria());

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Heading size="sm">
          <HStack gap={1}>
            <LuSparkles /> AI-аналіз
          </HStack>
        </Heading>
        <Badge colorPalette={status?.apiAvailable ? 'green' : 'gray'} variant="subtle">
          {status?.apiAvailable ? 'ключ є (авто)' : 'ручний режим'}
        </Badge>
      </HStack>

      <Stack gap={1}>
        <Text textStyle="xs" color="fg.muted">
          Модель (OpenRouter)
        </Text>
        <Input
          size="sm"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => saveAnalysisModel(model)}
          placeholder="google/gemini-2.5-flash-lite"
        />
      </Stack>

      <Switch
        checked={reasoning}
        onCheckedChange={(d) => {
          setReasoning(d.checked);
          saveAnalysisReasoning(d.checked);
        }}
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
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onBlur={() => saveAnalysisExtraCriteria(extra)}
          placeholder="Напр.: звертай увагу на стан акумулятора, гарантію…"
        />
      </Stack>
    </Stack>
  );
}
