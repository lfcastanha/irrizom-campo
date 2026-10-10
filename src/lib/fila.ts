import { createStore, del, get, keys, set } from 'idb-keyval';
import { sb } from './supabase';

/** Registro do dia como é enviado à função registrar_dia no Supabase. */
export type RegistroPayload = {
  id: string;
  obra_id: string;
  data: string;
  hora_chegada: string;
  hora_saida: string;
  etapa_id: number;
  avanco: number;
  horas_parada: number;
  motivo_parada_id: number | null;
  horas_retrabalho: number;
  causa_retrabalho_id: number | null;
  km_rodados: number | null;
  observacao: string;
  latitude: number | null;
  longitude: number | null;
  preenchido_em: string;
  funcionarios: string[];
};

export type Pendente = {
  id: string;
  payload: RegistroPayload;
  fotos: Blob[];
  resumo: string;          // texto curto para mostrar na lista de pendentes
  tentativas: number;
  ultimoErro?: string;
};

let loja: ReturnType<typeof createStore> | null = null;
const store = () => (loja ??= createStore('irrizom-campo', 'fila'));

export async function enfileirar(p: Pendente) {
  await set(p.id, p, store());
}

export async function listarPendentes(): Promise<Pendente[]> {
  const ks = await keys(store());
  const itens = await Promise.all(ks.map((k) => get<Pendente>(k, store())));
  return itens
    .filter((x): x is Pendente => !!x)
    .sort((a, b) => a.payload.preenchido_em.localeCompare(b.payload.preenchido_em));
}

export async function descartar(id: string) {
  await del(id, store());
}

export type ResultadoSync = { enviados: number; restantes: number; erro?: string };

let emAndamento: Promise<ResultadoSync> | null = null;

/** Envia tudo o que estiver guardado no celular. Seguro chamar várias vezes. */
export function sincronizar(): Promise<ResultadoSync> {
  if (!emAndamento) {
    emAndamento = executar().finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
}

async function executar(): Promise<ResultadoSync> {
  const pendentes = await listarPendentes();
  if (pendentes.length === 0) return { enviados: 0, restantes: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { enviados: 0, restantes: pendentes.length };
  }

  const { data: { session } } = await sb().auth.getSession();
  if (!session) {
    return { enviados: 0, restantes: pendentes.length, erro: 'Sessão expirada. Entre de novo para enviar.' };
  }

  let enviados = 0;
  let erro: string | undefined;
  for (const p of pendentes) {
    try {
      await enviar(p);
      enviados++;
    } catch (e) {
      const msg = traduzirErro(e);
      await set(p.id, { ...p, tentativas: p.tentativas + 1, ultimoErro: msg }, store());
      erro = msg;
      if (ehErroDeRede(e)) break; // sem internet: para e tenta depois
    }
  }
  const restantes = (await keys(store())).length;
  return { enviados, restantes, erro };
}

async function enviar(p: Pendente) {
  const c = sb();
  const caminhos: string[] = [];
  for (let i = 0; i < p.fotos.length; i++) {
    const caminho = `${p.id}/${i + 1}.jpg`;
    const { error } = await c.storage.from('fotos').upload(caminho, p.fotos[i], {
      contentType: 'image/jpeg',
      upsert: false,
    });
    // Se a foto já subiu numa tentativa anterior, segue em frente.
    if (error && !/exist|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
      throw error;
    }
    caminhos.push(caminho);
  }
  const { error } = await c.rpc('registrar_dia', { p: { ...p.payload, fotos: caminhos } });
  if (error) throw error;
  await del(p.id, store());
}

function ehErroDeRede(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /fetch|network|Load failed|timeout/i.test(msg) || (typeof navigator !== 'undefined' && !navigator.onLine);
}

function traduzirErro(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (ehErroDeRede(e)) return 'Sem internet — será enviado depois';
  if (/jornada_valida/.test(msg)) return 'Horário de saída antes da chegada';
  if (/parada_com_motivo/.test(msg)) return 'Parada sem motivo';
  if (/retrabalho_com_causa/.test(msg)) return 'Retrabalho sem causa';
  if (/foreign key/i.test(msg)) return 'Obra, etapa ou pessoa não existe mais no cadastro';
  if (/JWT|auth/i.test(msg)) return 'Sessão expirada. Entre de novo para enviar.';
  return msg;
}
