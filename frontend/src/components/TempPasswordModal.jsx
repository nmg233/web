import { Alert, Button, Descriptions, Modal, Typography } from 'antd';

export default function TempPasswordModal({ result, title = '账号已创建', onClose }) {
  return (
    <Modal title={title} open={!!result} onCancel={onClose} destroyOnHidden
      footer={<Button type="primary" onClick={onClose}>已记录，关闭</Button>}>
      {result && <>
        <Alert type="success" showIcon title="请记录并线下告知用户"
          description="临时密码仅在本次结果中展示，关闭后无法再次查询；遗失可重新重置。用户首次登录必须修改密码。" />
        <Descriptions column={1} style={{ marginTop: 20 }}>
          <Descriptions.Item label="姓名">{result.real_name}</Descriptions.Item>
          <Descriptions.Item label="登录账号"><Typography.Text copyable>{result.username}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="临时密码"><Typography.Text copyable>{result.temp_password}</Typography.Text></Descriptions.Item>
        </Descriptions>
      </>}
    </Modal>
  );
}
