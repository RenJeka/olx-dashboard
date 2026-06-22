// Кастомна система Chakra: дефолтна конфігурація + наші семантичні токени (accent).
// Підключається у components/ui/provider.tsx замість `defaultSystem`.

import { createSystem, defaultConfig } from '@chakra-ui/react';
import { customConfig } from './tokens';

export const system = createSystem(defaultConfig, customConfig);
