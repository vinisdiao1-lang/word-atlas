"""Build PRIVATE local study packs; never writes PDF content under public/.
Usage: .local/pdf-venv/bin/python scripts/cambridge/extract.py
OCR scan books first with ocr.swift; intermediate files live under .local/cambridge.
"""
from pathlib import Path
import json,re,base64
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.local/cambridge'; OUT=ROOT/'output/cambridge';OUT.mkdir(parents=True,exist_ok=True)

def kind(s):
 s=s.lower()
 if re.search(r'match each|complete each sentence with|list of (?:people|companies|dates|explorers|theories)',s):return 'other'
 if re.search(r'complete (?:the|this|a) summary|summary below',s):return 'summary'
 if re.search(r'complete (?:the|these|each|a) (?:notes|table|sentences|sentence|diagram|flow.?chart)|answer the questions',s):return 'other'
 if re.search(r'heading|list of headings',s):return 'heading'
 if re.search(r'which (?:paragraph|section)|contains? the following information',s):return 'paragraph-match'
 if re.search(r'do the following statements|agree with the (?:information|views|claims)|true\s+if|yes\s+if',s):return 'judgment'
 if re.search(r'choose (?:the co|one letter|two letters|three letters)|four choices',s):return 'choice'
 return 'other'

def keys_from_text(s):
 result={}
 s=re.split(r'If\s+you\s+score',s,flags=re.I)[0]
 offsets=[m.start(1) for line in s.splitlines() for m in re.finditer(r'(?:^|\s{3,})(\d{1,2})[ \t]+',line) if m.start(1)>28]
 cut=min(offsets) if offsets else None
 columns=['\n'.join(line[:cut] for line in s.splitlines()),'\n'.join(line[cut:] for line in s.splitlines())] if cut else [s]
 for column in columns:
  lines=[x.strip() for x in column.splitlines() if x.strip()]
  for i,line in enumerate(lines):
   line=re.sub(r'^(\d) +(\d)(?=\s*[&]|\s+[A-Za-z(])',r'\1\2',line)
   group=re.match(r'^(\d{1,2})\s*&\s*(\d{1,2})\s+IN EITHER ORDER',line,re.I)
   if group:
    answers=[]
    for follow in lines[i+1:i+5]:
     if re.match(r'^\d+\s',follow):break
     if len(follow)<60:answers.append(follow.strip(' }|'))
    if len(answers)>=2:
     result[int(group[1])]=answers[0];result[int(group[2])]=answers[1]
    continue
   m=re.match(r'^(\d{1,2})[ \t]+(.+)$',line) or re.match(r'^(\d{1,2})([A-Za-z(].*)$',line)
   if m and 1<=int(m[1])<=40:
    ans=m[2].strip();ans=re.split(r'\s+(?:IN EITHER ORDER|in either order)',ans)[0].strip(' }|')
    if not re.match(r'(?i)(?:Reading|Questions|Passage|you|to|Test|If|and)\b',ans):result[int(m[1])]=ans
   elif i+1<len(lines) and re.match(r'^2\s+',lines[i+1]) and re.fullmatch(r'(?:NOT\s*GIVEN|TRUE|FALSE|YES|NO)',line,re.I):result[1]=line
 return result

def ocr_key_text(lines):
 # Read each half-column independently; combine neighbouring OCR boxes on the same baseline.
 limits=[l['y'] for l in lines if l['y']>.55 and re.search(r'score',l['text'],re.I)]
 if limits:lines=[l for l in lines if l['y']<min(limits)]
 rows=[]
 for side in [0,1]:
  items=[l for l in lines if (l['x']>=.40)==bool(side)]
  grouped=[]
  for l in sorted(items,key=lambda l:l['y']):
   row=next((r for r in grouped[-3:] if abs(r[0]['y']-l['y'])<.006),None)
   if row is None:grouped.append([l])
   else:row.append(l)
  for row in grouped:rows.append(' '.join(l['text'] for l in sorted(row,key=lambda l:l['x'])))
 return '\n'.join(rows)

manifest=[]
for pdf in sorted(Path('/Users/a1/Downloads').glob('*.pdf')):
 m=re.search(r'(?:IELTS(?: Academic)? |真题)(1[1-9])',pdf.name)
 if not m:continue
 book=int(m[1]);doc=fitz.open(pdf)
 ocrfile=CACHE/f'ocr{book}.json'
 if book in [16,18,19] and not ocrfile.exists():continue
 ocr=json.loads(ocrfile.read_text()) if book in [16,18,19] else None
 pages=[p['text'] for p in ocr] if ocr else (CACHE/f'book{book}.txt').read_text().split('\f')[:len(doc)]
 starts=[]
 for i,t in enumerate(pages):
  m=re.search(r'READING\s*PASSAGE\s*([123])',t,re.I)
  if m and re.search(r'You should spend',t,re.I):starts.append((i,int(m[1])))
 if len(starts)!=12:raise ValueError(f'book {book}: expected 12 starts, got {starts}')
 keypages=[]
 high=json.loads((CACHE/f'answers{book}.json').read_text())
 for hp in high:
  i=hp['page']-1
  native=keys_from_text(pages[i]) if not ocr else {}
  if not ocr:
   words=[{'text':w[4],'x':w[0]/doc[i].rect.width,'y':w[1]/doc[i].rect.height} for w in doc[i].get_text('words')]
   native={**keys_from_text(ocr_key_text(words)),**native}
  scanned=keys_from_text(ocr_key_text(hp['lines']))
  keys={**scanned,**native}
  keypages.append((i,keys,ocr_key_text(hp['lines'])))
 if len(keypages)!=4:raise ValueError(f'book {book}: expected four answer pages, got {[(i+1,len(k)) for i,k,s in keypages]}')
 pack={'format':'word-atlas-cambridge-v1','book':book,'passages':[]}
 readingpdf=fitz.open()
 for idx,(start,number) in enumerate(starts):
  test=idx//3+1; end=starts[idx+1][0] if number<3 else next(i for i in range(start+1,min(start+12,len(pages))) if re.search(r'(?im)^[ \t]*(?:WRITING(?:[ \t]+TASK[^\n]*)?|Write at least 150 words[.]?)[ \t]*$',pages[i]))
  full='\n'.join(pages[start:end]);groups=[]
  header=re.compile(r'(?im)^[ \t•]*Questions?[ \t]+([^\n]{1,55})')
  for match in header.finditer(full):
   label=re.sub(r'(?<=\d) +(?=\d)','',match[1].replace('O','0'));num=re.match(r'([0-9OIl&]{1,2})\s*(?:[-–—−]+|and)\s*([0-9OIl]{1,2})',label)
   if not num:num=re.match(r'([0-9]{1,2})\b',label)
   if not num:continue
   tokens=[re.sub(r'[^0-9]','',t.replace('O','0').replace('I','1').replace('l','1')) if t else '' for t in num.groups()];lo=int(tokens[0]) if tokens[0] else (max([g['to'] for g in groups],default=(number-1)*13)+1);hi=int(tokens[1]) if len(tokens)>1 and tokens[1] else lo
   if lo>hi or hi>40:continue
   direction=re.split(r'(?im)^[ \t•]*Questions?\b',full[match.end():match.end()+750])[0]
   # Stop the classification before the actual numbered questions where possible.
   direction=re.split(r'\n\s*'+str(lo)+r'\s+',direction,maxsplit=1)[0]
   if any(g['from']==lo and g['to']==hi for g in groups):continue
   groups.append({'from':lo,'to':hi,'type':kind(direction),'instruction':direction[:500], 'anyOrder': bool(re.search(r'Choose\s+(?:TWO|THREE)\s+letters',direction,re.I))})
  answerPage,answers,rawkeys=keypages[test-1]
  overrides=CACHE/'answer-overrides.json'
  if overrides.exists():answers={**answers,**{int(k):v for k,v in json.loads(overrides.read_text()).get(str(book),{}).get(str(test),{}).items()}}
  numbers=list(range(1 if number==1 else 14 if number==2 else 27,14 if number==1 else 27 if number==2 else 41))
  missing=[n for n in numbers if not any(g['from']<=n<=g['to'] for g in groups)]
  for n in missing:groups.append({'from':n,'to':n,'type':'other','instruction':'原卷分组需核对','anyOrder':False})
  if not numbers:raise ValueError(f'No questions {book}-{test}-{number}')
  images=[]
  for page in range(start,end):
   pix=doc[page].get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
   images.append({'page':page+1,'image':'data:image/jpeg;base64,'+base64.b64encode(pix.tobytes('jpeg',jpg_quality=78)).decode()})
  pix=doc[answerPage].get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False)
  titlelines=[l.strip() for l in pages[start].splitlines() if l.strip()]
  title=next((l for l in titlelines if len(l)>10 and not re.search(r'READING|You should|Questions|Test |minutes|spend|following|heading|paragraph',l,re.I)),f'Passage {number}')
  entry={'id':f'c{book}-t{test}-p{number}','book':book,'test':test,'passage':number,'title':title[:140],'text':full,'groups':groups,'numbers':numbers,'answers':{str(n):re.sub(r'(?i)NOT\s*G\s*I\s*V\s*E\s*N','NOT GIVEN',answers.get(n,'')) for n in numbers},'pages':images,'answerPage':{'page':answerPage+1,'image':'data:image/jpeg;base64,'+base64.b64encode(pix.tobytes('jpeg',jpg_quality=80)).decode()},'sourceStart':start+1,'sourceEnd':end,'ocr':bool(ocr)}
  pack['passages'].append(entry);readingpdf.insert_pdf(doc,from_page=start,to_page=end-1)
 (OUT/f'剑桥雅思{book}-阅读题库.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
 
 for answerPage,_,_ in keypages:readingpdf.insert_pdf(doc,from_page=answerPage,to_page=answerPage)
 readingpdf.save(OUT/f'剑桥雅思{book}-阅读原页.pdf',garbage=4,deflate=True)
 report={'book':book,'passages':[{'id':p['id'],'title':p['title'],'pages':[p['sourceStart'],p['sourceEnd']],'groups':[(g['from'],g['to'],g['type']) for g in p['groups']],'missingAnswers':[n for n,a in p['answers'].items() if not a]} for p in pack['passages']]}
 (CACHE/f'report{book}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));manifest.append(report)
 print('Extracted',book,'passages',len(pack['passages']),'missing answers',sum(len(x['missingAnswers']) for x in report['passages']),flush=True)
(OUT/'提取核对报告.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
