// ── Cadastro e detalhe da não conformidade ───────────────────────────────────
// Campos agrupados como na planilha REGISTRO_NC. Os calculados (ID, área,
// evitável, custo total, custo líquido e dias em aberto) aparecem só para
// leitura e são recalculados enquanto o usuário digita; o banco grava os
// mesmos valores.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, RotateCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import NcStatusBadge from '../components/nc/NcStatusBadge';
import NcReversas from '../components/nc/NcReversas';
import NcLinhaDoTempo from '../components/nc/NcLinhaDoTempo';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import ncService from '../services/ncService';
import { podeEditarNc } from '../lib/perfil';
import {
  classificarOrigem,
  custoLiquido,
  custoTotal,
  diasEmAberto,
  formatarMoeda,
  hojeIso,
  opcoesComAtual,
  valoresDaLista,
} from '../lib/ncCalculos';
import { ncSchema, type NcFormInput } from '../schemas/ncSchema';
import { STATUS_NC, isAdmin } from '../types';
import type { ListaNc, ListasNc, NaoConformidade, NcCampos } from '../types';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import '../styles/nc.css';

type Erros = Partial<Record<keyof NcFormInput, string>>;

const VAZIO: NcFormInput = {
  data_ocorrencia: '', data_identificacao: '', empresa: '', cliente: '', vendedora: '', romaneio: '',
  valor_romaneio: '', nf: '', rastreio: '', data_postagem: '',
  tipo_saida: '', origem: '', como_identificada: '',
  status_correios: '', descricao: '', resolucao: '', novo_rastreio: '',
  valor_declarado: '', valor_venda: '', frete_original: '',
  custo_produto: '', custo_frete_adicional: '', custo_multa_outros: '', reembolso_correios: '', numero_pi: '',
  valor_reembolsado: '',
  tempo_tratativa_min: '', status: 'Aberta', data_encerramento: '',
};

/** NC gravada → valores do formulário (texto). */
function paraFormulario(nc: NcCampos): NcFormInput {
  const texto = (v: string | number | null) => (v === null || v === undefined ? '' : String(v));
  return Object.fromEntries(
    Object.keys(VAZIO).map((campo) => [campo, texto(nc[campo as keyof NcCampos])])
  ) as NcFormInput;
}

/** Texto do input numérico → número (ou null enquanto vazio/incompleto). */
const paraNumero = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function Secao({ kicker, titulo, children }: { kicker: string; titulo: string; children: ReactNode }) {
  return (
    <section className="surface-panel" aria-label={titulo}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{kicker}</span>
          <h2 className="panel-title">{titulo}</h2>
        </div>
      </div>
      <div className="nc-grid">{children}</div>
    </section>
  );
}

function Campo({ id, rotulo, obrigatorio, erro, largo, children }: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`filter-field${largo ? ' nc-field-wide' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="nc-required"> *</span>}
      </label>
      {children}
      {erro && <p id={`erro-${id}`} className="nc-erro" role="alert">{erro}</p>}
    </div>
  );
}

function Calculado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="filter-field">
      <span className="field-label">{rotulo}<span className="nc-calc-tag">calculado</span></span>
      <div className="nc-calc">{valor}</div>
    </div>
  );
}

export default function NcFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editar = user ? podeEditarNc(user) : false;
  const admin = user ? isAdmin(user) : false;

  const [listas, setListas] = useState<ListasNc>({ origens: [], itens: [] });
  const [nc, setNc] = useState<NaoConformidade | null>(null);
  const [form, setForm] = useState<NcFormInput>(VAZIO);
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(form.empresa || null);
  const [erros, setErros] = useState<Erros>({});
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [confirmarApagamento, setConfirmarApagamento] = useState(false);
  const [apagando, setApagando] = useState(false);
  // Muda a cada gravação para a linha do tempo recarregar
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErroCarga(null);
    Promise.all([ncService.carregarListas(), id ? ncService.obter(id) : Promise.resolve(null)])
      .then(([listasNc, registro]) => {
        if (!ativo) return;
        setListas(listasNc);
        setNc(registro);
        setNaoEncontrada(!!id && !registro);
        setForm(registro ? paraFormulario(registro) : VAZIO);
        setErros({});
      })
      .catch((err) => {
        if (ativo) setErroCarga(err instanceof Error ? err.message : 'Erro ao carregar a não conformidade.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  const somenteLeitura = !editar || salvando;

  const alterar = (campo: keyof NcFormInput, valor: string) => {
    setForm((atual) => {
      const novo = { ...atual, [campo]: valor } as NcFormInput;
      // Encerrar ou cancelar sem data de encerramento: assume hoje (editável)
      if (campo === 'status' && (valor === 'Encerrada' || valor === 'Cancelada') && !atual.data_encerramento) {
        novo.data_encerramento = hojeIso();
      }
      return novo;
    });
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  };

  /** Props comuns dos inputs/selects de um campo. */
  const controle = (campo: keyof NcFormInput) => ({
    id: campo,
    value: form[campo],
    disabled: somenteLeitura,
    'aria-invalid': !!erros[campo],
    'aria-describedby': erros[campo] ? `erro-${campo}` : undefined,
    className: `field-control${erros[campo] ? ' nc-field-invalid' : ''}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      alterar(campo, e.target.value),
  });

  const opcoes = (lista: ListaNc, campo: keyof NcFormInput) =>
    opcoesComAtual(valoresDaLista(listas, lista), form[campo] || null);

  const origens = opcoesComAtual(
    [...listas.origens].filter((o) => o.ativo).sort((a, b) => a.ordem - b.ordem).map((o) => o.nome),
    form.origem || null
  );

  // Campos calculados (mesmas fórmulas da planilha)
  const classificacao = classificarOrigem(form.origem || null, listas.origens);
  const custos = {
    custo_produto: paraNumero(form.custo_produto),
    custo_frete_adicional: paraNumero(form.custo_frete_adicional),
    custo_multa_outros: paraNumero(form.custo_multa_outros),
    valor_reembolsado: paraNumero(form.valor_reembolsado),
  };
  const dias = diasEmAberto({
    data_ocorrencia: form.data_ocorrencia || null,
    data_identificacao: form.data_identificacao || null,
    data_encerramento: form.data_encerramento || null,
  });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const resultado = ncSchema.safeParse(form);
    if (!resultado.success) {
      const novos: Erros = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof NcFormInput;
        if (!novos[campo]) novos[campo] = issue.message;
      }
      setErros(novos);
      toast.error('Revise os campos destacados.');
      return;
    }

    setSalvando(true);
    try {
      if (nc) {
        const salva = await ncService.atualizar(nc.id, resultado.data);
        setNc(salva);
        setForm(paraFormulario(salva));
        setVersao((v) => v + 1);
        toast.success(`${salva.codigo} salva.`);
      } else {
        const criada = await ncService.criar(resultado.data);
        toast.success(`${criada.codigo} registrada.`);
        navigate(`/admin/nc/${criada.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar a não conformidade.');
    } finally {
      setSalvando(false);
    }
  };

  /** Reversa gerada/alterada: atualiza contagem e linha do tempo sem mexer no que está sendo editado. */
  const recarregarNc = async () => {
    if (!nc) return;
    const atual = await ncService.obter(nc.id).catch(() => null);
    if (atual) setNc(atual);
    setVersao((v) => v + 1);
  };

  const apagar = async () => {
    if (!nc) return;
    setApagando(true);
    try {
      await ncService.remover(nc.id);
      toast.success(`${nc.codigo} apagada.`);
      navigate('/admin/nc', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao apagar a não conformidade.');
    } finally {
      setApagando(false);
    }
  };

  const voltar = (
    <Link to="/admin/nc" className="btn-secondary"><ArrowLeft size={14} /> Voltar à lista</Link>
  );

  if (carregando) {
    return <div className="nc-page"><div className="chart-skeleton" style={{ height: 320 }} /></div>;
  }

  if (naoEncontrada) {
    return (
      <div className="nc-page">
        <PageHeading icon={ShieldAlert} eyebrow="QUALIDADE / NÃO CONFORMIDADES" title="NC não encontrada" description="O registro não existe ou você não tem acesso a ele." action={voltar} />
      </div>
    );
  }

  // Sem as listas (ou sem a NC) o formulário ficaria vazio e poderia gravar uma NC nova por engano
  if (erroCarga) {
    return (
      <div className="nc-page">
        <PageHeading icon={ShieldAlert} eyebrow="QUALIDADE / NÃO CONFORMIDADES" title="Não foi possível carregar" description={erroCarga} action={voltar} />
        <div>
          <button type="button" className="btn-primary" onClick={() => setTentativa((t) => t + 1)}>
            <RotateCw size={14} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const empresaTravada = !!nc && nc.qtd_reversas > 0;

  return (
    <div className="nc-page">
      <PageHeading
        icon={ShieldAlert}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title={nc ? nc.codigo : 'Nova não conformidade'}
        description={
          nc
            ? `${nc.empresa ?? 'Empresa não informada'} · ${nc.cliente ?? 'cliente não informada'}${nc.importada ? ' · importada da planilha' : ''}`
            : 'Registre a ocorrência. Se houver reversa, ela é gerada a partir desta NC depois de salvar.'
        }
        action={voltar}
      />

      {nc && (
        <div className="flex items-center gap-2 flex-wrap">
          <NcStatusBadge status={nc.status} />
          <span className="list-summary">{nc.qtd_reversas} reversa(s) gerada(s)</span>
        </div>
      )}

      <form onSubmit={salvar} noValidate className="nc-page" aria-label="Formulário de não conformidade">
        <Secao kicker="IDENTIFICAÇÃO" titulo="Dados da ocorrência">
          <Calculado rotulo="ID" valor={nc?.codigo ?? 'Gerado ao salvar'} />
          <Campo id="data_ocorrencia" rotulo="Data da ocorrência" obrigatorio erro={erros.data_ocorrencia}>
            <input type="date" max={hojeIso()} {...controle('data_ocorrencia')} />
          </Campo>
          <Campo id="data_identificacao" rotulo="Data de identificação" erro={erros.data_identificacao}>
            <input type="date" max={hojeIso()} {...controle('data_identificacao')} />
          </Campo>
          <Campo id="empresa" rotulo="Empresa / contrato" obrigatorio erro={erros.empresa}>
            <select {...controle('empresa')} disabled={somenteLeitura || empresaTravada}>
              <option value="">Selecione</option>
              {opcoes('empresa', 'empresa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            {empresaTravada && editar && <p className="nc-dica">Não muda depois de gerar reversa.</p>}
          </Campo>
          <Campo id="cliente" rotulo="Cliente" erro={erros.cliente}>
            <input type="text" maxLength={150} {...controle('cliente')} />
          </Campo>
          <Campo id="vendedora" rotulo="Vendedora" erro={erros.vendedora}>
            <input type="text" maxLength={100} {...controle('vendedora')} />
          </Campo>
          <Campo id="romaneio" rotulo="Romaneio" erro={erros.romaneio}>
            <input type="text" maxLength={50} {...controle('romaneio')} />
          </Campo>
          <Campo id="valor_romaneio" rotulo="Valor do romaneio (R$)" erro={erros.valor_romaneio}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_romaneio')} />
          </Campo>
          <Campo id="nf" rotulo="NF" erro={erros.nf}>
            <input type="text" maxLength={50} {...controle('nf')} />
          </Campo>
          <Campo id="rastreio" rotulo="Rastreio" erro={erros.rastreio}>
            <input type="text" maxLength={40} {...controle('rastreio')} />
          </Campo>
          <Campo id="data_postagem" rotulo="Data de postagem" erro={erros.data_postagem}>
            <input type="date" {...controle('data_postagem')} />
          </Campo>
        </Secao>

        <Secao kicker="CLASSIFICAÇÃO" titulo="Origem e responsabilidade">
          <Campo id="tipo_saida" rotulo="Tipo de saída" erro={erros.tipo_saida}>
            <select {...controle('tipo_saida')}>
              <option value="">—</option>
              {opcoes('tipo_saida', 'tipo_saida').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="origem" rotulo="Origem da não conformidade" obrigatorio erro={erros.origem}>
            <select {...controle('origem')}>
              <option value="">Selecione</option>
              {origens.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Calculado rotulo="Área responsável" valor={classificacao.area ?? '—'} />
          <Calculado rotulo="Evitável internamente?" valor={classificacao.evitavel ?? '—'} />
          <Campo id="como_identificada" rotulo="Como foi identificada" erro={erros.como_identificada}>
            <select {...controle('como_identificada')}>
              <option value="">—</option>
              {opcoes('como_identificada', 'como_identificada').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
        </Secao>

        <Secao kicker="OCORRÊNCIA E RESOLUÇÃO" titulo="O que aconteceu e como foi resolvido">
          <Campo id="status_correios" rotulo="Status no Correios" erro={erros.status_correios}>
            <input type="text" maxLength={300} {...controle('status_correios')} />
          </Campo>
          <Campo id="resolucao" rotulo="Resolução" erro={erros.resolucao}>
            <select {...controle('resolucao')}>
              <option value="">—</option>
              {opcoes('resolucao', 'resolucao').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="novo_rastreio" rotulo="Novo rastreio" erro={erros.novo_rastreio}>
            <input type="text" maxLength={40} {...controle('novo_rastreio')} />
          </Campo>
          <Campo id="descricao" rotulo="Descrição / observação" largo erro={erros.descricao}>
            <textarea rows={3} maxLength={2000} {...controle('descricao')} className={`${controle('descricao').className} nc-textarea`} />
          </Campo>
        </Secao>

        <Secao kicker="VALOR REAL" titulo="Valores da venda">
          <Campo id="valor_declarado" rotulo="Valor declarado do produto (R$)" erro={erros.valor_declarado}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_declarado')} />
          </Campo>
          <Campo id="valor_venda" rotulo="Valor da venda (R$)" erro={erros.valor_venda}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_venda')} />
          </Campo>
          <Campo id="frete_original" rotulo="Frete original (R$)" erro={erros.frete_original}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('frete_original')} />
          </Campo>
        </Secao>

        <Secao kicker="CUSTO DA NÃO CONFORMIDADE" titulo="Custos e reembolso">
          <Campo id="custo_produto" rotulo="Custo — produto (R$)" erro={erros.custo_produto}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_produto')} />
          </Campo>
          <Campo id="custo_frete_adicional" rotulo="Custo — frete adicional (reenvio / reverso)" erro={erros.custo_frete_adicional}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_frete_adicional')} />
          </Campo>
          <Campo id="custo_multa_outros" rotulo="Custo — multa / outros (R$)" erro={erros.custo_multa_outros}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_multa_outros')} />
          </Campo>
          <Calculado rotulo="Custo total" valor={formatarMoeda(custoTotal(custos))} />
          <Campo id="reembolso_correios" rotulo="Reembolso Correios?" erro={erros.reembolso_correios}>
            <select {...controle('reembolso_correios')}>
              <option value="">—</option>
              {opcoes('reembolso', 'reembolso_correios').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="numero_pi" rotulo="Nº do pedido de indenização (PI)" erro={erros.numero_pi}>
            <input type="text" maxLength={50} {...controle('numero_pi')} />
          </Campo>
          <Campo id="valor_reembolsado" rotulo="Valor reembolsado (R$)" erro={erros.valor_reembolsado}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_reembolsado')} />
          </Campo>
          <Calculado rotulo="Custo líquido" valor={formatarMoeda(custoLiquido(custos))} />
        </Secao>

        <Secao kicker="ESFORÇO E STATUS" titulo="Tratativa">
          <Campo id="tempo_tratativa_min" rotulo="Tempo de tratativa (min)" erro={erros.tempo_tratativa_min}>
            <input type="number" min="0" step="1" inputMode="numeric" {...controle('tempo_tratativa_min')} />
          </Campo>
          <Campo id="status" rotulo="Status da NC" erro={erros.status}>
            <select {...controle('status')}>
              {/* Ocorrências antigas da planilha podem não ter status */}
              {nc?.status === null && <option value="">Sem status</option>}
              {STATUS_NC.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
          <Campo id="data_encerramento" rotulo="Data de encerramento" erro={erros.data_encerramento}>
            <input type="date" {...controle('data_encerramento')} />
          </Campo>
          <Calculado rotulo="Dias em aberto" valor={dias === null ? '—' : String(dias)} />
        </Secao>

        {editar && (
          <div className="nc-actions">
            {admin && nc && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => setConfirmarApagamento(true)}
                disabled={nc.qtd_reversas > 0}
                title={nc.qtd_reversas > 0 ? 'NC com reversa vinculada não pode ser apagada' : 'Apagar NC'}
              >
                <Trash2 size={14} /> Apagar NC
              </button>
            )}
            <div className="nc-actions-right">
              <Link to="/admin/nc" className="btn-secondary">Cancelar</Link>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                {nc ? 'Salvar alterações' : 'Registrar NC'}
              </button>
            </div>
          </div>
        )}
      </form>

      {nc && <NcReversas nc={nc} onAlterada={recarregarNc} />}
      {nc && <NcLinhaDoTempo ncId={nc.id} podeAnotar={editar} versao={`${nc.updated_at}-${versao}`} />}
      <ConfirmDialog
        open={confirmarApagamento}
        title={`Apagar ${nc?.codigo ?? 'não conformidade'}?`}
        message="Esta ação não pode ser desfeita."
        confirmLabel="Apagar NC"
        busy={apagando}
        onCancel={() => setConfirmarApagamento(false)}
        onConfirm={() => void apagar()}
      />
    </div>
  );
}
