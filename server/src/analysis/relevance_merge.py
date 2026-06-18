#!/usr/bin/env python3
"""Об'єднує classifications/result-*.json у єдиний output.json.

Готовий скрипт ZIP-пакета семантичного фільтра (як analyze.py для плюсів/мінусів).
Лише стандартна бібліотека. НЕ редагувати — лише запускати: `python merge.py`.
"""
import glob
import json
import os


def main():
    files = sorted(glob.glob(os.path.join("classifications", "result-*.json")))
    if not files:
        print("ПОМИЛКА: немає classifications/result-*.json.")
        print("Спершу класифікуй чанки (КРОК 1) і запиши result-NNN.json для кожного.")
        return

    by_id = {}
    for path in files:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:  # noqa: BLE001
            print(f"ПОМИЛКА читання {path}: {e}")
            continue
        items = data.get("results", data) if isinstance(data, dict) else data
        for it in items:
            try:
                rid = int(it["id"])
            except (KeyError, TypeError, ValueError):
                continue
            by_id[rid] = {
                "id": rid,
                "relevant": bool(it.get("relevant")),
                "reason": str(it.get("reason", "")),
            }

    with open("output.json", "w", encoding="utf-8") as f:
        json.dump({"results": list(by_id.values())}, f, ensure_ascii=False, indent=2)

    print(f"Готово: output.json — {len(by_id)} оголошень із {len(files)} файлів.")
    print("Тепер запусти перевірку: python verify.py")


if __name__ == "__main__":
    main()
