import { useState } from 'react';
import { Box, Button, HStack, Stack, Text, Textarea } from '@chakra-ui/react';
import { LuCopy, LuDownload } from 'react-icons/lu';
import { toaster } from '../ui/toaster';
import type { PackagePart } from '../../types';

interface Props {
  /** Заголовок панелі-помічника. */
  title: string;
  /** Частини промпту/пакета для копіювання/завантаження (1 або кілька). */
  parts: PackagePart[];
  /** Підпис кнопки вставки. */
  pasteLabel: string;
  /** Викликається при натисканні «Обробити вставку». */
  onSubmit: (raw: string) => void;
  submitting?: boolean;
  /** Лічильник/підказка під полем вставки (напр. «Опрацьовано 12»). */
  footer?: React.ReactNode;
}

function copyText(text: string): void {
  navigator.clipboard.writeText(text);
  toaster.create({ type: 'success', title: 'Скопійовано' });
}

function downloadText(part: PackagePart): void {
  const blob = new Blob([part.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = part.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Бічна панель-помічник ручного режиму: копіювання/завантаження промпту(ів) для
 * безкоштовного чату + поле для вставки відповіді. Перевикористовується для кроків
 * «Критерії» і «Пошук».
 */
export function ManualAssistant({ title, parts, pasteLabel, onSubmit, submitting, footer }: Props) {
  const [raw, setRaw] = useState('');
  const multiPart = parts.length > 1;

  return (
    <Stack gap={3} p={4} bg="bg.subtle" borderWidth="1px" borderColor="border.subtle" rounded="lg">
      <Text textStyle="sm" fontWeight="semibold">
        {title}
      </Text>

      {parts.length === 0 ? (
        <Text textStyle="xs" color="fg.muted">
          Натисни кнопку нижче, щоб підготувати промпт.
        </Text>
      ) : (
        <Stack gap={2}>
          {parts.map((part, i) => (
            <HStack key={part.name} gap={2}>
              <Text textStyle="xs" color="fg.muted" flex="1" lineClamp={1}>
                {multiPart ? `Частина ${i + 1}/${parts.length}: ` : ''}
                {part.name}
              </Text>
              <Button size="xs" variant="outline" onClick={() => copyText(part.content)}>
                <LuCopy /> Копіювати
              </Button>
              {multiPart && (
                <Button size="xs" variant="ghost" onClick={() => downloadText(part)}>
                  <LuDownload />
                </Button>
              )}
            </HStack>
          ))}
        </Stack>
      )}

      <Box>
        <Text textStyle="xs" color="fg.muted" mb={1}>
          Встав сюди відповідь із чату:
        </Text>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Встав JSON-відповідь LLM…"
          rows={5}
          fontFamily="mono"
          fontSize="xs"
        />
      </Box>

      <HStack justify="space-between">
        {footer ?? <Box />}
        <Button
          size="sm"
          colorPalette="blue"
          disabled={!raw.trim()}
          loading={submitting}
          onClick={() => {
            onSubmit(raw);
            setRaw('');
          }}
        >
          {pasteLabel}
        </Button>
      </HStack>
    </Stack>
  );
}
