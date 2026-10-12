import {copyText as siteText} from "../content/copy";
import { useState } from 'react';
import { Input } from 'antd';

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return <Input {...props} type={visible ? 'text' : 'password'} suffix={
    <button type="button" className="password-toggle" aria-label={visible ? siteText("site.1e6cc8f341d3810a") : siteText("site.6526e69a6bab7374")} aria-pressed={visible}
      onClick={() => setVisible((value) => !value)}>{visible ? siteText("site.f34e87286b315ddf") : siteText("site.defbab5bb44ca369")}</button>
  } />;
}
