"""Check a deployed Pages origin; --fixtures tests auth and cleans only its own user.

Usage: python3 scripts/smoke-deployed.py https://cho-sach-cu.pages.dev --fixtures
Fixture mode needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID via environment
Secrets, plus --database-id for the project's D1. It never creates an Admin.
"""
import argparse
import base64
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
import uuid


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('origin')
parser.add_argument('--fixtures', action='store_true')
parser.add_argument('--database-id')
parser.add_argument('--r2', action='store_true', help='Expect the production R2 binding and test uploads with --fixtures')
parser.add_argument('--seller-gate-ui',action='store_true',help='Test ordinary User Seller gate before requesting Seller status (requires --fixtures)')
parser.add_argument('--password-ui',action='store_true',help='Change only the generated fixture password and test logout (requires --fixtures)')
parser.add_argument('--r2-ui', action='store_true', help='Also submit both image forms with Chromium (requires --r2 --fixtures)')
parser.add_argument('--review-reasons',action='store_true',help='Test rejection dialog and transient success notice; requires --r2-ui')
parser.add_argument('--seller-lifecycle', action='store_true', help='Exercise Seller edit/hide/re-submit/sold UI (requires --r2-ui)')
args = parser.parse_args()
if args.password_ui and not args.fixtures:
    parser.error('--password-ui requires --fixtures')
if args.seller_gate_ui and not args.fixtures:
    parser.error('--seller-gate-ui requires --fixtures')
if args.r2_ui and not (args.r2 and args.fixtures):
    parser.error('--r2-ui requires --r2 --fixtures')
if args.review_reasons and not args.r2_ui:
    parser.error('--review-reasons requires --r2-ui')
if args.seller_lifecycle and not args.r2_ui:
    parser.error('--seller-lifecycle requires --r2-ui')
origin = args.origin.rstrip('/')
if not re.fullmatch(r'https://[a-z0-9.-]+\.(pages|workers)\.dev', origin):
    parser.error('Use the explicit HTTPS pages.dev or workers.dev origin.')
if args.fixtures and (not args.database_id or not os.environ.get('CLOUDFLARE_API_TOKEN') or not os.environ.get('CLOUDFLARE_ACCOUNT_ID')):
    parser.error('Fixture cleanup requires the project D1 ID and Cloudflare environment Secrets.')
checks = 0


def call(path, *, method='GET', payload=None, cookie=None, extra_headers=None, raw_body=None):
    headers = {'User-Agent': 'ChoSachCu-DeploymentCheck/1.0'}
    if cookie:
        headers['Cookie'] = cookie
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    if raw_body is not None:
        data = raw_body
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(origin + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        try:
            result = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            result = None
        return response.status, response.headers, result, body


def expect(result, status, label):
    global checks
    if result[0] != status:
        # Avoid printing response data, session cookies or credentials on failure.
        code = result[2].get('code', 'unspecified') if isinstance(result[2], dict) else 'unspecified'
        raise AssertionError(f'{label}: expected HTTP {status}, got {result[0]}, code={code}')
    checks += 1
    return result


page = expect(call('/'), 200, 'Frontend HTML')
assert 'Chợ Sách Cũ' in page[3].decode()
assert 'Content-Security-Policy' in page[1], 'Pages CSP header missing'
assets = set(re.findall(r'(?:src|href)="(/assets/[^\"]+)"', page[3].decode()))
assert assets, 'Production HTML must reference bundled assets'
for asset in assets:
    response = expect(call(asset), 200, 'Bundled asset')
    assert 'text/html' not in response[1].get('Content-Type', ''), 'Asset request must not return SPA HTML'
health = expect(call('/api/health'), 200, 'Pages to Worker binding')
assert health[2] == {'ok': True, 'service': 'cho-sach-cu-api'}
for header, value in [('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Referrer-Policy','strict-origin-when-cross-origin')]:
    assert health[1].get(header)==value, f'Worker security header missing: {header}'
expect(call('/api/auth/register',method='POST',payload={},extra_headers={'Origin':'https://evil.example','Sec-Fetch-Site':'cross-site'}),403,'Cross-site API write blocked')
expect(call('/api/account',method='PATCH',raw_body=b'{"name":"Blocked"}',extra_headers={'Content-Type':'application/jsonp'}),415,'Invalid JSON media type blocked')
expect(call('/api/auth/register',method='POST',payload={'name':'x'*33000}),413,'Oversized API write blocked')
listings = expect(call('/api/listings'), 200, 'Worker to D1')
assert isinstance(listings[2]['items'], list)
assert 'password_hash' not in listings[3].decode()
expect(call('/api/auth/me'), 401, 'Guest session')
if args.password_ui:
    expect(call('/api/auth/change-password',method='POST',payload={}),401,'Guest password change blocked')
expect(call('/api/admin/listings'), 401, 'Guest admin boundary')
expect(call('/api/listings/unknown/contact'), 401, 'Guest contact boundary')
expect(call('/api/listings', method='POST', payload={}), 401, 'Guest create boundary')
expect(call('/api/images/unavailable.png'), 404 if args.r2 else 503, 'R2 object lookup')
expect(call('/api/images', method='POST'), 401, 'Guest upload boundary')
assert expect(call('/api/capabilities'), 200, 'Image capability')[2]['image_uploads'] is args.r2
expect(call('/api/seller/listings'), 401, 'Guest private listings')
if args.seller_lifecycle:
    expect(call('/api/seller/listings/unknown'),401,'Guest private edit data')
    expect(call('/api/seller/listings/unknown',method='PATCH',payload={}),401,'Guest edit blocked')
    expect(call('/api/seller/listings/unknown/status',method='POST',payload={}),401,'Guest state change blocked')
expect(call('/api/admin/users'), 401, 'Guest account directory')
expect(call('/api/account', method='PATCH', payload={'name': 'Blocked guest'}), 401, 'Guest profile update')
expect(call('/kham-pha'), 200, 'Direct SPA route')
catalog = expect(call('/api/categories'), 200, 'Public D1 categories')
assert isinstance(catalog[2]['items'], list)
for path in ['/api/admin/catalog','/api/admin/categories','/api/admin/roles','/api/admin/audit','/api/admin/options','/api/admin/permissions','/api/admin/summary']:
    expect(call(path), 401, 'Guest granular CMS boundary')
print('PASS: public HTML/assets, Pages-to-Worker-to-D1, guest permissions and expected R2 capability')

if args.fixtures:
    email = f'smoke-{uuid.uuid4().hex}@example.invalid'
    name = 'Deployment smoke fixture'
    password = secrets.token_urlsafe(32)
    fixture_role = 'r2-smoke-' + uuid.uuid4().hex
    image_keys = []

    def query(sql, params):
        url = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CLOUDFLARE_ACCOUNT_ID']}/d1/database/{args.database_id}/query"
        request = urllib.request.Request(url, data=json.dumps({'sql': sql, 'params': params}).encode(), method='POST', headers={
            'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'],
        })
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.load(response)
        assert result.get('success') and all(item.get('success') for item in result['result'])
        return result

    def cleanup_fixture():
        assert re.fullmatch(r'smoke-[0-9a-f]{32}@example\.invalid', email)
        if args.r2 or args.password_ui:
            query('DELETE FROM cms_audit WHERE actor_id IN (SELECT id FROM users WHERE email=? AND name=?)', [email,name])
        if args.r2:
            # Only the unique test role; never touch real roles or accounts.
            query('DELETE FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email=? AND name=?)', [email,name])
            query('DELETE FROM cms_user_roles WHERE role_id = ?', [fixture_role])
            query('DELETE FROM cms_role_permissions WHERE role_id = ?', [fixture_role])
            query('DELETE FROM cms_roles WHERE id = ? AND name = ?', [fixture_role, fixture_role])
        account = os.environ['CLOUDFLARE_ACCOUNT_ID']
        url = f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{args.database_id}/query'
        body = json.dumps({'sql': 'DELETE FROM users WHERE email = ? AND name = ?', 'params': [email, name]}).encode()
        request = urllib.request.Request(url, data=body, method='POST', headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'],
        })
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.load(response)
        assert result.get('success'), 'Fixture cleanup failed; inspect this test fixture only'
        assert all(item.get('success') for item in result['result'])
        print('PASS: removed only the generated smoke user and its dependent session/application')

    try:
        registration = expect(call('/api/auth/register', method='POST', payload={'name': name, 'email': email, 'password': password, 'role': 'admin'}), 201, 'Registration on Workers Free')
        assert registration[2]['user']['role'] == 'user', 'Registration must not escalate role'
        expect(call('/api/auth/login', method='POST', payload={'email': email, 'password': 'wrong-password'}), 401, 'Wrong password')
        login = expect(call('/api/auth/login', method='POST', payload={'email': email, 'password': password}), 200, 'Login on Workers Free')
        assert login[2]['user']['is_super_admin'] is False
        assert login[2]['user']['cms_access'] is False
        assert login[2]['user']['permissions'] == []
        set_cookie = login[1]['Set-Cookie']
        for flag in ['httponly', 'secure', 'samesite=lax']:
            assert flag in set_cookie.lower(), f'Missing session flag: {flag}'
        cookie = set_cookie.split(';', 1)[0]
        assert expect(call('/api/auth/me', cookie=cookie), 200, 'Authenticated session')[2]['user']['email'] == email
        if args.seller_gate_ui:
            subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'check-ui.py'),origin,'--seller-gate-only','--output-dir','/tmp/cho-sach-seller-gate'],env={**os.environ,'UI_BUYER_COOKIE':cookie},check=True,timeout=180)
        expect(call('/api/admin/listings', cookie=cookie), 403, 'User cannot administer')
        expect(call('/api/admin/users', cookie=cookie), 403, 'User cannot read account directory')
        for path in ['/api/admin/catalog','/api/admin/categories','/api/admin/roles','/api/admin/audit','/api/admin/summary']:
            expect(call(path, cookie=cookie), 403, 'Authenticated user cannot access ungranted CMS module')
        expect(call('/api/admin/roles', method='POST', payload={'name':'Forbidden fixture role','permissions':['roles.view','roles.create']}, cookie=cookie), 403, 'User cannot create a privilege role')
        expect(call('/api/admin/users/'+login[2]['user']['id']+'/roles', method='PUT', payload={'role_ids':[], 'version':0}, cookie=cookie), 403, 'User cannot assign own roles')

        expect(call('/api/seller/listings', cookie=cookie), 403, 'Unapproved user cannot read seller workspace')
        if args.seller_lifecycle:
            expect(call('/api/seller/listings/unknown',cookie=cookie),403,'User cannot read Seller edit data')
            expect(call('/api/seller/listings/unknown',method='PATCH',payload={},cookie=cookie),403,'User cannot edit Seller content')
            expect(call('/api/seller/listings/unknown/status',method='POST',payload={},cookie=cookie),403,'User cannot change Seller status')
        profile = expect(call('/api/account', method='PATCH', payload={'name': name, 'role': 'admin'}, cookie=cookie), 200, 'Own profile name update')
        assert profile[2]['user']['role'] == 'user'
        assert profile[2]['user']['email'] == email
        assert 'private, no-store' in profile[1]['Cache-Control']

        expect(call('/api/listings', method='POST', payload={}, cookie=cookie), 403, 'Unapproved user cannot publish')
        expect(call('/api/images', method='POST', cookie=cookie), 403, 'Unapproved user cannot upload')
        expect(call('/api/seller/applications', method='POST', payload={'phone': '0900000000', 'note': 'Temporary deployment smoke fixture'}, cookie=cookie), 201, 'Seller application')
        application = expect(call('/api/seller/applications/me', cookie=cookie), 200, 'Persisted Seller application')
        assert application[2]['application']['status'] == 'pending'
        if args.r2:
            fixture_id = login[2]['user']['id']
            # Seed only this generated fixture; never create an Admin or Super Admin.
            query("UPDATE users SET role='seller' WHERE id=? AND email=? AND name=? AND is_super_admin=0", [fixture_id, email, name])
            png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=')

            def upload(content, mime='image/png'):
                boundary = 'cho-sach-' + uuid.uuid4().hex
                data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: {mime}\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
                request = urllib.request.Request(origin+'/api/images', data=data, method='POST', headers={'User-Agent':'ChoSachCu-DeploymentCheck/1.0', 'Cookie':cookie, 'Content-Type':f'multipart/form-data; boundary={boundary}'})
                try:
                    response = urllib.request.urlopen(request, timeout=25)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    body=response.read()
                    try:
                        parsed=json.loads(body)
                    except (ValueError, UnicodeDecodeError):
                        parsed=None
                    return response.status,response.headers,parsed,body

            try:
                for mode in ['Seller', 'CMS delegated editor']:
                    if mode.startswith('CMS'):
                        query("UPDATE users SET role='user' WHERE id=? AND email=?", [fixture_id,email])
                        query('INSERT INTO cms_roles(id,name) VALUES(?,?)', [fixture_role,fixture_role])
                        query("INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,'listings.create')", [fixture_role])
                        query('INSERT INTO cms_user_roles(user_id,role_id) VALUES(?,?)', [fixture_id,fixture_role])
                        me=expect(call('/api/auth/me',cookie=cookie),200,'CMS fixture rights')[2]['user']
                        assert me['cms_access'] and not me['is_super_admin']
                    expect(upload(b'not a PNG'),415,mode+' rejects forged image')
                    image=expect(upload(png),201,mode+' upload to R2')[2]
                    key=image['key']; image_keys.append(key)
                    assert key.startswith(fixture_id+'/')
                    fetched=expect(call(image['url']),200,mode+' read through Pages/Worker')
                    assert fetched[3]==png and fetched[1]['Content-Type']=='image/png'
                    assert fetched[1]['X-Content-Type-Options']=='nosniff'
                    expect(call('/api/images/another-user/fixture.png',method='DELETE',cookie=cookie),403,mode+' cannot delete another owner image')
                if args.r2_ui:
                    query("UPDATE users SET role='seller' WHERE id=? AND email=?", [fixture_id,email])
                    query("UPDATE seller_applications SET status='approved' WHERE user_id=?", [fixture_id])
                    query("INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,'listings.view')", [fixture_role])
                    query("INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,'listings.update')", [fixture_role])
                    if args.review_reasons:
                        query("INSERT INTO cms_role_permissions(role_id,permission) VALUES(?,'listings.review')", [fixture_role])
                    from r2_ui import check_uploads
                    check_uploads(origin,cookie,png,image_keys,email,args.seller_lifecycle,args.review_reasons)
                    own=expect(call('/api/seller/listings',cookie=cookie),200,'UI listings persisted in D1')[2]['items']
                    assert len(own)==2
                    assert sorted(row['status'] for row in own)==sorted(['rejected' if args.review_reasons else 'pending','sold' if args.seller_lifecycle else 'pending'])
                    if args.review_reasons:
                        assert next(row for row in own if row['status']=='rejected')['review_note']=='Cần ảnh rõ tình trạng sách'
                    assert sorted(len(json.loads(row['image_keys'])) for row in own)==[2,5]
                    if args.seller_lifecycle:
                        ended=next(row for row in own if row['status']=='sold')
                        expect(call('/api/seller/listings/'+ended['id'],method='PATCH',payload={'version':ended['version']},cookie=cookie),409,'Sold listing cannot be edited')
                        expect(call('/api/seller/listings/'+ended['id']+'/status',method='POST',payload={'status':'active','version':ended['version']},cookie=cookie),409,'Sold listing cannot be republished')
                    for row in own:
                        expect(call('/api/listings/'+row['id']),404,'UI listing remains private until review')
            finally:
                # Only this generated fixture's rows; referenced objects are now protected.
                query('DELETE FROM listing_reviews WHERE listing_id IN (SELECT id FROM listings WHERE seller_id=?)',[fixture_id])
                query('DELETE FROM listings WHERE seller_id=?',[fixture_id])
                for key in image_keys:
                    expect(call('/api/images/'+key,method='DELETE',cookie=cookie),200,'Remove only own uploaded fixture')
                    expect(call('/api/images/'+key),404,'Fixture image removed from R2')
            print('PASS: live Seller and delegated CMS uploads, image bytes, MIME checks, ownership and cleanup')
        expect(call('/api/listings/unknown/contact', cookie=cookie), 404, 'Authenticated contact lookup')
        expect(call('/api/auth/logout', method='POST', cookie=cookie), 200, 'Logout')
        expect(call('/api/auth/me', cookie=cookie), 401, 'Revoked session')
        expect(call('/api/listings/unknown/contact', cookie=cookie), 401, 'Contact after logout')
        print('PASS: live registration/login, Secure cookie, Seller request, roles and logout')
        if args.password_ui:
            device1=expect(call('/api/auth/login',method='POST',payload={'email':email,'password':password}),200,'Password UI fixture session')
            device2=expect(call('/api/auth/login',method='POST',payload={'email':email,'password':password}),200,'Other device session')
            first_cookie=device1[1]['Set-Cookie'].split(';',1)[0]
            second_cookie=device2[1]['Set-Cookie'].split(';',1)[0]
            next_password=secrets.token_urlsafe(24); final_password=secrets.token_urlsafe(24)
            subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'check-ui.py'),origin,'--password-only'],env={**os.environ,'UI_BUYER_COOKIE':first_cookie,'UI_BUYER_EMAIL':email,'UI_PASSWORD':password,'UI_PASSWORD_NEW':next_password,'UI_PASSWORD_FINAL':final_password,'UI_HAS_CMS':'1' if args.r2 else '0'},check=True,timeout=180)
            expect(call('/api/auth/me',cookie=first_cookie),401,'Original device revoked')
            expect(call('/api/auth/me',cookie=second_cookie),401,'Other device revoked')
            expect(call('/api/auth/login',method='POST',payload={'email':email,'password':password}),401,'Old fixture secret rejected')
            expect(call('/api/auth/login',method='POST',payload={'email':email,'password':final_password if args.r2 else next_password}),200,'Final fixture secret accepted')
    finally:
        cleanup_fixture()

print(f'PASS: {checks} deployed HTTP checks. No Admin fixture or R2 subscription was created by this test.')
