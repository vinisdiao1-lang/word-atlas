"""Apply source-checked transcription fixes and publish the reflowable library."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]
library = json.loads((ROOT / '.local/cambridge/text-draft.json').read_text())

# Restore labels dropped by scan recognition, without changing the source wording.
reading_labels = {
    'c16-t3-p3': {'Farmers and gardeners': 'C'},
    'c18-t1-p3': {'Even as our ability': 'C'},
    'c18-t3-p2': {'But the glory days': 'B', 'Even as the market': 'C', 'The following year': 'D', 'The brothers made one final': 'F'},
    'c18-t4-p1': {'In North America': 'C'},
    'c19-t1-p2': {'By now, Rome': 'G'},
    'c19-t2-p2': {"It isn't easy": 'A', 'For athletes, some level': 'B', 'Each new demand': 'C', 'But there are many ways': 'F'},
    'c19-t4-p2': {"'We're looking": 'B'},
}
choice_labels = {
    'c16-t1-p3': {"the proportion of the world's": 'C', 'the difference between ways': 'D', 'staff making sure': 'C'},
    'c16-t2-p2': {'They are more plentiful': 'C'},
    'c16-t2-p3': {'The importance of certain': 'C', 'can be greater than': 'A', 'will be different in': 'B', 'may be determined by': 'C', 'should develop over time': 'D', 'a controversial view': 'C'},
    'c16-t3-p2': {'Hunters went into': 'B', 'Vikings did not rely': 'C'},
    'c16-t4-p2': {'Technology can be used': 'B', 'Technological innovation has led': 'A', 'Writing systems make': 'C', 'has changed the way he': 'A', 'does not match the views': 'D'},
    'c16-t4-p3': {'highlighting the existence': 'C', 'They would rather wait': 'C', 'Misunderstandings about how': 'D', 'It leads the public': 'A', 'Its reports of incidents': 'C'},
    'c18-t2-p2': {'indicating which aspects': 'D', 'to emphasise the need': 'C', 'creating a better world': 'C'},
    'c18-t3-p2': {'Not enough cars': 'B', 'needed several attempts': 'C', 'raised financial capital': 'B'},
    'c18-t3-p3': {'how unsuitable Shakespeare': 'C', 'It is relatively simple': 'C', 'students attempting interesting': 'B', 'students not achieving': 'C', "the environment where most": 'B'},
    'c18-t4-p1': {'to grow plants successfully': 'B', 'to regulate the temperature': 'C', 'to generate power': 'D'},
    'c18-t4-p2': {'where the notion': 'A', 'how scientists have responded': 'C', 'help each other': 'B', 'have confidence in': 'C', 'generally have a low': 'B', 'will only work hard': 'C'},
    'c19-t1-p2': {'They managed to escape': 'B'},
    'c19-t1-p3': {'It has changed the way': 'C', 'outlining which issues': 'C', 'dubious reason': 'I'},
    'c19-t2-p2': {'measures which she': 'C'},
    'c19-t2-p3': {'assistance from their peers': 'B', 'CIncluding time': 'C', 'the loving support': 'B'},
    'c19-t3-p2': {'Marcel Silvius': 'C'},
    'c19-t3-p3': {'the languages used': 'C', 'this book was not': 'B', 'The equipment will be': 'C', 'because translation is immediate': 'E'},
    'c19-t4-p3': {'setting out two opposing': 'A', 'describing a commonly': 'C', 'It presented a view': 'C'},
}
question_labels = {
    'c16-t4-p3': {'Section D': 30},
    'c18-t1-p2': {'mention of the potential': 16},
    'c18-t3-p1': {'a reference to the various': 2},
    'c19-t3-p1': {'Archaeological research': 1, 'At the Kelo sites': 2},
}
replacements = {
    'c11-t1-p1': {'aeople': 'people', "worid's": "world's", 'estimated 10 hectares': 'estimated 10⁹ hectares'},
    'c11-t4-p3': {'O The most extraordinary': 'D The most extraordinary'},
    'c16-t4-p2': {'.ead .............. words': 'read 21 .............. words'},
    'c19-t4-p3': {'Humans who developed warlike': '\n37 Humans who developed warlike'},
    'c19-t2-p1': {'worked at home and in': 'worked at home and in 3 ______.', 'material that was better': 'material that was better 5 ______.'},
    'c19-t2-p2': {'risk of..... . . ..': 'risk of ______.', 'produce fewer good': 'produce fewer good ______.', 'of a positive feeling such as': 'of a positive feeling such as ______.', '22 ... is an example': '22 ______ is an example'},
    'c19-t3-p2': {'begin to release instead of': 'begin to release ______ instead of', 'areas have been cleared, are more': 'areas have been cleared, ______ are more', '..of the local environment': '______ of the local environment', 'through the ... which': 'through the ______ which'},
}
summary_options = {
    'c15-t3-p3': ['ending', 'events', 'warning', 'links', 'records', 'variations', 'horror', 'people', 'plot'],
    'c15-t4-p3': ['funding', 'trees', 'rare species', 'moral standards', 'control', 'involvement', 'flooding', 'overfishing', 'worker support'],
    'c16-t1-p3': ['pressure', 'satisfaction', 'intuition', 'promotion', 'reliance', 'confidence', 'information'],
    'c16-t2-p2': ['solution', 'partnership', 'destruction', 'exaggeration', 'cleanliness', 'regulations', 'illness', 'nutrition'],
    'c16-t2-p3': ['opinions', 'confidence', 'view', 'modesty', 'problems', 'objectivity', 'fairness', 'experiences', 'range', 'reasons'],
    'c18-t4-p3': ['modest fame', 'vast range', 'record-breaking achievement', 'research methods', 'select group', 'professional interests', 'scientific debate', 'hazardous exploration', "biographer's perspective", 'narrow investigation'],
}


def tidy(s):
    s = s.replace('co"ect', 'correct')
    s = re.sub(r'(?i)\bAl\b', 'AI', s)
    s = re.sub(r'^(\d)\s+(\d)(?=\s)', r'\1\2', s)
    s = re.sub(r'^(\d{1,2})[.]\s+', r'\1 ', s)
    s = re.sub(r'\s*9IELTS[.]COM\s*', '\n', s, flags=re.I)
    for a, b in {'Ittook': 'It took', 'Ithas': 'It has', 'Itfavours': 'It favours', 'ifthe': 'if the', 'ifit': 'if it', 'ifthere': 'if there', 'NOT GIVENif': 'NOT GIVEN if'}.items():
        s = s.replace(a, b)
    return s.strip()


def valid(s, question=False):
    if question and re.search(r'[.]{3,}', s) and re.search(r'[A-Za-z]{3}', s):
        return True
    if re.match(r'^\d{1,2}\s*[.]{2,}', s):
        return True
    return bool(s and not s.isdigit() and len(s) > 3 and not re.search(r'[pр]\.\s*\d+\D*$', s) and not re.search(r'ir.?Languag|MierCre|ul>\.|\[R', s, re.I) and not (len(s) < 70 and len(re.findall('[A-Za-z0-9]', s)) / len(s) < .55))


for book in library:
    for paper in book['passages']:
        pid = paper['id']
        reading = paper['reading']
        body = [tidy(s) for s in reading['paragraphs'] if valid(s)]
        if pid == 'c11-t4-p3':
            reading['title'] = "'This Marvellous Invention'"
            body = [s for s in body if s != reading['title']]
        for prefix, label in reading_labels.get(pid, {}).items():
            body = [f'{label} {s}' if s.startswith(prefix) else s for s in body]
        if pid == 'c14-t2-p2':
            body = [f'I {s}' if s.startswith('He is convinced') else s for s in body]
        if pid == 'c14-t3-p1':
            body = [f'I {s}' if s.startswith('The Jacksonian view') else s for s in body]
        if pid in ['c14-t1-p2', 'c15-t1-p2']:
            body = [re.sub(r'^G(?=In|It)', 'G ', s) for s in body]
        for i, s in enumerate(body):
            if ' G ' in s and pid == 'c11-t1-p3':
                body[i:i+1] = s.split(' G ', 1)
                body[i+1] = 'G ' + body[i+1]
                break
        if pid in ['c13-t3-p2', 'c16-t3-p3']:
            for i, s in enumerate(body):
                if ' F ' in s:
                    before, after = s.split(' F ', 1)
                    body[i:i+1] = [before, 'F ' + after]
                    break
        for prefix in ['measuring night-time heat', 'prehistoric island settlers', 'the world']:
            if body and body[0] == prefix:
                reading['title'] += ' ' + body.pop(0)
        joined = []
        for s in body:
            if joined and s[0].islower():
                joined[-1] += ' ' + s
            else:
                joined.append(s)
        reading['paragraphs'] = [re.sub(r'([.!?\'”’]) \d{1,3}$', r'\1', s) for s in joined]
        reading['title'] = tidy(reading['title'])
        paper['title'] = reading['title']
        for section in paper['questionText']:
            text = '\n'.join(tidy(s) for s in section['paragraphs'] if valid(s, question=True))
            if pid == 'c14-t4-p2':
                text = text.replace('8 Some travel', 'B Some travel')
            if pid == 'c15-t1-p2':
                text = text.replace('0 People who find', 'D People who find')
            for phrase, label in choice_labels.get(pid, {}).items():
                if phrase == 'CIncluding time':
                    text = text.replace(phrase, '\nC Including time')
                else:
                    text = re.sub(r'(?<![A-Z] )' + re.escape(phrase), '\n' + label + ' ' + phrase, text)
            for phrase, num in question_labels.get(pid, {}).items():
                text = re.sub(r'(?m)^' + re.escape(phrase), str(num) + ' ' + phrase, text)
            for old, new in replacements.get(pid, {}).items():
                text = text.replace(old, new)
            section['paragraphs'] = [s.strip() for s in text.split('\n') if s.strip()]
            if pid == 'c11-t2-p1' and section['from'] == 9:
                section['paragraphs'] = section['paragraphs'][:4] + ['9 ______ attached to hull by wires', '10 ______ to prevent hull being sucked into mud', 'legs are placed into 11 ______', 'hull is lowered into 12 ______', '13 ______ used as extra protection for the hull']
            if pid == 'c15-t4-p1' and section['from'] == 6:
                section['paragraphs'] = section['paragraphs'][:4] + ['Part of tree — Traditional use', '6 ______ — fuel', '7 ______ and ______ — medicine', '8 ______ — construction']
            if pid == 'c16-t1-p1' and section['from'] == 8:
                section['paragraphs'] = [s.replace('platform where a was located', 'platform where a 11 ______ was located') for s in section['paragraphs']]
            if pid == 'c16-t4-p1' and section['from'] == 1:
                section['paragraphs'] = section['paragraphs'][:4] + ['1 ______ to direct the tunnelling', 'water runs into a 2 ______ used by local people', 'vertical shafts to remove earth and for 3 ______', 'Cross-section of a Roman Qanat Shaft', '4 ______ made of wood or stone', '5 ______ attached to the plumb line', 'handholds and footholds used for 6 ______']
            if pid == 'c18-t1-p1' and section['from'] == 1:
                section['paragraphs'] = section['paragraphs'][:4] + ['1 Vertical tubes are used to grow strawberries, ______ and herbs.', '2 There will eventually be a daily harvest of as much as ______ in weight of fruit and vegetables.', "3 It may be possible that the farm's produce will account for as much as 10% of the city's ______ overall."]
            if pid == 'c18-t1-p1' and section['from'] == 4:
                section['paragraphs'] = section['paragraphs'][:3] + ['Intensive farming versus aeroponic urban farming', 'Intensive farming — Growth: wide range of 4 ______ used; techniques pollute air.', 'Intensive farming — Selection: quality not good; varieties of fruit and vegetables chosen that can survive long 5 ______.', 'Intensive farming — Sale: 6 ______ receive very little of overall income.', 'Aeroponic urban farming — Growth: no soil used; nutrients added to water, which is recycled.', 'Aeroponic urban farming — Selection: produce chosen because of its 7 ______.']
            if pid == 'c18-t1-p3' and section['from'] == 32:
                section['paragraphs'] = [s.replace('how .............. .... of space', 'how 32 ______ of space') for s in section['paragraphs']]
            group = next(g for g in paper['groups'] if g['from'] == section['from'])
            if group['type'] == 'summary':
                arr = section['paragraphs']
                if pid in summary_options:
                    option_start = next((i for i, s in enumerate(arr) if s.startswith('A ') or s.startswith('pressure B satisfaction')), len(arr))
                    arr = arr[:option_start] + [f'{chr(65+i)} {word}' for i, word in enumerate(summary_options[pid])]
                    if pid == 'c15-t4-p3':
                        arr = [s.replace('A-J', 'A-I') for s in arr]
                last_instruction = max((i for i, s in enumerate(arr[:4]) if re.match(r'^(?:Complete|Choose|Write)\b', s)), default=-1)
                start = last_instruction + 1
                if start < len(arr) and len(arr[start]) < 100 and not re.search(r'[.!?]', arr[start]):
                    start += 1
                option_start = next((i for i in range(start, len(arr)) if re.match(r'^A\s', arr[i])), len(arr))
                body = [' '.join(arr[start:option_start])] if option_start > start else []
                options = re.split(r'\s+(?=[A-K]\s)', ' '.join(arr[option_start:])) if option_start < len(arr) else []
                section['paragraphs'] = arr[:start] + body + options
            if group['type'] == 'heading':
                arr = section['paragraphs']
                for i, s in enumerate(arr[:-1]):
                    if re.fullmatch('List of Headings', s, re.I):
                        if not re.match(r'^i\s', arr[i+1], re.I):
                            arr[i+1] = 'i ' + arr[i+1]
                        break
                section['paragraphs'] = [re.sub(r'^ii(?=[A-Z])', 'ii ', re.sub(r'^vili ', 'viii ', re.sub(r'^ili ', 'iii ', re.sub(r'^Iv ', 'iv ', s)))) for s in arr]
                if pid == 'c12-t2-p2':
                    section['paragraphs'].insert(section['paragraphs'].index('14 Paragraph A'), "viii Bingham's lack of enthusiasm")
            if group['type'] == 'judgment':
                arr = section['paragraphs']
                cut = max(i for i, s in enumerate(arr) if re.search(r'NOT GIVEN|if there is no information|impossible to say', s))
                stems = arr[cut+1:]
                count = group['to'] - group['from'] + 1
                if len(stems) != count:
                    merged = []
                    for stem in stems:
                        if re.match(r'^\d{1,2}\s+', stem) or not merged:
                            merged.append(stem)
                        else:
                            merged[-1] += ' ' + stem
                    if len(merged) == count:
                        stems = merged
                if len(stems) != count:
                    raise ValueError(f'{pid}: judgment stems {len(stems)} != {count}')
                options = ['YES', 'NO', 'NOT GIVEN'] if re.search(r'YES|views|claims', ' '.join(arr[:cut+1]), re.I) else ['TRUE', 'FALSE', 'NOT GIVEN']
                context = 'claims' if 'claims' in arr[0] else 'views'
                definitions = [
                    f'YES if the statement agrees with the {context} of the writer',
                    f'NO if the statement contradicts the {context} of the writer',
                    'NOT GIVEN if it is impossible to say what the writer thinks about this',
                ] if options[0] == 'YES' else [
                    'TRUE if the statement agrees with the information',
                    'FALSE if the statement contradicts the information',
                    'NOT GIVEN if there is no information on this',
                ]
                section['paragraphs'] = arr[:2] + definitions + [
                    f"{n} {re.sub(r'^\d{1,2}\s+', '', stem)}"
                    for n, stem in zip(range(group['from'], group['to'] + 1), stems)
                ]
                section['judgmentOptions'] = options
        if pid in ['c11-t1-p1', 'c11-t4-p3']:
            for old, new in replacements.get(pid, {}).items():
                reading['paragraphs'] = [s.replace(old, new) for s in reading['paragraphs']]
        # Build per-question blocks where the source gives independent numbered stems.
        for section in paper['questionText']:
            group = next(g for g in paper['groups'] if g['from'] == section['from'])
            expected = list(range(group['from'], group['to'] + 1))
            found, intro, active = {}, [], None
            for s in section['paragraphs']:
                match = re.match(r'^(\d{1,2})\s+(.+)', s)
                if match and int(match[1]) in expected:
                    active = int(match[1])
                    found[active] = [match[2]]
                elif active is not None:
                    found[active].append(s)
                else:
                    intro.append(s)
            if sorted(found) == expected and not group['anyOrder'] and group['type'] in ['choice', 'judgment', 'heading', 'paragraph-match']:
                section['intro'] = intro
                section['items'] = [{'number': n, 'paragraphs': found[n]} for n in expected]

target = ROOT / 'public/cambridge/v2/library.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(library, ensure_ascii=False, separators=(',', ':')))
print('Published reflowable text:', target, target.stat().st_size)
