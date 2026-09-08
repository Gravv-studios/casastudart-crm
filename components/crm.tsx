'use client';
import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, Users, Headphones, CalendarDays, CheckSquare, BarChart3, History, Settings, ChevronRight, CircleHelp, Sparkles, RefreshCw, CheckCircle2, X, Info, ArrowRight, ArrowLeft } from 'lucide-react';
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogHeader, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Entry, Kind, Activity } from '@/lib/model';
import { Choice, periodOptions } from './shared';
import Dashboard from './dashboard';
import Contacts from './contacts';
import { Tasks, Support, Calendar } from './work';
import Reports from './reports';
import Help, { ActivityLog } from './help';
import { Editor, ContactDetail, Draft } from './editor';
const nav=[['overview','Visão geral',LayoutDashboard],['contacts','Contatos',Users],['support','Atendimentos',Headphones],['tasks','Tarefas',CheckSquare],['calendar','Agenda',CalendarDays],['reports','Relatórios',BarChart3],['activity','Histórico',History],['settings','Configurações e guia',Settings]] as const;
const headings:Record<string,[string,string]>={
 overview:['Tudo começa com uma boa visão.','Acompanhe a rotina, os relacionamentos e os números da Casa.'],
 contacts:['Cada relacionamento, em um só lugar.','Cadastros, contexto e histórico de atendimento.'],
 support:['Cuidado em cada atendimento.','Acompanhe solicitações do primeiro contato à resolução.'],
 tasks:['Uma rotina bem organizada.','Defina responsáveis, acompanhe prazos e conclua tarefas.'],
 calendar:['Tempo para o que importa.','Seus compromissos e tarefas, dia a dia.'],
 reports:['Os números, com clareza.','Explore registros históricos e entenda a composição dos valores.'],
 activity:['Uma memória do trabalho.','Consulte o que foi criado, atualizado e removido.'],
 settings:['O CRM, explicado.','Conheça os recursos e prepare a apresentação ao Hugo.']
};
type Feedback={text:string;error?:boolean};
type ApiResult={error?:string;entries:Entry[];activity:Activity[]};
export default function CRM(){return <SidebarProvider style={{'--sidebar-width':'15.5rem'} as React.CSSProperties}><Workspace/></SidebarProvider>;}
function Workspace(){
 const [view,setView]=useState('overview'),[period,setPeriod]=useState('2026-09');
 const [entries,setEntries]=useState<Entry[]>([]),[activity,setActivity]=useState<Activity[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<Feedback|null>(null),[draft,setDraft]=useState<Draft|null>(null),[detailId,setDetailId]=useState<string|null>(null),[deleting,setDeleting]=useState<Entry|null>(null),[tour,setTour]=useState<number|null>(null);
 const {setOpenMobile}=useSidebar();
 const navigate=useCallback((next:string)=>{if(nav.some(n=>n[0]===next)){setView(next);window.location.hash=next;setOpenMobile(false);}},[setOpenMobile]);
 useEffect(()=>{function sync(){const value=window.location.hash.slice(1);if(nav.some(n=>n[0]===value))setView(value);}sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 useEffect(()=>{if(!feedback)return;const t=setTimeout(()=>setFeedback(null),6500);return()=>clearTimeout(t);},[feedback]);
 const reload=useCallback(async()=>{try{const res=await fetch('/api/crm',{cache:'no-store',signal:AbortSignal.timeout(20000)});const result=await res.json() as ApiResult;if(!res.ok)throw new Error(result.error);setEntries(result.entries);setActivity(result.activity);setError('');return true;}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os registros.');return false;}finally{setLoading(false);}},[]);
 useEffect(()=>{queueMicrotask(()=>{void reload();});},[reload]);
 async function send(method:string,body:unknown,success:string){if(busy)return false;setBusy(true);try{const response=await fetch('/api/crm',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result=await response.json() as ApiResult;if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');const refreshed=await reload();setFeedback({text:refreshed?success:'Alteração salva. Atualize o painel para carregar a nova versão.'});return true;}catch(e){setFeedback({text:e instanceof Error?e.message:'Não foi possível salvar.',error:true});return false;}finally{setBusy(false);}}
 const save=(entry:Entry)=>send('PUT',{id:entry.id,updatedAt:entry.updatedAt,data:entry.data},'Alteração salva.');
 const create=(kind:Kind,date?:string)=>setDraft({kind,date});
 const edit=(entry:Entry)=>{setDetailId(null);setDraft({kind:entry.kind,entry});};
 const workProps={entries,create,edit,remove:setDeleting,save,busy};
 const detail=entries.find(e=>e.id===detailId&&e.kind==='contact');
 const openTickets=entries.filter(x=>x.kind==='ticket'&&x.data.status!=='Resolvido').length;
 const steps=[['overview','Comece pelos números','Alterne o mês no alto do painel. Os valores são calculados com a base histórica fictícia.'],['contacts','Abra uma ficha','Clique em um nome para consultar o cadastro e registrar anotações. Use Novo contato para experimentar.'],['support','Acompanhe uma solicitação','Abra um cartão para editar detalhes. O seletor do cartão muda a etapa do atendimento.'],['calendar','Organize o dia','Crie uma tarefa com prazo e horário. Ela também aparecerá na área Tarefas.'],['reports','Confira os resultados','Veja a composição dos valores, compare linhas e baixe a planilha do período.']];
 return <><a className="skip-link" href="#main-content">Pular para o conteúdo</a><Sidebar className="brand-sidebar"><SidebarHeader><button className="brand-lockup" onClick={()=>navigate('overview')} aria-label="Casa Studart — visão geral"><span className="brand-mark">CS</span><span>CASA STUDART<small>GESTÃO & RELACIONAMENTO</small></span></button></SidebarHeader><SidebarContent><p className="nav-label">ESPAÇO DE TRABALHO</p><SidebarMenu>{nav.map(([id,label,Icon])=><SidebarMenuItem key={id}><SidebarMenuButton className="nav-item" isActive={view===id} onClick={()=>navigate(id)}><Icon/><span>{label}</span>{id==='support'&&openTickets>0&&<b>{openTickets}</b>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><button className="demo-card" onClick={()=>setTour(0)}><Sparkles/><strong>Conheça o seu CRM</strong><p>Um passeio de 5 passos <ArrowRight/></p></button><div className="profile"><span className="avatar">HU</span><div><strong>Hugo</strong><small>Perfil de apresentação</small></div></div></SidebarFooter></Sidebar><main className="workspace" id="main-content"><header className="topbar"><div className="breadcrumbs"><SidebarTrigger/><span>Casa Studart</span><ChevronRight/><strong>{nav.find(x=>x[0]===view)?.[1]}</strong></div><div className="top-actions"><span className="live-dot"/><span>Demonstração</span><button className="icon-button" aria-label="Atualizar registros" disabled={busy||loading} onClick={()=>void reload()}><RefreshCw/></button><button className="icon-button" aria-label="Guia do CRM" onClick={()=>setTour(0)}><CircleHelp/></button></div></header><div className="page"><div className="page-heading"><div><p className="eyebrow">CASA STUDART · PAINEL DE GESTÃO</p><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div>{['overview','reports'].includes(view)&&<Choice label="Período dos relatórios" value={period} onChange={setPeriod} options={periodOptions}/>}</div>{loading?<div className="metric-grid" aria-label="Carregando registros" aria-busy="true">{[1,2,3,4].map(i=><section key={i} className="metric"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-10 w-1/2 my-4"/><Skeleton className="h-4 w-full"/></section>)}</div>:error?<div className="error-box" role="alert"><Info style={{margin:'auto'}}/><h2>Não foi possível atualizar o painel.</h2><p>{error}</p><button className="primary-button" onClick={()=>void reload()}>Tentar novamente</button></div>:<>{view==='overview'&&<Dashboard entries={entries} period={period} setPeriod={setPeriod} navigate={navigate} edit={edit}/>}
 {view==='contacts'&&<Contacts entries={entries} create={()=>create('contact')} edit={edit} remove={setDeleting} detail={e=>setDetailId(e.id)}/>}
 {view==='support'&&<Support {...workProps}/>}
 {view==='tasks'&&<Tasks {...workProps}/>}
 {view==='calendar'&&<Calendar {...workProps}/>}
 {view==='reports'&&<Reports period={period} setPeriod={setPeriod} entries={entries}/>}
 {view==='activity'&&<ActivityLog activity={activity}/>}
 {view==='settings'&&<Help entries={entries} activity={activity} refresh={()=>void reload()} busy={busy}/>}
 </>}<footer className="page-footer"><span>CASA STUDART <b>·</b> CRM</span><span>Dados fictícios · base de referência: 08/09/2026</span><button onClick={()=>navigate('settings')}>Como usar</button></footer></div></main>
 {draft&&<Editor key={draft.entry?.id||draft.kind+(draft.date||'')} draft={draft} entries={entries} busy={busy} onClose={()=>setDraft(null)} onSave={(kind,data,entry)=>send(entry?'PUT':'POST',entry?{id:entry.id,updatedAt:entry.updatedAt,data}:{kind,data},'Registro salvo.')}/>}
 {detail&&<ContactDetail entry={detail} entries={entries} onClose={()=>setDetailId(null)} onEdit={edit} busy={busy} onNote={(contactId,text)=>send('POST',{kind:'note',data:{contactId,text,author:'Hugo'}},'Anotação adicionada.')}/>}
 <AlertDialog open={!!deleting} onOpenChange={open=>!open&&!busy&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover este registro?</AlertDialogTitle><AlertDialogDescription>{deleting?.data.name||deleting?.data.title} será removido da demonstração. Contatos com atendimentos devem ser arquivados para preservar o histórico.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="danger-button" disabled={busy} onClick={async()=>{if(deleting&&await send('DELETE',{id:deleting.id,updatedAt:deleting.updatedAt},'Registro removido.'))setDeleting(null);}}>{busy?'Removendo…':'Remover'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Dialog open={tour!==null} onOpenChange={open=>!open&&setTour(null)}><DialogContent className="tour-dialog"><DialogHeader><p className="eyebrow">PASSEIO PELO CRM · {(tour??0)+1} DE 5</p><DialogTitle>{steps[tour??0][1]}</DialogTitle><DialogDescription>{steps[tour??0][2]}</DialogDescription></DialogHeader><div className="tour-progress">{steps.map((_,i)=><i key={i} className={i<=(tour??0)?'active':''}/>)}</div><div className="form-actions"><button className="secondary-button" disabled={tour===0} onClick={()=>setTour((tour??1)-1)}><ArrowLeft/>Anterior</button><button className="secondary-button" onClick={()=>{navigate(steps[tour??0][0]);setTour(null);}}>Abrir área</button><button className="primary-button" onClick={()=>tour===4?setTour(null):setTour((tour??0)+1)}>{tour===4?'Concluir':'Próximo'}<ArrowRight/></button></div></DialogContent></Dialog>
 {feedback&&<div role={feedback.error?'alert':'status'} className={'inline-feedback '+(feedback.error?'error':'')}><CheckCircle2/><span>{feedback.text}</span><button aria-label="Fechar mensagem" onClick={()=>setFeedback(null)}><X/></button></div>}</>;
}
