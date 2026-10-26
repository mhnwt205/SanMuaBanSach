"""Exercise both production image forms using only a generated smoke fixture.

HTTPS requests are forwarded with Python's normal certificate verification.
No personal browser session or password is used.
"""
import gzip
import re
import urllib.error
import urllib.request
from playwright.sync_api import sync_playwright, expect


def check_uploads(origin, cookie, png, image_keys, fixture_email, seller_lifecycle=False, review_reasons=False):
    def forward(route):
        req = route.request
        assert req.url.startswith(origin + '/')
        headers = {k:v for k,v in req.all_headers().items() if k.lower() not in {'host','content-length','accept-encoding'}}
        headers['Accept-Encoding'] = 'identity'
        request = urllib.request.Request(req.url, data=req.post_data_buffer, method=req.method, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=40)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            if req.method == 'POST' and req.url == origin + '/api/images' and response.status == 201:
                import json
                image_keys.append(json.loads(body)['key'])
            if response.headers.get('Content-Encoding') == 'gzip':
                body = gzip.decompress(body)
            headers = {k:v for k,v in response.headers.items() if k.lower() not in {'content-length','transfer-encoding','content-encoding','connection'}}
            route.fulfill(status=response.status, headers=headers, body=body)

    def choose(page, label):
        page.get_by_label(label, exact=True).locator('xpath=ancestor::div[contains(@class,"ant-select")][1]').click()
        dropdown=page.locator('.ant-select-dropdown:visible')
        dropdown.locator('.ant-select-item-option').first.click()
        expect(dropdown).not_to_be_visible()

    def select_and_check_preview(page, control, desired):
        count = len(image_keys)
        assert control.get_attribute('multiple') is not None
        def attachment(name):return {'name':name,'mimeType':'image/png','buffer':png}
        thumbnail=page.locator('.selected-image-preview img')
        control.set_input_files([attachment(f'too-many-{i}.png') for i in range(6)])
        expect(thumbnail).to_have_count(0)
        expect(page.get_by_text('Mỗi tin tối đa 5 ảnh. Hãy chọn ít ảnh hơn hoặc bỏ bớt ảnh hiện tại.',exact=True)).to_be_visible()
        control.set_input_files([attachment('front.png'),attachment('back.png')])
        expect(thumbnail).to_have_count(2)
        for img in thumbnail.all():
            expect(img).to_be_visible()
            expect(img).to_have_js_property('naturalWidth',1)
            assert img.get_attribute('src').startswith('blob:')
        page.locator('.selected-image-preview .ant-image').first.click()
        expect(page.locator('.ant-image-preview-wrap')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('.ant-image-preview-wrap')).not_to_be_visible()
        page.get_by_role('button',name='Bỏ ảnh đã chọn',exact=True).first.click()
        expect(thumbnail).to_have_count(1)
        submit=page.get_by_role('button',name=re.compile('Lưu thay đổi$')) if '/quan-tri/' in page.url else page.get_by_role('button',name=re.compile('Gửi tin để xét duyệt'))
        submit.click()
        expect(page.get_by_text('Mỗi tin cần từ 2 đến 5 ảnh.',exact=True)).to_be_visible()
        assert len(image_keys)==count, 'Insufficient photos must be rejected before uploading'
        control.set_input_files([attachment(f'added-{i}.png') for i in range(desired-1)])
        expect(thumbnail).to_have_count(desired)
        expect(page.locator('.cover-upload [role=status]')).to_contain_text(f'Đã chọn {desired}/5 ảnh')
        if desired==5:
            control.set_input_files(attachment('sixth.png'))
            expect(thumbnail).to_have_count(5)
            expect(page.get_by_text('Mỗi tin tối đa 5 ảnh. Hãy chọn ít ảnh hơn hoặc bỏ bớt ảnh hiện tại.',exact=True)).to_be_visible()
        assert len(image_keys)==count, 'Selecting/previewing must not upload before submission'
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.set_viewport_size({'width':1440,'height':1000})
        print(f'PASS: multiple selection, {desired} previews, zoom, removal, incremental add, maximum and mobile width')

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        context = browser.new_context(viewport={'width':1440,'height':1000})
        context.add_cookies([{'name':'cho_session','value':cookie.split('=',1)[1],'url':origin}])
        context.route('**/*', forward)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(origin+'/dang-tin',wait_until='networkidle')
            expect(page.locator('#book-image')).to_be_visible()
            page.get_by_label('Tên sách',exact=True).fill('R2 Seller UI smoke fixture')
            page.get_by_label('Tác giả',exact=True).fill('Smoke fixture')
            choose(page,'Danh mục'); choose(page,'Tình trạng sách')
            page.get_by_label('Giá bán',exact=True).fill('10000')
            page.get_by_label('Tỉnh / thành phố',exact=True).fill('Hà Nội')
            select_and_check_preview(page,page.locator('#book-image'),2)
            with page.expect_response(lambda r:r.url==origin+'/api/listings' and r.request.method=='POST') as posted:
                page.get_by_role('button',name='Gửi tin để xét duyệt',exact=False).click()
            assert posted.value.status == 201
            expect(page).to_have_url(origin+'/tin-cua-toi',timeout=30000)
            if review_reasons:
                sent=page.get_by_text('Tin đã được gửi để xét duyệt',exact=True)
                expect(sent).to_be_visible()
                expect(sent).not_to_be_visible(timeout=10000)
                page.reload(wait_until='networkidle')
                expect(sent).to_have_count(0)
                print('PASS: submission notice expires and does not return on refresh')
            page.get_by_role('button',name='Xem nội dung',exact=True).click()
            expect(page.locator('.book-photo-thumbnails button')).to_have_count(2)
            page.get_by_role('button',name='Xem ảnh 2',exact=True).click()
            expect(page.locator('.book-photo-gallery > .ant-image img')).to_have_attribute('alt','Ảnh 2 của sách R2 Seller UI smoke fixture')
            page.locator('.book-photo-gallery > .ant-image').click()
            expect(page.locator('.ant-image-preview-wrap')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.locator('.ant-image-preview-wrap')).not_to_be_visible()
            expect(page.locator('.own-preview')).to_be_visible()

            page.goto(origin+'/quan-tri/tin-dang',wait_until='networkidle')
            page.get_by_role('button',name=re.compile('Tạo mới$')).click()
            drawer=page.locator('.ant-drawer-content')
            expect(drawer.get_by_label('Tên sách',exact=True)).to_be_visible()
            drawer.get_by_label('Tên sách',exact=True).fill('R2 CMS UI smoke fixture')
            drawer.get_by_label('Tác giả',exact=True).fill('Smoke fixture')
            # Always select only this unique fixture, never a real Seller.
            seller=drawer.get_by_label('Người bán đã được duyệt',exact=True)
            seller.locator('xpath=ancestor::div[contains(@class,"ant-select")][1]').click()
            page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter(has_text=fixture_email).click()
            expect(page.locator('.ant-select-dropdown:visible')).to_have_count(0)
            choose(page,'Danh mục'); choose(page,'Tình trạng sách')
            drawer.get_by_label('Giá bán (VNĐ)',exact=True).fill('10000')
            drawer.get_by_label('Tỉnh / thành phố',exact=True).fill('Hà Nội')
            select_and_check_preview(page,drawer.locator('input[type=file]'),5)
            with page.expect_response(lambda r:r.url==origin+'/api/admin/catalog' and r.request.method=='POST') as posted:
                drawer.get_by_role('button',name=re.compile('Lưu thay đổi$')).click()
            assert posted.value.status == 201
            expect(drawer).not_to_be_visible(timeout=30000)
            page.locator('.ant-table-row').filter(has_text='R2 CMS UI smoke fixture').get_by_role('button',name=re.compile('Sửa$')).click()
            expect(drawer.locator('.selected-image-preview img')).to_have_count(5)
            control=drawer.locator('input[type=file]')
            control.set_input_files({'name':'over-limit.png','mimeType':'image/png','buffer':png})
            expect(drawer.locator('.selected-image-preview img')).to_have_count(5)
            expect(drawer.get_by_text('Mỗi tin tối đa 5 ảnh. Hãy chọn ít ảnh hơn hoặc bỏ bớt ảnh hiện tại.',exact=True)).to_be_visible()
            drawer.get_by_role('button',name='Bỏ ảnh hiện có 1',exact=True).click()
            control.set_input_files({'name':'replacement.png','mimeType':'image/png','buffer':png})
            expect(drawer.locator('.selected-image-preview img')).to_have_count(5)
            with page.expect_response(lambda r:'/api/admin/catalog/' in r.url and r.request.method=='PATCH') as patched:
                drawer.get_by_role('button',name=re.compile('Lưu thay đổi$')).click()
            assert patched.value.status==200
            expect(drawer).not_to_be_visible(timeout=30000)
            if review_reasons:
                item=page.locator('.ant-table-row').filter(has_text='R2 CMS UI smoke fixture')
                item.get_by_role('button',name='Từ chối',exact=True).click()
                dialog=page.locator('.ant-modal-content').filter(has_text='Từ chối tin đăng')
                dialog.get_by_role('button',name='Xác nhận từ chối',exact=True).click()
                expect(dialog.get_by_text('Vui lòng nhập lý do từ chối (tối đa 500 ký tự).',exact=True)).to_be_visible()
                dialog.get_by_label('Lý do từ chối',exact=True).fill('Cần ảnh rõ tình trạng sách')
                dialog.get_by_role('button',name='Hủy',exact=True).click()
                item.get_by_role('button',name='Từ chối',exact=True).click()
                expect(dialog.get_by_label('Lý do từ chối',exact=True)).to_have_value('')
                dialog.get_by_label('Lý do từ chối',exact=True).fill('Cần ảnh rõ tình trạng sách')
                with page.expect_response(lambda r:'/api/admin/listings/' in r.url and r.request.method=='POST') as decision:
                    dialog.get_by_role('button',name='Xác nhận từ chối',exact=True).click()
                assert decision.value.status==200
                expect(dialog).not_to_be_visible()
                page.goto(origin+'/tin-cua-toi',wait_until='networkidle')
                page.locator('.ant-list-item').filter(has_text='R2 CMS UI smoke fixture').get_by_role('button',name='Xem nội dung',exact=True).click()
                expect(page.get_by_text('Cần ảnh rõ tình trạng sách',exact=True)).to_be_visible()
                page.locator('.ant-drawer-close').click()
                print('PASS: rejection requires a reason, cancel preserves pending, reset clears old reason and owner sees saved reason')
            if seller_lifecycle:
                page.goto(origin+'/tin-cua-toi',wait_until='networkidle')
                own=page.locator('.ant-list-item').filter(has_text='R2 Seller UI smoke fixture')
                expect(own).to_be_visible()
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path='/tmp/cho-sach-seller-mobile.png',full_page=True)
                page.set_viewport_size({'width':700,'height':900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.set_viewport_size({'width':1440,'height':1000})
                own.get_by_role('button',name='Chỉnh sửa',exact=True).click()
                expect(page.locator('h1')).to_have_text('Chỉnh sửa tin đăng')
                expect(page.locator('.selected-image-preview img')).to_have_count(2)
                page.get_by_label('Mô tả chi tiết',exact=True).fill('Seller edited description')
                page.get_by_role('button',name=re.compile('Lưu và gửi duyệt lại')).click()
                expect(page.locator('.ant-modal-confirm')).to_be_visible()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Hủy',exact=True).click()
                expect(page.get_by_label('Mô tả chi tiết',exact=True)).to_have_value('Seller edited description')
                page.get_by_role('button',name=re.compile('Lưu và gửi duyệt lại')).click()
                with page.expect_response(lambda r:'/api/seller/listings/' in r.url and r.request.method=='PATCH') as response:
                    page.locator('.ant-modal-confirm').get_by_role('button',name='Lưu và gửi duyệt',exact=True).click()
                assert response.value.status==200
                expect(page).to_have_url(origin+'/tin-cua-toi',timeout=30000)
                own.get_by_role('button',name='Ẩn tin',exact=True).click()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Hủy',exact=True).click()
                expect(own.get_by_role('button',name='Chỉnh sửa',exact=True)).to_be_visible()
                own.get_by_role('button',name='Ẩn tin',exact=True).click()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Ẩn tin',exact=True).click()
                expect(own.get_by_role('button',name='Sửa và gửi duyệt lại',exact=True)).to_be_visible()
                own.get_by_role('button',name='Sửa và gửi duyệt lại',exact=True).click()
                page.get_by_role('button',name=re.compile('Lưu và gửi duyệt lại')).click()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Lưu và gửi duyệt',exact=True).click()
                expect(page).to_have_url(origin+'/tin-cua-toi',timeout=30000)
                expect(own.get_by_role('button',name='Chỉnh sửa',exact=True)).to_be_visible()
                own.get_by_role('button',name='Đã bán',exact=True).click()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Hủy',exact=True).click()
                expect(own.get_by_role('button',name='Chỉnh sửa',exact=True)).to_be_visible()
                own.get_by_role('button',name='Đã bán',exact=True).click()
                page.locator('.ant-modal-confirm').get_by_role('button',name='Đánh dấu đã bán',exact=True).click()
                expect(own.get_by_role('button',name='Đã bán',exact=True)).to_have_count(0)
                expect(own.get_by_role('button',name='Chỉnh sửa',exact=True)).to_have_count(0)
                expect(own.get_by_role('button',name='Ẩn tin',exact=True)).to_have_count(0)
                print('PASS: Seller edits existing photos, confirmation cancel, hides, re-submits hidden and ends sold listing; mobile actions fit')
            assert not errors, 'Browser JavaScript errors'
            print('PASS: Seller/CMS minimum 2 and maximum 5, upload, edit and existing-plus-new limit')
        finally:
            browser.close()
