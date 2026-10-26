import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { api, ApiError } from './api';
import type { User } from './types';

type AuthState = {
  user: User | null;
  loading: boolean;
  imageUploads: boolean;
  passwordChanged: boolean;
  setPasswordChanged: (value: boolean) => void;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const Auth = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUploads, setImageUploads] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ user: User }>('/auth/me')
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          console.warn('Session lookup unavailable');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    api<{ image_uploads: boolean }>('/capabilities')
      .then((data) => {
        if (active) setImageUploads(data.image_uploads);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    try {
      const data = await api<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else throw error;
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setUser(null);
  }
  return (
    <Auth.Provider
      value={{ user, loading, imageUploads, setUser, logout, refresh, passwordChanged, setPasswordChanged }}
    >
      {children}
    </Auth.Provider>
  );
}
export function useAuth() {
  const state = useContext(Auth);
  if (!state) throw new Error('AuthProvider is required');
  return state;
}
export function RequireAuth({
  children,
  seller = false,
  admin = false,
}: {
  children: ReactNode;
  seller?: boolean;
  admin?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (seller && user?.role === 'user') window.scrollTo(0, 0);
  }, [seller, user?.role, location.pathname]);
  if (loading)
    return (
      <div className="page-loading">
        <Spin size="large" />
        <p>Đang kiểm tra phiên đăng nhập…</p>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/dang-nhap"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  if (admin && user.role !== 'admin')
    return <Navigate to="/tai-khoan" replace />;
  if (seller && user.role === 'user')
    return (
      <div className="container">
        <Result status="info" title="Bạn chưa có quyền đăng tin"
          subTitle="Để đăng bán sách, bạn cần đăng ký người bán và được Admin phê duyệt. Nếu đã gửi yêu cầu, hãy kiểm tra trạng thái xét duyệt."
          extra={[
            <Link key="seller" to="/tai-khoan#nguoi-ban"><Button type="primary">Đăng ký hoặc kiểm tra người bán</Button></Link>,
            <Link key="browse" to="/kham-pha"><Button>Tiếp tục tìm sách</Button></Link>,
          ]} />
      </div>
    );
  return children;
}
