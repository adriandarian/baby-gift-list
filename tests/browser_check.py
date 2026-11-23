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
        assert page.locator('.product').count()==22
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'Overflow at {width}px'
        assert not page.locator('img').evaluate_all('(imgs)=>imgs.some(x=>!x.complete||!x.naturalWidth)'),f'Missing image at {width}px'
        assert not errors,errors
        page.screenshot(path=str(output/f'after-{width}.png'),full_page=True)
        info={'width':width,'httpStatus':response.status,'height':page.locator('body').bounding_box()['height'],'horizontalOverflow':False,'missingImages':0,'javascriptErrors':errors,'visibleProducts':22}
        if width in (1430,390):
            page.locator('.registry-entry').click()
            page.locator('[data-store="Amazon"]').click()
            assert page.locator('.dialog-gift').count()==12
            page.locator('.dialog-gift').first.click()
            assert page.locator('dialog[open]').count()==1
            assert page.locator('.shop-link').count()==0
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            assert page.locator('dialog[open]').count()==0
            page.locator('[data-browse="purchased"]').first.click()
            assert page.locator('.dialog-gift').count()==12
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            page.locator('[data-category="feeding"]').click()
            assert page.locator('.dialog-gift').count()==12
            page.locator('#gift-search').fill('bottles')
            assert page.locator('.dialog-gift').count()==1
            page.screenshot(path=str(output/f'gift-browser-{width}.png'))
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
            page.locator('#tips-button').click()
            assert page.locator('dialog[open]').count()==1
            page.locator('.close-dialog').click()
            info['interactionTests']={'productDetails':True,'storeLinks':True,'escapeAndClose':True,'purchasedFilter':12,'feedingCategory':12,'search':True,'tipsDialog':True}
        results.append(info)
        page.close()
    if not args.base_url:
        page=browser.new_page()
        sample=json.loads((root/'data/registry.json').read_text(encoding='utf-8'))
        item=next(i for i in sample['items'] if i['id']==42)
        item.update(productUrl='https://brand.example/bottles', registryUrl='https://registry.example/family/bottles')
        page.route('**/data/registry.json',lambda route:route.fulfill(json=sample))
        page.goto(base_url)
        page.locator('.product[data-item="42"]').click()
        assert page.get_by_role('link',name='Official product page').get_attribute('href')==item['productUrl']
        assert page.get_by_role('link',name='View on Amazon registry').get_attribute('href')==item['registryUrl']
        page.close()
    browser.close()
if server:server.shutdown()
(output/'report.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
