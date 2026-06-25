# План: збагачення рядка пошуку в сайдбарі + редагування

## Контекст
Рядок пошуку (`SearchRow` у `web/src/components/Searches.tsx`) показував лише назву +
`query`. Додано: діапазон цін під назвою, бейдж синонімів і редагування пошуку.

## Рішення
- **Діапазон цін під назвою** — з `search.api_filters` (`{ ranges: { price: {from,to} } }`),
  приглушений яскравий помаранчевий (`orange.500`).
- **Бейдж синонімів** — кружечок `+N` біля назви з тултіпом-переліком (`query_synonyms`).
- **Редагування** — пункт меню «Редагувати» → діалог (назва, запит, ціна, синоніми);
  PATCH `/api/searches/:id` (бекенд не змінювався).

## Файли
- [x] `web/src/utils/format.ts` — `parsePriceRange(api_filters)` + `formatPriceRange(from,to)`.
- [x] `web/src/api/client.ts` — `useUpdateSearch()` (PATCH name/query/api_filters/query_synonyms).
- [x] `web/src/components/SearchEditDialog.tsx` — НОВИЙ контрольований діалог (дзеркало форми
      «Новий пошук» + вкладений `SearchVariantsDialog`), зберігає api_filters з іншими ключами.
- [x] `web/src/components/Searches.tsx` — `SearchRow`: ціна під назвою, бейдж синонімів з
      тултіпом (`sortAlpha`), пункт меню «Редагувати» (`LuPencil`) + рендер `SearchEditDialog`.

## Test-cases
- [x] Пошук з ціною → під назвою помаранчевий «від/до/діапазон грн».
- [x] Пошук із синонімами → бейдж `+N`, тултіп зі списком.
- [x] «Редагувати» → зміна назви/ціни/синонімів → «Зберегти» → список оновлюється.
- [x] api_filters без price (інші ключі) зберігаються при редагуванні.
