"""Turn local OCR geometry into reflowable reading and question text.

Run after ocr.swift has produced reading-ocr11..17 / ocr16,18,19 caches.
No model-generated passage or question content is introduced.
"""
from pathlib import Path
import json
import re
import statistics
import pymupdf as fitz
import difflib

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.local/cambridge'
LIBRARY = ROOT / 'public/cambridge/v1/library.json'
library = json.loads(LIBRARY.read_text())
READING_HEADER = r'R\s*E\s*A\s*D\s*I\s*N\s*G\s+P\s*A\s*S\s*S\s*A\s*G\s*E\s*[123]\s*$'


def clean(s):
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', s)
    s = s.replace('\u00ad', '').replace('ﬁ', 'fi').replace('ﬂ', 'fl')
    s = re.sub(r'(?i)\bNO\s*T\s+GIVEN\b', 'NOT GIVEN', s)
    for wrong, right in {'ofthe': 'of the', 'ofa': 'of a', 'inthe': 'in the', 'itis': 'it is', 'Itis': 'It is', 'o fthe': 'of the', 'o f': 'of', 'withmammoths': 'with mammoths', 'Repopulatingthe': 'Repopulating the'}.items():
        s = re.sub(r'\b' + re.escape(wrong) + r'\b', right, s)
    s = re.sub(r'^[·.\s]{10,}|[·.\s]{20,}$', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def keep(line):
    s = clean(line['text'])
    if not s or re.fullmatch(r'(?:Test\s*\d+|Reading|READING)', s, re.I):
        return False
    if re.search(r'irLanguage|cambridge_library|www\.|z-lib|telegram|@', s, re.I):
        return False
    if re.fullmatch(r'[\d\W]+', s) and (line['y'] > .90 or line['y'] < .06):
        return False
    if re.match(r'^[→➜•\sOIlD\d|]*\s*[pр]\.\s*\d+[\s\W\d]*$', s):
        return False
    if s == 'eripcelirier':
        return False
    return True


def rows(lines):
    result = []
    for line in sorted(lines, key=lambda x: x['y'] + x['h'] / 2):
        center = line['y'] + line['h'] / 2
        row = next((r for r in result[-3:] if abs(r['center'] - center) < .006), None)
        if row is None:
            result.append({'center': center, 'parts': [line]})
        else:
            row['parts'].append(line)
    out = []
    for row in result:
        parts = sorted(row['parts'], key=lambda x: x['x'])
        out.append({
            'text': clean(' '.join(p['text'] for p in parts)),
            'y': min(p['y'] for p in parts),
            'bottom': max(p['y'] + p['h'] for p in parts),
            'x': min(p['x'] for p in parts),
            'h': max(p['h'] for p in parts),
        })
    return out


def column_chunks(lines):
    # A large repeated gutter separates newspaper columns. Ignore wide titles.
    left = [l for l in lines if l['x'] < .40 and l['w'] < .52 and len(l['text']) > 18]
    right = [l for l in lines if l['x'] > .45 and l['w'] < .52 and len(l['text']) > 18]
    narrow = [l for l in lines if l['w'] < .52]
    if len(left) >= 7 and len(right) >= 7 and len(narrow) / max(1, len(lines)) > .8:
        cut = (max(l['x'] for l in left) + min(l['x'] for l in right)) / 2
        top = min(min(l['y'] for l in left), min(l['y'] for l in right))
        prefix = [l for l in lines if l['y'] < top - .005]
        rest = [l for l in lines if l not in prefix]
        return [prefix, [l for l in rest if l['x'] < cut], [l for l in rest if l['x'] >= cut]]
    return [lines]


def paragraphs(lines, question=False):
    rs = rows(lines)
    if not rs:
        return []
    height = statistics.median(r['h'] for r in rs)
    out, current = [], ''
    for i, row in enumerate(rs):
        s = row['text']
        prev = rs[i - 1] if i else None
        gap = row['y'] - prev['bottom'] if prev else 1
        numbered = bool(re.match(r'^(?:\d{1,2}|[A-Z]|[ivx]{1,4})\s+\S', s))
        label = bool(re.fullmatch(r'[A-Z]', s))
        split = prev is None or gap > height * (.25 if question else .50) or label
        if question:
            split = split or numbered or bool(re.match(r'^(?:Choose|Write|In boxes|TRUE|FALSE|YES|NO|NOT GIVEN|List of|Questions?\b|•)', s))
        else:
            split = split or bool(re.match(r'^[A-H]\s+[A-Z]', s))
            if i == 1 and len(rs[0]['text']) < 130 and rs[0]['h'] > height * 1.15:
                split = True
        if split and current:
            out.append(current)
            current = ''
        if current.endswith('-') and s[:1].islower():
            current += s
        else:
            current = (current + ' ' + s).strip()
    if current:
        out.append(current)
    return out


def strip_intro(lines):
    headings = [l for l in lines if re.match(READING_HEADER, l['text'], re.I)]
    if headings:
        lines = [l for l in lines if l['y'] >= headings[0]['y']]
        intro = [l for l in lines if re.match(r'You should spend|Passage\s*\d\s*(?:below|on|\.)', l['text'], re.I)]
        if intro:
            end = max(l['y'] + l['h'] for l in intro)
            lines = [l for l in lines if l['y'] >= end - .003]
    out, skip = [], False
    for l in sorted(lines, key=lambda x: x['y']):
        s = clean(l['text'])
        if re.match(READING_HEADER, s, re.I):
            continue
        if re.match(r'You should spend', s, re.I):
            skip = not bool(re.search(r'(?:below|pages?\s+\d|Passage\s*\d)\.?$', s))
            continue
        if skip:
            if re.match(r'Passage\s*\d', s, re.I):
                skip = False
                continue
            skip = False
        out.append(l)
    return out


audit = []
for book in library:
    n = book['book']
    source = CACHE / (f'ocr{n}.json' if n in [16, 18, 19] else f'reading-ocr{n}.json')
    ocr = {p['page']: p['lines'] for p in json.loads(source.read_text())}
    if n not in [16, 18, 19]:
        pdf = next(p for p in Path('/Users/a1/Downloads').glob('*.pdf') if re.search(r'(?:IELTS(?: Academic)? |真题)' + str(n) + r'\b', p.name))
        doc = fitz.open(pdf)
        for number, scans in list(ocr.items()):
            page = doc[number - 1]
            lines = []
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    text = clean(''.join(span['text'] for span in line['spans']))
                    if not text:
                        continue
                    rect = fitz.Rect(line['bbox']) * page.rotation_matrix
                    mw, mh = (page.mediabox.height, page.mediabox.width) if page.rotation % 180 else (page.mediabox.width, page.mediabox.height)
                    ox, oy = (0, 0) if page.rotation else (page.cropbox.x0, page.cropbox.y0)
                    x, y, w, h = (rect.x0 + ox) / mw, (rect.y0 + oy) / mh, rect.width / mw, rect.height / mh
                    neighbors = [l for l in scans if abs((l['y'] + l['h']/2) - (y+h/2)) < .018 and abs(l['x'] - x) < .05]
                    best = max(neighbors, key=lambda l: difflib.SequenceMatcher(None, text, l['text']).ratio(), default=None)
                    if best and difflib.SequenceMatcher(None, text, best['text']).ratio() > .65:
                        y, h = best['y'], best['h']
                        for word in text.split():
                            if '\ufffd' in word or 'µ' in word or re.search(r'[a-z][0-9][a-z]', word, re.I):
                                candidates = difflib.get_close_matches(word, best['text'].split(), n=1, cutoff=.55)
                                if candidates:
                                    text = text.replace(word, candidates[0])
                    lines.append({'x': x, 'y': y, 'w': w, 'h': h, 'text': text, 'confidence': 1})
            ocr[number] = lines
    for paper in book['passages']:
        article = []
        grouped = {g['from']: [] for g in paper['groups']}
        gindex = -1
        assignments = []
        for page in paper['pages']:
            lines = strip_intro([dict(l, text=clean(l['text'])) for l in ocr[page['page']] if keep(l)])
            headers = sorted([l for l in lines if re.match(r'^[•\s]*Questions?\s+[0-9&IOl]', l['text'], re.I)], key=lambda l: l['y'])
            boundaries = [(h['y'] - .003, h) for h in headers]
            prefix = [l for l in lines if not boundaries or l['y'] < boundaries[0][0]]
            if prefix:
                first = rows(prefix)[:3]
                starts_number = any(re.match(r'^\d{1,2}\s+[A-Z]', r['text']) for r in first)
                # Continuation question pages start with a numbered question;
                # otherwise a fresh page following heading questions is the article.
                if gindex >= 0 and starts_number:
                    grouped[paper['groups'][gindex]['from']].extend(paragraphs(prefix, True))
                    assignments.append([page['page'], 'question-continuation'])
                else:
                    for chunk in column_chunks(prefix):
                        article.extend(paragraphs(chunk))
                    assignments.append([page['page'], 'article'])
            for i, (y, header) in enumerate(boundaries):
                gindex += 1
                if gindex >= len(paper['groups']):
                    raise ValueError(f"Too many question headings {paper['id']}: {header['text']}")
                end = boundaries[i + 1][0] if i + 1 < len(boundaries) else 1
                region = [l for l in lines if l is not header and y <= l['y'] < end]
                grouped[paper['groups'][gindex]['from']].extend(paragraphs(region, True))
                assignments.append([page['page'], f"questions {paper['groups'][gindex]['from']}"])
        title = article[0] if article and len(article[0]) < 140 and not article[0].endswith('.') else f"Reading Passage {paper['passage']}"
        if title == paper['title'] and re.search(r'Passage|READING', title, re.I):
            title = f"Reading Passage {paper['passage']}"
        body = article[1:] if article and title == article[0] else article
        paper['reading'] = {'title': title, 'paragraphs': body}
        paper['questionText'] = [
            {'from': g['from'], 'to': g['to'], 'paragraphs': grouped[g['from']]}
            for g in paper['groups']
        ]
        paper['title'] = title
        audit.append({'id': paper['id'], 'title': title, 'words': len(' '.join(body).split()), 'pages': assignments,
                      'groups': [{'from': g['from'], 'to': g['to'], 'chars': len(' '.join(grouped[g['from']])),
                                  'missingNumbers': [num for num in range(g['from'], g['to'] + 1)
                                                     if not re.search(r'(?<!\d)' + str(num) + r'(?!\d)', ' '.join(grouped[g['from']]))]}
                                 for g in paper['groups']]})

(CACHE / 'text-draft.json').write_text(json.dumps(library, ensure_ascii=False, separators=(',', ':')))
(CACHE / 'text-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
print(f"Built text for {len(audit)} passages")
for a in audit:
    issues = [g for g in a['groups'] if g['missingNumbers'] or g['chars'] < 100]
    if issues or a['words'] < 450 or a['title'].startswith('Reading Passage'):
        print(a['id'], a['words'], a['title'], issues)
