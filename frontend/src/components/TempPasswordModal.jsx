import { Alert, Button, Descriptions, Modal, Typography } from 'antd';

export default function TempPasswordModal({ result, title = '账号已创建', onClose }) {
  return (
    <Modal title={title} open={!!result} onCancel={onClose} destroyOnHidden
      footer={<Button type="primary" onClick={onClose}>已记录，关闭</Button>}>
      {result && <>
        <Alert type="success" showIcon title="请记录并线下告知用户"
          description="初始/重置密码为姓名拼音@123，容易被猜到，请尽快线下交付并首次改密。单个操作结果关闭后可重置；批量操作可从批次历史恢复有效凭据。" />
        <Descriptions column={1} style={{ marginTop: 20 }}>
          <Descriptions.Item label="姓名">{result.real_name}</Descriptions.Item>
          <Descriptions.Item label="登录账号"><Typography.Text copyable>{result.username}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="临时密码"><Typography.Text copyable>{result.temp_password}</Typography.Text></Descriptions.Item>
        </Descriptions>
      </>}
    </Modal>
  );
}
