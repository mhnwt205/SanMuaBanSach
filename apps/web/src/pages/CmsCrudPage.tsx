import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '../lib/api';
import { ListingImagesPicker } from '../components/ListingImagesPicker';
import { RejectionDialog } from '../components/RejectionDialog';
import { PermissionPicker } from '../components/PermissionPicker';
import { useAuth } from '../lib/auth';
import { useCategories } from '../lib/categories';
import type { CmsLayoutContext } from '../lib/cms';
import {
  conditionNames,
  hasPermission,
  money,
  shortDate,
  statusNames,
  type ListingStatus,
} from '../lib/types';

type Resource = 'listings' | 'users' | 'categories' | 'roles' | 'audit';
type Row = {
  id: string;
  name?: string;
  title?: string;
  author?: string;
  description?: string;
  price_vnd?: number;
  condition?: string;
  category?: string;
  city?: string;
  seller?: string;
  seller_id?: string;
  status?: ListingStatus;
  image_keys?: string;
  version: number;
  deleted_at?: string;
  created_at?: string;
  email?: string;
  role?: string;
  is_super_admin?: number;
  is_locked?: number;
  permissions?: string[];
  role_ids?: string[];
  actor?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
};
type Group = { key: string; name: string; actions: Record<string, string> };
type Options = {
  sellers?: { id: string; name: string; email: string }[];
  categories?: { id: string; name: string }[];
  roles?: { id: string; name: string }[];
};
const labels: Record<Resource, string> = {
  listings: 'Tin đăng / sách',
  users: 'Tài khoản',
  categories: 'Danh mục sách',
  roles: 'Role và phân quyền',
  audit: 'Nhật ký quản trị',
};
const endpoints: Record<Resource, string> = {
  listings: 'catalog',
  users: 'users',
  categories: 'categories',
  roles: 'roles',
  audit: 'audit',
};
const kindNames: Record<string, string> = {
  user: 'Tài khoản',
  listing: 'Tin đăng',
  categories: 'Danh mục',
  roles: 'Role',
  seller_application: 'Yêu cầu Seller',
};
const actionNames: Record<string, string> = {
  create: 'Tạo mới',
  update: 'Chỉnh sửa',
  lock: 'Khóa tài khoản',
  unlock: 'Mở khóa', // taste-skill-ignore: audit event identifier, not marketing copy
  assign_roles: 'Gán role',
  trash: 'Đưa vào thùng rác',
  restore: 'Khôi phục',
  update_pending_review: 'Sửa, chuyển chờ duyệt',
  restore_pending_review: 'Khôi phục, chuyển chờ duyệt',
  approved: 'Duyệt Seller',
  rejected: 'Từ chối',
  active: 'Duyệt tin',
};
export default function CmsCrudPage({ resource }: { resource: Resource }) {
  const auth = useAuth(),
    catalog = useCategories();
  const { refreshSummary } = useOutletContext<CmsLayoutContext>();
  const allowed = (action: string) =>
    hasPermission(auth.user, `${resource}.${action}`);
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [trash, setTrash] = useState(false);
  const [editor, setEditor] = useState<{
      row: Row | null;
      readOnly: boolean;
    } | null>(null),
    [rolesUser, setRolesUser] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [files, setFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [rejection, setRejection] = useState<Row | null>(null);
  const [options, setOptions] = useState<Options>({}),
    [groups, setGroups] = useState<Group[]>([]);
  const [form] = Form.useForm(),
    [rolesForm] = Form.useForm();
  const [notice, noticeHolder] = message.useMessage();
  const [modal, modalHolder] = Modal.useModal();
  const endpoint = `/admin/${endpoints[resource]}`;
  async function load() {
    if (!allowed('view')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        q: query,
        status,
        trash: trash ? '1' : '0',
        state: status,
      });
      const data = await api<{ items: Row[]; total: number }>(
        `${endpoint}?${params}`,
      );
      setRows(data.items);
      setTotal(data.total);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setPage(1);
    setQuery('');
    setStatus('all');
    setTrash(false);
    setEditor(null);
    setRolesUser(null);
    setRows([]);
  }, [resource]);
  useEffect(() => {
    void load();
  }, [resource, page, query, status, trash, auth.user]);
  async function prepare() {
    const [lookups, permissions] = await Promise.all([
      api<Options>('/admin/options'),
      api<{ groups: Group[] }>('/admin/permissions'),
    ]);
    setOptions(lookups);
    setGroups(permissions.groups);
    return lookups;
  }
  async function open(row: Row | null, readOnly = false) {
    try {
      await prepare();
      setImagePreviewOpen(false);
      setExistingImages(row?.image_keys ? JSON.parse(row.image_keys) : []);
      setFiles([]);
      form.resetFields();
      form.setFieldsValue(
        row
          ? { ...row, price: row.price_vnd, permissions: row.permissions ?? [] }
          : { permissions: [], condition: 'good' },
      );
      setEditor({ row, readOnly });
      setError('');
    } catch (issue) {
      notice.error(errorMessage(issue));
    }
  }
  async function saved() {
    setEditor(null);
    setRolesUser(null);
    setFiles([]);
    await Promise.all([load(), catalog.refresh(), auth.refresh()]);
    if (resource === 'listings') await refreshSummary();
    notice.success('Đã lưu thay đổi');
  }
  async function submit(values: Record<string, unknown>) {
    if (!editor) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        ...values,
        ...(editor.row ? { version: editor.row.version } : {}),
      };
      if (resource === 'listings') {
        if (existingImages.length + files.length < 2 || existingImages.length + files.length > 5) {
          notice.error('Mỗi tin cần từ 2 đến 5 ảnh.');
          return;
        }
        const keys = [...existingImages];
        for (const file of files) {
          const data = new FormData();
          data.append('file', file);
          const uploaded = await api<{ key: string }>('/images', { method: 'POST', body: data });
          keys.push(uploaded.key);
        }
        payload.image_keys = keys;
      }
      await api(editor.row ? `${endpoint}/${editor.row.id}` : endpoint, {
        method: editor.row ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await saved();
    } catch (issue) {
      notice.error(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }
  function confirmAction(
    row: Row,
    action: 'trash' | 'restore' | 'lock' | 'review_active' | 'review_rejected',
  ) {
    if (action === 'review_rejected') {setRejection(row); return;}
    const locked = action === 'lock' ? !row.is_locked : undefined;
    const title =
      action === 'trash'
        ? 'Xác nhận chuyển vào thùng rác?'
        : action === 'restore'
          ? 'Khôi phục dữ liệu này?'
          : action === 'lock'
            ? locked
              ? 'Khóa tài khoản này?'
              : 'Mở khóa tài khoản này?'
            : action === 'review_active'
              ? 'Phê duyệt tin đăng này?'
              : 'Từ chối tin đăng này?';
    const content =
      action === 'trash'
        ? 'Dữ liệu được giữ lại và có thể khôi phục trong Thùng rác.'
        : action === 'restore' && resource === 'listings'
          ? 'Tin được khôi phục về Chờ duyệt; cần được phê duyệt lại trước khi công khai.'
          : action === 'lock' && locked
            ? 'Tài khoản bị đăng xuất, không thể đăng nhập và tin của người bán tạm ngừng hiển thị.'
            : (row.title ?? row.name);
    modal.confirm({
      title,
      content,
      okText: action === 'trash' ? 'Chuyển vào thùng rác' : 'Xác nhận',
      cancelText: 'Hủy',
      okButtonProps: { danger: action === 'trash' || locked === true },
      async onOk() {
        try {
          if (action.startsWith('review_'))
            await api(`/admin/listings/${row.id}/decision`, {
              method: 'POST',
              body: JSON.stringify({
                decision: action === 'review_active' ? 'active' : 'rejected',
                version: row.version,
              }),
            });
          else
            await api(
              action === 'trash'
                ? `${endpoint}/${row.id}`
                : `${endpoint}/${row.id}/${action === 'lock' ? 'lock' : 'restore'}`,
              {
                method: action === 'trash' ? 'DELETE' : 'POST',
                body: JSON.stringify({
                  version: row.version,
                  ...(action === 'lock' ? { locked } : {}),
                }),
              },
            );
          await load();
          if (resource === 'listings') await refreshSummary();
          if (resource === 'categories') await catalog.refresh();
          if (resource === 'roles') await auth.refresh();
          notice.success('Đã cập nhật');
        } catch (issue) {
          notice.error(errorMessage(issue));
          throw issue;
        }
      },
    });
  }
  async function openRoles(row: Row) {
    try {
      const lookups = await prepare();
      rolesForm.setFieldsValue({
        role_ids: (row.role_ids ?? []).filter((id) =>
          lookups.roles?.some((role) => role.id === id),
        ),
      });
      setRolesUser(row);
    } catch (issue) {
      notice.error(errorMessage(issue));
    }
  }
  async function saveRoles(values: { role_ids: string[] }) {
    if (!rolesUser) return;
    setBusy(true);
    try {
      await api(`/admin/users/${rolesUser.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ ...values, version: rolesUser.version }),
      });
      await saved();
    } catch (issue) {
      notice.error(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }
  const resetFilter = (next: string) => {
    setPage(1);
    setStatus(next);
  };
  if (!allowed('view'))
    return (
      <Alert
        type="warning"
        showIcon
        message="Bạn chưa được cấp quyền xem mục này."
      />
    );
  const displayRole = (row: Row) =>
    row.is_super_admin
      ? 'Super Admin'
      : row.role === 'seller'
        ? 'Seller'
        : row.role === 'admin'
          ? 'Admin'
          : 'User';
  const columns =
    resource === 'audit'
      ? [
          {
            title: 'Thời gian',
            dataIndex: 'created_at',
            render: (value: string) => shortDate(value),
          },
          { title: 'Người thực hiện', dataIndex: 'actor' },
          {
            title: 'Thao tác',
            dataIndex: 'action',
            render: (value: string) => actionNames[value] ?? value,
          },
          {
            title: 'Loại dữ liệu',
            dataIndex: 'resource_type',
            render: (value: string) => kindNames[value] ?? value,
          },
          { title: 'Mã dữ liệu', dataIndex: 'resource_id' },
        ]
      : [
          {
            title: resource === 'listings' ? 'Cuốn sách' : 'Tên',
            key: 'name',
            render: (_: unknown, row: Row) => (
              <Button
                type="link"
                className="cms-row-title"
                onClick={() => void open(row, true)}
              >
                {row.title ?? row.name}
              </Button>
            ),
          },
          ...(resource === 'listings'
            ? [
                { title: 'Người bán', dataIndex: 'seller' },
                {
                  title: 'Giá bán',
                  key: 'price',
                  render: (_: unknown, row: Row) => (
                    <span className="num">{money(row.price_vnd ?? 0)}</span>
                  ),
                },
                {
                  title: 'Trạng thái',
                  key: 'state',
                  render: (_: unknown, row: Row) => (
                    <Tag>
                      {row.deleted_at
                        ? 'Thùng rác'
                        : statusNames[row.status ?? 'pending']}
                    </Tag>
                  ),
                },
              ]
            : resource === 'users'
              ? [
                  { title: 'Email', dataIndex: 'email' },
                  {
                    title: 'Vai trò mua bán',
                    key: 'role',
                    render: (_: unknown, row: Row) => (
                      <Tag>{displayRole(row)}</Tag>
                    ),
                  },
                  {
                    title: 'Trạng thái',
                    key: 'locked',
                    render: (_: unknown, row: Row) => (
                      <Tag color={row.is_locked ? 'error' : 'default'}>
                        {row.is_locked ? 'Đã khóa' : 'Hoạt động'}
                      </Tag>
                    ),
                  },
                ]
              : [
                  { title: 'Mô tả', dataIndex: 'description', ellipsis: true },
                  ...(resource === 'roles'
                    ? [
                        {
                          title: 'Quyền',
                          key: 'permissions',
                          render: (_: unknown, row: Row) =>
                            `${row.permissions?.length ?? 0} quyền`,
                        },
                      ]
                    : []),
                ]),
          {
            title: 'Thao tác',
            key: 'actions',
            render: (_: unknown, row: Row) => (
              <Space wrap size={4}>
                <Button
                  aria-label={`Xem ${row.title ?? row.name}`}
                  icon={<EyeOutlined />}
                  onClick={() => void open(row, true)}
                >
                  Xem
                </Button>
                {!row.deleted_at &&
                  allowed('update') &&
                  (!row.is_super_admin || auth.user?.is_super_admin) && (
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => void open(row)}
                    >
                      Sửa
                    </Button>
                  )}
                {resource === 'users' &&
                  allowed('assign_roles') &&
                  row.id !== auth.user?.id &&
                  !row.is_super_admin && (
                    <Button
                      icon={<SafetyOutlined />}
                      onClick={() => void openRoles(row)}
                    >
                      Gán role
                    </Button>
                  )}
                {resource === 'users' &&
                  allowed('lock') &&
                  row.id !== auth.user?.id &&
                  !row.is_super_admin && (
                    <Button
                      danger={!row.is_locked}
                      icon={<LockOutlined />}
                      onClick={() => confirmAction(row, 'lock')}
                    >
                      {row.is_locked ? 'Mở khóa' : 'Khóa'}
                    </Button>
                  )}
                {!row.deleted_at &&
                  resource === 'listings' &&
                  row.status === 'pending' &&
                  allowed('review') && (
                    <>
                      <Button
                        onClick={() => confirmAction(row, 'review_active')}
                      >
                        Phê duyệt
                      </Button>
                      <Button
                        danger
                        onClick={() => confirmAction(row, 'review_rejected')}
                      >
                        Từ chối
                      </Button>
                    </>
                  )}
                {!row.deleted_at && allowed('delete') && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmAction(row, 'trash')}
                  >
                    Xóa
                  </Button>
                )}
                {row.deleted_at && allowed('restore') && (
                  <Button
                    icon={<RollbackOutlined />}
                    onClick={() => confirmAction(row, 'restore')}
                  >
                    Khôi phục
                  </Button>
                )}
              </Space>
            ),
          },
        ];
  return (
    <div className="cms-page">
      <RejectionDialog open={!!rejection} title="Từ chối tin đăng" onCancel={() => setRejection(null)}
        onSubmit={async note => {
          if (!rejection) return;
          await api(`/admin/listings/${rejection.id}/decision`, {method:'POST',body:JSON.stringify({decision:'rejected',version:rejection.version,note})});
          setRejection(null); await load(); await refreshSummary(); notice.success('Đã từ chối và lưu lý do');
        }} />
      {noticeHolder}
      {modalHolder}
      <div className="page-heading">
        <div>
          <h1>{labels[resource]}</h1>
          <p>
            {resource === 'listings'
              ? 'Quản lý nội dung và xét duyệt trước khi công khai.'
              : resource === 'roles'
                ? 'Tạo role và chọn quyền chi tiết cho từng nhóm chức năng.'
                : resource === 'users'
                  ? 'Quản lý hồ sơ, khóa tài khoản và gán quyền CMS.'
                  : resource === 'audit'
                    ? 'Lịch sử thao tác được giữ lại để truy vết.'
                    : 'Quản lý các danh mục hiển thị trên chợ sách.'}
          </p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            loading={loading}
          >
            Làm mới
          </Button>
          {allowed('create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => void open(null)}
            >
              Tạo mới
            </Button>
          )}
        </Space>
      </div>
      <section className="cms-list-sheet">
        <div className="cms-crud-toolbar">
          {resource !== 'audit' && (
            <Input.Search
              aria-label="Tìm trong danh sách"
              placeholder="Tìm theo tên…"
              allowClear
              onSearch={(value) => {
                setQuery(value);
                setPage(1);
              }}
            />
          )}
          {resource === 'listings' && (
            <Select
              aria-label="Trạng thái tin"
              value={status}
              onChange={resetFilter}
              options={[
                { value: 'all', label: 'Mọi trạng thái' },
                ...Object.entries(statusNames).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
          )}{' '}
          {resource === 'users' && (
            <Select
              aria-label="Trạng thái tài khoản"
              value={status}
              onChange={resetFilter}
              options={[
                { value: 'all', label: 'Tất cả tài khoản' },
                { value: 'active', label: 'Hoạt động' },
                { value: 'locked', label: 'Đã khóa' },
              ]}
            />
          )}{' '}
          {['listings', 'categories', 'roles'].includes(resource) && (
            <Select
              aria-label="Danh sách hoặc thùng rác"
              value={trash ? 'trash' : 'normal'}
              onChange={(value) => {
                setTrash(value === 'trash');
                setPage(1);
              }}
              options={[
                { value: 'normal', label: 'Đang quản lý' },
                { value: 'trash', label: 'Thùng rác' },
              ]}
            />
          )}
        </div>
        {error && <Alert type="error" showIcon message={error} />}
        <Table<Row>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{
            x: resource === 'listings' || resource === 'users' ? 1000 : 760,
          }}
          pagination={{
            current: page,
            pageSize: 25,
            total,
            showSizeChanger: false,
            onChange: setPage,
            showTotal: (value) => `${value} kết quả`,
          }}
          locale={{
            emptyText: trash
              ? 'Thùng rác đang trống'
              : 'Chưa có dữ liệu phù hợp',
          }}
        />
      </section>
      <Drawer
        title={
          editor?.readOnly ? 'Chi tiết' : editor?.row ? 'Chỉnh sửa' : 'Tạo mới'
        }
        open={!!editor}
        keyboard={!imagePreviewOpen}
        onClose={() => !busy && setEditor(null)}
        width={resource === 'roles' ? 760 : 640}
        destroyOnHidden
        maskClosable={!busy}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          requiredMark={false}
          disabled={editor?.readOnly || busy}
        >
          {resource === 'listings' ? (
            <>
              <Form.Item
                name="title"
                label="Tên sách"
                rules={[{ required: true, min: 2, max: 180 }]}
              >
                <Input maxLength={180} />
              </Form.Item>
              <Form.Item
                name="author"
                label="Tác giả"
                rules={[{ required: true, min: 2, max: 140 }]}
              >
                <Input maxLength={140} />
              </Form.Item>
              {!editor?.row && (
                <Form.Item
                  name="seller_id"
                  label="Người bán đã được duyệt"
                  rules={[{ required: true }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={options.sellers?.map((seller) => ({
                      value: seller.id,
                      label: `${seller.name} · ${seller.email}`,
                    }))}
                  />
                </Form.Item>
              )}
              <div className="two-fields">
                <Form.Item
                  name="category"
                  label="Danh mục"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={options.categories?.map((category) => ({
                      value: category.name,
                      label: category.name,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="condition"
                  label="Tình trạng sách"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={Object.entries(conditionNames).map(
                      ([value, label]) => ({ value, label }),
                    )}
                  />
                </Form.Item>
              </div>
              <div className="two-fields">
                <Form.Item
                  name="price"
                  label="Giá bán (VNĐ)"
                  rules={[
                    { required: true, type: 'number', min: 0, max: 100000000 },
                  ]}
                >
                  <InputNumber
                    min={0}
                    max={100000000}
                    precision={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item
                  name="city"
                  label="Tỉnh / thành phố"
                  rules={[{ required: true, max: 80 }]}
                >
                  <Input maxLength={80} />
                </Form.Item>
              </div>
              <Form.Item name="description" label="Mô tả sách">
                <Input.TextArea rows={5} maxLength={3000} />
              </Form.Item>
              {editor?.readOnly ? (
                <div className="cms-editor-images">
                  {existingImages.map((key) => <img key={key} src={`/api/images/${key}`} alt="Ảnh sách hiện tại" />)}
                </div>
              ) : auth.imageUploads ? (
                <ListingImagesPicker files={files} onChange={setFiles} existing={existingImages}
                  onRemoveExisting={(key) => setExistingImages(keys => keys.filter(value => value !== key))}
                  disabled={busy} onPreviewChange={setImagePreviewOpen} />
              ) : <Alert type="info" message="Tải ảnh đang tạm chưa khả dụng" />}
              {!editor?.readOnly && (
                <Alert
                  type="info"
                  message="Tin mới hoặc nội dung sửa sẽ ở trạng thái Chờ duyệt."
                />
              )}
            </>
          ) : (
            <>
              <Form.Item
                name="name"
                label={
                  resource === 'roles'
                    ? 'Tên role'
                    : resource === 'categories'
                      ? 'Tên danh mục'
                      : 'Tên hiển thị'
                }
                rules={[
                  {
                    required: true,
                    min: 2,
                    max:
                      resource === 'roles'
                        ? 80
                        : resource === 'categories'
                          ? 40
                          : 100,
                  },
                ]}
              >
                <Input />
              </Form.Item>
              {resource === 'users' ? (
                <>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: 'email' }]}
                  >
                    <Input disabled={!!editor?.row} autoComplete="off" />
                  </Form.Item>
                  {!editor?.row && (
                    <>
                      <Form.Item
                        name="password"
                        label="Mật khẩu ban đầu"
                        rules={[{ required: true, min: 10, max: 128 }]}
                      >
                        <Input.Password autoComplete="new-password" />
                      </Form.Item>
                      <Alert
                        type="info"
                        message="Tài khoản mới có vai trò User. Muốn bán sách phải qua xét duyệt Seller."
                      />
                    </>
                  )}
                  {editor?.row && (
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 'role',
                          label: 'Vai trò mua bán',
                          children: displayRole(editor.row),
                        },
                        {
                          key: 'state',
                          label: 'Trạng thái',
                          children: editor.row.is_locked
                            ? 'Đã khóa'
                            : 'Hoạt động',
                        },
                      ]}
                    />
                  )}
                </>
              ) : (
                <Form.Item name="description" label="Mô tả">
                  <Input.TextArea rows={3} maxLength={500} />
                </Form.Item>
              )}
              {resource === 'roles' && (
                <>
                  <Form.Item name="permissions" label="Quyền chi tiết">
                    <PermissionPicker groups={groups} user={auth.user} disabled={Boolean(editor?.readOnly || busy)} />
                  </Form.Item>
                  <p className="field-note">
                    Quyền CMS không tự cấp quyền đăng bán. Seller vẫn cần được
                    xét duyệt.
                  </p>
                </>
              )}
            </>
          )}
          {!editor?.readOnly && (
            <div className="cms-editor-save">
              <Button type="primary" htmlType="submit" loading={busy}>
                Lưu thay đổi
              </Button>
            </div>
          )}
        </Form>
      </Drawer>
      <Drawer
        title={`Gán role · ${rolesUser?.name ?? ''}`}
        width={520}
        open={!!rolesUser}
        onClose={() => !busy && setRolesUser(null)}
        destroyOnHidden
      >
        <Form form={rolesForm} layout="vertical" onFinish={saveRoles}>
          <Alert
            type="info"
            message="Các quyền của nhiều role được cộng lại. Bỏ chọn tất cả sẽ thu hồi quyền CMS; vai trò mua bán không thay đổi."
          />
          <Form.Item name="role_ids" label="Role quản trị">
            <Checkbox.Group
              className="cms-role-assignment"
              options={options.roles?.map((role) => ({
                value: role.id,
                label: role.name,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            Lưu role tài khoản
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
