'use strict';
/* Secure registry editor API; GitHub is the durable source of truth. */
const {createHash, createHmac, randomBytes, timingSafeEqual} = require('node:crypto');

const REPO = 'adriandarian/baby-gift-list';
const PATH = 'data/registry.json';
const BRANCH = 'main';
const COOKIE = '__Host-baby_registry_admin';
const DEVICE_COOKIE = '__Host-baby_registry_device';
const DEVICE_SECONDS = 30 * 24 * 60 * 60;
const PACIFIC_ZONE = 'America/Los_Angeles';
const pacificFormatter = new Intl.DateTimeFormat('en-US',{timeZone:PACIFIC_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
function pacificDay(timestamp=Date.now()) {
  const parts=Object.fromEntries(pacificFormatter.formatToParts(new Date(timestamp)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// Locate the next calendar day in the named time zone: handles both DST changes.
function nextPacificMidnight(timestamp=Date.now()) {
  const date=pacificDay(timestamp); let lower=timestamp, upper=timestamp+27*60*60*1000;
  while(upper-lower>1000){const mid=Math.floor((lower+upper)/2);if(pacificDay(mid)===date)lower=mid;else upper=mid;}
  return Math.ceil(upper/1000)*1000;
}
const MAX_BODY_BYTES = 180000;
const CATEGORIES = ['Travel','Nursery','Bath & Care','Clothing','Diapering','Feeding','Health & Safety','Playtime'];

function configReady() {
  return Boolean(process.env.REGISTRY_ADMIN_PASSWORD && process.env.REGISTRY_SESSION_SECRET &&
    process.env.GITHUB_REGISTRY_TOKEN && process.env.REGISTRY_ADMIN_PASSWORD.length >= 16 &&
    process.env.REGISTRY_SESSION_SECRET.length >= 32);
}
function json(res,status,payload) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(payload));
}
function equals(a,b) {
  const x=createHash('sha256').update(String(a)).digest();
  const y=createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x,y);
}
function signature(value) {
  // Device recognition stays stable, but changing the admin password revokes active sessions.
  const sessionBound=value.startsWith('session:')||value.startsWith('csrf:');
  const key=sessionBound?createHmac('sha256',process.env.REGISTRY_SESSION_SECRET)
    .update('password-bound-session:'+process.env.REGISTRY_ADMIN_PASSWORD).digest()
    :process.env.REGISTRY_SESSION_SECRET;
  return createHmac('sha256',key).update(value).digest('base64url');
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('=');return [x.slice(0,i),i>=0?x.slice(i+1):''];
  }));
}
function verifySigned(value,namespace) {
  if(!value||value.length>500||!configReady())return null;
  const split=value.lastIndexOf('.');
  if(split<=0||!equals(value.slice(split+1),signature(namespace+value.slice(0,split))))return null;
  try{return JSON.parse(Buffer.from(value.slice(0,split),'base64url').toString('utf8'));}
  catch{return null;}
}
function device(req) {
  const value=verifySigned(cookies(req)[DEVICE_COOKIE],'device:');
  if(!value||value.v!==1||!Number.isInteger(value.exp)||value.exp*1000<=Date.now()||
     typeof value.id!=='string'||!/^[0-9a-f]{36}$/.test(value.id))return null;
  return value;
}
function token(req) {
  const raw=cookies(req)[COOKIE];
  const data=verifySigned(raw,'session:');
  // Day is checked on EVERY API request; remembering a device never extends access.
  if(!data||data.v!==2||!Number.isInteger(data.exp)||data.exp*1000<=Date.now()||
      data.day!==pacificDay()||data.deviceId!==device(req)?.id)return null;
  return raw;
}
function csrf(t) { return signature('csrf:'+t); }
function authenticated(req) {
  const t=token(req);
  return Boolean(t && equals(req.headers['x-admin-csrf']||'',csrf(t)));
}
function checkOrigin(req) {
  const origin=req.headers.origin,host=req.headers.host;
  if(typeof origin!=='string'||!host)return false;
  try {
    const u=new URL(origin);
    return u.host===host && (u.protocol==='https:' || (u.protocol==='http:' && /^localhost(:|$)/.test(host)));
  } catch {return false;}
}
function setSession(req,res) {
  const existing=device(req);
  const deviceId=existing?.id||randomBytes(18).toString('hex');
  const now=Date.now();
  const day=pacificDay(now);
  const expiry=nextPacificMidnight(now);
  const sessionData=Buffer.from(JSON.stringify({v:2,day,deviceId,exp:Math.floor(expiry/1000),nonce:randomBytes(18).toString('hex')})).toString('base64url');
  const sessionToken=sessionData+'.'+signature('session:'+sessionData);
  const deviceData=Buffer.from(JSON.stringify({v:1,id:deviceId,exp:Math.floor(now/1000)+DEVICE_SECONDS})).toString('base64url');
  const deviceToken=deviceData+'.'+signature('device:'+deviceData);
  const maxAge=Math.max(1,Math.floor((expiry-now)/1000));
  res.setHeader('Set-Cookie',[
    COOKIE+'='+sessionToken+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Strict',
    DEVICE_COOKIE+'='+deviceToken+'; Path=/; Max-Age='+DEVICE_SECONDS+'; HttpOnly; Secure; SameSite=Strict'
  ]);
  return {csrf:csrf(sessionToken),day};
}
function clearSession(res) {
  res.setHeader('Set-Cookie',COOKIE+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
}
async function bodyJson(req) {
  const mime=String(req.headers['content-type']||'').split(';')[0].trim();
  if(mime!=='application/json')throw Object.assign(new Error('JSON required'),{status:415});
  const length=Number(req.headers['content-length']||0);
  if(length>MAX_BODY_BYTES)throw Object.assign(new Error('Request too large'),{status:413});
  // Vercel populates req.body for JSON. Supports Node request streams in local tests.
  if(req.body && typeof req.body==='object')return req.body;
  let text='';
  for await(const piece of req) {
    text+=piece.toString();
    if(Buffer.byteLength(text)>MAX_BODY_BYTES)throw Object.assign(new Error('Request too large'),{status:413});
  }
  return JSON.parse(text||'{}');
}
function gitHeaders() {
  return {
    'Accept':'application/vnd.github+json',
    'Authorization':'Bearer '+process.env.GITHUB_REGISTRY_TOKEN,
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'baby-gift-list-admin'
  };
}
async function github(method,payload) {
  const url='https://api.github.com/repos/'+REPO+'/contents/'+PATH;
  const resp=await fetch(url+(method==='GET'?'?ref='+BRANCH:''),{
    method, headers:{...gitHeaders(),...(method!=='GET'?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store'
  });
  let data;
  try{data=await resp.json();}catch{data={};}
  if(!resp.ok) {
    const err=new Error(resp.status===409?'Another editor saved changes. Refresh before saving.':'GitHub storage request failed.');
    err.status=resp.status===409||resp.status===422?409:502;
    throw err;
  }
  return data;
}
async function readRegistry() {
  const file=await github('GET');
  const raw=Buffer.from(String(file.content||'').replace(/\s/g,''),'base64').toString('utf8');
  const registry=JSON.parse(raw);
  if(!Array.isArray(registry.items)||!Array.isArray(registry.categories))throw new Error('Registry unavailable');
  return {registry,sha:file.sha};
}
function text(value,max=180) {
  if(typeof value!=='string')throw Object.assign(new Error('Invalid text field'),{status:400});
  const valueTrim=value.trim();
  if(valueTrim.length>max)throw Object.assign(new Error('A field is too long'),{status:400});
  return valueTrim;
}
function integer(value,max=10000) {
  if(!Number.isInteger(value)||value<0||value>max)throw Object.assign(new Error('Invalid quantity'),{status:400});
  return value;
}
function norm(item,current) {
  if(!item||typeof item!=='object')throw Object.assign(new Error('Invalid item'),{status:400});
  const id=integer(item.id,10000000);
  const name=text(item.name,180);
  if(!name)throw Object.assign(new Error('Every item needs a name'),{status:400});
  if(!CATEGORIES.includes(item.category))throw Object.assign(new Error('Unknown category'),{status:400});
  const qty=integer(item.quantityWanted??1,1000);
  if(qty<1)throw Object.assign(new Error('Quantity needed must be at least 1'),{status:400});
  let received=integer(item.quantityReceived??0,1000);
  if(received>qty)throw Object.assign(new Error('Received quantity cannot exceed needed quantity'),{status:400});
  let status=text(item.status||'needed',20);
  if(!['needed','reserved','partial','received'].includes(status))throw Object.assign(new Error('Invalid status'),{status:400});
  if(status==='received')received=qty;
  if(status==='needed')received=0;
  if(status==='reserved')received=0;
  if(received===qty)status='received';
  else if(received>0)status='partial';
  else if(status==='partial')status='needed';
  const links=Array.isArray(item.links)?item.links:[];
  if(links.length>6)throw Object.assign(new Error('Too many links'),{status:400});
  const validLinks=links.map(u=>text(u,1000)).filter(Boolean);
  if(!validLinks.every(u=>{try{const v=new URL(u);return v.protocol==='https:'&&Boolean(v.hostname);}catch{return false;}}))throw Object.assign(new Error('Links must be valid HTTPS URLs'),{status:400});
  // Historical art and labels are controlled by the original design, not editable by clients.
  const cleaned={
    id,name,category:item.category,purchased:status==='received',
    links:validLinks,quantityWanted:qty,quantityReceived:received,status,
    notes:text(item.notes||'',700),archived:Boolean(item.archived)
  };
  if(current && typeof current.art==='string')cleaned.art=current.art;
  if(current && typeof current.label==='string')cleaned.label=current.label;
  if(!current && item.label)cleaned.label=text(item.label,60);
  return cleaned;
}
function validateIncoming(input,current) {
  if(!input||!Array.isArray(input.items)||input.items.length>500)throw Object.assign(new Error('Invalid gift list'),{status:400});
  const existing=new Map(current.items.map(x=>[x.id,x]));
  const activeFeatured=new Set(current.categories.flatMap(c=>c.featured||[]));
  const ids=new Set();
  const maxOld=Math.max(-1,...existing.keys());
  const normalized=input.items.map(obj=>{
    const prev=existing.get(obj.id);
    const item=norm(obj,prev);
    if(ids.has(item.id))throw Object.assign(new Error('Duplicate item ID'),{status:400});
    ids.add(item.id);
    if(!prev && item.id<=maxOld)throw Object.assign(new Error('New items need new IDs'),{status:400});
    if(prev && activeFeatured.has(item.id) && (item.category!==prev.category || item.archived))
      throw Object.assign(new Error('Featured gifts cannot be moved or archived because they are part of the approved homepage'),{status:400});
    return item;
  });
  if([...existing.keys()].some(id=>!ids.has(id)))throw Object.assign(new Error('Please archive items instead of deleting them'),{status:400});
  return {items:normalized,categories:current.categories};
}
module.exports=async function handler(req,res) {
  const action=typeof req.query?.action==='string'?req.query.action:'';
  if (!['GET','POST','PUT'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  if(action==='setup'&&req.method==='GET')return json(res,200,{ready:configReady()});
  if(!configReady())return json(res,503,{error:'Management is not configured. Add the three private Vercel environment variables first.',setup:true});
  if(req.method!=='GET'&&!checkOrigin(req))return json(res,403,{error:'Origin not allowed'});
  try {
    if(req.method==='POST'&&action==='login'){
      const data=await bodyJson(req);
      const password=typeof data.password==='string'?data.password:'';
      if(password.length>256||!equals(password,process.env.REGISTRY_ADMIN_PASSWORD))return json(res,401,{error:'Incorrect password'});
      const session=setSession(req,res);
      return json(res,200,{ok:true,csrf:session.csrf,day:session.day,rememberedDevice:true});
    }
    if(req.method==='GET'&&action==='session'){
      const sessionToken=token(req);
      return json(res,200,sessionToken?{authenticated:true,csrf:csrf(sessionToken),day:pacificDay(),rememberedDevice:true}:{authenticated:false,rememberedDevice:Boolean(device(req)),day:pacificDay()});
    }
    if(req.method==='POST'&&action==='logout'){
      if(!authenticated(req))return json(res,401,{error:'Please sign in again'});
      clearSession(res);return json(res,200,{ok:true});
    }
    if(!authenticated(req))return json(res,401,{error:'Your daily session has ended. Enter the password again to continue.',reauthRequired:true,rememberedDevice:Boolean(device(req))});
    if(req.method==='GET'&&action==='registry'){
      const {registry,sha}=await readRegistry();
      return json(res,200,{registry,sha});
    }
    if(req.method==='PUT'&&action==='registry'){
      const incoming=await bodyJson(req);
      if(typeof incoming.sha!=='string'||!/^[0-9a-f]{40}$/.test(incoming.sha))return json(res,400,{error:'Missing revision'});
      const {registry,sha}=await readRegistry();
      if(incoming.sha!==sha)return json(res,409,{error:'Someone changed the list since you opened it. Refresh and review their changes before saving.'});
      const updated=validateIncoming(incoming,registry);
      await github('PUT',{message:'Update gift registry via private website manager',sha,branch:BRANCH,content:Buffer.from(JSON.stringify(updated,null,2)+'\n').toString('base64')});
      return json(res,200,{ok:true,message:'Saved. Vercel will publish the new gift list automatically.'});
    }
    return json(res,404,{error:'Not found'});
  }catch(err){
    console.error('Registry management request failed:',err.status||500,err.message);
    return json(res,err.status||500,{error:err.status?err.message:'Unable to complete the request. Please try again.'});
  }
};
