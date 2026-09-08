import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,ranking,validateEntry,makeCsv,seedEntries,ledger,periodLedger} from '../lib/model.ts';
test('historical totals exclude refunded records and units',()=>{
 const rows=[{gross:10000,refund:0,units:2,category:'Linha A'},{gross:20000,refund:20000,units:4,category:'Linha A'},{gross:30000,refund:0,units:3,category:'Linha B'}];
 assert.deepEqual(summarize(rows),{gross:60000,refunds:20000,net:40000,count:3,validCount:2,ticket:20000,units:5});
 assert.equal(ranking(rows)[0].name,'Linha B');assert.equal(ranking(rows)[1].units,2);
});
test('empty period remains finite',()=>{assert.equal(summarize([]).ticket,0);assert.equal(summarize([]).net,0);});
test('all 90 demo records reconcile across months',()=>{
 assert.equal(ledger.length,90);const months=['04','05','06','07','08','09'].map(m=>periodLedger('2026-'+m));assert.equal(months.flat().length,90);assert.equal(months.map(r=>summarize(r).net).reduce((a,b)=>a+b,0),summarize(ledger).net);
});
test('CSV preserves accents and quotes while neutralizing formulas',()=>{
 const result=makeCsv([['São Paulo','a"b','=1+1',' @SUM(1)','normal']]);assert.equal(result,'\uFEFF"São Paulo";"a""b";"\'=1+1";"\' @SUM(1)";"normal"');
});
test('seed contacts and editable records pass validation',()=>{for(const e of seedEntries)assert.doesNotThrow(()=>validateEntry(e.kind,e.data));});
test('invalid dates, malformed email, unknown fields and workflow states rejected',()=>{
 const task=seedEntries.find(e=>e.kind==='task').data,contact=seedEntries.find(e=>e.kind==='contact').data;
 assert.throws(()=>validateEntry('task',{...task,due:'2026-02-31'}));assert.throws(()=>validateEntry('task',{...task,time:'25:00'}));assert.throws(()=>validateEntry('task',{...task,status:'Wrong'}));assert.throws(()=>validateEntry('contact',{...contact,email:'invalid'}));assert.throws(()=>validateEntry('contact',{...contact,isAdmin:'true'}));assert.throws(()=>validateEntry('payment',{}));
});
