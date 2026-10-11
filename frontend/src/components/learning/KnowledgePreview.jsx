import { Alert, Card, Empty, List, Space, Tag, Typography } from 'antd';
import MarkdownContent from '../common/MarkdownContent';

const types = { single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题', fill_blank: '填空题', short_answer: '简答题' };

export default function KnowledgePreview({ cards = [] }) {
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="只读预览" description="可查看已发布的知识卡片和练习；标准答案与解析不展示。" />
    {!cards.length && <Empty description="暂无已发布的知识卡片" />}
    {cards.map((card) => <Card key={card.id} title={card.title}>
      {card.summary && <Typography.Paragraph type="secondary">{card.summary}</Typography.Paragraph>}
      <MarkdownContent>{card.content}</MarkdownContent>
      <List dataSource={card.exercises || []} locale={{ emptyText: '暂无配套练习' }} renderItem={(exercise, index) => <List.Item>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space><Tag>{types[exercise.question_type] || exercise.question_type}</Tag><Typography.Text>{exercise.points} 分</Typography.Text></Space>
          <Typography.Text strong>{index + 1}. {exercise.prompt}</Typography.Text>
          {(exercise.options || []).map((option, i) => <Typography.Text key={i}>{typeof option === 'object' ? (option.label ?? option.text) : option}</Typography.Text>)}
        </Space>
      </List.Item>} />
    </Card>)}
  </Space>;
}
