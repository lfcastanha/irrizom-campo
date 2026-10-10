'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { carregarPerfil, hojeLocal, NOMES_SISTEMA, perfilSalvo } from '@/lib/dados';

type Reg = {
  id: string; data: string; obra_id: string; obra_codigo: string | null; cliente: string; tipo_sistema: string;
  equipe_id: string | null; equipe: string | null; etapa: string; unidade: string; avanco: number;
  pessoas: number; horas_homem: number; hh_parada: number; hh_retrabalho: number;
  motivo_parada: string | null; causa_retrabalho: string | null; km_rodados: number | null;
  observacao: string | null; preenchido_por: string | null; fotos: number;
  hora_chegada: string; hora_saida: string; latitude: number | null; longitude: number | null;
};
type ObraInd = {
  obra_id: string; codigo: string | null; cliente: string; tipo_sistema: string; area_ha: number | null;
  status: string; dias_trabalhados: number; hh: number; hh_por_ha: number | null; pct_parado: number | null;
  pct_retrabalho: number | null; custo_mao_obra: number; custo_transporte: number; custo_total: number | null;
  custo_por_ha: number | null; margem_pct: number | null; desvio_hh_pct: number | null;
  diarias_sem_custo: number; ultimo_dia: string | null;
};
type Equipe = { id: string; nome: string };

const n1 = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const rs = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
const dataBR = (d: string) => d.split('-').reverse().slice(0, 2).join('/');

function somar<T>(lista: T[], chave: (x: T) => string, valor: (x: T) => number) {
  const m = new Map<string, number>();
  lista.forEach((x) => m.set(chave(x), (m.get(chave(x)) ?? 0) + valor(x)));
  return Array.from(m, ([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}

function Barras({ itens, sufixo }: { itens: { k: string; v: number }[]; sufixo: string }) {
  const max = Math.max(...itens.map((i) => i.v), 1);
  if (!itens.length) return <p className="dica">Nada registrado no período.</p>;
  return (
    <div className="barras">
      {itens.map((i) => (
        <div className="barra" key={i.k}>
          <span>{i.k}</span>
          <div className="trilho"><div className="preench" style={{ width: `${(100 * i.v) / max}%` }} /></div>
          <span className="n">{n1(i.v)} {sufixo}</span>
        </div>
      ))}
    </div>
  );
}

export default function Painel() {
  const router = useRouter();
  const [dias, setDias] = useState(30);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [obras, setObras] = useState<ObraInd[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [fotos, setFotos] = useState<Record<string, string[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const inicio = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dias + 1);
    return hojeLocal(d);
  }, [dias]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const c = sb();
      const [r, o, e] = await Promise.all([
        c.from('v_registros').select('*').gte('data', inicio).order('data', { ascending: false }).order('recebido_em', { ascending: false }).limit(5000),
        c.from('v_obras_indicadores').select('*').neq('status', 'cancelada').order('ultimo_dia', { ascending: false, nullsFirst: false }),
        c.from('equipes').select('id,nome').eq('ativa', true).order('nome'),
      ]);
      if (r.error) throw r.error;
      if (o.error) throw o.error;
      if (e.error) throw e.error;
      setRegs(r.data as Reg[]);
      setObras(o.data as ObraInd[]);
      setEquipes(e.data as Equipe[]);

      // Miniaturas dos 12 registros mais recentes com foto
      const comFoto = (r.data as Reg[]).filter((x) => x.fotos > 0).slice(0, 12).map((x) => x.id);
      if (comFoto.length) {
        const f = await c.from('registro_fotos').select('registro_id,caminho').in('registro_id', comFoto);
        if (!f.error && f.data.length) {
          const s = await c.storage.from('fotos').createSignedUrls(f.data.map((x) => x.caminho), 3600);
          const mapa: Record<string, string[]> = {};
          s.data?.forEach((u, i) => {
            if (!u.signedUrl) return;
            const rid = f.data[i].registro_id as string;
            (mapa[rid] ??= []).push(u.signedUrl);
          });
          setFotos(mapa);
        }
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [inicio]);

  useEffect(() => {
    (async () => {
      let p = perfilSalvo();
      try { p = (await carregarPerfil()) ?? p; } catch { /* usa o salvo */ }
      if (!p) { router.replace('/login'); return; }
      if (p.papel !== 'admin') { router.replace('/'); return; }
      carregar();
    })();
  }, [router, carregar]);

  const r = useMemo(() => {
    const hh = regs.reduce((s, x) => s + Number(x.horas_homem), 0);
    const parada = regs.reduce((s, x) => s + Number(x.hh_parada), 0);
    const retrab = regs.reduce((s, x) => s + Number(x.hh_retrabalho), 0);
    const km = regs.reduce((s, x) => s + Number(x.km_rodados ?? 0), 0);

    const hoje = hojeLocal();
    const ontemD = new Date(); ontemD.setDate(ontemD.getDate() - 1);
    const ontem = hojeLocal(ontemD);
    const comRegistro = (d: string) => new Set(regs.filter((x) => x.data === d).map((x) => x.equipe_id));

    const prod = new Map<string, { etapa: string; unidade: string; avanco: number; hh: number }>();
    regs.forEach((x) => {
      const k = `${x.etapa}|${x.unidade}`;
      const a = prod.get(k) ?? { etapa: x.etapa, unidade: x.unidade, avanco: 0, hh: 0 };
      a.avanco += Number(x.avanco);
      a.hh += Number(x.horas_homem) - Number(x.hh_parada) - Number(x.hh_retrabalho);
      prod.set(k, a);
    });

    const porEquipe = equipes.map((e) => {
      const rs_ = regs.filter((x) => x.equipe_id === e.id);
      const h = rs_.reduce((s, x) => s + Number(x.horas_homem), 0);
      const p_ = rs_.reduce((s, x) => s + Number(x.hh_parada), 0);
      const rt = rs_.reduce((s, x) => s + Number(x.hh_retrabalho), 0);
      return { ...e, dias: new Set(rs_.map((x) => x.data)).size, hh: h, pctParado: pct(p_, h), pctRetrab: pct(rt, h) };
    });

    return {
      hh, parada, retrab, km,
      hoje: comRegistro(hoje), ontem: comRegistro(ontem),
      paradas: somar(regs.filter((x) => x.hh_parada > 0), (x) => x.motivo_parada ?? 'Sem motivo', (x) => Number(x.hh_parada)),
      retrabalhos: somar(regs.filter((x) => x.hh_retrabalho > 0), (x) => x.causa_retrabalho ?? 'Sem causa', (x) => Number(x.hh_retrabalho)),
      produtividade: Array.from(prod.values()).sort((a, b) => b.hh - a.hh),
      porEquipe,
    };
  }, [regs, equipes]);

  function exportarCSV() {
    if (!regs.length) return;
    const cols = Object.keys(regs[0]) as (keyof Reg)[];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Separador ";" e vírgula decimal abrem direto no Excel em português.
    const linhas = [cols.join(';'), ...regs.map((x) => cols.map((c) => {
      const v = x[c];
      return typeof v === 'number' ? String(v).replace('.', ',') : esc(v);
    }).join(';'))];
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `registros_${inicio}_a_${hojeLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="app largo">
      <header className="topo">
        <div>
          <h1>Painel de campo</h1>
          <small>IRRIZOM</small>
        </div>
        <a href="/">Registrar</a>
      </header>

      <div className="filtros">
        {[7, 30, 90, 365].map((d) => (
          <button key={d} className="chip pequeno" aria-pressed={dias === d} onClick={() => setDias(d)}>
            {d === 365 ? '12 meses' : `${d} dias`}
          </button>
        ))}
        <button className="botao sec peq" onClick={carregar}>Atualizar</button>
        <button className="botao sec peq" onClick={exportarCSV} disabled={!regs.length}>Baixar CSV</button>
      </div>

      {erro && <div className="erros">Erro ao carregar: {erro}</div>}
      {carregando && <div className="carregando">Carregando…</div>}

      {!carregando && !erro && (
        <>
          <section className="secao">
            <h2>Quem já registrou</h2>
            <div className="tabela-wrap">
              <table>
                <thead><tr><th>Equipe</th><th>Hoje</th><th>Ontem</th><th className="n">Dias c/ registro</th><th className="n">Horas-homem</th><th className="n">% parado</th><th className="n">% retrabalho</th></tr></thead>
                <tbody>
                  {r.porEquipe.map((e) => (
                    <tr key={e.id}>
                      <td>{e.nome}</td>
                      <td><span className={`selo ${r.hoje.has(e.id) ? 'ok' : 'falta'}`}>{r.hoje.has(e.id) ? 'ok' : 'falta'}</span></td>
                      <td><span className={`selo ${r.ontem.has(e.id) ? 'ok' : 'falta'}`}>{r.ontem.has(e.id) ? 'ok' : 'falta'}</span></td>
                      <td className="n">{e.dias}</td>
                      <td className="n">{n1(e.hh)}</td>
                      <td className={`n ${e.pctParado > 15 ? 'ruim' : ''}`}>{n1(e.pctParado)}%</td>
                      <td className={`n ${e.pctRetrab > 5 ? 'ruim' : ''}`}>{n1(e.pctRetrab)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="kpis">
            <div className="kpi"><div className="v">{regs.length}</div><div className="r">registros</div></div>
            <div className="kpi"><div className="v">{n1(r.hh)}</div><div className="r">horas-homem</div></div>
            <div className="kpi"><div className={`v ${pct(r.parada, r.hh) > 15 ? 'ruim' : ''}`}>{n1(pct(r.parada, r.hh))}%</div><div className="r">tempo parado</div></div>
            <div className="kpi"><div className={`v ${pct(r.retrab, r.hh) > 5 ? 'ruim' : ''}`}>{n1(pct(r.retrab, r.hh))}%</div><div className="r">tempo em retrabalho</div></div>
            <div className="kpi"><div className="v">{n1(r.km)}</div><div className="r">km rodados</div></div>
          </div>

          <div className="grade">
            <section className="secao">
              <h2>Horas-homem paradas, por motivo</h2>
              <Barras itens={r.paradas} sufixo="hh" />
            </section>
            <section className="secao">
              <h2>Horas-homem de retrabalho, por causa</h2>
              <Barras itens={r.retrabalhos} sufixo="hh" />
            </section>
          </div>

          <section className="secao">
            <h2>Produtividade por etapa (por hora-homem produtiva)</h2>
            <div className="tabela-wrap">
              <table>
                <thead><tr><th>Etapa</th><th className="n">Avanço</th><th className="n">HH produtivas</th><th className="n">Por homem-hora</th></tr></thead>
                <tbody>
                  {r.produtividade.map((p) => (
                    <tr key={p.etapa + p.unidade}>
                      <td>{p.etapa}</td>
                      <td className="n">{n1(p.avanco)} {p.unidade}</td>
                      <td className="n">{n1(p.hh)}</td>
                      <td className="n"><b>{p.hh > 0 ? n1(p.avanco / p.hh) : '—'} {p.unidade}/hh</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dica">Etapas em % só são comparáveis dentro de obras parecidas.</p>
          </section>

          <section className="secao">
            <h2>Obras (acumulado desde o início)</h2>
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Obra</th><th>Sistema</th><th className="n">Área</th><th className="n">Dias</th>
                    <th className="n">HH</th><th className="n">HH/ha</th><th className="n">Desvio HH</th>
                    <th className="n">% parado</th><th className="n">Mão de obra</th><th className="n">Transporte</th>
                    <th className="n">Custo/ha</th><th className="n">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {obras.map((o) => (
                    <tr key={o.obra_id}>
                      <td>{o.cliente}{o.codigo ? <span className="dica"> {o.codigo}</span> : null}{o.status === 'concluida' && <span className="dica"> ✓</span>}</td>
                      <td>{NOMES_SISTEMA[o.tipo_sistema] ?? o.tipo_sistema}</td>
                      <td className="n">{n1(o.area_ha)} ha</td>
                      <td className="n">{o.dias_trabalhados}</td>
                      <td className="n">{n1(o.hh)}</td>
                      <td className="n">{n1(o.hh_por_ha)}</td>
                      <td className={`n ${(o.desvio_hh_pct ?? 0) > 10 ? 'ruim' : ''}`}>{o.desvio_hh_pct == null ? '—' : `${o.desvio_hh_pct > 0 ? '+' : ''}${n1(o.desvio_hh_pct)}%`}</td>
                      <td className={`n ${(o.pct_parado ?? 0) > 15 ? 'ruim' : ''}`}>{o.pct_parado == null ? '—' : `${n1(o.pct_parado)}%`}</td>
                      <td className="n">{rs(o.custo_mao_obra)}{o.diarias_sem_custo > 0 ? ' *' : ''}</td>
                      <td className="n">{rs(o.custo_transporte)}</td>
                      <td className="n">{rs(o.custo_por_ha)}</td>
                      <td className={`n ${o.margem_pct == null ? '' : o.margem_pct < 20 ? 'ruim' : 'bom'}`}>{o.margem_pct == null ? '—' : `${n1(o.margem_pct)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dica">
              * há diárias sem custo cadastrado. Margem usa o material real do fechamento ou, antes dele, o material orçado.
              Desvio HH compara com as horas-homem orçadas.
            </p>
          </section>

          <section className="secao">
            <h2>Últimos registros</h2>
            <ul className="registros">
              {regs.slice(0, 15).map((x) => (
                <li key={x.id}>
                  <b>{dataBR(x.data)}</b> · {x.equipe ?? '—'} · {x.cliente} · {x.etapa}: <b>{n1(x.avanco)} {x.unidade}</b> · {x.pessoas} pessoas, {x.hora_chegada.slice(0, 5)}–{x.hora_saida.slice(0, 5)}
                  {x.hh_parada > 0 && <> · <span className="ruim">parada: {x.motivo_parada}</span></>}
                  {x.hh_retrabalho > 0 && <> · <span className="ruim">retrabalho: {x.causa_retrabalho}</span></>}
                  {x.observacao && <div className="dica">“{x.observacao}”</div>}
                  {x.latitude != null && (
                    <> · <a className="dica" href={`https://maps.google.com/?q=${x.latitude},${x.longitude}`} target="_blank" rel="noreferrer">ver local</a></>
                  )}
                  {fotos[x.id] && (
                    <div className="mini">
                      {fotos[x.id].map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="foto do serviço" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
