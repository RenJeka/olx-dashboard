import { Mark } from '@chakra-ui/react';
import { Fragment } from 'react';
import { escapeRegExp } from '../../utils/text';
import { HIGHLIGHT_MULTI_MIN_LENGTH, HIGHLIGHT_SINGLE_MIN_LENGTH } from '../../constants';

interface Props {
  text: string;
  /** Рядок-запит (фільтр таблиці) або масив фрагментів (evidence у превʼю аналізу). */
  query: string | string[];
}

/**
 * Підсвічує всі збіги `query` у `text` через `<Mark>`. `query` — або один пошуковий рядок
 * (фільтр таблиці), або масив фрагментів (evidence у кроці «Перевірка» майстра аналізу).
 * Фрагменти коротші за 3 символи ігноруються (захист від шуму/порожніх evidence).
 */
export function HighlightText({ text, query }: Props) {
  const minLength = Array.isArray(query) ? HIGHLIGHT_MULTI_MIN_LENGTH : HIGHLIGHT_SINGLE_MIN_LENGTH;
  const needles = (Array.isArray(query) ? query : [query])
    .map((q) => q.trim())
    .filter((q) => q.length >= minLength);
  if (needles.length === 0) return <>{text}</>;

  const lower = new Set(needles.map((n) => n.toLowerCase()));
  const parts = text.split(new RegExp(`(${needles.map(escapeRegExp).join('|')})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        lower.has(part.toLowerCase()) ? (
          <Mark key={i} bg="yellow.subtle" rounded="sm">
            {part}
          </Mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
