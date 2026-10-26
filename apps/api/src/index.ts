import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import {
  derivationLimitCode,
  passwordHash,
  verifyPassword,
} from './password.ts';
import cms from './admin.ts';
import reportRoutes from './reports.ts';
import sellerRoutes from './seller.ts';
import changePasswordRoutes from './change-password.ts';
import { requestSafety } from './request-safety.ts';
import { rateLimit,clientAddress } from './rate-limit.ts';
import {
  resolveUser,
  safeUser,
  requirePermission,
  can,
  type CmsUser,
} from './security.ts';

type Bindings = { DB: D1Database; IMAGES?: R2Bucket };
type Variables = { user: CmsUser };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const jsonError = (c: AppContext, status: number, error: string) =>
  c.json({ error }, status as 400);
const uuid = () => crypto.randomUUID();
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
async function hash(value: string) {
  return hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}
async function jsonBody<T>(c: AppContext): Promise<T> {
  try {
    const value=await c.req.json();
    return value && typeof value==='object' && !Array.isArray(value) ? value as T : {} as T;
  } catch {
    return {} as T;
  }
}
const auth: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const token = getCookie(c, 'cho_session');
  if (!token) return jsonError(c, 401, 'Vui lòng đăng nhập.');
  const row = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.role,u.is_locked,u.is_super_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now') AND u.is_locked=0`,
  )
    .bind(await hash(token))
    .first<CmsUser>();
  if (!row || row.is_locked)
    return jsonError(
      c,
      401,
      'Phiên đăng nhập đã hết hạn hoặc tài khoản bị khóa.',
    );
  c.set('user', await resolveUser(c.env.DB, row));
  await next();
};

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (
    c.req.method !== 'GET' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/account') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/seller/') ||
    path.endsWith('/contact')
  ) {
    c.header('Cache-Control', 'private, no-store');
  }
  await next();
});

app.use('/api/*', requestSafety);
app.use('/api/admin/*', auth);
app.route('/api', reportRoutes(auth));
app.route('/api/admin', cms);

app.get('/api/capabilities', (c) =>
  c.json({ image_uploads: Boolean(c.env.IMAGES) }),
);

app.patch('/api/account', auth, async (c) => {
  const body = await jsonBody<{ name?: unknown }>(c);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 100)
    return jsonError(c, 400, 'Tên hiển thị cần từ 2 đến 100 ký tự.');
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE users SET name=?,version=version+1 WHERE id=?')
    .bind(name, user.id)
    .run();
  return c.json({ user: safeUser({ ...user, name }) });
});

app.get('/api/seller/listings', auth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'seller' && user.role !== 'admin')
    return jsonError(
      c,
      403,
      'Chỉ người bán được duyệt mới có thể quản lý tin đăng.',
    );
  const result = await c.env.DB.prepare(
    `SELECT id,title,author,description,price_vnd AS price,condition,category,city,status,image_keys,version,created_at,updated_at,
      CASE WHEN status='rejected' THEN (SELECT note FROM listing_reviews WHERE listing_id=listings.id AND decision='rejected' ORDER BY created_at DESC,rowid DESC LIMIT 1) END AS review_note
     FROM listings WHERE seller_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all();
  return c.json({ items: result.results ?? [] });
});

app.route('/api/seller/listings', sellerRoutes(auth));

app.get('/api/sellers/:id', async (c) => {
  const seller = await c.env.DB.prepare(
    "SELECT id,name,created_at FROM users WHERE id=? AND is_locked=0 AND role IN ('seller','admin')",
  )
    .bind(c.req.param('id'))
    .first();
  if (!seller) return jsonError(c, 404, 'Không tìm thấy người bán.');
  const result = await c.env.DB.prepare(
    "SELECT l.id,l.title,l.author,l.description,l.price_vnd AS price,l.condition,l.category,l.city,l.image_keys,u.name AS seller,u.id AS seller_id,l.created_at FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.seller_id=? AND l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0 ORDER BY l.created_at DESC LIMIT 40",
  )
    .bind(c.req.param('id'))
    .all();
  return c.json({ seller, items: result.results ?? [] });
});

app.get('/api/categories', async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        'SELECT id,name,description FROM categories WHERE deleted_at IS NULL ORDER BY name',
      ).all()
    ).results,
  }),
);
app.get('/api/health', (c) => c.json({ ok: true, service: 'cho-sach-cu-api' }));
app.post('/api/auth/register', async (c) => {
  const body = await jsonBody<{
    name?: string;
    email?: string;
    password?: string;
  }>(c);
  const name = typeof body.name==='string' ? body.name.trim() : '';
  const email = typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password==='string' ? body.password : '';
  if (
    name.length < 2 ||
    name.length > 100 ||
    email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 10 ||
    password.length > 128
  )
    return jsonError(
      c,
      400,
      'Hãy nhập tên, email hợp lệ và mật khẩu từ 10 đến 128 ký tự.',
    );
  const denied=await rateLimit(c,'register-ip',clientAddress(c),30,3600);
  if(denied) return denied;
  const id = uuid();
  let passwordDigest: string;
  try {
    passwordDigest = await passwordHash(password);
  } catch (error) {
    const code = derivationLimitCode(error);
    if (code)
      return c.json(
        { error: 'Chức năng đăng ký đang tạm chưa khả dụng.', code },
        503,
      );
    throw error;
  }
  try {
    await c.env.DB.prepare(
      'INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)',
    )
      .bind(id, name, email, passwordDigest)
      .run();
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: users\.email/i.test(error.message)
    )
      return jsonError(c, 409, 'Email này đã được đăng ký.');
    throw error;
  }
  return c.json({ user: { id, name, email, role: 'user' } }, 201);
});
app.route('/api/auth', changePasswordRoutes(auth));

app.post('/api/auth/login', async (c) => {
  const body = await jsonBody<{ email?: string; password?: string }>(c);
  const email = typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length>254 || typeof body.password!=='string' || !body.password || body.password.length>128)
    return jsonError(c,400,'Nhập email và mật khẩu hợp lệ.');
  const addressDenied=await rateLimit(c,'login-ip',clientAddress(c),100,900);
  if(addressDenied) return addressDenied;
  const accountDenied=await rateLimit(c,'login-account',email,20,900);
  if(accountDenied) return accountDenied;
  const row = await c.env.DB.prepare(
    'SELECT id,name,email,password_hash,role,is_locked,is_super_admin FROM users WHERE email=?',
  )
    .bind(email)
    .first<CmsUser & { password_hash: string }>();
  if (!row) return jsonError(c, 401, 'Email hoặc mật khẩu không đúng.');
  let valid = false;
  try {
    valid = await verifyPassword(body.password ?? '', row.password_hash);
  } catch (error) {
    const code = derivationLimitCode(error);
    if (code)
      return c.json({ error: 'Đăng nhập đang tạm chưa khả dụng.', code }, 503);
    throw error;
  }
  if (!valid) return jsonError(c, 401, 'Email hoặc mật khẩu không đúng.');
  if (row.is_locked) return jsonError(c, 403, 'Tài khoản đã bị khóa.');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
  const session = await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,?,datetime('now','+7 days') WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=? AND is_locked=0)",
  )
    .bind(await hash(token), row.id, row.id, row.password_hash)
    .run();
  if (session.meta.changes !== 1) return jsonError(c,401,'Tài khoản đã thay đổi. Hãy đăng nhập lại bằng mật khẩu hiện tại.');
  setCookie(c, 'cho_session', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: 604800,
  });
  return c.json({ user: safeUser(await resolveUser(c.env.DB, row)) });
});
app.post('/api/auth/logout', auth, async (c) => {
  const token = getCookie(c, 'cho_session');
  if (token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
      .bind(await hash(token))
      .run();
  deleteCookie(c, 'cho_session', { path: '/' });
  return c.json({ ok: true });
});
app.get('/api/auth/me', auth, (c) => c.json({ user: safeUser(c.get('user')) }));

app.get('/api/listings', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const category = c.req.query('category');
  const city = c.req.query('city');
  const integer = (key: string, fallback: number) => {
    const raw = c.req.query(key);
    if (raw === undefined || raw === '') return fallback;
    if (!/^\d+$/.test(raw)) return NaN;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : NaN;
  };
  const min = integer('min', 0), max = integer('max', 100000000);
  const page = integer('page', 1), limit = integer('limit', 24);
  if (![min,max,page,limit].every(Number.isFinite) || min > max || max > 100000000 || page < 1 || page > 1000 || limit < 1 || limit > 40)
    return jsonError(c,400,'Khoảng giá hoặc số trang chưa hợp lệ. Giá từ 0 đến 100.000.000đ, giá thấp nhất không vượt giá cao nhất.');
  const sort =
    c.req.query('sort') === 'price_asc'
      ? 'l.price_vnd ASC,'
      : c.req.query('sort') === 'price_desc'
        ? 'l.price_vnd DESC,'
        : 'l.created_at DESC,';
  const clauses = [
    "l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0",
    'l.price_vnd BETWEEN ? AND ?',
  ];
  const values: (string | number)[] = [min, max];
  if (q) {
    clauses.push('(instr(lower(l.title),lower(?))>0 OR instr(lower(l.author),lower(?))>0 OR instr(lower(l.description),lower(?))>0)');
    values.push(q,q,q);
  }
  if (category) {
    clauses.push('l.category=?');
    values.push(category.slice(0, 40));
  }
  if (city) {
    clauses.push('l.city=?');
    values.push(city.slice(0, 80));
  }
  const sql = `SELECT l.id,l.title,l.author,l.description,l.price_vnd AS price,l.condition,l.category,l.city,l.image_keys,u.name AS seller,l.created_at FROM listings l JOIN users u ON u.id=l.seller_id WHERE ${clauses.join(' AND ')} ORDER BY ${sort} l.id LIMIT ? OFFSET ?`;
  const result = await c.env.DB.prepare(sql)
    .bind(...values, limit + 1, (page - 1) * limit)
    .all();
  const rows = result.results ?? [];
  // Only identify an entirely empty public catalogue; a filtered miss is not a demo.
  const anyPublic = rows.length ? true : Boolean(await c.env.DB.prepare(
    "SELECT 1 FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0 LIMIT 1",
  ).first());
  return c.json({ items: rows.slice(0,limit), page, limit, has_more: rows.length > limit, catalog_empty: !anyPublic });
});
app.get('/api/listings/:id', async (c) => {
  const item = await c.env.DB.prepare(
    "SELECT l.id,l.title,l.author,l.description,l.price_vnd AS price,l.condition,l.category,l.city,l.image_keys,u.name AS seller,u.id AS seller_id,l.created_at FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=? AND l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0",
  )
    .bind(c.req.param('id'))
    .first();
  if (!item) return jsonError(c, 404, 'Không tìm thấy tin đăng.');
  return c.json({ item });
});
app.get('/api/listings/:id/contact', auth, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT a.phone FROM listings l JOIN seller_applications a ON a.user_id=l.seller_id JOIN users u ON u.id=l.seller_id WHERE l.id=? AND l.status='active' AND l.deleted_at IS NULL AND u.is_locked=0 AND a.status='approved' ORDER BY a.reviewed_at DESC LIMIT 1",
  )
    .bind(c.req.param('id'))
    .first<{ phone: string }>();
  if (!row) return jsonError(c, 404, 'Không tìm thấy thông tin liên hệ.');
  c.header('Cache-Control', 'private, no-store');
  return c.json({ phone: row.phone });
});
app.post('/api/seller/applications', auth, async (c) => {
  const user = c.get('user');
  if (user.role === 'seller' || user.role === 'admin')
    return jsonError(c, 409, 'Tài khoản đã có quyền người bán.');
  const body = await jsonBody<{ phone?: string; note?: string }>(c);
  const phone = typeof body.phone==='string' ? body.phone.trim() : '';
  const note = typeof body.note==='string' ? body.note.trim().slice(0,500) : '';
  if (!/^[+()\d .-]{8,20}$/.test(phone))
    return jsonError(c, 400, 'Số điện thoại chưa hợp lệ.');
  const existing = await c.env.DB.prepare(
    "SELECT id FROM seller_applications WHERE user_id=? AND status='pending'",
  )
    .bind(user.id)
    .first();
  if (existing) return jsonError(c, 409, 'Yêu cầu của bạn đang chờ xét duyệt.');
  await c.env.DB.prepare(
    'INSERT INTO seller_applications(id,user_id,phone,note) VALUES(?,?,?,?)',
  )
    .bind(uuid(), user.id, phone, note)
    .run();
  return c.json(
    { ok: true, message: 'Yêu cầu đã được gửi để xét duyệt.' },
    201,
  );
});
app.get('/api/seller/applications/me', auth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id,status,created_at,reviewed_at,
      (SELECT json_extract(detail_json,'$.note') FROM cms_audit WHERE resource_type='seller_application' AND resource_id=seller_applications.id AND action='rejected' ORDER BY created_at DESC,rowid DESC LIMIT 1) AS review_note
     FROM seller_applications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`,
  )
    .bind(c.get('user').id)
    .first();
  return c.json({ application: result ?? null });
});
app.post('/api/listings', auth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'seller' && user.role !== 'admin')
    return jsonError(
      c,
      403,
      'Chỉ người bán đã được duyệt mới có thể đăng sách.',
    );
  const body = await jsonBody<{
    title?: string;
    author?: string;
    description?: string;
    price?: number;
    condition?: string;
    category?: string;
    city?: string;
    image_keys?: string[];
  }>(c);
  const title = typeof body.title==='string' ? body.title.trim() : '',
    author = typeof body.author==='string' ? body.author.trim() : '',
    description = typeof body.description==='string' ? body.description.trim().slice(0,3000) : '',
    price = Number(body.price);
  const validConditions = ['new', 'like_new', 'good', 'acceptable'];
  const imageKeys = body.image_keys;
  if (!Array.isArray(imageKeys) || imageKeys.length < 2 || imageKeys.length > 5 ||
      new Set(imageKeys).size !== imageKeys.length ||
      !imageKeys.every(key => typeof key === 'string' && !key.includes('..') && key.startsWith(`${user.id}/`)))
    return jsonError(c, 400, 'Mỗi tin cần từ 2 đến 5 ảnh khác nhau thuộc tài khoản của bạn.');
  if (
    title.length < 2 ||
    title.length > 180 ||
    author.length < 2 ||
    author.length > 140 ||
    !Number.isInteger(price) ||
    price < 0 ||
    price > 100000000 ||
    typeof body.category!=='string' || !body.category.trim() || body.category.length>40 ||
    typeof body.city!=='string' || !body.city.trim() || body.city.length>80 ||
    typeof body.condition!=='string' || !validConditions.includes(body.condition)
  )
    return jsonError(c, 400, 'Thông tin sách chưa hợp lệ.');
  if (
    !(await c.env.DB.prepare(
      'SELECT id FROM categories WHERE name=? AND deleted_at IS NULL',
    )
      .bind(body.category.trim())
      .first())
  )
    return jsonError(c, 400, 'Danh mục không tồn tại hoặc đã ngừng sử dụng.');
  const id = uuid();
  await c.env.DB.prepare(
    'INSERT INTO listings(id,seller_id,title,author,description,price_vnd,condition,category,city,image_keys) VALUES(?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      id,
      user.id,
      title,
      author,
      description,
      price,
      body.condition,
      body.category.trim().slice(0, 40),
      body.city.trim().slice(0, 80),
      JSON.stringify(imageKeys),
    )
    .run();
  return c.json(
    { id, status: 'pending', message: 'Tin đăng đã gửi để Admin duyệt.' },
    201,
  );
});

app.get(
  '/api/admin/seller-applications',
  requirePermission('sellers.view'),
  async (c) => {
    const status = c.req.query('status') ?? 'pending';
    if (!['all', 'pending', 'approved', 'rejected'].includes(status))
      return jsonError(c, 400, 'Trạng thái yêu cầu không hợp lệ.');
    const where = status === 'all' ? '' : 'WHERE a.status=?';
    const result = await c.env.DB.prepare(
      `SELECT a.id,a.phone,a.note,a.status,a.created_at,a.reviewed_at,(SELECT json_extract(detail_json,'$.note') FROM cms_audit WHERE resource_type='seller_application' AND resource_id=a.id AND action='rejected' ORDER BY created_at DESC,rowid DESC LIMIT 1) AS review_note,u.id AS user_id,u.name,u.email,u.is_locked,r.name AS reviewer FROM seller_applications a JOIN users u ON u.id=a.user_id LEFT JOIN users r ON r.id=a.reviewed_by ${where} ORDER BY a.created_at DESC,a.id LIMIT 100`,
    )
      .bind(...(status === 'all' ? [] : [status]))
      .all();
    return c.json({ items: result.results ?? [] });
  },
);
app.post(
  '/api/admin/seller-applications/:id/decision',
  requirePermission('sellers.review'),
  async (c) => {
    const data = await jsonBody<{ decision?: string; note?: unknown }>(c),
      id = c.req.param('id'),
      token = uuid();
    if (!['approved', 'rejected'].includes(data.decision ?? ''))
      return jsonError(c, 400, 'Quyết định không hợp lệ.');
    const note = typeof data.note === 'string' ? data.note.trim() : '';
    if (data.decision === 'rejected' && (!note || note.length > 500))
      return jsonError(c, 400, 'Vui lòng nhập lý do từ chối (tối đa 500 ký tự).');
    const row = await c.env.DB.prepare(
      "SELECT a.user_id FROM seller_applications a JOIN users u ON u.id=a.user_id WHERE a.id=? AND a.status='pending' AND u.is_locked=0",
    )
      .bind(id)
      .first<{ user_id: string }>();
    if (!row) return jsonError(c, 404, 'Không tìm thấy yêu cầu đang chờ.');
    if(row.user_id===c.get('user').id)return jsonError(c,403,'Không tự xét duyệt yêu cầu trở thành Seller của chính mình.');
    const statements = [
      c.env.DB.prepare(
        "UPDATE seller_applications SET status=?,reviewed_by=?,reviewed_at=datetime('now'),change_token=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM users WHERE id=? AND is_locked=0)",
      ).bind(data.decision, c.get('user').id, token, id, row.user_id),
    ];
    if (data.decision === 'approved')
      statements.push(
        c.env.DB.prepare(
          "UPDATE users SET role=CASE WHEN role='admin' THEN role ELSE 'seller' END,version=version+1 WHERE id=? AND is_locked=0 AND EXISTS(SELECT 1 FROM seller_applications WHERE id=? AND change_token=?)",
        ).bind(row.user_id, id, token),
      );
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id,detail_json) SELECT ?,?,?,'seller_application',?,? WHERE EXISTS(SELECT 1 FROM seller_applications WHERE id=? AND change_token=?)",
      ).bind(uuid(), c.get('user').id, data.decision, id, JSON.stringify({note:data.decision === 'rejected' ? note : ''}), id, token),
    );
    const result = await c.env.DB.batch(statements);
    if (result[0].meta.changes !== 1)
      return jsonError(c, 409, 'Yêu cầu đã được xử lý hoặc tài khoản bị khóa.');
    return c.json({ ok: true, status: data.decision });
  },
);
app.get(
  '/api/admin/listings',
  requirePermission('listings.view'),
  async (c) => {
    const status = c.req.query('status') ?? 'pending';
    if (
      !['all', 'pending', 'active', 'rejected', 'sold', 'hidden'].includes(
        status,
      )
    )
      return jsonError(c, 400, 'Trạng thái tin đăng không hợp lệ.');
    const keyword = (c.req.query('q') ?? '').trim().slice(0, 100);
    const integer = (
      value: string | undefined,
      fallback: number,
      maximum: number,
    ) => {
      const number = Number(value ?? fallback);
      return Number.isFinite(number)
        ? Math.max(1, Math.min(maximum, Math.floor(number)))
        : fallback;
    };
    const page = integer(c.req.query('page'), 1, 1000);
    const limit = integer(c.req.query('limit'), 100, 100);
    const clauses: string[] = ['l.deleted_at IS NULL'];
    const values: string[] = [];
    if (status !== 'all') {
      clauses.push('l.status=?');
      values.push(status);
    }
    if (keyword) {
      clauses.push('(instr(lower(l.title),lower(?))>0 OR instr(lower(l.author),lower(?))>0 OR instr(lower(u.name),lower(?))>0)');
      values.push(keyword,keyword,keyword);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const from = `FROM listings l JOIN users u ON u.id=l.seller_id ${where}`;
    const [rows, count] = await c.env.DB.batch<Record<string, unknown>>([
      c.env.DB.prepare(
        `SELECT l.*,u.name AS seller ${from} ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?`,
      ).bind(...values, limit + 1, (page - 1) * limit),
      c.env.DB.prepare(`SELECT count(*) AS total ${from}`).bind(...values),
    ]);
    return c.json({
      items: rows.results ?? [],
      total: Number(count.results?.[0]?.total ?? 0),
      page,
      limit,
    });
  },
);

app.post(
  '/api/admin/listings/:id/decision',
  requirePermission('listings.review'),
  async (c) => {
    const data = await jsonBody<{
        decision?: string;
        note?: string;
        version?: number;
      }>(c),
      id = c.req.param('id'),
      token = uuid();
    if (!['active', 'rejected'].includes(data.decision ?? ''))
      return jsonError(c, 400, 'Quyết định không hợp lệ.');
    const note = typeof data.note === 'string' ? data.note.trim() : '';
    if (data.decision === 'rejected' && (!note || note.length > 500))
      return jsonError(c, 400, 'Vui lòng nhập lý do từ chối (tối đa 500 ký tự).');
    const row = await c.env.DB.prepare(
      "SELECT version FROM listings WHERE id=? AND status='pending' AND deleted_at IS NULL",
    )
      .bind(id)
      .first<{ version: number }>();
    if (!row) return jsonError(c, 404, 'Không tìm thấy tin đăng đang chờ.');
    const version = data.version ?? row.version;
    const result = await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE listings SET status=?,version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND version=? AND status='pending' AND deleted_at IS NULL",
      ).bind(data.decision, token, id, version),
      c.env.DB.prepare(
        'INSERT INTO listing_reviews(id,listing_id,admin_id,decision,note) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM listings WHERE id=? AND change_token=?)',
      ).bind(
        uuid(),
        id,
        c.get('user').id,
        data.decision,
        note.slice(0, 500),
        id,
        token,
      ),
      c.env.DB.prepare(
        "INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'listing',? WHERE EXISTS(SELECT 1 FROM listings WHERE id=? AND change_token=?)",
      ).bind(uuid(), c.get('user').id, data.decision, id, id, token),
    ]);
    if (result[0].meta.changes !== 1)
      return jsonError(
        c,
        409,
        'Tin đã thay đổi. Hãy tải lại trước khi xét duyệt.',
      );
    return c.json({ ok: true, status: data.decision });
  },
);

app.post('/api/images', auth, async (c) => {
  const user = c.get('user');
  if (
    user.role !== 'seller' &&
    user.role !== 'admin' &&
    !can(user, 'listings.create') &&
    !can(user, 'listings.update')
  )
    return jsonError(c, 403, 'Bạn chưa có quyền tải ảnh sách.');
  if (!c.env.IMAGES)
    return jsonError(
      c,
      503,
      'Tải ảnh hiện chưa khả dụng. Vui lòng thử lại sau.',
    );
  const denied=await rateLimit(c,'upload-account',user.id,100,3600);
  if(denied) return denied;
  let form:FormData;
  try {form=await c.req.formData();} catch {return jsonError(c,400,'Dữ liệu ảnh chưa hợp lệ.');}
  const file = form.get('file');
  if (!(file instanceof File)) return jsonError(c, 400, 'Thiếu tệp ảnh.');
  if (file.size > 5 * 1024 * 1024) return jsonError(c, 413, 'Ảnh tối đa 5 MB.');
  const types: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = types[file.type];
  if (!ext) return jsonError(c, 415, 'Chỉ hỗ trợ JPEG, PNG hoặc WebP.');
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 12));
  const isJpeg =
    ext === 'jpg' &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;
  const isPng =
    ext === 'png' &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;
  const isWebp =
    ext === 'webp' &&
    String.fromCharCode(...header.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp)
    return jsonError(c, 415, 'Tệp không khớp định dạng ảnh đã chọn.');
  const key = `${user.id}/${uuid()}.${ext}`;
  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
  return c.json({ key, url: `/api/images/${key}` }, 201);
});
app.get('/api/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '');
  if (!key || key.includes('..'))
    return jsonError(c, 404, 'Không tìm thấy ảnh.');
  if (!c.env.IMAGES)
    return jsonError(c, 503, 'Ảnh hiện chưa khả dụng. Vui lòng thử lại sau.');
  const object = await c.env.IMAGES.get(key);
  if (!object) return jsonError(c, 404, 'Không tìm thấy ảnh.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
});
app.delete('/api/images/*', auth, async (c) => {
  const user = c.get('user');
  const key = c.req.path.replace('/api/images/', '');
  if (
    !key ||
    key.includes('..') ||
    (!can(user,'listings.delete') && !key.startsWith(`${user.id}/`))
  )
    return jsonError(c, 403, 'Bạn không có quyền xóa ảnh này.');
  if (!c.env.IMAGES)
    return jsonError(
      c,
      503,
      'Quản lý ảnh hiện chưa khả dụng. Vui lòng thử lại sau.',
    );
  const reference=await c.env.DB.prepare('SELECT l.id FROM listings l,json_each(l.image_keys) image WHERE image.value=? LIMIT 1').bind(key).first();
  if(reference) return jsonError(c,409,'Ảnh còn được tin đăng tham chiếu, không thể xóa.');
  await c.env.IMAGES.delete(key);
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'Không tìm thấy đường dẫn.' }, 404));
app.onError((error, c) => {
  const requestId=uuid();
  console.error('API failure', {requestId,name:error instanceof Error ? error.name : 'UnknownError'});
  c.header('X-Request-ID',requestId);
  return c.json({ error: 'Đã có lỗi xảy ra.',request_id:requestId }, 500);
});
export default app;
