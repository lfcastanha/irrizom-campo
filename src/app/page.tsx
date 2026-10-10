'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chips, SimNao } from '@/components/Chips';
import { sb } from '@/lib/supabase';
import {
  atualizarListas, carregarPerfil, hojeLocal, limparDadosLocais, listasSalvas,
  Listas, novoId, Perfil, perfilSalvo, salvarUltimo, ultimoSalvo,
} from '@/lib/dados';
import { descartar, enfileirar, listarPendentes, Pendente, RegistroPayload, sincronizar } from '@/lib/fila';
import { comprimirFoto } from '@/lib/foto';

const HORAS = [0.5, 1, 2, 3, 4, 6, 8].map((h) => ({ valor: h, rotulo: `${String(h).replace('.', ',')} h` }));
const MAX_FOTOS = 4;

type Foto = { blob: Blob; url: string };

function num(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
function minutos(h: string) {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + (b || 0);
}

export default function RegistroDiario() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [listas, setListas] = useState<Listas | null>(null);
  const [pronto, setPronto] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [verFila, setVerFila] = useState(false);
  const [msgSync, setMsgSync] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<null | 'enviado' | 'guardado'>(null);
  const [erros, setErros] = useState<string[]>([]);

  // Campos do formulário
  const [obraId, setObraId] = useState('');
  const [data, setData] = useState(hojeLocal());
  const [funcs, setFuncs] = useState<string[]>([]);
  const [mostrarOutros, setMostrarOutros] = useState(false);
  const [chegada, setChegada] = useState('07:00');
  const [saida, setSaida] = useState('17:00');
  const [etapaId, setEtapaId] = useState<number | null>(null);
  const [avanco, setAvanco] = useState('');
  const [teveParada, setTeveParada] = useState(false);
  const [horasParada, setHorasParada] = useState<number | null>(null);
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [teveRetrab, setTeveRetrab] = useState(false);
  const [horasRetrab, setHorasRetrab] = useState<number | null>(null);
  const [causaId, setCausaId] = useState<number | null>(null);
  const [km, setKm] = useState('');
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const gps = useRef<{ lat: number; lng: number } | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const atualizarFila = useCallback(async () => setPendentes(await listarPendentes()), []);

  const rodarSync = useCallback(async () => {
    try {
      const r = await sincronizar();
      await atualizarFila();
      if (r.erro) setMsgSync({ tipo: 'erro', texto: r.erro });
      else if (r.enviados > 0) setMsgSync({ tipo: 'ok', texto: `${r.enviados} registro(s) enviado(s) ✓` });
      return r;
    } catch (e) {
      setMsgSync({ tipo: 'erro', texto: (e as Error).message });
      return null;
    }
  }, [atualizarFila]);

  // Inicialização: usa o que está guardado no celular e atualiza se houver sinal.
  useEffect(() => {
    setOnline(navigator.onLine);
    (async () => {
      let p = perfilSalvo();
      if (!p) {
        try { p = await carregarPerfil(); } catch { p = null; }
        if (!p) { router.replace('/login'); return; }
      }
      setPerfil(p);
      setListas(listasSalvas());
      const u = ultimoSalvo();
      if (u.obra_id) setObraId(u.obra_id);
      if (u.funcionarios) setFuncs(u.funcionarios);
      if (u.hora_chegada) setChegada(u.hora_chegada);
      if (u.hora_saida) setSaida(u.hora_saida);
      if (u.etapa_id) setEtapaId(u.etapa_id);
      setPronto(true);

      await atualizarFila();
      if (navigator.onLine) {
        atualizarListas().then(setListas).catch(() => {});
        carregarPerfil().then((x) => x && setPerfil(x)).catch(() => {});
        rodarSync();
      }
    })();

    navigator.geolocation?.getCurrentPosition(
      (pos) => { gps.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );

    const aoConectar = () => {
      setOnline(true);
      rodarSync();
      atualizarListas().then(setListas).catch(() => {});
    };
    const aoDesconectar = () => setOnline(false);
    const aoVoltar = () => { if (document.visibilityState === 'visible' && navigator.onLine) rodarSync(); };
    window.addEventListener('online', aoConectar);
    window.addEventListener('offline', aoDesconectar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.removeEventListener('online', aoConectar);
      window.removeEventListener('offline', aoDesconectar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [router, atualizarFila, rodarSync]);

  const obras = listas?.obras ?? [];
  const etapa = listas?.etapas.find((e) => e.id === etapaId) ?? null;

  const { daEquipe, outros } = useMemo(() => {
    const todos = listas?.funcionarios ?? [];
    if (!perfil?.equipe_id) return { daEquipe: todos, outros: [] };
    return {
      daEquipe: todos.filter((f) => f.equipe_id === perfil.equipe_id),
      outros: todos.filter((f) => f.equipe_id !== perfil.equipe_id),
    };
  }, [listas, perfil]);

  // Apaga o aviso de "falta completar" assim que a pessoa mexe no formulário.
  useEffect(() => {
    setErros([]);
  }, [obraId, funcs, chegada, saida, etapaId, avanco, teveParada, horasParada, motivoId, teveRetrab, horasRetrab, causaId]);

  // Se a obra lembrada não está mais ativa, limpa a escolha.
  useEffect(() => {
    if (listas && obraId && !listas.obras.some((o) => o.id === obraId)) setObraId('');
  }, [listas, obraId]);

  const alternarFunc = (id: string) =>
    setFuncs((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  async function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS - fotos.length);
    e.target.value = '';
    if (!arquivos.length) return;
    setProcessandoFoto(true);
    try {
      const novas: Foto[] = [];
      for (const a of arquivos) {
        const blob = await comprimirFoto(a);
        novas.push({ blob, url: URL.createObjectURL(blob) });
      }
      setFotos((f) => [...f, ...novas]);
    } finally {
      setProcessandoFoto(false);
    }
  }

  function removerFoto(i: number) {
    setFotos((f) => {
      URL.revokeObjectURL(f[i].url);
      return f.filter((_, j) => j !== i);
    });
  }

  function validar(): string[] {
    const e: string[] = [];
    if (!obraId) e.push('Escolha a obra');
    if (!data) e.push('Informe a data');
    if (funcs.length === 0) e.push('Marque quem trabalhou');
    if (!chegada || !saida || minutos(saida) <= minutos(chegada)) e.push('A saída precisa ser depois da chegada');
    if (!etapaId) e.push('Escolha a etapa do dia');
    const av = num(avanco);
    if (av === null || av < 0) e.push('Informe quanto avançou (pode ser 0)');
    if (etapa?.unidade === '%' && av !== null && av > 100) e.push('Avanço em % não passa de 100');
    const jornada = (minutos(saida) - minutos(chegada)) / 60;
    if (teveParada && (!horasParada || !motivoId)) e.push('Parada: escolha as horas e o motivo');
    if (teveRetrab && (!horasRetrab || !causaId)) e.push('Retrabalho: escolha as horas e a causa');
    if ((teveParada ? horasParada ?? 0 : 0) + (teveRetrab ? horasRetrab ?? 0 : 0) > jornada) {
      e.push('Horas paradas + retrabalho passam do total do dia');
    }
    if (km && (num(km) === null || num(km)! < 0)) e.push('Km rodados inválido');
    return e;
  }

  async function salvar() {
    const e = validar();
    setErros(e);
    if (e.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setSalvando(true);
    try {
      const id = novoId();
      const payload: RegistroPayload = {
        id,
        obra_id: obraId,
        data,
        hora_chegada: chegada,
        hora_saida: saida,
        etapa_id: etapaId!,
        avanco: num(avanco) ?? 0,
        horas_parada: teveParada ? horasParada ?? 0 : 0,
        motivo_parada_id: teveParada ? motivoId : null,
        horas_retrabalho: teveRetrab ? horasRetrab ?? 0 : 0,
        causa_retrabalho_id: teveRetrab ? causaId : null,
        km_rodados: km ? num(km) : null,
        observacao: obs.trim(),
        latitude: gps.current?.lat ?? null,
        longitude: gps.current?.lng ?? null,
        preenchido_em: new Date().toISOString(),
        funcionarios: funcs,
      };
      const obra = obras.find((o) => o.id === obraId);
      const [, m, d] = data.split('-');
      await enfileirar({
        id,
        payload,
        fotos: fotos.map((f) => f.blob),
        resumo: `${d}/${m} · ${obra?.cliente ?? 'Obra'} · ${etapa?.nome ?? ''}`,
        tentativas: 0,
      });
      salvarUltimo({ obra_id: obraId, funcionarios: funcs, hora_chegada: chegada, hora_saida: saida, etapa_id: etapaId! });

      // Limpa só o que muda todo dia.
      fotos.forEach((f) => URL.revokeObjectURL(f.url));
      setFotos([]); setAvanco(''); setTeveParada(false); setHorasParada(null); setMotivoId(null);
      setTeveRetrab(false); setHorasRetrab(null); setCausaId(null); setKm(''); setObs('');
      setData(hojeLocal());

      await rodarSync();
      const restantes = await listarPendentes();
      setFeito(restantes.some((p) => p.id === id) ? 'guardado' : 'enviado');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErros([`Não foi possível salvar no celular: ${(err as Error).message}`]);
    } finally {
      setSalvando(false);
    }
  }

  async function sair() {
    if (pendentes.length && !confirm(`Há ${pendentes.length} registro(s) não enviados neste celular. Sair mesmo assim? Eles continuam guardados.`)) return;
    try { await sb().auth.signOut({ scope: 'local' }); } catch { /* sem sinal */ }
    limparDadosLocais();
    router.replace('/login');
  }

  async function descartarPendente(p: Pendente) {
    if (!confirm(`Apagar o registro "${p.resumo}" sem enviar?`)) return;
    await descartar(p.id);
    await atualizarFila();
  }

  async function verificarLiberacao() {
    setErros([]);
    try {
      const p = await carregarPerfil();
      if (p) setPerfil(p);
      if (p?.ativo !== false) setListas(await atualizarListas());
    } catch (err) {
      setErros([`Não foi possível verificar: ${(err as Error).message}`]);
    }
  }

  if (!pronto) return <div className="carregando">Carregando…</div>;

  // Cadastrou pelo app e o coordenador ainda não liberou.
  if (perfil?.ativo === false) {
    return (
      <main className="aguardando">
        <div>
          <div className="icone">⏳</div>
          <h1>Cadastro aguardando liberação</h1>
          <p style={{ margin: 0 }}>
            Olá, {perfil.nome}! O coordenador precisa liberar seu acesso{perfil.usuario ? <> (usuário <b>{perfil.usuario}</b>)</> : null}.
            Fale com o coordenador e depois toque em verificar.
          </p>
          {erros.length > 0 && <div className="erros">{erros[0]}</div>}
          <button className="botao" onClick={verificarLiberacao} disabled={!online}>
            {online ? 'Verificar de novo' : 'Sem sinal'}
          </button>
          <button className="botao sec" onClick={sair}>Sair</button>
        </div>
      </main>
    );
  }

  const topo = (
    <header className="topo">
      <div>
        <h1>Registro do dia</h1>
        <small>{perfil?.nome}{perfil?.equipe_nome ? ` · ${perfil.equipe_nome}` : ''}</small>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {perfil?.papel === 'admin' && <a href="/painel">Painel</a>}
        <button className="link" style={{ background: 'none', border: 0, padding: 0 }} onClick={sair}>Sair</button>
      </div>
    </header>
  );

  const faixa = (
    <>
      {pendentes.length > 0 ? (
        <div className="faixa pendente">
          <span onClick={() => setVerFila((v) => !v)} style={{ cursor: 'pointer' }}>
            {pendentes.length} aguardando envio {verFila ? '▴' : '▾'}
          </span>
          {online && <button className="botao peq" onClick={rodarSync}>Enviar agora</button>}
        </div>
      ) : !online ? (
        <div className="faixa pendente">Sem sinal — pode preencher, o envio é automático depois.</div>
      ) : msgSync?.tipo === 'ok' ? (
        <div className="faixa ok">{msgSync.texto}</div>
      ) : null}
      {msgSync?.tipo === 'erro' && pendentes.length > 0 && <div className="faixa erro">{msgSync.texto}</div>}
      {verFila && pendentes.length > 0 && (
        <ul className="pendentes">
          {pendentes.map((p) => (
            <li key={p.id}>
              <div>
                {p.resumo}{p.fotos.length ? ` · ${p.fotos.length} foto(s)` : ''}
                {p.ultimoErro && <div className="err">{p.ultimoErro}</div>}
              </div>
              <button className="botao sec peq" onClick={() => descartarPendente(p)}>Apagar</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (feito) {
    return (
      <main className="app">
        {topo}
        {faixa}
        <div className="sucesso">
          <div className="icone">{feito === 'enviado' ? '✅' : '📥'}</div>
          <h2>{feito === 'enviado' ? 'Registro enviado!' : 'Guardado no celular'}</h2>
          <p className="dica" style={{ fontSize: 16 }}>
            {feito === 'enviado'
              ? 'Obrigado. Bom descanso!'
              : 'Será enviado sozinho quando o celular pegar internet. Não precisa fazer nada.'}
          </p>
          <button className="botao sec" style={{ marginTop: 16 }} onClick={() => setFeito(null)}>
            Registrar outra obra ou etapa
          </button>
        </div>
      </main>
    );
  }

  if (!listas || listas.obras.length === 0) {
    return (
      <main className="app">
        {topo}
        {faixa}
        <div className="bloco">
          {!listas
            ? 'Abra o app com internet uma vez para baixar as obras e a equipe.'
            : 'Nenhuma obra ativa cadastrada. Peça ao coordenador para cadastrar a obra.'}
          {online && (
            <div style={{ marginTop: 12 }}>
              <button className="botao" onClick={() => atualizarListas().then(setListas).catch((e) => setErros([e.message]))}>
                Tentar de novo
              </button>
            </div>
          )}
        </div>
        {erros.length > 0 && <div className="erros">{erros[0]}</div>}
      </main>
    );
  }

  return (
    <main className="app">
      {topo}
      {faixa}

      {erros.length > 0 && (
        <div className="erros">
          Falta completar:
          <ul>{erros.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <section className="bloco">
        <label className="rotulo"><span className="num">1</span>Obra</label>
        <select value={obraId} onChange={(e) => setObraId(e.target.value)}>
          <option value="">Escolha a obra…</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.cliente}{o.propriedade ? ` — ${o.propriedade}` : ''}{o.codigo ? ` (${o.codigo})` : ''}
            </option>
          ))}
        </select>
        <div className="linha2" style={{ marginTop: 10 }}>
          <div>
            <label>Data</label>
            <input type="date" value={data} max={hojeLocal()} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        {data !== hojeLocal() && <p className="dica">Registro de um dia anterior.</p>}
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">2</span>Quem trabalhou hoje</label>
        <div className="chips">
          {daEquipe.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={funcs.includes(f.id)} onClick={() => alternarFunc(f.id)}>
              {f.nome}
            </button>
          ))}
        </div>
        {outros.length > 0 && (
          <>
            {(mostrarOutros || outros.some((f) => funcs.includes(f.id))) ? (
              <div className="chips" style={{ marginTop: 10 }}>
                {outros.map((f) => (
                  <button key={f.id} type="button" className="chip pequeno" aria-pressed={funcs.includes(f.id)} onClick={() => alternarFunc(f.id)}>
                    {f.nome}
                  </button>
                ))}
              </div>
            ) : (
              <p className="dica" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setMostrarOutros(true)}>
                + alguém de outra equipe
              </p>
            )}
          </>
        )}
        <p className="dica">{funcs.length} pessoa(s) marcada(s)</p>
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">3</span>Horário na obra</label>
        <div className="linha2">
          <div><label>Chegada</label><input type="time" value={chegada} onChange={(e) => setChegada(e.target.value)} /></div>
          <div><label>Saída</label><input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} /></div>
        </div>
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">4</span>Etapa principal do dia</label>
        <Chips opcoes={listas.etapas.map((e) => ({ valor: e.id, rotulo: e.nome }))} valor={etapaId} aoMudar={setEtapaId} pequeno />
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">5</span>Quanto avançou</label>
        <div className="com-unidade">
          <input inputMode="decimal" placeholder="0" value={avanco} onChange={(e) => setAvanco(e.target.value)} />
          <span>{etapa?.unidade ?? ''}</span>
        </div>
        <p className="dica">
          {etapa?.unidade === 'm' && 'Metros de tubo ou vala feitos hoje.'}
          {etapa?.unidade === 'un' && 'Quantidade instalada hoje.'}
          {etapa?.unidade === '%' && 'Quanto da etapa ficou pronto hoje (0 a 100).'}
          {!etapa && 'Escolha a etapa primeiro.'}
        </p>
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">6</span>A equipe ficou parada?</label>
        <SimNao valor={teveParada} aoMudar={setTeveParada} />
        {teveParada && (
          <div className="detalhe">
            <Chips opcoes={HORAS} valor={horasParada} aoMudar={setHorasParada} pequeno />
            <p className="dica" style={{ marginBottom: 8 }}>Motivo principal:</p>
            <Chips opcoes={listas.motivos.map((m) => ({ valor: m.id, rotulo: m.nome }))} valor={motivoId} aoMudar={setMotivoId} pequeno />
          </div>
        )}
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">7</span>Teve que refazer algo?</label>
        <SimNao valor={teveRetrab} aoMudar={setTeveRetrab} />
        {teveRetrab && (
          <div className="detalhe">
            <Chips opcoes={HORAS} valor={horasRetrab} aoMudar={setHorasRetrab} pequeno />
            <p className="dica" style={{ marginBottom: 8 }}>Causa:</p>
            <Chips opcoes={listas.causas.map((c) => ({ valor: c.id, rotulo: c.nome }))} valor={causaId} aoMudar={setCausaId} pequeno />
          </div>
        )}
      </section>

      <section className="bloco">
        <label className="rotulo"><span className="num">8</span>Foto do serviço</label>
        <div className="fotos">
          {fotos.map((f, i) => (
            <div className="foto" key={f.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${i + 1}`} />
              <button type="button" onClick={() => removerFoto(i)} aria-label="Remover foto">×</button>
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className="botao-foto">
              {processandoFoto ? '…' : '📷'}
              <input ref={inputFoto} type="file" accept="image/*" multiple hidden onChange={adicionarFotos} />
            </label>
          )}
        </div>
      </section>

      <section className="bloco">
        <label className="rotulo">Se você dirigiu: km rodados hoje <span className="dica">(opcional)</span></label>
        <div className="com-unidade">
          <input inputMode="decimal" placeholder="ex.: 85" value={km} onChange={(e) => setKm(e.target.value)} />
          <span>km</span>
        </div>
        <label className="rotulo" style={{ marginTop: 14 }}>Observação <span className="dica">(opcional)</span></label>
        <textarea placeholder="Ex.: faltou 20 conectores de 16 mm" value={obs} onChange={(e) => setObs(e.target.value)} />
      </section>

      <div className="enviar">
        <button className="botao" onClick={salvar} disabled={salvando || processandoFoto}>
          {salvando ? 'Salvando…' : 'Enviar registro do dia'}
        </button>
      </div>
    </main>
  );
}
