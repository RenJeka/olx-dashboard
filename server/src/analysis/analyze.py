#!/usr/bin/env python3
"""Детермінований движок пошуку критеріїв у описах оголошень OLX.

Цей файл — ГОТОВИЙ движок. НЕ переписуй його логіку. Твоє єдине завдання як агента —
згенерувати поруч файл ``patterns.json`` з мапою «критерій -> regex» (див. prompt.txt),
після чого запустити цей скрипт. Результат — ``output.json`` поруч зі скриптом.

Робота:
  - читає ``patterns.json`` (мапа критеріїв) і всі ``descriptions/chunk-*.json`` (вхідні дані);
  - для кожного оголошення шукає критерії в (title + description), відкидає заперечені
    в межах клаузи збіги, дістає дослівний фрагмент-доказ з опису;
  - пише ``output.json`` у форматі [{"id", "items":[{"criterion","evidence"}]}].

Залежності: лише стандартна бібліотека (опційно ``orjson`` для пришвидшення — з fallback).
БЕЗ виводу в консоль: скрипт нічого не друкує, лише створює JSON-файл.
"""

import glob
import re
from pathlib import Path

# ── Швидка (де)серіалізація JSON: orjson, якщо є, інакше stdlib ────────────────
_BOM = b"\xef\xbb\xbf"


def _strip_bom(raw: bytes) -> bytes:
    return raw[len(_BOM):] if raw.startswith(_BOM) else raw


try:
    import orjson

    def _load_bytes(raw: bytes):
        return orjson.loads(_strip_bom(raw))

    def _dumps_bytes(obj) -> bytes:
        # orjson вже без ASCII-екранування, компактний за замовчуванням.
        return orjson.dumps(obj)
except ImportError:  # pragma: no cover - залежить від оточення
    import json

    def _load_bytes(raw: bytes):
        return json.loads(_strip_bom(raw).decode("utf-8"))

    def _dumps_bytes(obj) -> bytes:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


BASE_DIR = Path(__file__).resolve().parent
PATTERNS_PATH = BASE_DIR / "patterns.json"
DESCRIPTIONS_DIR = BASE_DIR / "descriptions"
OUTPUT_PATH = BASE_DIR / "output.json"

# ── Заперечення (стеми) ────────────────────────────────────────────────────────
# Шукаються лише в межах поточної клаузи безпосередньо ПЕРЕД збігом критерію, тож
# всюдисуще «не» не спростовує критерій з іншої частини речення.
NEGATION_STEMS = [
    r"без",
    r"безо",
    r"не",
    r"ні",
    r"нема",
    r"немає",
    r"відсутн\w*",
    r"отсутств\w*",
    r"нет",
    r"ідеальн\w*",
    r"идеальн\w*",
    r"ідеал",
    r"идеал",
]
NEGATION_RE = re.compile(
    r"\b(?:" + "|".join(NEGATION_STEMS) + r")\b", re.IGNORECASE | re.UNICODE
)

# Розділювачі клауз: за ними обриваємо лівий контекст, шукаючи заперечення.
CLAUSE_SEP_RE = re.compile(r"[,.;:!?\n\r]")

# Скільки символів лівого контексту аналізувати на заперечення.
NEGATION_LOOKBEHIND = 40
# Піврозмір вікна доказу (символів ліворуч/праворуч від збігу).
EVIDENCE_HALF_WINDOW = 60


def compile_patterns() -> dict:
    """patterns.json -> {criterion: compiled_regex}. Інлайн (?i) у патернах не потрібен."""
    raw = PATTERNS_PATH.read_bytes()
    mapping = _load_bytes(raw)
    compiled = {}
    for criterion, pattern in mapping.items():
        if not isinstance(criterion, str) or not isinstance(pattern, str) or not pattern:
            continue
        try:
            compiled[criterion] = re.compile(pattern, re.IGNORECASE | re.UNICODE)
        except re.error:
            # Некоректний патерн пропускаємо, щоб не валити весь прогін.
            continue
    return compiled


def is_negated(text: str, match_start: int) -> bool:
    """Чи є заперечення у клаузі безпосередньо перед збігом (match_start у text)."""
    left = text[max(0, match_start - NEGATION_LOOKBEHIND):match_start]
    # Лишаємо тільки хвіст поточної клаузи (після останнього розділювача).
    sep = None
    for sep in CLAUSE_SEP_RE.finditer(left):
        pass
    if sep is not None:
        left = left[sep.end():]
    return NEGATION_RE.search(left) is not None


def collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def build_evidence(text: str, match: "re.Match") -> str:
    """Дослівний фрагмент-доказ навколо ТОГО САМОГО (не-запереченого) збігу `match`.

    Будується з `text` = title + опис; застосунок верифікує evidence як підрядок
    title+опису, тож фрагмент завжди підтверджується.
    """
    start = max(0, match.start() - EVIDENCE_HALF_WINDOW)
    end = min(len(text), match.end() + EVIDENCE_HALF_WINDOW)
    # Снап до меж слів, щоб не різати посеред слова.
    if start > 0:
        ws = text.find(" ", start)
        if ws != -1 and ws < match.start():
            start = ws + 1
    if end < len(text):
        ws = text.rfind(" ", match.end(), end)
        if ws != -1:
            end = ws
    return collapse_ws(text[start:end])


def analyze_listing(item: dict, compiled: dict) -> dict:
    title = (item.get("title") or "").strip()
    description = (item.get("description") or "").strip()
    full_text = title + "\n" + description

    items = []
    seen = set()
    for criterion, regex in compiled.items():
        if criterion in seen:
            continue
        match = None
        for m in regex.finditer(full_text):
            if is_negated(full_text, m.start()):
                continue
            match = m
            break
        if match is None:
            continue
        evidence = build_evidence(full_text, match)
        items.append({"criterion": criterion, "evidence": evidence})
        seen.add(criterion)

    return {"id": item.get("id"), "items": items}


def load_listings() -> list:
    listings = []
    files = sorted(glob.glob(str(DESCRIPTIONS_DIR / "chunk-*.json")))
    for path in files:
        data = _load_bytes(Path(path).read_bytes())
        if isinstance(data, list):
            listings.extend(data)
    return listings


def main() -> None:
    compiled = compile_patterns()
    listings = load_listings()

    results = []
    for item in listings:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        analyzed = analyze_listing(item, compiled)
        # Лише оголошення з хоча б одним знайденим критерієм.
        if analyzed["items"]:
            results.append(analyzed)

    OUTPUT_PATH.write_bytes(_dumps_bytes(results))


if __name__ == "__main__":
    main()
