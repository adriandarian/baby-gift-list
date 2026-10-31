"""Responsive visual QA for the public registry and its separate manager."""
import json
import argparse
import threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'qa-mobile'
OUT.mkdir(exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
registry=json.loads((ROOT/'data/registry.json').read_text())
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (320,375,390,430,768,1430):
        page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        response=page.goto(base+'/',wait_until='networkidle')
        assert response.status==200
        page.locator('.product').first.wait_for()
        vals=page.evaluate("""() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          cardColumns: getComputedStyle(document.querySelector('.products')).gridTemplateColumns.split(' ').length,
          cardHeight: document.querySelector('.product').getBoundingClientRect().height,
          artHeight: document.querySelector('.product-art').getBoundingClientRect().height,
          primaryButtonHeight: document.querySelector('.primary-button').getBoundingClientRect().height,
          navButtonHeight:document.querySelector('.main-nav button').getBoundingClientRect().height,
          bodyHeight: document.body.getBoundingClientRect().height
        })""")
        assert vals['overflow']<=1, (width,vals)
        assert page.locator('.product').count()==27
        if width<=430:
            assert vals['cardColumns']==2,(width,vals)
            assert vals['artHeight']>=95,(width,vals)
            assert vals['primaryButtonHeight']>=44,(width,vals)
            assert vals['navButtonHeight']>=40,(width,vals)
            assert vals['cardHeight']>=170,(width,vals)
        if width==1430:
            assert round(vals['bodyHeight'])==1034,(width,vals)
        assert not page.locator('img').evaluate_all('(xs)=>xs.some(x=>!x.complete||!x.naturalWidth)')
        assert not errors,errors
        page.screenshot(path=str(OUT/f'public-{width}.png'),full_page=True)
        if width==390:
            page.locator('.product').first.click()
            assert page.locator('dialog[open]').count()==1
            page.locator('.close-dialog').click()
            page.locator('.main-nav #tips-button').click()
            assert page.locator('dialog[open]').count()==1
            page.keyboard.press('Escape')
            assert page.locator('dialog[open]').count()==0
        results.append({'page':'public','width':width,**vals})
        page.close()

    for width in (320,390,430,768):
        page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def mock(route):
            action=route.request.url.rsplit('=',1)[-1]
            if action=='setup':data={'ready':True}
            elif action=='session':data={'authenticated':False,'rememberedDevice':True,'day':'2026-10-31'}
            elif action=='login':data={'ok':True,'csrf':'test-csrf'}
            elif action=='registry' and route.request.method=='GET':data={'registry':registry,'sha':'a'*40}
            else:data={'ok':True}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
        page.route('**/api/manage?action=*',mock)
        page.goto(base+'/manage.html',wait_until='networkidle')
        page.locator('#login-panel').wait_for(state='visible')
        page.locator('#login-password').fill('test-only-long-password')
        page.locator('#login-form button[type=submit]').click()
        page.locator('#manager-panel').wait_for(state='visible')
        page.locator('#items-body tr').first.wait_for(state='visible')
        vals=page.evaluate("""() => ({
          overflow: document.documentElement.scrollWidth-innerWidth,
          cards:document.querySelectorAll('#items-body tr').length,
          tableRowDisplay:getComputedStyle(document.querySelector('#items-body tr')).display,
          statusHeight:document.querySelector('.status-select').getBoundingClientRect().height,
          editHeight:document.querySelector('.edit-link').getBoundingClientRect().height,
          saveHeight:document.querySelector('#save-button').getBoundingClientRect().height
        })""")
        assert vals['overflow']<=1,(width,vals)
        assert vals['cards']==56
        if width<=430:
            assert vals['tableRowDisplay']=='grid',(width,vals)
            assert min(vals['statusHeight'],vals['editHeight'],vals['saveHeight'])>=40,(width,vals)
        page.screenshot(path=str(OUT/f'manager-{width}.png'),full_page=True)
        assert not errors,errors
        results.append({'page':'manager','width':width,**vals})
        page.close()
    browser.close()
server.shutdown()
(OUT/'report.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
