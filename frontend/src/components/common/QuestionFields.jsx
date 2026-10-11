import { Button, Form, Input, Radio, Checkbox, Space } from 'antd';

export default function QuestionFields({ form }) {
  const type = Form.useWatch('question_type', form);
  const choices = Form.useWatch('options', form) || [];
  const options = choices.map((o) => ({ label: o?.label || o?.value, value: o?.value })).filter((o) => o.value);
  return <>
    <Form.Item name="prompt" label="题目" rules={[{ required: true, whitespace: true, message: '请填写题目' }]}><Input.TextArea maxLength={5000} /></Form.Item>
    {['single_choice', 'multiple_choice'].includes(type) && <>
      <Form.List name="options" rules={[{ validator: (_, rows) => rows?.length >= 2 && rows.length <= 20 ? Promise.resolve() : Promise.reject(new Error('需要 2–20 个选项')) }]}>
        {(fields, { add, remove }, { errors }) => <><Space direction="vertical" style={{ width: '100%' }}>{fields.map((f) => <Space key={f.key} align="baseline">
          <Form.Item name={[f.name, 'label']} rules={[{ required: true, whitespace: true }]}><Input placeholder="选项内容" /></Form.Item>
          <Form.Item name={[f.name, 'value']} rules={[{ required: true, whitespace: true }]}><Input placeholder="唯一选项编号，如 A" /></Form.Item>
          <Button danger onClick={() => remove(f.name)}>移除</Button>
        </Space>)}</Space><Button disabled={fields.length >= 20} onClick={() => add({ label: '', value: String.fromCharCode(65 + fields.length) })}>添加选项</Button><Form.ErrorList errors={errors} /></>}
      </Form.List>
      <Form.Item name="answer" label="正确选项" rules={[{ required: true, message: '请选择正确答案' }]}>{type === 'single_choice' ? <Radio.Group options={options} /> : <Checkbox.Group options={options} />}</Form.Item>
    </>}
    {type === 'true_false' && <Form.Item name="answer" label="正确答案" rules={[{ required: true }]}><Radio.Group options={[{ label: '正确', value: true }, { label: '错误', value: false }]} /></Form.Item>}
    {type === 'fill_blank' && <Form.List name="blanks" rules={[{ validator: (_, rows) => rows?.length > 0 && rows.length <= 20 ? Promise.resolve() : Promise.reject(new Error('需要 1–20 个空')) }]}>
      {(fields, { add, remove }, { errors }) => <>{fields.map((f, i) => <Space key={f.key} align="baseline"><Form.Item name={f.name} label={`第 ${i + 1} 空可接受答案（每行一个）`} rules={[{ required: true, whitespace: true }]}><Input.TextArea placeholder="忽略首尾空格，大小写与标点严格匹配" /></Form.Item><Button danger onClick={() => remove(f.name)}>移除</Button></Space>)}<Button onClick={() => add('')}>添加一个空</Button><Form.ErrorList errors={errors} /></>}
    </Form.List>}
    {type === 'short_answer' && <Form.Item name="answer" label="参考答案（不自动判对错，提交即完成）" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={4} /></Form.Item>}
    <Form.Item name="explanation" label="答案详解" rules={[{ required: true, whitespace: true, message: '请填写答案详解' }]}><Input.TextArea rows={4} maxLength={5000} /></Form.Item>
  </>;
}
