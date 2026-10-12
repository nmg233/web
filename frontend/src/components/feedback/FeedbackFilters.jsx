import {copyText as siteText} from "../../content/copy";
import { Input, Select, Space } from 'antd';
import {
  feedbackModuleOptions,
  feedbackPriorityOptions,
  feedbackStatusOptions,
  feedbackTypeOptions,
} from '../../constants/feedback';

export default function FeedbackFilters({ value, onChange, admin = false }) {
  const update = (key, nextValue) => onChange({ ...value, [key]: nextValue, page: 1 });

  return (
    <Space wrap>
      {admin && (
        <Input.Search
          allowClear
          placeholder={siteText("site.66176f6bb93e8776")} aria-label={siteText("site.66176f6bb93e8776")}
          defaultValue={value.search}
          onSearch={(search) => update('search', search)}
          style={{ width: 240 }}
        />
      )}
      <Select
        allowClear
        placeholder={siteText("site.e70c1b8c96c1ebde")} aria-label={siteText("site.e70c1b8c96c1ebde")}
        value={value.status}
        options={feedbackStatusOptions}
        onChange={(status) => update('status', status)}
        style={{ width: 140 }}
      />
      <Select
        allowClear
        placeholder={siteText("site.912f32e43c99973b")} aria-label={siteText("site.912f32e43c99973b")}
        value={value.type}
        options={feedbackTypeOptions}
        onChange={(type) => update('type', type)}
        style={{ width: 140 }}
      />
      {admin && (
        <>
          <Select
            allowClear
            placeholder={siteText("site.1638e766efec58e2")} aria-label={siteText("site.1638e766efec58e2")}
            value={value.module}
            options={feedbackModuleOptions}
            onChange={(module) => update('module', module)}
            style={{ width: 140 }}
          />
          <Select
            allowClear
            placeholder={siteText("site.5eff5a511eed98f4")} aria-label={siteText("site.5eff5a511eed98f4")}
            value={value.priority}
            options={feedbackPriorityOptions}
            onChange={(priority) => update('priority', priority)}
            style={{ width: 120 }}
          />
        </>
      )}
    </Space>
  );
}
