import { sb } from './supabase';

export type Obra = { id: string; codigo: string | null; cliente: string; propriedade: string | null; tipo_sistema: string };
export type Etapa = { id: number; nome: string; unidade: string };
export type Item = { id: number; nome: string };
export type Funcionario = { id: string; nome: string; funcao: string; equipe_id: string | null };
export type Perfil = {
  id: string; nome: string; usuario: string | null; papel: 'admin' | 'encarregado';
  /** false = cadastrou pelo app e ainda espera o admin liberar. Perfis guardados antes disso vêm sem o campo. */
  ativo?: boolean;
  equipe_id: string | null; equipe_nome: string | null;
};

export type Listas = {
  obras: Obra[];
  etapas: Etapa[];
  motivos: Item[];
  causas: Item[];
  funcionarios: Funcionario[];
  atualizadoEm: string;
};

/** O que o celular lembra do último envio, para não precisar marcar de novo. */
export type Ultimo = {
  obra_id?: string;
  funcionarios?: string[];
  hora_chegada?: string;
  hora_saida?: string;
  etapa_id?: number;
};

const K_LISTAS = 'irrizom-listas';
const K_PERFIL = 'irrizom-perfil';
const K_ULTIMO = 'irrizom-ultimo';

function ler<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cache */
  }
}

export const listasSalvas = () => ler<Listas>(K_LISTAS);
export const perfilSalvo = () => ler<Perfil>(K_PERFIL);
export const ultimoSalvo = () => ler<Ultimo>(K_ULTIMO) ?? {};
export const salvarUltimo = (u: Ultimo) => gravar(K_ULTIMO, u);

export function limparDadosLocais() {
  [K_LISTAS, K_PERFIL, K_ULTIMO].forEach((k) => localStorage.removeItem(k));
}

function checar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/** Baixa obras, etapas, motivos e pessoas e guarda no celular para uso sem sinal. */
export async function atualizarListas(): Promise<Listas> {
  const c = sb();
  const [obras, etapas, motivos, causas, funcionarios] = await Promise.all([
    c.from('obras').select('id,codigo,cliente,propriedade,tipo_sistema')
      .in('status', ['em_andamento', 'planejada']).order('cliente'),
    c.from('etapas').select('id,nome,unidade').eq('ativa', true).order('ordem'),
    c.from('motivos_parada').select('id,nome').eq('ativo', true).order('id'),
    c.from('causas_retrabalho').select('id,nome').eq('ativo', true).order('id'),
    c.from('funcionarios').select('id,nome,funcao,equipe_id').eq('ativo', true).order('nome'),
  ]);
  const listas: Listas = {
    obras: checar(obras),
    etapas: checar(etapas),
    motivos: checar(motivos),
    causas: checar(causas),
    funcionarios: checar(funcionarios),
    atualizadoEm: new Date().toISOString(),
  };
  gravar(K_LISTAS, listas);
  return listas;
}

export async function carregarPerfil(): Promise<Perfil | null> {
  const c = sb();
  const { data: { session } } = await c.auth.getSession();
  if (!session) return null;
  const { data, error } = await c
    .from('perfis')
    .select('id,nome,usuario,papel,ativo,equipe_id,equipes(nome)')
    .eq('id', session.user.id)
    .single();
  if (error) throw new Error(error.message);
  const eq = data.equipes as unknown as { nome: string } | null;
  const perfil: Perfil = {
    id: data.id,
    nome: data.nome,
    usuario: data.usuario,
    papel: data.papel,
    ativo: data.ativo,
    equipe_id: data.equipe_id,
    equipe_nome: eq?.nome ?? null,
  };
  gravar(K_PERFIL, perfil);
  return perfil;
}

/** Data de hoje no fuso do celular, no formato AAAA-MM-DD. */
export function hojeLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function novoId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const NOMES_SISTEMA: Record<string, string> = {
  gotejamento: 'Gotejamento',
  aspersao_convencional: 'Aspersão',
  microaspersao: 'Microaspersão',
  carretel: 'Carretel',
  pivo: 'Pivô',
  jardim_talude: 'Jardim/talude',
  outro: 'Outro',
};
