#!/usr/bin/env python3
"""Перевіряє, що output.json покриває всі id з descriptions/chunk-*.json.

Готовий скрипт ZIP-пакета семантичного фільтра. Лише стандартна бібліотека.
НЕ редагувати — лише запускати: `python verify.py`.
"""
import glob
import json
import os


def expected_ids():
    ids = set()
    for path in sorted(glob.glob(os.path.join("descriptions", "chunk-*.json"))):
        with open(path, encoding="utf-8") as f:
            for it in json.load(f):
                try:
                    ids.add(int(it["id"]))
                except (KeyError, TypeError, ValueError):
                    pass
    return ids


def main():
    expected = expected_ids()
    if not os.path.exists("output.json"):
        print("ПОМИЛКА: немає output.json. Спершу запусти: python merge.py")
        return

    with open("output.json", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("results", data) if isinstance(data, dict) else data

    got, dups, bad = set(), set(), 0
    for it in items:
        if not all(k in it for k in ("id", "relevant", "reason")):
            bad += 1
            continue
        rid = int(it["id"])
        if rid in got:
            dups.add(rid)
        got.add(rid)

    missing = expected - got
    extra = got - expected

    print("=== ПЕРЕВІРКА ===")
    print(f"Очікувано id (з чанків): {len(expected)} · у output.json: {len(got)}")

    ok = True
    if bad:
        print(f"  [X] {bad} записів без id/relevant/reason."); ok = False
    else:
        print("  [OK] Формат коректний.")
    if dups:
        print(f"  [X] Дублікати id: {len(dups)}."); ok = False
    else:
        print("  [OK] Без дублікатів.")
    if missing:
        ok = False
        print(f"  [X] БРАКУЄ {len(missing)} id. Перекласифікуй чанки, де вони є,")
        print("       онови їхні classifications/result-NNN.json і знову: python merge.py")
        print("       Приклади відсутніх id:", sorted(missing)[:10])
    else:
        print("  [OK] Усі id присутні.")
    if extra:
        print(f"  [!] Зайві id (не з чанків): {len(extra)} — їх застосунок проігнорує.")

    if ok:
        print("\nПРОЙДЕНО — встав ВМІСТ output.json у поле застосунку.")
    else:
        print("\nВИПРАВ помилки вище, тоді повтори: python merge.py && python verify.py")


if __name__ == "__main__":
    main()
