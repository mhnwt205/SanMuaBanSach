import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

export async function runAccountChecks({request,status,account,password,seller,admin}) {
  const user=await account('password-change');
  status(await request('/api/account',{method:'PATCH',json:{name:'No session'}}),401);
  status(await request('/api/account',{method:'PATCH',cookie:user.cookie,json:{name:' '}}),400);
  const profile=status(await request('/api/account',{method:'PATCH',cookie:user.cookie,json:{name:'Profile test',id:admin.id,role:'admin',is_super_admin:true,permissions:['users.update'],email:admin.email}}),200).data.user;
  assert.equal(profile.id,user.id);assert.equal(profile.name,'Profile test');assert.equal(profile.email,user.email);assert.equal(profile.role,'user');assert.equal(profile.is_super_admin,false);assert.deepEqual(profile.permissions,[]);
  assert.equal(status(await request('/api/auth/me',{cookie:user.cookie}),200).data.user.name,'Profile test');
  const next=randomBytes(24).toString('base64url');
  const payload={current_password:password,new_password:next,confirm_password:next};
  const change=(json=payload,cookie=user.cookie,headers)=>request('/api/auth/change-password',{method:'POST',json,cookie,headers});
  status(await change(payload,null),401);
  status(await change(payload,user.cookie,{Origin:'https://evil.example'}),403);
  status(await change(payload,user.cookie,{'Sec-Fetch-Site':'cross-site'}),403);
  status(await request('/api/auth/change-password',{method:'POST',cookie:user.cookie,body:'text only'}),415);
  for (const values of [
    {...payload,new_password:'short',confirm_password:'short'},
    {...payload,confirm_password:'different'},
    {...payload,new_password:password,confirm_password:password},
    {...payload,new_password:'x'.repeat(129),confirm_password:'x'.repeat(129)},
  ]) status(await change(values),400);
  status(await change({...payload,current_password:'wrong-password'}),400);
  const otherSession=status(await request('/api/auth/login',{method:'POST',json:{email:user.email,password}}),200);
  const otherCookie=otherSession.response.headers.get('set-cookie').split(';')[0];
  const changed=status(await change({...payload,user_id:seller.id,role:'admin'}),200);
  assert.equal(changed.data.reauthenticate,true);
  assert.match(changed.response.headers.get('set-cookie'),/cho_session=/);
  for (const cookie of [user.cookie,otherCookie]) status(await request('/api/auth/me',{cookie}),401);
  status(await request('/api/auth/me',{cookie:seller.cookie}),200);
  status(await request('/api/auth/login',{method:'POST',json:{email:user.email,password}}),401);
  const login=status(await request('/api/auth/login',{method:'POST',json:{email:user.email,password:next}}),200);
  assert.equal(login.data.user.id,user.id);assert.equal(login.data.user.role,'user');
  const cookie=login.response.headers.get('set-cookie').split(';')[0];
  const candidates=[randomBytes(24).toString('base64url'),randomBytes(24).toString('base64url')];
  const races=await Promise.all(candidates.map(value=>change({current_password:next,new_password:value,confirm_password:value},cookie)));
  const codes=races.map(r=>r.response.status);
  assert.equal(codes.filter(c=>c===200).length,1);
  assert.ok(codes.every(c=>[200,401,409].includes(c)));
  for (const response of races) status(response,response.response.status);
  status(await request('/api/auth/me',{cookie}),401);
  const limited=await account('password-limit');
  for(let attempt=0;attempt<5;attempt++) status(await change({...payload,current_password:'wrong-password'},limited.cookie),400);
  const blocked=status(await change(payload,limited.cookie),429);
  assert.equal(blocked.response.headers.get('retry-after'),'900');
  status(await request('/api/auth/login',{method:'POST',json:{email:limited.email,password}}),200);
  const audit=status(await request('/api/admin/audit?limit=100',{cookie:admin.cookie}),200).data;
  assert.equal(audit.items.filter(row=>row.resource_id===user.id && row.action==='password.changed').length,2);
  console.log('PASS: password validation/current secret, origin checks, all-session revocation, unchanged role, concurrent change and per-account limit');
}
