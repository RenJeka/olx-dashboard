import { Badge, Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import type { useRelevanceFlow } from '../../../hooks/useRelevanceFlow';
import { getRelevanceStats, isItemRelevant } from '../../../utils/relevance';

interface Props {
  flow: ReturnType<typeof useRelevanceFlow>;
}

/**
 * Відображення результатів класифікації релевантності з можливістю ручних виправлень.
 */
export function RelevanceResultsList({ flow }: Props) {
  const { state, actions, mutations } = flow;
  
  const { irrelevantCount, autoRejectedCount } = getRelevanceStats(state.results, state.overrides);

  return (
    <Stack gap={4}>
      <Text textStyle="sm" color="fg.muted">
        Класифіковано <strong>{state.results.length}</strong>, нерелевантних:{' '}
        <strong>{irrelevantCount}</strong>. Натисни на вердикт, щоб виправити.
      </Text>
      {autoRejectedCount > 0 && (
        <Text textStyle="xs" color="fg.muted">
          З них <strong>{autoRejectedCount}</strong> відсіяно автоматично без ШІ (бренд і
          номер моделі не стоять поруч у тексті). Перевір і виправ за потреби.
        </Text>
      )}

      <Stack gap={2} maxH="50vh" overflowY="auto">
        {state.results.map((r) => {
          const listing = state.listingsMap.get(r.id);
          const relevant = isItemRelevant(r, state.overrides);
          return (
            <Box
              key={r.id}
              p={2}
              borderWidth="1px"
              borderColor="border.subtle"
              rounded="md"
            >
              <HStack gap={2} align="start">
                <Badge
                  colorPalette={relevant ? 'success' : 'danger'}
                  variant="solid"
                  cursor="pointer"
                  flexShrink={0}
                  onClick={() => actions.toggleOverride(r.id, relevant)}
                >
                  {relevant ? 'продає' : 'нерелевантне'}
                </Badge>
                <Box flex="1" minW={0}>
                  <Text textStyle="sm" lineClamp={1}>
                    {listing?.title ?? `#${r.id}`}
                  </Text>
                  {r.reason && (
                    <Text textStyle="xs" color="fg.muted">
                      {r.reason}
                    </Text>
                  )}
                </Box>
              </HStack>
            </Box>
          );
        })}
      </Stack>

      <HStack gap={2} justify="flex-end">
        <Button size="sm" variant="ghost" onClick={actions.reset}>
          Повторити
        </Button>
        <Button
          size="sm"
          colorPalette="cyan"
          loading={mutations.commitRelevance.isPending || mutations.saveTarget.isPending}
          onClick={() => actions.handleCommit(state.results.map((r) => ({ ...r, relevant: isItemRelevant(r, state.overrides) })))}
        >
          Зберегти результат
        </Button>
      </HStack>
    </Stack>
  );
}
