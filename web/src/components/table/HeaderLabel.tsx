import { HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface HeaderLabelProps {
  icon: ReactNode;
  children: ReactNode;
}

export function HeaderLabel({ icon, children }: HeaderLabelProps) {
  return (
    <HStack gap={1}>
      {icon}
      <Text>{children}</Text>
    </HStack>
  );
}
