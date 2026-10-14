import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

const tmp = await mkdtemp(tmpdir()+'/tn-sync-')
const socket = createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const endpoint='http://127.0.0.1:'+port
let proc
let storage = new Map()
if (!globalThis.crypto) Object.defineProperty(globalThis,"crypto",{value:webcrypto})
globalThis.localStorage={getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
globalThis.FileReader=class { async readAsDataURL(blob) { this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;this.onload?.();this.onloadend?.() } }
async function start() {
  proc=spawn('python3',['server/app.py'],{env:{...process.env,NOTE_DATA_DIR:tmp+'/data',NOTE_PORT:String(port)},stdio:'ignore'})
  for(let i=0;i<100;i++) { try { if((await fetch(endpoint+'/health')).ok)return } catch {} await new Promise(r=>setTimeout(r,30)) }
  throw new Error('API startup failed')
}
async function stop() { const p=proc;await new Promise(r=>{p.once('exit',r);p.kill()}) }
let seq=0
async function device(previous) {
  const db=previous?.db ?? new Map(), saved=previous?.storage ?? new Map()
  globalThis.__testDb={
    getAllMetadata:async()=>[...db.values()].map(n=>({id:n.id})),getNotebook:async id=>db.get(id),hydrateNotebook:async n=>n,
    saveNotebook:async n=>db.set(n.id,n),deleteNotebook:async id=>db.delete(id),
  }
  const file=tmp+'/cloud-'+seq+++'.mjs'
  await build({entryPoints:['src/lib/cloud.ts'],outfile:file,bundle:true,format:'esm',platform:'node',define:{'import.meta.env.VITE_NOTE_API_URL':JSON.stringify(endpoint)},plugins:[{name:'storage',setup(b){b.onResolve({filter:/fileStorage$/},()=>({path:'mock',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const fileDb = globalThis.__testDb',loader:'js'}))}}]})
  storage=saved
  const cloud=await import(file)
  return {db,storage:saved,cloud, async run(fn) { storage=saved;return fn(cloud) }}
}
const nb={id:'note-test',title:'実験ノート',createdAt:'2026-10-14',currentPage:1,pages:[{pageNumber:1,content:'本文A',lastModified:'2026-10-14',attachments:[{id:'image',type:'image',data:new Blob(['image bytes'],{type:'image/png'}),mimeType:'image/png',createdAt:'2026-10-14'},{id:'gps',type:'location',data:{latitude:35.7},createdAt:'2026-10-14'}]}]}
try {
  await start()
  const a=await device();a.db.set(nb.id,structuredClone(nb))
  await a.run(c=>c.cloudLogin('testuser','test-password-123',true))
  await a.run(c=>c.syncCloud())
  const b=await device();await b.run(c=>c.cloudLogin('testuser','test-password-123'))
  await b.run(c=>c.syncCloud())
  assert.equal(b.db.get(nb.id).pages[0].content,'本文A')
  assert.equal(await b.db.get(nb.id).pages[0].attachments[0].data.text(),'image bytes')
  assert.equal(b.db.get(nb.id).pages[0].attachments[1].data.latitude,35.7)
  // A server outage must retain the complete local edit and retry it after restart.
  await stop();a.db.get(nb.id).pages[0].content='offline edit'
  await assert.rejects(a.run(c=>c.syncCloud()))
  assert.equal(a.db.get(nb.id).pages[0].content,'offline edit')
  await start();await a.run(c=>c.syncCloud());await b.run(c=>c.syncCloud())
  assert.equal(b.db.get(nb.id).pages[0].content,'offline edit')
  // Concurrent edits retain both versions, including binary attachments.
  a.db.get(nb.id).pages[0].content='A concurrent'
  b.db.get(nb.id).pages[0].content='B concurrent'
  await b.run(c=>c.syncCloud());await a.run(c=>c.syncCloud())
  assert.equal(a.db.get(nb.id).pages[0].content,'B concurrent')
  assert.ok([...a.db.values()].some(n=>n.title.endsWith('（競合コピー）') && n.pages[0].content==='A concurrent'))
  await b.run(c=>c.syncCloud());assert.equal(b.db.size,2)
  // An ordinary delete propagates; it does not resurrect on the next sync.
  await a.run(c=>c.recordLocalDeletion(nb.id));a.db.delete(nb.id)
  await a.run(c=>c.syncCloud());await b.run(c=>c.syncCloud())
  assert.equal(b.db.has(nb.id),false)
  // Account ownership stays isolated when a second account uses the same device.
  await a.run(c=>c.cloudLogout());await a.run(c=>c.cloudLogin('anotheruser','test-password-456',true));await a.run(c=>c.syncCloud())
  const c=await device();await c.run(x=>x.cloudLogin('anotheruser','test-password-456'));await c.run(x=>x.syncCloud());assert.equal(c.db.size,0)
  console.log('PASS: image/GPS restoration, offline retry, restart durability, concurrent edit copies, deletion propagation, account isolation')
} finally { if(proc?.exitCode===null)await stop();await rm(tmp,{recursive:true,force:true}) }
