'use client';
import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, Users, Headphones, CalendarDays, CheckSquare, BarChart3, History, Settings, ChevronRight, CircleHelp, Sparkles, RefreshCw, CheckCircle2, X, Info, ArrowRight, ArrowLeft, MessageCircle, Globe2, WalletCards } from 'lucide-react';
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
import { Campaigns, Sites } from './business';
import Finance from './finance';
import { loadLocalCrm, mutateLocalCrm } from '@/lib/client-store';
const nav=[['overview','Visão geral',LayoutDashboard],['contacts','Contatos',Users],['campaigns','WhatsApp',MessageCircle],['sites','Sites e textos',Globe2],['finance','Financeiro',WalletCards],['support','Atendimentos',Headphones],['tasks','Tarefas',CheckSquare],['calendar','Agenda',CalendarDays],['reports','Relatórios',BarChart3],['activity','Histórico',History],['settings','Configurações e guia',Settings]] as const;
const headings:Record<string,[string,string]>={
 overview:['Tudo começa com uma boa visão.','Acompanhe a rotina, os relacionamentos e os números da Casa.'],
 contacts:['Cada relacionamento, em um só lugar.','Cadastros, contexto e histórico de atendimento.'],
 campaigns:['Ofertas prontas para conversar.','Crie mensagens personalizadas e abra cada conversa no WhatsApp.'],
 sites:['Os textos dos sites, sob controle.','Organize pedidos, versões, responsáveis, prazos e aprovações.'],
 finance:['O dinheiro da empresa, finalmente organizado.','Acompanhe o que entra, o que sai, os atrasos e o saldo do caixa.'],
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
 const staticMode=typeof window!=='undefined'&&Boolean((globalThis as typeof globalThis&{__CRM_STATIC__?:boolean}).__CRM_STATIC__);
 const [view,setView]=useState('overview'),[period,setPeriod]=useState('2026-09');
 const [entries,setEntries]=useState<Entry[]>([]),[activity,setActivity]=useState<Activity[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<Feedback|null>(null),[draft,setDraft]=useState<Draft|null>(null),[detailId,setDetailId]=useState<string|null>(null),[deleting,setDeleting]=useState<Entry|null>(null),[tour,setTour]=useState<number|null>(null);
 const {setOpenMobile}=useSidebar();
 const navigate=useCallback((next:string)=>{if(nav.some(n=>n[0]===next)){setView(next);window.location.hash=next;setOpenMobile(false);}},[setOpenMobile]);
 useEffect(()=>{function sync(){const value=window.location.hash.slice(1);if(nav.some(n=>n[0]===value))setView(value);}sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 useEffect(()=>{if(!feedback)return;const t=setTimeout(()=>setFeedback(null),6500);return()=>clearTimeout(t);},[feedback]);
 const reload=useCallback(async()=>{try{const result=staticMode?loadLocalCrm():await fetch('/api/crm',{cache:'no-store',signal:AbortSignal.timeout(20000)}).then(async res=>{const data=await res.json() as ApiResult;if(!res.ok)throw new Error(data.error);return data;});setEntries(result.entries);setActivity(result.activity);setError('');return true;}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os registros.');return false;}finally{setLoading(false);}},[staticMode]);
 useEffect(()=>{queueMicrotask(()=>{void reload();});},[reload]);
 async function send(method:string,body:unknown,success:string){if(busy)return false;setBusy(true);try{if(staticMode)mutateLocalCrm(method,body as Parameters<typeof mutateLocalCrm>[1]);else{const response=await fetch('/api/crm',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result=await response.json() as ApiResult;if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');}const refreshed=await reload();setFeedback({text:refreshed?success:'Alteração salva. Atualize o painel para carregar a nova versão.'});return true;}catch(e){setFeedback({text:e instanceof Error?e.message:'Não foi possível salvar.',error:true});return false;}finally{setBusy(false);}}
 const save=(entry:Entry)=>send('PUT',{id:entry.id,updatedAt:entry.updatedAt,data:entry.data},'Alteração salva.');
 const create=(kind:Kind,date?:string)=>setDraft({kind,date});
 const edit=(entry:Entry)=>{setDetailId(null);setDraft({kind:entry.kind,entry});};
 const workProps={entries,create,edit,remove:setDeleting,save,busy};
 const detail=entries.find(e=>e.id===detailId&&e.kind==='contact');
 const openTickets=entries.filter(x=>x.kind==='ticket'&&x.data.status!=='Resolvido').length;
 const steps=[['overview','Comece pelo que pede atenção','Veja caixa, campanhas, sites e tarefas no mesmo painel.'],['campaigns','Prepare uma oferta','Crie a mensagem, confira a personalização e abra a conversa no WhatsApp.'],['sites','Controle as alterações','Guarde o texto atual, o novo texto, o prazo e a aprovação de cada site.'],['finance','Controle o dinheiro','Acompanhe contas a pagar e receber, atrasos, resultado e fluxo de caixa.'],['contacts','Mantenha os contatos completos','Cadastre o WhatsApp e o contexto de cada pessoa para usar nas campanhas.']];
 return <><a className="skip-link" href="#main-content">Pular para o conteúdo</a><Sidebar className="brand-sidebar"><SidebarHeader><button className="brand-lockup" onClick={()=>navigate('overview')} aria-label="CRM do Hugo — visão geral"><span className="brand-mark">HU</span><span>CRM DO HUGO<small>NEGÓCIOS & CONTROLE</small></span></button></SidebarHeader><SidebarContent><p className="nav-label">ESPAÇO DE TRABALHO</p><SidebarMenu>{nav.map(([id,label,Icon])=><SidebarMenuItem key={id}><SidebarMenuButton className="nav-item" isActive={view===id} onClick={()=>navigate(id)}><Icon/><span>{label}</span>{id==='support'&&openTickets>0&&<b>{openTickets}</b>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><button className="demo-card" onClick={()=>setTour(0)}><Sparkles/><strong>Conheça o seu CRM</strong><p>Um passeio de 5 passos <ArrowRight/></p></button><div className="profile"><span className="avatar">HU</span><div><strong>Hugo</strong><small>Administrador</small></div></div></SidebarFooter></Sidebar><main className="workspace" id="main-content"><header className="topbar"><div className="breadcrumbs"><SidebarTrigger/><span>CRM do Hugo</span><ChevronRight/><strong>{nav.find(x=>x[0]===view)?.[1]}</strong></div><div className="top-actions"><span className="live-dot"/><span>Dados salvos</span><button className="icon-button" aria-label="Atualizar registros" disabled={busy||loading} onClick={()=>void reload()}><RefreshCw/></button><button className="icon-button" aria-label="Guia do CRM" onClick={()=>setTour(0)}><CircleHelp/></button></div></header><div className="page"><div className="page-heading"><div><p className="eyebrow">CRM DO HUGO · PAINEL DE GESTÃO</p><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div></div>{loading?<div className="metric-grid" aria-label="Carregando registros" aria-busy="true">{[1,2,3,4].map(i=><section key={i} className="metric"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-10 w-1/2 my-4"/><Skeleton className="h-4 w-full"/></section>)}</div>:error?<div className="error-box" role="alert"><Info style={{margin:'auto'}}/><h2>Não foi possível atualizar o painel.</h2><p>{error}</p><button className="primary-button" onClick={()=>void reload()}>Tentar novamente</button></div>:<>{view==='overview'&&<Dashboard entries={entries} period={period} setPeriod={setPeriod} navigate={navigate} edit={edit}/>}
 {view==='contacts'&&<Contacts entries={entries} create={()=>create('contact')} edit={edit} remove={setDeleting} detail={e=>setDetailId(e.id)}/>}
 {view==='campaigns'&&<Campaigns {...workProps}/>}
 {view==='sites'&&<Sites {...workProps}/>}
 {view==='finance'&&<Finance {...workProps}/>}
 {view==='support'&&<Support {...workProps}/>}
 {view==='tasks'&&<Tasks {...workProps}/>}
 {view==='calendar'&&<Calendar {...workProps}/>}
 {view==='reports'&&<Reports period={period} setPeriod={setPeriod} entries={entries}/>}
 {view==='activity'&&<ActivityLog activity={activity}/>}
 {view==='settings'&&<Help entries={entries} activity={activity} refresh={()=>void reload()} busy={busy}/>}
 </>}<footer className="page-footer"><span>CRM DO HUGO <b>·</b> GESTÃO</span><span>Contatos, operação e financeiro no mesmo lugar</span><button onClick={()=>navigate('settings')}>Como usar</button></footer></div></main>
 {draft&&<Editor key={draft.entry?.id||draft.kind+(draft.date||'')} draft={draft} entries={entries} busy={busy} onClose={()=>setDraft(null)} onSave={(kind,data,entry)=>send(entry?'PUT':'POST',entry?{id:entry.id,updatedAt:entry.updatedAt,data}:{kind,data},'Registro salvo.')}/>}
 {detail&&<ContactDetail entry={detail} entries={entries} onClose={()=>setDetailId(null)} onEdit={edit} busy={busy} onNote={(contactId,text)=>send('POST',{kind:'note',data:{contactId,text,author:'Hugo'}},'Anotação adicionada.')}/>}
 <AlertDialog open={!!deleting} onOpenChange={open=>!open&&!busy&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover este registro?</AlertDialogTitle><AlertDialogDescription>{deleting?.data.name||deleting?.data.title} será removido do CRM. Contatos com atendimentos devem ser arquivados para preservar o histórico.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="danger-button" disabled={busy} onClick={async()=>{if(deleting&&await send('DELETE',{id:deleting.id,updatedAt:deleting.updatedAt},'Registro removido.'))setDeleting(null);}}>{busy?'Removendo…':'Remover'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Dialog open={tour!==null} onOpenChange={open=>!open&&setTour(null)}><DialogContent className="tour-dialog"><DialogHeader><p className="eyebrow">PASSEIO PELO CRM · {(tour??0)+1} DE 5</p><DialogTitle>{steps[tour??0][1]}</DialogTitle><DialogDescription>{steps[tour??0][2]}</DialogDescription></DialogHeader><div className="tour-progress">{steps.map((_,i)=><i key={i} className={i<=(tour??0)?'active':''}/>)}</div><div className="form-actions"><button className="secondary-button" disabled={tour===0} onClick={()=>setTour((tour??1)-1)}><ArrowLeft/>Anterior</button><button className="secondary-button" onClick={()=>{navigate(steps[tour??0][0]);setTour(null);}}>Abrir área</button><button className="primary-button" onClick={()=>tour===4?setTour(null):setTour((tour??0)+1)}>{tour===4?'Concluir':'Próximo'}<ArrowRight/></button></div></DialogContent></Dialog>
 {feedback&&<div role={feedback.error?'alert':'status'} className={'inline-feedback '+(feedback.error?'error':'')}><CheckCircle2/><span>{feedback.text}</span><button aria-label="Fechar mensagem" onClick={()=>setFeedback(null)}><X/></button></div>}</>;
}
