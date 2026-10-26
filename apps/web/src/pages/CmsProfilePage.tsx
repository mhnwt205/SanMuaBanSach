import { useState } from 'react';
import { Alert, Avatar, Button, Form, Input, Tag, message } from 'antd';
import { SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import type { User } from '../lib/types';
import { ChangePasswordForm } from '../components/ChangePasswordForm';

export default function CmsProfilePage() {
  const {user,setUser}=useAuth();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notice,holder]=message.useMessage();
  async function save(values:{name:string}) {
    setBusy(true);setError('');
    try {
      const data=await api<{user:User}>('/account',{method:'PATCH',body:JSON.stringify({name:values.name})});
      setUser(data.user);notice.success('Đã cập nhật hồ sơ');
    } catch(issue) {setError(errorMessage(issue));}
    finally {setBusy(false);}
  }
  return <div className="cms-page cms-profile">
    {holder}
    <div className="page-heading"><div><h1>Hồ sơ quản trị</h1><p>Thông tin cá nhân và bảo mật tài khoản của bạn.</p></div></div>
    <div className="cms-profile-identity"><Avatar size={56} icon={<UserOutlined />}>{user?.name.slice(0,1)}</Avatar><div><h2>{user?.name}</h2><p>{user?.email}</p></div><Tag>{user?.is_super_admin ? 'Super Admin' : 'Nhân sự quản trị'}</Tag></div>
    <section className="cms-settings-row" aria-labelledby="profile-info-title">
      <div className="cms-settings-label"><UserOutlined /><h2 id="profile-info-title">Thông tin cá nhân</h2><p>Tên hiển thị trong CMS và trên website. Email đăng nhập hiện chưa hỗ trợ thay đổi.</p></div>
      <div className="cms-settings-panel">
        {error && <Alert type="error" showIcon message={error} />}
        <Form layout="vertical" initialValues={{name:user?.name}} onFinish={save} disabled={busy} requiredMark={false}>
          <Form.Item name="name" label="Tên hiển thị" rules={[{required:true,whitespace:true,min:2,max:100,message:'Tên hiển thị cần từ 2 đến 100 ký tự.'}]}><Input maxLength={100} autoComplete="name" /></Form.Item>
          <Form.Item label="Email đăng nhập"><Input aria-label="Email đăng nhập" value={user?.email} readOnly autoComplete="email" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>Lưu hồ sơ</Button>
        </Form>
      </div>
    </section>
    <section className="cms-settings-row" id="bao-mat" aria-labelledby="profile-security-title">
      <div className="cms-settings-label"><SafetyOutlined /><h2 id="profile-security-title">Bảo mật tài khoản</h2><p>Đổi mật khẩu định kỳ để bảo vệ tài khoản. Khi đổi thành công, tất cả thiết bị sẽ được đăng xuất.</p><p>Quên mật khẩu và xác minh email sẽ bổ sung sau khi website có tên miền riêng.</p></div>
      <div className="cms-settings-panel account-sheet"><ChangePasswordForm /></div>
    </section>
    <section className="cms-settings-row"><div className="cms-settings-label"><h2>Quyền truy cập</h2><p>Quyền được cấp theo role của tài khoản.</p></div><div className="cms-settings-panel"><strong>{user?.is_super_admin ? 'Toàn quyền quản trị' : `${user?.permissions?.length ?? 0} quyền được cấp`}</strong><p>{user?.is_super_admin ? 'Bạn có thể quản lý nội dung, tài khoản và phân quyền trong CMS.' : 'Các mục quản trị hiển thị theo quyền được cấp. Liên hệ Super Admin khi cần điều chỉnh.'}</p></div></section>
  </div>;
}
