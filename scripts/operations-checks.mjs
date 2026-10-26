import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export async function runOperationsChecks({request,status,account,seller,admin,book,suffix,localD1}) {
  for(const [path,method] of [['/api/account','PATCH'],['/api/auth/login','POST'],['/api/auth/logout','POST'],['/api/admin/roles','POST'],['/api/images','POST'],['/api/images/example/a.png','DELETE'],['/api/seller/applications','POST']]) {
    status(await request(path,{method,cookie:admin.cookie,json:{},headers:{Origin:'https://evil.example','Sec-Fetch-Site':'same-site'}}),403);
    status(await request(path,{method,cookie:admin.cookie,json:{},headers:{'Sec-Fetch-Site':'cross-site'}}),403);
  }
  status(await request('/api/account',{method:'PATCH',cookie:seller.cookie,json:{name:'No change'},headers:{Origin:'null'}}),403);
  status(await request('/api/account',{method:'PATCH',cookie:seller.cookie,body:'{"name":"Rejected"}',headers:{'Content-Type':'text/plain'}}),415);
  status(await request('/api/account',{method:'PATCH',cookie:seller.cookie,body:'{"name":"Rejected"}',headers:{'Content-Type':'application/jsonp'}}),415);
  status(await request('/api/auth/register',{method:'POST',json:{name:'x'.repeat(33000)}}),413);
  for(const path of ['/api/auth/register','/api/auth/login','/api/seller/applications','/api/listings']) {
    for(const json of [null,[],{name:42,email:[],password:{},phone:42,title:42,image_keys:[]}])
      status(await request(path,{method:'POST',cookie:seller.cookie,json}),path==='/api/seller/applications' ? 409 : 400);
  }
  // No real account is locked; exercise atomic guards using a nonexistent random email.
  const email=`ops-limit-${suffix}@example.test`,headers={'CF-Connecting-IP':'192.0.2.71'};
  const attempts=await Promise.all(Array.from({length:25},()=>request('/api/auth/login',{method:'POST',json:{email,password:'not-a-real-password'},headers})));
  assert.equal(attempts.filter(x=>x.response.status===401).length,20);
  assert.equal(attempts.filter(x=>x.response.status===429).length,5);
  for(const result of attempts) {status(result,result.response.status);if(result.response.status===429)assert.ok(Number(result.response.headers.get('Retry-After'))>0);}
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const key=digest('login-account:'+email),now=Math.floor(Date.now()/1000);
  localD1(['execute','cho-sach-cu-db','--command',`UPDATE request_limits SET bucket=${Math.floor(now/900)-1},attempts=999,expires_at=${now-1} WHERE key='${key}'`]);
  status(await request('/api/auth/login',{method:'POST',json:{email,password:'not-a-real-password'},headers}),401);
  const registerKey=digest('register-ip:192.0.2.72');
  localD1(['execute','cho-sach-cu-db','--command',`INSERT INTO request_limits(key,bucket,attempts,expires_at) VALUES('${registerKey}',${Math.floor(now/3600)},30,${now+3600})`]);
  status(await request('/api/auth/register',{method:'POST',json:{name:'Rate fixture',email:`never-created-${suffix}@example.test`,password:'not-a-real-password'},headers:{'CF-Connecting-IP':'192.0.2.72'}}),429);
  const legacy=await account('ops-legacy-admin');
  localD1(['execute','cho-sach-cu-db','--command',`UPDATE users SET role='admin' WHERE id='${legacy.id}'`]);
  status(await request(`/api/images/${book.image_keys[0]}`,{method:'DELETE',cookie:legacy.cookie}),403);
  status(await request(`/api/images/${book.image_keys[0]}`,{method:'DELETE',cookie:seller.cookie}),409);
  status(await request(`/api/images/${book.image_keys[0]}`),200);
  const headersResult=status(await request('/api/auth/me',{cookie:seller.cookie}),200).response.headers;
  assert.match(headersResult.get('Cache-Control'),/private, no-store/);
  assert.equal(headersResult.get('X-Content-Type-Options'),'nosniff');assert.equal(headersResult.get('X-Frame-Options'),'DENY');
  for(const q of ['Sách tiếng Việt rất dài '.repeat(5),'%_literal\\',"' OR 1=1 --"]){
    for(const path of ['/api/listings','/api/admin/listings','/api/admin/catalog','/api/admin/categories','/api/admin/roles','/api/admin/users'])
      status(await request(path+'?q='+encodeURIComponent(q),{cookie:admin.cookie}),200);
  }
  console.log('PASS: shared write/CSRF/body guards, malformed inputs, atomic auth rate limits and reset, hash-only subjects, image reference protection, least-privilege deletion, private headers and long/literal search');
}
