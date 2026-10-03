---
name: prod-scan-monitoring
created: 2026-10-03
source: перевірка S9 на проді 2026-10-02…03 (docs/plans/old/scan-keepalive.md)
---
# Моніторинг довгого скану на проді (лише читання)

## Коли застосовувати
Людина запустила глибокий скан у UI на проді, а агент стежить, чи він доживає і чим закінчився.

## Що робити
1. Запуск — людина в UI (API за Google-OAuth, у агента сесії немає); дозвіл — `docs/rules.md` → «Прод».
2. Прогрес — Turso MCP `read_database`, один рядок:
   `SELECT finished_at, requests_done, requests_total, sub_done, stage, error, warning, strftime('%H:%M:%S','now') AS db_now FROM scan_runs WHERE id = <id>`.
   `db_now` показує, коли запит реально виконався.
3. Пауза між перевірками — окремим викликом (`sleep` у Bash), а запит до БД — **наступним** повідомленням.
4. Render MCP (параметр `workspaceId` обов'язковий — id з `list_workspaces`):
   - `list_logs`, `type: app` (request-логи на free-тарифі порожні): `text: ["*scan-status*"]` — коли браузер
     востаннє опитував; `text: ["*/health*127.0.0.1*"]` — самопінг через публічну адресу (раз на 5 хв);
   - `get_metrics` `memory_usage` — пам'ять (ліміт інстансу — `memory_limit`);
   - `list_events` — OOM, `server_failed`, рестарти, деплої.
5. Діагноз зупинки: прогрес стоїть + логи інстансу обриваються + подій немає → засинання (див.
   `business-rules.md` → «Довгий скан на free-тарифі Render»); є `server_failed` → читати причину з події.

## Чого не робити
- Не ставити очікування й запит до БД в один блок паралельних викликів: вони виконаються одночасно, і
  «через 5 хв» прийдуть дані з початку паузи (хибна тривога «скан стоїть»).
- Не опитувати Turso частіше, ніж раз на кілька хвилин, і не читати `listings` повністю — квота
  (`AGENTS.md` → «Turso-економія»); `COUNT(*)` по одному `search_id` — допустимо зрідка.

## Як перевірити
У `scan_runs` для скану є `finished_at`; `error` порожній (або зрозумілий), `warning` — очікуваний.

## Пов'язане
[render-env-change-redeploys](render-env-change-redeploys.md), [secrets-in-sources](secrets-in-sources.md).
