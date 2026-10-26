import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import {
  ArrowRightOutlined,
  BookOutlined,
  CheckOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import type { User } from '../lib/types';

export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, setUser, passwordChanged, setPasswordChanged } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submitting=useRef(false);
  const [error, setError] = useState('');
  const candidate = (location.state as { from?: string } | null)?.from;
  const destination =
    candidate?.startsWith('/') &&
    !candidate.startsWith('//') &&
    !candidate.startsWith('/dang-nhap') &&
    !candidate.startsWith('/dang-ky')
      ? candidate
      : '/tai-khoan';
  if (user)
    return (
      <Navigate to={user.cms_access ? '/quan-tri' : destination} replace />
    );
  async function submit(values: {
    name?: string;
    email: string;
    password: string;
  }) {
    if(submitting.current) return;
    submitting.current=true;
    setBusy(true);
    setError('');
    try {
      if (register)
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(values),
        });
      const data = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });
      setUser(data.user);
      setPasswordChanged(false);
      navigate(data.user.cms_access ? '/quan-tri' : destination, {
        replace: true,
      });
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      submitting.current=false;
      setBusy(false);
    }
  }
  return (
    <div className="container auth-page">
      <section className="auth-story">
        <BookOutlined className="auth-book-icon" />
        <h2>
          Sách cũ.
          <br />
          Kết nối mới.
        </h2>
        <p>
          Tìm lại cuốn sách bạn thích.
          <br />
          Trao lại cuốn sách bạn yêu.
        </p>
        <ul>
          <li>
            <CheckOutlined /> Mua bán trực tiếp với người bán
          </li>
          <li>
            <CheckOutlined /> Thông tin liên hệ được bảo vệ
          </li>
          <li>
            <CheckOutlined /> Đăng tin sau khi được xét duyệt
          </li>
        </ul>
        <Link to="/kham-pha">
          Dạo một vòng chợ sách <ArrowRightOutlined />
        </Link>
      </section>
      <section
        className="auth-form-panel"
        key={register ? 'register' : 'login'}
      >
        <Link to="/" className="back-link">
          ← Về trang chủ
        </Link>
        <h1>{register ? 'Tạo tài khoản' : 'Chào bạn trở lại'}</h1>
        <p className="page-subtitle">
          {register
            ? 'Bắt đầu hành trình mua bán sách của bạn.'
            : 'Đăng nhập để liên hệ người bán và quản lý tin đăng.'}
        </p>
        {!register && passwordChanged && <Alert type="success" closable onClose={() => setPasswordChanged(false)} message="Đã đổi mật khẩu và đăng xuất toàn bộ thiết bị. Vui lòng đăng nhập bằng mật khẩu mới." />}
        {error && <Alert type="error" showIcon message={error} />}
        <Form
          layout="vertical"
          onFinish={submit}
          disabled={busy}
          requiredMark={false}
          size="large"
        >
          {register && (
            <Form.Item
              name="name"
              label="Tên hiển thị"
              rules={[
                {
                  required: true,
                  min: 2,
                  max: 100,
                  whitespace: true,
                  message: 'Nhập tên từ 2 đến 100 ký tự.',
                },
              ]}
            >
              <Input autoComplete="name" placeholder="Tên của bạn" />
            </Form.Item>
          )}
          <Form.Item
            name="email"
            label="Email"
            rules={[
              {
                required: true,
                type: 'email',
                message: 'Vui lòng nhập email hợp lệ.',
              },
            ]}
          >
            <Input autoComplete="email" placeholder="Địa chỉ email của bạn" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[
              {
                required: true,
                min: 10,
                max: 128,
                message: 'Mật khẩu cần từ 10 đến 128 ký tự.',
              },
            ]}
            extra={
              register
                ? 'Dùng ít nhất 10 ký tự và không dùng lại mật khẩu ở nơi khác.'
                : undefined
            }
          >
            <Input.Password
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder={register ? 'Tạo mật khẩu của bạn' : 'Nhập mật khẩu'}
            />
          </Form.Item>
          {register && (
            <p className="form-legal">
              Khi đăng ký, bạn đồng ý giữ thông tin tin đăng trung thực và tôn
              trọng <Link to="/quyen-rieng-tu">quyền riêng tư</Link> của cộng
              đồng.
            </p>
          )}
          <Button type="primary" htmlType="submit" block loading={busy}>
            {register ? 'Tạo tài khoản' : 'Đăng nhập'} <ArrowRightOutlined />
          </Button>
        </Form>
        <p className="auth-switch">
          {register ? 'Đã có tài khoản?' : 'Bạn chưa có tài khoản?'}{' '}
          <Link
            to={register ? '/dang-nhap' : '/dang-ky'}
            state={{ from: destination }}
          >
            {register ? 'Đăng nhập' : 'Đăng ký miễn phí'}
          </Link>
        </p>
        <div className="security-note">
          <LockOutlined /> Mật khẩu được băm an toàn, không lưu dạng văn bản.
        </div>
      </section>
    </div>
  );
}
