import { Accordion, Button, Field, HStack, Input, Stack, Text } from '@chakra-ui/react';
import { LuLayers, LuPlus } from 'react-icons/lu';
import type { NewSearchFormState } from '../../hooks/useNewSearchForm';

interface Props {
  form: NewSearchFormState;
}

/** Акордеон-секція форми створення нового пошуку (назва/запит/ціна/варіанти). */
export function NewSearchForm({ form }: Props) {
  const {
    name,
    setName,
    query,
    setQuery,
    priceFrom,
    setPriceFrom,
    priceTo,
    setPriceTo,
    synonyms,
    setVariantsOpen,
    submit,
    createSearch,
  } = form;

  return (
    <Accordion.Item value="new" borderBottomWidth="1px" borderColor="border.subtle">
      <Accordion.ItemTrigger px={4} py={3} cursor="pointer" _hover={{ bg: 'bg.muted' }}>
        <HStack flex="1" gap={2} fontWeight="semibold">
          <LuPlus />
          <Text>Новий пошук</Text>
        </HStack>
        <Accordion.ItemIndicator />
      </Accordion.ItemTrigger>
      <Accordion.ItemContent>
        <Accordion.ItemBody pt={0}>
          <Stack as="form" onSubmit={submit} gap={3} px={2}>
            <Field.Root required>
              <Field.Label>
                Назва <Field.RequiredIndicator />
              </Field.Label>
              <Input
                size="sm"
                placeholder="напр. iPhone 13 Київ"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field.Root>
            <Field.Root required>
              <Field.Label>
                Запит <Field.RequiredIndicator />
              </Field.Label>
              <Input
                size="sm"
                placeholder="напр. iphone 13"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field.Root>
            <Button
              size="xs"
              variant="outline"
              alignSelf="start"
              disabled={!query.trim()}
              onClick={() => setVariantsOpen(true)}
            >
              <LuLayers /> Варіанти пошуку{synonyms.length > 0 ? ` (${synonyms.length})` : ''}
            </Button>
            <HStack gap={2}>
              <Field.Root>
                <Field.Label>Ціна від</Field.Label>
                <Input
                  size="sm"
                  inputMode="numeric"
                  value={priceFrom}
                  onChange={(e) => setPriceFrom(e.target.value)}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>Ціна до</Field.Label>
                <Input
                  size="sm"
                  inputMode="numeric"
                  value={priceTo}
                  onChange={(e) => setPriceTo(e.target.value)}
                />
              </Field.Root>
            </HStack>
            <Button type="submit" loading={createSearch.isPending} colorPalette="blue" size="sm">
              <LuPlus /> Створити
            </Button>
            {createSearch.isError && (
              <Text textStyle="xs" color="fg.error">
                {createSearch.error instanceof Error
                  ? createSearch.error.message
                  : 'Помилка створення'}
              </Text>
            )}
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}
