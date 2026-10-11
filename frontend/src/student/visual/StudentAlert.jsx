import { Alert } from 'antd';
import { displayText } from '../../content/displayText';
export default function StudentAlert({title,description,message,...props}){
  return <Alert {...props} title={typeof title==='string'?displayText(title):title} description={typeof description==='string'?displayText(description):description} message={typeof message==='string'?displayText(message):message}/>;
}
