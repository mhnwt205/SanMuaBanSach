import type { Book } from './types';

// Honest UI examples, never submitted to D1 or counted as live listings.
// Their flat typographic jackets are illustrations, not photographs of sellers' books.
export const demoBooks: Book[] = [
  {
    id: 'mau-1',
    title: 'Nhà giả kim',
    author: 'Paulo Coelho',
    price: 42000,
    condition: 'like_new',
    category: 'Văn học',
    city: 'Hà Nội',
    seller: 'Minh Anh',
    demo: true,
    description:
      'Ví dụ minh họa cách trình bày một cuốn sách bìa mềm, còn đủ trang và được giữ gìn cẩn thận. Đây chưa phải tin bán thật.',
    cover: { color: '#dbb660', ink: '#242b38', motif: 1 },
  },
  {
    id: 'mau-2',
    title: 'Tuổi trẻ đáng giá bao nhiêu',
    author: 'Rosie Nguyễn',
    price: 55000,
    condition: 'good',
    category: 'Kỹ năng',
    city: 'TP. Hồ Chí Minh',
    seller: 'Thu Hà',
    demo: true,
    description:
      'Tin minh họa dành cho giao diện. Khi đăng tin thật, người bán sẽ mô tả rõ phần bìa, gáy và những ghi chú bên trong.',
    cover: { color: '#e0e8df', ink: '#25564c', motif: 2 },
  },
  {
    id: 'mau-3',
    title: 'Dế mèn phiêu lưu ký',
    author: 'Tô Hoài',
    price: 28000,
    condition: 'good',
    category: 'Văn học',
    city: 'Đà Nẵng',
    seller: 'Bảo Ngọc',
    demo: true,
    description:
      'Sách mẫu để khám phá bố cục website. Không có giao dịch hoặc thông tin liên hệ thật cho tin này.',
    cover: { color: '#748d63', ink: '#fffef7', motif: 3 },
  },
  {
    id: 'mau-4',
    title: 'Cà phê cùng Tony',
    author: 'Tony Buổi Sáng',
    price: 39000,
    condition: 'like_new',
    category: 'Kỹ năng',
    city: 'Hà Nội',
    seller: 'Quang Huy',
    demo: true,
    description:
      'Ví dụ về tin sách kỹ năng với giá và khu vực rõ ràng. Bạn có thể dùng bộ lọc để thử tìm cuốn sách phù hợp.',
    cover: { color: '#bc5945', ink: '#fff9ed', motif: 4 },
  },
  {
    id: 'mau-5',
    title: 'Totto-chan bên cửa sổ',
    author: 'Kuroyanagi Tetsuko',
    price: 45000,
    condition: 'good',
    category: 'Văn học',
    city: 'Cần Thơ',
    seller: 'Linh Chi',
    demo: true,
    description:
      'Dữ liệu minh họa, không phải sách đang được rao bán. Tin thật sẽ có nội dung và ảnh do Seller đăng sau khi được duyệt.',
    cover: { color: '#c2d8e1', ink: '#254358', motif: 5 },
  },
  {
    id: 'mau-6',
    title: 'Đi tìm lẽ sống',
    author: 'Viktor E. Frankl',
    price: 60000,
    condition: 'like_new',
    category: 'Tâm lý',
    city: 'TP. Hồ Chí Minh',
    seller: 'Đức Anh',
    demo: true,
    description:
      'Tin minh họa một cuốn sách tâm lý. Giao dịch thực tế sẽ do người mua và người bán tự thỏa thuận.',
    cover: { color: '#3f5c72', ink: '#fff5dd', motif: 6 },
  },
  {
    id: 'mau-7',
    title: 'Tư duy nhanh và chậm',
    author: 'Daniel Kahneman',
    price: 85000,
    condition: 'good',
    category: 'Kinh tế',
    city: 'Hà Nội',
    seller: 'Phương Linh',
    demo: true,
    description:
      'Sách mẫu giúp bạn trải nghiệm bộ lọc giá, danh mục và khu vực trước khi cộng đồng có tin thật.',
    cover: { color: '#eaded3', ink: '#88382e', motif: 7 },
  },
  {
    id: 'mau-8',
    title: 'Toán cao cấp',
    author: 'Nguyễn Đình Trí',
    price: 35000,
    condition: 'acceptable',
    category: 'Giáo khoa',
    city: 'Đà Nẵng',
    seller: 'Hoàng Nam',
    demo: true,
    description:
      'Tin minh họa cho nhóm giáo trình. Khi bán sách đã ghi chú, hãy mô tả trung thực những trang đã viết.',
    cover: { color: '#4b6589', ink: '#ffffff', motif: 8 },
  },
];

/** UI-only examples. Never use samples to hide an API failure or a filtered miss. */
export function filterDemoBooks(books: Book[], params: URLSearchParams): Book[] {
  const q=(params.get('q') ?? '').trim().toLocaleLowerCase('vi');
  const rows=books.filter(book => (!q || `${book.title} ${book.author} ${book.description}`.toLocaleLowerCase('vi').includes(q))
    && (!params.get('category') || book.category===params.get('category'))
    && (!params.get('city') || book.city===params.get('city'))
    && book.price>=Number(params.get('min') ?? 0) && book.price<=Number(params.get('max') ?? 100000000));
  if(params.get('sort')==='price_asc') rows.sort((a,b)=>a.price-b.price);
  if(params.get('sort')==='price_desc') rows.sort((a,b)=>b.price-a.price);
  return rows;
}
