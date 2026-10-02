'use client';
import {useState} from 'react';
import type {Entry} from '@/lib/model';
import {estimateName} from '@/lib/name-estimate';
import {Choice,exportCsv} from './shared';

export default function NameReview({entries}:{entries:Entry[]}){
 const [filter,setFilter]=useState('all');
 const rows=entries.filter(e=>e.kind==='contact'&&e.data.status==='Ativo').map(e=>({entry:e,label:e.data.gender&&e.data.gender!=='Não informado'?e.data.gender+' — já cadastrado':estimateName(e.data.name||'')}));
 const visible=rows.filter(r=>filter==='all'||r.label.startsWith(filter));
 return <details className="panel" style={{padding:20,marginBottom:20}}><summary style={{cursor:'pointer',fontWeight:600}}>Classificação pelo nome · estimativa a confirmar</summary>
 <p>Estimativa pelo primeiro nome, não confirmação de gênero. Dados já cadastrados são preservados. Nomes ambíguos, desconhecidos e empresas ficam sem classificação. A estimativa é calculada nesta tela; não altera o banco.</p>
 <div className="toolbar"><Choice label="Classificação estimada" value={filter} onChange={setFilter} options={[["all","Todas"],["Feminino","Feminino"],["Masculino","Masculino"],["Não informado","Não informado"]]}/><strong>{visible.length} contatos ativos</strong><button className="secondary-button" onClick={()=>exportCsv([['Nome','UF','Classificação (revisar)'],...visible.map(r=>[r.entry.data.name,r.entry.data.state,r.label])],'revisao-nomes-casa-studart.csv')}>Exportar revisão</button></div>
 <div style={{maxHeight:360,overflow:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Nome</th><th>UF</th><th>Classificação</th></tr></thead><tbody>{visible.map(r=><tr key={r.entry.id}><td>{r.entry.data.name}</td><td>{r.entry.data.state||'Não informado'}</td><td>{r.label}</td></tr>)}</tbody></table></div>
 </details>;
}
