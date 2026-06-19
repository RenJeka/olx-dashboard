import { Box, Checkbox, HStack, Input, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { LuInfo, LuX } from 'react-icons/lu';
import { Tooltip } from '../../ui/tooltip';

export interface SearchScope {
  inTitle: boolean;
  inDescription: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
}

function buildPlaceholder(scope: SearchScope): string {
  if (scope.inTitle && scope.inDescription) return 'Пошук у назві й описі...';
  if (scope.inTitle) return 'Пошук у назві...';
  if (scope.inDescription) return 'Пошук в описі...';
  return 'Пошук...';
}

/** Поле пошуку з дебаунсом, кнопкою очистки та чекбоксами вибору полів. */
export function SearchInput({ value, onChange, scope, onScopeChange }: Props) {
  const [inputValue, setInputValue] = useState(value);

  // Дебаунс 500 мс
  useEffect(() => {
    const timer = setTimeout(() => onChange(inputValue), 500);
    return () => clearTimeout(timer);
  }, [inputValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Синхронізація при зовнішньому скиданні
  useEffect(() => {
    if (value === '') setInputValue('');
  }, [value]);

  const noneSelected = !scope.inTitle && !scope.inDescription;
  const placeholder = buildPlaceholder(scope);

  const operatorsHint = (
    <Stack gap={1.5} maxW="280px" py={1} px={1} fontSize="xs">
      <Text fontWeight="semibold" color="fg.default">
        Спецсимволи пошуку:
      </Text>
      <Box as="ul" pl={4} color="fg.muted" css={{ '& li': { mb: 0.5 } }}>
        <li>
          <strong>&&</strong> — ТА (всі слова). Напр. <em>коляска && зима</em>
        </li>
        <li>
          <strong>||</strong> — АБО (хоч одне). Напр. <em>біговел || велобіг</em>
        </li>
        <li>
          <strong>!</strong> — НЕ (виключити). Напр. <em>коляска && !chicco</em>
        </li>
      </Box>
    </Stack>
  );

  return (
    <Box position="relative" display="inline-flex">
      <HStack
        gap={3}
        wrap="nowrap"
        align="center"
        bg="gray.subtle"
        rounded="md"
        px={3}
        border="1px solid"
        borderColor="border.subtle"
      >
        {/* Input з хрестиком */}
        <Box position="relative" maxW="360px" minW="200px" flex="1">
          <Input
            size="sm"
            pr={inputValue ? '28px' : undefined}
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {/* Зелений індикатор — активний пошук */}
          {value && (
            <Box
              position="absolute"
              top="-4px"
              right="-4px"
              w="10px"
              h="10px"
              bg="green.500"
              rounded="full"
              border="2px solid"
              borderColor="bg"
              zIndex={1}
              title="Пошук активний"
            />
          )}
          {inputValue && (
            <Box
              as="button"
              position="absolute"
              right="6px"
              top="50%"
              transform="translateY(-50%)"
              display="flex"
              alignItems="center"
              color="fg.muted"
              _hover={{ color: 'fg' }}
              onClick={() => setInputValue('')}
              aria-label="Очистити пошук"
              px={2}
            >
              <LuX size={20} cursor="pointer" />
            </Box>
          )}
        </Box>

        {/* Чекбокси scope */}
        <HStack gap={3}>
          <Checkbox.Root
            size="sm"
            cursor="pointer"
            checked={scope.inTitle}
            onCheckedChange={(d) => onScopeChange({ ...scope, inTitle: !!d.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control cursor="pointer" />
            <Checkbox.Label>у назві</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            size="sm"
            cursor="pointer"
            checked={scope.inDescription}
            onCheckedChange={(d) => onScopeChange({ ...scope, inDescription: !!d.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control cursor="pointer" />
            <Checkbox.Label>в описі</Checkbox.Label>
          </Checkbox.Root>

          {/* Підказка якщо нічого не вибрано */}
          {noneSelected && (
            <Text textStyle="xs" color="orange.fg" fontStyle="italic">
              Обери хоча б одне поле
            </Text>
          )}

          {/* Підказка зі спецсимволами (&& || !) */}
          <Tooltip content={operatorsHint} positioning={{ placement: 'top' }} showArrow openDelay={150}>
            <HStack as="span" gap={1} color="fg.muted" cursor="help" flexShrink={0}>
              <LuInfo />
              <Text as="span" textStyle="xs" display={{ base: 'none', md: 'inline' }}>
                && || !
              </Text>
            </HStack>
          </Tooltip>
        </HStack>
      </HStack>
    </Box>
  );
}
