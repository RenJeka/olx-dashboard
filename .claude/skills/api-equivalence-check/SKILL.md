---
name: api-equivalence-check
description: "Звірка GET-відповідей API olx-dashboard до і після рефакторингу на локальній копії проду: два знімки (поточний код і stash), порівняння байт-у-байт, 0 розбіжностей. Викликай, коли змінюєш серверний код «без зміни поведінки» («перевір, що відповіді не змінились», «звір API до/після», перед комітом фаз рефакторингу)."
---

<!-- Згенеровано scripts/sync-skills.mjs з skills/api-equivalence-check/SKILL.md — не редагувати вручну; правити джерело й запустити npm run skills:sync. -->

# api-equivalence-check — обгортка

Повні інструкції цього скіла лежать в єдиному джерелі: `skills/api-equivalence-check/SKILL.md` (шлях від кореня
репозиторію; від цього файлу — `../../../skills/api-equivalence-check/SKILL.md`).

1. Перш ніж діяти, прочитай `skills/api-equivalence-check/SKILL.md` повністю і виконуй його як інструкції цього скіла.
2. Допоміжні файли (напр. `references/`) лежать поруч із ним у `skills/api-equivalence-check/` — відносні
   шляхи з канонічного SKILL.md рахуй від цієї теки.
