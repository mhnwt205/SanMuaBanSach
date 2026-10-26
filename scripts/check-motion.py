"""Read-only browser checks for typography, scroll effects and CMS interaction.
API responses are browser fixtures only; never creates users or modifies D1/R2.
"""
import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('origin')
parser.add_argument('--output-dir', default='/tmp/cho-sach-motion')
args = parser.parse_args()
origin = args.origin.rstrip('/')
if not re.fullmatch(r'http://127\.0\.0\.1:\d+', origin):
    parser.error('Use the local production-build preview; all API responses are mocked.')
output = Path(args.output_dir)
output.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=15000)
errors = []
user = dict(id='visual-only', name='Quản trị kiểm thử', email='visual@example.invalid', role='admin', cms_access=True, is_super_admin=True, permissions=[])
days = [dict(day=(datetime.now(timezone.utc)-timedelta(days=6-i)).strftime('%Y-%m-%d'), listings=i+1, sellers=i % 3, reports=i % 2) for i in range(7)]


def mock_api(admin=False):
    def handle(route):
        assert route.request.method == 'GET', 'Visual checks must not write to an API'
        path = urlsplit(route.request.url).path
        status = 200
        if path == '/api/auth/me':
            data = {'user': user} if admin else {'error': 'Vui lòng đăng nhập.'}
            status = 200 if admin else 401
        elif path == '/api/capabilities':
            data = {'image_uploads': True}
        elif path == '/api/categories':
            data = {'items': [dict(id=str(i), name=name) for i, name in enumerate(['Văn học', 'Kỹ năng', 'Tâm lý', 'Kinh tế', 'Giáo khoa'])]}
        elif path == '/api/listings':
            data = dict(items=[], catalog_empty=True, has_more=False)
        elif path == '/api/admin/summary':
            data = dict(sellers=2, listings=4, activeListings=18, users=32, reports=1, activity=days)
        elif path == '/api/admin/options':
            data = dict(sellers=[], categories=[], roles=[])
        elif path == '/api/admin/permissions':
            data = {'groups': [dict(key='listings', name='Tin đăng', actions=dict(view='Xem', create='Tạo', update='Sửa'))]}
        elif path.startswith('/api/admin/'):
            data = dict(items=[], total=0)
        else:
            raise AssertionError('Unexpected API: '+path)
        route.fulfill(status=status, content_type='application/json', body=json.dumps(data))
    return handle


def ready(page, path='/'):
    response = page.goto(origin+path, wait_until='networkidle')
    assert response.status == 200
    expect(page.locator('h1').first).to_be_visible()
    expect(page.get_by_role('button', name='Giảm chuyển động', exact=True)).to_have_count(0)
    expect(page.locator('.scroll-progress')).to_have_count(0)
    page.evaluate('document.fonts.ready')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow: '+path
    # Lazy routes can mount after the document's initial font-ready promise.
    page.wait_for_function('''() => {
      const h=document.querySelector('h1'),s=getComputedStyle(h);
      return s.fontFamily.includes('Be Vietnam Pro') && document.fonts.check(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,h.textContent);
    }''')


def font_size(locator):
    return locator.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    for width in [1440, 768, 390, 320]:
        context = browser.new_context(viewport=dict(width=width, height=900), reduced_motion='no-preference')
        context.route('**/api/**', mock_api())
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        ready(page)
        expect(page.locator('.book-card')).to_have_count(8)
        expect(page.locator('.home-intro-copy > a')).to_be_visible()
        assert page.locator('.campaign-photo img').evaluate('(e)=>e.complete && e.naturalWidth>0'), 'Campaign image must decode on every viewport'
        assert font_size(page.locator('.book-info h3').first) >= 14
        assert font_size(page.locator('.book-author').first) >= 12
        button = page.locator('.save-control').first.bounding_box()
        assert button['width'] >= 44 and button['height'] >= 44
        if width <= 760:
            assert font_size(page.get_by_label('Tìm sách', exact=True)) >= 16
            assert page.locator('.campaign-photo').evaluate('(e)=>getComputedStyle(e).transform') == 'none', 'Mobile campaign must not inherit the old tilted-cover transform'
        page.screenshot(path=str(output/f'home-{width}.png'), full_page=True, animations='disabled')
        expect(page.locator('.reading-story-step')).to_have_count(3)
        if width <= 760:
            assert page.locator('.reading-story-sticky').evaluate('(e)=>getComputedStyle(e).position') == 'static'
        if width in [1440, 390]:
            page.locator('.reading-story').evaluate('(e)=>scrollTo(0,e.getBoundingClientRect().top+scrollY-30)')
            page.wait_for_timeout(1100)
            page.screenshot(path=str(output/f'story-{width}.png'))
        page.locator('.book-cover-link').first.click()
        expect(page.locator('.detail-summary h1')).to_be_visible()
        assert page.locator('.detail-summary').bounding_box()['width'] >= 120
        assert font_size(page.locator('.detail-description > p')) >= 15
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(output/f'detail-{width}.png'), full_page=True, animations='disabled')
        context.close()

        context = browser.new_context(viewport=dict(width=width, height=900), reduced_motion='reduce' if width == 320 else 'no-preference')
        context.route('**/api/**', mock_api(admin=True))
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        ready(page, '/quan-tri')
        chart = page.locator('.cms-chart-frame svg')
        expect(chart).to_be_visible()
        page.wait_for_function("Math.abs(document.querySelector('.cms-chart-frame svg').viewBox.baseVal.width-document.querySelector('.cms-chart-frame').clientWidth)<2")
        assert font_size(page.locator('.cms-chart-axis').first) >= 12
        assert font_size(page.locator('.cms-metric-label').first) >= 12
        assert page.locator('.cms-chart-axis').all_text_contents()[-1] == datetime.now(timezone.utc).strftime('%d/%m')
        page.screenshot(path=str(output/f'cms-{width}.png'), full_page=True, animations='disabled')
        ready(page, '/quan-tri/ho-so')
        assert font_size(page.locator('.cms-settings-label p').first) >= 13
        if width <= 760:
            assert page.locator('input').evaluate_all('(nodes)=>nodes.every(n=>parseFloat(getComputedStyle(n).fontSize)>=16)')
            assert page.get_by_role('link', name='Mở hồ sơ quản trị', exact=True).bounding_box()['width'] >= 44
        page.screenshot(path=str(output/f'profile-{width}.png'), full_page=True)
        ready(page, '/quan-tri/phan-quyen')
        page.get_by_role('button', name=re.compile(r'Tạo mới$')).click()
        dialog = page.get_by_role('dialog')
        view = dialog.get_by_role('checkbox', name='Xem', exact=True)
        create = dialog.get_by_role('checkbox', name='Tạo', exact=True)
        view.check(); create.check(); expect(view).to_be_checked(); expect(create).to_be_checked()
        view.uncheck(); expect(view).not_to_be_checked(); expect(create).to_be_checked()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(output/f'permissions-{width}.png'), full_page=True)
        context.close()
        print(f'PASS: {width}px type, Vietnamese fonts, touch targets, detail, readable chart/date and independent permission checkboxes', flush=True)

    context = browser.new_context(viewport=dict(width=1440, height=900), reduced_motion='no-preference')
    context.route('**/api/**', mock_api())
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    initial_pose = page.locator('.campaign-photo').evaluate('(e)=>getComputedStyle(e).transform')
    frame_pose = page.locator('.intro-books').evaluate('(e)=>getComputedStyle(e).transform')
    page.evaluate('window.scrollTo(0,420)')
    page.wait_for_function("parseFloat(document.querySelector('.home-intro').style.getPropertyValue('--hero-scroll'))>0")
    assert page.locator('.campaign-photo').evaluate('(e)=>getComputedStyle(e).transform') != initial_pose
    assert page.locator('.intro-books').evaluate('(e)=>getComputedStyle(e).transform') == frame_pose
    assert page.locator('.campaign-photo img').evaluate('(e)=>e.complete && e.naturalWidth>0')
    page.wait_for_function("document.querySelector('.cover-motion[data-revealed=true]')")
    last = page.locator('.book-cover-link').last
    last.evaluate('(e)=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-innerHeight+120)')
    page.wait_for_function("document.querySelector('.book-card:last-child .cover-motion').dataset.revealed==='true'")
    # The cover animates inside a stationary link, rather than moving the hit area.
    delta = last.evaluate('''async e=>{
      const before=e.getBoundingClientRect();
      await new Promise(resolve=>setTimeout(resolve,120));
      const after=e.getBoundingClientRect();
      return Math.abs(before.top-after.top)+Math.abs(before.left-after.left);
    }''')
    assert delta < 1, 'Scroll reveals must leave book hit areas in place'
    last.click(); expect(page.locator('.detail-summary h1')).to_be_visible()
    page.go_back(wait_until='networkidle')
    page.wait_for_function("document.querySelector('.book-card:last-child .cover-motion')?.dataset.revealed==='true'")
    assert page.locator('.book-card:last-child .cover-motion').evaluate('(e)=>e.getAnimations().length') == 0, 'Seen covers should not replay on Back'
    layout_top = page.locator('.reading-story-layout').evaluate('(e)=>e.getBoundingClientRect().top+scrollY')
    page.evaluate('(y)=>scrollTo(0,y)', layout_top+20)
    sticky = page.locator('.reading-story-sticky')
    first_top = sticky.bounding_box()['y']
    page.evaluate('(y)=>scrollTo(0,y)', layout_top+100)
    assert sticky.evaluate('(e)=>getComputedStyle(e).position') == 'sticky'
    assert abs(sticky.bounding_box()['y']-first_top) < 2, 'Story image should remain pinned while the copy scrolls'
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("document.documentElement.dataset.motion==='off'")
    assert sticky.evaluate('(e)=>getComputedStyle(e).position') == 'static'
    assert not page.evaluate("document.getAnimations().filter(a=>a.playState==='running' && a.effect?.target?.closest('.motion-reveal,.cover-motion')).length")
    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_function("document.documentElement.dataset.motion==='on'")
    context.close()
    print('PASS: coordinated hero camera, stable book hit areas, seen-cover history, native sticky story, system reduction; no toggle or decorative progress bar')

    context = browser.new_context(viewport=dict(width=390, height=844))
    context.route('**/api/**', mock_api())
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    page.locator('.discovery-budget').click()
    expect(page).to_have_url(origin+'/kham-pha?max=50000')
    expect(page.locator('.book-card')).to_have_count(5)
    ready(page)
    page.locator('.discovery-library').click()
    expect(page).to_have_url(re.compile(r'/kham-pha\?category='))
    expect(page.locator('.book-card')).to_have_count(3)
    context.close()
    print('PASS: discovery banners open working price/category filters; no dead promotional links')

    context = browser.new_context(reduced_motion='reduce')
    context.route('**/api/**', mock_api())
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    assert page.evaluate('document.documentElement.dataset.motion') == 'off'
    context.close()
    context = browser.new_context(reduced_motion='no-preference')
    context.add_init_script("localStorage.setItem('cho-sach-motion-v1','off')")
    context.route('**/api/**', mock_api())
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    assert page.evaluate('document.documentElement.dataset.motion') == 'on'
    context.close()
    context = browser.new_context()
    context.add_init_script("window.IntersectionObserver=undefined;Storage.prototype.getItem=()=>{throw Error('unavailable')};Storage.prototype.setItem=()=>{throw Error('unavailable')}")
    context.route('**/api/**', mock_api())
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page); expect(page.locator('.book-card').first).to_be_visible()
    assert page.evaluate('document.documentElement.dataset.motion') == 'on'
    context.close(); browser.close()
    assert not errors, errors
    print('PASS: initial reduced motion, retired preference ignored, missing observer/storage fallback; no JS errors or API/database writes')
