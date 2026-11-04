"""Source-checked transcription repairs from the Cambridge 14–16 audit.

All changes are idempotent and keep reading paragraph indexes intact. The
original page images supporting them are recorded in
docs/audits/cambridge-14-16-source-fixes.json.
"""

import re


def _map_question_strings(value, transform):
    """Update paragraphs and any derived intro/items copies consistently."""
    if isinstance(value, str):
        return transform(value)
    if isinstance(value, list):
        return [_map_question_strings(item, transform) for item in value]
    if isinstance(value, dict):
        return {
            key: _map_question_strings(item, transform)
            for key, item in value.items()
        }
    return value


def _restore_question_35(text):
    return re.sub(
        r"(Numerous training sessions are aimed at people who feel they are not)"
        r"\s+(?:[._…·]+\s*)?enough\.",
        r"\1 ______ enough.",
        text,
    )


def _restore_question_21(text):
    return re.sub(
        r"(Studies by Ziming Liu show that students are tending to )"
        r"(?:\.ead|read)\s+(?:21\s*)?[._…·]+\s*words and phrases",
        r"\1read 21 ______ words and phrases",
        text,
    )


def apply_review_fixes(library):
    """Repair the three visually verified source defects, in place.

    `library` is the list of book packs used by the published Cambridge library.
    There is no insertion, deletion, splitting or reordering of paragraphs.
    """
    for book in library:
        for paper in book.get("passages", []):
            pid = paper.get("id")
            if pid == "c14-t3-p2":
                reading = paper.get("reading")
                if reading:
                    reading["paragraphs"] = [
                        "I " + paragraph
                        if paragraph.startswith(
                            "With every bit of wilderness that disappears,"
                        )
                        else paragraph
                        for paragraph in reading.get("paragraphs", [])
                    ]
            transform = {
                "c14-t2-p3": _restore_question_35,
                "c16-t4-p2": _restore_question_21,
            }.get(pid)
            if transform and paper.get("questionText"):
                paper["questionText"] = _map_question_strings(
                    paper["questionText"], transform
                )
