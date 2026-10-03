# Інструкції

По файлу на кожну пастку чи патерн. Формат — [шаблон](../templates/instruction.md). Новий файл
створює скіл `instruction-add` і додає рядок у таблицю нижче. Доменна механіка (скани, статуси, OLX,
AI) сюди не дублюється — вона в документах із карти `AGENTS.md`.

| Файл | Коли читати |
| --- | --- |
| [agents-md-loading](agents-md-loading.md) | Агент не бачить правил репозиторію або налаштовується харнес |
| [secrets-in-sources](secrets-in-sources.md) | Бачиш токен чи ключ у тексті, файлі, виводі; готуєш хендоф чи коміт |
| [git-checkout-discards-changes](git-checkout-discards-changes.md) | Хочеш відкотити тестову зміну у файлі з іншими незакоміченими правками |
| [pipe-hides-exit-code](pipe-hides-exit-code.md) | Запускаєш перевірку й обрізаєш вивід пайпом |
| [crlf-line-endings](crlf-line-endings.md) | Точна заміна не знаходить рядок або `sed -i` змінив увесь файл |
| [tsx-top-level-await-mts](tsx-top-level-await-mts.md) | Пишеш одноразовий tsx-скрипт з top-level `await` |
| [render-env-change-redeploys](render-env-change-redeploys.md) | Змінюєш env сервісу на Render |
| [turso-create-branch-timeout](turso-create-branch-timeout.md) | Turso MCP `create_branch` повернув таймаут |
| [absolute-paths-for-user](absolute-paths-for-user.md) | Даєш людині шлях до файлу в інструкції |
| [prod-scan-monitoring](prod-scan-monitoring.md) | Людина запустила довгий скан на проді, треба стежити, чи доживає і чим закінчився |
| [github-cli](github-cli.md) | Треба відкрити PR, подивитись CI чи логи впалого прогону; перелогінити `gh` |
| [docs-check-untracked-files](docs-check-untracked-files.md) | Пишеш у доках шлях до незакоміченого файлу; `docs:check` зелений локально, червоний у CI |
| [docs-audit](docs-audit.md) | Треба перевірити документацію чи парковку на актуальність і прибрати застаріле (скіл `docs-audit`) |
