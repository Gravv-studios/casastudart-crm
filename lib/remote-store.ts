import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Activity, Entry, Kind, validateEntry } from './model';
import { ImportResult, mergeImported } from './client-store';

type Body={id?:string;updatedAt?:string;kind?:Kind;data?:Record<string,string>};
type Row={id:string;kind:Kind;data:Record<string,string>;updated_at:string};

const env=(import.meta as unknown as {env?:Record<string,string|undefined>}).env??{};
const URL_=env.VITE_SUPABASE_URL, KEY=env.VITE_SUPABASE_ANON_KEY;
let client:SupabaseClient|null=null;

/** Modo banco: ligado quando a Vercel tem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. */
export function remoteEnabled(){return Boolean(URL_&&KEY);}
export function supabase(){if(!remoteEnabled())throw new Error('Banco não configurado.');client??=createClient(URL_!,KEY!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client;}

const toEntry=(r:Row):Entry=>({id:r.id,kind:r.kind,updatedAt:r.updated_at,data:r.data??{}});
function fail(error:{message:string;code?:string}|null):never|void{
 if(!error)return;
 if(error.code==='23505')throw new Error('Já existe um contato com este e-mail.');
 if(error.code==='42501')throw new Error('Seu usuário não tem permissão para esta ação.');
 throw new Error(error.message||'Não foi possível falar com o banco.');
}

export async function isMember(){const sb=supabase();const {data:{user}}=await sb.auth.getUser();if(!user?.email)return false;const {data,error}=await sb.from('crm_members').select('email').eq('email',user.email.toLowerCase()).maybeSingle();fail(error);return Boolean(data);}

export async function loadRemoteCrm(){
 const sb=supabase();const entries:Entry[]=[];const page=1000;
 for(let from=0;;from+=page){const {data,error}=await sb.from('crm_entries').select('id,kind,data,updated_at').order('created_at',{ascending:false}).range(from,from+page-1);fail(error);entries.push(...(data as Row[]).map(toEntry));if(!data||data.length<page)break;}
 const {data:act,error}=await sb.from('crm_activity').select('id,entity_id,action,label,created_at').order('created_at',{ascending:false}).limit(200);fail(error);
 return {entries,activity:(act??[]) as Activity[]};
}

async function log(entity_id:string,action:string,label:string){const {error}=await supabase().from('crm_activity').insert({entity_id,action,label});fail(error);}

export async function mutateRemoteCrm(method:string,body:Body){
 const sb=supabase();
 if(method==='DELETE'){
  const {data:row,error}=await sb.from('crm_entries').select('id,kind,data,updated_at').eq('id',body.id!).maybeSingle();fail(error);
  if(!row)throw new Error('Registro não encontrado.');const entry=toEntry(row as Row);
  if(entry.updatedAt!==body.updatedAt)throw new Error('Este registro foi alterado. Atualize o painel antes de salvar novamente.');
  if(entry.kind==='contact'){const {count,error:e2}=await sb.from('crm_entries').select('id',{count:'exact',head:true}).eq('kind','ticket').eq('data->>contactId',entry.id);fail(e2);if(count)throw new Error('Este contato possui atendimentos. Arquive-o para preservar o histórico.');
   const {error:e3}=await sb.from('crm_entries').delete().eq('kind','note').eq('data->>contactId',entry.id);fail(e3);}
  const {error:e4}=await sb.from('crm_entries').delete().eq('id',entry.id);fail(e4);
  await log(entry.id,'Registro removido',entry.data.name||entry.data.title||'Anotação');return;
 }
 let current:Entry|undefined;
 if(method==='PUT'){const {data:row,error}=await sb.from('crm_entries').select('id,kind,data,updated_at').eq('id',body.id!).maybeSingle();fail(error);if(!row)throw new Error('Registro não encontrado.');current=toEntry(row as Row);}
 const kind=current?.kind??body.kind;if(!kind)throw new Error('Tipo de registro inválido.');
 const data=validateEntry(kind,body.data);
 if(data.contactId){const {count,error}=await sb.from('crm_entries').select('id',{count:'exact',head:true}).eq('kind','contact').eq('id',data.contactId);fail(error);if(!count)throw new Error('Contato vinculado não encontrado.');}
 if(current){
  const {data:rows,error}=await sb.from('crm_entries').update({data}).eq('id',current.id).eq('updated_at',body.updatedAt!).select('id');fail(error);
  if(!rows?.length)throw new Error('Este registro foi alterado. Atualize o painel antes de salvar novamente.');
  await log(current.id,'Registro atualizado',data.name||data.title||'Anotação no contato');
 }else{
  const {data:row,error}=await sb.from('crm_entries').insert({kind,data}).select('id').single();fail(error);
  await log((row as {id:string}).id,'Registro criado',data.name||data.title||'Anotação no contato');
 }
}

/** Importa a base revisada direto no banco. Atualiza por e-mail (não duplica) e preserva o que o Hugo já editou. */
export async function importRemoteContacts(payload:unknown):Promise<ImportResult>{
 if(!payload||typeof payload!=='object'||(payload as {format?:string}).format!=='casa-studart-contatos-v1'||!Array.isArray((payload as {contacts?:unknown}).contacts))throw new Error('Arquivo não reconhecido. Use o arquivo de importação gerado para a Casa Studart.');
 const sb=supabase();const {entries}=await loadRemoteCrm();
 const byEmail=new Map(entries.filter(e=>e.kind==='contact').map(e=>[e.data.email.toLowerCase(),e]));
 const result:ImportResult={created:0,updated:0,removedDemo:0,errors:[]};
 const inserts:{kind:Kind;data:Record<string,string>}[]=[];const updates:{id:string;kind:Kind;data:Record<string,string>}[]=[];const seen=new Set<string>();
 (payload as {contacts:unknown[]}).contacts.forEach((raw,index)=>{
  const name=raw&&typeof raw==='object'?String((raw as Record<string,unknown>).name??''):'';
  try{const data=validateEntry('contact',raw);const key=data.email.toLowerCase();if(seen.has(key))throw new Error('E-mail repetido no arquivo');seen.add(key);
   const existing=byEmail.get(key);
   if(existing){updates.push({id:existing.id,kind:'contact',data:mergeImported(existing.data,data)});}else inserts.push({kind:'contact',data});
  }catch(e){result.errors.push({row:index+1,name,error:e instanceof Error?e.message:'Erro'});}
 });
 for(let i=0;i<inserts.length;i+=200){const {error}=await sb.from('crm_entries').insert(inserts.slice(i,i+200));fail(error);result.created+=Math.min(200,inserts.length-i);}
 for(let i=0;i<updates.length;i+=200){const {error}=await sb.from('crm_entries').upsert(updates.slice(i,i+200),{onConflict:'id'});fail(error);result.updated+=Math.min(200,updates.length-i);}
 await log('import','Base de clientes importada',`${result.created} novos, ${result.updated} atualizados`);
 return result;
}
