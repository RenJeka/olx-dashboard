---
name: wmux-browser-hidden-pane
created: 2026-10-12
source: сесія 2026-10-12 (перевірка «Згрупувати автоматично» після зміни промпту)
---
# Браузер wmux не віддає кадри: панель у прихованому workspace

## Коли застосовувати
`browser_screenshot` відповідає «the guest is not producing frames (its pane is likely in a hidden workspace)»,
`browser_click` відмовляє «is not the element at (-28, …)» — людина перемкнулась на інший workspace wmux.

## Що робити
- Не повторювати кліки: перевірити той самий роут напряму через локальний API — `node -e "fetch(…)"` на
  `http://localhost:3001/api/…` (кирилиця в тілі — не curl, [curl-cyrillic-body](curl-cyrillic-body.md)); кнопка UI
  викликає саме його.
- Перевірку саме UI — відкласти й сказати людині, що її не пройдено (або попросити повернути workspace на передній план).

## Чого не робити
- Не ганяти кліки й скріншоти по колу: стан сторінки не змінюється, а вікна застосунку (бічна панель) зʼїжджають за
  край екрана.

## Як перевірити
Відповідь API з очікуваним вмістом; у підсумку людині прямо названо, що UI не перевірено.

## Пов'язане
- [wmux-browser-ark-menu](wmux-browser-ark-menu.md), [manual-test-cases](manual-test-cases.md)
