/**
 * Login por nome de usuário. O Supabase Auth exige e-mail, então "joao" vira joao@irrizom.app.
 * O domínio é só um identificador: "Confirm email" fica desligado e ninguém recebe mensagem.
 * Precisa bater com a migração 20261010130000_usuario_e_aprovacao_de_cadastro.sql.
 */
const DOMINIO = 'irrizom.app';
const K_USUARIO = 'irrizom-ultimo-usuario';

/** Minúsculas, sem acento e sem espaço: "João Silva" → "joaosilva". */
export function normalizarUsuario(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
}

export function usuarioValido(u: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(u);
}

/** Aceita usuário ou, para quem foi cadastrado com e-mail de verdade, o próprio e-mail. */
export function emailDoLogin(texto: string): string {
  const t = texto.trim().toLowerCase();
  return t.includes('@') ? t : `${normalizarUsuario(t)}@${DOMINIO}`;
}

// Só o nome de usuário fica guardado no celular; a senha fica a cargo do gerenciador de senhas.
export function ultimoUsuario(): string {
  try { return localStorage.getItem(K_USUARIO) ?? ''; } catch { return ''; }
}
export function lembrarUsuario(u: string) {
  try { localStorage.setItem(K_USUARIO, u.trim()); } catch { /* armazenamento bloqueado */ }
}

/** No Chrome (Android), pede para salvar login e senha; outros navegadores salvam pelo formulário. */
export async function oferecerSalvarSenha(form: HTMLFormElement) {
  const PC = (window as unknown as { PasswordCredential?: new (f: HTMLFormElement) => Credential }).PasswordCredential;
  if (!PC || !navigator.credentials) return;
  try { await navigator.credentials.store(new PC(form)); } catch { /* usuário recusou ou navegador não deixou */ }
}
