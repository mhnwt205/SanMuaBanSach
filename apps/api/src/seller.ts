import { Hono, type MiddlewareHandler } from 'hono';
import type { Env, AppContext } from './security.ts';

const fail = (c: AppContext, error: string, status: 400 | 403 | 404 | 409 = 400) => c.json({ error }, status);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
async function body(c: AppContext): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export default function sellerRoutes(auth: MiddlewareHandler<Env>) {
  const router = new Hono<Env>();
  router.use('*', auth, async (c, next) => {
    if (!['seller', 'admin'].includes(c.get('user').role))
      return fail(c, 'Chỉ người bán được duyệt mới có thể quản lý tin đăng.', 403);
    await next();
  });
  const own = (c: AppContext) => c.env.DB.prepare(
    `SELECT id,title,author,description,price_vnd AS price,condition,category,city,status,image_keys,version,created_at,updated_at,
      CASE WHEN status='rejected' THEN (SELECT note FROM listing_reviews WHERE listing_id=listings.id AND decision='rejected' ORDER BY created_at DESC,rowid DESC LIMIT 1) END AS review_note
     FROM listings WHERE id=? AND seller_id=? AND deleted_at IS NULL`,
  ).bind(c.req.param('id'), c.get('user').id).first<Record<string, unknown>>();

  router.get('/:id', async c => {
    const item = await own(c);
    return item ? c.json({ item }) : fail(c, 'Không tìm thấy tin đăng của bạn.', 404);
  });

  async function mutate(c: AppContext, old: Record<string, unknown>, data: Record<string, unknown>, status: string, action: string, content?: unknown[]) {
    if (!Number.isInteger(data.version)) return fail(c, 'Thiếu phiên bản tin đăng. Hãy tải lại trang.');
    if (data.version !== old.version) return fail(c, 'Tin đã thay đổi. Hãy tải lại trước khi thao tác.', 409);
    const token = crypto.randomUUID(), id = String(old.id), user = c.get('user');
    const statement = content
      ? c.env.DB.prepare("UPDATE listings SET title=?,author=?,description=?,price_vnd=?,condition=?,category=?,city=?,image_keys=?,status='pending',version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND seller_id=? AND version=? AND deleted_at IS NULL")
        .bind(...content, token, id, user.id, data.version)
      : c.env.DB.prepare("UPDATE listings SET status=?,version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND seller_id=? AND version=? AND deleted_at IS NULL")
        .bind(status, token, id, user.id, data.version);
    const results = await c.env.DB.batch([
      statement,
      c.env.DB.prepare("INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id,detail_json) SELECT ?,?,?,'listing',?,? WHERE EXISTS(SELECT 1 FROM listings WHERE id=? AND change_token=?)")
        .bind(crypto.randomUUID(), user.id, action, id, JSON.stringify({ from: old.status, to: status }), id, token),
    ]);
    if (results[0].meta.changes !== 1) return fail(c, 'Tin đã thay đổi. Hãy tải lại trước khi thao tác.', 409);
    return c.json({ ok: true, id, status, version: Number(data.version) + 1 });
  }

  router.patch('/:id', async c => {
    const old = await own(c);
    if (!old) return fail(c, 'Không tìm thấy tin đăng của bạn.', 404);
    if (!['active', 'pending', 'rejected', 'hidden'].includes(String(old.status)))
      return fail(c, 'Tin đã bán đã kết thúc, không thể sửa hoặc đăng lại.', 409);
    const data = await body(c), title = text(data.title), author = text(data.author), description = text(data.description), category = text(data.category), city = text(data.city);
    if (title.length < 2 || title.length > 180 || author.length < 2 || author.length > 140 || description.length > 3000 || !city || city.length > 80 || !category || category.length > 40 || !Number.isInteger(data.price) || Number(data.price) < 0 || Number(data.price) > 100000000 || !['new','like_new','good','acceptable'].includes(text(data.condition)))
      return fail(c, 'Thông tin sách chưa hợp lệ.');
    const oldKeys = JSON.parse(String(old.image_keys ?? '[]')) as string[], keys = data.image_keys;
    if (!Array.isArray(keys) || keys.length < 2 || keys.length > 5 || new Set(keys).size !== keys.length || !keys.every(key => typeof key === 'string' && !key.includes('..') && (key.startsWith(c.get('user').id + '/') || oldKeys.includes(key))))
      return fail(c, 'Mỗi tin cần từ 2 đến 5 ảnh khác nhau thuộc tin hoặc tài khoản của bạn.');
    if (!(await c.env.DB.prepare('SELECT id FROM categories WHERE name=? AND deleted_at IS NULL').bind(category).first()))
      return fail(c, 'Hãy chọn danh mục đang hoạt động.');
    return mutate(c, old, data, 'pending', 'seller.update', [title, author, description, data.price, data.condition, category, city, JSON.stringify(keys)]);
  });

  router.post('/:id/status', async c => {
    const old = await own(c);
    if (!old) return fail(c, 'Không tìm thấy tin đăng của bạn.', 404);
    const data = await body(c);
    const allowed = data.status === 'sold'
      ? ['active', 'pending', 'rejected', 'hidden']
      : data.status === 'hidden' ? ['active', 'pending', 'rejected'] : [];
    if (!allowed.includes(String(old.status))) return fail(c, 'Không thể chuyển trạng thái tin theo yêu cầu.', 409);
    return mutate(c, old, data, String(data.status), data.status === 'sold' ? 'seller.sold' : 'seller.hide');
  });
  return router;
}
