"""Repairs visually verified against supplied Cambridge 17–19 source pages."""

def apply_review_fixes(library):
    papers = {p['id']: p for book in library for p in book['passages']}
    sentence_fixes = {
        'c17-t2-p2': {
            24: '24 An undesirable trait such as loss of ______ may be caused by a mutation in a tomato gene.',
            25: '25 By modifying one gene in a tomato plant, researchers made the tomato three times its original ______.',
            26: '26 A type of tomato which was not badly affected by ______, and was rich in vitamin C, was produced by a team of researchers in China.',
        },
        'c17-t3-p2': {
            23: '23 One advantage of palm oil for manufacturers is that it stays ______ even when not refrigerated.',
            24: '24 The ______ is the best known of the animals suffering habitat loss as a result of the spread of oil palm plantations.',
            25: '25 As one of its criteria for the certification of sustainable palm oil, the RSPO insists that growers check ______ on a routine basis.',
            26: '26 Ellwood and his researchers are looking into whether the bird’s nest fern could restore ______ in areas where oil palm trees are grown.',
        },
    }
    for pid, replacements in sentence_fixes.items():
        paper = papers[pid]
        for section in paper['questionText']:
            if section['from'] != min(replacements):
                continue
            section['paragraphs'] = section['paragraphs'][:3] + list(replacements.values())
            if 'intro' in section:
                section['intro'] = section['paragraphs'][:3]
            if 'items' in section:
                for item in section['items']:
                    if item['number'] in replacements:
                        item['paragraphs'] = [replacements[item['number']].split(' ', 1)[1]]
    p = papers['c18-t3-p3']['reading']['paragraphs']
    p[6] = p[6].replace('low tools and different social tools from teachers socioeconomic class', 'low socioeconomic class')
    p[9] = p[9].replace('They operate with different language and,', 'They operate with different language tools and different social tools from teachers and,')
    p = papers['c19-t2-p3']['reading']['paragraphs']
    p[5] = p[5].replace('those at a young age, and their parents all emerged as approaches at home as well as at school.', 'those approaches at home as well as at school.')
    p[6] = p[6].replace('New performing learning approach. She is working Science of Expertise', 'New Science of Expertise')
    p[7] = p[7].replace('when having strong work ethics themselves.', 'when at a young age, and their parents all emerged as having strong work ethics themselves.')
    p[8] = p[8].replace('developed a high on this with a group of schools', 'developed a high performing learning approach. She is working on this with a group of schools')
