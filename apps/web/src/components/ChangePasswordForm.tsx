import { useState } from 'react';
import { Alert, Button, Form, Input, Modal } from 'antd';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

export function ChangePasswordForm() {
  const { setUser, setPasswordChanged } = useAuth();
  const [form] = Form.useForm();
  const [modal, holder] = Modal.useModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(values: Record<string, string>) {
    setBusy(true); setError('');
    try {
      await api('/auth/change-password', {method:'POST',body:JSON.stringify(values)});
      form.resetFields();
      setPasswordChanged(true);
      setUser(null);
      // The route guard performs the single redirect to the appropriate login.
    } catch(issue) {setError(errorMessage(issue));}
    finally {setBusy(false);}
  }
  return <>
    {holder}
    {error && <Alert type="error" showIcon message={error} />}
    <Form form={form} layout="vertical" disabled={busy} requiredMark={false} onFinish={values => {
      modal.confirm({title:'Đổi mật khẩu và đăng xuất tất cả thiết bị?',content:'Bạn sẽ cần đăng nhập lại bằng mật khẩu mới trên mọi thiết bị, kể cả thiết bị này.',okText:'Đổi mật khẩu',cancelText:'Hủy',onOk:()=>save(values)});
    }}>
      <Form.Item name="current_password" label="Mật khẩu hiện tại" rules={[{required:true,max:128,message:'Nhập mật khẩu hiện tại.'}]}>
        <Input.Password autoComplete="current-password" maxLength={128} />
      </Form.Item>
      <Form.Item name="new_password" label="Mật khẩu mới" dependencies={['current_password']} rules={[
        {required:true,min:10,max:128,message:'Mật khẩu mới cần từ 10 đến 128 ký tự.'},
        ({getFieldValue})=>({validator:(_,value)=>!value || value!==getFieldValue('current_password') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu mới phải khác mật khẩu hiện tại.'))}),
      ]}>
        <Input.Password autoComplete="new-password" maxLength={128} />
      </Form.Item>
      <Form.Item name="confirm_password" label="Xác nhận mật khẩu mới" dependencies={['new_password']} rules={[
        {required:true,message:'Nhập lại mật khẩu mới.'},
        ({getFieldValue})=>({validator:(_,value)=>!value || value===getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận chưa khớp.'))}),
      ]}>
        <Input.Password autoComplete="new-password" maxLength={128} />
      </Form.Item>
      <p>Sau khi đổi mật khẩu, toàn bộ thiết bị sẽ được đăng xuất. Tối đa 5 lần thử trong 15 phút.</p>
      <Button type="primary" htmlType="submit" loading={busy}>Đổi mật khẩu</Button>
    </Form>
  </>;
}
