import { useCategories } from '../lib/categories';
import { useEffect, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  Alert,
  Avatar,
  Breadcrumb,
  Button,
  Descriptions,
  Empty,
  Skeleton,
  Space,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BookOutlined,
  BulbOutlined,
  ReadOutlined,
  ExperimentOutlined,
  RiseOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  HeartFilled,
  HeartOutlined,
  PhoneOutlined,
  SafetyOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { BookCover, BookGallery, BookGrid } from '../components/Books';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import ReportListing from '../components/ReportListing';
import { demoBooks } from '../lib/demo';
import { useSaved } from '../lib/saved';
import { useBookSceneMotion } from '../lib/motion';
import Reveal from '../components/Reveal';
import campaignImage from '../assets/book-campaign-1120.webp';
import campaignSmall from '../assets/book-campaign-640.webp';
import readingCorner from '../assets/reading-corner-860.webp';
import readingCornerSmall from '../assets/reading-corner-480.webp';
import {
  conditionNames,
  money,
  normalizeBook,
  shortDate,
  type Book,
} from '../lib/types';

function useCatalog() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision,setRevision] = useState(0);
  const [demo,setDemo] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);setError('');
    api<{ items: Record<string, unknown>[] }>('/listings?limit=10', {signal:controller.signal})
      .then((data) => {
        if (!active) return;
        setDemo(data.items.length === 0);
        setBooks(data.items.length ? data.items.map(normalizeBook) : demoBooks);
      })
      .catch((issue) => {
        if (active) setError(errorMessage(issue));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;controller.abort();
    };
  }, [revision]);
  return { books, loading, demo, error, retry:() => setRevision(value => value+1) };
}

function DemoNotice() {
  return (
    <div className="sample-notice">
      <BookOutlined />
      <span>
        Đang xem sách minh họa. Tin bán thật sẽ xuất hiện sau khi được xét
        duyệt.
      </span>
    </div>
  );
}
function LoadError({ message, retry = () => window.location.reload() }: { message: string; retry?:()=>void }) {
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      action={<Button onClick={retry}>Thử lại</Button>}
    />
  );
}

function HomeCategory({ category }: { category: string }) {
  const CategoryIcon = ({ 'Văn học': ReadOutlined, 'Kỹ năng': BulbOutlined, 'Tâm lý': HeartOutlined, 'Kinh tế': RiseOutlined, 'Giáo khoa': ExperimentOutlined } as Record<string, typeof BookOutlined>)[category] ?? BookOutlined;
  return <Link to={`/kham-pha?category=${encodeURIComponent(category)}`}>
    <span className="category-symbol"><CategoryIcon /></span><span className="category-copy"><strong>{category}</strong><small>Khám phá sách</small></span><ArrowRightOutlined />
  </Link>;
}

export function HomePage() {
  const bookSceneRef = useBookSceneMotion();
  const { categories, error:categoryError, refresh:retryCategories } = useCategories();
  const { books, loading, demo, error, retry } = useCatalog();
  return (
    <div className="container home-page">
      <section ref={bookSceneRef} className="home-intro">
        <div className="home-intro-copy">
          <div className="intro-overline"><span>SÁCH CŨ · CÂU CHUYỆN MỚI</span></div>
          <h1>Trang sách cũ.<br /><em>Niềm vui mới.</em></h1>
          <p>
            Có những cuốn sách chỉ đang chờ một người đọc tiếp. Tìm cuốn bạn yêu, với mức giá dễ thương hơn.
          </p>
          <Link to="/kham-pha">
            <Button type="primary" size="large">
              Khám phá kệ sách <ArrowRightOutlined />
            </Button>
          </Link>
          <div className="intro-assurances"><span><CheckCircleOutlined /> Tin đăng được xét duyệt</span><span><SafetyOutlined /> Kết nối trực tiếp</span></div>
        </div>
        <figure className="intro-visual">
          <div className="intro-books"><div className="campaign-photo"><img src={campaignImage} srcSet={`${campaignSmall} 640w, ${campaignImage} 1120w`} sizes="(max-width: 760px) 100vw, 50vw" width={1120} height={747} fetchPriority="high" alt="Những cuốn sách cũ bên trang sách đang mở, trên bục xanh dưới nắng cửa sổ" /></div></div>
          <figcaption><span>MỘT CUỐN SÁCH. NHIỀU NGƯỜI ĐỌC.</span><span>Ảnh minh họa</span></figcaption>
        </figure>
      </section>
      <div className="bookstore-benefits"><span><BookOutlined /> Chỉ dành cho sách giấy</span><span><CheckCircleOutlined /> Người bán được phê duyệt</span><span><PhoneOutlined /> Chủ động trao đổi, giao nhận</span><Link to="/huong-dan">Cách chợ sách hoạt động <ArrowRightOutlined /></Link></div>
      {categoryError && <Alert type="error" showIcon message="Chưa tải được danh mục sách" action={<Button onClick={() => void retryCategories().catch(() => {})}>Thử lại danh mục</Button>} />}
      <div className="category-heading"><span className="editorial-eyebrow">MỖI SỞ THÍCH, MỘT KỆ SÁCH</span><h2>Bạn muốn đọc gì hôm nay?</h2></div>
      <nav className="home-categories" aria-label="Danh mục sách">
        {categories.map((category) => <HomeCategory key={category} category={category} />)}
      </nav>
      <section className="shelf-section">
        <div className="section-heading">
          <Reveal className="shelf-heading-copy">
            <span className="editorial-eyebrow">KHÁM PHÁ TỪNG TRANG</span>
            <h2>{demo ? 'Góc sách gợi ý' : 'Sách mới lên kệ'}</h2>
            <p>
              {demo
                ? 'Một vòng khám phá trước khi chọn cuốn sách của bạn.'
                : 'Những tin bán đã được xét duyệt, sẵn sàng để bạn khám phá.'}
            </p>
          </Reveal>
          <Link to="/kham-pha">
            Xem tất cả <ArrowRightOutlined />
          </Link>
        </div>
        <div className="shelf-shortcuts"><Link to="/kham-pha?sort=newest">Mới đăng <ArrowRightOutlined /></Link><Link to="/kham-pha?max=50000">Sách đến 50.000đ</Link><Link to="/kham-pha?sort=price_asc">Giá thấp trước</Link></div>
        {demo && <DemoNotice />}
        {error ? (
          <LoadError message={error} retry={retry} />
        ) : (
          <BookGrid books={books.slice(0, 10)} loading={loading} columns={books.length <= 8 ? 4 : 5} />
        )}
      </section>
      <section className="discovery-stories" aria-label="Gợi ý khám phá sách">
        <Link className="discovery-story discovery-budget" to="/kham-pha?max=50000"><div><span className="editorial-eyebrow">ĐỌC NHIỀU HƠN, CHI ÍT HƠN</span><h2>Một cuốn sách hay.<br />Một mức giá vừa túi.</h2><p>Khám phá sách đến 50.000đ.</p><span className="editorial-link">Tìm sách hợp túi tiền <ArrowRightOutlined /></span></div><div className="discovery-art" aria-hidden="true"><BookCover book={demoBooks[4]} /><small>Bìa minh họa</small></div></Link>
        <Link className="discovery-story discovery-library" to={categories.includes('Văn học') ? `/kham-pha?category=${encodeURIComponent('Văn học')}` : '/kham-pha'}><div><span className="editorial-eyebrow">DÀNH MỘT CHÚT THỜI GIAN CHO MÌNH</span><h2>Gấp lại bộn bề.<br />Mở ra một câu chuyện.</h2><p>Tìm một cuốn sách để đọc chậm.</p><span className="editorial-link">Dạo quanh kệ sách <ArrowRightOutlined /></span></div><div className="discovery-art" aria-hidden="true"><BookCover book={demoBooks[0]} /><small>Bìa minh họa</small></div></Link>
      </section>
      <section className="reading-story" aria-labelledby="reading-story-title">
        <Reveal className="reading-story-intro">
          <span className="reading-story-eyebrow">Một cuốn sách. Nhiều người đọc.</span>
          <h2 id="reading-story-title">Sách hay xứng đáng<br /><em>được đọc tiếp.</em></h2>
          <p>Một nơi để tìm lại cuốn sách bạn cần, và gửi những cuốn đã đọc đến người đang tìm.</p>
        </Reveal>
        <div className="reading-story-layout">
          <div className="reading-story-sticky">
            <Reveal className="reading-story-art" variant="image">
              <img src={readingCorner} srcSet={`${readingCornerSmall} 480w, ${readingCorner} 860w`} sizes="(max-width: 760px) 100vw, 50vw" width={860} height={1075} loading="lazy" decoding="async" alt="Góc đọc sách với ghế xanh, bàn sách và những kệ sách gỗ" />
              <span>Không gian đọc minh họa · Cảm hứng cho một hành trình mới</span>
            </Reveal>
          </div>
          <div className="reading-story-steps">
            <Reveal className="reading-story-step">
              <span className="reading-story-number"><SafetyOutlined /> 01</span>
              <h3>Mua bán rõ ràng.</h3>
              <p>Xem ảnh thật, đọc kỹ tình trạng và trao đổi với người bán trước khi chọn một cuốn sách.</p>
            </Reveal>
            <Reveal className="reading-story-step">
              <span className="reading-story-number"><PhoneOutlined /> 02</span>
              <h3>Kết nối đúng lúc.</h3>
              <p>Đăng nhập rồi chủ động bấm để xem số điện thoại. Bạn và người bán tự thỏa thuận cách thanh toán, giao nhận.</p>
            </Reveal>
            <Reveal className="reading-story-step">
              <span className="reading-story-number"><CheckCircleOutlined /> 03</span>
              <h3>An tâm từ người đăng.</h3>
              <p>Người bán được phê duyệt trước khi đăng sách. Mỗi tin đăng được xét duyệt trước khi xuất hiện trên kệ.</p>
            </Reveal>
            <Link className="reading-story-link" to="/an-toan">Tìm hiểu cách giao dịch an toàn <ArrowRightOutlined /></Link>
          </div>
        </div>
      </section>
      <section className="intro-sell seller-invitation"><span className="intro-sell-icon"><ShopOutlined /></span><div><span className="intro-sell-label">DỌN KỆ NHÀ MÌNH, LÀM ĐẦY KỆ NHÀ AI</span><h2>Đọc xong rồi? Sang tay cuốn sách.</h2><p>Đăng tin miễn phí trong giai đoạn ra mắt. Người bán cần được phê duyệt trước khi đăng.</p></div><Link to="/dang-tin">Bắt đầu đăng bán <ArrowRightOutlined /></Link></section>
    </div>
  );
}

export function BookPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { has, toggle } = useSaved();
  const navigate = useNavigate();
  const location = useLocation();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision,setRevision]=useState(0);
  const [phone, setPhone] = useState<string | null>(null);
  const [contactError, setContactError] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setBook(null);
    setPhone(null);
    setContactError('');
    const example = demoBooks.find((item) => item.id === id);
    if (example) {
      setBook(example);
      setLoading(false);
      return;
    }
    api<{ item: Record<string, unknown> }>(
      `/listings/${encodeURIComponent(id ?? '')}`,
    )
      .then((data) => {
        if (active) setBook(normalizeBook(data.item));
      })
      .catch((issue) => {
        if (active) setError(errorMessage(issue));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id,revision]);
  useEffect(() => {
    setPhone(null);
    setContactError('');
  }, [user?.id]);
  async function reveal() {
    if (!user) {
      navigate('/dang-nhap', { state: { from: location.pathname } });
      return;
    }
    if (!book || book.demo) return;
    setContactLoading(true);
    setContactError('');
    try {
      const data = await api<{ phone: string }>(`/listings/${book.id}/contact`);
      setPhone(data.phone);
    } catch (issue) {
      setContactError(errorMessage(issue));
    } finally {
      setContactLoading(false);
    }
  }
  if (loading)
    return (
      <div className="container detail-page">
        <Skeleton active={false} paragraph={{ rows: 10 }} />
      </div>
    );
  if (error || !book)
    return (
      <div className="container empty-panel">
        <Empty description={error || 'Không tìm thấy tin đăng'} />
        <Button onClick={() => setRevision(value=>value+1)}>Thử lại</Button>{' '}
        <Link to="/kham-pha">
          <Button>Quay lại tìm sách</Button>
        </Link>
      </div>
    );
  return (
    <div className="container detail-page">
      <Breadcrumb
        items={[
          { title: <Link to="/">Trang chủ</Link> },
          { title: <Link to="/kham-pha">Sách cũ</Link> },
          {
            title: (
              <Link
                to={`/kham-pha?category=${encodeURIComponent(book.category)}`}
              >
                {book.category}
              </Link>
            ),
          },
          { title: book.title },
        ]}
      />
      {book.demo && <DemoNotice />}
      <div className="detail-layout">
        <section className="book-detail-sheet">
          <div className="detail-main">
            <div className="detail-gallery">
              <BookGallery key={book.id} book={book} />
              <span>
                {book.image
                  ? 'Ảnh do người bán đăng'
                  : 'Bìa minh họa · xem mô tả tình trạng sách'}
              </span>
            </div>
            <div className="detail-summary">
              <div className="detail-overline"><p className="book-category">{book.category}</p><span>SÁCH GIẤY ĐÃ QUA SỬ DỤNG</span></div>
              <h1>{book.title}</h1>
              <p className="detail-author">
                {book.author || 'Chưa cập nhật tác giả'}
              </p>
              <div className="detail-price-row"><p className="detail-price num">{money(book.price)}</p><span className="condition-label">{conditionNames[book.condition]}</span></div>
              <p className="detail-place">
                <EnvironmentOutlined /> {book.city}
              </p>
              <p className="muted">
                {book.demo
                  ? 'Tin minh họa giao diện'
                  : `Đăng ngày ${shortDate(book.created_at)}`}
              </p>
              <Button
                icon={has(book.id) ? <HeartFilled /> : <HeartOutlined />}
                onClick={() => toggle(book)}
              >
                {has(book.id) ? 'Đã lưu cuốn sách' : 'Lưu cuốn sách'}
              </Button>
            </div>
          </div>
          <Reveal className="detail-description">
            <h2>Mô tả cuốn sách</h2>
            <p>
              {book.description ||
                'Người bán chưa bổ sung mô tả. Hãy hỏi thêm về bìa, gáy sách, số trang và các ghi chú trước khi mua.'}
            </p>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: 'author',
                  label: 'Tác giả',
                  children: book.author || 'Chưa cập nhật',
                },
                {
                  key: 'condition',
                  label: 'Tình trạng',
                  children: conditionNames[book.condition],
                },
                { key: 'category', label: 'Danh mục', children: book.category },
                { key: 'city', label: 'Khu vực', children: book.city },
              ]}
            />
          </Reveal>
        </section>
        <aside className="contact-panel">
          <div className="contact-heading"><span>TRAO ĐỔI TRỰC TIẾP</span><h2>Liên hệ người bán</h2><p>Thỏa thuận thanh toán và giao nhận trực tiếp với người đăng.</p></div>
          <div className="seller-identity">
            <Avatar size={46}>{book.seller.slice(0, 1)}</Avatar>
            <div>
              <h2>{book.seller}</h2>
              <span>{book.demo ? 'Người bán minh họa' : 'Người đăng tin'}</span>
            </div>
          </div>
          {book.seller_id && (
            <Link
              className="seller-store-link"
              to={`/nguoi-ban/${book.seller_id}`}
            >
              Xem các sách của người bán <ArrowRightOutlined />
            </Link>
          )}
          <div className="contact-actions">
            {book.demo ? (
              <Alert
                type="info"
                message="Đây là tin mẫu"
                description="Chưa có người bán thật hoặc số điện thoại liên hệ."
              />
            ) : (
              <>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<PhoneOutlined />}
                  loading={contactLoading}
                  onClick={() => void reveal()}
                >
                  {user && phone
                    ? phone
                    : user
                      ? 'Hiện số điện thoại'
                      : 'Đăng nhập để liên hệ'}
                </Button>
                {user && phone && (
                  <a className="phone-link" href={`tel:${phone}`}>
                    Gọi người bán <ArrowRightOutlined />
                  </a>
                )}
                {contactError && (
                  <Alert type="error" showIcon message={contactError} />
                )}
                <p className="contact-explainer">
                  Chỉ người đã đăng nhập mới xem được số điện thoại khi bấm nút.
                </p>
              </>
            )}
          </div>
          {!book.demo && <ReportListing key={book.id + (user?.id ?? 'guest')} id={book.id} sellerId={book.seller_id} />}
          <div className="safety-note">
            <SafetyOutlined />
            <h3>Hẹn một giao dịch an tâm</h3>
            <ul>
              <li>Hỏi ảnh thật và tình trạng trước khi mua.</li>
              <li>Kiểm tra sách khi nhận nếu có thể.</li>
              <li>Cẩn trọng với yêu cầu đặt cọc bất thường.</li>
            </ul>
            <Link to="/an-toan">Xem hướng dẫn an toàn</Link>
          </div>
        </aside>
      </div>
      <Link to="/kham-pha" className="back-link">
        <ArrowLeftOutlined /> Tiếp tục khám phá sách
      </Link>
    </div>
  );
}

export function SavedPage() {
  const { books } = useSaved();
  return (
    <div className="container standard-page">
      <div className="page-heading">
        <div>
          <h1>Sách đã lưu</h1>
          <p>
            {books.length} cuốn sách được lưu trên thiết bị này. Giá và tình
            trạng mới nhất nằm trong chi tiết tin.
          </p>
        </div>
      </div>
      <BookGrid
        books={books}
        empty="Bạn chưa lưu cuốn sách nào. Bấm biểu tượng trái tim trên một tin để lưu lại."
      />
    </div>
  );
}

export function SellerPage() {
  const { id } = useParams();
  const [data, setData] = useState<{
    seller: { name: string; created_at: string };
    books: Book[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    api<{
      seller: { name: string; created_at: string };
      items: Record<string, unknown>[];
    }>(`/sellers/${encodeURIComponent(id ?? '')}`)
      .then((result) => {
        if (active)
          setData({
            seller: result.seller,
            books: result.items.map(normalizeBook),
          });
      })
      .catch((issue) => {
        if (active) setError(errorMessage(issue));
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="container standard-page">
      <Breadcrumb
        items={[
          { title: <Link to="/">Trang chủ</Link> },
          { title: 'Người bán' },
        ]}
      />
      {error ? (
        <LoadError message={error} />
      ) : !data ? (
        <Skeleton paragraph={{ rows: 5 }} />
      ) : (
        <>
          <div className="seller-profile-header">
            <Avatar size={68}>{data.seller.name.slice(0, 1)}</Avatar>
            <div>
              <h1>{data.seller.name}</h1>
              <p>Thành viên từ {shortDate(data.seller.created_at)}</p>
            </div>
            <span>{data.books.length} tin đang hiển thị trong lượt này</span>
          </div>
          <div className="section-heading">
            <h2>Kệ sách của người bán</h2>
          </div>
          <BookGrid books={data.books} />
        </>
      )}
    </div>
  );
}

const info = {
  '/huong-dan': {
    title: 'Mua bán sách, thật dễ',
    intro:
      'Chợ Sách Cũ giúp bạn tìm thấy nhau. Hai bên tự thỏa thuận giá, thanh toán và giao nhận.',
    sections: [
      [
        'Bạn đang tìm sách?',
        'Tìm theo tên, tác giả hoặc danh mục. Lọc thêm mức giá và khu vực, rồi đọc kỹ mô tả và tình trạng sách. Đăng nhập và bấm hiện số điện thoại để hỏi trực tiếp người bán.',
      ],
      [
        'Bạn muốn bán sách?',
        'Tạo tài khoản và gửi yêu cầu trở thành người bán kèm số điện thoại. Khi được Admin duyệt, bạn có thể đăng tin. Tin mới chỉ xuất hiện sau khi được kiểm duyệt.',
      ],
      [
        'Đăng tin có mất phí không?',
        'Giai đoạn đầu miễn phí đăng tin trong 6 tháng hoạt động. Hiện chưa kích hoạt thu tiền, tin VIP, ví điện tử hoặc phí giao dịch.',
      ],
    ],
  },
  '/an-toan': {
    title: 'Một giao dịch an tâm',
    intro:
      'Dành một chút thời gian để kiểm tra, hỏi kỹ và thỏa thuận rõ trước khi chốt.',
    sections: [
      [
        'Nhìn kỹ cuốn sách',
        'Hỏi ảnh thật của bìa, gáy và phần ruột. Xác nhận đủ trang, các vết ố, phần ghi chú và đúng phiên bản bạn cần.',
      ],
      [
        'Thỏa thuận rõ ràng',
        'Hai bên cần thống nhất giá cuối, phí gửi sách, phương thức thanh toán và cách xử lý nếu sách không đúng mô tả. Khi gặp trực tiếp, chọn nơi công cộng và kiểm tra sách trước khi trả tiền.',
      ],
      [
        'Giữ thông tin riêng tư',
        'Không cung cấp mã OTP, mật khẩu hay thông tin ngân hàng qua đường dẫn lạ. Số điện thoại người bán chỉ được hiển thị sau đăng nhập; hãy dùng đúng mục đích liên hệ mua sách.',
      ],
    ],
  },
  '/quyen-rieng-tu': {
    title: 'Quyền riêng tư',
    intro:
      'Thông tin tài khoản được dùng để xác thực và kết nối người mua với người bán.',
    sections: [
      [
        'Thông tin được lưu',
        'Tài khoản gồm tên hiển thị, email, mật khẩu đã băm và phiên đăng nhập. Khi xin bán, bạn cung cấp số điện thoại và lời giới thiệu để Admin xét duyệt.',
      ],
      [
        'Thông tin hiển thị',
        'Tin công khai hiển thị tên người bán và thông tin sách. Email và hash mật khẩu không xuất hiện trong API tin công khai. Số điện thoại chỉ hiển thị cho người đã đăng nhập khi họ chủ động bấm nút liên hệ.',
      ],
      [
        'Dữ liệu trên thiết bị',
        'Website dùng cookie HttpOnly để duy trì đăng nhập. Danh sách sách đã lưu nằm trên trình duyệt của bạn và chưa đồng bộ giữa các thiết bị. Bạn có thể đăng xuất và xóa dữ liệu trình duyệt khi dùng máy chung.',
      ],
    ],
  },
};
export function InfoPage() {
  const location = useLocation();
  const page =
    info[location.pathname as keyof typeof info] ?? info['/huong-dan'];
  return (
    <div className="container info-page">
      <Breadcrumb
        items={[
          { title: <Link to="/">Trang chủ</Link> },
          { title: page.title },
        ]}
      />
      <header>
        <p className="intro-label">Đồng hành cùng người đọc</p>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
      </header>
      <div className="info-sections">
        {page.sections.map(([title, copy], index) => (
          <section key={title}>
            <span className="info-number">0{index + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </section>
        ))}
      </div>
      <Space>
        <Link to="/kham-pha">
          <Button type="primary">Khám phá sách</Button>
        </Link>
        <Link to="/dang-tin">
          <Button>Đăng bán sách</Button>
        </Link>
      </Space>
    </div>
  );
}
