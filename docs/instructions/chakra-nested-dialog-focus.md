---
name: chakra-nested-dialog-focus
created: 2026-10-10
source: сесія 2026-10-10 (P-015, діалог «Перейменувати категорію»)
---
# Поля у діалозі поверх іншої модалки (Chakra v3 / Ark)

## Коли застосовувати
Діалог із полем вводу відкривається поверх іншої модалки, і в поле не можна друкувати: кнопки працюють, а
фокус не заходить (`input.focus()` лишає `document.activeElement` на кнопці нижньої модалки).

## Що робити
1. Вкладений діалог — `modal={false}` (інакше Ark `hideOthers` лишає нижню модалку inert — див. коментар у
   `web/src/components/ConfirmActionDialog.tsx`).
2. Рендерити його **всередині DOM нижньої модалки**: `ref` на її `DialogContent`, у вкладений —
   `<DialogContent portalRef={ref}>` (`web/src/components/ui/dialog.tsx`). Тоді фокус-пастка нижньої модалки
   вважає поле своїм.
3. Монтувати вкладений діалог **лише на час показу** (`{open && <Dialog open … />}`): Ark `Portal` читає
   `container` один раз при монтуванні — змонтований заздалегідь (поки ref порожній) лишиться в `body`.

Приклад — `CriteriaManagerDialog` (усередині майстра) і його `MergeCriteriaDialog`/`DeleteCriteriaDialog`.

## Чого не робити
- Лише `modal={false}` без `portalRef` — для діалогу з самими кнопками досить, для полів вводу — ні.
- Перемикати `trapFocus` нижньої модалки на льоту — Ark читає його при відкритті.

## Як перевірити
У консолі браузера: вкладений `[role=dialog]` лежить усередині нижнього (`outer.contains(inner) === true`),
а після `input.focus()` — `document.activeElement === input`. Після закриття поля нижньої модалки теж фокусуються.

## Пов'язане
- [`docs/styles.md`](../styles.md) — UI-конвенції Chakra
