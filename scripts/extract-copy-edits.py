"""离线读取纯文本/已知 ID，不运行 JSX 或 HTML；只报告建议与冲突，不改网站。"""
import argparse, json, re
from pathlib import Path
from html.parser import HTMLParser

root = Path(__file__).resolve().parents[1]
base = json.loads((root/'docs/redesign-v2/step-02/copy-baseline.json').read_text(encoding='utf-8'))
class TextEdits(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.rows={}; self.active=None; self.parts=[]
    def handle_starttag(self, tag, attributes):
        attrs=dict(attributes)
        if tag=='textarea' and attrs.get('data-copy-id') in base:
            self.active=attrs['data-copy-id']; self.parts=[]
        if tag=='input' and attrs.get('data-enabled-id') in base:
            self.rows.setdefault(attrs['data-enabled-id'],{})['enabled']='checked' in attrs
    def handle_data(self,data):
        if self.active is not None:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=='textarea' and self.active is not None:
            self.rows.setdefault(self.active,{})['text']=''.join(self.parts);self.active=None

def read_jsx(file):
    raw=Path(file).read_text(encoding='utf-8-sig')
    value=re.split(r'export const uiCopy\s*=\s*',raw,maxsplit=1)[1].strip().removesuffix(';')
    return json.loads(value)  # 只允许数据对象；拒绝表达式、调用或可执行 JSX。

def compare(rows,current):
    changes=[]; conflicts=[]; rejected=[]
    for id,row in rows.items():
        if id not in base:rejected.append(id);continue
        before={k:base[id].get(k) for k in ['text','enabled']}; proposed={k:row.get(k,before[k]) for k in before}
        if not isinstance(proposed['text'],str) or not isinstance(proposed['enabled'],bool):rejected.append(id);continue
        if not base[id].get('optional') and (not proposed['enabled'] or not proposed['text'].strip()):rejected.append(id);continue
        existing={k:current.get(id,base[id]).get(k) for k in before}
        if proposed!=before:
            if existing!=before and existing!=proposed:conflicts.append({'id':id,'baseline':before,'jsx':existing,'html':proposed})
            else:changes.append({'id':id,**proposed,'scope':base[id].get('scope'),'sourceField':base[id].get('sourceField'),'courseId':base[id].get('courseId'),'objectId':base[id].get('objectId')})
    return {'version':1,'changes':changes,'conflicts':conflicts,'rejectedIds':rejected,'applied':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input');parser.add_argument('--jsx',default=str(root/'frontend/src/content/uiCopy.jsx'));parser.add_argument('--baseline',default=str(root/'docs/redesign-v2/step-02/copy-baseline.json'));parser.add_argument('--out',required=True);args=parser.parse_args()
    base=json.loads(Path(args.baseline).read_text(encoding='utf-8'))
    raw=Path(args.input).read_text(encoding='utf-8-sig')
    if args.input.lower().endswith('.json'):
        data=json.loads(raw);rows={e['id']:e for e in data['edits']}
    else:
        html=TextEdits();html.feed(raw);rows=html.rows
    result=compare(rows,read_jsx(args.jsx));Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(len(result['changes']),'changes;',len(result['conflicts']),'conflicts;',len(result['rejectedIds']),'rejected; applied=False')
