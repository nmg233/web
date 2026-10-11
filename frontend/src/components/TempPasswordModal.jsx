import {copyText as siteText} from "../content/copy";
import { Alert, Button, Descriptions, Modal, Typography } from 'antd';

export default function TempPasswordModal({ result, title = siteText("site.cd35f26f7c97feca"), onClose }) {
  return (
    <Modal title={title} open={!!result} onCancel={onClose} destroyOnHidden
      footer={<Button type="primary" onClick={onClose}>{siteText("site.8a37068e36c32a2a")}</Button>}>
      {result && <>
        <Alert type="success" showIcon title={siteText("site.ecd8cb4f23491fbe")}
          description={siteText("site.1d4142c41497f183")} />
        <Descriptions column={1} style={{ marginTop: 20 }}>
          <Descriptions.Item label={siteText("site.2d99e4bc0fcf95bb")}>{result.real_name}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.63077868ee46d379")}><Typography.Text copyable>{result.username}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label={siteText("site.56682f817f592b57")}><Typography.Text copyable>{result.temp_password}</Typography.Text></Descriptions.Item>
        </Descriptions>
      </>}
    </Modal>
  );
}
