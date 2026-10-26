import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { Avatar, Button, Drawer, Dropdown, Input, message } from 'antd';
import {
  ArrowRightOutlined,
  BookOutlined,
  DownOutlined,
  HeartOutlined,
  HomeOutlined,
  MenuOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { useCategories } from '../lib/categories';
import { errorMessage } from '../lib/api';

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Chợ Sách Cũ - Trang chủ">
      <span className="brand-symbol">
        <BookOutlined />
      </span>
      <span>
        chợ sách cũ<small>Sách hay, sang tay</small>
      </span>
    </Link>
  );
}

export default function Shell() {
  const { categories } = useCategories();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, holder] = message.useMessage();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);
  const find = () => {
    const next = new URLSearchParams(location.pathname === '/kham-pha' ? params : undefined);
    next.delete('page');
    if(query.trim()) next.set('q',query.trim().slice(0,100));else next.delete('q');
    navigate(`/kham-pha${next.size ? `?${next}` : ''}`);
  };
  async function signOut() {
    try {
      await logout();
      setMobileOpen(false);
      navigate('/');
      notice.success('Đã đăng xuất');
    } catch (error) {
      notice.error(errorMessage(error));
    }
  }
  const accountMenu = {
    items: [
      { key: 'profile', label: <Link to="/tai-khoan">Tài khoản của tôi</Link> },
      ...(user?.role !== 'user'
        ? [
            {
              key: 'listings',
              label: <Link to="/tin-cua-toi">Tin đăng của tôi</Link>,
            },
          ]
        : []),
      ...(user?.cms_access
        ? [{ key: 'admin', label: <Link to="/quan-tri">Quản trị</Link> }]
        : []),
      { key: 'logout', label: 'Đăng xuất', onClick: () => void signOut() },
    ],
  };
  return (
    <>
      {holder}
      <a className="skip-link" href="#noi-dung" onClick={event => {event.preventDefault();const main=document.getElementById('noi-dung');main?.focus({preventScroll:true});main?.scrollIntoView({block:'start'});}}>Chuyển đến nội dung chính</a>
      <div className="site-topline">
        <div className="container">
          <span className="topline-promise"><strong>Đăng tin miễn phí</strong><span>·</span> Sách giấy cũ tìm người đọc mới</span>
          <Link to="/huong-dan">
            Giao dịch trực tiếp, chủ động và an toàn <ArrowRightOutlined />
          </Link>
        </div>
      </div>
      <header className="site-header">
        <div className="container header-row">
          <Brand />
          <div className="global-search">
            <SearchOutlined />
            <Input
              aria-label="Tìm sách"
              placeholder="Tìm tên sách, tác giả, giáo trình…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={find}
            />
            <Button type="text" onClick={find} aria-label="Tìm kiếm">
              <ArrowRightOutlined />
            </Button>
          </div>
          <div className="header-actions">
            <Link to="/da-luu" className="header-link">
              <HeartOutlined />
              <span>Đã lưu</span>
            </Link>
            {user ? (
              <Dropdown menu={accountMenu} trigger={['click']}>
                <button className="account-trigger">
                  <Avatar size={30}>{user.name.slice(0, 1)}</Avatar>
                  <span>{user.name}</span>
                  <DownOutlined />
                </button>
              </Dropdown>
            ) : (
              <Link className="header-link" to="/dang-nhap">
                <UserOutlined />
                <span>Đăng nhập</span>
              </Link>
            )}
            <Link to="/dang-tin">
              <Button className="post-button" icon={<PlusOutlined />}>
                Đăng tin miễn phí
              </Button>
            </Link>
          </div>
          <Button
            className="mobile-menu-toggle"
            aria-label="Mở menu"
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
          />
        </div>
        <div className="category-nav">
          <div className="container">
            <NavLink to="/kham-pha">
              <MenuOutlined /> Tất cả sách
            </NavLink>
            {categories.map((category) => (
              <Link
                key={category}
                to={`/kham-pha?category=${encodeURIComponent(category)}`}
              >
                {category}
              </Link>
            ))}
            <Link to="/huong-dan" className="nav-last">
              Hướng dẫn mua bán
            </Link>
          </div>
        </div>
      </header>
      <Drawer
        title={<Brand />}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        width={320}
      >
        <nav className="drawer-nav">
          <Link to="/kham-pha" onClick={() => setMobileOpen(false)}>
            Khám phá sách
          </Link>
          <Link to="/da-luu" onClick={() => setMobileOpen(false)}>
            Sách đã lưu
          </Link>
          {user ? (
            <>
              <p className="drawer-user">
                {user.name}
                <small>{user.email}</small>
              </p>
              <Link to="/tai-khoan">Tài khoản của tôi</Link>
              {user.role !== 'user' && (
                <Link to="/tin-cua-toi">Tin đăng của tôi</Link>
              )}
              {user.cms_access && <Link to="/quan-tri">Quản trị</Link>}
              <Button onClick={() => void signOut()}>Đăng xuất</Button>
            </>
          ) : (
            <Link to="/dang-nhap">Đăng nhập / Đăng ký</Link>
          )}
          <Link to="/dang-tin">
            <Button type="primary" block icon={<PlusOutlined />}>
              Đăng tin miễn phí
            </Button>
          </Link>
        </nav>
      </Drawer>
      <main className="site-main" id="noi-dung" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Brand />
            <p>
              Một cuốn sách đã đọc.
              <br />
              Một người bạn đang cần.
            </p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <Link to="/kham-pha">Tìm sách cũ</Link>
            <Link to="/da-luu">Sách đã lưu</Link>
            <Link to="/dang-tin">Đăng bán sách</Link>
          </div>
          <div>
            <h3>Đồng hành cùng bạn</h3>
            <Link to="/huong-dan">Hướng dẫn mua bán</Link>
            <Link to="/an-toan">Giao dịch an toàn</Link>
            <Link to="/quyen-rieng-tu">Quyền riêng tư</Link>
          </div>
          <div className="footer-note">
            <h3>Giao dịch trực tiếp</h3>
            <p>
              Người mua và người bán tự liên hệ, thỏa thuận thanh toán và giao
              nhận. Website chưa thu tiền giao dịch.
            </p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Chợ Sách Cũ</span>
          <span>Đăng tin miễn phí trong giai đoạn ra mắt</span>
        </div>
      </footer>
      <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
        <NavLink to="/" end>
          <HomeOutlined />
          <span>Trang chủ</span>
        </NavLink>
        <NavLink to="/kham-pha">
          <SearchOutlined />
          <span>Khám phá</span>
        </NavLink>
        <NavLink to="/dang-tin">
          <PlusOutlined />
          <span>Đăng tin</span>
        </NavLink>
        <NavLink to="/da-luu">
          <HeartOutlined />
          <span>Đã lưu</span>
        </NavLink>
        <NavLink to="/tai-khoan">
          <UserOutlined />
          <span>Tài khoản</span>
        </NavLink>
      </nav>
    </>
  );
}
