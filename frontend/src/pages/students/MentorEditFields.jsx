import {Form,Input} from 'antd';

// Mentor identity has no school/class/assigned teacher/assigned mentor fields.
export default function MentorEditFields(){
 return <>
  <Form.Item name="role" initialValue="academic_mentor" hidden><Input/></Form.Item>
  <Form.Item name="real_name" label="导师姓名" rules={[{required:true,whitespace:true}]}><Input maxLength={80}/></Form.Item>
  <Form.Item name="email" label="联系邮箱" rules={[{type:'email'}]}><Input maxLength={200}/></Form.Item>
  <Form.Item name="phone" label="联系电话"><Input maxLength={30}/></Form.Item>
  <Form.Item name="profile" label="导师简介"><Input.TextArea rows={4} maxLength={2000}/></Form.Item>
  <p>课程管理权限在下方“管理的总课题”中单独分配，不由个人资料或授课安排自动授予。修改姓名不更改原用户名和现有密码。</p>
 </>;
}
