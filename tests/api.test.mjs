import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:8911';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'API tests must run on a local demo only.');
async function req(method,body,extra={}){const config={method,headers:{'Content-Type':'application/json',...extra}};if(method!=='GET'&&body)config.body=JSON.stringify(body);const res=await fetch(base+'/api/crm',config);const text=await res.text();let parsed;try{parsed=JSON.parse(text);}catch{parsed={error:text};}return {status:res.status,body:parsed};}
let created;
try{
 const initial=await req('GET');assert.equal(initial.status,200);const count=initial.body.entries.length;
 const invalid=await req('POST',{kind:'contact',data:{name:'Invalid'}});assert.equal(invalid.status,400);
 const csrf=await req('POST',{kind:'contact',data:{}},{Origin:'https://example.invalid'});assert.equal(csrf.status,403);
 const data={name:'Verificação temporária',email:'verification-'+Date.now()+'@example.com',type:'Contato',owner:'Hugo',status:'Ativo',source:'Site',city:'Cidade fictícia',notes:'Verificação automática; será removida.'};
 const inserted=await req('POST',{kind:'contact',data});assert.equal(inserted.status,201);created=inserted.body.id;
 const after=await req('GET');assert.equal(after.body.entries.length,count+1);const entry=after.body.entries.find(e=>e.id===created);assert.equal(entry.data.name,data.name);
 assert.equal((await req('POST',{kind:'contact',data})).status,409);
 const updated=await req('PUT',{id:entry.id,updatedAt:entry.updatedAt,data:{...entry.data,city:'Cidade atualizada'}});assert.equal(updated.status,200);
 assert.equal((await req('PUT',{id:entry.id,updatedAt:entry.updatedAt,data:entry.data})).status,409);
 const saved=(await req('GET')).body.entries.find(e=>e.id===created);assert.equal(saved.data.city,'Cidade atualizada');
 assert.equal((await req('POST',{kind:'note',data:{contactId:created,text:'Anotação de verificação',author:'Hugo'}})).status,201);
 assert.equal((await req('DELETE',{id:created,updatedAt:saved.updatedAt})).status,200);created=undefined;
 const final=await req('GET');assert.equal(final.body.entries.length,count);assert.ok(final.body.activity.some(a=>a.action==='Registro removido'));
 console.log('API passed: persistence, validation, duplicate detection, conflict prevention, origin rejection, linked-note cleanup and audit history.');
}finally{if(created){const latest=(await req('GET')).body.entries.find(e=>e.id===created);if(latest)await req('DELETE',{id:created,updatedAt:latest.updatedAt});}}
