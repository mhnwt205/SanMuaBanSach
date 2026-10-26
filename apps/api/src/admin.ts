import { Hono } from 'hono';
import {
  allPermissions,
  permissionGroups,
  can,
  requirePermission,
  type Env,
  type AppContext,
} from './security.ts';
import { passwordHash, derivationLimitCode } from './password.ts';
const cms = new Hono<Env>();
const uid = () => crypto.randomUUID();
const fail = (
  c: AppContext,
  message: string,
  status: 400 | 403 | 404 | 409 = 400,
) => c.json({ error: message }, status);
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const body = async (c: AppContext): Promise<Record<string, unknown>> => {
  try {
    const value = await c.req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
};
const number = (value: unknown, fallback = 1, max = 100000) =>
  Number.isFinite(Number(value ?? fallback))
    ? Math.max(1, Math.min(max, Math.floor(Number(value ?? fallback))))
    : fallback;
const stamp = (
  c: AppContext,
  action: string,
  type: string,
  id: string,
  token: string,
  table: string,
) =>
  c.env.DB.prepare(
    `INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=? AND change_token=?)`,
  ).bind(uid(), c.get('user').id, action, type, id, id, token);
async function mutation(c: AppContext, statements: D1PreparedStatement[]) {
  const results = await c.env.DB.batch(statements);
  return results[0].meta.changes === 1;
}
const safeRole = (role: Record<string, unknown>) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  deleted_at: role.deleted_at,
  version: role.version,
  created_at: role.created_at,
  updated_at: role.updated_at,
  permissions: JSON.parse(String(role.permissions ?? '[]')),
});
async function manageableUser(c: AppContext, id: string) {
  const target = await c.env.DB.prepare(
    'SELECT id,role,is_locked,is_super_admin,version FROM users WHERE id=?',
  )
    .bind(id)
    .first<{
      id: string;
      role: string;
      is_locked: number;
      is_super_admin: number;
      version: number;
    }>();
  if (!target) return null;
  if (target.is_super_admin && !c.get('user').is_super_admin) return null;
  if (!c.get('user').is_super_admin) {
    const held = await c.env.DB.prepare(
      `SELECT DISTINCT p.permission FROM cms_user_roles ur JOIN cms_roles r ON r.id=ur.role_id JOIN cms_role_permissions p ON p.role_id=r.id WHERE ur.user_id=? AND r.deleted_at IS NULL`,
    )
      .bind(id)
      .all<{ permission: string }>();
    if (held.results.some((item) => !can(c.get('user'), item.permission)))
      return null;
  }
  return target;
}

cms.get('/permissions', async (c) =>
  c.get('user').cms_access
    ? c.json({ groups: permissionGroups })
    : fail(c, 'Bạn không có quyền vào CMS.', 403),
);
cms.get('/summary', async (c) => {
  const user = c.get('user');
  if (!user.cms_access) return fail(c, 'Bạn không có quyền vào CMS.', 403);
  const result: Record<string, number> = {};
  const metrics = [
    [
      'sellers',
      'sellers.view',
      "SELECT count(*) AS total FROM seller_applications a JOIN users u ON u.id=a.user_id WHERE a.status='pending' AND u.is_locked=0",
    ],
    [
      'listings',
      'listings.view',
      "SELECT count(*) AS total FROM listings WHERE status='pending' AND deleted_at IS NULL",
    ],
    [
      'activeListings',
      'listings.view',
      "SELECT count(*) AS total FROM listings WHERE status='active' AND deleted_at IS NULL",
    ],
    ['users', 'users.view', 'SELECT count(*) AS total FROM users'],
    [
      'reports',
      'reports.view',
      "SELECT count(*) AS total FROM listing_reports WHERE status='pending'",
    ],
  ] as const;
  const permitted = metrics.filter(([, permission]) => can(user, permission));
  const activityColumns = [
    ['listings', 'listings.view', 'listings'],
    ['sellers', 'sellers.view', 'seller_applications'],
    ['reports', 'reports.view', 'listing_reports'],
  ] as const;
  const visibleActivity = activityColumns.filter(([, permission]) => can(user, permission));
  const statements = [
    ...permitted.map(([, , sql]) => c.env.DB.prepare(sql)),
    ...visibleActivity.map(([, , table]) => c.env.DB.prepare(
      `SELECT date(created_at) AS day,count(*) AS total FROM ${table} WHERE created_at>=date('now','-6 days') GROUP BY date(created_at) ORDER BY day`,
    )),
  ];
  const rows = statements.length ? await c.env.DB.batch(statements) : [];
  permitted.forEach(([key], index) => {
    result[key] = Number((rows[index]?.results[0] as { total?: number } | undefined)?.total ?? 0);
  });
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - 6 + index);
    return { day: date.toISOString().slice(0, 10), listings: null as number | null, sellers: null as number | null, reports: null as number | null };
  });
  visibleActivity.forEach(([key], seriesIndex) => {
    const daily = (rows[permitted.length + seriesIndex]?.results ?? []) as { day: string; total: number }[];
    const values = new Map(daily.map((row) => [row.day, Number(row.total)]));
    for (const point of activity) point[key] = values.get(point.day) ?? 0;
  });
  return c.json({ ...result, activity });
});
cms.get('/options', async (c) => {
  const user = c.get('user');
  if (!user.cms_access) return fail(c, 'Bạn không có quyền vào CMS.', 403);
  const result: Record<string, unknown> = {};
  if (can(user, 'listings.create') || can(user, 'listings.update')) {
    result.sellers = (
      await c.env.DB.prepare(
        "SELECT id,name,email FROM users u WHERE u.is_locked=0 AND u.role IN ('seller','admin') AND EXISTS(SELECT 1 FROM seller_applications a WHERE a.user_id=u.id AND a.status='approved') ORDER BY name LIMIT 500",
      ).all()
    ).results;
    result.categories = (
      await c.env.DB.prepare(
        'SELECT id,name FROM categories WHERE deleted_at IS NULL ORDER BY name',
      ).all()
    ).results;
  }
  if (can(user, 'users.assign_roles')) {
    const roles = (
      await c.env.DB.prepare(
        'SELECT r.id,r.name,json_group_array(p.permission) AS permissions FROM cms_roles r LEFT JOIN cms_role_permissions p ON p.role_id=r.id WHERE r.deleted_at IS NULL GROUP BY r.id ORDER BY r.name LIMIT 500',
      ).all<{ id: string; name: string; permissions: string }>()
    ).results;
    const allowed = roles
      .filter((role) =>
        (JSON.parse(role.permissions) as (string | null)[])
          .filter((permission): permission is string => Boolean(permission))
          .every((permission) => can(user, permission)),
      )
      .map(({ id, name }) => ({ id, name }));
    result.roles = allowed;
  }
  return c.json(result);
});
cms.get('/users', requirePermission('users.view'), async (c) => {
  const page = number(c.req.query('page')),
    limit = number(c.req.query('limit'), 25, 100),
    q = text(c.req.query('q'), 100),
    state = c.req.query('state');
  const where =
    'WHERE (instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0)' +
    (state === 'locked'
      ? ' AND u.is_locked=1'
      : state === 'active'
        ? ' AND u.is_locked=0'
        : '');
  const params = [q,q];
  const [items, total] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT u.id,u.name,u.email,u.role,u.is_locked,u.is_super_admin,u.version,u.created_at,COALESCE((SELECT json_group_array(ur.role_id) FROM cms_user_roles ur WHERE ur.user_id=u.id),'[]') AS role_ids FROM users u ${where} ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?`,
    ).bind(...params, limit, (page - 1) * limit),
    c.env.DB.prepare(`SELECT count(*) AS total FROM users u ${where}`).bind(
      ...params,
    ),
  ]);
  return c.json({
    items: items.results.map((item) => ({
      ...item,
      role_ids: JSON.parse(String(item.role_ids)),
    })),
    total: Number(total.results[0]?.total ?? 0),
    page,
    limit,
  });
});
cms.post('/users', requirePermission('users.create'), async (c) => {
  const data = await body(c),
    name = text(data.name, 101),
    email = text(data.email, 255).toLowerCase(),
    password = typeof data.password === 'string' ? data.password : '';
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 10 ||
    password.length > 128
  )
    return fail(
      c,
      'Tên, email hoặc mật khẩu chưa hợp lệ (mật khẩu 10–128 ký tự).',
    );
  if (
    await c.env.DB.prepare('SELECT id FROM users WHERE email=?')
      .bind(email)
      .first()
  )
    return fail(c, 'Email đã tồn tại.', 409);
  let digest: string;
  try {
    digest = await passwordHash(password);
  } catch (error) {
    if (derivationLimitCode(error))
      return c.json(
        { error: 'Chức năng tạo tài khoản tạm chưa khả dụng.' },
        503,
      );
    throw error;
  }
  const id = uid(),
    token = uid();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(id,name,email,password_hash,role,change_token) VALUES(?,?,?,?,'user',?)",
    ).bind(id, name, email, digest, token),
    stamp(c, 'create', 'user', id, token, 'users'),
  ]);
  return c.json({ id }, 201);
});
cms.patch('/users/:id', requirePermission('users.update'), async (c) => {
  const id = c.req.param('id'),
    target = await manageableUser(c, id);
  if (!target) return fail(c, 'Không tìm thấy tài khoản có thể quản lý.', 404);
  const data = await body(c),
    name = text(data.name, 101),
    token = uid();
  if (name.length < 2 || name.length > 100 || !Number.isInteger(data.version))
    return fail(c, 'Tên hoặc phiên bản dữ liệu không hợp lệ.');
  const changed = await mutation(c, [
    c.env.DB.prepare(
      'UPDATE users SET name=?,version=version+1,change_token=? WHERE id=? AND version=?',
    ).bind(name, token, id, data.version),
    stamp(c, 'update', 'user', id, token, 'users'),
  ]);
  return changed
    ? c.json({ ok: true })
    : fail(c, 'Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu.', 409);
});
cms.post('/users/:id/lock', requirePermission('users.lock'), async (c) => {
  const id = c.req.param('id'),
    target = await manageableUser(c, id);
  if (!target) return fail(c, 'Không tìm thấy tài khoản có thể quản lý.', 404);
  const data = await body(c);
  if (typeof data.locked !== 'boolean' || !Number.isInteger(data.version))
    return fail(c, 'Trạng thái khóa không hợp lệ.');
  if (id === c.get('user').id || target.is_super_admin)
    return fail(
      c,
      'Không được khóa chính mình hoặc tài khoản Super Admin.',
      403,
    );
  const token = uid();
  const changed = await mutation(c, [
    c.env.DB.prepare(
      'UPDATE users SET is_locked=?,version=version+1,change_token=? WHERE id=? AND version=? AND is_super_admin=0',
    ).bind(data.locked ? 1 : 0, token, id, data.version),
    c.env.DB.prepare(
      'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND change_token=?)',
    ).bind(id, id, token),
    stamp(c, data.locked ? 'lock' : 'unlock', 'user', id, token, 'users'),
  ]);
  return changed
    ? c.json({ ok: true })
    : fail(c, 'Dữ liệu đã thay đổi. Hãy tải lại.', 409);
});
cms.put(
  '/users/:id/roles',
  requirePermission('users.assign_roles'),
  async (c) => {
    const id = c.req.param('id'),
      target = await manageableUser(c, id);
    if (!target)
      return fail(c, 'Không tìm thấy tài khoản có thể quản lý.', 404);
    if (id === c.get('user').id || target.is_super_admin)
      return fail(
        c,
        'Không thay đổi role của chính mình hoặc Super Admin qua chức năng này.',
        403,
      );
    const data = await body(c);
    if (
      !Array.isArray(data.role_ids) ||
      data.role_ids.length > 20 ||
      !data.role_ids.every((value) => typeof value === 'string') ||
      !Number.isInteger(data.version)
    )
      return fail(c, 'Danh sách role không hợp lệ.');
    const ids = [...new Set(data.role_ids as string[])];
    if (ids.length) {
      const roles = await c.env.DB.prepare(
        `SELECT r.id,json_group_array(p.permission) AS permissions FROM cms_roles r LEFT JOIN cms_role_permissions p ON p.role_id=r.id WHERE r.id IN (${ids.map(() => '?').join(',')}) AND r.deleted_at IS NULL GROUP BY r.id`,
      )
        .bind(...ids)
        .all<{ id: string; permissions: string }>();
      if (roles.results.length !== ids.length)
        return fail(c, 'Role không tồn tại hoặc đã vào thùng rác.');
      if (
        roles.results.some((role) =>
          (JSON.parse(role.permissions) as (string | null)[]).some(
            (permission) =>
              permission !== null && !can(c.get('user'), permission),
          ),
        )
      )
        return fail(c, 'Không được cấp quyền mà bạn không có.', 403);
    }

    const token = uid();
    const guard = 'EXISTS(SELECT 1 FROM users WHERE id=? AND change_token=?)';
    const changed = await mutation(c, [
      c.env.DB.prepare(
        'UPDATE users SET version=version+1,change_token=? WHERE id=? AND version=? AND is_super_admin=0',
      ).bind(token, id, data.version),
      c.env.DB.prepare(
        `DELETE FROM cms_user_roles WHERE user_id=? AND ${guard}`,
      ).bind(id, id, token),
      ...ids.map((roleId) =>
        c.env.DB.prepare(
          `INSERT INTO cms_user_roles(user_id,role_id) SELECT ?,? WHERE ${guard}`,
        ).bind(id, roleId, id, token),
      ),
      stamp(c, 'assign_roles', 'user', id, token, 'users'),
    ]);
    return changed
      ? c.json({ ok: true })
      : fail(c, 'Dữ liệu đã thay đổi. Hãy tải lại.', 409);
  },
);

for (const resource of ['categories', 'roles'] as const) {
  const table = resource === 'roles' ? 'cms_roles' : 'categories';
  cms.get(`/${resource}`, requirePermission(`${resource}.view`), async (c) => {
    const page = number(c.req.query('page')),
      limit = number(c.req.query('limit'), 25, 100),
      q = text(c.req.query('q'), 100),
      trash = c.req.query('trash') === '1';
    // D1 limits LIKE patterns to 50 bytes; role names can exceed that in UTF-8.
    // Literal substring matching keeps role search valid without truncating names.
    const search=q;
    const where = `WHERE x.deleted_at IS ${trash ? 'NOT ' : ''}NULL AND instr(lower(x.name),lower(?))>0`;
    const fields =
      resource === 'roles'
        ? ",COALESCE((SELECT json_group_array(permission) FROM cms_role_permissions WHERE role_id=x.id),'[]') AS permissions"
        : '';
    const [items, total] = await c.env.DB.batch<Record<string, unknown>>([
      c.env.DB.prepare(
        `SELECT x.id,x.name,x.description,x.version,x.deleted_at,x.created_at,x.updated_at ${fields} FROM ${table} x ${where} ORDER BY x.created_at DESC,x.id LIMIT ? OFFSET ?`,
      ).bind(search, limit, (page - 1) * limit),
      c.env.DB.prepare(
        `SELECT count(*) AS total FROM ${table} x ${where}`,
      ).bind(search),
    ]);
    return c.json({
      items: resource === 'roles' ? items.results.map(safeRole) : items.results,
      total: Number(total.results[0]?.total ?? 0),
      page,
      limit,
    });
  });
  for (const creating of [true, false]) {
    cms.on(
      creating ? 'POST' : 'PATCH',
      creating ? `/${resource}` : `/${resource}/:id`,
      requirePermission(`${resource}.${creating ? 'create' : 'update'}`),
      async (c) => {
        const data = await body(c),
          id = creating ? uid() : c.req.param('id'),
          token = uid(),
          name = text(data.name, resource === 'roles' ? 81 : 41),
          description = text(data.description, 500);
        if (
          (resource === 'roles' &&
            ['super admin', 'super_admin', 'superadmin'].includes(
              name.toLowerCase(),
            )) ||
          name.length < 2 ||
          name.length > (resource === 'roles' ? 80 : 40) ||
          (!creating && !Number.isInteger(data.version))
        )
          return fail(c, 'Tên hoặc phiên bản dữ liệu không hợp lệ.');
        const existing = creating
          ? null
          : await c.env.DB.prepare(
              `SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL`,
            )
              .bind(id)
              .first<Record<string, unknown>>();
        if (!creating && !existing)
          return fail(c, 'Không tìm thấy dữ liệu.', 404);
        if (
          await c.env.DB.prepare(
            `SELECT id FROM ${table} WHERE name=? AND id<>?`,
          )
            .bind(name, id)
            .first()
        )
          return fail(c, 'Tên đã tồn tại, bao gồm trong thùng rác.', 409);
        let permissions: string[] = [];
        if (resource === 'roles') {
          if (
            !Array.isArray(data.permissions) ||
            data.permissions.length > allPermissions.length ||
            !data.permissions.every(
              (value) =>
                typeof value === 'string' && allPermissions.includes(value),
            )
          )
            return fail(c, 'Danh sách quyền không hợp lệ.');
          permissions = [...new Set(data.permissions as string[])];
          if (permissions.some((permission) => !can(c.get('user'), permission)))
            return fail(c, 'Không được cấp quyền mà bạn không có.', 403);
          if (existing) {
            const previous = await c.env.DB.prepare(
              'SELECT permission FROM cms_role_permissions WHERE role_id=?',
            )
              .bind(id)
              .all<{ permission: string }>();
            if (
              previous.results.some(
                (row) => !can(c.get('user'), row.permission),
              )
            )
              return fail(
                c,
                'Role này có quyền vượt phạm vi quản lý của bạn.',
                403,
              );
          }
          // Each permission is independent; persist exactly the selected grants.
        }
        const statements: D1PreparedStatement[] = [
          creating
            ? c.env.DB.prepare(
                `INSERT INTO ${table}(id,name,description,change_token) VALUES(?,?,?,?)`,
              ).bind(id, name, description, token)
            : c.env.DB.prepare(
                `UPDATE ${table} SET name=?,description=?,version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND version=? AND deleted_at IS NULL`,
              ).bind(name, description, token, id, data.version),
        ];
        const guard = `EXISTS(SELECT 1 FROM ${table} WHERE id=? AND change_token=?)`;
        if (resource === 'roles') {
          statements.push(
            c.env.DB.prepare(
              `DELETE FROM cms_role_permissions WHERE role_id=? AND ${guard}`,
            ).bind(id, id, token),
          );
          statements.push(
            ...permissions.map((permission) =>
              c.env.DB.prepare(
                `INSERT INTO cms_role_permissions(role_id,permission) SELECT ?,? WHERE ${guard}`,
              ).bind(id, permission, id, token),
            ),
          );
        } else if (existing && existing.name !== name) {
          statements.push(
            c.env.DB.prepare(
              `UPDATE listings SET category=?,version=version+1,updated_at=datetime('now') WHERE category=? AND ${guard}`,
            ).bind(name, existing.name, id, token),
          );
        }
        statements.push(
          stamp(c, creating ? 'create' : 'update', resource, id, token, table),
        );
        try {
          const changed = await mutation(c, statements);
          return changed
            ? c.json({ ok: true, id }, creating ? 201 : 200)
            : fail(c, 'Dữ liệu đã thay đổi. Hãy tải lại.', 409);
        } catch (error) {
          if (String(error).includes('UNIQUE constraint'))
            return fail(c, 'Tên đã tồn tại.', 409);
          throw error;
        }
      },
    );
  }
  for (const restore of [false, true]) {
    cms.on(
      restore ? 'POST' : 'DELETE',
      restore ? `/${resource}/:id/restore` : `/${resource}/:id`,
      requirePermission(`${resource}.${restore ? 'restore' : 'delete'}`),
      async (c) => {
        const data = await body(c),
          id = c.req.param('id'),
          token = uid();
        if (!Number.isInteger(data.version))
          return fail(c, 'Thiếu phiên bản dữ liệu.');
        if (resource === 'roles') {
          const p = await c.env.DB.prepare(
            'SELECT permission FROM cms_role_permissions WHERE role_id=?',
          )
            .bind(id)
            .all<{ permission: string }>();
          if (p.results.some((row) => !can(c.get('user'), row.permission)))
            return fail(
              c,
              'Role này có quyền vượt phạm vi quản lý của bạn.',
              403,
            );
        }
        const changed = await mutation(c, [
          c.env.DB.prepare(
            `UPDATE ${table} SET deleted_at=${restore ? 'NULL' : "datetime('now')"},version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND version=? AND deleted_at IS ${restore ? 'NOT ' : ''}NULL`,
          ).bind(token, id, data.version),
          stamp(c, restore ? 'restore' : 'trash', resource, id, token, table),
        ]);
        return changed
          ? c.json({ ok: true })
          : fail(
              c,
              'Dữ liệu đã thay đổi hoặc không còn ở trạng thái này. Hãy tải lại.',
              409,
            );
      },
    );
  }
}

cms.get('/catalog', requirePermission('listings.view'), async (c) => {
  const q = text(c.req.query('q'), 100),
    status = c.req.query('status') ?? 'all',
    trash = c.req.query('trash') === '1',
    page = number(c.req.query('page')),
    limit = number(c.req.query('limit'), 25, 100);
  if (
    !['all', 'pending', 'active', 'rejected', 'sold', 'hidden'].includes(status)
  )
    return fail(c, 'Trạng thái không hợp lệ.');
  const where = `WHERE l.deleted_at IS ${trash ? 'NOT ' : ''}NULL AND (instr(lower(l.title),lower(?))>0 OR instr(lower(l.author),lower(?))>0 OR instr(lower(u.name),lower(?))>0)${status === 'all' ? '' : ' AND l.status=?'}`;
  const params = [
    q,
    q,
    q,
    ...(status === 'all' ? [] : [status]),
  ];
  const [rows, total] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT l.*,u.name AS seller FROM listings l JOIN users u ON u.id=l.seller_id ${where} ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?`,
    ).bind(...params, limit, (page - 1) * limit),
    c.env.DB.prepare(
      `SELECT count(*) AS total FROM listings l JOIN users u ON u.id=l.seller_id ${where}`,
    ).bind(...params),
  ]);
  return c.json({
    items: rows.results,
    total: Number(total.results[0]?.total ?? 0),
    page,
    limit,
  });
});
for (const creating of [true, false]) {
  cms.on(
    creating ? 'POST' : 'PATCH',
    creating ? '/catalog' : '/catalog/:id',
    requirePermission(`listings.${creating ? 'create' : 'update'}`),
    async (c) => {
      const data = await body(c),
        id = creating ? uid() : c.req.param('id'),
        token = uid();
      const old = creating
        ? null
        : await c.env.DB.prepare(
            'SELECT * FROM listings WHERE id=? AND deleted_at IS NULL',
          )
            .bind(id)
            .first<Record<string, unknown>>();
      if (!creating && !old) return fail(c, 'Không tìm thấy tin đăng.', 404);
      const title = text(data.title, 181),
        author = text(data.author, 141),
        description = text(data.description, 3000),
        city = text(data.city, 81),
        category = text(data.category, 41),
        price = data.price,
        condition = text(data.condition, 30);
      if (
        title.length < 2 ||
        title.length > 180 ||
        author.length < 2 ||
        author.length > 140 ||
        !city ||
        city.length > 80 ||
        !Number.isInteger(price) ||
        Number(price) < 0 ||
        Number(price) > 100000000 ||
        !['new', 'like_new', 'good', 'acceptable'].includes(condition) ||
        (!creating && !Number.isInteger(data.version))
      )
        return fail(c, 'Thông tin sách hoặc phiên bản dữ liệu không hợp lệ.');
      if (
        !(await c.env.DB.prepare(
          'SELECT id FROM categories WHERE name=? AND deleted_at IS NULL',
        )
          .bind(category)
          .first())
      )
        return fail(c, 'Hãy chọn danh mục đang hoạt động.');
      let imageKeys: string[] = old
        ? JSON.parse(String(old.image_keys ?? '[]'))
        : [];
      if (data.image_keys !== undefined) {
        if (
          !Array.isArray(data.image_keys) ||
          data.image_keys.length < 2 ||
          data.image_keys.length > 5 ||
          new Set(data.image_keys).size !== data.image_keys.length ||
          !data.image_keys.every(
            (key) =>
              typeof key === 'string' &&
              !key.includes('..') &&
              (key.startsWith(c.get('user').id + '/') ||
                imageKeys.includes(key)),
          )
        )
          return fail(c, 'Danh sách ảnh không hợp lệ.');
        imageKeys = data.image_keys as string[];
      }
      if (imageKeys.length < 2 || imageKeys.length > 5)
        return fail(c, 'Mỗi tin cần từ 2 đến 5 ảnh khác nhau.');
      if (creating) {
        const sellerId = text(data.seller_id, 100);
        if (
          !(await c.env.DB.prepare(
            "SELECT id FROM users u WHERE id=? AND is_locked=0 AND role IN ('seller','admin') AND EXISTS(SELECT 1 FROM seller_applications a WHERE a.user_id=u.id AND a.status='approved')",
          )
            .bind(sellerId)
            .first())
        )
          return fail(c, 'Người bán cần được phê duyệt và không bị khóa.');
        await c.env.DB.batch([
          c.env.DB.prepare(
            'INSERT INTO listings(id,seller_id,title,author,description,price_vnd,condition,category,city,change_token,image_keys) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          ).bind(
            id,
            sellerId,
            title,
            author,
            description,
            price,
            condition,
            category,
            city,
            token,
            JSON.stringify(imageKeys),
          ),
          stamp(c, 'create', 'listing', id, token, 'listings'),
        ]);
        return c.json({ id, status: 'pending' }, 201);
      }
      // Any content edit returns the listing to review; status and owner are not client-controlled.
      const changed = await mutation(c, [
        c.env.DB.prepare(
          "UPDATE listings SET title=?,author=?,description=?,price_vnd=?,condition=?,category=?,city=?,image_keys=?,status='pending',version=version+1,updated_at=datetime('now'),change_token=? WHERE id=? AND version=? AND deleted_at IS NULL",
        ).bind(
          title,
          author,
          description,
          price,
          condition,
          category,
          city,
          JSON.stringify(imageKeys),
          token,
          id,
          data.version,
        ),
        stamp(c, 'update_pending_review', 'listing', id, token, 'listings'),
      ]);
      return changed
        ? c.json({ ok: true, status: 'pending' })
        : fail(c, 'Tin đã thay đổi. Hãy tải lại.', 409);
    },
  );
}
for (const restore of [false, true]) {
  cms.on(
    restore ? 'POST' : 'DELETE',
    restore ? '/catalog/:id/restore' : '/catalog/:id',
    requirePermission(`listings.${restore ? 'restore' : 'delete'}`),
    async (c) => {
      const id = c.req.param('id'),
        data = await body(c),
        token = uid();
      if (!Number.isInteger(data.version))
        return fail(c, 'Thiếu phiên bản dữ liệu.');
      const changed = await mutation(c, [
        c.env.DB.prepare(
          `UPDATE listings SET deleted_at=${restore ? 'NULL' : "datetime('now')"},deleted_by=${restore ? 'NULL' : '?'},${restore ? "status='pending'," : ''}version=version+1,change_token=?,updated_at=datetime('now') WHERE id=? AND version=? AND deleted_at IS ${restore ? 'NOT ' : ''}NULL`,
        ).bind(...(restore ? [] : [c.get('user').id]), token, id, data.version),
        stamp(
          c,
          restore ? 'restore_pending_review' : 'trash',
          'listing',
          id,
          token,
          'listings',
        ),
      ]);
      return changed
        ? c.json({ ok: true })
        : fail(
            c,
            'Tin đã thay đổi hoặc không còn ở trạng thái này. Hãy tải lại.',
            409,
          );
    },
  );
}
cms.get('/audit', requirePermission('audit.view'), async (c) => {
  const page = number(c.req.query('page')),
    limit = number(c.req.query('limit'), 25, 100);
  const [rows, total] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      'SELECT a.id,a.action,a.resource_type,a.resource_id,a.created_at,u.name AS actor FROM cms_audit a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id LIMIT ? OFFSET ?',
    ).bind(limit, (page - 1) * limit),
    c.env.DB.prepare('SELECT count(*) AS total FROM cms_audit'),
  ]);
  return c.json({
    items: rows.results,
    total: Number(total.results[0]?.total ?? 0),
    page,
    limit,
  });
});
export default cms;
