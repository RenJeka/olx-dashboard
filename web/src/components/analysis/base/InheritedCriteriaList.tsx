import { Badge, Box, HStack, Stack, Text, Wrap } from '@chakra-ui/react';
import { BaseBadge } from '../criteria/BaseBadge';
import { sortAlpha } from '../../../utils/sort';
import type { CriterionGroup } from '../../../types';

interface Props {
  groups: CriterionGroup[];
  filtered: boolean;
}

/**
 * Розділ «Успадковано» вікна «Базові плюси й мінуси»: пункти батьківських категорій, лише перегляд.
 * Бейдж — назва категорії-джерела (там пункт і змінюється).
 */
export function InheritedCriteriaList({ groups, filtered }: Props) {
  return (
    <Stack gap={0}>
      <Text textStyle="xs" color="fg.muted" fontWeight="semibold" pt={3} pb={1}>
        Успадковано (змінюється в батьківській категорії)
      </Text>
      <Box borderTopWidth="1px" borderColor="border.subtle">
        {groups.length === 0 && (
          <Text textStyle="sm" color="fg.muted" py={2}>
            {filtered ? 'Нічого не знайдено.' : 'Від батьківських категорій нічого не успадковано.'}
          </Text>
        )}
        {groups.map((g) => (
          <Stack key={g.name} gap={1} py={2} px={2} borderBottomWidth="1px" borderColor="border.subtle">
            <HStack gap={2}>
              <Text flex="1" minW={0} textStyle="sm" color={g.enabled ? undefined : 'fg.muted'} lineClamp={2}>
                {g.name}
              </Text>
              {!g.enabled && (
                <Text textStyle="xs" color="fg.muted" flexShrink={0}>
                  не в аналізі
                </Text>
              )}
              {g.base && <BaseBadge base={g.base} showSource />}
            </HStack>
            {g.aliases.length > 0 && (
              <Wrap gap={1}>
                {sortAlpha(g.aliases).map((a) => (
                  <Badge key={a} variant="outline" size="sm">
                    {a}
                  </Badge>
                ))}
              </Wrap>
            )}
          </Stack>
        ))}
      </Box>
    </Stack>
  );
}
