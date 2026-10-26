import { Hono, type MiddlewareHandler } from 'hono';
import { can, requirePermission, type Env } from './security.ts';

const reasons = ['fraud', 'misleading', 'prohibited', 'spam', 'other'];
export default function reportRoutes(auth: MiddlewareHandler<Env>) {
  const router = new Hono<Env>();
  const protect: MiddlewareHandler<Env> = async (c, next) => {
    if (c.req.method !== 'GET') {
      if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))
        return c.json({ error: 'Định dạng yêu cầu không hợp lệ.' }, 415);
    }
    await next();
  };
  router.use('/listings/:id/reports', auth, protect);
  router.use('/admin/reports', auth, protect);
  router.use('/admin/reports/:id/decision', auth, protect);
  router.post('/listings/:id/reports', async c => {
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Nội dung báo cáo chưa hợp lệ.' }, 400); }
    if (!body || typeof body !== 'object' || (typeof body.reason !== 'string' || !reasons.includes(body.reason)) || typeof body.description !== 'string' || Array.from(body.description.trim()).length < 10 || Array.from(body.description.trim()).length > 1000)
      return c.json({ error: 'Chọn lý do và mô tả từ 10 đến 1.000 ký tự.' }, 400);
    const user = c.get('user'), id = c.req.param('id');
    const listing = await c.env.DB.prepare("SELECT l.id,l.seller_id FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=? AND l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0").bind(id).first<{id:string;seller_id:string}>();
    if (!listing) return c.json({ error: 'Tin không còn hiển thị để báo cáo.' }, 404);
    if (listing.seller_id === user.id) return c.json({ error: 'Bạn không thể báo cáo tin của chính mình.' }, 400);
    const duplicate = () => c.env.DB.prepare("SELECT id FROM listing_reports WHERE listing_id=? AND reporter_id=? AND status='pending'").bind(id, user.id).first();
    if (await duplicate()) return c.json({ error: 'Bạn đã báo cáo tin này. Báo cáo đang chờ xử lý.' }, 409);
    const result = await c.env.DB.prepare(`INSERT INTO listing_reports(id,listing_id,reporter_id,listing_title,listing_version,reason,description)
      SELECT ?,l.id,?,l.title,l.version,?,? FROM listings l JOIN users u ON u.id=l.seller_id
      WHERE l.id=? AND l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0 AND l.seller_id<>?
      AND (SELECT count(*) FROM listing_reports WHERE reporter_id=? AND created_at>=datetime('now','-1 hour'))<5
      AND NOT EXISTS(SELECT 1 FROM listing_reports WHERE listing_id=? AND reporter_id=? AND status='pending')`)
      .bind(crypto.randomUUID(), user.id, body.reason, body.description.trim(), id, user.id, user.id, id, user.id).run();
    if (result.meta.changes !== 1) {
      if (await duplicate()) return c.json({ error: 'Bạn đã báo cáo tin này. Báo cáo đang chờ xử lý.' }, 409);
      const count = await c.env.DB.prepare("SELECT count(*) AS n FROM listing_reports WHERE reporter_id=? AND created_at>=datetime('now','-1 hour')").bind(user.id).first<{n:number}>();
      if ((count?.n ?? 0) >= 5) { c.header('Retry-After', '3600'); return c.json({ error: 'Bạn đã gửi 5 báo cáo trong một giờ. Vui lòng thử lại sau.' }, 429); }
      return c.json({ error: 'Tin đã thay đổi. Vui lòng tải lại.' }, 409);
    }
    return c.json({ ok: true }, 201);
  });
  router.get('/admin/reports', requirePermission('reports.view'), async c => {
    const status = c.req.query('status') ?? 'pending';
    const page = Math.max(1, Math.min(10000, Math.floor(Number(c.req.query('page')) || 1)));
    if (!['pending','resolved','dismissed','all'].includes(status)) return c.json({ error: 'Bộ lọc chưa hợp lệ.' }, 400);
    const where = status === 'all' ? '1=1' : 'r.status=?', args = status === 'all' ? [] : [status];
    const [items, count] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT r.id,r.listing_id,r.listing_title,r.listing_version,r.reason,r.description,r.status,r.resolution,r.review_note,r.reviewed_at,r.created_at,r.version,
        u.name AS reporter,reviewer.name AS reviewer,l.title AS current_title,l.status AS listing_status,l.version AS current_listing_version,l.deleted_at AS listing_deleted_at
        FROM listing_reports r JOIN users u ON u.id=r.reporter_id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by JOIN listings l ON l.id=r.listing_id
        WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET ?`).bind(...args, (page-1)*20),
      c.env.DB.prepare(`SELECT count(*) AS total FROM listing_reports r WHERE ${where}`).bind(...args),
    ]);
    return c.json({ items: items.results, total: (count.results[0] as { total?: number } | undefined)?.total ?? 0, page });
  });
  router.post('/admin/reports/:id/decision', requirePermission('reports.view'), requirePermission('reports.review'), async c => {
    let data: Record<string, unknown>;
    try { data = await c.req.json(); } catch { return c.json({ error: 'Nội dung xử lý chưa hợp lệ.' }, 400); }
    if (!data || typeof data !== 'object' || (typeof data.action !== 'string' || !['resolve','dismiss','hide'].includes(data.action)) || typeof data.note !== 'string' || !data.note.trim() || data.note.trim().length > 500 || !Number.isInteger(data.version))
      return c.json({ error: 'Chọn quyết định, nhập lý do từ 1 đến 500 ký tự và tải phiên bản mới nhất.' }, 400);
    const hide = data.action === 'hide', user = c.get('user'), id = c.req.param('id');
    if (hide && (!can(user,'listings.view') || !can(user,'listings.update'))) return c.json({ error: 'Ẩn tin cần quyền xem và sửa tin đăng.' }, 403);
    if (hide && !Number.isInteger(data.listing_version)) return c.json({ error: 'Thiếu phiên bản tin đăng.' }, 400);
    const old = await c.env.DB.prepare('SELECT listing_id,status,version FROM listing_reports WHERE id=?').bind(id).first<{listing_id:string;status:string;version:number}>();
    if (!old) return c.json({ error: 'Không tìm thấy báo cáo.' }, 404);
    if (old.status !== 'pending' || old.version !== data.version) return c.json({ error: 'Báo cáo đã thay đổi hoặc đã xử lý. Hãy tải lại.' }, 409);
    const token = crypto.randomUUID(), status = data.action === 'dismiss' ? 'dismissed' : 'resolved';
    const guard = 'EXISTS(SELECT 1 FROM listing_reports WHERE id=? AND change_token=?)';
    const condition = hide ? " AND EXISTS(SELECT 1 FROM listings WHERE id=listing_reports.listing_id AND status='active' AND deleted_at IS NULL AND version=?)" : '';
    const statements = [c.env.DB.prepare(`UPDATE listing_reports SET status=?,resolution=?,review_note=?,reviewed_by=?,reviewed_at=datetime('now'),version=version+1,change_token=? WHERE id=? AND status='pending' AND version=?${condition}`)
      .bind(status, data.action, data.note.trim(), user.id, token, id, data.version, ...(hide ? [data.listing_version] : []))];
    if (hide) {
      statements.push(c.env.DB.prepare(`UPDATE listings SET status='hidden',version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND ${guard}`).bind(token,old.listing_id,id,token));
      statements.push(c.env.DB.prepare(`INSERT INTO listing_reviews(id,listing_id,admin_id,decision,note) SELECT ?,?,?,'hidden',? WHERE ${guard}`).bind(crypto.randomUUID(),old.listing_id,user.id,data.note.trim(),id,token));
      statements.push(c.env.DB.prepare(`INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id,detail_json) SELECT ?,?,'reports.hide_listing','listing',?,? WHERE ${guard}`).bind(crypto.randomUUID(),user.id,old.listing_id,JSON.stringify({ report_id:id,from:'active',to:'hidden',note:data.note.trim() }),id,token));
    }
    statements.push(c.env.DB.prepare(`INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id,detail_json) SELECT ?,?,'reports.review','report',?,? WHERE ${guard}`).bind(crypto.randomUUID(),user.id,id,JSON.stringify({ action:data.action,note:data.note.trim(),listing_id:old.listing_id }),id,token));
    const results = await c.env.DB.batch(statements);
    if (results[0].meta.changes !== 1) return c.json({ error: 'Báo cáo hoặc tin đăng đã thay đổi. Hãy tải lại; chỉ tin đang hiển thị mới được ẩn.' }, 409);
    return c.json({ ok: true });
  });
  return router;
}
