import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw, Save, UsersRound } from 'lucide-react';
import apiService, {
  type ConfigAprovadoresEmpresa,
  type ConfigAprovadoresReversa,
} from '../../services/apiService';
import { SETORES, type Empresa, type Usuario } from '../../types';
import { setoresDaEmpresa as setoresDoCadastro } from '../../lib/acesso';

type RascunhoEmpresa = {
  modo: 'todos' | 'setores';
  todosIds: string[];
  porSetor: Record<string, string[]>;
};

const EMPRESAS: Empresa[] = ['Alinare', 'Novitah'];

function setoresDaEmpresa(empresa: Empresa, dados: ConfigAprovadoresReversa | null): string[] {
  return setoresDoCadastro(empresa, SETORES, dados?.setores ?? []);
}

function rascunhoDoServidor(empresa: Empresa, dados: ConfigAprovadoresReversa): RascunhoEmpresa {
  const itens = dados.configuracoes.filter((item) => item.empresa === empresa);
  const globais = itens.filter((item) => item.todos_setores).map((item) => item.usuario_id);
  const porSetor: Record<string, string[]> = {};
  for (const item of itens.filter((config) => !config.todos_setores)) {
    for (const setor of item.setores) porSetor[setor] = [...(porSetor[setor] ?? []), item.usuario_id];
  }
  return { modo: globais.length ? 'todos' : 'setores', todosIds: globais, porSetor };
}

function payloadDaEmpresa(rascunho: RascunhoEmpresa, idsPermitidos: Set<string>): ConfigAprovadoresEmpresa {
  if (rascunho.modo === 'todos') {
    return rascunho.todosIds.filter((usuario_id) => idsPermitidos.has(usuario_id))
      .map((usuario_id) => ({ usuario_id, todos_setores: true, setores: [] }));
  }
  const setoresPorUsuario = new Map<string, string[]>();
  for (const [setor, ids] of Object.entries(rascunho.porSetor)) {
    for (const id of ids) {
      if (idsPermitidos.has(id)) setoresPorUsuario.set(id, [...(setoresPorUsuario.get(id) ?? []), setor]);
    }
  }
  return [...setoresPorUsuario.entries()].map(([usuario_id, setores]) => ({
    usuario_id,
    todos_setores: false,
    setores: [...new Set(setores)].sort((a, b) => a.localeCompare(b)),
  }));
}

export default function AprovadoresSetorConfig({ usuarios }: { usuarios: Usuario[] }) {
  const [dados, setDados] = useState<ConfigAprovadoresReversa | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<Empresa, RascunhoEmpresa>>({
    Alinare: { modo: 'setores', todosIds: [], porSetor: {} },
    Novitah: { modo: 'setores', todosIds: [], porSetor: {} },
  });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<Empresa | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resultado = await apiService.listarConfigAprovadoresReversa();
      setDados(resultado);
      setRascunhos({
        Alinare: rascunhoDoServidor('Alinare', resultado),
        Novitah: rascunhoDoServidor('Novitah', resultado),
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar a configuração.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const usuariosAprovadores = useMemo(() => Object.fromEntries(EMPRESAS.map((empresa) => [
    empresa,
    usuarios.filter((usuario) => usuario.telas.includes('aprovar-reversa') && (usuario.empresasAcesso ?? []).includes(empresa)),
  ])) as Record<Empresa, Usuario[]>, [usuarios]);

  const salvar = async (empresa: Empresa) => {
    setSalvando(empresa);
    try {
      const idsPermitidos = new Set(usuariosAprovadores[empresa].map((usuario) => usuario.id));
      await apiService.salvarConfigAprovadoresReversa(empresa, payloadDaEmpresa(rascunhos[empresa], idsPermitidos));
      toast.success(`Aprovadores de ${empresa} atualizados.`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar os aprovadores.');
    } finally {
      setSalvando(null);
    }
  };

  const toggleUsuario = (empresa: Empresa, setor: string | null, id: string) => {
    setRascunhos((atuais) => {
      const atual = atuais[empresa];
      const campo = setor === null ? 'todosIds' : null;
      const selecionados = setor === null ? atual.todosIds : atual.porSetor[setor] ?? [];
      const novos = selecionados.includes(id) ? selecionados.filter((item) => item !== id) : [...selecionados, id];
      return {
        ...atuais,
        [empresa]: setor === null
          ? { ...atual, [campo!]: novos }
          : { ...atual, porSetor: { ...atual.porSetor, [setor]: novos } },
      };
    });
  };

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="aprovadores-setor-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-slate-900">
            <UsersRound className="h-5 w-5 text-blue-600" />
            <h2 id="aprovadores-setor-titulo" className="text-base font-semibold">Aprovadores por empresa e setor</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            A solicitação vai para quem está habilitado para a empresa e o setor registrados no pedido. Basta uma decisão válida.
          </p>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Este quadro e o cadastro do usuário editam a mesma configuração: o que for salvo num aparece no outro. Na migração, quem já tinha a capacidade de aprovação por empresa foi mantido com todos os setores dessa empresa; revise e restrinja quando necessário. Gestores e usuários sem essa capacidade não foram adicionados.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando configurações…</div>
      ) : erro ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{erro}</p>
          <p className="mt-1 text-red-700">A consulta e a gravação dependem da migration de aprovadores por empresa e setor.</p>
          <button type="button" onClick={() => void carregar()} className="mt-3 rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100">Tentar novamente</button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {EMPRESAS.map((empresa) => {
            const rascunho = rascunhos[empresa];
            const candidatos = usuariosAprovadores[empresa];
            const idsPermitidos = new Set(candidatos.map((usuario) => usuario.id));
            const setores = setoresDaEmpresa(empresa, dados);
            const semAprovadores = rascunho.modo === 'todos'
              ? !rascunho.todosIds.some((id) => idsPermitidos.has(id))
              : setores.some((setor) => !(rascunho.porSetor[setor] ?? []).some((id) => idsPermitidos.has(id)));
            return (
              <fieldset key={empresa} className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">{empresa}</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="radio" name={`modo-${empresa}`} checked={rascunho.modo === 'todos'} onChange={() => setRascunhos((a) => ({ ...a, [empresa]: { ...a[empresa], modo: 'todos' } }))} />
                    Todos os setores desta empresa
                  </label>
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="radio" name={`modo-${empresa}`} checked={rascunho.modo === 'setores'} onChange={() => setRascunhos((a) => ({ ...a, [empresa]: { ...a[empresa], modo: 'setores' } }))} />
                    Setores específicos
                  </label>
                </div>

                {candidatos.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Nenhum usuário possui a capacidade de aprovação para {empresa}. Ajuste as permissões do usuário primeiro.</p>
                ) : rascunho.modo === 'todos' ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {candidatos.map((usuario) => (
                      <label key={usuario.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700">
                        <input type="checkbox" aria-label={`${usuario.nome} em todos os setores de ${empresa}`} checked={rascunho.todosIds.includes(usuario.id)} onChange={() => toggleUsuario(empresa, null, usuario.id)} />
                        {usuario.nome}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {setores.map((setor) => {
                      const selecionados = rascunho.porSetor[setor] ?? [];
                      return (
                        <div key={setor} className="rounded-lg border border-slate-100 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">{setor}</p>
                            {selecionados.length === 0 && <span className="text-xs font-medium text-amber-700">Sem aprovador configurado</span>}
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {candidatos.map((usuario) => (
                              <label key={usuario.id} className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" aria-label={`${usuario.nome} — ${setor} (${empresa})`} checked={selecionados.includes(usuario.id)} onChange={() => toggleUsuario(empresa, setor, usuario.id)} />
                                {usuario.nome}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {semAprovadores && <p className="mt-3 text-xs text-amber-800">Sem aprovador, pedidos desta combinação continuam aguardando configuração. Nenhum encaminhamento automático será feito.</p>}
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => void salvar(empresa)} disabled={!!salvando || loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {salvando === empresa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar {empresa}
                  </button>
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}
