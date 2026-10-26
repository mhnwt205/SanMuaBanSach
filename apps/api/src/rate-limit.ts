import type { AppContext } from './security.ts';

/** D1 atomic fixed-window counters; store hashes, never raw addresses or email. */
export async function rateLimit(c:AppContext,scope:string,subject:string,maximum:number,seconds:number):Promise<Response|null> {
  const now=Math.floor(Date.now()/1000), bucket=Math.floor(now/seconds), until=(bucket+1)*seconds;
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${scope}:${subject}`));
  const key=Array.from(new Uint8Array(raw),byte=>byte.toString(16).padStart(2,'0')).join('');
  const result=await c.env.DB.prepare(`INSERT INTO request_limits(key,bucket,attempts,expires_at) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN request_limits.bucket=excluded.bucket THEN request_limits.attempts+1 ELSE 1 END,
    bucket=excluded.bucket,expires_at=excluded.expires_at
    RETURNING attempts`).bind(key,bucket,until).first<{attempts:number}>();
  if (!result || result.attempts>maximum) {
    c.header('Retry-After',String(Math.max(1,until-now)));
    return c.json({error:'Bạn đã thử quá nhiều lần. Vui lòng chờ trước khi thử lại.'},429);
  }
  return null;
}
export const clientAddress=(c:AppContext)=>c.req.header('CF-Connecting-IP') ?? 'unknown';
