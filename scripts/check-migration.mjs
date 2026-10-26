import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),api=join(root,'apps/api'),wrangler=join(api,'node_modules/wrangler/bin/wrangler.js');
const temporary=await mkdtemp(join(tmpdir(),'cho-sach-upgrade-'));
function sql(args){return JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','cho-sach-cu-db','--local','--persist-to',join(temporary,'state'),'--json',...args],{cwd:api,env:{...process.env,XDG_CONFIG_HOME:join(temporary,'config'),WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:60000}));}
try{
 sql(['--file',join(api,'migrations/0001_initial.sql')]);
 const seed=join(temporary,'fixture.sql');
 // An intentionally non-authenticatable hash; no default password or real account.
 await writeFile(seed,`INSERT INTO users(id,name,email,password_hash,role) VALUES('upgrade-user','Upgrade fixture','upgrade@example.test','${randomBytes(48).toString('hex')}','admin');
 INSERT INTO seller_applications(id,user_id,phone,status) VALUES('upgrade-application','upgrade-user','0900000000','approved');
 INSERT INTO listings(id,seller_id,title,author,price_vnd,condition,category,city,status) VALUES('upgrade-book','upgrade-user','Upgrade book','Fixture author',42000,'good','Legacy category','Hà Nội','active');
 INSERT INTO listing_reviews(id,listing_id,admin_id,decision,note) VALUES('upgrade-review','upgrade-book','upgrade-user','active','Preserve review history');`);
 sql(['--file',seed]);
 sql(['--file',join(api,'migrations/0002_cms_rbac.sql')]);
 sql(['--file',join(api,'migrations/0003_listing_reports.sql')]);
 sql(['--file',join(api,'migrations/0004_request_limits.sql')]);
 const result=sql(['--command',`SELECT u.role,u.is_locked,u.is_super_admin,l.status,l.category,l.deleted_at,r.note,(SELECT count(*) FROM cms_user_roles WHERE user_id=u.id) AS grants FROM users u JOIN listings l ON l.seller_id=u.id JOIN listing_reviews r ON r.listing_id=l.id WHERE u.id='upgrade-user'`])[0].results;
 assert.equal(result.length,1);assert.deepEqual(result[0],{role:'admin',is_locked:0,is_super_admin:0,status:'active',category:'Legacy category',deleted_at:null,note:'Preserve review history',grants:1});
 assert.equal(sql(['--command','SELECT count(*) AS total FROM listing_reports'])[0].results[0].total,0);
 const categories=sql(['--command',"SELECT count(*) AS total FROM categories WHERE name='Legacy category'"])[0].results;
 assert.equal(categories[0].total,1);
 assert.deepEqual(sql(['--command','PRAGMA foreign_key_check'])[0].results,[]);
 console.log('PASS: upgrade from 0001 preserves existing account, active listing, Seller approval, review history and custom category; no automatic Super Admin; foreign keys valid');
}finally{await rm(temporary,{recursive:true,force:true,maxRetries:3});}
