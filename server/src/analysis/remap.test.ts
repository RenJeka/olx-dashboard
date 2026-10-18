import { describe, expect, it } from 'vitest';
import type { CriterionGroup } from '../types.js';
import { remapOwnGroups } from './remap.js';

// Власні пункти пошуку після remap базового пункту категорії (docs/plans/base-criteria.md, L6).

const group = (name: string, aliases: string[] = [], enabled = true): CriterionGroup => ({ name, aliases, enabled });

describe('remapOwnGroups', () => {
  it('пункт з назвою зі step.keys зливається в нову назву разом із синонімами', () => {
    const next = remapOwnGroups([group('не вмикається', ['мертвий'], false)], [
      { keys: new Set(['не вмикається']), to: 'не вмикається або мертвий' },
    ]);
    expect(next).toEqual([group('не вмикається або мертвий', ['не вмикається', 'мертвий'], false)]);
  });

  it('збіг лише синоніма: перейменовується тільки синонім, пункт і решта синонімів лишаються', () => {
    const own = [group('не працює', ['на запчастини', 'не вмикається', 'потрібен донор']), group('подряпини')];
    const next = remapOwnGroups(own, [{ keys: new Set(['не вмикається']), to: 'не вмикається або мертвий' }]);
    expect(next).toEqual([
      group('не працює', ['на запчастини', 'не вмикається або мертвий', 'потрібен донор']),
      group('подряпини'),
    ]);
  });

  it('синонім, що збігається з назвою іншого власного пункту після перейменування, не дублюється', () => {
    const own = [group('не працює', ['не вмикається']), group('не вмикається або мертвий')];
    const next = remapOwnGroups(own, [{ keys: new Set(['не вмикається']), to: 'не вмикається або мертвий' }]);
    expect(next).toEqual([group('не працює'), group('не вмикається або мертвий')]);
  });

  it('видалення (to = null) і пункти без збігів — той самий масив', () => {
    const own = [group('не працює', ['не вмикається'])];
    expect(remapOwnGroups(own, [{ keys: new Set(['не вмикається']), to: null }])).toBe(own);
    expect(remapOwnGroups(own, [{ keys: new Set(['інше']), to: 'щось' }])).toBe(own);
  });
});
