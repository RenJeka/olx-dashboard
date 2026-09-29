import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { LuStar } from 'react-icons/lu';
import { tabName, type AiScope, type ScopeCounts } from '../../utils/aiScope';
import type { StatusFilter } from '../../utils/listingVisibility';

const SCOPE_HINTS: Record<AiScope, string> = {
  all: 'Геть усі оголошення пошуку, включно з відфільтрованими та нерелевантними.',
  tab: 'Рівно те, що зараз показано в таблиці активної вкладки (з урахуванням перемикачів над нею).',
  selected: 'Лише рядки, які ти позначив чекбоксами в таблиці.',
  candidates: 'Без мінусів, активні, не відфільтровані, релевантні — найкращі для AI.',
};

interface Props {
  value: AiScope;
  onChange: (scope: AiScope) => void;
  counts: ScopeCounts;
  statusFilter: StatusFilter;
}

/**
 * Спільний селектор обсягу AI-операцій. Завжди показує всі 4 перемикачі (single-select):
 * три нейтральні (Весь пошук / У таблиці / Вибрані) + відокремлений «Найкращі кандидати»
 * (amber + зірка). Неактивні обсяги лишаються видимими, але `disabled` — UI не «стрибає».
 */
export function ScopeSelector({ value, onChange, counts, statusFilter }: Props) {
  return (
    <Box>
      <Text textStyle="xs" color="fg.muted" mb={1}>
        Обсяг
      </Text>
      <HStack gap={2} wrap="wrap" align="center">
        <HStack gap={1} wrap="wrap">
          <Button
            size="xs"
            variant={value === 'all' ? 'solid' : 'outline'}
            colorPalette="accent"
            onClick={() => onChange('all')}
          >
            Весь пошук ({counts.all})
          </Button>
          <Button
            size="xs"
            variant={value === 'tab' ? 'solid' : 'outline'}
            colorPalette="accent"
            onClick={() => onChange('tab')}
          >
            У таблиці · {counts.tab} (Вкладка "{tabName(statusFilter)}")
          </Button>
          <Button
            size="xs"
            variant={value === 'selected' ? 'solid' : 'outline'}
            colorPalette="accent"
            disabled={counts.selected === 0}
            onClick={() => onChange('selected')}
          >
            Вибрані ({counts.selected})
          </Button>
        </HStack>
        <Button
          size="xs"
          variant={value === 'candidates' ? 'solid' : 'outline'}
          colorPalette="yellow"
          onClick={() => onChange('candidates')}
        >
          <LuStar /> Найкращі кандидати ({counts.candidates})
        </Button>
      </HStack>
      <Text textStyle="xs" color="fg.muted" mt={1}>
        {SCOPE_HINTS[value]}
      </Text>
    </Box>
  );
}
