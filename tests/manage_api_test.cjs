'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../api/manage.js');

process.env.REGISTRY_ADMIN_PASSWORD='test-only-long-password-with-adequate-entropy';
process.env.REGISTRY_SESSION_SECRET='test-only-unique-session-secret-length-over-32';
process.env.GITHUB_REGISTRY_TOKEN='test-github-token-not-real';

const raw=fs.readFileSync(path.resolve(__dirname,'../data/registry.json'),'utf8');
const current=JSON.parse(raw),sha='a'.repeat(40);
let puts=[];
global.fetch=async (url,options)=>{
  if(options.method==='GET')return {ok:true,status:200,json:async()=>({sha,content:Buffer.from(raw).toString('base64')})};
  if(options.method==='PUT'){puts.push(JSON.parse(options.body));return{ok:true,status:200,json:async()=>({content:{sha:'b'.repeat(40)}})};}
  throw Error('Unexpected fetch '+url);
};
function req(action,method='GET',body,extra={}) {
 return {method,query:{action},headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',...extra},body};
}
function res() {
 const headers={};
 return {statusCode:200,headers,setHeader(k,v){headers[k]=v},end(x){this.data=JSON.parse(x)}};
}
async function call(r){const s=res();await handler(r,s);return s;}
function cookiePair(x){
 const set=x.headers['Set-Cookie'];
 assert.ok(Array.isArray(set),'session and remembered-device cookies must both be set');
 assert.equal(set.length,2);
 assert.match(set[0],/HttpOnly; Secure; SameSite=Strict/);
 assert.match(set[1],/HttpOnly; Secure; SameSite=Strict/);
 return set.map(c=>c.split(';')[0]).join('; ');
}
(async()=>{
 const actualNow=Date.now;
 try{
   // One minute before 12 a.m. Pacific. Check access expires on the date boundary,
   // not after eight hours or 24 hours since logging in.
   Date.now=()=>Date.parse('2026-10-31T06:59:00Z');
   let x=await call(req('setup'));
   assert.equal(x.statusCode,200);assert.equal(x.data.ready,true);
   x=await call(req('login','POST',{password:'wrong'}));
   assert.equal(x.statusCode,401);
   x=await call(req('login','POST',{password:process.env.REGISTRY_ADMIN_PASSWORD}));
   assert.equal(x.statusCode,200);assert.ok(x.data.csrf);
   assert.equal(x.data.day,'2026-10-30');
   const combined=cookiePair(x);
   const cookieSet=x.headers['Set-Cookie'];
   const maxAge=Number(cookieSet[0].match(/Max-Age=(\d+)/)[1]);
   assert.ok(maxAge>=59 && maxAge<=61, 'session expires at next Pacific midnight');
   assert.match(cookieSet[1],/Max-Age=2592000/,'device remembered for 30 days');
   const csrf=x.data.csrf;
   x=await call(req('session','GET',null,{cookie:combined}));
   assert.equal(x.data.authenticated,true);
   x=await call(req('registry','GET',null,{cookie:combined}));
   assert.equal(x.statusCode,401,'GET without CSRF header must be rejected');
   x=await call(req('registry','GET',null,{cookie:combined,'x-admin-csrf':csrf}));
   assert.equal(x.statusCode,200);assert.equal(x.data.registry.items.length,56);
   const originalPassword=process.env.REGISTRY_ADMIN_PASSWORD;
   process.env.REGISTRY_ADMIN_PASSWORD='changed-admin-password-for-session-revocation';
   x=await call(req('session','GET',null,{cookie:combined}));
   assert.equal(x.data.authenticated,false,'changing the server password invalidates sessions');
   assert.equal(x.data.rememberedDevice,true,'remembered device survives password rotation');
   process.env.REGISTRY_ADMIN_PASSWORD=originalPassword;
   x=await call(req('session','GET',null,{cookie:cookieSet[0].split(';')[0]}));
   assert.equal(x.data.authenticated,false,'session without signed device cookie rejected');

   Date.now=()=>Date.parse('2026-10-31T07:00:01Z');
   x=await call(req('session','GET',null,{cookie:combined}));
   assert.equal(x.data.authenticated,false,'old session expires at midnight');
   assert.equal(x.data.rememberedDevice,true,'remembered device persists after midnight');
   x=await call(req('registry','GET',null,{cookie:combined,'x-admin-csrf':csrf}));
   assert.equal(x.statusCode,401,'old CSRF/session cannot read gifts after midnight');
   x=await call(req('login','POST',{password:'wrong'},{cookie:combined}));
   assert.equal(x.statusCode,401,'remembered device never bypasses password');
   x=await call(req('login','POST',{password:process.env.REGISTRY_ADMIN_PASSWORD},{cookie:combined}));
   assert.equal(x.statusCode,200);assert.equal(x.data.day,'2026-10-31');
   const newCookie=cookiePair(x), newCsrf=x.data.csrf;
   const deviceBefore=JSON.parse(Buffer.from(cookieSet[1].split('=')[1].split('.')[0],'base64url'));
   const deviceAfter=JSON.parse(Buffer.from(x.headers['Set-Cookie'][1].split('=')[1].split('.')[0],'base64url'));
   assert.equal(deviceBefore.id,deviceAfter.id,'recognized device stays the same after re-login');
   assert.notEqual(newCsrf,csrf,'new day gets new session/CSRF');
   x=await call(req('session','GET',null,{cookie:newCookie}));
   assert.equal(x.data.authenticated,true);

   const items=current.items.map(i=>{
     const match=i.name.match(/^\s*(\d+)\s*[×x]/);
     const quantityWanted=match?Number(match[1]):1;
     return {...i,quantityWanted,quantityReceived:i.purchased?quantityWanted:0,status:i.purchased?'received':'needed',notes:'',archived:false};
   });
   items[1]={...items[1],status:'reserved',purchased:false};
   x=await call(req('registry','PUT',{sha,items},{cookie:newCookie,'x-admin-csrf':newCsrf}));
   assert.equal(x.statusCode,200);assert.equal(puts.length,1);
   const changed=JSON.parse(Buffer.from(puts[0].content,'base64').toString());
   assert.equal(changed.items.length,56);
   assert.equal(changed.items[1].status,'reserved');
   assert.equal(changed.items[21].purchased,true);
   assert.deepEqual(changed.categories,current.categories);
   x=await call(req('registry','PUT',{sha:'b'.repeat(40),items},{cookie:newCookie,'x-admin-csrf':newCsrf}));
   assert.equal(x.statusCode,409);
   const forbidden=items.map(i=>({...i}));forbidden[0].archived=true;
   x=await call(req('registry','PUT',{sha,items:forbidden},{cookie:newCookie,'x-admin-csrf':newCsrf}));
   assert.equal(x.statusCode,400);
   const added=items.map(i=>({...i}));
   added.push({id:56,name:'Extra bib set',category:'Feeding',status:'needed',quantityWanted:3,quantityReceived:0,purchased:false,links:[],notes:'',archived:false});
   x=await call(req('registry','PUT',{sha,items:added},{cookie:newCookie,'x-admin-csrf':newCsrf}));
   assert.equal(x.statusCode,200);assert.equal(puts.length,2);
   x=await call(req('registry','PUT',{sha,items:added},{cookie:newCookie,'x-admin-csrf':newCsrf,origin:'https://evil.example'}));
   assert.equal(x.statusCode,403);

   // October 31 expires at midnight PDT; November 1 is the 25-hour DST fall-back day.
   Date.now=()=>Date.parse('2026-11-01T06:59:00Z');
   x=await call(req('session','GET',null,{cookie:newCookie}));
   assert.equal(x.data.authenticated,true,'same Pacific day despite DST transition');
   Date.now=()=>Date.parse('2026-11-01T07:00:01Z');
   x=await call(req('session','GET',null,{cookie:newCookie}));
   assert.equal(x.data.authenticated,false,'locks at Pacific midnight after DST fall-back');
   assert.equal(x.data.rememberedDevice,true);
   Date.now=()=>Date.parse('2026-11-01T07:01:00Z');
   x=await call(req('login','POST',{password:process.env.REGISTRY_ADMIN_PASSWORD},{cookie:newCookie}));
   assert.equal(x.statusCode,200);
   assert.equal(x.data.day,'2026-11-01');
   assert.ok(Number(x.headers['Set-Cookie'][0].match(/Max-Age=(\d+)/)[1])>24*60*60,'DST fall-back day lasts 25 hours');
   const nov1Cookies=cookiePair(x),nov1Csrf=x.data.csrf;
   Date.now=()=>Date.parse('2026-11-02T07:59:00Z');
   x=await call(req('session','GET',null,{cookie:nov1Cookies}));
   assert.equal(x.data.authenticated,true);
   Date.now=()=>Date.parse('2026-11-02T08:00:01Z');
   x=await call(req('session','GET',null,{cookie:nov1Cookies}));
   assert.equal(x.data.authenticated,false);
   Date.now=()=>Date.parse('2026-11-01T07:01:00Z');
   x=await call(req('logout','POST',{}, {cookie:nov1Cookies,'x-admin-csrf':nov1Csrf}));
   assert.equal(x.statusCode,200);
   assert.match(x.headers['Set-Cookie'],/Max-Age=0/);
   console.log('Manager API: daily Pacific midnight, DST, remembered device, mandatory password, CSRF, conflicts, save and logout PASS');
 } finally {Date.now=actualNow;}
})().catch(e=>{console.error(e);process.exit(1)});
