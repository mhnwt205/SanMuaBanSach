import { useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { ArrowRightOutlined, ReloadOutlined, ShopOutlined, FileTextOutlined, FlagOutlined, TeamOutlined, BookOutlined } from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import { RejectionDialog } from '../components/RejectionDialog';
import { hasPermission, shortDate } from '../lib/types';
import type { CmsLayoutContext } from '../lib/cms';
import CmsActivityChart from '../components/CmsActivityChart';
type Application = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  note?: string;
  review_note?: string;
  status: string;
  created_at: string;
  reviewed_at?: string;
  reviewer?: string;
  is_locked: number;
};
const stateNames: Record<string, string> = {
  pending: 'Chờ xét duyệt',
  approved: 'Đã phê duyệt',
  rejected: 'Đã từ chối',
};
export default function AdminPage() {
  const { user } = useAuth();
  const { summary, summaryLoading, refreshSummary } = useOutletContext<CmsLayoutContext>();
  const location = useLocation();
  const [rejectOpen, setRejectOpen] = useState(false);
  const sellers = location.pathname.replace(/\/+$/, '').endsWith('/nguoi-ban');
  const can = (permission: string) => hasPermission(user, permission);
  const [items, setItems] = useState<Application[]>([]),
    [status, setStatus] = useState('pending'),
    [review, setReview] = useState<Application | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [notice, holder] = message.useMessage();
  async function load() {
    if (!sellers) {
      setError('');
      await refreshSummary();
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (can('sellers.view')) {
        const result = await api<{ items: Application[] }>(
          `/admin/seller-applications?status=${status}`,
        );
        setItems(result.items);
      }
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setReview(null);
    if (sellers) void load();
  }, [sellers, status, user?.id]);
  async function decide(approved: boolean) {
    if (!review) return;
    setBusy(true);
    try {
      await api(`/admin/seller-applications/${review.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: approved ? 'approved' : 'rejected' }),
      });
      setReview(null);
      notice.success('Đã cập nhật kết quả xét duyệt');
      await load();
      await refreshSummary();
    } catch (issue) {
      notice.error(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }
  if (sellers && !can('sellers.view'))
    return (
      <Alert
        type="warning"
        message="Bạn chưa được cấp quyền xem yêu cầu Seller."
      />
    );
  const queues = [
    {
      key: 'sellers',
      permission: 'sellers.view',
      path: 'nguoi-ban',
      name: 'Yêu cầu người bán',
      detail: 'Xét duyệt trước khi cấp quyền đăng sách.',
    },
    {
      key: 'listings',
      permission: 'listings.view',
      path: 'tin-dang',
      name: 'Tin chờ kiểm duyệt',
      detail: 'Quản lý sách, nội dung và thùng rác.',
    },
    {
      key: 'users',
      permission: 'users.view',
      path: 'tai-khoan',
      name: 'Tài khoản',
      detail: 'Quản lý hồ sơ, khóa/mở khóa và gán role.',
    },
  ].filter((item) => can(item.permission));
  const metrics = [
    { key: 'activeListings', title: 'Tin đang hiển thị', detail: 'Đang công khai', path: 'tin-dang', icon: <BookOutlined />, permission: 'listings.view' },
    { key: 'listings', title: 'Tin chờ duyệt', detail: 'Cần kiểm tra', path: 'tin-dang', icon: <FileTextOutlined />, permission: 'listings.view', urgent: true },
    { key: 'sellers', title: 'Yêu cầu Seller', detail: 'Chờ xét duyệt', path: 'nguoi-ban', icon: <ShopOutlined />, permission: 'sellers.view', urgent: true },
    { key: 'reports', title: 'Báo cáo mới', detail: 'Chờ xử lý', path: 'bao-cao', icon: <FlagOutlined />, permission: 'reports.view', urgent: true },
    { key: 'users', title: 'Tài khoản', detail: 'Tổng số tài khoản', path: 'tai-khoan', icon: <TeamOutlined />, permission: 'users.view' },
  ] as const;
  const metricValue = (key: (typeof metrics)[number]['key']) => summary[key] ?? 0;
  return (
    <div className="cms-page">
      <RejectionDialog open={rejectOpen} title="Từ chối yêu cầu Seller" onCancel={() => setRejectOpen(false)}
        onSubmit={async note => {
          if (!review) return;
          await api(`/admin/seller-applications/${review.id}/decision`, {method:'POST',body:JSON.stringify({decision:'rejected',note})});
          setRejectOpen(false); setReview(null); await load(); await refreshSummary(); notice.success('Đã từ chối và lưu lý do');
        }} />
      {holder}
      <div className="page-heading">
        <div>
          <h1>{sellers ? 'Duyệt người bán' : 'Tổng quan'}</h1>
          <p>
            {sellers
              ? 'Xem yêu cầu và giữ lại lịch sử xét duyệt Seller.'
              : `Xin chào ${user?.name}. Đây là tình hình vận hành Chợ Sách Cũ.`}
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={sellers ? loading : summaryLoading}
        >
          Làm mới
        </Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {sellers ? (
        <section className="cms-list-sheet">
          <div className="cms-crud-toolbar">
            <Select
              aria-label="Trạng thái yêu cầu Seller"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'Tất cả yêu cầu' },
                ...Object.entries(stateNames).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <span className="muted">Tối đa 100 yêu cầu mới nhất mỗi lượt</span>
          </div>
          <Table<Application>
            rowKey="id"
            dataSource={items}
            loading={loading}
            scroll={{ x: 820 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            columns={[
              { title: 'Người đăng ký', dataIndex: 'name' },
              { title: 'Email', dataIndex: 'email' },
              { title: 'Ngày gửi', dataIndex: 'created_at', render: shortDate },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                render: (value) => <Tag>{stateNames[value]}</Tag>,
              },
              {
                title: 'Thao tác',
                render: (_, item) => (
                  <Button onClick={() => setReview(item)}>Xem xét</Button>
                ),
              },
            ]}
          />
        </section>
      ) : (
        <>
          <section className="admin-summary" aria-label="Số liệu quản trị">
            {metrics.filter(item => can(item.permission)).map(item => {
              const value = metricValue(item.key);
              return <Link className={`cms-metric${'urgent' in item && item.urgent && value ? ' is-pending' : ''}`} key={item.key} to={`/quan-tri/${item.path}`}>
                <span className="cms-metric-icon">{item.icon}</span>
                <span className="cms-metric-label">{item.title}</span>
                <strong className="num">{summaryLoading ? '—' : value}</strong>
                <small>{item.detail}</small>
                <ArrowRightOutlined className="cms-metric-arrow" />
              </Link>;
            })}
          </section>
          {summary.activity && <CmsActivityChart days={summary.activity} />}
          <div className="cms-dashboard-grid"><section className="cms-overview">
            <div className="cms-panel-heading"><div><span className="cms-eyebrow">Lối tắt</span><h2>Quản lý chợ sách</h2></div></div>
            <div className="cms-queue-links">
              {[
                ...queues.filter((item) => item.key !== 'users'),
                ...(can('categories.view')
                  ? [
                      {
                        key: 'categories',
                        path: 'danh-muc',
                        name: 'Danh mục sách',
                        detail: 'Tạo, sửa và khôi phục danh mục.',
                      },
                    ]
                  : []),
                ...(can('roles.view')
                  ? [
                      {
                        key: 'roles',
                        path: 'phan-quyen',
                        name: 'Role và phân quyền',
                        detail: 'Tạo role, chọn quyền chi tiết bằng checkbox.',
                      },
                    ]
                  : []),
                ...(can('reports.view') ? [{key:'reports',path:'bao-cao',name:'Báo cáo vi phạm',detail:'Xem phản ánh và xử lý nội dung vi phạm.'}] : []),
                ...(can('audit.view')
                  ? [
                      {
                        key: 'audit',
                        path: 'nhat-ky',
                        name: 'Nhật ký quản trị',
                        detail: 'Tra cứu lịch sử thao tác, không xóa lịch sử.',
                      },
                    ]
                  : []),
              ].map((item) => (
                <Link key={item.key} to={`/quan-tri/${item.path}`}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {item.key === 'sellers' && Boolean(summary.sellers) && <Tag color="gold">{summary.sellers} chờ</Tag>}
                  {item.key === 'listings' && Boolean(summary.listings) && <Tag color="gold">{summary.listings} chờ</Tag>}
                  {item.key === 'reports' && Boolean(summary.reports) && <Tag color="gold">{summary.reports} mới</Tag>}
                  <ArrowRightOutlined />
                </Link>
              ))}
            </div>
          </section><aside className="cms-workflow"><span className="cms-eyebrow">Quy trình</span><h2>Kiểm duyệt nội dung</h2><ol><li><strong>Duyệt người bán</strong><p>Kiểm tra thông tin trước khi mở quyền đăng tin.</p></li><li><strong>Kiểm tra tin đăng</strong><p>Đối chiếu ảnh, giá và mô tả; nêu lý do khi từ chối.</p></li><li><strong>Theo dõi sau duyệt</strong><p>Xử lý báo cáo. Nội dung Seller sửa sẽ được xét duyệt lại.</p></li></ol><Link to="/quan-tri/ho-so">Hồ sơ và bảo mật <ArrowRightOutlined /></Link></aside></div>
        </>
      )}
      <Drawer
        title="Xét duyệt người bán"
        keyboard={!rejectOpen}
        open={!!review}
        onClose={() => !busy && setReview(null)}
        width={580}
        extra={
          review?.status === 'pending' &&
          can('sellers.review') &&
          !review.is_locked ? (
            <Space>
              <Button danger disabled={busy} onClick={() => setRejectOpen(true)}>
                Từ chối
              </Button>
              <Button
                type="primary"
                loading={busy}
                onClick={() => void decide(true)}
              >
                Phê duyệt
              </Button>
            </Space>
          ) : undefined
        }
      >
        {review && (
          <div>
            <h2>{review.name}</h2>
            <Descriptions
              column={1}
              style={{ marginTop: 24 }}
              items={[
                { key: 'email', label: 'Email', children: review.email },
                {
                  key: 'phone',
                  label: 'Số điện thoại',
                  children: review.phone,
                },
                {
                  key: 'note',
                  label: 'Giới thiệu',
                  children: review.note || 'Chưa bổ sung',
                },
                {
                  key: 'status',
                  label: 'Trạng thái',
                  children: stateNames[review.status],
                },
                {
                  key: 'date',
                  label: 'Ngày gửi',
                  children: shortDate(review.created_at),
                },
                {
                  key: 'reason', label: 'Lý do từ chối', children: review.status === 'rejected' ? (review.review_note || 'Chưa có lý do từ dữ liệu cũ') : '—',
                },
                {
                  key: 'reviewer',
                  label: 'Người xét duyệt',
                  children: review.reviewer || 'Chưa xét duyệt',
                },
                {
                  key: 'reviewed',
                  label: 'Ngày xét duyệt',
                  children: review.reviewed_at
                    ? shortDate(review.reviewed_at)
                    : 'Chưa xét duyệt',
                },
              ]}
            />
            {review.is_locked ? (
              <Alert
                type="warning"
                message="Tài khoản đang bị khóa, chưa thể phê duyệt."
              />
            ) : null}
          </div>
        )}
      </Drawer>
    </div>
  );
}
