import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Button, Result } from 'antd';
import AdminLayout, { AdminAccess, AdminLogin } from '../components/AdminLayout';
import AdminPage from './AdminPage';
import CmsCrudPage from './CmsCrudPage';
import CmsReportsPage from './CmsReportsPage';
import CmsProfilePage from './CmsProfilePage';

export default function CmsRoutes() {
  return <Routes>
    <Route path="dang-nhap" element={<AdminLogin />} />
    <Route element={<AdminAccess><AdminLayout /></AdminAccess>}>
      <Route index element={<AdminPage />} />
      <Route path="nguoi-ban" element={<AdminPage />} />
      <Route path="ho-so" element={<CmsProfilePage />} />
      <Route path="bao-mat" element={<Navigate to="/quan-tri/ho-so#bao-mat" replace />} />
      <Route path="bao-cao" element={<CmsReportsPage />} />
      <Route path="tin-dang" element={<CmsCrudPage resource="listings" />} />
      <Route path="tai-khoan" element={<CmsCrudPage resource="users" />} />
      <Route path="danh-muc" element={<CmsCrudPage resource="categories" />} />
      <Route path="phan-quyen" element={<CmsCrudPage resource="roles" />} />
      <Route path="nhat-ky" element={<CmsCrudPage resource="audit" />} />
      <Route path="*" element={<Result status="404" title="Không tìm thấy trang quản trị" extra={<Link to="/quan-tri"><Button>Về tổng quan CMS</Button></Link>} />} />
    </Route>
  </Routes>;
}
