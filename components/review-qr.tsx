'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Camera, Copy, Download, ExternalLink, Star } from 'lucide-react';

const STORAGE_KEY = 'crm-hugo-public-links-v1';
const DEFAULT_LINKS = { google: '', instagram: '' };
type Links = typeof DEFAULT_LINKS;
type Channel = keyof Links;

function normalizeGoogle(value: string) {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  const directReview = (host === 'g.page' && url.pathname.replace(/\/+$/, '').endsWith('/review')) ||
    (host === 'search.google.com' && url.pathname === '/local/writereview' && url.searchParams.has('placeid'));
  if (url.protocol !== 'https:' || !directReview) throw new Error('Use o link direto de avaliação do Perfil da Empresa no Google, terminado em /review.');
  return url.toString();
}

function normalizeInstagram(value: string) {
  const input = value.trim();
  if (/^@?[a-zA-Z0-9._]+$/.test(input)) return `https://www.instagram.com/${input.replace(/^@/, '')}/`;
  const url = new URL(input);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) || !/^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname)) {
    throw new Error('Use o link do perfil do Instagram ou o @usuario.');
  }
  return url.toString();
}

function readLinks(): Links {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Links>;
    return { google: value.google || DEFAULT_LINKS.google, instagram: value.instagram || DEFAULT_LINKS.instagram };
  } catch { return DEFAULT_LINKS; }
}

function QRCard({ channel, url }: { channel: Channel; url: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const google = channel === 'google';
  const title = google ? 'Avalie no Google' : 'Siga no Instagram';

  useEffect(() => {
    let active = true;
    setImage('');
    setError('');
    if (url) QRCode.toDataURL(url, { width: 360, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#241c16', light: '#ffffff' } })
      .then(data => { if (active) setImage(data); })
      .catch(() => { if (active) setError('Não foi possível criar este QR Code.'); });
    return () => { active = false; };
  }, [url]);

  async function downloadQr() {
    try {
      const data = await QRCode.toDataURL(url, { width: 1200, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#241c16', light: '#ffffff' } });
      const anchor = document.createElement('a');
      anchor.href = data;
      anchor.download = google ? 'qr-avaliar-google.png' : 'qr-instagram.png';
      anchor.click();
    } catch { setError('Não foi possível baixar a imagem.'); }
  }

  return <section className="panel qr-card">
    <div className="qr-card-heading">{google ? <Star /> : <Camera />}<div><p className="eyebrow">{google ? 'AVALIAÇÕES' : 'REDES SOCIAIS'}</p><h2>{title}</h2></div></div>
    <p>{google ? 'O cliente aponta a câmera e abre a página para escolher as estrelas e escrever um comentário.' : 'O cliente aponta a câmera e abre o perfil da empresa no Instagram.'}</p>
    <div className="qr-image-frame">{image ? <img src={image} alt={`QR Code para ${title.toLowerCase()}`} /> : <span>{url ? 'Gerando QR Code…' : 'Cadastre o link acima para criar o QR Code.'}</span>}</div>
    {url && <div className="qr-actions"><a className="secondary-button" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink />Testar link</a><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(url)}><Copy />Copiar link</button><button className="primary-button" disabled={!image} onClick={() => void downloadQr()}><Download />Baixar PNG</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

export default function ReviewQr() {
  const [draft, setDraft] = useState<Links>(DEFAULT_LINKS);
  const [saved, setSaved] = useState<Links>(DEFAULT_LINKS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { const links = readLinks(); setDraft(links); setSaved(links); }, []);

  function save() {
    try {
      const next = {
        google: draft.google.trim() ? normalizeGoogle(draft.google) : '',
        instagram: draft.instagram.trim() ? normalizeInstagram(draft.instagram) : '',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setDraft(next);
      setSaved(next);
      setError('');
      setMessage('Links salvos neste navegador. QR Codes atualizados.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira os links informados.'); setMessage(''); }
  }

  return <>
    <section className="panel qr-setup">
      <div className="panel-heading"><div><p className="eyebrow">CONVITES PARA CLIENTES</p><h2>Configure os destinos dos QR Codes</h2><p>Use o link direto de avaliação do Google e o perfil oficial do Instagram.</p></div></div>
      <div className="qr-fields">
        <label className="field"><span>Link para avaliar no Google</span><input type="url" value={draft.google} onChange={event => setDraft({ ...draft, google: event.target.value })} placeholder="https://g.page/r/.../review" /><small>Copie em Perfil da Empresa → Ler avaliações → Receber mais avaliações.</small></label>
        <label className="field"><span>Instagram da empresa</span><input value={draft.instagram} onChange={event => setDraft({ ...draft, instagram: event.target.value })} placeholder="@perfil ou https://www.instagram.com/perfil/" /></label>
        <div className="qr-save-row"><button className="primary-button" onClick={save}>Salvar e gerar QR Codes</button>{message && <span role="status">{message}</span>}{error && <span role="alert" className="form-error">{error}</span>}</div>
      </div>
    </section>
    <div className="qr-grid"><QRCard channel="google" url={saved.google} /><QRCard channel="instagram" url={saved.instagram} /></div>
  </>;
}
