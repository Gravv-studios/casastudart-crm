'use client';
import { useState } from 'react';
import { Entry, UFS } from '@/lib/model';
import { previewMessage, segmentContacts, testEmail, testPhone } from '@/lib/outreach';
import { Choice } from './shared';

export default function OutreachDemo({entries}:{entries:Entry[]}) {
  const [state,setState]=useState('DF'),[contactId,setContactId]=useState('');
  const [channel,setChannel]=useState('whatsapp'),[destination,setDestination]=useState('');
  const [approved,setApproved]=useState(false),[notice,setNotice]=useState('');
  const [subject,setSubject]=useState('Demonstração — Casa Studart');
  const [template,setTemplate]=useState('Olá, {nome}! Esta é uma demonstração do CRM Casa Studart para a nossa reunião. Nenhuma oferta está sendo enviada aos clientes.');
  const contacts=segmentContacts(entries,state);
  const contact=contacts.find(e=>e.id===contactId)||contacts[0];
  const message=previewMessage(template,contact?.data.name||'');
  const target=channel==='whatsapp'?testPhone(destination):testEmail(destination.trim());
  const ready=!!target&&approved&&!!message.trim()&&!!contact;
  function open(){
    if(!ready)return;
    const url=channel==='whatsapp'?`https://wa.me/${target}?text=${encodeURIComponent(message)}`:`mailto:${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(url,'_blank','noopener,noreferrer');
    setNotice('Solicitamos a abertura do aplicativo. Revise o destino e confirme o envio lá. O CRM não confirma envio ou entrega.');
  }
  return <section className="panel" style={{padding:24,marginBottom:24}}>
    <p className="eyebrow">DEMONSTRAÇÃO SEGURA · WHATSAPP E E-MAIL</p><h2>Teste uma mensagem, sem disparar para a base</h2>
    <p>O cadastro abaixo serve apenas para personalizar a prévia. O destinatário é o telefone ou e-mail de teste informado por você.</p>
    <div className="toolbar" style={{marginTop:20}}>
      <Choice label="Estado da demonstração" value={state} onChange={v=>{setState(v);setContactId('');}} options={[["all","Todos os estados"],["unknown","Sem estado informado"],...UFS.map(uf=>[uf,uf])]}/>
      <button className="secondary-button" onClick={()=>{setState('DF');setContactId('');}}>Somente DF</button>
      <strong>{contacts.length} contatos ativos neste filtro</strong>
    </div>
    {contacts.length>0?<Choice label="Contato para personalizar a demonstração" value={contact?.id||''} onChange={setContactId} options={contacts.map(e=>[e.id,e.data.name])}/>:<p>Nenhum contato neste estado. Escolha outro filtro.</p>}
    <p>Estado do cadastro: <strong>{contact?.data.state||'Não informado'}</strong>. Ter um cadastro ativo não comprova autorização para receber ofertas.</p>
    <div className="toolbar"><Choice label="Canal de teste" value={channel} onChange={v=>{setChannel(v);setDestination('');setApproved(false);setNotice('');}} options={[["whatsapp","WhatsApp"],["email","E-mail"]]}/></div>
    <label style={{display:'block',marginBottom:16}}>Seu destino de teste (Marcos ou Hugo)
      <input aria-label="Destino de teste" style={{display:'block',width:'100%',padding:12,border:'1px solid #ccc',borderRadius:8}} value={destination} onChange={e=>{setDestination(e.target.value);setApproved(false);}} placeholder={channel==='whatsapp'?'DDD + número; internacional: +código do país':'seuemail@exemplo.com'} type={channel==='email'?'email':'tel'}/>
    </label>
    {channel==='email'&&<label>Assunto<input aria-label="Assunto de teste" style={{display:'block',width:'100%',padding:12}} value={subject} onChange={e=>setSubject(e.target.value)} maxLength={160}/></label>}
    <label>Texto da mensagem (use {'{nome}'})<textarea aria-label="Mensagem de teste" style={{display:'block',width:'100%',minHeight:110,padding:12,border:'1px solid #ccc',borderRadius:8}} value={template} onChange={e=>setTemplate(e.target.value)} maxLength={1500}/></label>
    <div className="whatsapp-bubble" style={{whiteSpace:'pre-wrap',margin:'20px 0'}}>{message}</div>
    <label style={{display:'block',marginBottom:16}}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> Este destino é meu ou do Hugo, e tenho autorização para este teste.</label>
    <div className="message-actions"><button className="primary-button" disabled={!ready} onClick={open}>Abrir {channel==='whatsapp'?'WhatsApp':'aplicativo de e-mail'} para revisar</button><button className="secondary-button" onClick={async()=>{try{await navigator.clipboard.writeText(message);setNotice('Prévia copiada. Nenhuma mensagem foi enviada.');}catch{setNotice('Não foi possível copiar. Selecione o texto da prévia manualmente.');}}}>Copiar prévia</button></div>
    {destination&&!target&&<p role="alert">Confira o destino: informe um telefone válido com DDD ou um único e-mail, conforme o canal.</p>}
    {notice&&<p role="status">{notice}</p>}
    <p className="reference-note">Modo assistido, individual. Requer aplicativo configurado. Não é API, envio em massa, agendamento ou comprovante de entrega. O teste não altera os cadastros.</p>
  </section>;
}

export function MeetingGuide({entries}:{entries:Entry[]}) {
 const contacts=entries.filter(e=>e.kind==='contact');
 return <section className="panel" style={{padding:24,lineHeight:1.8}}><p className="eyebrow">REUNIÃO COM HUGO</p><h2>O que mostrar e o que falta ativar</h2>
 <p><strong>{contacts.length} cadastros no CRM</strong> · {segmentContacts(entries,'DF').length} contatos ativos do DF · {contacts.filter(e=>!e.data.state).length} sem estado informado. Dados ausentes não foram adivinhados.</p>
 <ol><li>Em Contatos, selecione DF: a lista e a exportação seguem os filtros. Mostre também o filtro de gênero; “não informado” precisa de confirmação.</li><li>Em WhatsApp, use a demonstração no topo: escolha um contato do estado apenas para a prévia. Informe o telefone do Marcos ou Hugo, revise e abra o WhatsApp.</li><li>Troque o canal para E-mail e informe seu próprio endereço. O aplicativo de e-mail abre com o texto pronto; confirme o envio nele.</li><li>Em Financeiro, registre uma conta real, fornecedor, valor e vencimento. Só marque como paga após conferir a quitação.</li></ol>
 <h3>Rotina sugerida: quatro campanhas por mês</h3><p>Semana 1: novidades. Semana 2: seleção por estado. Semana 3: produto ou conteúdo útil. Semana 4: oferta aprovada pelo Hugo. São sugestões, não disparos agendados. Confirmar estoque, preços, público autorizado e opção de parar de receber antes de cada envio.</p>
 <h3>Para ativar os canais oficiais</h3><ul><li>WhatsApp: conta empresarial, número oficial, credenciais protegidas no servidor, modelos aprovados e registro de autorização dos destinatários. Ainda não conectado.</li><li>E-mail: escolher provedor de campanhas, validar domínio/remetente, configurar autenticação do domínio e descadastro. Ainda não conectado; o teste usa o aplicativo de e-mail.</li><li>Wix/WooCommerce: a base é uma importação, não sincronização automática. Revisar possíveis duplicidades e cadastros incompletos antes de novos envios.</li><li>Estoque: integração e controle ainda pendentes. Não apresentar como recurso concluído.</li></ul>
 <p>Importar clientes não equivale a obter consentimento de marketing. Não há envio automático habilitado.</p></section>;
}
