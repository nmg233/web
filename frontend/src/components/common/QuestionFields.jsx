import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import { Button, Form, Input, Radio, Checkbox, Space } from 'antd';

export default function QuestionFields({ form }) {
  const type = Form.useWatch('question_type', form);
  const choices = Form.useWatch('options', form) || [];
  const options = choices.map((o) => ({ label: o?.label || o?.value, value: o?.value })).filter((o) => o.value);
  return <>
    <Form.Item name="prompt" label={runtimeCopyText("student26.4d6395018e76d1ba")} rules={[{ required: true, whitespace: true, message: runtimeCopyText("student26.d9219e357edbb194") }]} data-copy-bindings={JSON.stringify(["student26.4d6395018e76d1ba","student26.d9219e357edbb194"])}><Input.TextArea maxLength={5000} /></Form.Item>
    {['single_choice', 'multiple_choice'].includes(type) && <>
      <Form.List name="options" rules={[{ validator: (_, rows) => rows?.length >= 2 && rows.length <= 20 ? Promise.resolve() : Promise.reject(new Error('需要 2–20 个选项')) }]}>
        {(fields, { add, remove }, { errors }) => <><Space direction="vertical" style={{ width: '100%' }}>{fields.map((f) => <Space key={f.key} align="baseline">
          <Form.Item name={[f.name, 'label']} rules={[{ required: true, whitespace: true }]}><Input placeholder={runtimeCopyText("student26.31dc919de8a7ae14")} /></Form.Item>
          <Form.Item name={[f.name, 'value']} rules={[{ required: true, whitespace: true }]}><Input placeholder={runtimeCopyText("student26.156c9ad08b458c6e")} /></Form.Item>
          <Button danger onClick={() => remove(f.name)}><StudentCopyText id="student26.6484abfdb7cd43e7"/></Button>
        </Space>)}</Space><Button disabled={fields.length >= 20} onClick={() => add({ label: '', value: String.fromCharCode(65 + fields.length) })}><StudentCopyText id="student26.d03fea7c6af336f6"/></Button><Form.ErrorList errors={errors} /></>}
      </Form.List>
      <Form.Item name="answer" label={runtimeCopyText("student26.b3413dfa6d45c040")} rules={[{ required: true, message: runtimeCopyText("student26.a307a01ea7f4a4c7") }]} data-copy-bindings={JSON.stringify(["student26.b3413dfa6d45c040","student26.a307a01ea7f4a4c7"])}>{type === 'single_choice' ? <Radio.Group options={options} /> : <Checkbox.Group options={options} />}</Form.Item>
    </>}
    {type === 'true_false' && <Form.Item name="answer" label={runtimeCopyText("student26.cd36392989344a9c")} rules={[{ required: true }]} data-copy-bindings={JSON.stringify(["student26.cd36392989344a9c"])}><Radio.Group options={[{ label: runtimeCopyText("student26.048053866f363ea3"), value: true }, { label: runtimeCopyText("student26.4756cc28f8aab85d"), value: false }]}  data-copy-bindings={JSON.stringify(["student26.048053866f363ea3","student26.4756cc28f8aab85d"])}/></Form.Item>}
    {type === 'fill_blank' && <Form.List name="blanks" rules={[{ validator: (_, rows) => rows?.length > 0 && rows.length <= 20 ? Promise.resolve() : Promise.reject(new Error('需要 1–20 个空')) }]}>
      {(fields, { add, remove }, { errors }) => <>{fields.map((f, i) => <Space key={f.key} align="baseline"><Form.Item name={f.name} label={`第 ${i + 1} 空可接受答案（每行一个）`} rules={[{ required: true, whitespace: true }]}><Input.TextArea placeholder={runtimeCopyText("student26.b102d16e08e6d830")} /></Form.Item><Button danger onClick={() => remove(f.name)}><StudentCopyText id="student26.6484abfdb7cd43e7"/></Button></Space>)}<Button onClick={() => add('')}><StudentCopyText id="student26.6604e398258729c6"/></Button><Form.ErrorList errors={errors} /></>}
    </Form.List>}
    {type === 'short_answer' && <Form.Item name="answer" label={runtimeCopyText("student26.90134ad18e83e464")} rules={[{ required: true, whitespace: true }]} data-copy-bindings={JSON.stringify(["student26.90134ad18e83e464"])}><Input.TextArea rows={4} /></Form.Item>}
    {type === 'short_answer' && <Form.Item name="rubric" label={runtimeCopyText("student26.058cf1d427e5afc6")} data-copy-bindings={JSON.stringify(["student26.058cf1d427e5afc6"])}><Input.TextArea rows={3} maxLength={5000} placeholder={runtimeCopyText("student26.cd07a87fb3bd0ed1")}  data-copy-bindings={JSON.stringify(["student26.cd07a87fb3bd0ed1"])}/></Form.Item>}
    <Form.Item name="explanation" label={runtimeCopyText("student26.d89a024f4057ee6a")} rules={[{ required: true, whitespace: true, message: runtimeCopyText("student26.0222a95de2b0bbd4") }]} data-copy-bindings={JSON.stringify(["student26.d89a024f4057ee6a","student26.0222a95de2b0bbd4"])}><Input.TextArea rows={4} maxLength={5000} /></Form.Item>
  </>;
}
