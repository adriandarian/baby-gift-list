"""Render and exercise the real website. Run after installing playwright and Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import argparse, json
parser=argparse.ArgumentParser()
parser.add_argument('--base-url',default=None)
parser.add_argument('--output',default='qa-output')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
server=None
if not args.base_url:
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
    Thread(target=server.serve_forever,daemon=True).start()
    base_url=f'http://127.0.0.1:{server.server_port}'
else:base_url=args.base_url
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1430,1034),(1920,1080),(1100,1000),(1024,1000),(768,1024),(390,844),(320,740)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        response=page.goto(base_url,wait_until='networkidle')
        assert response.status==200, f'Homepage status {response.status}'
        page.wait_for_selector('.product')
        page.evaluate('document.fonts.ready')
        assert page.locator('.category').count()==8
        assert page.locator('.product').count()==27
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'Overflow at {width}px'
        assert not page.locator('img').evaluate_all('(imgs)=>imgs.some(x=>!x.complete||!x.naturalWidth)'),f'Missing image at {width}px'
        assert not errors,errors
        if width==1430: assert page.locator('body').bounding_box()['height']==1034
        page.screenshot(path=str(output/f'after-{width}.png'),full_page=True)
        info={'width':width,'httpStatus':response.status,'height':page.locator('body').bounding_box()['height'],'horizontalOverflow':False,'missingImages':0,'javascriptErrors':errors,'visibleProducts':27}
        if width in (1430,390):
            page.locator('.product').first.click()
            assert page.locator('dialog[open]').count()==1
            assert page.locator('.shop-link').count()==2
            assert all(link.startswith('https://') for link in page.locator('.shop-link').evaluate_all('(xs)=>xs.map(x=>x.href)'))
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            assert page.locator('dialog[open]').count()==0
            page.locator('[data-browse="purchased"]').first.click()
            assert page.locator('.dialog-gift').count()==12
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            page.locator('[data-category="feeding"]').click()
            assert page.locator('.dialog-gift').count()==13
            page.locator('#gift-search').fill('bottles')
            assert page.locator('.dialog-gift').count()==1
            page.screenshot(path=str(output/f'gift-browser-{width}.png'))
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            page.locator('#tips-button').click()
            assert page.locator('dialog[open]').count()==1
            page.locator('.close-dialog').click()
            info['interactionTests']={'productDetails':True,'storeLinks':True,'escapeAndClose':True,'purchasedFilter':12,'feedingCategory':13,'search':True,'tipsDialog':True}
        results.append(info)
        page.close()
    browser.close()
if server:server.shutdown()
(output/'report.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
