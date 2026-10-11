import { useState, type RefObject } from 'react';
import { Badge, Button, Field, Input, Stack, Text, Wrap } from '@chakra-ui/react';
import { NestedDialog } from './NestedDialog';

interface Props {
  portalRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** «Об'єднати в категорію» (кілька) чи «Перейменувати» (одна). */
  title: string;
  /** Обрані формулювання. */
  names: string[];
  /** Синоніми обраних категорій — теж перейдуть у нову. */
  aliases: string[];
  /** Скільки оголошень зачепить (назви + синоніми). */
  affected: number;
  pending: boolean;
  onConfirm: (name: string) => void;
}

/** Найкоротше формулювання — типово найзагальніше («дефект екрану», а не «тріснутий екран у куті»). */
function suggestName(names: string[]): string {
  return [...names].sort((a, b) => a.length - b.length)[0] ?? '';
}

/**
 * Діалог об'єднання/перейменування: назва категорії (можна взяти будь-яку з обраних або ввести нову),
 * решта формулювань стає синонімами; у зачеплених оголошеннях пункти перейменовуються.
 */
export function MergeCriteriaDialog({ portalRef, onClose, title, names, aliases, affected, pending, onConfirm }: Props) {
  const [name, setName] = useState(() => (names.length === 1 ? (names[0] ?? '') : suggestName(names)));

  const trimmed = name.trim();
  const synonyms = [...names, ...aliases].filter((n) => n.trim().toLowerCase() !== trimmed.toLowerCase());

  return (
    <NestedDialog
      portalRef={portalRef}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Скасувати
          </Button>
          <Button
            size="sm"
            colorPalette="accent"
            loading={pending}
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            Зберегти
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        <Field.Root>
          <Field.Label>Назва категорії</Field.Label>
          <Input
            size="sm"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && trimmed && !pending && onConfirm(trimmed)}
          />
        </Field.Root>
        <Wrap gap={1}>
          {names.map((n) => (
            <Button key={n} size="2xs" variant="outline" onClick={() => setName(n)}>
              {n}
            </Button>
          ))}
        </Wrap>
        {synonyms.length > 0 && (
          <Stack gap={1}>
            <Text textStyle="sm" color="fg.muted">
              Стануть синонімами (у питаннях AI — як приклади):
            </Text>
            <Wrap gap={1}>
              {synonyms.map((s) => (
                <Badge key={s} variant="subtle">
                  {s}
                </Badge>
              ))}
            </Wrap>
          </Stack>
        )}
        <Text textStyle="sm">
          Зачепить оголошень: <strong>{affected}</strong> — пункти в них перейменуються, AI не запускається.
        </Text>
      </Stack>
    </NestedDialog>
  );
}
