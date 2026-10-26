import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { Env } from './security.ts';
import { passwordHash, verifyPassword, derivationLimitCode } from './password.ts';

export default function changePasswordRoutes(auth: MiddlewareHandler<Env>) {
  const router = new Hono<Env>();
  router.post('/change-password', auth, async c => {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))
      return c.json({error:'Định dạng yêu cầu không hợp lệ.'},415);
    let body: Record<string, unknown> = {};
    try {const value=await c.req.json();if(value && typeof value==='object' && !Array.isArray(value)) body=value;} catch { /* Validate below. */ }
    const current=body.current_password, next=body.new_password;
    if (typeof current!=='string' || !current || current.length>128 || typeof next!=='string' || next.length<10 || next.length>128 || body.confirm_password!==next)
      return c.json({error:'Nhập mật khẩu hiện tại, mật khẩu mới từ 10 đến 128 ký tự và xác nhận khớp nhau.'},400);
    if (current===next) return c.json({error:'Mật khẩu mới phải khác mật khẩu hiện tại.'},400);
    const user=c.get('user');
    const attempt=await c.env.DB.prepare(
      "INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id) SELECT ?,?,'password.change_attempt','account',? WHERE (SELECT count(*) FROM cms_audit WHERE actor_id=? AND action='password.change_attempt' AND created_at>=datetime('now','-15 minutes'))<5",
    ).bind(crypto.randomUUID(),user.id,user.id,user.id).run();
    if (attempt.meta.changes!==1) {
      c.header('Retry-After','900');
      return c.json({error:'Bạn đã thử đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.'},429);
    }
    const row=await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=? AND is_locked=0').bind(user.id).first<{password_hash:string}>();
    if (!row) return c.json({error:'Phiên đăng nhập không còn hợp lệ.'},401);
    let digest: string;
    try {
      if (!(await verifyPassword(current,row.password_hash))) return c.json({error:'Mật khẩu hiện tại không đúng.'},400);
      digest=await passwordHash(next);
    } catch(error) {
      if (derivationLimitCode(error)) return c.json({error:'Đổi mật khẩu đang tạm chưa khả dụng. Vui lòng thử lại sau.'},503);
      // Do not log KDF errors that could include sensitive inputs.
      return c.json({error:'Chưa thể đổi mật khẩu. Vui lòng thử lại sau.'},503);
    }
    const token=crypto.randomUUID();
    const results=await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash=?,version=version+1,change_token=? WHERE id=? AND password_hash=? AND is_locked=0').bind(digest,token,user.id,row.password_hash),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND change_token=?)').bind(user.id,user.id,token),
      c.env.DB.prepare("INSERT INTO cms_audit(id,actor_id,action,resource_type,resource_id) SELECT ?,?,'password.changed','account',? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND change_token=?)").bind(crypto.randomUUID(),user.id,user.id,user.id,token),
    ]);
    if (results[0].meta.changes!==1) return c.json({error:'Tài khoản đã thay đổi. Hãy đăng nhập lại trước khi thử.'},409);
    deleteCookie(c,'cho_session',{path:'/'});
    return c.json({ok:true,reauthenticate:true,message:'Đã đổi mật khẩu và đăng xuất toàn bộ thiết bị.'});
  });
  return router;
}
