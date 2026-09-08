import { getDb } from '@/db';
import { seedEntries, validateEntry } from '@/lib/model';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
type Row={id:string;kind:string;payload:string;updated_at:string};
async function initialize() {
 const db=getDb();
 if(await db.prepare("SELECT id FROM records WHERE id = ?").bind('_initialized').first())return;
 const stamp=new Date().toISOString();
 await db.batch([
  ...seedEntries.map(e=>db.prepare('INSERT OR IGNORE INTO records (id,kind,payload,updated_at) VALUES (?,?,?,?)').bind(e.id,e.kind,JSON.stringify(e.data),e.updatedAt)),
  db.prepare('INSERT OR IGNORE INTO records (id,kind,payload,updated_at) VALUES (?,?,?,?)').bind('_initialized','meta','{}',stamp),
  db.prepare('INSERT OR IGNORE INTO activity (id,entity_id,action,label,created_at) VALUES (?,?,?,?,?)').bind('init','_initialized','Demonstração preparada','Cadastros fictícios carregados para apresentação.',stamp)
 ]);
}
export async function GET() {
 try{await initialize();const db=getDb();const [r,a]=await db.batch([db.prepare("SELECT id,kind,payload,updated_at FROM records WHERE kind IN ('contact','ticket','task','note') ORDER BY updated_at DESC"),db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 200')]);
 return json({entries:(r.results as Row[]).map(row=>({id:row.id,kind:row.kind,data:JSON.parse(row.payload),updatedAt:row.updated_at})),activity:a.results});
 }catch{return json({error:'Não foi possível carregar o banco de demonstração. Tente novamente.'},503);}
}
async function mutation(request:Request,method:string){
 try{
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não permitida.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Formato de solicitação inválido.'},415);
  const text=await request.text();if(text.length>24000)return json({error:'Registro muito extenso.'},413);
  let body;try{body=JSON.parse(text);}catch{return json({error:'Conteúdo inválido.'},400);}
  if(!body||typeof body!=='object')return json({error:'Conteúdo inválido.'},400);
  const db=getDb();let existing:Row|null=null;
  if(method!=='POST'){
    if(typeof body.id!=='string'||body.id.startsWith('_'))return json({error:'Registro inválido.'},400);
    existing=await db.prepare('SELECT * FROM records WHERE id = ?').bind(body.id).first<Row>();
    if(!existing)return json({error:'Registro não encontrado.'},404);
    if(existing.updated_at!==body.updatedAt)return json({error:'Este registro foi alterado. Atualize o painel antes de salvar novamente.'},409);
  }
  const stamp=new Date().toISOString(),eventId=crypto.randomUUID();
  if(method==='DELETE'){
    if(existing!.kind==='contact'){
      const linked=await db.prepare("SELECT id FROM records WHERE kind='ticket' AND json_extract(payload,'$.contactId') = ? LIMIT 1").bind(body.id).first();
      if(linked)return json({error:'Este contato possui atendimentos. Altere a situação para Arquivado para preservar o histórico.'},409);
    }
    const label=JSON.parse(existing!.payload).name||JSON.parse(existing!.payload).title||'Anotação';
    const result=await db.batch([
      db.prepare('INSERT INTO activity(id,entity_id,action,label,created_at) SELECT ?,id,?,?,? FROM records WHERE id=? AND updated_at=?').bind(eventId,'Registro removido',label,stamp,body.id,body.updatedAt),
      db.prepare("DELETE FROM records WHERE kind='note' AND json_extract(payload,'$.contactId')=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND updated_at=?)").bind(body.id,body.id,body.updatedAt),
      db.prepare('DELETE FROM records WHERE id=? AND updated_at=?').bind(body.id,body.updatedAt)
    ]);
    if(!result[2].meta.changes)return json({error:'O registro mudou. Atualize o painel.'},409);
    return json({ok:true});
  }
  const kind=existing?.kind??body.kind;let data;
  try{data=validateEntry(kind,body.data);}catch(error){return json({error:error instanceof Error?error.message:'Campos inválidos.'},400);}
  if(data.contactId&&!await db.prepare("SELECT id FROM records WHERE kind='contact' AND id=?").bind(data.contactId).first())return json({error:'Contato vinculado não encontrado.'},400);
  if(kind==='contact'){
    const duplicate=await db.prepare("SELECT id FROM records WHERE kind='contact' AND lower(json_extract(payload,'$.email'))=lower(?) AND id<>? LIMIT 1").bind(data.email,body.id??'').first();
    if(duplicate)return json({error:'Já existe um contato com este e-mail.'},409);
  }
  const id=existing?.id??crypto.randomUUID(),label=data.name||data.title||'Anotação no contato';
  const result=await db.batch([
    existing?db.prepare('UPDATE records SET payload=?,updated_at=? WHERE id=? AND updated_at=?').bind(JSON.stringify(data),stamp,id,body.updatedAt):db.prepare('INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?)').bind(id,kind,JSON.stringify(data),stamp),
    db.prepare('INSERT INTO activity(id,entity_id,action,label,created_at) SELECT ?,id,?,?,? FROM records WHERE id=? AND updated_at=?').bind(eventId,existing?'Registro atualizado':'Registro criado',label,stamp,id,stamp)
  ]);
  if(!result[0].meta.changes)return json({error:'O registro mudou. Atualize o painel.'},409);
  return json({ok:true,id},existing?200:201);
 }catch{return json({error:'Não foi possível salvar. Seus dados anteriores foram preservados.'},500);}
}
export const POST=(request:Request)=>mutation(request,'POST');
export const PUT=(request:Request)=>mutation(request,'PUT');
export const DELETE=(request:Request)=>mutation(request,'DELETE');
