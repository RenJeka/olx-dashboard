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
| [chakra-nested-dialog-focus](chakra-nested-dialog-focus.md) | У діалозі поверх іншої модалки не можна друкувати в поле |
| [tsx-top-level-await-mts](tsx-top-level-await-mts.md) | Пишеш одноразовий tsx-скрипт з top-level `await` |
| [render-env-change-redeploys](render-env-change-redeploys.md) | Змінюєш env сервісу на Render |
| [turso-create-branch-timeout](turso-create-branch-timeout.md) | Turso MCP `create_branch` повернув таймаут |
| [absolute-paths-for-user](absolute-paths-for-user.md) | Даєш людині шлях до файлу в інструкції |
| [prod-scan-monitoring](prod-scan-monitoring.md) | Людина запустила довгий скан на проді, треба стежити, чи доживає і чим закінчився |
| [github-cli](github-cli.md) | Треба відкрити PR, подивитись CI чи логи впалого прогону; перелогінити `gh` |
| [docs-check-untracked-files](docs-check-untracked-files.md) | Пишеш у доках шлях до незакоміченого файлу; `docs:check` зелений локально, червоний у CI |
| [docs-audit](docs-audit.md) | Треба перевірити документацію чи парковку на актуальність і прибрати застаріле (скіл `docs-audit`) |
| [node-e-escaping](node-e-escaping.md) | Правиш файл однорядковим node -e, а в новому коді є бектики чи перенос рядка в літералах |
| [curl-cyrillic-body](curl-cyrillic-body.md) | Smoke API через curl у Git Bash із кирилицею в тілі дає 400 Content-Length |
| [scripted-edit-assert](scripted-edit-assert.md) | Правиш файли скриптом (Python `replace`, `sed` за номерами рядків) |
| [local-dev-port-busy](local-dev-port-busy.md) | Локальний сервер не стартує (`EADDRINUSE :3001` чи `SQLITE_BUSY`) або логів smoke-запитів не видно |
| [npm-lockfile-peer-flags](npm-lockfile-peer-flags.md) | Після `npm install` змінився `package-lock.json`, хоча залежності не чіпали |
| [jev-agent-setup](jev-agent-setup.md) | Треба підключити чи перевірити Jev MCP і скіли jevai.org для агента |
| [jev-pilot](jev-pilot.md) | Треба порівняти Jev з LLM на пошуку, подивитись сирий вхід/вихід кроку 2 (`jev:probe`) чи підібрати поріг (скіл `jev-pilot`) |
| [prod-data-via-turso-mcp](prod-data-via-turso-mcp.md) | Агенту потрібні рядки з прод-БД у файл; читання ключів заблоковано |
| [render-mcp-no-env](render-mcp-no-env.md) | Треба знати env чи rewrite сервісів Render або звірити `render.yaml` з продом |
