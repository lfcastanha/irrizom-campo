'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { atualizarListas, carregarPerfil } from '@/lib/dados';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!navigator.onLine) {
      setErro('Precisa de internet para entrar pela primeira vez.');
      return;
    }
    setEntrando(true);
    try {
      const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
      if (error) throw new Error('E-mail ou senha incorretos.');
      const perfil = await carregarPerfil();
      await atualizarListas();
      router.replace(perfil?.papel === 'admin' ? '/painel' : '/');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={entrar}>
        <div>
          <h1>IRRIZOM Campo</h1>
          <p className="dica" style={{ fontSize: 15 }}>
            Entre uma vez neste celular. Depois o app fica conectado, mesmo sem sinal.
          </p>
        </div>
        <input type="email" inputMode="email" autoComplete="username" placeholder="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Senha"
          value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <div className="erros">{erro}</div>}
        <button className="botao" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
