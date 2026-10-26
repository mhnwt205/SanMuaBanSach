import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Image, Skeleton } from 'antd';
import {
  EnvironmentOutlined,
  HeartFilled,
  HeartOutlined,
} from '@ant-design/icons';
import { useSaved } from '../lib/saved';
import { conditionNames, money, shortDate, type Book } from '../lib/types';
import { useReveal } from '../lib/motion';

export function BookCover({
  book,
  large = false,
}: {
  book: Book;
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (book.image && !broken)
    return (
      <div className={`cover-photo ${large ? 'cover-large' : ''}`}>
        <img
          src={book.image}
          onError={() => setBroken(true)}
          alt={`Ảnh sách ${book.title}`}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  const art = book.cover ?? { color: '#e0e8ec', ink: '#213c46', motif: 1 };
  return (
    <div
      className={`cover-art motif-${art.motif} ${large ? 'cover-large' : ''}`}
      style={
        { '--cover-bg': art.color, '--cover-ink': art.ink } as CSSProperties
      }
      role="img"
      aria-label={`Bìa minh họa: ${book.title}`}
    >
      <div className="jacket-spine" />
      <span className="jacket-author">{book.author || 'Sách giấy cũ'}</span>
      <div className="jacket-motif" />
      <span className="jacket-title">{book.title}</span>
      <span className="jacket-note">
        {book.demo ? 'Bìa minh họa' : 'Chưa có ảnh'}
      </span>
    </div>
  );
}

export function BookGallery({ book, onPreviewChange }: { book: Book; onPreviewChange?: (visible: boolean) => void }) {
  const [active, setActive] = useState(0);
  const [failed,setFailed] = useState<string[]>([]);
  const images = book.images?.length ? book.images : book.image ? [book.image] : [];
  if (!images.length) return <BookCover book={book} large />;
  const current = Math.min(active, images.length - 1);
  return <div className="book-photo-gallery">
    {failed.includes(images[current]) ? <div className="gallery-error" role="status"><p>Chưa tải được ảnh {current+1}.</p><Button onClick={() => setFailed(values=>values.filter(src=>src!==images[current]))}>Thử tải lại ảnh</Button></div> : <Image key={images[current]} src={images[current]} alt={`Ảnh ${current + 1} của sách ${book.title}`} width="100%" style={{ maxHeight: 520, objectFit: 'contain' }} onError={() => setFailed(values=>[...new Set([...values,images[current]])])} preview={{onVisibleChange:onPreviewChange}} />}
    <div className="book-photo-thumbnails" aria-label="Các ảnh sách">
      {images.map((src, index) => <button type="button" key={src} aria-label={`Xem ảnh ${index + 1}`}
        aria-pressed={current === index} onClick={() => setActive(index)}>
        <img src={src} alt={`Ảnh sách ${index + 1}`} loading="lazy" decoding="async" />
      </button>)}
    </div>
    <p>Ảnh {current + 1}/{images.length} · Bấm ảnh để phóng to</p>
  </div>;
}

export function BookCard({ book }: { book: Book }) {
  const coverRef = useReveal({ variant: 'image', onceKey: book.id });
  const { has, toggle } = useSaved();
  const saved = has(book.id);
  return (
    <article className="book-card">
      <div className="book-visual">
        <Link
          to={`/sach/${book.id}`}
          className="book-cover-link"
          aria-label={`Xem ${book.title}`}
        >
          <div ref={coverRef} className="cover-motion"><BookCover book={book} /></div>
        </Link>
        <button
          className={`save-control ${saved ? 'is-saved' : ''}`}
          onClick={() => toggle(book)}
          aria-label={`${saved ? 'Bỏ lưu' : 'Lưu'} ${book.title}`}
          aria-pressed={saved}
        >
          {saved ? <HeartFilled /> : <HeartOutlined />}
        </button>
        {book.demo && <span className="sample-mark">Mẫu</span>}
      </div>
      <div className="book-info">
        <p className="book-category">{book.category}</p>
        <h3>
          <Link to={`/sach/${book.id}`}>{book.title}</Link>
        </h3>
        <p className="book-author">{book.author || 'Chưa cập nhật tác giả'}</p>
        <p className="book-price num">{money(book.price)}</p>
        <div className="book-condition">
          <span className="condition-dot" />
          {conditionNames[book.condition]}
        </div>
        <div className="book-location">
          <span>
            <EnvironmentOutlined />
            {book.city}
          </span>
          <span>{book.demo ? 'Minh họa' : shortDate(book.created_at)}</span>
        </div>
      </div>
    </article>
  );
}

export function BookGrid({
  books,
  loading = false,
  empty = 'Chưa có cuốn sách phù hợp',
  columns = 5,
}: {
  books: Book[];
  loading?: boolean;
  empty?: string;
  columns?: number;
}) {
  if (loading)
    return (
      <div className={`book-grid columns-${columns}`}>
        {Array.from({ length: columns }, (_, index) => (
          <div className="book-skeleton" key={index}>
            <div className="skeleton-cover" />
            <Skeleton title paragraph={{ rows: 3 }} />
          </div>
        ))}
      </div>
    );
  if (!books.length)
    return (
      <div className="empty-panel">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
        <Link to="/kham-pha">
          <Button>Khám phá sách khác</Button>
        </Link>
      </div>
    );
  return (
    <div className={`book-grid columns-${columns}`}>
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
