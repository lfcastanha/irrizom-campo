'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { atualizarListas, carregarPerfil } from '@/lib/dados';
import {
  emailDoLogin, lembrarUsuario, normalizarUsuario, oferecerSalvarSenha, ultimoUsuario, usuarioValido,
} from '@/lib/usuario';

type Modo = 'entrar' | 'cadastrar';

function traduzirErro(msg: string, modo: Modo): string {
  const m = msg.toLowerCase();
  // Site publicado sem as variáveis do Supabase: não é culpa de quem está tentando entrar.
  if (m.startsWith('configure next_public')) return 'App sem configuração do servidor. Avise o coordenador.';
  if (m.includes('already registered') || m.includes('already exists')) return 'Esse usuário já existe. Escolha outro.';
  if (m.includes('password') && (m.includes('6') || m.includes('weak') || m.includes('short'))) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'O cadastro está desligado. Fale com o coordenador.';
  // Provedor "Email" desligado no Supabase: bloqueia cadastro e login por senha.
  if (m.includes('email signups are disabled') || m.includes('email logins are disabled') || m.includes('provider is disabled')) {
    return 'Login por usuário e senha desligado no servidor. Avise o coordenador.';
  }
  if (m.includes('email not confirmed')) return 'Conta ainda não confirmada. Fale com o coordenador.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Tente de novo.';
  return modo === 'entrar' ? 'Usuário ou senha incorretos.' : `Não foi possível cadastrar: ${msg}`;
}

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('entrar');
  const [usuario, setUsuario] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Preenche o último usuário deste celular; a senha vem do gerenciador de senhas do aparelho.
  useEffect(() => { setUsuario(ultimoUsuario()); }, []);

  function trocar(m: Modo) {
    setModo(m);
    setErro('');
  }

  async function seguir() {
    const perfil = await carregarPerfil();
    if (perfil && perfil.ativo !== false) await atualizarListas();
    router.replace(perfil?.papel === 'admin' ? '/painel' : '/');
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // Lê do formulário, não do estado: o preenchimento automático nem sempre avisa o React.
    const dados = new FormData(form);
    const login = String(dados.get('usuario') ?? '');
    const senha = String(dados.get('senha') ?? '');
    setErro('');
    if (!navigator.onLine) {
      setErro(modo === 'entrar' ? 'Precisa de internet para entrar pela primeira vez.' : 'Precisa de internet para se cadastrar.');
      return;
    }

    if (modo === 'cadastrar') {
      const u = normalizarUsuario(login);
      if (!usuarioValido(u)) {
        setErro('Usuário: de 3 a 30 letras ou números, sem espaço (pode usar ponto, - e _).');
        return;
      }
      if (senha.length < 6) {
        setErro('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }
    }

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await sb().auth.signInWithPassword({ email: emailDoLogin(login), password: senha });
        if (error) throw error;
      } else {
        const nome = String(dados.get('nome') ?? '').trim();
        const { data, error } = await sb().auth.signUp({
          email: emailDoLogin(normalizarUsuario(login)), password: senha, options: { data: { nome } },
        });
        if (error) throw error;
        // Sem sessão = o projeto ainda pede confirmação de e-mail, que este login não tem como receber.
        if (!data.session) throw new Error('email not confirmed');
      }
      lembrarUsuario(modo === 'cadastrar' ? normalizarUsuario(login) : login);
      await oferecerSalvarSenha(form);
      await seguir();
    } catch (err) {
      setErro(traduzirErro((err as Error).message, modo));
    } finally {
      setEnviando(false);
    }
  }

  const cadastro = modo === 'cadastrar';

  return (
    <main className="login">
      <form onSubmit={enviar} key={modo}>
        <div>
          <h1>IRRIZOM Campo</h1>
          <p className="dica" style={{ fontSize: 15 }}>
            {cadastro
              ? 'Crie seu acesso. O coordenador libera antes do primeiro uso.'
              : 'Entre uma vez neste celular. Depois o app fica conectado, mesmo sem sinal.'}
          </p>
        </div>

        <div className="simnao abas" role="tablist">
          <button type="button" role="tab" className="chip" aria-pressed={!cadastro} aria-selected={!cadastro} onClick={() => trocar('entrar')}>
            Entrar
          </button>
          <button type="button" role="tab" className="chip" aria-pressed={cadastro} aria-selected={cadastro} onClick={() => trocar('cadastrar')}>
            Cadastrar
          </button>
        </div>

        {cadastro && (
          <input name="nome" autoComplete="name" autoCapitalize="words" placeholder="Seu nome" required />
        )}
        <input
          id="usuario" name="usuario" autoComplete="username" placeholder="Usuário"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={usuario} onChange={(e) => setUsuario(e.target.value)} required
        />
        <div className="senha">
          <input
            id="senha" name="senha" type={verSenha ? 'text' : 'password'} placeholder="Senha"
            autoComplete={cadastro ? 'new-password' : 'current-password'}
            minLength={cadastro ? 6 : undefined} required
          />
          <button type="button" className="botao sec peq" onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}>
            {verSenha ? 'Esconder' : 'Mostrar'}
          </button>
        </div>
        {cadastro && <p className="dica" style={{ margin: 0 }}>Usuário sem espaço, ex.: joao.silva. Senha com 6 ou mais caracteres.</p>}

        {erro && <div className="erros">{erro}</div>}
        <button className="botao" disabled={enviando}>
          {enviando ? (cadastro ? 'Cadastrando…' : 'Entrando…') : (cadastro ? 'Cadastrar' : 'Entrar')}
        </button>
      </form>
    </main>
  );
}
