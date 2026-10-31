"""Browser test of manager interactions with mocked secure GitHub backend; no secrets or writes."""
import json
import threading
import pathlib
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parent.parent
DATA=json.loads((ROOT/'data/registry.json').read_text())
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width in [390,1430]:
  page=browser.new_page(viewport={'width':width,'height':900})
  def api(route):
   req=route.request
   action=req.url.rsplit('=',1)[-1]
   if action=='setup': body={'ready':True}
   elif action=='session': body={'authenticated':False}
   elif action=='login': body={'ok':True,'csrf':'test-csrf'}
   elif action=='registry' and req.method=='GET':body={'registry':DATA,'sha':'a'*40}
   elif action=='registry' and req.method=='PUT':body={'ok':True}
   else:body={'ok':True}
   route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
  page.route('**/api/manage?action=*',api)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url+'/manage.html',wait_until='networkidle')
  assert page.locator('#login-panel').is_visible()
  page.locator('#login-password').fill('test-only-long-password')
  page.locator('#login-form button[type=submit]').click()
  page.locator('#manager-panel').wait_for(state='visible',timeout=10000)
  page.locator('#items-body tr').first.wait_for(state='visible',timeout=10000)
  assert page.locator('#items-body tr').count()==56
  page.locator('#search').fill('stroller')
  assert page.locator('#items-body tr').count()==2
  page.locator('#search').fill('')
  page.locator('#items-body [data-status="1"]').select_option('reserved')
  assert not page.locator('#save-button').is_disabled()
  assert page.locator('#items-body [data-status="1"]').input_value()=='reserved'
  page.locator('#add-button').click()
  assert page.locator('#edit-dialog').is_visible()
  page.locator('#edit-form [name=name]').fill('Extra baby bib set')
  page.locator('#edit-form [name=wanted]').fill('3')
  page.locator('#edit-form [type=submit]').click()
  assert page.locator('#items-body tr').count()==57
  assert page.locator('#save-button').is_enabled()
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
  assert not errors,errors
  page.close()
 browser.close()
server.shutdown()
print('Manager browser login, search, reserve, add and responsive layout PASS')
