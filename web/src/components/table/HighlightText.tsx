import { Mark } from '@chakra-ui/react';
import { Fragment } from 'react';

interface Props {
  text: string;
  query: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Підсвічує всі збіги `query` у `text` через `<Mark>` (для фільтр-панелі таблиці). */
export function HighlightText({ text, query }: Props) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
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
