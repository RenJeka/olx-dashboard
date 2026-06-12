import { Box, Checkbox, HStack, Input, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';

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
        </HStack>
      </HStack>
    </Box>
  );
}
