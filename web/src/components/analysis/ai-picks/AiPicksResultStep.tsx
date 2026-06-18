import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { AiRankCard } from '../AiRankCard';
import type { useAiPicksFlow } from '../../../hooks/useAiPicksFlow';

type Flow = ReturnType<typeof useAiPicksFlow>;

interface Props {
  flow: Flow;
  onCommit: () => void;
}

/** Крок done: результати AI-ранжування з картками та кнопкою збереження. */
export function AiPicksResultStep({ flow, onCommit }: Props) {
  const { pendingPicks, summary, listingsMap, reset, commitIsPending } = flow;

  return (
    <Stack gap={4}>
      {summary && (
        <Box
          p={3}
          bg="bg.subtle"
          borderWidth="1px"
          borderColor="border.subtle"
          rounded="md"
        >
          <Text textStyle="sm" fontStyle="italic" color="fg.muted">
            {summary}
          </Text>
        </Box>
      )}

      {pendingPicks.length === 0 ? (
        <Text color="fg.muted" textStyle="sm">
          AI не знайшов гідних кандидатів серед поданих оголошень.
        </Text>
      ) : (
        <Box overflowX="auto">
          <HStack gap={3} align="stretch" pb={2}>
            {pendingPicks.map((pick) => (
              <AiRankCard
                key={pick.id}
                pick={pick}
                listing={listingsMap.get(pick.id)}
              />
            ))}
          </HStack>
        </Box>
      )}

      <HStack gap={2} justify="flex-end">
        <Button size="sm" variant="ghost" onClick={reset}>
          Повторити
        </Button>
        <Button
          size="sm"
          colorPalette="teal"
          loading={commitIsPending}
          onClick={onCommit}
        >
          Зберегти результат
        </Button>
      </HStack>
    </Stack>
  );
}
