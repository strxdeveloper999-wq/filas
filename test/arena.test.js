import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, Serial, ranking, today } from '../src/store.js';
import { Arena } from '../src/arena.js';
import { commands } from '../src/commands.js';
const uid = n => String(100000000000000000n + BigInt(n));
function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arena-test-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(path.join(dir,'state.json')); let n=100;
  const channels=new Map(); const sent=[];
  const room = type => { const c={id:uid(n++),type,send:async p=>{sent.push(p); return {id:uid(n++)};},delete:async()=>{channels.delete(c.id);},isThread:()=>type===12,setLocked:async()=>{},setArchived:async()=>{},members:{add:async()=>{}},permissionOverwrites:{edit:async()=>{}},messages:{edit:async()=>{}}}; channels.set(c.id,c); return c; };
  const publicRoom=room(0);
  publicRoom.threads={create:async()=>room(12)};
  const guild={id:uid(1),members:{fetch:async id=>({user:{bot:false},permissions:{has:()=>id===uid(2)},roles:{cache:{has:()=>false}}})},channels:{fetch:async id=>channels.get(id),create:async p=>room(p.type)},roles:{fetch:async()=>({})}};
  const client={user:{id:uid(3)},guilds:{cache:new Map([[guild.id,guild]])},users:{fetch:async()=>({send:async()=>{}})}};
  const arena=new Arena(client,store,guild.id); arena.data.config.calls=true;
  return {arena,store,channelId:publicRoom.id,guild,channels,sent};
}
async function queue(a,channelId,size=1,valor=10) { await a.createQueue({name:'Teste',size,mode:'Normal',game:'Free Fire',valor,channelId}); return Object.values(a.data.queues).at(-1); }
async function mediatorReady(a,id=uid(2)) { await a.pixSet(id,'cpf','11111111111'); await a.mediator('enter',id); }
test('JSON persists and rejects corrupt data rather than overwriting it', t=>{
  const {store}=setup(t);store.guild('g').blacklist.x='teste';store.save();assert.equal(new Store(store.file).guild('g').blacklist.x,'teste');fs.writeFileSync(store.file,'bad');assert.throws(()=>new Store(store.file));
});
test('serial execution recovers after a failed operation',async()=>{
  const s=new Serial(),v=[];
  const a=s.run('g',async()=>{await Promise.resolve();v.push(1);throw Error('x');});
  const b=s.run('g',async()=>{v.push(2);});await Promise.allSettled([a,b]);assert.deepEqual(v,[1,2]);
});
test('slash schemas are valid and unique',()=>{assert.equal(new Set(commands.map(c=>c.name)).size,commands.length);for(const c of commands){assert.ok(c.description.length<=100);assert.ok((c.options||[]).length<=25);}});
test('queue refuses duplicate entries and entries in another queue',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId),q2=await queue(a,channelId);
  await a.join(q.id,uid(10));await assert.rejects(()=>a.join(q.id,uid(10)),/já está/);await assert.rejects(()=>a.join(q2.id,uid(10)),/outra fila/);assert.deepEqual(q.users,[uid(10)]);
});
test('blocked user cannot join and is removed from waiting queue',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId); await a.join(q.id,uid(10));await a.blacklist({userId:uid(10),block:true,reason:'teste'});assert.equal(q.users.length,0);await assert.rejects(()=>a.join(q.id,uid(10)),/impedido/);
});
test('queue price must be a positive number and is stored in cents',async t=>{
  const {arena:a,channelId}=setup(t);
  await assert.rejects(()=>a.createQueue({name:'X',size:1,mode:'Normal',valor:0,channelId}),/Valor inválido/);
  await a.createQueue({name:'Y',size:1,mode:'Normal',valor:'12,90',channelId});
  const q=Object.values(a.data.queues).at(-1);
  assert.equal(q.priceCents,1290);
});
test('Pix key validation rejects malformed keys per type',async t=>{
  const {arena:a}=setup(t);
  await assert.rejects(()=>a.pixSet(uid(2),'cpf','123'),/CPF/);
  await assert.rejects(()=>a.pixSet(uid(2),'email','not-an-email'),/E-mail/);
  await a.pixSet(uid(2),'aleatoria','123e4567-e89b-12d3-a456-426614174000');
  assert.equal(a.data.pixKeys[uid(2)].tipo,'aleatoria');
});
test('mediator needs a registered Pix key before becoming available',async t=>{
  const {arena:a}=setup(t);
  await assert.rejects(()=>a.mediator('enter',uid(2)),/chave Pix/);
  await a.pixSet(uid(2),'cpf','111.222.333-44');
  await a.mediator('enter',uid(2));
  assert.deepEqual(a.data.mediators,[uid(2)]);
});
test('removing a Pix key drops the mediator from availability',async t=>{
  const {arena:a}=setup(t);
  await mediatorReady(a);
  await a.pixRemove(uid(2));
  assert.deepEqual(a.data.mediators,[]);
  await assert.rejects(()=>a.mediator('enter',uid(2)),/chave Pix/);
});
test('full queue waits for mediator and then creates exactly one match',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId);await a.join(q.id,uid(10));await a.join(q.id,uid(11));assert.equal(Object.keys(a.data.matches).length,0);await mediatorReady(a);await a.tick();await a.tick();
  const matches=Object.values(a.data.matches);assert.equal(matches.length,1);assert.equal(matches[0].status,'active');assert.equal(q.users.length,0);assert.equal(matches[0].teams.flat().length,2);assert.ok(matches[0].voiceId);
});
test('match room shows the mediator Pix key and price, gated behind a confirmation button',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId,1,25.5);
  await a.pixSet(uid(2),'email','mediador@example.com');await a.mediator('enter',uid(2));
  await a.join(q.id,uid(10));await a.join(q.id,uid(11));
  const m=Object.values(a.data.matches)[0];
  assert.equal(m.priceCents,2550);
  assert.equal(m.pix.chave,'mediador@example.com');
  assert.equal(m.paymentConfirmed,false);
  await assert.rejects(()=>a.confirmPayment(m.id,uid(10)),/Somente o mediador/);
  await assert.rejects(()=>a.finish(m.id,'0',uid(2)),/pagamento/i);
  await a.confirmPayment(m.id,uid(2));
  await assert.rejects(()=>a.confirmPayment(m.id,uid(2)),/já confirmado/);
  await a.finish(m.id,'0',uid(2));
});
test('cancelling a match does not require payment confirmation',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId);
  await mediatorReady(a);await a.join(q.id,uid(10));await a.join(q.id,uid(11));
  const m=Object.values(a.data.matches)[0];
  await a.finish(m.id,'cancel',uid(2));
  assert.equal(m.status,'cancelled');
});
test('only mediator or admin can finish; repeated result does not award again',async t=>{
  const {arena:a,channelId}=setup(t),q=await queue(a,channelId);await mediatorReady(a);await a.join(q.id,uid(10));await a.join(q.id,uid(11));const m=Object.values(a.data.matches)[0];
  await assert.rejects(()=>a.finish(m.id,'0',uid(10)),/Somente/);await a.confirmPayment(m.id,uid(2));await a.finish(m.id,'0',uid(2));await assert.rejects(()=>a.finish(m.id,'0',uid(2)),/ativa/);const ranks=ranking(a.data);assert.deepEqual(ranks.map(r=>r.points).sort(),[1,3]);assert.equal(ranking(a.data,'diario').length,2);assert.equal(ranking(a.data,'mediador')[0].games,1);
});
test('failed room creation retains queue and can retry',async t=>{
  const {arena:a,channelId,guild}=setup(t),q=await queue(a,channelId);await mediatorReady(a);const create=guild.channels.create;guild.channels.create=async()=>{throw Error('permissions');};await a.join(q.id,uid(10));await assert.rejects(()=>a.join(q.id,uid(11)),/Falha/);assert.equal(q.users.length,2);assert.equal(Object.values(a.data.matches)[0].status,'cancelled');guild.channels.create=create;await a.tick();assert.equal(Object.values(a.data.matches).filter(m=>m.status==='active').length,1);
});
test('influencer slot forms 2x2 with three entrants and reserved player',async t=>{
  const {arena:a,channelId}=setup(t);await a.createQueue({name:'Influencer',size:2,mode:'Misto',valor:10,channelId,influencer:uid(20)});const q=Object.values(a.data.queues)[0];await mediatorReady(a);for(const id of [uid(10),uid(11),uid(12)])await a.join(q.id,id);const m=Object.values(a.data.matches)[0];assert.equal(m.teams[0].length,2);assert.equal(m.teams[1].length,2);assert.ok(m.teams.flat().includes(uid(20)));
});
test('private thread path creates a match',async t=>{const {arena:a,channelId,channels}=setup(t);a.data.config.roomType='thread';const q=await queue(a,channelId);await mediatorReady(a);await a.join(q.id,uid(10));await a.join(q.id,uid(11));const m=Object.values(a.data.matches)[0];assert.equal(channels.get(m.channelId).type,12);});
test('ticket privacy checks and one ticket per user',async t=>{
  const {arena:a}=setup(t);await a.openTicket(uid(10));await assert.rejects(()=>a.openTicket(uid(10)),/já tem/);const ticket=Object.values(a.data.tickets)[0];await assert.rejects(()=>a.closeTicket(ticket.id,uid(11)),/Sem permissão/);await a.closeTicket(ticket.id,uid(10));assert.equal(ticket.status,'closed');
});
test('auto messages validate interval and do not catch up in a burst',async t=>{
  const {arena:a,channelId,sent}=setup(t);await assert.rejects(()=>a.auto({action:'create',minutes:1,text:'oi',channelId}),/intervalo/);await a.auto({action:'create',minutes:5,text:'Bem-vindo',channelId});const task=Object.values(a.data.autos)[0];task.nextAt=0;await a.tick();await a.tick();assert.equal(sent.length,1);assert.ok(task.nextAt>Date.now());assert.deepEqual(sent[0].allowedMentions,{parse:[]});
});
test('restart cancels partially created match without points',async t=>{const {arena:a,channelId}=setup(t);const q=await queue(a,channelId);q.users=[uid(10)];a.data.matches.x={id:'x',status:'creating',teams:[[uid(10)],[uid(11)]],channelId:'',voiceId:''};await a.recover();assert.equal(a.data.matches.x.status,'cancelled');assert.deepEqual(q.users,[uid(10)]);assert.equal(ranking(a.data).length,0);});
test('daily ranking excludes past days and cancelled matches',()=>{const g={matches:{a:{status:'finished',day:'2001-01-01',teams:[['a'],['b']],winner:0},b:{status:'cancelled',day:today(),teams:[['a'],['b']]}}};assert.equal(ranking(g,'diario').length,0);assert.equal(ranking(g).length,2);});
                                  
