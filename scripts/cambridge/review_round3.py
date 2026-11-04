"""Third audit source repairs, checked against original page images.

c11-p29, c12-p22/p48, c13-p19/p48/p49. Reading paragraph indexes stay intact.
"""


TABLES = {
    ('c11-t1-p3', 30): [
        'GEO-ENGINEERING PROJECTS', 'Procedure — Aim',
        'put a large number of tiny spacecraft into orbit far above Earth — to create a 30 ............ that would reduce the amount of light reaching Earth',
        'place 31 ............ in the sea — to encourage 32 ............ to form',
        'release aerosol sprays into the stratosphere — to create 33 ............ that would reduce the amount of light reaching Earth',
        'fix strong 34 ............ to Greenland ice sheets — to prevent icebergs moving into the sea',
        'plant trees in Russian Arctic that would lose their leaves in winter — to allow the 35 ............ to reflect radiation',
        'change the direction of 36 ............ — to bring more cold water into ice-forming areas',
    ],
    ('c12-t2-p3', 27): [
        'Test — Findings',
        'Test: Observing the 27 ............ of Russian-English bilingual people when asked to select certain objects',
        'Findings: Bilingual people engage both languages simultaneously: a mechanism known as 28 ............',
        'Test: A test called the 29 ............, focusing on naming colours',
        'Findings: Bilingual people are more able to handle tasks involving a skill called 30 ............',
        'Test: A test involving switching between tasks',
        'Findings: When changing strategies, bilingual people have superior 31 ............',
    ],
    ('c13-t1-p1', 1): [
        'Section of website — Comments', 'Database of tourism services',
        '• easy for tourism-related businesses to get on the list',
        '• allowed businesses to 1 ............ information regularly',
        '• provided a country-wide evaluation of businesses, including their impact on the 2 ............',
        'Special features on local topics',
        '• e.g. an interview with a former sports 3 ............, and an interactive tour of various locations used in 4 ............',
        'Information on driving routes', '• varied depending on the 5 ............',
        'Travel Planner', '• included a map showing selected places, details of public transport and local 6 ............',
        "'Your Words'", '• travellers could send a link to their 7 ............',
    ],
}


def fix_graphics(value):
    if isinstance(value, str):
        return value.replace('30 graphics', '3D graphics').replace('letter, A, 8, C', 'letter, A, B, C')
    if isinstance(value, list):
        return [fix_graphics(x) for x in value]
    if isinstance(value, dict):
        return {k: fix_graphics(v) for k, v in value.items()}
    return value


def apply_review_fixes(library):
    for book in library:
        for paper in book['passages']:
            for section in paper.get('questionText', []):
                table = TABLES.get((paper['id'], section['from']))
                if table:
                    section['paragraphs'] = section['paragraphs'][:3] + table
                if paper['id'] == 'c12-t1-p2':
                    section['paragraphs'] = [
                        '21 ............ tends to be mostly a male hobby.'
                        if text == '21 tends to be mostly a male hobby.' else text
                        for text in section['paragraphs']
                    ]
            if paper['id'] == 'c13-t2-p3':
                paper['reading'] = fix_graphics(paper['reading'])
                paper['questionText'] = fix_graphics(paper['questionText'])
