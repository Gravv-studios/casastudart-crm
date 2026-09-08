'use client';
import { Search, Inbox, Plus } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { makeCsv } from '@/lib/model';
export function Choice({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:string[][];label:string}) {return <Select value={value} onValueChange={v=>v!==null&&onChange(v)}><SelectTrigger aria-label={label} className="choice"><SelectValue>{options.find(x=>x[0]===value)?.[1]||value}</SelectValue></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>;}
export function Badge({children,tone='neutral'}:{children:React.ReactNode;tone?:string}){return <span className={'badge '+tone}>{children}</span>;}
export function SearchBox({value,onChange,placeholder='Buscar'}:{value:string;onChange:(s:string)=>void;placeholder?:string}) {return <label className="search-box"><Search/><input type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/></label>;}
export function Blank({title='Nenhum registro encontrado',message='Experimente outro termo ou remova os filtros.',action}:{title?:string;message?:string;action?:()=>void}) {return <Empty className="empty-state"><EmptyHeader><EmptyMedia variant="icon"><Inbox/></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{message}</EmptyDescription></EmptyHeader>{action&&<button className="primary-button" onClick={action}><Plus/>Adicionar registro</button>}</Empty>;}
export const options=(list:string[])=>list.map(s=>[s,s]);
export function download(text:string,name:string,type='text/csv;charset=utf-8') {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function exportCsv(rows:unknown[][],name:string){download(makeCsv(rows),name);}
export const tone=(status:string)=>status==='Resolvido'||status==='Concluída'||status==='Ativo'?'green':status==='Alta'?'red':status==='Novo'||status==='Aguardando'?'gold':status==='Em andamento'?'blue':'neutral';
export const periodOptions=[['2026-09','Setembro 2026'],['2026-08','Agosto 2026'],['2026-07','Julho 2026'],['2026-06','Junho 2026'],['2026-05','Maio 2026'],['2026-04','Abril 2026'],['all','Abril a setembro']];
