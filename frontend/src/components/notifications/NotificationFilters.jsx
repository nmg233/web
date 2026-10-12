import {copyText as siteText} from "../../content/copy";
import { Select, Space } from 'antd';
import {
  notificationCategoryOptions,
  notificationLevelOptions,
  notificationReadOptions,
} from '../../constants/notification';

export default function NotificationFilters({ value, onChange }) {
  const update = (key, nextValue) => onChange({ ...value, [key]: nextValue, page: 1 });

  return (
    <Space wrap>
      <Select
        allowClear
        placeholder={siteText("site.7c191691d853b210")} aria-label={siteText("site.7c191691d853b210")}
        value={value.read}
        options={notificationReadOptions}
        onChange={(read) => update('read', read)}
        style={{ width: 130 }}
      />
      <Select
        allowClear
        placeholder={siteText("site.3b8d1245d0ec36bd")} aria-label={siteText("site.3b8d1245d0ec36bd")}
        value={value.category}
        options={notificationCategoryOptions}
        onChange={(category) => update('category', category)}
        style={{ width: 140 }}
      />
      <Select
        allowClear
        placeholder={siteText("site.2a077b850aea3fa3")} aria-label={siteText("site.2a077b850aea3fa3")}
        value={value.level}
        options={notificationLevelOptions}
        onChange={(level) => update('level', level)}
        style={{ width: 130 }}
      />
    </Space>
  );
}
