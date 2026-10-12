'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, RefreshCw, Pause, Play, X, Download, CheckCircle2, AlertTriangle, PlugZap, MessageSquareReply, Users, History as HistoryIcon, ArrowLeft, Copy } from 'lucide-react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Entry, UFS } from '@/lib/model';
import { remoteEnabled } from '@/lib/remote-store';
import {
  AudienceFilters, Campaign, Message, Params, RecipientRow, Stats, Template, VarSource,
  api, buildAudience, defaultParams, loadRecipients, loadWhatsapp, paramsProblem, phonesByState, prettyPhone, recentSet, renderText,
  PRICE_MARKETING_BRL, REGIONS, SOURCE_LABEL, STATUS_LABEL, UF_NAME, contactPhone,
} from '@/lib/whatsapp';
import { Badge, Choice, exportCsv } from './shared';

type WA = Awaited<ReturnType<typeof loadWhatsapp>>;
type Run = { id: string; sent: number; failed: number; skipped: number; status: string; reason?: string };
type StatusInfo = { missing: string[]; webhookUrl: string; subscribed: boolean | null; errors: string[]; phone: null | { platform_type?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; name_status?: string; code_verification_status?: string; whatsapp_business_manager_messaging_limit?: string; throughput?: { level?: string } } };

const tabs = [['novo', 'Novo disparo', Send], ['historico', 'Disparos feitos', HistoryIcon], ['respostas', 'Respostas', MessageSquareReply], ['conexao', 'Conexão', PlugZap]] as const;
const GENDERS = ['Mulher', 'Homem', 'Não informado'];
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const toneOf = (s: string) => (['concluida', 'entregue', 'lida'].includes(s) ? 'green' : ['falhou', 'cancelada'].includes(s) ? 'red' : ['pausada', 'pulada'].includes(s) ? 'gold' : ['enviando', 'enviada'].includes(s) ? 'blue' : 'neutral');

export default function Dispatch({ entries, initialTab = 'novo' }: { entries: Entry[]; initialTab?: 'novo' | 'historico' }) {
  const remote = remoteEnabled();
  const [tab, setTab] = useState<string>(initialTab);
  const [wa, setWa] = useState<WA | null>(null), [waError, setWaError] = useState('');
  const [templates, setTemplates] = useState<Template[] | null>(null), [tplError, setTplError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const stopRef = useRef(false);

  const reload = useCallback(async () => {
    if (!remote) return;
    try { setWa(await loadWhatsapp()); setWaError(''); } catch (e) { setWaError(e instanceof Error ? e.message : 'Não foi possível carregar os disparos.'); }
  }, [remote]);
  const loadTemplates = useCallback(async () => {
    if (!remote) return;
    try { setTemplates((await api<{ templates: Template[] }>('templates')).templates); setTplError(''); } catch (e) { setTplError(e instanceof Error ? e.message : 'Erro ao buscar modelos.'); setTemplates([]); }
  }, [remote]);
  useEffect(() => { queueMicrotask(() => { void reload(); void loadTemplates(); }); }, [reload, loadTemplates]);

  /** Envia lote por lote até acabar, pausar ou o usuário parar. */
  const start = useCallback(async (id: string) => {
    if (run && run.status === 'enviando') return;
    stopRef.current = false;
    let acc: Run = { id, sent: 0, failed: 0, skipped: 0, status: 'enviando' };
    setRun(acc); setOpenId(id); setTab('historico');
    try {
      for (let guard = 0; guard < 1000 && !stopRef.current; guard++) {
        const r = await api<{ status: string; reason?: string; sent: number; failed: number; skipped: number }>('dispatch', { campaignId: id });
        acc = { ...acc, sent: acc.sent + r.sent, failed: acc.failed + r.failed, skipped: acc.skipped + r.skipped, status: r.status, reason: r.reason };
        setRun(acc);
        if (r.status !== 'enviando') break;
        await new Promise(res => setTimeout(res, 400));
        if (guard % 4 === 3) void reload();
      }
      if (stopRef.current) { await api('control', { campaignId: id, action: 'pause' }); acc = { ...acc, status: 'pausada', reason: 'Pausado no CRM.' }; setRun(acc); }
    } catch (e) {
      setRun({ ...acc, status: 'erro', reason: e instanceof Error ? e.message : 'Falha no envio.' });
    }
    void reload();
  }, [run, reload]);

  const unread = wa?.messages.filter(m => m.direction === 'in' && !m.read_by_crm).length || 0;
  return <>
    <div className="wa-tabs" role="tablist">{tabs.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); if (id !== 'historico') setOpenId(null); }}><Icon />{label}{id === 'respostas' && unread > 0 && <b>{unread}</b>}</button>)}</div>
    {!remote && <div className="wa-note"><AlertTriangle /><div><strong>Modo demonstração.</strong> Dá para montar o público e ver a prévia, mas o envio só funciona com o banco (Supabase) e o WhatsApp ligados na Vercel.</div></div>}
    {waError && <div className="wa-note error"><AlertTriangle /><div><strong>Não consegui ler os disparos no banco.</strong> {waError} Confira se o arquivo <code>supabase/whatsapp.sql</code> já foi rodado no Supabase.</div></div>}
    {run && run.status === 'enviando' && tab !== 'historico' && <button className="wa-running" onClick={() => { setTab('historico'); setOpenId(run.id); }}><RefreshCw className="spin" />Enviando… {run.sent} enviadas. Abrir</button>}
    {remote && tab === 'novo' && !waError && templates !== null && (tplError || !templates.some(t => t.status === 'APPROVED')) && <div className="wa-note"><AlertTriangle /><div><strong>Ainda não dá para disparar.</strong> {tplError || 'Nenhum modelo de mensagem aprovado pela Meta.'} Você já pode montar o público abaixo. <button className="text-button" onClick={() => setTab('conexao')}>Ver o que falta na Conexão</button></div></div>}
    {tab === 'novo' && <NewDispatch entries={entries} wa={wa} templates={templates} tplError={tplError} reloadTemplates={loadTemplates} onCreated={id => { void reload(); void start(id); }} />}
    {tab === 'historico' && (openId ? <CampaignDetail key={openId} campaign={wa?.campaigns.find(c => c.id === openId)} stats={wa?.stats.get(openId)} run={run?.id === openId ? run : null} onBack={() => setOpenId(null)} onStart={() => void start(openId)} onStop={() => { stopRef.current = true; }} reload={reload} /> : <HistoryList wa={wa} open={setOpenId} reload={reload} />)}
    {tab === 'respostas' && <Inbox wa={wa} entries={entries} reload={reload} />}
    {tab === 'conexao' && <Connection />}
  </>;
}

/* ============================== NOVO DISPARO ============================== */
function NewDispatch({ entries, wa, templates, tplError, reloadTemplates, onCreated }: { entries: Entry[]; wa: WA | null; templates: Template[] | null; tplError: string; reloadTemplates: () => Promise<void>; onCreated: (id: string) => void }) {
  const remote = remoteEnabled();
  const [f, setF] = useState<AudienceFilters>({ states: [], noState: false, genders: [], consentOnly: true, excludeDays: 7 });
  const [tplKey, setTplKey] = useState(''), [params, setParams] = useState<Params | null>(null);
  const [testPhone, setTestPhone] = useState(''), [testMsg, setTestMsg] = useState<{ text: string; error?: boolean } | null>(null), [testing, setTesting] = useState(false);
  const [name, setName] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showList, setShowList] = useState(false);

  const counts = useMemo(() => phonesByState(entries), [entries]);
  const usedUfs = UFS.filter(u => counts.get(u));
  const consents = useMemo(() => wa?.consents ?? new Map<string, string>(), [wa]);
  const recent = useMemo(() => recentSet(wa?.lastSent ?? new Map(), f.excludeDays), [wa, f.excludeDays]);
  const { recipients, excluded } = useMemo(() => buildAudience(entries, f, consents, recent), [entries, f, consents, recent]);
  const authorizedTotal = useMemo(() => entries.filter(e => e.kind === 'contact' && consents.get(contactPhone(e.data)) === 'autorizou').length, [entries, consents]);
  const approved = (templates || []).filter(t => t.status === 'APPROVED');
  const tpl = approved.find(t => t.name + '|' + t.language === tplKey);
  const picked = f.states.filter(u => counts.get(u));
  const pickedTotal = picked.reduce((n, u) => n + (counts.get(u) || 0), 0) + (f.noState ? counts.get('') || 0 : 0);
  const sample = recipients[0] || { name: 'Maria Silva', city: 'Brasília, DF', state: 'DF' };
  const problem = !recipients.length ? (pickedTotal && f.consentOnly && excluded.semAutorizacao ? 'Ninguém dos estados escolhidos autorizou receber ainda (veja a regra no passo 1).' : pickedTotal ? 'Ninguém sobrou depois das regras do passo 1.' : 'Escolha pelo menos um estado com contatos.') : !tpl || !params ? 'Escolha o modelo de mensagem.' : paramsProblem(tpl, params);
  const autoName = `${tpl ? tpl.name.replace(/_/g, ' ') : 'Disparo'} · ${f.states.length > 4 ? f.states.length + ' estados' : f.states.join(', ') || 'sem UF'} · ${new Date().toLocaleDateString('pt-BR')}`;

  const byState = recipients.reduce((m, r) => m.set(r.state || 'sem UF', (m.get(r.state || 'sem UF') || 0) + 1), new Map<string, number>());
  const regionOn = (ufs: string[]) => ufs.some(u => usedUfs.includes(u)) && ufs.filter(u => usedUfs.includes(u)).every(u => f.states.includes(u));
  const toggleRegion = (ufs: string[]) => setF(x => { const mine = ufs.filter(u => usedUfs.includes(u)); return { ...x, states: mine.every(u => x.states.includes(u)) ? x.states.filter(s => !mine.includes(s)) : [...new Set([...x.states, ...mine])] }; });
  const toggleState = (uf: string) => setF(x => ({ ...x, states: x.states.includes(uf) ? x.states.filter(s => s !== uf) : [...x.states, uf] }));
  const toggleGender = (g: string) => setF(x => ({ ...x, genders: x.genders.includes(g) ? x.genders.filter(s => s !== g) : [...x.genders, g] }));
  const chooseTpl = (key: string) => { setTplKey(key); const t = approved.find(x => x.name + '|' + x.language === key); setParams(t ? defaultParams(t) : null); setConfirm(false); };
  const setVar = (i: number, patch: Partial<{ source: VarSource; value: string }>) => setParams(p => p && ({ ...p, body: p.body.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  async function sendTest() {
    if (!tpl || !params) return;
    setTesting(true); setTestMsg(null);
    try { const r = await api<{ to: string }>('test', { template: tpl.name, language: tpl.language, params, phone: testPhone, sample }); setTestMsg({ text: `Teste enviado para ${prettyPhone(r.to)}. Confira no celular antes de disparar.` }); }
    catch (e) { setTestMsg({ text: e instanceof Error ? e.message : 'Falha no teste.', error: true }); }
    finally { setTesting(false); }
  }
  async function create() {
    if (problem || !tpl || !params || !confirm) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ campaignId: string; total: number }>('campaigns', { name: name.trim() || autoName, template: tpl.name, language: tpl.language, params, filters: f, contactIds: recipients.map(x => x.id) });
      setConfirm(false); onCreated(r.campaignId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar o disparo.'); }
    finally { setBusy(false); }
  }

  return <div className="wa-grid">
    <section className="panel wa-step">
      <p className="eyebrow">1 · PARA QUEM</p><h2>Escolha os estados</h2>
      <p className="muted-text">Clique em um estado ou junte vários no mesmo disparo. O número mostra quantos clientes ativos têm WhatsApp naquele estado.</p>
      <div className="chip-row">{usedUfs.map(uf => <button key={uf} title={UF_NAME[uf]} className={'chip ' + (f.states.includes(uf) ? 'on' : '')} aria-pressed={f.states.includes(uf)} aria-label={`${UF_NAME[uf]}, ${counts.get(uf)} contatos`} onClick={() => toggleState(uf)}>{uf}<small>{counts.get(uf)}</small></button>)}
        {(counts.get('') || 0) > 0 && <button className={'chip ' + (f.noState ? 'on' : '')} aria-pressed={f.noState} onClick={() => setF(x => ({ ...x, noState: !x.noState }))}>Sem estado<small>{counts.get('')}</small></button>}
      </div>
      <h3>Juntar por região</h3>
      <div className="chip-row">{REGIONS.filter(([, ufs]) => ufs.some(u => usedUfs.includes(u))).map(([region, ufs]) => <button key={region} className={'chip ' + (regionOn(ufs) ? 'on' : '')} aria-pressed={regionOn(ufs)} title={ufs.filter(u => usedUfs.includes(u)).join(', ')} onClick={() => toggleRegion(ufs)}>{region}<small>{ufs.reduce((n, u) => n + (counts.get(u) || 0), 0)}</small></button>)}</div>
      <div className="chip-actions"><button className="text-button" onClick={() => setF(x => ({ ...x, states: usedUfs, noState: false }))}>Brasil inteiro</button><button className="text-button" onClick={() => setF(x => ({ ...x, states: [], noState: false }))}>Limpar</button></div>
      <p className="wa-picked" role="status">{picked.length || f.noState ? <><strong>{[...picked.map(u => `${u} ${counts.get(u)}`), ...(f.noState ? [`sem estado ${counts.get('') || 0}`] : [])].join(' + ')}</strong>{picked.length + (f.noState ? 1 : 0) > 1 ? ` = ${pickedTotal}` : ''} com WhatsApp, antes das regras abaixo.</> : 'Nenhum estado escolhido ainda.'}</p>

      <h3>Gênero</h3>
      <div className="chip-row">{GENDERS.map(g => <button key={g} className={'chip ' + (f.genders.includes(g) ? 'on' : '')} aria-pressed={f.genders.includes(g)} onClick={() => toggleGender(g)}>{g}</button>)}<span className="muted-text small">{f.genders.length ? '' : 'Nenhum marcado = todos'}</span></div>
      <p className="reference-note">Gênero vazio no cadastro é estimado pelo primeiro nome e pode errar.</p>

      <h3>Regras</h3>
      <label className="wa-check"><input type="checkbox" checked={f.consentOnly} onChange={e => setF(x => ({ ...x, consentOnly: e.target.checked }))} /> <span><strong>Só quem autorizou receber</strong><small>{authorizedTotal} contatos autorizados até agora. A Meta exige autorização para mensagens de marketing.</small></span></label>
      <div className="wa-check"><span><strong>Não enviar para quem recebeu disparo nos últimos</strong></span><Choice label="Dias sem receber" value={String(f.excludeDays)} onChange={v => setF(x => ({ ...x, excludeDays: Number(v) }))} options={[['0', 'não usar'], ['3', '3 dias'], ['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias']]} /></div>
      <p className="reference-note">Quem respondeu SAIR, PARAR ou pediu para não receber nunca entra, mesmo com tudo desmarcado.</p>

      <div className="wa-audience">
        <strong>{recipients.length}</strong><span>pessoas vão receber</span>
        <ul>
          {excluded.semTelefone > 0 && <li>{excluded.semTelefone} sem WhatsApp válido no cadastro</li>}
          {excluded.semAutorizacao > 0 && <li>{excluded.semAutorizacao} ainda sem autorização (regra acima)</li>}
          {excluded.sairam > 0 && <li>{excluded.sairam} pediram para sair</li>}
          {excluded.recentes > 0 && <li>{excluded.recentes} receberam disparo recentemente</li>}
          {excluded.repetidos > 0 && <li>{excluded.repetidos} telefones repetidos</li>}
        </ul>
        {recipients.length > 0 && <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}><button className="secondary-button" onClick={() => setShowList(!showList)}><Users />{showList ? 'Esconder lista' : 'Ver lista'}</button><button className="secondary-button" onClick={() => exportCsv([['Nome', 'WhatsApp', 'UF', 'Cidade', 'Gênero'], ...recipients.map(r => [r.name, prettyPhone(r.phone), r.state, r.city, r.gender])], 'publico-disparo.csv')}><Download />Baixar lista</button></div>}
        {f.consentOnly && !recipients.length && f.states.length > 0 && excluded.semAutorizacao > 0 && <p className="wa-hint">Ninguém desses estados autorizou ainda. Veja em <em>Respostas → Autorizações</em> como registrar quem aceita receber, ou desmarque a regra por sua conta e risco.</p>}
      </div>
      {showList && <div className="wa-list">{recipients.slice(0, 300).map(r => <div key={r.id}><span>{r.name}</span><small>{prettyPhone(r.phone)} · {r.state || 'sem UF'}</small></div>)}{recipients.length > 300 && <p className="muted-text">… e mais {recipients.length - 300}. Use “Baixar lista” para ver todos.</p>}</div>}
    </section>

    <section className="panel wa-step">
      <p className="eyebrow">2 · MENSAGEM</p><h2>Escolha o modelo aprovado</h2>
      <p className="muted-text">Promoções pela API oficial precisam de um modelo aprovado pela Meta. Os modelos são criados no Gerenciador do WhatsApp (veja a aba Conexão).</p>
      {!remote ? <p className="wa-hint">Disponível quando o WhatsApp estiver conectado.</p> : templates === null ? <p className="muted-text">Buscando modelos…</p> : tplError ? <div className="wa-hint"><p>{tplError}</p><button className="secondary-button" onClick={() => void reloadTemplates()}><RefreshCw />Tentar de novo</button></div> : !approved.length ? <div className="wa-hint"><p>Nenhum modelo aprovado ainda.{templates.length ? ` ${templates.length} em análise ou recusado(s): ${templates.map(t => `${t.name} (${t.status})`).join(', ')}.` : ''}</p><button className="secondary-button" onClick={() => void reloadTemplates()}><RefreshCw />Atualizar</button></div> :
        <Choice label="Modelo de mensagem" value={tplKey} onChange={chooseTpl} options={[['', 'Escolha um modelo…'], ...approved.map(t => [t.name + '|' + t.language, `${t.name} · ${t.language} · ${t.category === 'MARKETING' ? 'marketing' : t.category.toLowerCase()}`])]} />}
      {tpl && params && <>
        {tpl.header?.format && tpl.header.format !== 'TEXT' && <label className="wa-field">Link da {tpl.header.format === 'IMAGE' ? 'imagem' : tpl.header.format === 'VIDEO' ? 'vídeo' : 'documento'} (https)<input value={params.header.link || ''} onChange={e => setParams({ ...params, header: { ...params.header, link: e.target.value.trim() } })} placeholder="https://casastudart.com.br/wp-content/uploads/promo.jpg" /></label>}
        {params.header.var && <VarRow label={`Título {{${params.header.var.key}}}`} v={params.header.var} onChange={patch => setParams({ ...params, header: { ...params.header, var: { ...params.header.var!, ...patch } } })} />}
        {params.body.map((v, i) => <VarRow key={v.key} label={`Variável {{${v.key}}}`} v={v} onChange={patch => setVar(i, patch)} />)}
        {params.buttons.map((b, i) => <label key={b.index} className="wa-field">Final do link do botão “{tpl.buttons[b.index]?.text}” <small>{tpl.buttons[b.index]?.url}</small><input value={b.value} onChange={e => setParams({ ...params, buttons: params.buttons.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="ex.: promocao-outubro" /></label>)}
        <div className="whatsapp-phone" style={{ margin: '16px 0' }}>
          <div className="whatsapp-bubble wa-preview">
            {tpl.header?.format === 'TEXT' && <strong>{renderText(tpl.header.text, params.header.var ? [params.header.var] : [], sample)}</strong>}
            {tpl.header && tpl.header.format !== 'TEXT' && <div className="wa-media">{params.header.link ? (tpl.header.format === 'IMAGE' ? <img src={params.header.link} alt="" /> : tpl.header.format) : `[${tpl.header.format}]`}</div>}
            <div>{renderText(tpl.body, params.body, sample)}</div>
            {tpl.footer && <small>{tpl.footer}</small>}
            {tpl.buttons.length > 0 && <div className="wa-buttons">{tpl.buttons.map(b => <span key={b.index}>{b.text}</span>)}</div>}
          </div>
          <small>Prévia com: {sample.name}{recipients.length ? '' : ' (exemplo)'}</small>
        </div>
        <h3>Teste no seu celular</h3>
        <div className="toolbar"><input className="wa-input" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Seu WhatsApp com DDD" inputMode="tel" aria-label="WhatsApp de teste" /><button className="secondary-button" disabled={testing || !!paramsProblem(tpl, params) || !testPhone.trim()} onClick={() => void sendTest()}><Send />{testing ? 'Enviando…' : 'Enviar teste'}</button></div>
        {testMsg && <p role={testMsg.error ? 'alert' : 'status'} className={testMsg.error ? 'form-error' : 'wa-ok'}>{testMsg.text}</p>}
      </>}
    </section>

    <section className="panel wa-step wa-confirm">
      <p className="eyebrow">3 · CONFIRMAR E DISPARAR</p>
      <label className="wa-field">Nome do disparo (só para você achar depois)<input value={name} onChange={e => setName(e.target.value)} placeholder={autoName} maxLength={120} /></label>
      <div className="wa-summary">
        <div><span>Destinatários</span><strong>{recipients.length}</strong></div>
        <div><span>Por estado</span><strong>{[...byState].map(([uf, n]) => `${uf} ${n}`).join(' · ') || '—'}</strong></div>
        <div><span>Modelo</span><strong>{tpl?.name || '—'}</strong></div>
        <div><span>Custo estimado na Meta</span><strong>{tpl?.category === 'MARKETING' || !tpl ? '≈ ' + brl(recipients.length * PRICE_MARKETING_BRL) : 'consultar'}</strong></div>
      </div>
      <p className="reference-note">Estimativa com cerca de {brl(PRICE_MARKETING_BRL)} por mensagem de marketing entregue no Brasil. A cobrança é da Meta, no cartão cadastrado na conta do WhatsApp. Número novo começa com limite de 250 pessoas por 24 h: acima disso, o envio pausa sozinho e você continua no dia seguinte.</p>
      <label className="wa-check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} disabled={!!problem} /> <span><strong>Conferi a lista e o teste. Pode disparar.</strong><small>O envio começa na hora e segue em lotes. Dá para pausar a qualquer momento.</small></span></label>
      {problem && <p className="muted-text">{problem}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="whatsapp-button wa-go" disabled={!!problem || !confirm || busy || !remote} onClick={() => void create()}><Send />{busy ? 'Preparando…' : `Disparar para ${recipients.length} pessoa${recipients.length === 1 ? '' : 's'}`}</button>
    </section>
  </div>;
}

function VarRow({ label, v, onChange }: { label: string; v: { source: VarSource; value: string }; onChange: (p: Partial<{ source: VarSource; value: string }>) => void }) {
  return <div className="wa-var"><span>{label}</span><Choice label={label} value={v.source} onChange={s => onChange({ source: s as VarSource })} options={Object.entries(SOURCE_LABEL)} />{v.source === 'fixed' && <input className="wa-input" value={v.value} onChange={e => onChange({ value: e.target.value })} placeholder="ex.: 15% de desconto até domingo" maxLength={200} />}</div>;
}

/* ============================== HISTÓRICO ============================== */
function HistoryList({ wa, open, reload }: { wa: WA | null; open: (id: string) => void; reload: () => Promise<void> }) {
  if (!remoteEnabled()) return <section className="panel wa-step"><p className="muted-text">Os disparos aparecem aqui depois que o WhatsApp for conectado.</p></section>;
  if (!wa) return <section className="panel wa-step"><p className="muted-text">Carregando…</p></section>;
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DISPAROS</p><h2>O que já foi enviado</h2></div><button className="secondary-button" onClick={() => void reload()}><RefreshCw />Atualizar</button></div>
    {!wa.campaigns.length ? <p className="muted-text" style={{ padding: '0 24px 24px' }}>Nenhum disparo ainda.</p> :
      <Table><TableHeader><TableRow><TableHead>Disparo</TableHead><TableHead>Situação</TableHead><TableHead>Enviadas</TableHead><TableHead>Entregues</TableHead><TableHead>Lidas</TableHead><TableHead>Falhas</TableHead></TableRow></TableHeader><TableBody>
        {wa.campaigns.map(c => { const s = wa.stats.get(c.id); return <TableRow key={c.id}><TableCell><button className="row-link" onClick={() => open(c.id)}><strong>{c.name}</strong></button><small className="table-meta">{when(c.created_at)} · {c.template_name}</small></TableCell><TableCell><Badge tone={toneOf(c.status)}>{STATUS_LABEL[c.status] || c.status}</Badge></TableCell><TableCell>{s?.enviadas ?? 0} / {s?.total ?? 0}</TableCell><TableCell>{s?.entregues ?? 0}</TableCell><TableCell>{s?.lidas ?? 0}</TableCell><TableCell>{s?.falhas ?? 0}</TableCell></TableRow>; })}
      </TableBody></Table>}
  </section>;
}

function CampaignDetail({ campaign, stats, run, onBack, onStart, onStop, reload }: { campaign?: Campaign; stats?: Stats; run: Run | null; onBack: () => void; onStart: () => void; onStop: () => void; reload: () => Promise<void> }) {
  const [rows, setRows] = useState<RecipientRow[] | null>(null), [filter, setFilter] = useState('all'), [msg, setMsg] = useState('');
  const refresh = useCallback(async () => { if (campaign) { try { setRows(await loadRecipients(campaign.id)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); } } }, [campaign]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh, run?.sent, run?.status]);
  if (!campaign) return <section className="panel wa-step"><button className="secondary-button" onClick={onBack}><ArrowLeft />Voltar</button><p className="muted-text">Carregando disparo…</p></section>;
  const running = run?.status === 'enviando';
  const total = stats?.total || rows?.length || 0;
  const done = (stats?.enviadas || 0) + (stats?.falhas || 0) + (stats?.puladas || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const finished = ['concluida', 'cancelada'].includes(campaign.status);
  async function control(action: string) { try { await api('control', { campaignId: campaign!.id, action }); await reload(); if (action === 'resume') onStart(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); } }
  const list = (rows || []).filter(r => filter === 'all' || r.status === filter);
  return <section className="panel">
    <div className="panel-heading"><div><button className="text-button" onClick={onBack}><ArrowLeft />Todos os disparos</button><h2 style={{ marginTop: 8 }}>{campaign.name}</h2><p>{campaign.template_name} · criado {when(campaign.created_at)} por {campaign.created_by || '—'}</p></div><Badge tone={toneOf(running ? 'enviando' : campaign.status)}>{running ? 'Enviando agora' : STATUS_LABEL[campaign.status]}</Badge></div>
    <div className="wa-progress-wrap"><div className="wa-progress"><i style={{ width: pct + '%' }} /></div><span>{done} de {total} processadas ({pct}%)</span></div>
    <div className="wa-summary" style={{ margin: '0 24px 18px' }}>
      <div><span>Enviadas</span><strong>{stats?.enviadas ?? 0}</strong></div><div><span>Entregues</span><strong>{stats?.entregues ?? 0}</strong></div><div><span>Lidas</span><strong>{stats?.lidas ?? 0}</strong></div><div><span>Falhas</span><strong>{stats?.falhas ?? 0}</strong></div><div><span>Na fila</span><strong>{stats?.fila ?? 0}</strong></div>
    </div>
    {(run?.reason || campaign.pause_reason) && !running && campaign.status === 'pausada' && <div className="wa-note" style={{ margin: '0 24px 16px' }}><Pause /><div><strong>Pausado:</strong> {run?.reason || campaign.pause_reason}</div></div>}
    {run?.status === 'erro' && <div className="wa-note error" style={{ margin: '0 24px 16px' }}><AlertTriangle /><div>{run.reason} O que já saiu está salvo; clique em Continuar envio para seguir.</div></div>}
    {msg && <p className="form-error" style={{ margin: '0 24px' }}>{msg}</p>}
    <div className="message-actions" style={{ justifyContent: 'flex-start' }}>
      {running ? <button className="secondary-button" onClick={onStop}><Pause />Pausar</button> : !finished && <button className="whatsapp-button" onClick={() => void (campaign.status === 'pausada' ? control('resume') : onStart())}><Play />{campaign.status === 'pronta' ? 'Começar envio' : 'Continuar envio'}</button>}
      {!finished && !running && <button className="secondary-button" onClick={() => { if (window.confirm('Cancelar o restante deste disparo? Quem já recebeu não é afetado.')) void control('cancel'); }}><X />Cancelar restante</button>}
      <button className="secondary-button" onClick={() => { void reload(); void refresh(); }}><RefreshCw />Atualizar</button>
      {rows && <button className="secondary-button" onClick={() => exportCsv([['Nome', 'WhatsApp', 'UF', 'Situação', 'Enviada em', 'Erro'], ...rows.map(r => [r.name, prettyPhone(r.phone), r.state, STATUS_LABEL[r.status], when(r.sent_at), r.error])], 'disparo-' + campaign.name.slice(0, 40) + '.csv')}><Download />Baixar relatório</button>}
    </div>
    {!running && campaign.status === 'enviando' && <p className="reference-note" style={{ margin: '0 24px 12px' }}>O envio roda enquanto esta tela está aberta. Se a aba fechou no meio, clique em Continuar envio: ninguém recebe duas vezes.</p>}
    <div className="toolbar" style={{ margin: '0 24px 12px' }}><Choice label="Filtrar situação" value={filter} onChange={setFilter} options={[['all', 'Todas as situações'], ...['fila', 'enviada', 'entregue', 'lida', 'falhou', 'pulada'].map(s => [s, STATUS_LABEL[s]])]} /></div>
    {rows === null ? <p className="muted-text" style={{ padding: '0 24px 24px' }}>Carregando lista…</p> :
      <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>WhatsApp</TableHead><TableHead>UF</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>
        {list.slice(0, 500).map(r => <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell>{prettyPhone(r.phone)}</TableCell><TableCell>{r.state || '—'}</TableCell><TableCell><Badge tone={toneOf(r.status)}>{STATUS_LABEL[r.status]}</Badge>{r.error && <small className="table-meta">{r.error}</small>}</TableCell></TableRow>)}
      </TableBody></Table>}
  </section>;
}

/* ============================== RESPOSTAS ============================== */
function Inbox({ wa, entries, reload }: { wa: WA | null; entries: Entry[]; reload: () => Promise<void> }) {
  const [phone, setPhone] = useState<string | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [bulk, setBulk] = useState('');
  const names = useMemo(() => { const m = new Map<string, string>(); entries.forEach(e => { if (e.kind === 'contact') { const p = contactPhone(e.data); if (p) m.set(p, e.data.name); } }); return m; }, [entries]);
  if (!remoteEnabled()) return <section className="panel wa-step"><p className="muted-text">As respostas dos clientes aparecem aqui depois que o WhatsApp for conectado.</p></section>;
  if (!wa) return <section className="panel wa-step"><p className="muted-text">Carregando…</p></section>;
  const threads = new Map<string, Message[]>();
  [...wa.messages].reverse().forEach(m => threads.set(m.phone, [...(threads.get(m.phone) || []), m]));
  const list = [...threads.entries()].sort((a, b) => b[1][b[1].length - 1].created_at.localeCompare(a[1][a[1].length - 1].created_at));
  const thread = phone ? threads.get(phone) || [] : [];
  const lastIn = [...thread].reverse().find(m => m.direction === 'in');
  const windowOpen = !!lastIn && Date.now() - Date.parse(lastIn.created_at) < 24 * 3600 * 1000;
  const label = (p: string, fallback?: string | null) => names.get(p) || fallback || prettyPhone(p);
  async function call(path: string, body: unknown, ok: string) { setBusy(true); setMsg(null); try { await api(path, body); setMsg({ text: ok }); await reload(); return true; } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Erro', error: true }); return false; } finally { setBusy(false); } }
  async function openThread(p: string) { setPhone(p); setMsg(null); if (threads.get(p)?.some(m => m.direction === 'in' && !m.read_by_crm)) { try { await api('inbox', { action: 'read', phone: p }); void reload(); } catch { /* sem problema */ } } }
  const authorized = [...wa.consents].filter(([, s]) => s === 'autorizou').length, out = [...wa.consents].filter(([, s]) => s === 'saiu').length;
  return <div className="wa-grid two">
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">CONVERSAS</p><h2>Quem respondeu</h2></div><button className="secondary-button" onClick={() => void reload()}><RefreshCw />Atualizar</button></div>
      {!list.length ? <p className="muted-text" style={{ padding: '0 24px 24px' }}>Nenhuma resposta ainda.</p> : list.map(([p, msgs]) => { const last = msgs[msgs.length - 1]; const unread = msgs.filter(m => m.direction === 'in' && !m.read_by_crm).length; return <button key={p} className={'campaign-row ' + (phone === p ? 'active' : '')} onClick={() => void openThread(p)}><div><strong>{label(p, msgs.find(m => m.name)?.name)}</strong><small>{last.direction === 'out' ? 'Você: ' : ''}{last.body.slice(0, 70)}</small></div><div style={{ textAlign: 'right' }}><small>{when(last.created_at)}</small>{unread > 0 && <Badge tone="green">{unread} nova{unread > 1 ? 's' : ''}</Badge>}{wa.consents.get(p) === 'saiu' && <Badge tone="red">saiu</Badge>}</div></button>; })}
    </section>
    <section className="panel wa-step">
      {!phone ? <>
        <p className="eyebrow">AUTORIZAÇÕES</p><h2>Quem pode receber promoções</h2>
        <p className="muted-text"><strong>{authorized}</strong> autorizaram · <strong>{out}</strong> pediram para sair.</p>
        <p className="muted-text">Quando o cliente responde “SAIR”, “PARAR” ou toca no botão “Não quero receber”, ele sai da lista sozinho. Quem toca em “Quero receber” ou responde “Sim, quero” entra como autorizado.</p>
        <p className="muted-text">Para registrar à mão quem autorizou (no balcão, no site, numa conversa), cole os números abaixo, um por linha:</p>
        <textarea className="wa-textarea" value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'61 99999-0000\n11 98888-1111'} />
        <div className="message-actions" style={{ padding: 0, justifyContent: 'flex-start' }}>
          <button className="whatsapp-button" disabled={busy || !bulk.trim()} onClick={async () => { if (await call('inbox', { action: 'consent', status: 'autorizou', phones: bulk.split(/\n|;/), source: 'Autorização registrada no CRM' }, 'Autorizações registradas.')) setBulk(''); }}><CheckCircle2 />Marcar como autorizados</button>
          <button className="secondary-button" disabled={busy || !bulk.trim()} onClick={async () => { if (await call('inbox', { action: 'consent', status: 'saiu', phones: bulk.split(/\n|;/), source: 'Pediu para sair (registrado no CRM)' }, 'Descadastros registrados.')) setBulk(''); }}><X />Marcar como “não quer receber”</button>
        </div>
        {msg && <p className={msg.error ? 'form-error' : 'wa-ok'}>{msg.text}</p>}
      </> : <>
        <button className="text-button" onClick={() => setPhone(null)}><ArrowLeft />Autorizações</button>
        <h2 style={{ margin: '8px 0 2px' }}>{label(phone, thread.find(m => m.name)?.name)}</h2><p className="muted-text">{prettyPhone(phone)} · {wa.consents.get(phone) === 'autorizou' ? 'autorizou receber' : wa.consents.get(phone) === 'saiu' ? 'pediu para sair' : 'sem registro de autorização'}</p>
        <div className="wa-thread">{thread.map(m => <div key={m.id} className={'wa-msg ' + m.direction}><p>{m.body}</p><small>{when(m.created_at)}{m.direction === 'out' && m.status ? ' · ' + (STATUS_LABEL[m.status] || m.status) : ''}</small></div>)}</div>
        {windowOpen ? <><textarea className="wa-textarea" value={text} onChange={e => setText(e.target.value)} placeholder="Escreva a resposta…" maxLength={4000} />
          <div className="message-actions" style={{ padding: 0 }}><button className="whatsapp-button" disabled={busy || !text.trim()} onClick={async () => { if (await call('reply', { phone, text }, 'Resposta enviada.')) setText(''); }}><Send />Responder</button></div></>
          : <p className="wa-hint">Passaram mais de 24 h da última mensagem do cliente. Pela regra do WhatsApp, só dá para escrever de novo com um modelo aprovado.</p>}
        <div className="message-actions" style={{ padding: '12px 0 0', justifyContent: 'flex-start' }}>
          <button className="secondary-button" disabled={busy} onClick={() => void call('inbox', { action: 'consent', status: 'autorizou', phones: [phone], source: 'Marcado na conversa' }, 'Marcado como autorizado.')}><CheckCircle2 />Autorizou receber</button>
          <button className="secondary-button" disabled={busy} onClick={() => void call('inbox', { action: 'consent', status: 'saiu', phones: [phone], source: 'Marcado na conversa' }, 'Marcado: não quer receber.')}><X />Não quer receber</button>
        </div>
        {msg && <p className={msg.error ? 'form-error' : 'wa-ok'}>{msg.text}</p>}
      </>}
    </section>
  </div>;
}

/* ============================== CONEXÃO ============================== */
const ENV_HELP: Record<string, string> = {
  WHATSAPP_TOKEN: 'Token permanente do usuário do sistema (Meta Business)',
  WHATSAPP_PHONE_ID: 'Identificação do número de telefone (não é o número)',
  WHATSAPP_WABA_ID: 'Identificação da conta do WhatsApp Business',
  WHATSAPP_APP_SECRET: 'Chave secreta do app (Configurações do app → Básico)',
  WHATSAPP_VERIFY_TOKEN: 'Uma senha qualquer inventada por você para o webhook',
  SUPABASE_SERVICE_ROLE_KEY: 'Chave secreta do Supabase (Project Settings → API)',
  VITE_SUPABASE_URL: 'Endereço do projeto Supabase',
};
function Connection() {
  const [info, setInfo] = useState<StatusInfo | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [pin, setPin] = useState(''), [regMsg, setRegMsg] = useState('');
  const load = useCallback(async () => { if (!remoteEnabled()) return; try { setInfo(await api<StatusInfo>('status')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const ok = (v: boolean) => (v ? <CheckCircle2 className="wa-yes" /> : <AlertTriangle className="wa-no" />);
  const p = info?.phone;
  return <section className="panel wa-step">
    <div className="panel-heading" style={{ padding: 0, marginBottom: 12 }}><div><p className="eyebrow">CONEXÃO COM A META</p><h2>WhatsApp oficial do Hugo</h2></div><button className="secondary-button" onClick={() => void load()}><RefreshCw />Verificar</button></div>
    {!remoteEnabled() ? <p className="wa-hint">Primeiro ligue o banco (Supabase) na Vercel. Depois esta tela mostra o que falta para o WhatsApp.</p> : error ? <p className="form-error">{error}</p> : !info ? <p className="muted-text">Verificando…</p> : <>
      <ul className="wa-checklist">
        <li>{ok(!info.missing.length)}<div><strong>Variáveis na Vercel</strong>{info.missing.length ? <ul>{info.missing.map(m => <li key={m}><code>{m}</code> — {ENV_HELP[m]}</li>)}</ul> : <small>Todas configuradas.</small>}</div></li>
        <li>{ok(!!p?.display_phone_number)}<div><strong>Número</strong><small>{p?.display_phone_number ? `${p.display_phone_number} · ${p.verified_name || ''} · nome ${p.name_status === 'APPROVED' ? 'aprovado' : (p.name_status || '—').toLowerCase()}` : 'Ainda não encontrado.'}</small></div></li>
        {p && p.code_verification_status !== 'VERIFIED' || (p && p.platform_type && p.platform_type !== 'CLOUD_API') ? <li>{ok(false)}<div><strong>Ativar o número na API</strong><small>Crie um PIN de 6 números (guarde: ele protege o número) e clique em Ativar.</small><div className="toolbar" style={{ margin: '8px 0 0' }}><input className="wa-input" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN de 6 números" inputMode="numeric" aria-label="PIN de 6 números" /><button className="secondary-button" disabled={busy || pin.length !== 6} onClick={async () => { setBusy(true); setRegMsg(''); try { await api('status', { action: 'register', pin }); setRegMsg('Número ativado.'); await load(); } catch (e) { setRegMsg(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); } }}>Ativar</button></div>{regMsg && <small>{regMsg}</small>}</div></li> : null}
        {p && <li>{ok(p.quality_rating === 'GREEN' || p.quality_rating === 'UNKNOWN')}<div><strong>Qualidade</strong><small>{{ GREEN: 'Alta (verde)', YELLOW: 'Média (amarelo): reduza a frequência', RED: 'Baixa (vermelho): pare os disparos e revise', UNKNOWN: 'Ainda sem avaliação' }[p.quality_rating || ''] || p.quality_rating}</small></div></li>}
        {p && <li>{ok(true)}<div><strong>Limite de pessoas por 24 h</strong><small>{p.whatsapp_business_manager_messaging_limit ? p.whatsapp_business_manager_messaging_limit.replace('TIER_', '').replace('UNLIMITED', 'ilimitado') : 'Começa em 250 e sobe sozinho com bom uso ou com a verificação da empresa.'}</small></div></li>}
        <li>{ok(info.subscribed === true)}<div><strong>Webhook (entregas e respostas)</strong><small>URL para colar no app da Meta:</small><code className="wa-url">{info.webhookUrl}</code><div className="message-actions" style={{ padding: '8px 0 0', justifyContent: 'flex-start' }}><button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(info.webhookUrl).then(() => setCopied(true)); }}><Copy />{copied ? 'Copiado' : 'Copiar URL'}</button>{info.subscribed === false && <button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); try { await api('status', { action: 'subscribe' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); } }}><PlugZap />Ligar webhook na conta</button>}</div></div></li>
      </ul>
      {info.errors.map(e => <p key={e} className="form-error">{e}</p>)}
    </>}
    <p className="reference-note">Passo a passo completo no arquivo WHATSAPP-DISPAROS.md, na pasta do CRM.</p>
  </section>;
}
