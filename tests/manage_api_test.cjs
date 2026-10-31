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
(async()=>{
 let x=await call(req('setup'));
 assert.equal(x.statusCode,200);assert.equal(x.data.ready,true);
 x=await call(req('login','POST',{password:'wrong'}));assert.equal(x.statusCode,401);
 x=await call(req('login','POST',{password:process.env.REGISTRY_ADMIN_PASSWORD}));
 assert.equal(x.statusCode,200);assert.ok(x.data.csrf);
 const cookie=x.headers['Set-Cookie'].split(';')[0],csrf=x.data.csrf;
 x=await call(req('registry','GET',null,{cookie}));assert.equal(x.statusCode,401,'GET without CSRF header must be rejected');
 x=await call(req('registry','GET',null,{cookie,'x-admin-csrf':csrf}));
 assert.equal(x.statusCode,200);assert.equal(x.data.registry.items.length,56);
 const items=current.items.map(i=>{
   const match=i.name.match(/^\s*(\d+)\s*[×x]/);
   const quantityWanted=match?Number(match[1]):1;
   return {...i,quantityWanted,quantityReceived:i.purchased?quantityWanted:0,status:i.purchased?'received':'needed',notes:'',archived:false};
 });
 items[1]={...items[1],status:'reserved',purchased:false};
 x=await call(req('registry','PUT',{sha,items},{cookie,'x-admin-csrf':csrf}));
 assert.equal(x.statusCode,200);assert.equal(puts.length,1);
 const changed=JSON.parse(Buffer.from(puts[0].content,'base64').toString());
 assert.equal(changed.items.length,56);
 assert.equal(changed.items[1].status,'reserved');
 assert.equal(changed.items[1].purchased,false);
 assert.equal(changed.items[21].purchased,true,'purchased history retained');
 assert.deepEqual(changed.categories,current.categories,'design categories must be retained');
 x=await call(req('registry','PUT',{sha:'b'.repeat(40),items},{cookie,'x-admin-csrf':csrf}));
 assert.equal(x.statusCode,409,'stale updates must be rejected');
 const forbidden=items.map(i=>({...i}));
 forbidden[0].archived=true;
 x=await call(req('registry','PUT',{sha,items:forbidden},{cookie,'x-admin-csrf':csrf}));
 assert.equal(x.statusCode,400,'featured items must not disappear from reference layout');
 const added=items.map(i=>({...i}));
 added.push({id:56,name:'Extra bib set',category:'Feeding',status:'needed',quantityWanted:3,quantityReceived:0,purchased:false,links:[],notes:'',archived:false});
 x=await call(req('registry','PUT',{sha,items:added},{cookie,'x-admin-csrf':csrf}));
 assert.equal(x.statusCode,200);
 assert.equal(puts.length,2);assert.equal(JSON.parse(Buffer.from(puts[1].content,'base64')).items.length,57);
 x=await call(req('registry','PUT',{sha,items:added},{cookie,'x-admin-csrf':csrf,origin:'https://evil.example'}));
 assert.equal(x.statusCode,403);
 x=await call(req('logout','POST',{}, {cookie,'x-admin-csrf':csrf}));assert.equal(x.statusCode,200);
 assert.match(x.headers['Set-Cookie'],/Max-Age=0/);
 console.log('Manager API: login, cookie, CSRF, conflict, add, reserved, archive guard, logout PASS');
})().catch(e=>{console.error(e);process.exit(1)});
