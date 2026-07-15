import { Fragment, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  HStack,
  IconButton,
  NativeSelect,
  Spinner,
  Table,
  Text,
} from '@chakra-ui/react';
import { LuRefreshCw, LuScrollText, LuTrash2 } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from './ui/dialog';
import { Tooltip } from './ui/tooltip';
import { useClearLogs, useLogs } from '../api';
import type { AppLogEntry } from '../types';

/** Формат часу журналу: локальний, компактний (дата — лише якщо не сьогодні). */
function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const time = d.toLocaleTimeString('uk-UA', { hour12: false });
  const today = new Date().toDateString() === d.toDateString();
  return today ? time : `${d.toLocaleDateString('uk-UA')} ${time}`;
}

/** Details-JSON → читабельні пари; stack показуємо окремим блоком. */
function parseDetails(raw: string | null): { fields: [string, string][]; stack: string | null } {
  if (!raw) return { fields: [], stack: null };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const { stack, ...rest } = obj;
    return {
      fields: Object.entries(rest).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v),
      ]),
      stack: typeof stack === 'string' ? stack : null,
    };
  } catch {
    return { fields: [['details', raw]], stack: null };
  }
}

function LogRow({ entry }: { entry: AppLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { fields, stack } = parseDetails(entry.details);
  const hasDetails = fields.length > 0 || stack != null;

  return (
    <Fragment>
      <Table.Row
        onClick={() => hasDetails && setExpanded((v) => !v)}
        cursor={hasDetails ? 'pointer' : 'default'}
        _hover={{ bg: 'bg.subtle' }}
      >
        <Table.Cell whiteSpace="nowrap" fontFamily="mono" fontSize="xs">
          {formatTs(entry.ts)}
        </Table.Cell>
        <Table.Cell>
          <Badge colorPalette={entry.level === 'error' ? 'red' : 'orange'} variant="subtle">
            {entry.level === 'error' ? 'помилка' : 'увага'}
          </Badge>
        </Table.Cell>
        <Table.Cell whiteSpace="nowrap">
          <Code fontSize="xs">{entry.scope}</Code>
        </Table.Cell>
        <Table.Cell maxW="180px">
          <Text fontSize="xs" color="fg.muted" lineClamp={1} title={entry.stage ?? undefined}>
            {entry.stage ?? '—'}
          </Text>
        </Table.Cell>
        <Table.Cell>
          <Text fontSize="sm" lineClamp={expanded ? undefined : 2}>
            {entry.message}
          </Text>
        </Table.Cell>
      </Table.Row>
      {expanded && hasDetails && (
        <Table.Row bg="bg.subtle">
          <Table.Cell colSpan={5} py={2}>
            {fields.length > 0 && (
              <HStack gap={3} wrap="wrap" mb={stack ? 2 : 0}>
                {fields.map(([k, v]) => (
                  <Text key={k} fontSize="xs" color="fg.muted">
                    <b>{k}:</b> {v}
                  </Text>
                ))}
              </HStack>
            )}
            {stack && (
              <Box as="pre" fontSize="xs" fontFamily="mono" whiteSpace="pre-wrap" overflowX="auto">
                {stack}
              </Box>
            )}
          </Table.Cell>
        </Table.Row>
      )}
    </Fragment>
  );
}

/**
 * Діалог «Журнал» (docs/plans/logging-system.md): перегляд app_logs — warn+error з усіх
 * модулів сервера з етапом data flow (scope/stage). Відкривається з хедера; поки відкритий —
 * авто-оновлюється (useLogs refetchInterval).
 */
export function LogsDialog() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<'' | 'warn' | 'error'>('');
  const [scope, setScope] = useState('');

  const { data, isLoading, refetch, isFetching } = useLogs(
    { level: level || undefined, scope: scope || undefined },
    open,
  );
  const clearLogs = useClearLogs();

  return (
    <>
      <Tooltip content="Журнал помилок">
        <IconButton aria-label="Журнал помилок" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <LuScrollText />
        </IconButton>
      </Tooltip>

      <DialogRoot open={open} onOpenChange={(d) => setOpen(d.open)} size="xl" placement="center">
        <DialogBackdrop />
        <DialogContent maxH="85vh">
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>Журнал</DialogTitle>
          </DialogHeader>
          <DialogBody overflowY="auto" pb={4}>
            <HStack gap={2} mb={3} wrap="wrap">
              <NativeSelect.Root size="sm" w="160px">
                <NativeSelect.Field
                  value={level}
                  onChange={(e) => setLevel(e.target.value as '' | 'warn' | 'error')}
                  cursor="pointer"
                >
                  <option value="">Всі рівні</option>
                  <option value="error">Помилки</option>
                  <option value="warn">Попередження</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <NativeSelect.Root size="sm" w="200px">
                <NativeSelect.Field
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  cursor="pointer"
                >
                  <option value="">Всі модулі</option>
                  {(data?.scopes ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Tooltip content="Оновити">
                <IconButton
                  aria-label="Оновити"
                  variant="ghost"
                  size="sm"
                  loading={isFetching}
                  onClick={() => refetch()}
                >
                  <LuRefreshCw />
                </IconButton>
              </Tooltip>
              <Box flex="1" />
              <Button
                variant="outline"
                size="sm"
                colorPalette="red"
                loading={clearLogs.isPending}
                onClick={() => clearLogs.mutate()}
              >
                <LuTrash2 /> Очистити
              </Button>
            </HStack>

            {isLoading ? (
              <HStack justify="center" py={8}>
                <Spinner />
              </HStack>
            ) : (data?.logs.length ?? 0) === 0 ? (
              <Text color="fg.muted" textAlign="center" py={8}>
                Журнал порожній — помилок не зафіксовано.
              </Text>
            ) : (
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader w="90px">Час</Table.ColumnHeader>
                    <Table.ColumnHeader w="90px">Рівень</Table.ColumnHeader>
                    <Table.ColumnHeader w="120px">Модуль</Table.ColumnHeader>
                    <Table.ColumnHeader w="180px">Етап</Table.ColumnHeader>
                    <Table.ColumnHeader>Повідомлення</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data?.logs.map((entry) => <LogRow key={entry.id} entry={entry} />)}
                </Table.Body>
              </Table.Root>
            )}
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
