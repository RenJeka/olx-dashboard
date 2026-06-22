import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { ANALYSIS_STEPS } from '../../../constants';

interface Props {
  step: number;
  modeLabel: string;
  scopeLabel: string;
  effectiveCount: number;
}

/** Степер у заголовку майстра AI-аналізу. */
export function WizardStepper({ step, modeLabel, scopeLabel, effectiveCount }: Props) {
  return (
    <Stack gap={3} w="full">
      {/* Степер */}
      <HStack gap={2} wrap="wrap" rowGap={2}>
        {ANALYSIS_STEPS.map((label, i) => (
          <HStack key={label} gap={1.5}>
            <Box
              boxSize={6}
              rounded="full"
              fontSize="xs"
              fontWeight="bold"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg={step === i + 1 ? 'accent.solid' : step > i + 1 ? 'green.solid' : 'bg.muted'}
              color={step >= i + 1 ? 'white' : 'fg.muted'}
            >
              {i + 1}
            </Box>
            <Text textStyle="xs" color={step === i + 1 ? 'fg.default' : 'fg.muted'} fontWeight={step === i + 1 ? 'bold' : 'normal'}>
              {label}
            </Text>
            {i < ANALYSIS_STEPS.length - 1 && <Box w={4} h="1px" bg="border.subtle" />}
          </HStack>
        ))}
      </HStack>
      {/* Кроки 2–4: read-only підсумок режиму та scope */}
      {step > 1 && (
        <Text textStyle="xs" color="fg.muted">
          {modeLabel} · {scopeLabel} ({effectiveCount})
        </Text>
      )}
    </Stack>
  );
}
