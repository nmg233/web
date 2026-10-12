import importlib.util,json,unittest
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('copy_extract',root/'scripts/extract-copy-edits.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CopyExtraction(unittest.TestCase):
 def test_special_characters_and_unknown_html_never_execute(self):
  p=m.TextEdits();p.feed('<script>throw new Error("DO NOT RUN")</script><textarea data-copy-id="avatar.hint">引号&quot; &lt;script&gt; ${answer}\n尾行</textarea><input data-enabled-id="avatar.hint" checked><textarea data-copy-id="untrusted">恶意未知 ID</textarea>')
  result=m.compare(p.rows,m.read_jsx(root/'frontend/src/content/uiCopy.jsx'));self.assertEqual(result['changes'][0]['text'],'引号" <script> ${answer}\n尾行');self.assertFalse(result['applied']);self.assertNotIn('untrusted',p.rows)
 def test_optional_empty_and_disabled_preserved(self):
  r=m.compare({'avatar.hint':{'text':'','enabled':False}},m.base);self.assertEqual(r['changes'][0]['text'],'');self.assertFalse(r['changes'][0]['enabled'])
 def test_required_and_unknown_rejected(self):
  r=m.compare({'assistant.send':{'text':'','enabled':False},'new.fake.id':{'text':'假入口','enabled':True}},m.base);self.assertEqual(r['changes'],[]);self.assertEqual(len(r['rejectedIds']),2)
 def test_two_sources_conflict_not_auto_applied(self):
  current={**m.base,'avatar.hint':{**m.base['avatar.hint'],'text':'JSX 人工修改'}};r=m.compare({'avatar.hint':{'text':'HTML 人工修改','enabled':True}},current);self.assertEqual(r['changes'],[]);self.assertEqual(r['conflicts'][0]['id'],'avatar.hint');self.assertFalse(r['applied'])
 def test_teaching_fields_keep_course_and_object_mapping(self):
  r=m.compare({'lesson.90011.description':{'text':'待人工确认的改稿','enabled':True}},m.base);self.assertEqual(r['changes'][0]['courseId'],9001);self.assertEqual(r['changes'][0]['objectId'],90011);self.assertEqual(r['changes'][0]['sourceField'],'lessons.description')
 def test_jsx_read_is_json_only(self):
  from tempfile import TemporaryDirectory
  with TemporaryDirectory(dir=root/'test-results') as temp:
   p=Path(temp)/'bad.jsx';p.write_text('export const uiCopy = (() => { throw Error("bad") })();',encoding='utf-8')
   with self.assertRaises(json.JSONDecodeError):m.read_jsx(p)
if __name__=='__main__':unittest.main(verbosity=2)
