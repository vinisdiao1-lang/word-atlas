"""Visually verified source repairs for Cambridge 11–13.

Reading paragraph indexes are preserved. This function only changes structured
reading/question content; the caller owns regeneration of shared derivatives.
See docs/audits/cambridge-11-13-source-fixes.json for page-level evidence.
"""

import re


def _map_strings(value, transform):
    if isinstance(value, str):
        return transform(value)
    if isinstance(value, list):
        return [_map_strings(item, transform) for item in value]
    if isinstance(value, dict):
        return {key: _map_strings(item, transform) for key, item in value.items()}
    return value


def _set_section(section, paragraphs, intro, stems=None):
    """Keep already materialised intro/items in step with full section text."""
    section["paragraphs"] = paragraphs
    if "intro" in section:
        section["intro"] = intro
    if stems and "items" in section:
        for item in section["items"]:
            number = item.get("number")
            if number in stems:
                item["paragraphs"] = [stems[number]]


def apply_review_fixes(library):
    """Apply confirmed transcription corrections in place, idempotently."""
    for book in library:
        for paper in book.get("passages", []):
            pid = paper.get("id")
            reading = paper.get("reading", {})
            if pid == "c11-t2-p1":
                reading["paragraphs"] = [
                    text.replace("the operation was NOT GIVEN the go-ahead _until",
                                 "the operation was not given the go-ahead until")
                    for text in reading.get("paragraphs", [])
                ]
            elif pid == "c11-t3-p1":
                reading["paragraphs"] = [
                    text.replace("in 660 AD, concealed inside hollow bamboo walking canes",
                                 "in 550 AD, concealed inside hollow bamboo walking canes")
                    for text in reading.get("paragraphs", [])
                ]
            elif pid == "c12-t1-p3":
                title = "What's the purpose of gaining knowledge?"
                paper["title"] = title
                reading["title"] = title
                # Its existing title-like paragraph remains paragraph 1: evidence
                # indexes in the explanations must not shift when fixing title.

            for section in paper.get("questionText", []):
                start = section.get("from")
                if pid == "c11-t1-p2" and start == 20:
                    intro = [
                        "Label the diagram below.",
                        "Choose ONE WORD from the passage for each answer.",
                        "Write your answers in boxes 20-26 on your answer sheet.",
                        "How a boat is lifted on the Falkirk Wheel",
                    ]
                    stems = {
                        20: "A pair of ______ are lifted in order to shut out water from canal basin",
                        21: "A ______ is taken out, enabling Wheel to rotate",
                        22: "Hydraulic motors drive ______",
                        23: "A range of different-sized ______ ensures boat keeps upright",
                        24: "Boat reaches top Wheel, then moves directly onto ______",
                        25: "Boat travels through tunnel beneath Roman ______",
                        26: "______ raise boat 11 m to level of Union Canal",
                    }
                    full_labels = [
                        "A pair of 20 ______ are lifted in order to shut out water from canal basin",
                        "A 21 ______ is taken out, enabling Wheel to rotate",
                        "Hydraulic motors drive 22 ______",
                        "A range of different-sized 23 ______ ensures boat keeps upright",
                        "Boat reaches top Wheel, then moves directly onto 24 ______",
                        "Boat travels through tunnel beneath Roman 25 ______",
                        "26 ______ raise boat 11 m to level of Union Canal",
                    ]
                    fixed_label = "Boat is raised, floating in one of Wheel's two gondolas"
                    _set_section(section, intro + full_labels + [fixed_label],
                                 intro + [fixed_label], stems)
                elif pid == "c11-t2-p2" and start == 21:
                    section.update(_map_strings(section, lambda text: text.replace(
                        "of24", "of 24 ______")))
                elif pid == "c11-t2-p1" and start == 5:
                    intro = [
                        "Look at the following statements (Questions 5-8) and the list of dates below.",
                        "Match each statement with the correct date, A-G.",
                        "Write the correct letter, A-G, in boxes 5-8 on your answer sheet.",
                    ]
                    stems = {
                        5: "A search for the Mary Rose was launched.",
                        6: "One person's exploration of the Mary Rose site stopped.",
                        7: "It was agreed that the hull of the Mary Rose should be raised.",
                        8: "The site of the Mary Rose was found by chance.",
                    }
                    dates = ["List of Dates", "A 1836", "B 1840", "C 1965",
                             "D 1967", "E 1971", "F 1979", "G 1982"]
                    _set_section(section,
                                 intro + [f"{n} {stem}" for n, stem in stems.items()] + dates,
                                 intro + dates, stems)
                elif pid == "c11-t4-p1" and start == 5:
                    section.update(_map_strings(section, lambda text: text.replace(
                        "A Francis Gaitan", "A Francis Galton")))
                elif pid == "c11-t4-p2" and start == 19:
                    section.update(_map_strings(section, lambda text: text.replace(
                        "In boxes 1,23 on your answer sheet, write",
                        "In boxes 19-23 on your answer sheet, write")))
                elif pid == "c12-t3-p1" and start == 1:
                    section.update(_map_strings(section, lambda text: text.replace(
                        "i-viil in boxes", "i-viii, in boxes")))
                elif pid == "c12-t4-p1" and start == 9:
                    # The scan itself omits a leading question sentence. Do not
                    # invent one; remove only the OCR-duplicated TRUE definition.
                    true_rule = "TRUE if the statement agrees with the information"
                    for key in ("paragraphs", "intro"):
                        if key in section:
                            seen_true = False
                            cleaned = []
                            for text in section[key]:
                                if text == true_rule:
                                    if seen_true:
                                        continue
                                    seen_true = True
                                cleaned.append(text)
                            section[key] = cleaned
                elif pid == "c13-t1-p2" and start == 20:
                    def restore_ideas(text):
                        if "One sort of boredom is worse" in text:
                            return "B One sort of boredom is worse than all the others."
                        if re.match(r"^C Levels of boredom may", text):
                            return "C Levels of boredom may fall in the future."
                        return text.replace("Lis;t of Ideas", "List of Ideas")
                    section.update(_map_strings(section, restore_ideas))
