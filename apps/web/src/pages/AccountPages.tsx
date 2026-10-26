import { useCategories } from '../lib/categories';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AutoComplete,
  Alert,
  Avatar,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  SafetyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { BookCover, BookGallery } from '../components/Books';
import { ListingImagesPicker } from '../components/ListingImagesPicker';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  cities,
  conditionNames,
  money,
  normalizeBook,
  shortDate,
  statusNames,
  type Book,
  type SellerApplication,
  type User,
} from '../lib/types';

const roleNames = {
  user: 'Thành viên',
  seller: 'Người bán',
  admin: 'Quản trị viên',
};
export function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="container account-page">
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-identity">
            <Avatar size={46}>{user?.name.slice(0, 1)}</Avatar>
            <div>
              <strong>{user?.name}</strong>
              <small>{user ? roleNames[user.role] : ''}</small>
            </div>
          </div>
          <nav>
            <NavLink to="/tai-khoan">
              <UserOutlined /> Tài khoản của tôi
            </NavLink>
            {user?.role !== 'user' && (
              <>
                <NavLink to="/tin-cua-toi">
                  <FileTextOutlined /> Tin đăng của tôi
                </NavLink>
                <NavLink to="/dang-tin">
                  <PlusOutlined /> Đăng tin mới
                </NavLink>
              </>
            )}
            {user?.cms_access && (
              <NavLink to="/quan-tri">
                <SafetyOutlined /> Quản trị
              </NavLink>
            )}
            <Link to="/huong-dan">
              Hướng dẫn mua bán <ArrowRightOutlined />
            </Link>
          </nav>
          <div className="account-sidebar-note">
            <BookShelfMark />
            <p>Mỗi cuốn sách có thể bắt đầu thêm một hành trình.</p>
          </div>
        </aside>
        <section className="account-sheet">{children}</section>
      </div>
    </div>
  );
}
function BookShelfMark() {
  return (
    <span className="shelf-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function AccountPage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [application, setApplication] = useState<SellerApplication | null>(
    null,
  );
  const [applicationLoading, setApplicationLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, holder] = message.useMessage();
  async function loadApplication() {
    setApplicationLoading(true);
    try {
      const data = await api<{ application: SellerApplication | null }>(
        '/seller/applications/me',
      );
      setApplication(data.application);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setApplicationLoading(false);
    }
  }
  useEffect(() => {
    void loadApplication();
  }, []);
  useEffect(() => {
    if (location.hash === '#nguoi-ban' && !applicationLoading) {
      const section = document.getElementById('nguoi-ban');
      section?.scrollIntoView({block:'start'});
      section?.focus({preventScroll:true});
    }
  }, [location.hash, applicationLoading]);
  async function save(values: { name: string }) {
    setSaving(true);
    try {
      const data = await api<{ user: User }>('/account', {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      setUser(data.user);
      notice.success('Đã lưu tên hiển thị');
    } catch (error) {
      notice.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  async function apply(values: { phone: string; note?: string }) {
    setSending(true);
    try {
      await api('/seller/applications', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      await loadApplication();
      notice.success('Đã gửi yêu cầu xét duyệt');
    } catch (error) {
      notice.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }
  return (
    <AccountLayout>
      {holder}
      <div className="page-heading">
        <div>
          <h1>Tài khoản của tôi</h1>
          <p>Thông tin của bạn và hành trình trở thành người bán.</p>
        </div>
      </div>
      <section className="settings-section">
        <div>
          <h2>Thông tin cá nhân</h2>
          <p>Tên hiển thị xuất hiện bên cạnh những tin đăng của bạn.</p>
        </div>
        <div className="settings-panel">
          <Form
            layout="vertical"
            requiredMark={false}
            initialValues={{ name: user?.name }}
            onFinish={save}
          >
            <Form.Item
              name="name"
              label="Tên hiển thị"
              rules={[
                {
                  required: true,
                  min: 2,
                  max: 100,
                  whitespace: true,
                  message: 'Tên cần từ 2 đến 100 ký tự.',
                },
              ]}
            >
              <Input size="large" autoComplete="name" />
            </Form.Item>
            <Form.Item label="Email đăng nhập">
              <Input size="large" value={user?.email} readOnly />
              <p className="field-note">
                Email hiện được giữ cố định để bảo vệ tài khoản.
              </p>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Lưu thông tin
            </Button>
          </Form>
        </div>
      </section>
      <section className="settings-section" id="bao-mat">
        <div><h2>Đổi mật khẩu</h2><p>Bảo vệ tài khoản bằng mật khẩu riêng cho website.</p></div>
        <div className="settings-panel"><ChangePasswordForm /></div>
      </section>
      <section className="settings-section" id="nguoi-ban" tabIndex={-1}>
        <div>
          <h2>Trở thành người bán</h2>
          <p>
            Đăng lại sách đã đọc. Admin xét duyệt tài khoản trước khi bạn có thể
            gửi tin.
          </p>
          <Link to="/huong-dan">
            Tìm hiểu quy trình <ArrowRightOutlined />
          </Link>
        </div>
        <div className="settings-panel">
          {user?.role !== 'user' ? (
            <div className="seller-approved">
              <CheckCircleOutlined />
              <h3>Bạn đã có quyền đăng sách</h3>
              <p>Tin mới sẽ được kiểm duyệt trước khi hiển thị công khai.</p>
              <Link to="/dang-tin">
                <Button type="primary" icon={<PlusOutlined />}>
                  Đăng cuốn sách đầu tiên
                </Button>
              </Link>
            </div>
          ) : applicationLoading ? (
            <Skeleton paragraph={{ rows: 3 }} />
          ) : loadError ? (
            <Alert
              type="error"
              message={loadError}
              action={
                <Button onClick={() => void loadApplication()}>Thử lại</Button>
              }
            />
          ) : application?.status === 'pending' ? (
            <div className="application-pending">
              <Tag>Đang chờ xét duyệt</Tag>
              <h3>Yêu cầu của bạn đã được gửi</h3>
              <p>
                Gửi ngày {shortDate(application.created_at)}. Bạn có thể đăng
                sách ngay khi Admin phê duyệt tài khoản.
              </p>
              <Button onClick={() => void loadApplication()}>
                Kiểm tra lại trạng thái
              </Button>
            </div>
          ) : (
            <>
              {application?.status === 'rejected' && (
                <Alert
                  type="warning"
                  message="Yêu cầu trước chưa được duyệt"
                  description={application.review_note || 'Bạn có thể kiểm tra lại thông tin và gửi một yêu cầu mới.'}
                />
              )}
              <Form layout="vertical" requiredMark={false} onFinish={apply}>
                <Form.Item
                  name="phone"
                  label="Số điện thoại liên hệ"
                  rules={[
                    {
                      required: true,
                      pattern: /^[+()\d .-]{8,20}$/,
                      message: 'Nhập số điện thoại hợp lệ.',
                    },
                  ]}
                >
                  <Input
                    size="large"
                    autoComplete="tel"
                    placeholder="Số điện thoại của bạn"
                  />
                </Form.Item>
                <Form.Item name="note" label="Giới thiệu ngắn (không bắt buộc)">
                  <Input.TextArea
                    rows={3}
                    maxLength={500}
                    placeholder="Bạn thường bán nhóm sách nào?"
                  />
                </Form.Item>
                <p className="field-note">
                  Số điện thoại chỉ được người mua xem sau khi đăng nhập và bấm
                  nút liên hệ trên tin của bạn.
                </p>
                <Button type="primary" htmlType="submit" loading={sending}>
                  Gửi yêu cầu xét duyệt
                </Button>
              </Form>
            </>
          )}
        </div>
      </section>
    </AccountLayout>
  );
}

type ListingInput = {
  title: string;
  author: string;
  price: number;
  condition: string;
  category: string;
  city: string;
  description?: string;
};
export function NewListingPage({ editing = false }: { editing?: boolean }) {
  const { categories, error:categoryError, refresh:retryCategories } = useCategories();
  const { imageUploads } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submitting=useRef(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [form] = Form.useForm();
  const { id } = useParams();
  const [item, setItem] = useState<Book | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(editing);
  const [modal, modalContext] = Modal.useModal();
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true); setError(''); setItem(null); setFiles([]);
    api<{item: Record<string, unknown>}>(`/seller/listings/${id}`)
      .then(({item: row}) => {
        if (cancelled) return;
        const book = normalizeBook(row);
        setItem(book); setExistingImages(JSON.parse(book.image_keys ?? '[]'));
        form.setFieldsValue(book);
      })
      .catch(issue => {if (!cancelled) setError(errorMessage(issue));})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [editing, id, form]);

  async function submit(values: ListingInput) {
    if (files.length + existingImages.length < 2 || files.length + existingImages.length > 5) {
      setError('Mỗi tin cần từ 2 đến 5 ảnh.');
      return;
    }
    if(submitting.current) return;
    submitting.current=true;
    setBusy(true);
    setError('');
    try {
      const imageKeys: string[] = [...existingImages];
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        const image = await api<{ key: string }>('/images', {
          method: 'POST',
          body,
        });
        imageKeys.push(image.key);
      }
      await api(editing ? `/seller/listings/${id}` : '/listings', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...values, image_keys: imageKeys, ...(editing ? {version:item?.version} : {}) }),
      });
      navigate('/tin-cua-toi', { state: { submitted: true } });
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      submitting.current=false;
      setBusy(false);
    }
  }
  if (loading) return <AccountLayout><Skeleton active paragraph={{rows:10}} /></AccountLayout>;
  if (editing && (!item || !['active','pending','rejected','hidden'].includes(item.status ?? ''))) {
    return <AccountLayout><Alert type="error" showIcon message={error || 'Tin đã bán đã kết thúc, không thể sửa hoặc đăng lại.'} /><Link to="/tin-cua-toi">Về tin đăng của tôi</Link></AccountLayout>;
  }
  return (
    <AccountLayout>
      {modalContext}
      <div className="page-heading">
        <div>
          <h1>{editing ? 'Chỉnh sửa tin đăng' : 'Đăng bán sách'}</h1>
          <p>Mô tả trung thực để cuốn sách tìm đúng người đang cần.</p>
        </div>
        <Tag>Miễn phí giai đoạn ra mắt</Tag>
      </div>
      <div className="listing-editor">
        <div>
          {item?.status === 'rejected' && <Alert type="warning" showIcon message="Tin đã bị từ chối" description={item.review_note || 'Hãy sửa thông tin sách trước khi gửi duyệt lại.'} />}
          {error && <Alert type="error" showIcon message={error} />}
          {categoryError && <Alert type="error" showIcon message="Chưa tải được danh mục sách" action={<Button onClick={() => void retryCategories().catch(() => {})}>Thử lại danh mục</Button>} />}
          <Form
            form={form}
            layout="vertical"
            disabled={busy}
            onFinish={(values) => {
              if (!editing) {void submit(values); return;}
              modal.confirm({title:'Gửi lại tin để xét duyệt?', content:'Sau khi lưu, tin sẽ tạm ngừng hiển thị công khai và chờ Admin duyệt lại.', okText:'Lưu và gửi duyệt', cancelText:'Hủy', onOk:() => submit(values)});
            }}
            requiredMark={false}
            size="large"
          >
            <div className="form-section-title">
              <h2>Thông tin cuốn sách</h2>
            </div>
            <Form.Item
              name="title"
              label="Tên sách"
              rules={[
                {
                  required: true,
                  min: 2,
                  max: 180,
                  whitespace: true,
                  message: 'Nhập tên sách từ 2 đến 180 ký tự.',
                },
              ]}
            >
              <Input placeholder="Tên đầy đủ của cuốn sách" maxLength={180} />
            </Form.Item>
            <div className="two-fields">
              <Form.Item
                name="author"
                label="Tác giả"
                rules={[
                  {
                    required: true,
                    min: 2,
                    max: 140,
                    message: 'Vui lòng nhập tên tác giả.',
                  },
                ]}
              >
                <Input placeholder="Tên tác giả" maxLength={140} />
              </Form.Item>
              <Form.Item
                name="category"
                label="Danh mục"
                rules={[{ required: true, message: 'Chọn danh mục sách.' }]}
              >
                <Select
                  placeholder="Chọn danh mục"
                  options={categories.map((category) => ({
                    value: category,
                    label: category,
                  }))}
                />
              </Form.Item>
            </div>
            <div className="two-fields">
              <Form.Item
                name="condition"
                label="Tình trạng sách"
                rules={[{ required: true, message: 'Chọn tình trạng sách.' }]}
              >
                <Select
                  placeholder="Chọn tình trạng"
                  options={Object.entries(conditionNames).map(
                    ([value, label]) => ({ value, label }),
                  )}
                />
              </Form.Item>
              <Form.Item
                name="price"
                label="Giá bán"
                rules={[
                  {
                    required: true,
                    type: 'number',
                    min: 0,
                    max: 100000000,
                    message: 'Nhập giá hợp lệ từ 0 đến 100 triệu đồng.',
                  },
                ]}
              >
                <InputNumber
                  precision={0}
                  min={0}
                  max={100000000}
                  addonAfter="đ"
                  placeholder="Ví dụ: 45000"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
            <Form.Item
              name="city"
              label="Tỉnh / thành phố"
              rules={[
                { required: true, message: 'Nhập hoặc chọn khu vực bán.' },
              ]}
            >
              <AutoComplete
                placeholder="Nhập tỉnh hoặc thành phố"
                maxLength={80}
                options={cities.map((city) => ({ value: city, label: city }))}
              />
            </Form.Item>
            <Form.Item name="description" label="Mô tả chi tiết">
              <Input.TextArea
                rows={5}
                maxLength={3000}
                showCount
                placeholder="Bìa và gáy còn nguyên không? Có vết ố, gấp góc hay ghi chú? Bạn muốn giao sách ở đâu?"
              />
            </Form.Item>
            <div className="form-section-title">
              <h2>Hình ảnh sách</h2>
            </div>
            {imageUploads ? (
              <ListingImagesPicker files={files} onChange={setFiles} disabled={busy}
                existing={existingImages} onRemoveExisting={key => setExistingImages(keys => keys.filter(value => value !== key))}
                />
            ) : (
              <Alert
                type="info"
                showIcon
                message="Tải ảnh đang tạm chưa khả dụng"
                description="Vui lòng chờ tính năng ảnh hoạt động để gửi tin có đủ từ 2 đến 5 ảnh."
              />
            )}
            <div className="form-submit-row">
              <Link to="/tin-cua-toi">
                <Button>Hủy</Button>
              </Link>
              <Button type="primary" htmlType="submit" loading={busy}>
                {editing ? 'Lưu và gửi duyệt lại' : 'Gửi tin để xét duyệt'} <ArrowRightOutlined />
              </Button>
            </div>
          </Form>
        </div>
        <aside className="editor-tips">
          <h2>Một tin đăng rõ ràng</h2>
          <ul>
            <li>Ghi đúng tên sách và tác giả.</li>
            <li>Chọn tình trạng sát với sách thực tế.</li>
            <li>Nói rõ phần đã viết, gấp góc hoặc ố vàng.</li>
            <li>Không đưa số điện thoại vào mô tả công khai.</li>
          </ul>
          <div className="editor-review">
            <SafetyOutlined />
            <p>
              Admin sẽ kiểm tra tin trước khi công khai. Chưa thu phí đăng tin.
            </p>
          </div>
        </aside>
      </div>
    </AccountLayout>
  );
}

export function MyListingsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Book | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [modal, modalContext] = Modal.useModal();
  const [changing, setChanging] = useState('');
  const navigate = useNavigate();
  function changeStatus(book: Book, next: 'sold' | 'hidden') {
    modal.confirm({
      title: next === 'sold' ? 'Xác nhận sách đã bán?' : 'Ẩn tin đăng này?',
      content: next === 'sold' ? 'Tin đã bán sẽ kết thúc, không thể chỉnh sửa hoặc đăng lại.' : 'Tin sẽ ngừng hiển thị công khai. Bạn có thể chỉnh sửa và gửi Admin duyệt lại khi muốn đăng lại.',
      okText: next === 'sold' ? 'Đánh dấu đã bán' : 'Ẩn tin', cancelText:'Hủy',
      onOk: async () => {
        setChanging(book.id);
        try {
          await api(`/seller/listings/${book.id}/status`, {method:'POST', body:JSON.stringify({status:next,version:book.version})});
          setSelected(null); setSubmitted(false); navigate('/tin-cua-toi', {replace:true,state:null}); load();
        } catch(issue) {setError(errorMessage(issue));}
        finally {setChanging('');}
      },
    });
  }
  const location = useLocation();
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if ((location.state as {submitted?: boolean} | null)?.submitted) {
      setSubmitted(true);
      navigate(location.pathname, {replace:true, state:null});
    }
  }, [location.state, location.pathname, navigate]);
  useEffect(() => {
    if (!submitted) return;
    const timeout = window.setTimeout(() => setSubmitted(false), 6000);
    return () => window.clearTimeout(timeout);
  }, [submitted]);
  function load() {
    setLoading(true);
    api<{ items: Record<string, unknown>[] }>('/seller/listings')
      .then((data) => {
        setBooks(data.items.map(normalizeBook));
        setError('');
      })
      .catch((issue) => setError(errorMessage(issue)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  const filtered =
    status === 'all' ? books : books.filter((book) => book.status === status);
  return (
    <AccountLayout>
      {modalContext}
      <div className="page-heading">
        <div>
          <h1>Tin đăng của tôi</h1>
          <p>Theo dõi trạng thái xét duyệt của các cuốn sách bạn đăng.</p>
        </div>
        <Link to="/dang-tin">
          <Button type="primary" icon={<PlusOutlined />}>
            Đăng tin mới
          </Button>
        </Link>
      </div>
      {submitted && (
        <Alert
          type="success"
          showIcon
          message="Tin đã được gửi để xét duyệt"
          description="Tin sẽ xuất hiện công khai sau khi Admin phê duyệt."
          closable
          onClose={() => setSubmitted(false)}
        />
      )}
      <Tabs
        activeKey={status}
        onChange={setStatus}
        items={[
          { key: 'all', label: `Tất cả (${books.length})` },
          ...(['pending', 'active', 'rejected', 'sold', 'hidden'] as const).map(
            (key) => ({
              key,
              label: `${statusNames[key]} (${books.filter((book) => book.status === key).length})`,
            }),
          ),
        ]}
      />
      {error ? (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={load}>Thử lại</Button>}
        />
      ) : loading ? (
        <Skeleton paragraph={{ rows: 5 }} />
      ) : !filtered.length ? (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có tin đăng trong trạng thái này"
          />
          <Link to="/dang-tin">
            <Button>Đăng cuốn sách của bạn</Button>
          </Link>
        </div>
      ) : (
        <List
          className="own-listings"
          dataSource={filtered}
          renderItem={(book) => (
            <List.Item
              key={book.id}
              actions={[
                <Button key="view" onClick={() => setSelected(book)}>Xem nội dung</Button>,
                ...(book.status !== 'sold' ? [
                  <Link key="edit" to={`/tin-cua-toi/${book.id}/sua`}><Button disabled={!!changing}>{book.status === 'hidden' ? 'Sửa và gửi duyệt lại' : 'Chỉnh sửa'}</Button></Link>,
                  <Button key="sold" disabled={!!changing} onClick={() => changeStatus(book,'sold')}>Đã bán</Button>,
                ] : []),
                ...(['active','pending','rejected'].includes(book.status ?? '') ? [
                  <Button key="hide" disabled={!!changing} onClick={() => changeStatus(book,'hidden')}>Ẩn tin</Button>,
                ] : []),
              ]}
            >
              <div className="own-listing-media">
                <BookCover book={book} />
              </div>
              <List.Item.Meta
                title={book.title}
                description={
                  <>
                    {book.author}
                    <br />
                    {shortDate(book.created_at)} · {book.city}
                  </>
                }
              />
              <div className="own-listing-state">
                <strong className="num">{money(book.price)}</strong>
                <Tag className={`status-${book.status}`}>
                  {statusNames[book.status ?? 'pending']}
                </Tag>
              </div>
            </List.Item>
          )}
        />
      )}
      <Drawer
        title="Nội dung tin đăng"
        keyboard={!galleryOpen}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={560}
      >
        {selected && (
          <div className="own-preview">
            <BookGallery key={selected.id} book={selected} onPreviewChange={setGalleryOpen} />
            <Tag>{statusNames[selected.status ?? 'pending']}</Tag>
            <h2>{selected.title}</h2>
            <p>{selected.author}</p>
            <strong className="num">{money(selected.price)}</strong>
            <p>{selected.description}</p>
            {selected.status === 'rejected' && <Alert type="warning" message="Lý do từ chối" description={selected.review_note || 'Chưa có ghi chú từ Admin.'} />}
            {selected.status === 'sold' && <Alert type="info" message="Tin đã kết thúc vì sách đã bán." />}
            {selected.status === 'active' && (
              <Link to={`/sach/${selected.id}`}>
                <Button>Xem tin công khai</Button>
              </Link>
            )}
          </div>
        )}
      </Drawer>
    </AccountLayout>
  );
}
