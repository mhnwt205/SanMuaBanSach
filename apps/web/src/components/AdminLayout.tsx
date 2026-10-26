import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  Alert,
  Avatar,
  Button,
  Drawer,
  Form,
  Input,
  Result,
  Spin,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyOutlined,
  ShopOutlined,
  TeamOutlined,
  TagsOutlined,
  LockOutlined,
  HistoryOutlined,
  FlagOutlined,
  UserOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import { hasPermission, type User } from '../lib/types';
import type { CmsLayoutContext, CmsSummary } from '../lib/cms';

const sections = [
  { path: '/quan-tri', title: 'Tổng quan', icon: <DashboardOutlined /> },
  { path: '/quan-tri/ho-so', title: 'Hồ sơ quản trị', icon: <UserOutlined /> },
  {
    path: '/quan-tri/nguoi-ban',
    title: 'Duyệt người bán',
    permission: 'sellers.view',
    icon: <ShopOutlined />,
  },
  {
    path: '/quan-tri/tin-dang',
    title: 'Tin đăng / sách',
    permission: 'listings.view',
    icon: <FileTextOutlined />,
  },
  {
    path: '/quan-tri/tai-khoan',
    title: 'Tài khoản',
    icon: <TeamOutlined />,
    permission: 'users.view',
  },
  {
    path: '/quan-tri/danh-muc',
    title: 'Danh mục sách',
    icon: <TagsOutlined />,
    permission: 'categories.view',
  },
  {
    path: '/quan-tri/phan-quyen',
    title: 'Role và phân quyền',
    icon: <LockOutlined />,
    permission: 'roles.view',
  },
  { path: '/quan-tri/bao-cao', title: 'Báo cáo vi phạm', permission: 'reports.view', icon: <FlagOutlined /> },
  {
    path: '/quan-tri/nhat-ky',
    title: 'Nhật ký quản trị',
    icon: <HistoryOutlined />,
    permission: 'audit.view',
  },
];
function AdminDenied() {
  const { logout } = useAuth();
  const [error, setError] = useState('');
  return (
    <div className="cms-access">
      <Result
        status="403"
        title="Tài khoản chưa có quyền quản trị"
        subTitle="Chỉ tài khoản được cấp quyền quản trị mới được vào CMS."
        extra={
          <>
            <Link to="/">
              <Button>Về website</Button>
            </Link>{' '}
            <Button
              onClick={() => {
                void logout().catch((issue) => setError(errorMessage(issue)));
              }}
            >
              Đổi tài khoản
            </Button>
          </>
        }
      />
      {error && <Alert type="error" message={error} />}
    </div>
  );
}
export function AdminAccess({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="cms-access">
        <Spin />
        <p>Đang kiểm tra quyền quản trị…</p>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/quan-tri/dang-nhap"
        replace
        state={{ from: location.pathname }}
      />
    );
  if (!user.cms_access) return <AdminDenied />;
  return children;
}
export function AdminLogin() {
  const { user, loading, setUser, passwordChanged, setPasswordChanged } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const destination = '/quan-tri';
  if (loading)
    return (
      <div className="cms-access">
        <Spin />
      </div>
    );
  if (user)
    return user.cms_access ? (
      <Navigate to={destination} replace />
    ) : (
      <AdminDenied />
    );
  async function submit(values: { email: string; password: string }) {
    setBusy(true);
    setError('');
    try {
      const data = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setUser(data.user);
      setPasswordChanged(false);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cms-login">
      <div className="cms-login-panel">
        <div className="cms-wordmark">
          <BookOutlined />
          <span>
            Chợ Sách Cũ <small>Hệ thống quản trị nội dung</small>
          </span>
        </div>
        <h1>Đăng nhập quản trị</h1>
        <p>
          Dành cho quản trị viên xét duyệt người bán và nội dung của chợ sách.
        </p>
        {passwordChanged && <Alert type="success" closable onClose={() => setPasswordChanged(false)} message="Đã đổi mật khẩu và đăng xuất toàn bộ thiết bị. Vui lòng đăng nhập bằng mật khẩu mới." />}
        {error && <Alert type="error" showIcon message={error} />}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item
            name="email"
            label="Email quản trị"
            rules={[
              { required: true, type: 'email', message: 'Nhập email hợp lệ.' },
            ]}
          >
            <Input autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Nhập mật khẩu của bạn.' }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button
            type="primary"
            block
            htmlType="submit"
            size="large"
            loading={busy}
          >
            Đăng nhập CMS
          </Button>
        </Form>
        <p className="cms-login-note">
          <SafetyOutlined /> Quyền quản trị được kiểm tra trên máy chủ.
        </p>
        <Link to="/" className="cms-return">
          <ArrowLeftOutlined /> Về website chợ sách
        </Link>
      </div>
    </div>
  );
}
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<CmsSummary>({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [notice, holder] = message.useMessage();
  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await api<CmsSummary>('/admin/summary'));
    } catch {
      // A temporary network failure should not break CMS navigation.
    } finally {
      setSummaryLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshSummary();
    const timer = window.setInterval(() => void refreshSummary(), 60_000);
    const onFocus = () => void refreshSummary();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [location.pathname, refreshSummary, user?.id]);
  const current =
    sections.find((item) => item.path === location.pathname)?.title ??
    'Quản trị';
  const navigation = (
    <nav className="cms-navigation" aria-label="Điều hướng CMS">
      {[
        {label:'Không gian làm việc',paths:['/quan-tri','/quan-tri/tin-dang','/quan-tri/nguoi-ban','/quan-tri/bao-cao']},
        {label:'Quản lý hệ thống',paths:['/quan-tri/danh-muc','/quan-tri/tai-khoan','/quan-tri/phan-quyen','/quan-tri/nhat-ky']},
        {label:'Cá nhân',paths:['/quan-tri/ho-so']},
      ].map(group => {
        const items=group.paths.map(path=>sections.find(item=>item.path===path)!).filter(item=>!('permission' in item) || hasPermission(user,item.permission!));
        return items.length>0 && <div className="cms-nav-group" key={group.label}><p className="cms-nav-label">{group.label}</p>{items.map(item=>{
          const count = item.path === '/quan-tri/nguoi-ban' ? summary.sellers : item.path === '/quan-tri/tin-dang' ? summary.listings : item.path === '/quan-tri/bao-cao' ? summary.reports : undefined;
          return <NavLink key={item.path} to={item.path} end={item.path==='/quan-tri'} onClick={()=>setMenuOpen(false)}>{item.icon}<span>{item.title}</span>{Boolean(count) && <span className="cms-nav-count" aria-label={`${count} mục đang chờ`}>{count! > 99 ? '99+' : count}</span>}</NavLink>;
        })}</div>;
      })}
    </nav>
  );
  async function signOut() {
    setBusy(true);
    try {
      await logout();
      navigate('/quan-tri/dang-nhap', { replace: true });
    } catch (issue) {
      notice.error(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cms-layout cms-redesign">
      {holder}
      <aside className="cms-sidebar">
        <Link to="/quan-tri" className="cms-wordmark">
          <BookOutlined />
          <span>
            Chợ Sách Cũ<small>Không gian quản trị</small>
          </span>
        </Link>
        {navigation}
        <div className="cms-sidebar-bottom">
          <Link to="/quan-tri/ho-so" className="cms-account-link"><Avatar size={36}>{user?.name.slice(0,1)}</Avatar><span><strong>{user?.name}</strong><small>{user?.is_super_admin ? 'Super Admin' : 'Nhân sự quản trị'}</small></span></Link>
          <Link to="/" target="_blank" rel="noopener noreferrer">
            <ArrowLeftOutlined /> Mở website mua bán
          </Link>
          <span>
            <SafetyOutlined /> Phân quyền theo tài khoản
          </span>
        </div>
      </aside>
      <div className="cms-workspace">
        <header className="cms-topbar">
          <div>
            <Button
              className="cms-menu-toggle"
              aria-label="Mở menu quản trị"
              icon={<MenuOutlined />}
              onClick={() => setMenuOpen(true)}
            />
            <span className="cms-breadcrumb">
              CMS <span>/</span> {current}
            </span>
          </div>
          <div className="cms-session">
            <Link to="/" target="_blank" rel="noopener noreferrer" className="cms-visit">Xem website <ArrowUpOutlined rotate={45} /></Link>
            <Link to="/quan-tri/ho-so" className="cms-profile-link" aria-label="Mở hồ sơ quản trị"><Avatar size={32}>{user?.name.slice(0,1)}</Avatar><span>Hồ sơ</span></Link>
            <Button
              icon={<LogoutOutlined />}
              loading={busy}
              onClick={() => void signOut()}
              aria-label="Đăng xuất CMS"
            >
              Đăng xuất
            </Button>
          </div>
        </header>
        <main className="cms-content">
          <Outlet context={{ summary, summaryLoading, refreshSummary } satisfies CmsLayoutContext} />
        </main>
      </div>
      <Drawer
        title="Quản trị Chợ Sách Cũ"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        width={290}
      >
        {navigation}
        <Link to="/" className="cms-return">
          Về website mua bán
        </Link>
      </Drawer>
    </div>
  );
}
