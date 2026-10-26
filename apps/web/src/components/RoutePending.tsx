import { Component, Suspense, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useLocation } from 'react-router-dom';
class RouteError extends Component<{children:ReactNode},{failed:boolean}> {
  state = { failed:false };
  static getDerivedStateFromError() { return { failed:true }; }
  render() {
    if (this.state.failed) return <div className="route-pending"><Alert type="error" showIcon message="Chưa tải được trang" description="Kết nối có thể bị gián đoạn hoặc website vừa được cập nhật. Hãy tải lại để tiếp tục." action={<Button onClick={() => window.location.reload()}>Tải lại trang</Button>} /></div>;
    return this.props.children;
  }
}
export default function DeferredRoute({children}:{children:ReactNode}) {
  const location=useLocation();
  return <RouteError key={location.pathname}><Suspense fallback={<div className="route-pending" role="status" aria-live="polite"><Spin /><p>Đang tải trang…</p></div>}>{children}</Suspense></RouteError>;
}
