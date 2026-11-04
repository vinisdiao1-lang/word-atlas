"""Source-checked option-list repairs for newly exposed full-Passage practice.

Verified against c11-p30.jpg and c13-p45.jpg. Preserve original names and keys.
"""


def apply_review_fixes(library):
    repairs = {
        'c11-t1-p3': ('B Phil Rasch c Dan Lunt', ['B Phil Rasch', 'C Dan Lunt']),
        'c13-t2-p2': ('B Simone Shamay-Tsoory c Jennifer Bartz',
                      ['B Simone Shamay-Tsoory', 'C Jennifer Bartz']),
    }
    for book in library:
        for paper in book['passages']:
            if paper['id'] not in repairs:
                continue
            old, replacement = repairs[paper['id']]
            for section in paper.get('questionText', []):
                section['paragraphs'] = [
                    line
                    for text in section['paragraphs']
                    for line in (replacement if text == old else [text])
                ]
