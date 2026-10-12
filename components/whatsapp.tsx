'use client';
import { useEffect, useMemo, useState } from 'react';
import { Send, MessageCircle, PlugZap, Check, RotateCcw, Plus, Pencil, Undo2 } from 'lucide-react';
import { Entry, Kind } from '@/lib/model';
import { REGIONS, UF_NAME, buildAudience, firstName, phonesByState, prettyPhone } from '@/lib/whatsapp';
import { UFS } from '@/lib/model';
import { Campaigns } from './business';
import Dispatch from './dispatch';
import OutreachDemo from './outreach-demo';
import { Choice } from './shared';

type Props = { entries: Entry[]; create: (kind: Kind, date?: string) => void; edit: (entry: Entry) => void; remove: (entry: Entry) => void; save: (entry: Entry) => Promise<boolean>; busy: boolean };
const tabs = [['enviar', 'Disparar', Send], ['mensagens', 'Mensagens', MessageCircle], ['automatico', 'Automático (API oficial)', PlugZap]] as const;
const GENDERS: string[][] = [['all', 'Homens e mulheres'], ['Mulher', 'Só mulheres'], ['Homem', 'Só homens']];
const SENT_KEY = 'crm-zap-enviados-v1';

/** Quem já recebeu cada mensagem fica guardado neste navegador, para o Hugo poder parar e continuar depois. */
function loadSent(): Record<string, string[]> {
  try { const raw = JSON.parse(window.localStorage.getItem(SENT_KEY) || '{}'); return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch { return {}; }
}

export default function WhatsApp(props: Props) {
  const [tab, setTab] = useState<string>('enviar');
  return <>
    <div className="wa-tabs" role="tablist">{tabs.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon />{label}</button>)}</div>
    {tab === 'enviar' && <SendByState {...props} openMessages={() => setTab('mensagens')} />}
    {tab === 'mensagens' && <><Campaigns {...props} /><details className="panel" style={{ marginTop: 24, padding: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Teste individual de WhatsApp e e-mail</summary><div style={{ marginTop: 20 }}><OutreachDemo entries={props.entries} /></div></details></>}
    {tab === 'automatico' && <Dispatch entries={props.entries} />}
  </>;
}

function SendByState({ entries, create, edit, openMessages }: Props & { openMessages: () => void }) {
  const [states, setStates] = useState<string[]>([]), [gender, setGender] = useState('all'), [campaignId, setCampaignId] = useState('');
  const [sent, setSent] = useState<Record<string, string[]>>({}), [loaded, setLoaded] = useState(false);
  useEffect(() => { queueMicrotask(() => { setSent(loadSent()); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) { try { window.localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch { /* navegador sem armazenamento */ } } }, [sent, loaded]);

  const counts = useMemo(() => phonesByState(entries), [entries]);
  const usedUfs = UFS.filter(u => counts.get(u));
  const campaigns = entries.filter(e => e.kind === 'campaign');
  const campaign = campaigns.find(c => c.id === campaignId) || campaigns[0];
  const { recipients } = useMemo(() => buildAudience(entries, { states, noState: false, genders: gender === 'all' ? [] : [gender], consentOnly: false, excludeDays: 0 }, new Map(), new Set()), [entries, states, gender]);
  const done = new Set(campaign ? sent[campaign.id] || [] : []);
  const pending = recipients.filter(r => !done.has(r.phone));
  const sentHere = recipients.length - pending.length;
  const pct = recipients.length ? Math.round((sentHere / recipients.length) * 100) : 0;
  const text = (name: string) => campaign ? (campaign.data.message || '').replaceAll('{nome}', firstName(name) || 'cliente').replaceAll('{oferta}', campaign.data.offer || 'esta oferta') : '';

  const toggleState = (uf: string) => setStates(s => s.includes(uf) ? s.filter(x => x !== uf) : [...s, uf]);
  const regionOn = (ufs: string[]) => ufs.some(u => usedUfs.includes(u)) && ufs.filter(u => usedUfs.includes(u)).every(u => states.includes(u));
  const toggleRegion = (ufs: string[]) => setStates(s => { const mine = ufs.filter(u => usedUfs.includes(u)); return mine.every(u => s.includes(u)) ? s.filter(x => !mine.includes(x)) : [...new Set([...s, ...mine])]; });
  const mark = (phone: string, on: boolean) => { if (!campaign) return; setSent(all => { const list = new Set(all[campaign.id] || []); if (on) list.add(phone); else list.delete(phone); return { ...all, [campaign.id]: [...list] }; }); };
  function send(r: { name: string; phone: string }) {
    window.open(`https://wa.me/${r.phone}?text=${encodeURIComponent(text(r.name))}`, '_blank', 'noopener,noreferrer');
    mark(r.phone, true);
  }

  return <div className="wa-grid">
    <section className="panel wa-step">
      <p className="eyebrow">1 · PARA QUEM</p><h2>Escolha os estados</h2>
      <div className="chip-row">{usedUfs.map(uf => <button key={uf} title={UF_NAME[uf]} className={'chip ' + (states.includes(uf) ? 'on' : '')} aria-pressed={states.includes(uf)} aria-label={`${UF_NAME[uf]}, ${counts.get(uf)} contatos`} onClick={() => toggleState(uf)}>{uf}<small>{counts.get(uf)}</small></button>)}</div>
      <h3>Ou uma região inteira</h3>
      <div className="chip-row">{REGIONS.filter(([, ufs]) => ufs.some(u => usedUfs.includes(u))).map(([region, ufs]) => <button key={region} className={'chip ' + (regionOn(ufs) ? 'on' : '')} aria-pressed={regionOn(ufs)} title={ufs.filter(u => usedUfs.includes(u)).join(', ')} onClick={() => toggleRegion(ufs)}>{region}<small>{ufs.reduce((n, u) => n + (counts.get(u) || 0), 0)}</small></button>)}</div>
      <div className="chip-actions"><button className="text-button" onClick={() => setStates(usedUfs)}>Brasil inteiro</button><button className="text-button" onClick={() => setStates([])}>Limpar</button></div>
      <div className="toolbar" style={{ marginTop: 16 }}><Choice label="Quem recebe" value={gender} onChange={setGender} options={GENDERS} /></div>
      <div className="wa-audience"><strong>{recipients.length}</strong><span>{recipients.length === 1 ? 'pessoa com WhatsApp' : 'pessoas com WhatsApp'}{states.length ? ' em ' + states.join(', ') : ''}</span></div>
    </section>

    <section className="panel wa-step">
      <p className="eyebrow">2 · MENSAGEM</p><h2>Escolha a mensagem</h2>
      {!campaigns.length ? <div className="wa-hint"><p>Você ainda não tem mensagem pronta.</p><button className="primary-button" onClick={() => create('campaign')}><Plus />Criar mensagem</button></div> : <>
        <div className="toolbar"><Choice label="Mensagem" value={campaign.id} onChange={setCampaignId} options={campaigns.map(c => [c.id, c.data.title])} /></div>
        <div className="whatsapp-phone" style={{ margin: '14px 0' }}><div className="whatsapp-bubble">{text(recipients[0]?.name || 'Maria')}</div><small>O nome de cada cliente entra sozinho.</small></div>
        <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}><button className="secondary-button" onClick={() => edit(campaign)}><Pencil />Editar</button><button className="secondary-button" onClick={() => create('campaign')}><Plus />Nova mensagem</button><button className="text-button" onClick={openMessages}>Ver todas</button></div>
      </>}
    </section>

    <section className="panel wa-step wa-confirm">
      <p className="eyebrow">3 · ENVIAR</p><h2>{!states.length ? 'Escolha um estado para começar' : !campaign ? 'Crie uma mensagem para começar' : !recipients.length ? 'Ninguém com WhatsApp nesses estados' : pending.length ? `Faltam ${pending.length} de ${recipients.length}` : 'Todos receberam'}</h2>
      {campaign && recipients.length > 0 && <>
        <p className="muted-text">O WhatsApp abre com a mensagem pronta. Aperte enviar lá e volte aqui para o próximo.</p>
        <div className="wa-progress-wrap" style={{ margin: '14px 0' }}><div className="wa-progress"><i style={{ width: pct + '%' }} /></div><span>{sentHere} de {recipients.length} enviadas</span></div>
        <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}>
          {pending[0] && <button className="whatsapp-button wa-go" style={{ marginTop: 0 }} onClick={() => send(pending[0])}><Send />Enviar para {firstName(pending[0].name) || 'o próximo'}</button>}
          {sentHere > 0 && <button className="secondary-button" onClick={() => { if (window.confirm('Desmarcar todos os enviados desta mensagem nestes estados?')) recipients.forEach(r => mark(r.phone, false)); }}><RotateCcw />Recomeçar</button>}
        </div>
        <div className="wa-list wa-send-list">{recipients.slice(0, 400).map(r => { const ok = done.has(r.phone); return <div key={r.id} className={ok ? 'sent' : ''}><span><strong>{r.name}</strong><small>{prettyPhone(r.phone)} · {r.state}</small></span>{ok ? <button className="text-button" onClick={() => mark(r.phone, false)} aria-label={'Desmarcar ' + r.name}><Check />Enviada<Undo2 /></button> : <button className="secondary-button" onClick={() => send(r)}><Send />Enviar</button>}</div>; })}{recipients.length > 400 && <p className="muted-text" style={{ padding: 12 }}>Mostrando os primeiros 400. Escolha menos estados para ver os demais.</p>}</div>
        <p className="reference-note">A lista de enviados fica guardada neste computador. O envio é um por vez, pelo seu WhatsApp.</p>
      </>}
    </section>
  </div>;
}
