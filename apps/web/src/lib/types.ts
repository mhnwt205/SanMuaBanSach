export type Role = 'user' | 'seller' | 'admin';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_super_admin?: boolean;
  cms_access?: boolean;
  permissions?: string[];
};
export const hasPermission = (user: User | null, permission: string) =>
  Boolean(user?.is_super_admin) ||
  Boolean(user?.permissions?.includes(permission));
export type BookCondition = 'new' | 'like_new' | 'good' | 'acceptable';
export type ListingStatus =
  | 'pending'
  | 'active'
  | 'rejected'
  | 'sold'
  | 'hidden';
export type Book = {
  id: string;
  title: string;
  author: string;
  price: number;
  condition: BookCondition;
  category: string;
  city: string;
  description: string;
  seller: string;
  seller_id?: string;
  image?: string;
  images?: string[];
  image_keys?: string;
  created_at?: string;
  status?: ListingStatus;
  version?: number;
  review_note?: string;
  deleted_at?: string | null;
  demo?: boolean;
  cover?: { color: string; ink: string; motif: number };
};
export type SellerApplication = {
  review_note?: string;
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
};

export const conditionNames: Record<BookCondition, string> = {
  new: 'Mới',
  like_new: 'Như mới',
  good: 'Tốt',
  acceptable: 'Đã qua sử dụng',
};
export const statusNames: Record<ListingStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Đang hiển thị',
  rejected: 'Chưa được duyệt',
  sold: 'Đã bán',
  hidden: 'Đã ẩn',
};
export const categories = [
  'Văn học',
  'Kỹ năng',
  'Tâm lý',
  'Kinh tế',
  'Giáo khoa',
];
export const cities = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Cần Thơ',
  'Hải Phòng',
];
export const money = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
export const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(
        new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'),
      )
    : 'Vừa cập nhật';

export function normalizeBook(input: Record<string, unknown>): Book {
  let image: string | undefined;
  let images: string[] = [];
  try {
    const keys =
      typeof input.image_keys === 'string'
        ? JSON.parse(input.image_keys)
        : input.image_keys;
    if (Array.isArray(keys)) {
      images = keys.filter((key): key is string => typeof key === 'string').map(key => `/api/images/${key}`);
      image = images[0];
    }
  } catch {
    /* A missing cover never prevents reading a listing. */
  }
  return {
    ...input,
    id: String(input.id),
    title: String(input.title),
    author: String(input.author ?? ''),
    price: Number(input.price ?? input.price_vnd),
    condition: input.condition as BookCondition,
    category: String(input.category),
    city: String(input.city),
    description: String(input.description ?? ''),
    seller: String(input.seller ?? ''),
    image,
    images,
  } as Book;
}
