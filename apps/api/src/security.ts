import type { Context, MiddlewareHandler } from 'hono';
export const permissionGroups = [
  {
    key: 'listings',
    name: 'Tin đăng / sách',
    actions: {
      view: 'Xem danh sách và chi tiết',
      create: 'Tạo tin',
      update: 'Sửa nội dung',
      delete: 'Đưa vào thùng rác',
      restore: 'Khôi phục tin',
      review: 'Phê duyệt / từ chối tin',
    },
  },
  {
    key: 'sellers',
    name: 'Xét duyệt người bán',
    actions: {
      view: 'Xem yêu cầu và lịch sử',
      review: 'Duyệt / từ chối Seller',
    },
  },
  {
    key: 'users',
    name: 'Tài khoản',
    actions: {
      view: 'Xem tài khoản',
      create: 'Tạo tài khoản User',
      update: 'Sửa tên hiển thị',
      lock: 'Khóa / mở khóa',
      assign_roles: 'Gán role quản trị',
    },
  },
  {
    key: 'categories',
    name: 'Danh mục sách',
    actions: {
      view: 'Xem danh mục',
      create: 'Tạo danh mục',
      update: 'Sửa danh mục',
      delete: 'Đưa vào thùng rác',
      restore: 'Khôi phục danh mục',
    },
  },
  {
    key: 'roles',
    name: 'Role và quyền',
    actions: {
      view: 'Xem role / quyền',
      create: 'Tạo role',
      update: 'Sửa role / quyền',
      delete: 'Đưa vào thùng rác',
      restore: 'Khôi phục role',
    },
  },
  {
    key: 'reports',
    name: 'Báo cáo vi phạm',
    actions: { view: 'Xem báo cáo', review: 'Xử lý báo cáo' },
  },
  {
    key: 'audit',
    name: 'Nhật ký quản trị',
    actions: { view: 'Xem nhật ký thao tác' },
  },
] as const;
export const allPermissions = permissionGroups.flatMap((group) =>
  Object.keys(group.actions).map((action) => `${group.key}.${action}`),
);
export type CmsUser = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'seller' | 'admin';
  is_locked?: number;
  is_super_admin?: number;
  permissions?: string[];
  cms_access?: boolean;
};
export type Env = {
  Bindings: { DB: D1Database; IMAGES?: R2Bucket };
  Variables: { user: CmsUser };
};
export type AppContext = Context<Env>;
export async function resolveUser(
  db: D1Database,
  user: CmsUser,
): Promise<CmsUser> {
  const rows = await db
    .prepare(
      `SELECT r.id,CASE WHEN r.deleted_at IS NULL THEN p.permission ELSE NULL END AS permission FROM cms_user_roles ur JOIN cms_roles r ON r.id=ur.role_id LEFT JOIN cms_role_permissions p ON p.role_id=r.id WHERE ur.user_id=?`,
    )
    .bind(user.id)
    .all<{ id: string; permission: string | null }>();
  const permissions = user.is_super_admin
    ? [...allPermissions]
    : rows.results.length
      ? [
          ...new Set(
            rows.results
              .map((row) => row.permission)
              .filter(
                (value): value is string =>
                  typeof value === 'string' && allPermissions.includes(value),
              ),
          ),
        ]
      : [];
  return {
    ...user,
    permissions,
    cms_access: permissions.length > 0 || Boolean(user.is_super_admin),
  };
}
export const safeUser = (user: CmsUser) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  is_super_admin: Boolean(user.is_super_admin),
  permissions: user.permissions ?? [],
  cms_access: Boolean(user.cms_access),
});
export const can = (user: CmsUser, permission: string) =>
  Boolean(user.is_super_admin) ||
  Boolean(user.permissions?.includes(permission));
export const requirePermission =
  (permission: string): MiddlewareHandler<Env> =>
  async (c, next) => {
    if (!can(c.get('user'), permission))
      return c.json(
        { error: 'Bạn không có quyền thực hiện thao tác này.' },
        403,
      );
    await next();
  };
export const audit = (
  c: AppContext,
  action: string,
  type: string,
  id: string,
  detail: Record<string, unknown> = {},
) =>
  c.env.DB.prepare(
    'INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id,detail_json) VALUES(?,?,?,?,?,?)',
  ).bind(
    crypto.randomUUID(),
    c.get('user').id,
    action,
    type,
    id,
    JSON.stringify(detail),
  );
