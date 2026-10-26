import { lazy } from 'react';
import DeferredRoute from './components/RoutePending';
import NavigationBehavior from './components/NavigationBehavior';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Button, Result } from 'antd';
import Shell from './components/Shell';
import { AuthProvider, RequireAuth } from './lib/auth';
import { SavedProvider } from './lib/saved';
import {
  HomePage,
  BookPage,
  SavedPage,
  SellerPage,
  InfoPage,
} from './pages/CatalogPages';
import { CategoriesProvider } from './lib/categories';
const BrowsePage = lazy(() => import('./pages/BrowsePage'));
const CmsRoutes = lazy(() => import('./pages/CmsRoutes'));
const AuthPage = lazy(() => import('./pages/AuthPages').then(module => ({default:module.AuthPage})));
const AccountPage = lazy(() => import('./pages/AccountPages').then(module => ({default:module.AccountPage})));
const MyListingsPage = lazy(() => import('./pages/AccountPages').then(module => ({default:module.MyListingsPage})));
const NewListingPage = lazy(() => import('./pages/AccountPages').then(module => ({default:module.NewListingPage})));

export default function App() {
  return (
    <BrowserRouter>
      <NavigationBehavior />
      <AuthProvider>
        <CategoriesProvider>
          <SavedProvider>
            <Routes>
              <Route path="quan-tri/*" element={<DeferredRoute><CmsRoutes /></DeferredRoute>} />
              <Route element={<Shell />}>
                <Route index element={<HomePage />} />
                <Route path="kham-pha" element={<DeferredRoute><BrowsePage /></DeferredRoute>} />
                <Route path="sach/:id" element={<BookPage />} />
                <Route path="nguoi-ban/:id" element={<SellerPage />} />
                <Route path="da-luu" element={<SavedPage />} />
                <Route path="dang-nhap" element={<DeferredRoute><AuthPage /></DeferredRoute>} />
                <Route path="dang-ky" element={<DeferredRoute><AuthPage register /></DeferredRoute>} />
                <Route
                  path="tai-khoan"
                  element={
                    <RequireAuth>
                      <DeferredRoute><AccountPage /></DeferredRoute>
                    </RequireAuth>
                  }
                />
                <Route
                  path="dang-tin"
                  element={
                    <RequireAuth seller>
                      <DeferredRoute><NewListingPage key="new" /></DeferredRoute>
                    </RequireAuth>
                  }
                />
                <Route
                  path="tin-cua-toi"
                  element={
                    <RequireAuth seller>
                      <DeferredRoute><MyListingsPage /></DeferredRoute>
                    </RequireAuth>
                  }
                />
                <Route
                  path="tin-cua-toi/:id/sua"
                  element={
                    <RequireAuth seller>
                      <DeferredRoute><NewListingPage key="edit" editing /></DeferredRoute>
                    </RequireAuth>
                  }
                />
                <Route path="huong-dan" element={<InfoPage />} />
                <Route path="an-toan" element={<InfoPage />} />
                <Route path="quyen-rieng-tu" element={<InfoPage />} />
                <Route
                  path="*"
                  element={
                    <Result
                      status="404"
                      title="Không tìm thấy trang"
                      subTitle="Đường dẫn có thể đã thay đổi. Mời bạn quay lại khám phá sách."
                      extra={
                        <Link to="/kham-pha">
                          <Button type="primary">Khám phá sách</Button>
                        </Link>
                      }
                    />
                  }
                />
              </Route>
            </Routes>
          </SavedProvider>
        </CategoriesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
