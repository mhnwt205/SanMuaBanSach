"""Browser UX checks: real public pages plus deterministic, browser-only fault/pagination fixtures. No database writes."""
import argparse,gzip,json,re,time,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('origin');parser.add_argument('--output-dir',default='/tmp/cho-sach-experience/ui')
parser.add_argument('--real-only',action='store_true',help='Only read real routes and catalogue, no browser fault fixtures')
args=parser.parse_args();origin=args.origin.rstrip('/')
assert re.fullmatch(r'http://127\.0\.0\.1:\d+|https://cho-sach-cu\.pages\.dev',origin)
output=Path(args.output_dir);output.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
def forward(route):
 req=route.request
 assert req.url.startswith(origin+'/')
 headers={k:v for k,v in req.all_headers().items() if k.lower() not in ['host','content-length','accept-encoding']};headers['Accept-Encoding']='identity'
 request=urllib.request.Request(req.url,data=req.post_data_buffer,method=req.method,headers=headers)
 try:r=urllib.request.urlopen(request,timeout=40)
 except urllib.error.HTTPError as e:r=e
 with r:
  body=r.read()
  if r.headers.get('Content-Encoding')=='gzip':body=gzip.decompress(body)
  headers={k:v for k,v in r.headers.items() if k.lower() not in ['content-length','transfer-encoding','content-encoding','connection']}
  route.fulfill(status=r.status,headers=headers,body=body)
def ready(page,path):
 response=page.goto(origin+path,wait_until='networkidle',timeout=60000);assert response.status==200
 page.evaluate('document.fonts.ready')
 expect(page.locator('h1').first).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),path
 assert page.evaluate('document.fonts.check(\'400 14px "Be Vietnam Pro"\',"Sách cũ tiếng Việt")')
def cards(page,number):
 try:expect(page.locator('.book-card')).to_have_count(number,timeout=20000)
 except AssertionError:
  page.screenshot(path=str(output/'failure.png'),full_page=True)
  print('Failed cards assertion',page.url,'viewport',page.viewport_size,'expected',number,'body',page.locator('body').inner_text()[-2500:],flush=True)
  raise
books=[{'id':f'ux-{i}','title':f'Sách UX {i:02}','author':'Tác giả thử nghiệm','price':i*1000,'category':'Văn học','city':'Hà Nội','condition':'good','description':'Dữ liệu chỉ trong trình duyệt kiểm thử, không ghi database.','image_keys':'[]','seller':'Người bán thử','seller_id':'ux-seller','created_at':'2026-10-23 00:00:00'} for i in range(25)]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 # Real requests verify deployed/local routes and guest CMS guard, without fixtures.
 real=browser.new_context(viewport={'width':390,'height':844})
 if origin.startswith('https:'):real.route('**/*',forward)
 page=real.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 if origin.startswith('https:'):
  page.add_init_script("window.__cspViolations=[];addEventListener('securitypolicyviolation',e=>window.__cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI}))")
 for path in ['/','/kham-pha','/huong-dan','/an-toan','/quyen-rieng-tu','/dang-nhap','/quan-tri/tin-dang']:
  ready(page,path)
 expect(page.locator('h1')).to_have_text('Đăng nhập quản trị')
 assert page.locator('.site-header').count()==0
 ready(page,'/');page.keyboard.press('Tab');expect(page.get_by_role('link',name='Chuyển đến nội dung chính',exact=True)).to_be_focused();page.keyboard.press('Enter');expect(page.locator('#noi-dung')).to_be_focused()
 catalogue=page.evaluate("async()=> (await fetch('/api/listings?limit=1')).json()")
 if catalogue.get('catalog_empty'):
  ready(page,'/');cards(page,8);expect(page.locator('.sample-notice')).to_be_visible()
  ready(page,'/kham-pha');cards(page,8);expect(page.get_by_role('note')).to_contain_text('minh họa')
  ready(page,'/kham-pha?q=Nhà+giả+kim');cards(page,1)
  page.locator('.book-cover-link').first.click();expect(page.locator('.sample-notice')).to_be_visible()
  assert page.get_by_role('button',name=re.compile('Hiện số điện thoại$')).count()==0
  print('PASS: real empty catalogue displays labelled samples, sample filtering and sample detail without live contact')
 if args.real_only:
  violations=page.evaluate('window.__cspViolations||[]') if origin.startswith('https:') else []
  assert not violations, f'Content Security Policy blocked a page resource: {violations}'
  assert not errors,str(errors)
  print('PASS: real public routes, keyboard skip link and separate lazy CMS guest guard; no production CSP violations')
  real.close()
  browser.close();raise SystemExit(0)
 real.close();print('PASS: real public routes, keyboard skip link and separate lazy CMS guest guard')
 for width in [1440,768,390]:
  context=browser.new_context(viewport={'width':width,'height':900})
  state={'mode':'ok','category_error':False,'image_error':False};pending=[];requests=[]
  def fulfill(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
  def route_request(route):
   req=route.request;u=urlsplit(req.url);query=parse_qs(u.query);path=u.path
   if path=='/api/categories':
    if state['category_error']:fulfill(route,{'error':'Lỗi danh mục kiểm thử'},503)
    else:fulfill(route,{'items':[{'id':'van-hoc','name':'Văn học'},{'id':'giao-khoa','name':'Giáo khoa'}]})
   elif path=='/api/auth/me':fulfill(route,{'error':'Vui lòng đăng nhập.'},401)
   elif path=='/api/listings':
    requests.append(query)
    if state['mode']=='error':fulfill(route,{'error':'Máy chủ tìm sách đang bận. Vui lòng thử lại.'},503);return
    q=query.get('q',[''])[0]
    if q=='slow':pending.append(route);return
    rows=books.copy() if state['mode'] not in ['empty','demo'] else []
    if q=='fast':rows=[{**books[0],'title':'Kết quả mới'}]
    elif q:rows=[x for x in rows if q.lower() in (x['title']+' '+x['author']).lower()]
    if query.get('category'):rows=[x for x in rows if x['category']==query['category'][0]]
    if query.get('city'):rows=[x for x in rows if x['city']==query['city'][0]]
    rows=[x for x in rows if int(query.get('min',['0'])[0])<=x['price']<=int(query.get('max',['100000000'])[0])]
    if query.get('sort')==['price_desc']:rows.sort(key=lambda x:x['price'],reverse=True)
    if query.get('sort')==['price_asc']:rows.sort(key=lambda x:x['price'])
    page_no=int(query.get('page',['1'])[0]);limit=int(query.get('limit',['24'])[0]);start=(page_no-1)*limit
    fulfill(route,{'items':rows[start:start+limit],'page':page_no,'limit':limit,'has_more':len(rows)>start+limit,'catalog_empty':state['mode']=='demo'})
   elif re.fullmatch('/api/listings/ux-[0-9]+',path):
    item=books[int(path.rsplit('-',1)[1])]
    if state['image_error']:item={**item,'image_keys':json.dumps(['ux-broken/1.png','ux-broken/2.png'])}
    fulfill(route,{'item':item})
   elif path.startswith('/api/images/ux-broken/'):fulfill(route,{'error':'Ảnh thử không tải được'},404)
   elif origin.startswith('https:'):forward(route)
   else:route.continue_()
  context.route('**/*',route_request)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  state['mode']='demo';ready(page,'/');cards(page,8)
  expect(page.locator('.sample-notice')).to_be_visible()
  ready(page,'/kham-pha');cards(page,8)
  expect(page.get_by_role('note')).to_contain_text('minh họa')
  ready(page,'/kham-pha?q=Nhà+giả+kim');cards(page,1)
  ready(page,'/kham-pha?max=0');cards(page,0)
  state['mode']='ok'
  ready(page,'/kham-pha?sort=price_asc')
  cards(page,24)
  assert len([r for r in requests if r.get('sort')==['price_asc']])==1,'Browse must issue one filtered request'
  page.get_by_role('button',name='Trang sau',exact=True).click()
  expect(page).to_have_url(re.compile(r'page=2'))
  cards(page,1)
  expect(page.locator('.book-info h3')).to_have_text('Sách UX 24')
  page.reload(wait_until='networkidle');cards(page,1)
  page.locator('.book-cover-link').click();expect(page.locator('h1')).to_have_text('Sách UX 24')
  page.go_back(wait_until='networkidle');cards(page,1)
  page.go_back(wait_until='networkidle');cards(page,24)
  page.evaluate('window.scrollTo(0,700)');page.wait_for_timeout(100);position=page.evaluate('scrollY')
  visible=page.locator('.book-cover-link').evaluate_all('(nodes)=>nodes.findIndex(n=>{const r=n.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight})')
  assert visible>=0
  page.locator('.book-cover-link').nth(visible).click();expect(page.locator('.detail-summary h1')).to_be_visible()
  page.go_back(wait_until='networkidle');cards(page,24)
  page.wait_for_timeout(150);assert abs(page.evaluate('scrollY')-position)<100,'Back should restore list scroll'
  ready(page,'/kham-pha?category=V%C4%83n+h%E1%BB%8Dc&page=2&sort=price_asc')
  page.get_by_label('Tìm sách',exact=True).fill('Sách UX 01');page.get_by_label('Tìm sách',exact=True).press('Enter')
  cards(page,1)
  assert 'category=' in page.url and 'page=' not in page.url and 'sort=' in page.url
  expect(page.get_by_label('Bộ lọc đang áp dụng')).to_be_visible()
  page.get_by_role('button',name='Bỏ Danh mục: Văn học',exact=True).click();assert 'category=' not in page.url and 'q=' in page.url;cards(page,1)
  page.get_by_role('button',name='Xóa tất cả bộ lọc',exact=True).click();cards(page,24)
  if page.get_by_role('button',name='Mở bộ lọc',exact=True).is_visible():page.get_by_role('button',name='Mở bộ lọc',exact=True).click()
  panel=page.locator('.filter-panel:visible')
  panel.get_by_label('Giá thấp nhất',exact=True).fill('10000');panel.get_by_label('Giá cao nhất',exact=True).fill('5000')
  panel.get_by_role('button',name='Áp dụng khoảng giá',exact=True).click()
  expect(panel.get_by_text('Giá cao nhất phải từ giá thấp nhất trở lên.',exact=True)).to_be_visible()
  panel.get_by_label('Giá thấp nhất',exact=True).fill('0');panel.get_by_label('Giá cao nhất',exact=True).fill('0')
  panel.get_by_role('button',name='Áp dụng khoảng giá',exact=True).click()
  cards(page,1);assert 'max=0' in page.url
  page.wait_for_timeout(400) # Wait for the mobile Drawer close transition before capturing.
  page.screenshot(path=str(output/f'browse-{width}.png'),full_page=True)
  page.goto(origin+'/kham-pha?q=slow',wait_until='domcontentloaded');expect(page.get_by_role('status').filter(has_text='Đang tìm sách')).to_be_attached()
  page.get_by_label('Tìm sách',exact=True).fill('fast');page.get_by_label('Tìm sách',exact=True).press('Enter')
  expect(page.locator('.book-info h3')).to_have_text('Kết quả mới')
  for route in pending:
   try:fulfill(route,{'items':[books[2]],'has_more':False})
   except Exception:pass # The browser correctly aborted obsolete requests.
  expect(page.locator('.book-info h3')).to_have_text('Kết quả mới')
  state['mode']='error';ready(page,'/kham-pha?fault=1')
  expect(page.get_by_text('Máy chủ tìm sách đang bận. Vui lòng thử lại.',exact=True)).to_be_visible();cards(page,0)
  assert page.locator('.sample-notice').count()==0
  state['mode']='ok';page.get_by_role('button',name='Thử lại',exact=True).click();cards(page,24)
  state['mode']='empty';ready(page,'/kham-pha?empty=1');expect(page.get_by_text('Chưa tìm thấy sách phù hợp. Thử đổi từ khóa hoặc bớt bộ lọc.',exact=True)).to_be_visible()
  ready(page,'/');cards(page,8);expect(page.locator('.sample-notice')).to_be_visible()
  state['mode']='error';ready(page,'/');cards(page,0);assert page.locator('.sample-notice').count()==0
  state['mode']='ok';state['category_error']=True;page.reload(wait_until='networkidle');ready(page,'/kham-pha')
  if page.get_by_role('button',name='Mở bộ lọc',exact=True).is_visible():page.get_by_role('button',name='Mở bộ lọc',exact=True).click()
  panel=page.locator('.filter-panel:visible');expect(panel.get_by_text('Chưa tải được danh mục',exact=True)).to_be_visible()
  state['category_error']=False;panel.get_by_role('button',name='Thử lại',exact=True).click();expect(panel.get_by_role('button',name=re.compile('^Giáo khoa'))).to_be_visible()
  state['image_error']=True;ready(page,'/sach/ux-0');expect(page.get_by_role('button',name='Thử tải lại ảnh',exact=True)).to_be_visible()
  with page.expect_request(re.compile('/api/images/ux-broken/1.png')):
   page.get_by_role('button',name='Thử tải lại ảnh',exact=True).click()
  expect(page.get_by_role('button',name='Thử tải lại ảnh',exact=True)).to_be_visible()
  page.get_by_role('button',name='Xem ảnh 2',exact=True).click();expect(page.get_by_text('Chưa tải được ảnh 2.',exact=True)).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  context.close();print(f'PASS: {width}px pagination/URL/back/scroll, filters/price-zero, request cancellation, loading/error/retry/empty/category retry and gallery image failures')
 # Duplicate submit events and network failure use browser-only auth responses.
 context=browser.new_context();login_pending=[]
 def login_route(route):
  path=urlsplit(route.request.url).path
  if path=='/api/auth/me':route.fulfill(status=401,content_type='application/json',body='{"error":"Vui lòng đăng nhập."}')
  elif path=='/api/auth/login':login_pending.append(route)
  elif origin.startswith('https:'):forward(route)
  else:route.continue_()
 context.route('**/*',login_route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 ready(page,'/dang-nhap');page.get_by_label('Email',exact=True).fill('ux@example.invalid');page.get_by_label('Mật khẩu',exact=True).fill('not-a-real-password')
 page.evaluate("()=>{const form=document.querySelector('form');form.requestSubmit();form.requestSubmit();}")
 expect(page.get_by_label('Email',exact=True)).to_be_disabled();assert len(login_pending)==1
 login_pending[0].fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Đăng nhập thử đang bận. Vui lòng thử lại.'}))
 expect(page.get_by_text('Đăng nhập thử đang bận. Vui lòng thử lại.',exact=True)).to_be_visible();expect(page.get_by_label('Email',exact=True)).to_be_enabled()
 context.close();print('PASS: simultaneous login submit events send one request; network failure unlocks the form')
 # Deferred chunk failure must show a recoverable page, rather than a blank screen.
 context=browser.new_context();state={'block':True}
 def block_chunk(route):
  if state['block'] and re.search(r'/assets/CmsRoutes-[^/]+\.js',route.request.url):route.abort();return
  if origin.startswith('https:'):forward(route)
  else:route.continue_()
 context.route('**/*',block_chunk);page=context.new_page()
 page.goto(origin+'/quan-tri',wait_until='networkidle',timeout=60000)
 expect(page.get_by_text('Chưa tải được trang',exact=True)).to_be_visible();state['block']=False
 page.get_by_role('button',name='Tải lại trang',exact=True).click();expect(page.locator('h1')).to_have_text('Đăng nhập quản trị',timeout=30000)
 context.close();browser.close()
assert not errors,errors
print('PASS: deferred-route failure/reload; no unexpected browser JavaScript errors. Browser-only fixtures never changed D1.')
