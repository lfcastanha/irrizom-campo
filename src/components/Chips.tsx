'use client';

type Opcao<T> = { valor: T; rotulo: string };

/** Lista de botões de toque único (escolha única). */
export function Chips<T extends string | number>({
  opcoes, valor, aoMudar, pequeno,
}: {
  opcoes: Opcao<T>[];
  valor: T | null | undefined;
  aoMudar: (v: T) => void;
  pequeno?: boolean;
}) {
  return (
    <div className="chips">
      {opcoes.map((o) => (
        <button key={String(o.valor)} type="button" className={`chip${pequeno ? ' pequeno' : ''}`}
          aria-pressed={valor === o.valor} onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Pergunta de Sim/Não com dois botões grandes. */
export function SimNao({ valor, aoMudar }: { valor: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <div className="simnao">
      <button type="button" className="chip" aria-pressed={!valor} onClick={() => aoMudar(false)}>Não</button>
      <button type="button" className="chip" aria-pressed={valor} onClick={() => aoMudar(true)}>Sim</button>
    </div>
  );
}
