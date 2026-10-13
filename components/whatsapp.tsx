'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, MessageCircle, PlugZap, RotateCcw, Plus, Pencil, BarChart3, ImagePlus, Trash2, Copy, Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Entry, Kind, UFS } from '@/lib/model';
import { remoteEnabled } from '@/lib/remote-store';
import { REGIONS, UF_NAME, buildAudience, contactPhone, firstName, phonesByState, prettyPhone } from '@/lib/whatsapp';
import { STATUS, STATUS_LABEL, Track, activeLog, mergeLogs, optedOut, sentAt, parseLog, patchCampaign, pngBlob, reached, shrinkImage } from '@/lib/zap-track';
import { Campaigns } from './business';
import Dispatch from './dispatch';
import OutreachDemo from './outreach-demo';
import { Choice, exportCsv } from './shared';

type Props = { entries: Entry[]; create: (kind: Kind, date?: string) => void; edit: (entry: Entry) => void; remove: (entry: Entry) => void; save: (entry: Entry) => Promise<boolean>; busy: boolean };
type Change = { log: Track; image?: string };
type Store = { campaigns: Entry[]; track: (c?: Entry) => Track; image: (c?: Entry) => string; mark: (id: string, phone: string, status: string) => void; setImage: (id: string, dataUrl: string) => void; optOut: (contact: Entry) => Promise<boolean> };
const tabs = [['enviar', 'Disparar', Send], ['resumo', 'Visão geral', BarChart3], ['mensagens', 'Mensagens', MessageCircle], ['automatico', 'Automático', PlugZap]] as const;
const GENDERS: string[][] = [['all', 'Homens e mulheres'], ['Mulher', 'Só mulheres'], ['Homem', 'Só homens']];
const ROW_OPTIONS: string[][] = [...STATUS, ['x', 'Desmarcar envio'], ['out', 'Não quer mais receber']];
const OLD_SENT_KEY = 'crm-zap-enviados-v1';
const now = () => Math.floor(Date.now() / 1000);
const day = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const fill = (c: Entry | undefined, name: string) => c ? (c.data.message || '').replaceAll('{nome}', firstName(name) || 'cliente').replaceAll('{oferta}', c.data.offer || 'esta oferta') : '';
const openChat = (phone: string, text?: string) => window.open(`https://wa.me/${phone}${text ? '?text=' + encodeURIComponent(text) : ''}`, '_blank', 'noopener,noreferrer');

export default function WhatsApp(props: Props) {
  const [tab, setTab] = useState<string>('enviar');
  const { store, sync, syncError, retry } = useStore(props);
  return <>
    <div className="wa-tabs" role="tablist">{tabs.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon />{label}</button>)}
      <span className="wa-sync" role="status">{sync === 'saving' ? <><RefreshCw className="spin" />Salvando…</> : sync === 'saved' ? <><CheckCircle2 />Salvo</> : sync === 'error' ? <button className="text-button" onClick={retry}><AlertTriangle />Não salvou. Tentar de novo</button> : null}</span>
    </div>
    {sync === 'error' && syncError && <div className="wa-note error"><AlertTriangle /><div>{syncError}</div></div>}
    {tab === 'enviar' && <SendByState {...props} store={store} openMessages={() => setTab('mensagens')} />}
    {tab === 'resumo' && <Overview entries={props.entries} store={store} />}
    {tab === 'mensagens' && <><Campaigns {...props} /><details className="panel" style={{ marginTop: 24, padding: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Teste individual de WhatsApp e e-mail</summary><div style={{ marginTop: 20 }}><OutreachDemo entries={props.entries} /></div></details></>}
    {tab === 'automatico' && <Dispatch entries={props.entries} />}
  </>;
}

/** Marcações e foto ficam na própria mensagem, no banco, para o Hugo ver igual no computador e no celular. */
function useStore({ entries, save }: Props) {
  const remote = remoteEnabled();
  const [fresh, setFresh] = useState<Record<string, Entry>>({}), [local, setLocal] = useState<Record<string, Change>>({});
  const [sync, setSync] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle'), [syncError, setSyncError] = useState('');
  const pending = useRef<Record<string, Change>>({}), timer = useRef<ReturnType<typeof setTimeout> | null>(null), running = useRef(false);
  const campaigns = useMemo(() => entries.filter(e => e.kind === 'campaign').map(e => { const f = fresh[e.id]; return f && f.updatedAt >= e.updatedAt ? f : e; }), [entries, fresh]);
  const latest = useRef(campaigns);
  useEffect(() => { latest.current = campaigns; }, [campaigns]);

  const again = useRef<() => void>(() => {});
  const flush = useCallback(async () => {
    if (running.current) return;
    const batch = pending.current; pending.current = {};
    if (!Object.keys(batch).length) return;
    running.current = true; setSync('saving');
    const apply = (change: Change) => (data: Record<string, string>) => {
      const next = { ...data };
      if (Object.keys(change.log).length) next.log = JSON.stringify(mergeLogs(parseLog(data.log), change.log));
      if (change.image !== undefined) { if (change.image) next.image = change.image; else delete next.image; }
      return next;
    };
    let failed = '';
    for (const [id, change] of Object.entries(batch)) {
      try {
        if (remote) { const entry = await patchCampaign(id, apply(change)); setFresh(all => ({ ...all, [id]: entry })); }
        else { const entry = latest.current.find(c => c.id === id); if (!entry || !await save({ ...entry, data: apply(change)(entry.data) })) throw new Error('Não foi possível salvar.'); }
        setLocal(all => { const cur = all[id]; if (!cur) return all; const log = Object.fromEntries(Object.entries(cur.log).filter(([phone, item]) => !(change.log[phone] && change.log[phone][1] === item[1] && change.log[phone][0] === item[0]))) as Track; const image = cur.image === change.image ? undefined : cur.image; const rest = { ...all }; if (Object.keys(log).length || image !== undefined) rest[id] = { log, image }; else delete rest[id]; return rest; });
      } catch (e) {
        failed = e instanceof Error ? e.message : 'Não foi possível salvar.';
        const again = pending.current[id]; pending.current[id] = { log: mergeLogs(change.log, again?.log || {}), image: again?.image !== undefined ? again.image : change.image };
      }
    }
    running.current = false;
    if (failed) { setSync('error'); setSyncError(failed + ' As marcações continuam na tela; confira a internet e tente de novo.'); }
    else { setSyncError(''); setSync('saved'); if (Object.keys(pending.current).length) again.current(); }
  }, [remote, save]);
  useEffect(() => { again.current = () => void flush(); }, [flush]);
  const queue = useCallback((id: string, change: Change) => {
    const merge = (cur?: Change): Change => ({ log: mergeLogs(cur?.log || {}, change.log), image: change.image !== undefined ? change.image : cur?.image });
    pending.current[id] = merge(pending.current[id]);
    setLocal(all => ({ ...all, [id]: merge(all[id]) }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 900);
  }, [flush]);

  // Marcações feitas na primeira versão ficavam só neste navegador: leva para o banco uma vez.
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !campaigns.length) return; migrated.current = true;
    queueMicrotask(() => { try {
      const old = JSON.parse(window.localStorage.getItem(OLD_SENT_KEY) || 'null') as Record<string, string[]> | null;
      if (old && typeof old === 'object') for (const c of campaigns) { const phones = Array.isArray(old[c.id]) ? old[c.id] : []; const have = parseLog(c.data.log); const log: Track = {}; phones.forEach(p => { if (!have[p]) log[p] = ['e', now()]; }); if (Object.keys(log).length) queue(c.id, { log }); }
      window.localStorage.removeItem(OLD_SENT_KEY);
    } catch { /* nada a migrar */ } });
  }, [campaigns, queue]);

  const store: Store = {
    campaigns,
    track: c => c ? activeLog(mergeLogs(parseLog(c.data.log), local[c.id]?.log || {})) : {},
    image: c => c ? (local[c.id]?.image !== undefined ? local[c.id].image! : c.data.image || '') : '',
    mark: (id, phone, status) => { const c = campaigns.find(x => x.id === id), had = c ? activeLog(mergeLogs(parseLog(c.data.log), local[id]?.log || {}))[phone] : undefined; queue(id, { log: { [phone]: had && status !== 'e' ? [status, now(), sentAt(had)] : [status, now()] } }); },
    setImage: (id, dataUrl) => queue(id, { log: {}, image: dataUrl }),
    optOut: contact => save({ ...contact, data: { ...contact.data, consent: [contact.data.consent, `WhatsApp: não quer receber (${new Date().toLocaleDateString('pt-BR')})`].filter(Boolean).join(' · ').slice(0, 4000) } }),
  };
  return { store, sync, syncError, retry: () => void flush() };
}

function SendByState({ entries, create, edit, store, openMessages }: Props & { store: Store; openMessages: () => void }) {
  const [states, setStates] = useState<string[]>([]), [gender, setGender] = useState('all'), [campaignId, setCampaignId] = useState(''), [note, setNote] = useState(''), [photoError, setPhotoError] = useState('');
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, []);
  const counts = useMemo(() => phonesByState(entries), [entries]);
  const usedUfs = UFS.filter(u => counts.get(u));
  const byId = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);
  const campaign = store.campaigns.find(c => c.id === campaignId) || store.campaigns[0];
  const log = store.track(campaign), image = store.image(campaign);
  const audience = useMemo(() => buildAudience(entries, { states, noState: false, genders: gender === 'all' ? [] : [gender], consentOnly: false, excludeDays: 0 }, new Map(), new Set()).recipients, [entries, states, gender]);
  const recipients = audience.filter(r => !optedOut(byId.get(r.id)?.data || {}));
  const blocked = audience.length - recipients.length;
  const pending = recipients.filter(r => !log[r.phone]);
  const sentHere = recipients.length - pending.length;
  const pct = recipients.length ? Math.round((sentHere / recipients.length) * 100) : 0;

  // A foto vai pronta em PNG para a área de transferência no momento do clique.
  const photo = useRef<Blob | null>(null);
  useEffect(() => { let alive = true; photo.current = null; if (image) void pngBlob(image).then(blob => { if (alive) photo.current = blob; }); return () => { alive = false; }; }, [image]);
  const canCopy = typeof window !== 'undefined' && !!navigator.clipboard && 'ClipboardItem' in window;
  const copyPhoto = () => { if (!photo.current || !canCopy) return Promise.reject(new Error('sem foto')); return navigator.clipboard.write([new ClipboardItem({ 'image/png': photo.current })]); };

  const toggleState = (uf: string) => setStates(s => s.includes(uf) ? s.filter(x => x !== uf) : [...s, uf]);
  const regionOn = (ufs: string[]) => ufs.some(u => usedUfs.includes(u)) && ufs.filter(u => usedUfs.includes(u)).every(u => states.includes(u));
  const toggleRegion = (ufs: string[]) => setStates(s => { const mine = ufs.filter(u => usedUfs.includes(u)); return mine.every(u => s.includes(u)) ? s.filter(x => !mine.includes(x)) : [...new Set([...s, ...mine])]; });
  function send(r: { name: string; phone: string }) {
    if (!campaign) return;
    if (image && !touch && canCopy) void copyPhoto().then(() => setNote('Foto copiada. No WhatsApp, aperte Ctrl+V para colar a foto e depois Enter.'), () => setNote('Não consegui copiar a foto sozinho. Clique em “Copiar foto” e cole no WhatsApp.'));
    openChat(r.phone, fill(campaign, r.name));
    store.mark(campaign.id, r.phone, 'e');
  }
  async function choosePhoto(file?: File) {
    if (!file || !campaign) return; setPhotoError('');
    try { const dataUrl = await shrinkImage(file); if (dataUrl.length > 580000) throw new Error('A foto ficou grande demais. Escolha uma imagem menor.'); store.setImage(campaign.id, dataUrl); }
    catch (e) { setPhotoError(e instanceof Error ? e.message : 'Não foi possível usar esta foto.'); }
  }
  async function rowChange(r: { id: string; name: string; phone: string }, value: string) {
    if (!campaign) return;
    if (value !== 'out') { store.mark(campaign.id, r.phone, value); return; }
    const contact = byId.get(r.id);
    if (contact && window.confirm(`${r.name} não quer mais receber mensagens? Ele sai de todos os próximos disparos.`)) await store.optOut(contact);
  }

  return <div className="wa-grid">
    <section className="panel wa-step">
      <p className="eyebrow">1 · PARA QUEM</p><h2>Escolha os estados</h2>
      <div className="chip-row">{usedUfs.map(uf => <button key={uf} title={UF_NAME[uf]} className={'chip ' + (states.includes(uf) ? 'on' : '')} aria-pressed={states.includes(uf)} aria-label={`${UF_NAME[uf]}, ${counts.get(uf)} contatos`} onClick={() => toggleState(uf)}>{uf}<small>{counts.get(uf)}</small></button>)}</div>
      <h3>Ou uma região inteira</h3>
      <div className="chip-row">{REGIONS.filter(([, ufs]) => ufs.some(u => usedUfs.includes(u))).map(([region, ufs]) => <button key={region} className={'chip ' + (regionOn(ufs) ? 'on' : '')} aria-pressed={regionOn(ufs)} title={ufs.filter(u => usedUfs.includes(u)).join(', ')} onClick={() => toggleRegion(ufs)}>{region}<small>{ufs.reduce((n, u) => n + (counts.get(u) || 0), 0)}</small></button>)}</div>
      <div className="chip-actions"><button className="text-button" onClick={() => setStates(usedUfs)}>Brasil inteiro</button><button className="text-button" onClick={() => setStates([])}>Limpar</button></div>
      <div className="toolbar" style={{ marginTop: 16 }}><Choice label="Quem recebe" value={gender} onChange={setGender} options={GENDERS} /></div>
      <div className="wa-audience"><strong>{recipients.length}</strong><span>{recipients.length === 1 ? 'pessoa com WhatsApp' : 'pessoas com WhatsApp'}{states.length ? ' em ' + states.join(', ') : ''}</span>{blocked > 0 && <ul><li>{blocked} não {blocked === 1 ? 'quer' : 'querem'} mais receber e {blocked === 1 ? 'ficou' : 'ficaram'} de fora</li></ul>}</div>
    </section>

    <section className="panel wa-step">
      <p className="eyebrow">2 · MENSAGEM</p><h2>Escolha a mensagem</h2>
      {!campaign ? <div className="wa-hint"><p>Você ainda não tem mensagem pronta.</p><button className="primary-button" onClick={() => create('campaign')}><Plus />Criar mensagem</button></div> : <>
        <div className="toolbar"><Choice label="Mensagem" value={campaign.id} onChange={v => { setCampaignId(v); setNote(''); }} options={store.campaigns.map(c => [c.id, c.data.title])} /></div>
        <div className="whatsapp-phone" style={{ margin: '14px 0' }}><div className="whatsapp-bubble">{image && <img className="wa-photo" src={image} alt="Foto do disparo" />}{fill(campaign, recipients[0]?.name || 'Maria')}</div><small>O nome de cada cliente entra sozinho.</small></div>
        <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}>
          <label className="secondary-button wa-file"><ImagePlus />{image ? 'Trocar foto' : 'Adicionar foto'}<input type="file" accept="image/*" onChange={e => { void choosePhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
          {image && (touch || !canCopy ? <button className="secondary-button" onClick={() => saveBlob(dataUrlBlob(image), 'foto-disparo.jpg')}><Download />Baixar foto</button> : <button className="secondary-button" onClick={() => void copyPhoto().then(() => setNote('Foto copiada. Cole no WhatsApp com Ctrl+V.'), () => setNote('Não consegui copiar. Tente de novo em alguns segundos.'))}><Copy />Copiar foto</button>)}
          {image && <button className="secondary-button" onClick={() => store.setImage(campaign.id, '')} aria-label="Tirar a foto"><Trash2 />Tirar foto</button>}
          <button className="secondary-button" onClick={() => edit(campaign)}><Pencil />Editar texto</button>
          <button className="text-button" onClick={openMessages}>Todas as mensagens</button>
        </div>
        {photoError && <p className="form-error" role="alert">{photoError}</p>}
        {image && <p className="reference-note">{touch ? 'No celular o WhatsApp abre só com o texto: baixe a foto uma vez e anexe pela galeria em cada conversa.' : 'A foto é copiada sozinha a cada envio: no WhatsApp, aperte Ctrl+V para colar e depois Enter.'}</p>}
      </>}
    </section>

    <section className="panel wa-step wa-confirm">
      <p className="eyebrow">3 · ENVIAR</p><h2>{!states.length ? 'Escolha um estado para começar' : !campaign ? 'Crie uma mensagem para começar' : !recipients.length ? 'Ninguém com WhatsApp nesses estados' : pending.length ? `Faltam ${pending.length} de ${recipients.length}` : 'Todos receberam'}</h2>
      {campaign && recipients.length > 0 && <>
        <p className="muted-text">O WhatsApp abre com a mensagem pronta. Aperte enviar lá e volte aqui para o próximo.</p>
        <div className="wa-progress-wrap" style={{ margin: '14px 0' }}><div className="wa-progress"><i style={{ width: pct + '%' }} /></div><span>{sentHere} de {recipients.length} enviadas</span></div>
        <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}>
          {pending[0] && <button className="whatsapp-button wa-go" style={{ marginTop: 0 }} onClick={() => send(pending[0])}><Send />Enviar para {firstName(pending[0].name) || 'o próximo'}</button>}
          {sentHere > 0 && <button className="secondary-button" onClick={() => { if (window.confirm('Desmarcar todos os enviados desta mensagem nestes estados?')) recipients.forEach(r => { if (log[r.phone]) store.mark(campaign.id, r.phone, 'x'); }); }}><RotateCcw />Recomeçar</button>}
        </div>
        {note && <p className="wa-ok" role="status">{note}</p>}
        <div className="wa-list wa-send-list">{recipients.slice(0, 400).map(r => { const item = log[r.phone]; return <div key={r.id} className={item ? 'sent' : ''}><span><strong>{r.name}</strong><small>{prettyPhone(r.phone)} · {r.state}{item ? ' · ' + day(sentAt(item)) : ''}</small></span>{item ? <Choice label={'Situação de ' + r.name} value={item[0]} onChange={v => void rowChange(r, v)} options={ROW_OPTIONS} /> : <button className="secondary-button" onClick={() => send(r)}><Send />Enviar</button>}</div>; })}{recipients.length > 400 && <p className="muted-text" style={{ padding: 12 }}>Mostrando os primeiros 400. Escolha menos estados para ver os demais.</p>}</div>
        <p className="reference-note">Depois de enviar, marque na lista quem visualizou, respondeu ou comprou. Tudo fica salvo e aparece igual no computador e no celular.</p>
      </>}
    </section>
  </div>;
}

function saveBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function dataUrlBlob(dataUrl: string) { const [head, body] = dataUrl.split(','); const bytes = atob(body || ''); const data = new Uint8Array(bytes.length); for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i); return new Blob([data], { type: /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg' }); }

function Overview({ entries, store }: { entries: Entry[]; store: Store }) {
  const [campaignId, setCampaignId] = useState('all'), [filter, setFilter] = useState('all');
  const contacts = useMemo(() => { const map = new Map<string, Entry>(); entries.forEach(e => { if (e.kind === 'contact') { const phone = contactPhone(e.data); if (phone && !map.has(phone)) map.set(phone, e); } }); return map; }, [entries]);
  const chosen = store.campaigns.filter(c => campaignId === 'all' || c.id === campaignId);
  const rows = chosen.flatMap(c => Object.entries(store.track(c)).map(([phone, item]) => { const status = item[0], at = sentAt(item); const contact = contacts.get(phone); return { key: c.id + phone, campaign: c, phone, status, at, name: contact?.data.name || prettyPhone(phone), state: contact?.data.state || '—' }; })).sort((a, b) => b.at - a.at);
  const count = (test: (status: string) => boolean) => rows.filter(r => test(r.status)).length;
  const total = rows.length, seen = count(s => reached(s, 'v')), replied = count(s => reached(s, 'r')), bought = count(s => s === 'c');
  const share = (n: number) => total ? ` · ${Math.round((n / total) * 100)}%` : '';
  const out = entries.filter(e => e.kind === 'contact' && optedOut(e.data)).length;
  const byState = new Map<string, { sent: number; replied: number; bought: number }>();
  rows.forEach(r => { const s = byState.get(r.state) || { sent: 0, replied: 0, bought: 0 }; s.sent++; if (reached(r.status, 'r')) s.replied++; if (r.status === 'c') s.bought++; byState.set(r.state, s); });
  const list = rows.filter(r => filter === 'all' || (filter === 'quiet' ? !reached(r.status, 'r') : filter === 'unseen' ? r.status === 'e' : r.status === filter));
  if (!store.campaigns.length) return <section className="panel wa-step"><p className="muted-text">Crie uma mensagem e faça o primeiro disparo para ver os números aqui.</p></section>;
  return <>
    <div className="toolbar"><Choice label="Mensagem" value={campaignId} onChange={setCampaignId} options={[['all', 'Todas as mensagens'], ...store.campaigns.map(c => [c.id, c.data.title])]} />{total > 0 && <button className="secondary-button" onClick={() => exportCsv([['Mensagem', 'Cliente', 'WhatsApp', 'UF', 'Situação', 'Enviada em'], ...rows.map(r => [r.campaign.data.title, r.name, prettyPhone(r.phone), r.state, STATUS_LABEL[r.status] || r.status, r.at ? new Date(r.at * 1000).toLocaleDateString('pt-BR') : ''])], 'disparos-whatsapp.csv')}><Download />Baixar planilha</button>}</div>
    <div className="wa-summary wa-overview">
      <div><span>Enviadas</span><strong>{total}</strong></div>
      <div><span>Visualizaram</span><strong>{seen}<small>{share(seen)}</small></strong></div>
      <div><span>Não visualizaram</span><strong>{total - seen}</strong></div>
      <div><span>Responderam</span><strong>{replied}<small>{share(replied)}</small></strong></div>
      <div><span>Sem resposta</span><strong>{total - replied}</strong></div>
      <div><span>Compraram</span><strong>{bought}<small>{share(bought)}</small></strong></div>
      <div><span>Não querem receber</span><strong>{out}</strong></div>
    </div>
    {!total ? <section className="panel wa-step"><p className="muted-text">Nenhum envio registrado {campaignId === 'all' ? 'ainda' : 'nesta mensagem'}. Os números aparecem conforme você dispara na aba Disparar.</p></section> : <>
      <section className="panel" style={{ marginBottom: 20 }}><div className="panel-heading"><div><p className="eyebrow">POR ESTADO</p><h2>Onde a mensagem chegou</h2></div></div>
        <Table><TableHeader><TableRow><TableHead>Estado</TableHead><TableHead>Enviadas</TableHead><TableHead>Responderam</TableHead><TableHead>Compraram</TableHead></TableRow></TableHeader><TableBody>{[...byState].sort((a, b) => b[1].sent - a[1].sent).map(([uf, s]) => <TableRow key={uf}><TableCell>{UF_NAME[uf] ? `${uf} · ${UF_NAME[uf]}` : uf}</TableCell><TableCell>{s.sent}</TableCell><TableCell>{s.replied}</TableCell><TableCell>{s.bought}</TableCell></TableRow>)}</TableBody></Table>
      </section>
      <section className="panel wa-step"><p className="eyebrow">CLIENTE POR CLIENTE</p><h2>Quem fazer contato de novo</h2>
        <div className="toolbar" style={{ marginTop: 12 }}><Choice label="Mostrar" value={filter} onChange={setFilter} options={[['all', 'Todos os enviados'], ['quiet', 'Sem resposta'], ['unseen', 'Não visualizaram'], ['v', 'Visualizaram e não responderam'], ['r', 'Responderam'], ['c', 'Compraram']]} /><span className="muted-text">{list.length} {list.length === 1 ? 'cliente' : 'clientes'}</span></div>
        <div className="wa-list wa-send-list">{list.slice(0, 400).map(r => <div key={r.key}><span><strong>{r.name}</strong><small>{prettyPhone(r.phone)} · {r.state} · {day(r.at)}{campaignId === 'all' ? ' · ' + r.campaign.data.title : ''}</small></span><span className="wa-row-actions"><Choice label={'Situação de ' + r.name} value={r.status} onChange={v => store.mark(r.campaign.id, r.phone, v)} options={STATUS} /><button className="secondary-button" onClick={() => openChat(r.phone)} aria-label={'Abrir conversa com ' + r.name}><MessageCircle />Conversa</button></span></div>)}{!list.length && <p className="muted-text" style={{ padding: 14 }}>Ninguém nesta situação.</p>}</div>
        <p className="reference-note">Visualizou, respondeu e comprou são marcados por você, olhando o WhatsApp. Com o WhatsApp oficial ligado (aba Automático), entrega, leitura e resposta passam a aparecer sozinhas.</p>
      </section>
    </>}
  </>;
}
