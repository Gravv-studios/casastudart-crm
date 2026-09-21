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
