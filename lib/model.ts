export type Kind = 'contact' | 'ticket' | 'task' | 'note';
export type Entry = { id: string; kind: Kind; updatedAt: string; data: Record<string,string> };
export type Activity = { id:string; entity_id:string; action:string; label:string; created_at:string };
export const OWNERS = ['Hugo', 'Marcos', 'Atendimento'];
export const SOURCES = ['Site', 'Indicação', 'Evento', 'Contato direto'];
export const STATUSES = ['Novo', 'Em andamento', 'Aguardando', 'Resolvido'];
export const TODAY = '2026-09-08';
export const CONTACT_TYPES = ['Cliente', 'Parceiro', 'Fornecedor', 'Contato'];
const names = ['Ana Monteiro', 'Rafael Borges', 'Beatriz Lima', 'Felipe Cardoso', 'Marina Costa', 'Pedro Almeida', 'Juliana Ribeiro', 'Lucas Martins', 'Clara Nunes', 'Bruno Teixeira', 'Isabela Rocha', 'Gabriel Santos'];
export const seedEntries: Entry[] = [
  ...names.map((name, i) => ({ id:`contact-${i+1}`, kind:'contact' as Kind, updatedAt: `${TODAY}T10:00:00Z`, data:{ name, email: `${name.toLowerCase().split(' ')[0]}@example.com`, phone:'', city:['Brasília, DF','Goiânia, GO','São Paulo, SP','Pirenópolis, GO'][i%4], type:CONTACT_TYPES[i%4], source:SOURCES[i%4], owner:OWNERS[i%3], status:i===8?'Arquivado':'Ativo', company:['Pessoa física','Empresa Horizonte','Estúdio Aurora','Casa Vale'][i%4], notes:'Cadastro fictício para apresentação do CRM.', created:'2026-08-'+String(i+10).padStart(2,'0') }})),
  ...[
    ['Atualização de endereço cadastral','contact-1','Novo','Normal','Hugo','2026-09-09','E-mail','Conferir os dados informados e registrar a atualização.'],
    ['Solicitação de segunda via','contact-2','Em andamento','Alta','Marcos','2026-09-08','Site','Localizar o documento solicitado no arquivo administrativo.'],
    ['Dúvida sobre dados da conta','contact-3','Aguardando','Normal','Atendimento','2026-09-10','E-mail','Aguardando confirmação das informações pelo contato.'],
    ['Revisão de cadastro de parceiro','contact-4','Novo','Baixa','Hugo','2026-09-12','Telefone','Validar razão social e responsável pelo cadastro.'],
    ['Conferência de documento fiscal','contact-5','Em andamento','Alta','Marcos','2026-09-07','E-mail','Comparar os dados do documento com o arquivo interno.'],
    ['Solicitação de privacidade','contact-6','Resolvido','Alta','Atendimento','2026-09-06','Site','Solicitação atendida. Registrar somente o necessário.'],
    ['Ajuste de telefone','contact-7','Resolvido','Baixa','Hugo','2026-09-05','Telefone','Cadastro conferido com o titular.'],
  ].map((v,i)=>({id:`ticket-${i+1}`,kind:'ticket' as Kind,updatedAt:`${TODAY}T11:00:00Z`,data:{title:v[0],contactId:v[1],status:v[2],priority:v[3],owner:v[4],due:v[5],channel:v[6],description:v[7]}})),
  ...[
    ['Conferir solicitações pendentes','2026-09-08','09:00','Hugo','Alta','Pendente','Atendimento','Revisar os atendimentos com prazo para hoje.'],
    ['Reunião de apresentação do CRM','2026-09-08','14:30','Marcos','Normal','Pendente','Reunião','Apresentar a demonstração e anotar ajustes.'],
    ['Organizar documentos de agosto','2026-09-09','10:00','Hugo','Normal','Pendente','Administrativo','Separar documentos por competência.'],
    ['Revisar cadastros duplicados','2026-09-10','11:00','Atendimento','Baixa','Pendente','Cadastro','Conferir nome e e-mail antes de unificar registros.'],
    ['Conferir relatório mensal','2026-09-07','16:00','Hugo','Alta','Pendente','Financeiro','Verificar totais e estornos do mês anterior.'],
    ['Preparar apresentação','2026-09-06','10:00','Marcos','Normal','Concluída','Reunião','Organização inicial do ambiente de demonstração.'],
  ].map((v,i)=>({id:`task-${i+1}`,kind:'task' as Kind,updatedAt:`${TODAY}T12:00:00Z`,data:{title:v[0],due:v[1],time:v[2],owner:v[3],priority:v[4],status:v[5],category:v[6],description:v[7]}})),
  {id:'note-1',kind:'note',updatedAt:`${TODAY}T13:00:00Z`,data:{contactId:'contact-1',text:'Contato pediu a revisão do endereço cadastral. Atendimento aberto para acompanhamento.',author:'Hugo'}},
];
export type Ledger = { id:string; date:string; category:string; channel:string; payment:string; gross:number; refund:number; units:number };
export const ledger: Ledger[] = Array.from({length:90},(_,i)=>{
  const month=4+Math.floor(i/15), day=month===9?(i%8)+1:(i%15)*2+1;
  const category=['Linha A','Linha B','Linha C','Linha D'][i%4];
  const gross=([250,390,540,180][i%4]+(i%7)*35)*100;
  return {id:`H-${String(i+1).padStart(4,'0')}`,date:`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,category,channel:['Site','Presencial','Parceiros'][i%3],payment:['Pix','Cartão','Transferência'][i%3],gross,refund:i%13===0?gross:0,units:(i%4)+1};
});
export const money = (cents:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function periodLedger(month:string) { return ledger.filter(row=>month==='all'||row.date.startsWith(month)); }
export function summarize(rows:Ledger[]) {
  const gross=rows.reduce((s,x)=>s+x.gross,0), refunds=rows.reduce((s,x)=>s+x.refund,0);
  const valid=rows.filter(x=>x.refund===0);
  return {gross,refunds,net:gross-refunds,count:rows.length,validCount:valid.length,ticket:valid.length?Math.round((gross-refunds)/valid.length):0,units:valid.reduce((s,x)=>s+x.units,0)};
}
export function ranking(rows:Ledger[]) {
  return ['Linha A','Linha B','Linha C','Linha D'].map(name=>({name,...summarize(rows.filter(x=>x.category===name))})).sort((a,b)=>b.net-a.net);
}
export function csvCell(value:unknown) {
  let s=typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'||typeof value==='bigint'?String(value):value===null||value===undefined?'':JSON.stringify(value)??'';
  if (/^[\s]*[=+@-]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function makeCsv(rows:unknown[][]) {return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');}
export function initials(name:string) { return name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase(); }
export function prettyDate(date:string) { return date ? new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : 'Sem prazo'; }
export function validateEntry(kind:unknown, data:unknown):Record<string,string> {
  if (!['contact','ticket','task','note'].includes(String(kind)) || !data || typeof data!=='object' || Array.isArray(data)) throw new Error('Registro inválido.');
  const allowed:Record<string,string[]>={contact:['name','email','phone','city','type','source','owner','status','company','notes','created'],ticket:['title','contactId','status','priority','owner','due','channel','description'],task:['title','due','time','owner','priority','status','category','description'],note:['contactId','text','author']};
  const d:Record<string,string>={};
  for(const [key,value] of Object.entries(data)) {if(!allowed[String(kind)].includes(key)||typeof value!=='string'||value.length>4000) throw new Error('Campo inválido.'); d[key]=value.trim();}
  const required = kind==='contact'?['name','email','type','owner','status','source']:kind==='note'?['contactId','text','author']:['title','status','owner','priority'];
  if(required.some(key=>!d[key]))throw new Error('Preencha os campos obrigatórios.');
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw new Error('Informe um e-mail válido.');
  if(d.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.due)||Number.isNaN(Date.parse(d.due))||new Date(d.due).toISOString().slice(0,10)!==d.due))throw new Error('Data inválida.');
  if(d.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))throw new Error('Horário inválido.');
  if(d.owner&&!OWNERS.includes(d.owner))throw new Error('Responsável inválido.');
  const states=kind==='contact'?['Ativo','Arquivado']:kind==='ticket'?STATUSES:kind==='task'?['Pendente','Concluída']:[];
  if(states.length&&!states.includes(d.status))throw new Error('Situação inválida.');
  if(d.priority&&!['Baixa','Normal','Alta'].includes(d.priority))throw new Error('Prioridade inválida.');
  if(kind==='contact'&&(!CONTACT_TYPES.includes(d.type)||!SOURCES.includes(d.source)))throw new Error('Tipo ou origem inválidos.');
  return d;
}
