import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './security.ts';

/** Browser origin protection for every write, including login and multipart uploads. */
export const requestSafety: MiddlewareHandler<Env> = async (c,next) => {
  c.header('X-Content-Type-Options','nosniff');
  c.header('X-Frame-Options','DENY');
  c.header('Referrer-Policy','strict-origin-when-cross-origin');
  if (['GET','HEAD','OPTIONS'].includes(c.req.method)) return next();
  const origin=c.req.header('Origin'), target=new URL(c.req.url);
  let localProxy=false;
  if (origin && target.protocol==='http:' && ['127.0.0.1','localhost'].includes(target.hostname)) {
    try {const source=new URL(origin);localProxy=source.protocol==='http:' && ['127.0.0.1','localhost'].includes(source.hostname);} catch { /* Invalid origins are denied below. */ }
  }
  if (c.req.header('Sec-Fetch-Site')==='cross-site' || (origin && origin!==target.origin && !localProxy))
    return c.json({error:'Yêu cầu phải được gửi từ website này.'},403);
  const contentType=c.req.header('Content-Type');
  const mediaType=contentType?.split(';',1)[0].trim().toLowerCase();
  if (mediaType && c.req.path!=='/api/images' && mediaType!=='application/json')
    return c.json({error:'Định dạng yêu cầu phải là JSON.'},415);
  return bodyLimit({maxSize:c.req.path==='/api/images' ? 6*1024*1024 : 32*1024,onError:ctx=>ctx.json({error:'Nội dung yêu cầu vượt kích thước cho phép.'},413)})(c,next);
};
