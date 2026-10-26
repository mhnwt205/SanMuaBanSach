"""Verify independent role checkboxes on Pages using one disposable delegated account.
Never uses a real administrator or changes an existing role. TLS verification stays enabled.
"""
import gzip,json,os,re,secrets,urllib.request,urllib.error,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
origin='https://cho-sach-cu.pages.dev'
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN']
database='9b434dcb-2166-478c-b1ec-afa5f24506f5'
prefix='checkbox-smoke-'+uuid.uuid4().hex
email=prefix+'@example.invalid';password=secrets.token_urlsafe(28)
user_id=None;bootstrap=prefix+'-bootstrap';checks=0
output=Path('/tmp/cho-sach-independent-permissions-production');output.mkdir(exist_ok=True)
def query(sql,params=[]):
 request=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query',data=json.dumps({'sql':sql,'params':params}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=40) as r:result=json.load(r)
 assert result.get('success') and all(x.get('success') for x in result['result'])
 return result['result'][0]['results']
def api(path,method='GET',data=None,cookie=None,expected=200):
 global checks
 headers={'User-Agent':'Mozilla/5.0'}
 if cookie:headers['Cookie']=cookie
 if data is not None:headers['Content-Type']='application/json'
 request=urllib.request.Request(origin+'/api'+path,data=None if data is None else json.dumps(data).encode(),method=method,headers=headers)
 try:r=urllib.request.urlopen(request,timeout=40)
 except urllib.error.HTTPError as e:r=e
 with r:
  raw=r.read()
  if r.status!=expected and method=='GET':
   detail=json.loads(raw).get('error','') if r.headers.get('Content-Type','').startswith('application/json') else ('Cloudflare 1102' if b'1102' in raw else 'non-JSON response')
   print('HTTP diagnostic:',r.status,detail,flush=True)
  assert r.status==expected,f'{method} {path}: HTTP {r.status}'
  checks+=1;return json.loads(raw),r.headers

def forward(route):
 req=route.request;assert req.url.startswith(origin+'/')
 headers={k:v for k,v in req.all_headers().items() if k.lower() not in ['host','content-length','accept-encoding']};headers['Accept-Encoding']='identity';headers['User-Agent']='Mozilla/5.0'
 request=urllib.request.Request(req.url,data=req.post_data_buffer,method=req.method,headers=headers)
 try:r=urllib.request.urlopen(request,timeout=40)
 except urllib.error.HTTPError as e:r=e
 with r:
  body=r.read()
  if r.headers.get('Content-Encoding')=='gzip':body=gzip.decompress(body)
  headers={k:v for k,v in r.headers.items() if k.lower() not in ['content-length','transfer-encoding','content-encoding','connection']}
  route.fulfill(status=r.status,headers=headers,body=body)
try:
 registered,_=api('/auth/register','POST',{'name':'Checkbox test','email':email,'password':password},expected=201)
 user_id=registered['user']['id']
 query('INSERT INTO cms_roles(id,name) VALUES(?,?)',[bootstrap,bootstrap])
 grants=['roles.view','roles.create','roles.update','listings.view','listings.update','listings.review','categories.view']
 for permission in grants:query('INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,?)',[bootstrap,permission])
 query('INSERT INTO cms_user_roles(user_id,role_id) VALUES(?,?)',[user_id,bootstrap])
 _,headers=api('/auth/login','POST',{'email':email,'password':password});cookie=headers['Set-Cookie'].split(';')[0]
 me,_=api('/auth/me',cookie=cookie);assert me['user']['role']=='user' and not me['user']['is_super_admin']
 errors=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  context=browser.new_context();context.add_cookies([{'name':'cho_session','value':cookie.split('=',1)[1],'url':origin}]);context.route('**/*',forward)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));expect.set_options(timeout=20000)
  for width in [1440,768,390]:
   name=prefix+'-'+str(width);assert len(name.encode('utf-8'))>50
   page.set_viewport_size({'width':width,'height':900})
   response=page.goto(origin+'/quan-tri/phan-quyen',wait_until='networkidle',timeout=60000);assert response.status==200
   expect(page.locator('h1')).to_have_text('Role và phân quyền')
   page.get_by_role('button',name=re.compile('Tạo mới$')).click();page.get_by_label('Tên role',exact=True).fill(name)
   group=page.locator('.cms-permission-groups section').filter(has=page.get_by_role('heading',name='Tin đăng / sách',exact=True))
   review=group.get_by_role('checkbox',name='Phê duyệt / từ chối tin',exact=True);update=group.get_by_role('checkbox',name='Sửa nội dung',exact=True);view=group.get_by_role('checkbox',name='Xem danh sách và chi tiết',exact=True)
   label=group.locator('.ant-checkbox-wrapper').filter(has_text='Phê duyệt / từ chối tin')
   label.click();expect(review).to_be_checked();expect(group.get_by_role('checkbox',checked=True)).to_have_count(1)
   label.click();expect(review).not_to_be_checked();expect(group.get_by_role('checkbox',checked=True)).to_have_count(0)
   label.click();update.check();expect(group.get_by_role('checkbox',checked=True)).to_have_count(2);expect(view).not_to_be_checked()
   view.check();view.uncheck();expect(review).to_be_checked();expect(update).to_be_checked()
   category=page.locator('.cms-permission-groups section').filter(has=page.get_by_role('heading',name='Danh mục sách',exact=True)).get_by_role('checkbox',name='Xem danh mục',exact=True)
   category.check();expect(group.get_by_role('checkbox',checked=True)).to_have_count(2)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(output/f'checkbox-{width}.png'),full_page=True)
   save=page.get_by_role('button',name='Lưu thay đổi',exact=True);save.click();expect(save).not_to_be_visible()
   def saved():
    data,_=api('/admin/roles?q='+name,cookie=cookie)
    return next(row for row in data['items'] if row['name']==name)
   row=saved();assert set(row['permissions'])=={'listings.update','listings.review','categories.view'}
   page.locator('.ant-table-tbody tr').filter(has=page.get_by_text(name,exact=True)).get_by_role('button',name=re.compile('Sửa$')).click()
   expect(review).to_be_checked();expect(update).to_be_checked();expect(view).not_to_be_checked();expect(category).to_be_checked()
   review.uncheck();update.focus();page.keyboard.press('Space');expect(update).not_to_be_checked();expect(category).to_be_checked()
   category.uncheck();expect(page.locator('.cms-permission-groups').get_by_role('checkbox',checked=True)).to_have_count(0)
   save.click();expect(save).not_to_be_visible();assert saved()['permissions']==[]
   print(f'PASS: {width}px actual checkbox label toggles, multi-select, independent view, cross-group preservation, save/reopen and clear-all',flush=True)
  assert not errors,'Unexpected browser errors';context.close();browser.close()
 # Existing server authorization must still reject a grant the caller does not own.
 api('/admin/roles','POST',{'name':prefix+'-forbidden','permissions':['users.lock']},cookie,403)
 print(f'PASS: {checks} live API assertions; no automatic grants, no authority escalation',flush=True)
finally:
 if user_id:
  # Only the unique names/IDs generated by this run; never existing accounts/roles.
  rows=query('SELECT id FROM cms_roles WHERE name LIKE ?',[prefix+'%'])
  for row in rows:
   query('DELETE FROM cms_user_roles WHERE role_id=?',[row['id']]);query('DELETE FROM cms_role_permissions WHERE role_id=?',[row['id']]);query('DELETE FROM cms_roles WHERE id=? AND name LIKE ?',[row['id'],prefix+'%'])
  query('DELETE FROM cms_audit WHERE actor_id=?',[user_id])
  query('DELETE FROM users WHERE id=? AND email=? AND is_super_admin=0',[user_id,email])
  print('PASS: cleaned only disposable checkbox account, roles and audit; no books, images or existing roles changed',flush=True)
