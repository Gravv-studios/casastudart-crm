'use client';
import { useEffect, useState } from 'react';
import { LogIn, KeyRound, LogOut } from 'lucide-react';
import { isMember, remoteEnabled, supabase } from '@/lib/remote-store';

type State={phase:'loading'|'login'|'recovery'|'denied'|'ready';email?:string};

export function signOut(){if(remoteEnabled())void supabase().auth.signOut().then(()=>window.location.reload());}

export function AuthGate({children}:{children:React.ReactNode}){
 const [state,setState]=useState<State>({phase:remoteEnabled()?'loading':'ready'});
 useEffect(()=>{
  if(!remoteEnabled())return;
  const sb=supabase();let alive=true;
  async function check(){const {data:{session}}=await sb.auth.getSession();if(!alive)return;if(!session){setState({phase:'login'});return;}
   try{setState({phase:await isMember()?'ready':'denied',email:session.user.email});}catch{setState({phase:'denied',email:session.user.email});}}
  void check();
  const {data:sub}=sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')setState({phase:'recovery'});else if(event==='SIGNED_IN'||event==='SIGNED_OUT')void check();});
  return()=>{alive=false;sub.subscription.unsubscribe();};
 },[]);
 if(state.phase==='ready')return <>{children}</>;
 return <main className="auth-screen"><section className="panel auth-card"><p className="eyebrow">CRM DO HUGO · CASA STUDART</p>
  {state.phase==='loading'&&<p>Carregando…</p>}
  {state.phase==='login'&&<LoginForm/>}
  {state.phase==='recovery'&&<NewPassword onDone={()=>window.location.reload()}/>}
  {state.phase==='denied'&&<><h1>Acesso não liberado</h1><p>O usuário <strong>{state.email}</strong> entrou, mas ainda não tem permissão neste CRM. Peça para a GRAVV liberar o seu e-mail.</p><button className="secondary-button" onClick={signOut}><LogOut/>Sair</button></>}
 </section></main>;
}

function LoginForm(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg('');const {error}=await supabase().auth.signInWithPassword({email:email.trim(),password});setBusy(false);if(error)setMsg(error.message.includes('Invalid')?'E-mail ou senha incorretos.':'Não foi possível entrar. Tente de novo.');}
 async function reset(){if(!email.trim()){setMsg('Digite seu e-mail para receber o link.');return;}setBusy(true);const {error}=await supabase().auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});setBusy(false);setMsg(error?'Não foi possível enviar o link agora.':'Se o e-mail estiver cadastrado, o link para criar uma nova senha chega em alguns minutos.');}
 return <form onSubmit={submit}><h1>Entrar</h1><p>Use o e-mail e a senha liberados para você.</p>
  <label className="field"><span>E-mail</span><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label className="field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {msg&&<p role="status" className="auth-msg">{msg}</p>}
  <div className="auth-actions"><button className="primary-button" disabled={busy}><LogIn/>{busy?'Entrando…':'Entrar'}</button><button type="button" className="text-button" onClick={()=>void reset()} disabled={busy}>Esqueci a senha</button></div></form>;
}

function NewPassword({onDone}:{onDone:()=>void}){
 const [password,setPassword]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(password.length<8){setMsg('Use pelo menos 8 caracteres.');return;}setBusy(true);const {error}=await supabase().auth.updateUser({password});setBusy(false);if(error)setMsg('Não foi possível salvar a senha. Peça um novo link.');else{window.history.replaceState(null,'',window.location.pathname);onDone();}}
 return <form onSubmit={submit}><h1>Nova senha</h1><p>Crie a senha que você vai usar para entrar no CRM.</p>
  <label className="field"><span>Nova senha</span><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {msg&&<p role="status" className="auth-msg">{msg}</p>}
  <div className="auth-actions"><button className="primary-button" disabled={busy}><KeyRound/>Salvar senha</button></div></form>;
}
