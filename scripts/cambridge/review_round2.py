"""Second review: source-checked Cambridge 13 transcription repairs.

Verified against c13-p17.jpg and c13-p18.jpg; paragraph indexes stay intact.
"""
import re


def repair_tourism_text(text):
    text = text.replace(
        'strongest national brands in the world. potential visitors',
        'strongest national brands in the world. A key feature of the campaign was the website www.newzealand.com, which provided potential visitors',
    )
    text = re.sub(r'independent trave\\+ers dev\\+se thek own',
                  'independent travellers devise their own', text)
    for old, new in [
        ("'bookmark; places", "'bookmark' places"),
        ('travel packages.to suit', 'travel packages to suit'),
        ('enjoy such. learning experiences', 'enjoy such learning experiences'),
        ('stay for longer .(average', 'stay for longer (average'),
    ]:
        text = text.replace(old, new)
    return text


def apply_review_fixes(library):
    for book in library:
        for paper in book['passages']:
            if paper['id'] == 'c13-t1-p1':
                paper['reading']['paragraphs'] = [
                    repair_tourism_text(text)
                    for text in paper['reading']['paragraphs']
                ]
