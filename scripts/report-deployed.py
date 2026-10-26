"""Exercise reports on project Pages using only unique disposable fixtures, then clean them."""
import argparse, json, os, re, secrets, subprocess, sys, urllib.request, urllib.error, uuid
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin',default='https://cho-sach-cu.pages.dev');parser.add_argument('--database-id',required=True);parser.add_argument('--ui',action='store_true')
parser.add_argument('--profile-ui',action='store_true',help='Test own CMS profile and password on disposable reviewer only')
args=parser.parse_args();origin=args.origin.rstrip('/')
assert origin=='https://cho-sach-cu.pages.dev'
assert args.database_id=='9b434dcb-2166-478c-b1ec-afa5f24506f5'
account_id=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN']
checks=0; users=[]; listing_ids=[]; role='reports-smoke-'+uuid.uuid4().hex;keys=[]
password=secrets.token_urlsafe(28)
def query(sql,params=[]):
 req=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{args.database_id}/query',data=json.dumps({'sql':sql,'params':params}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r: result=json.load(r)
 assert result.get('success') and all(x.get('success') for x in result['result']), 'Fixture D1 operation failed'
 return result['result'][0]['results']
def call(path,method='GET',payload=None,cookie=None,expected=200):
 global checks
 headers={'User-Agent':'Mozilla/5.0 ChoSachReportsSmoke/1.0'}
 if cookie:headers['Cookie']=cookie
 data=None
 if payload is not None:data=json.dumps(payload).encode();headers['Content-Type']='application/json'
 req=urllib.request.Request(origin+'/api'+path,data=data,method=method,headers=headers)
 try:r=urllib.request.urlopen(req,timeout=40)
 except urllib.error.HTTPError as e:r=e
 with r:
  raw=r.read();assert r.status==expected,f'{method} {path}: expected {expected}, got {r.status}'
  result=json.loads(raw);checks+=1
  return result,r.headers
try:
 for label in ['seller','buyer','reviewer']:
  email='report-smoke-'+uuid.uuid4().hex+'@example.invalid'
  user,_=call('/auth/register','POST',{'name':'Reports smoke '+label,'email':email,'password':password},expected=201)
  users.append(user['user']['id'])
  _,headers=call('/auth/login','POST',{'email':email,'password':password})
  cookie=headers['Set-Cookie'].split(';')[0]
  if label=='seller':seller=users[-1];seller_cookie=cookie
  if label=='buyer':buyer=users[-1];buyer_cookie=cookie
  if label=='reviewer':reviewer=users[-1];review_cookie=cookie;review_email=email
 query("UPDATE users SET role='seller' WHERE id=? AND email LIKE 'report-smoke-%@example.invalid' AND is_super_admin=0",[seller])
 query('INSERT INTO cms_roles(id,name) VALUES(?,?)',[role,role])
 for perm in ['reports.view','reports.review','listings.view','listings.update']:query('INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,?)',[role,perm])
 query('INSERT INTO cms_user_roles(user_id,role_id) VALUES(?,?)',[reviewer,role])
 # No image upload required: isolated fixtures reference only keys under the generated Seller.
 # They are never discoverable via this script until activated deliberately; no real R2 objects are created.
 categories,_=call('/categories');assert categories['items'], 'No active category for fixtures'
 category=categories['items'][0]['name']
 def make():
  body={'title':'Reports smoke test book','author':'Fixture author','price':20000,'condition':'good','category':category,'city':'Hà Nội','description':'Disposable reports test fixture','image_keys':[seller+'/report-test-1.png',seller+'/report-test-2.png']}
  data,_=call('/listings','POST',body,seller_cookie,201);id=data['id'];listing_ids.append(id)
  query("UPDATE listings SET status='active',version=version+1 WHERE id=? AND seller_id=? AND status='pending'",[id,seller]);return id
 payload={'reason':'fraud','description':'Temporary controlled report test. No real violation alleged.'}
 id=make();path='/listings/'+id+'/reports'
 call(path,'POST',payload,expected=401)
 call(path,'POST',payload,seller_cookie,400)
 call(path,'POST',{**payload,'description':'😀'*5},buyer_cookie,400)
 call(path,'POST',payload,buyer_cookie,201)
 call(path,'POST',payload,buyer_cookie,409)
 call('/admin/reports',cookie=buyer_cookie,expected=403)
 call('/listings/'+id)
 data,_=call('/admin/reports?status=pending',cookie=review_cookie);row=next(x for x in data['items'] if x['listing_id']==id)
 assert buyer not in json.dumps(row) and 'email' not in row
 action={'action':'hide','note':'Controlled fixture review and hide.','version':row['version'],'listing_version':row['current_listing_version']}
 decision='/admin/reports/'+row['id']+'/decision'
 call(decision,'POST',{**action,'note':' '},review_cookie,400)
 call(decision,'POST',{**action,'listing_version':-1},review_cookie,409)
 query("DELETE FROM cms_role_permissions WHERE role_id=? AND permission='listings.update'",[role])
 call(decision,'POST',action,review_cookie,403)
 query("INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,'listings.update')",[role])
 call(decision,'POST',action,review_cookie)
 call('/listings/'+id,expected=404)
 call('/listings/'+id+'/contact',cookie=buyer_cookie,expected=404)
 call(decision,'POST',action,review_cookie,409)
 result=query('SELECT status,resolution,review_note,reviewed_by FROM listing_reports WHERE id=?',[row['id']])[0]
 assert result=={'status':'resolved','resolution':'hide','review_note':action['note'],'reviewed_by':reviewer}
 assert query('SELECT decision,note FROM listing_reviews WHERE listing_id=?',[id])==[{'decision':'hidden','note':action['note']}]
 if args.ui:
  ui_id=make()
  query("DELETE FROM cms_role_permissions WHERE role_id=? AND permission IN ('listings.view','listings.update')",[role])
  env={**os.environ,'UI_REPORT_LISTING_ID':ui_id,'UI_REPORT_STAFF_COOKIE':review_cookie,'UI_BUYER_COOKIE':buyer_cookie}
  subprocess.run([sys.executable,str(Path(__file__).with_name('check-ui.py')),origin,'--reports-only','--output-dir','/tmp/cho-sach-reports-production'],env=env,check=True,timeout=240)
 if args.profile_ui:
  _,other_headers=call('/auth/login','POST',{'email':review_email,'password':password})
  other_cookie=other_headers['Set-Cookie'].split(';')[0]
  next_password=secrets.token_urlsafe(28);final_password=secrets.token_urlsafe(28)
  env={**os.environ,'UI_BUYER_COOKIE':review_cookie,'UI_BUYER_EMAIL':review_email,'UI_PASSWORD':password,'UI_PASSWORD_NEW':next_password,'UI_PASSWORD_FINAL':final_password,'UI_HAS_CMS':'1'}
  subprocess.run([sys.executable,str(Path(__file__).with_name('check-ui.py')),origin,'--password-only','--output-dir','/tmp/cho-sach-cms-profile-production'],env=env,check=True,timeout=300)
  call('/auth/me',cookie=other_cookie,expected=401)
  call('/auth/login','POST',{'email':review_email,'password':password},expected=401)
  final,headers=call('/auth/login','POST',{'email':review_email,'password':final_password})
  assert final['user']['id']==reviewer and final['user']['cms_access'] and not final['user']['is_super_admin']
  assert 'users.update' not in final['user']['permissions']
  call('/auth/logout','POST',{},headers['Set-Cookie'].split(';')[0])
  print('PASS: real CMS profile update without users.update, legacy redirect, three viewports, password logout on all sessions and new login')
 print(f'PASS: {checks} deployed report HTTP checks, D1 review/audit assertions'+(' and Chromium UI' if args.ui else ''))
finally:
 # Only IDs obtained from new registrations in this run; never real accounts or their reports.
 if users:
  assert all(re.fullmatch(r'[0-9a-f-]{36}',x) for x in users)
  marks=','.join('?' for _ in users)
  query(f'DELETE FROM listing_reports WHERE reporter_id IN ({marks})',users)
  query(f'DELETE FROM cms_audit WHERE actor_id IN ({marks})',users)
  for id in listing_ids:
   query('DELETE FROM listing_reviews WHERE listing_id=? AND listing_id IN (SELECT id FROM listings WHERE seller_id=?)',[id,seller])
   query('DELETE FROM listings WHERE id=? AND seller_id=?',[id,seller])
  query('DELETE FROM cms_user_roles WHERE role_id=?',[role]);query('DELETE FROM cms_role_permissions WHERE role_id=?',[role]);query('DELETE FROM cms_roles WHERE id=? AND name=?',[role,role])
  for id in users:query("DELETE FROM users WHERE id=? AND email LIKE 'report-smoke-%@example.invalid' AND is_super_admin=0",[id])
  print('PASS: removed only generated report fixtures, delegated role and accounts; no R2 objects or real data modified')
