import { useState, type ReactNode } from 'react';
import { Box, Collapsible, HStack, Icon, Text } from '@chakra-ui/react';
import { LuChevronDown } from 'react-icons/lu';

interface Props {
  /** Заголовок секції — клік по ньому згортає/розгортає вміст. */
  title: string;
  /** Дії праворуч у шапці (напр. перемикач «Інвертувати») — поза тригером, клік не згортає. */
  actions?: ReactNode;
  /** Чи розгорнута секція спочатку (за замовчуванням — так). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Згортувана секція локального фільтра: клікабельна шапка (шеврон + заголовок) розкриває/ховає
 * вміст. Дії праворуч (перемикач інверсії) рендеряться поза тригером, тож не згортають секцію.
 */
export function CollapsibleFilter({ title, actions, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={(e) => setOpen(e.open)}>
      <HStack justify="space-between" gap={3}>
        <Collapsible.Trigger flex="1" textAlign="left" cursor="pointer">
          <HStack gap={1.5} color="fg" _hover={{ color: 'accent.fg' }} transition="color 0.12s">
            <Icon
              as={LuChevronDown}
              boxSize={4}
              color="fg.muted"
              transform={open ? 'rotate(0deg)' : 'rotate(-90deg)'}
              transition="transform 0.15s"
            />
            <Text fontWeight="medium">{title}</Text>
          </HStack>
        </Collapsible.Trigger>
        {actions}
      </HStack>
      <Collapsible.Content>
        <Box pt={2}>{children}</Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
