import { Activity, Entry, Kind, seedEntries, validateEntry } from './model';

const ENTRIES_KEY='crm-hugo-entries-v1';
const ACTIVITY_KEY='crm-hugo-activity-v1';
type Body={id?:string;updatedAt?:string;kind?:Kind;data?:Record<string,string>};

function read<T>(key:string,fallback:T):T {try{const value=localStorage.getItem(key);return value?JSON.parse(value) as T:fallback;}catch{return fallback;}}
function write(entries:Entry[],activity:Activity[]){localStorage.setItem(ENTRIES_KEY,JSON.stringify(entries));localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity.slice(0,200)));}
export function loadLocalCrm(){
 const entries=read<Entry[]>(ENTRIES_KEY,seedEntries);
 const activity=read<Activity[]>(ACTIVITY_KEY,[{id:'local-init',entity_id:'local',action:'CRM preparado',label:'Dados iniciais carregados neste navegador.',created_at:new Date().toISOString()}]);
 if(!localStorage.getItem(ENTRIES_KEY))write(entries,activity);
 return {entries,activity};
}
export function mutateLocalCrm(method:string,body:Body){
 let {entries,activity}=loadLocalCrm();const stamp=new Date().toISOString();let entry:Entry|undefined;
 if(method!=='POST'){
  entry=entries.find(item=>item.id===body.id);
  if(!entry)throw new Error('Registro não encontrado.');
  if(entry.updatedAt!==body.updatedAt)throw new Error('Este registro foi alterado. Atualize o painel antes de salvar novamente.');
 }
 if(method==='DELETE'){
  if(entry!.kind==='contact'&&entries.some(item=>item.kind==='ticket'&&item.data.contactId===entry!.id))throw new Error('Este contato possui atendimentos. Arquive-o para preservar o histórico.');
  entries=entries.filter(item=>item.id!==entry!.id&&!(item.kind==='note'&&item.data.contactId===entry!.id));
  activity=[event(entry!.id,'Registro removido',entry!.data.name||entry!.data.title||'Anotação',stamp),...activity];write(entries,activity);return;
 }
 const kind=entry?.kind??body.kind;if(!kind)throw new Error('Tipo de registro inválido.');
 const data=validateEntry(kind,body.data);
 if(data.contactId&&!entries.some(item=>item.kind==='contact'&&item.id===data.contactId))throw new Error('Contato vinculado não encontrado.');
 if(kind==='contact'&&entries.some(item=>item.kind==='contact'&&item.id!==entry?.id&&item.data.email.toLowerCase()===data.email.toLowerCase()))throw new Error('Já existe um contato com este e-mail.');
 const saved:Entry={id:entry?.id??crypto.randomUUID(),kind,updatedAt:stamp,data};
 entries=entry?entries.map(item=>item.id===entry!.id?saved:item):[saved,...entries];
 activity=[event(saved.id,entry?'Registro atualizado':'Registro criado',data.name||data.title||'Anotação no contato',stamp),...activity];write(entries,activity);
}
function event(entity_id:string,action:string,label:string,created_at:string):Activity{return {id:crypto.randomUUID(),entity_id,action,label,created_at};}

export type ImportResult={created:number;updated:number;removedDemo:number;errors:{row:number;name:string;error:string}[]};
const DEMO_IDS=new Set(seedEntries.map(entry=>entry.id));
/** Importa contatos (arquivo gerado a partir da revisão Wix + WooCommerce). Grava só neste navegador. */
export function importLocalContacts(payload:unknown,removeDemo:boolean):ImportResult{
 if(!payload||typeof payload!=='object'||(payload as {format?:string}).format!=='casa-studart-contatos-v1'||!Array.isArray((payload as {contacts?:unknown}).contacts))throw new Error('Arquivo não reconhecido. Use o arquivo de importação gerado para a Casa Studart.');
 let {entries,activity}=loadLocalCrm();const stamp=new Date().toISOString();const result:ImportResult={created:0,updated:0,removedDemo:0,errors:[]};
 if(removeDemo){const before=entries.length;entries=entries.filter(entry=>!DEMO_IDS.has(entry.id)&&!(entry.kind==='contact'&&/@example\.com$/i.test(entry.data.email||'')));result.removedDemo=before-entries.length;}
 const byEmail=new Map(entries.filter(entry=>entry.kind==='contact').map(entry=>[entry.data.email.toLowerCase(),entry]));
 const list=(payload as {contacts:unknown[]}).contacts;
 list.forEach((raw,index)=>{
  const name=raw&&typeof raw==='object'?String((raw as Record<string,unknown>).name??''):'';
  try{
   const data=validateEntry('contact',raw);const existing=byEmail.get(data.email.toLowerCase());
   if(existing){const merged:Entry={...existing,updatedAt:stamp,data:mergeImported(existing.data,data)};entries=entries.map(entry=>entry.id===existing.id?merged:entry);byEmail.set(data.email.toLowerCase(),merged);result.updated++;}
   else{const saved:Entry={id:crypto.randomUUID(),kind:'contact',updatedAt:stamp,data};entries.push(saved);byEmail.set(data.email.toLowerCase(),saved);result.created++;}
  }catch(e){result.errors.push({row:index+1,name,error:e instanceof Error?e.message:'Erro'});}
 });
 activity=[event('import','Base de clientes importada',`${result.created} novos, ${result.updated} atualizados${result.removedDemo?`, ${result.removedDemo} registros de demonstração removidos`:''}`,stamp),...activity];
 write(entries,activity);return result;
}

/** Reimportação: atualiza dados de cadastro vindos das bases, mas mantém o que foi editado no CRM
 * (gênero preenchido, situação, responsável, tipo, empresa) e junta as observações. */
export function mergeImported(current:Record<string,string>,incoming:Record<string,string>):Record<string,string>{
 const kept:Record<string,string>={};
 for(const key of ['status','owner','type','company','created'])if(current[key])kept[key]=current[key];
 if(current.gender&&current.gender!=='Não informado')kept.gender=current.gender;
 if(current.state&&!incoming.state)kept.state=current.state;
 if(current.phone&&!incoming.phone)kept.phone=current.phone;
 const notes=[current.notes,incoming.notes].filter(Boolean).flatMap(n=>n.split('\n')).filter((v,i,a)=>v&&a.indexOf(v)===i).join('\n');
 return {...current,...incoming,...kept,...(notes?{notes}:{})};
}
