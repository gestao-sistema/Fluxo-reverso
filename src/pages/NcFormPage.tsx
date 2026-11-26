// ── Abertura e registro completo da não conformidade ─────────────────────────
// /admin/nc/nova: abertura simplificada (NcAbertura).
// /admin/nc/:id: registro completo (classificação, custos, reversas, linha do tempo).
// Os dois usam o mesmo estado de formulário (lib/ncFormulario): campos que não aparecem
// na tela continuam no estado e são gravados como estavam.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, RotateCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import NcStatusBadge from '../components/nc/NcStatusBadge';
import NcReversas from '../components/nc/NcReversas';
import NcLinhaDoTempo from '../components/nc/NcLinhaDoTempo';
import NcAbertura from '../components/nc/NcAbertura';
import { Calculado, Campo, Secao } from '../components/nc/NcCampo';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import ncService from '../services/ncService';
import { podeEditarNc } from '../lib/perfil';
import {
  classificarOrigem,
  diasEmAberto,
  hojeIso,
  opcoesComAtual,
  valoresDaLista,
} from '../lib/ncCalculos';
import {
  VAZIO,
  estadoCustos,
  paraFormulario,
  rotuloCustoTotal,
} from '../lib/ncFormulario';
import { descreverCusto, rotuloReembolso } from '../lib/ncCustos';
import type { NcFormInput } from '../schemas/ncSchema';
import {
  CAMPOS_EDITAVEIS,
  ConflitoEdicaoNc,
  camposAlterados,
  mensagemDaRegra,
  reconciliarFormulario,
  rotuloCampo,
  validarAlteracoes,
  valorComparavel,
} from '../lib/ncEdicao';
import type { Correcao } from '../lib/ncEdicao';
import { NcConfirmarCorrecao, NcConflitoEdicao } from '../components/nc/NcEdicaoAvisos';
import type { DiferencaVersao } from '../components/nc/NcEdicaoAvisos';
import { SITUACOES_CUSTO_NC, STATUS_NC, isAdmin } from '../types';
import type { ListaNc, ListasNc, NaoConformidade, NcGravacao } from '../types';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import '../styles/nc.css';

type Erros = Partial<Record<keyof NcFormInput, string>>;

/** Texto do input numérico → número (ou null enquanto vazio/incompleto). */
const paraNumero = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export default function NcFormPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <NcRegistroCompleto id={id} /> : <NcAberturaPagina />;
}

/** /admin/nc/nova: abertura simplificada. */
function NcAberturaPagina() {
  const navigate = useNavigate();
  const [listas, setListas] = useState<ListasNc | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setErroCarga(null);
    ncService
      .carregarListas()
      .then((dados) => {
        if (ativo) setListas(dados);
      })
      .catch((err) => {
        if (ativo) setErroCarga(err instanceof Error ? err.message : 'Erro ao carregar as listas de NC.');
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const voltar = <Link to="/admin/nc" className="btn btn-secondary"><ArrowLeft size={14} /> Voltar à lista</Link>;

  if (erroCarga) {
    return (
      <div className="nc-page">
        <PageHeading icon={ShieldAlert} eyebrow="QUALIDADE / NÃO CONFORMIDADES" title="Não foi possível carregar" description={erroCarga} action={voltar} />
        <div>
          <button type="button" className="btn btn-primary" onClick={() => setTentativa((t) => t + 1)}>
            <RotateCw size={14} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!listas) {
    return <div className="nc-page"><div className="chart-skeleton" style={{ height: 320 }} /></div>;
  }

  return (
    <div className="nc-page">
      <PageHeading
        icon={ShieldAlert}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title="Registrar ocorrência"
        description="Registre o que aconteceu, onde se originou e se houve custo. O restante pode ser preenchido depois."
        action={voltar}
      />
      <NcAbertura listas={listas} onRegistrada={(criada) => navigate(`/admin/nc/${criada.id}`, { replace: true })} />
    </div>
  );
}

/** /admin/nc/:id: registro completo. */
function NcRegistroCompleto({ id }: { id: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const editar = user ? podeEditarNc(user) : false;
  const admin = user ? isAdmin(user) : false;

  const [listas, setListas] = useState<ListasNc>({ origens: [], itens: [] });
  const [nc, setNc] = useState<NaoConformidade | null>(null);
  const [form, setForm] = useState<NcFormInput>(VAZIO);
  // Só o tema visual acompanha a empresa exibida no formulário
  useEmpresaDaTela(form.empresa || null);
  const [erros, setErros] = useState<Erros>({});
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [avisoGravacao, setAvisoGravacao] = useState<string | null>(null);
  const [confirmarApagamento, setConfirmarApagamento] = useState(false);
  const [apagando, setApagando] = useState(false);
  // Muda a cada gravação para a linha do tempo recarregar
  const [versao, setVersao] = useState(0);
  // Base da edição: valores e versão (updated_at) de quando o formulário foi carregado ou gravado.
  // Separada do registro exibido: só muda com carga, gravação ou reaplicação de uma versão atual.
  const [base, setBase] = useState<{ form: NcFormInput; versao: string } | null>(null);
  const [conflito, setConflito] = useState(false);
  const [consultandoVersao, setConsultandoVersao] = useState(false);
  const [versaoAtual, setVersaoAtual] = useState<NaoConformidade | null>(null);
  const [correcao, setCorrecao] = useState<{ campos: Partial<NcGravacao>; correcoes: Correcao[] } | null>(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErroCarga(null);
    Promise.all([ncService.carregarListas(), ncService.obter(id)])
      .then(([listasNc, registro]) => {
        if (!ativo) return;
        setListas(listasNc);
        setNc(registro);
        setNaoEncontrada(!registro);
        setForm(registro ? paraFormulario(registro) : VAZIO);
        setBase(registro ? { form: paraFormulario(registro), versao: registro.updated_at } : null);
        setConflito(false);
        setVersaoAtual(null);
        setCorrecao(null);
        setMotivo('');
        setErros({});
        setAvisoGravacao(null);
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
    setAvisoGravacao(null);
    // Mudou um campo: a correção pendente foi calculada com os valores antigos e precisa ser refeita
    setCorrecao(null);
  };

  /** Props comuns dos inputs/selects de um campo. */
  const controle = (campo: keyof NcFormInput) => ({
    id: campo,
    value: form[campo] ?? '',
    disabled: somenteLeitura,
    'aria-invalid': !!erros[campo],
    'aria-describedby': erros[campo] ? `erro-${campo}` : undefined,
    className: `field-control${erros[campo] ? ' nc-field-invalid' : ''}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      alterar(campo, e.target.value),
  });

  const opcoes = (lista: ListaNc, campo: keyof NcFormInput) =>
    opcoesComAtual(valoresDaLista(listas, lista), form[campo] || null);

  // Origem antiga: só aparece em registros anteriores, e não é editada aqui
  const origemAntiga = form.origem || null;
  const classificacaoAntiga = classificarOrigem(origemAntiga, listas.origens);
  const custos = {
    custo_produto: paraNumero(form.custo_produto),
    custo_frete_adicional: paraNumero(form.custo_frete_adicional),
    custo_multa_outros: paraNumero(form.custo_multa_outros),
    valor_reembolsado: paraNumero(form.valor_reembolsado),
  };
  const estado = estadoCustos(form);
  const classificacaoPendente = !form.tipo_problema || !form.causador;
  const dias = diasEmAberto({
    data_ocorrencia: form.data_ocorrencia || null,
    data_identificacao: form.data_identificacao || null,
    data_encerramento: form.data_encerramento || null,
  });

  /**
   * Grava só o que o usuário alterou. Campos intocados não são validados nem enviados (inclusive
   * os de registros antigos). Correção de valor já registrado pede confirmação e justificativa.
   */
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base || !nc) return;
    setAvisoGravacao(null);
    setErros({});
    setConflito(false);
    const alterados = camposAlterados(base.form, form);
    if (alterados.length === 0) {
      toast('Nenhuma alteração para salvar.');
      return;
    }
    const resultado = validarAlteracoes(nc, alterados, form, listas);
    if (!resultado.ok) {
      setErros(resultado.erros);
      if (resultado.regra) setAvisoGravacao(mensagemDaRegra(resultado.regra));
      toast.error('A gravação não foi feita. Revise os campos destacados.');
      return;
    }
    if (resultado.correcoes.length > 0) {
      setMotivo('');
      setCorrecao({ campos: resultado.campos, correcoes: resultado.correcoes });
      return;
    }
    await gravar(resultado.campos, null);
  };

  /** Envia a gravação com a versão que o formulário carregou; o banco recusa se ela já não for a atual. */
  const gravar = async (campos: Partial<NcGravacao>, justificativa: string | null) => {
    if (!base) return;
    setSalvando(true);
    try {
      const { nc: salva, gravado } = await ncService.atualizar(id, campos, { versao: base.versao, motivo: justificativa });
      setNc(salva);
      setBase({ form: paraFormulario(salva), versao: salva.updated_at });
      setForm(paraFormulario(salva));
      setCorrecao(null);
      setMotivo('');
      setVersao((v) => v + 1);
      toast.success(gravado ? `${salva.codigo} salva.` : 'Nenhuma alteração para salvar.');
    } catch (err) {
      if (err instanceof ConflitoEdicaoNc) {
        // Nada foi gravado: a digitação continua na tela e a versão atual pode ser consultada
        setConflito(true);
        setCorrecao(null);
        setVersaoAtual(null);
        toast.error('Outra pessoa alterou esta NC. Nada foi gravado.');
      } else {
        const mensagem = err instanceof Error && err.message ? err.message : 'erro desconhecido.';
        setAvisoGravacao(`Não foi possível salvar: ${mensagem} Os dados digitados foram mantidos.`);
        toast.error('Não foi possível salvar a não conformidade.');
      }
    } finally {
      setSalvando(false);
    }
  };

  const confirmarCorrecao = () => {
    if (!correcao || motivo.trim() === '') return;
    void gravar(correcao.campos, motivo.trim());
  };

  const cancelarCorrecao = () => {
    setCorrecao(null);
    setMotivo('');
  };

  /** Consulta a versão atual sem alterar a digitação. */
  const consultarVersaoAtual = async () => {
    if (!nc) return;
    setConsultandoVersao(true);
    try {
      setVersaoAtual(await ncService.obter(nc.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível consultar a versão atual.');
    } finally {
      setConsultandoVersao(false);
    }
  };

  /** Diferenças entre a versão em que a NC foi aberta, a versão atual e a digitação. */
  const diferencasParaVersaoAtual = (): DiferencaVersao[] => {
    if (!base || !versaoAtual) return [];
    const atualForm = paraFormulario(versaoAtual);
    const exibir = (texto: string | undefined) => (!texto || texto.trim() === '' ? '(vazio)' : texto);
    return CAMPOS_EDITAVEIS
      .filter((campo) => valorComparavel(campo, base.form[campo]) !== valorComparavel(campo, atualForm[campo]))
      .map((campo) => ({
        campo,
        rotulo: rotuloCampo(campo),
        aberta: exibir(base.form[campo]),
        atual: exibir(atualForm[campo]),
        digitada: exibir(form[campo]),
      }));
  };

  /** Carrega a versão atual: o que o usuário digitou continua; o restante recebe a versão atual. */
  const reaplicarSobreVersaoAtual = () => {
    if (!base || !versaoAtual) return;
    const atual = versaoAtual;
    setForm((formAtual) => reconciliarFormulario(base.form, formAtual, atual));
    setBase({ form: paraFormulario(atual), versao: atual.updated_at });
    setNc(atual);
    setConflito(false);
    setVersaoAtual(null);
    setAvisoGravacao(null);
    setCorrecao(null);
    toast('Versão atual carregada. Revise suas alterações e salve de novo.');
  };

  /** Reversa gerada/alterada: atualiza contagem e linha do tempo sem mexer no que está sendo editado. */
  const recarregarNc = async () => {
    if (!nc || !base) return;
    const atual = await ncService.obter(nc.id).catch(() => null);
    if (atual) {
      // Se a versão mudou, o formulário é reconciliado: o digitado fica, o restante recebe a versão atual
      if (atual.updated_at !== base.versao) {
        setForm((formAtual) => reconciliarFormulario(base.form, formAtual, atual));
        setBase({ form: paraFormulario(atual), versao: atual.updated_at });
        setCorrecao(null);
      }
      setNc(atual);
    }
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
    <Link to="/admin/nc" className="btn btn-secondary"><ArrowLeft size={14} /> Voltar à lista</Link>
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

  // Sem as listas (ou sem a NC) o formulário ficaria vazio: não mostra nada para gravar por engano
  if (erroCarga || !nc) {
    return (
      <div className="nc-page">
        <PageHeading icon={ShieldAlert} eyebrow="QUALIDADE / NÃO CONFORMIDADES" title="Não foi possível carregar" description={erroCarga ?? 'Registro indisponível.'} action={voltar} />
        <div>
          <button type="button" className="btn btn-primary" onClick={() => setTentativa((t) => t + 1)}>
            <RotateCw size={14} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const empresaTravada = nc.qtd_reversas > 0;
  const custoDinheiroVisivel = estado.mostrarValores;

  return (
    <div className="nc-page">
      <PageHeading
        icon={ShieldAlert}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title={nc.codigo}
        description={`${nc.empresa ?? 'Empresa não informada'} · ${nc.cliente ?? 'cliente não informado'}${nc.importada ? ' · importada da planilha' : ''}`}
        action={voltar}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <NcStatusBadge status={nc.status} />
        <span className="list-summary">{nc.qtd_reversas} reversa(s) gerada(s)</span>
      </div>

      <form onSubmit={salvar} noValidate className="nc-page" aria-label="Formulário de não conformidade">
        <Secao kicker="IDENTIFICAÇÃO" titulo="Dados da ocorrência">
          <Calculado rotulo="ID" valor={nc.codigo} />
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

        <Secao kicker="CLASSIFICAÇÃO" titulo="O que aconteceu e onde se originou">
          {classificacaoPendente && (
            <p className="nc-aviso nc-field-wide" role="status">
              Classificação pendente: informe o tipo do problema e a origem / causador. Enquanto isso, a NC fica fora do painel.
            </p>
          )}
          <Campo id="tipo_problema" rotulo="Tipo do problema" erro={erros.tipo_problema}>
            <select {...controle('tipo_problema')}>
              {!nc.tipo_problema && <option value="">Não informado</option>}
              {opcoes('tipo_problema', 'tipo_problema').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="causador" rotulo="Origem / causador" erro={erros.causador} ajuda='Quem deu causa. "A apurar" quando ainda não se sabe.'>
            <select {...controle('causador')}>
              {!nc.causador && <option value="">Não informada</option>}
              {opcoes('causador', 'causador').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="area_registro" rotulo="Área que registrou" erro={erros.area_registro}>
            <select {...controle('area_registro')}>
              <option value="">Não informada</option>
              {opcoes('area', 'area_registro').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="area_tratativa" rotulo="Área responsável pela tratativa" erro={erros.area_tratativa} ajuda="Sempre uma área, nunca uma pessoa.">
            <select {...controle('area_tratativa')}>
              <option value="">Não atribuída</option>
              {opcoes('area', 'area_tratativa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="tipo_saida" rotulo="Tipo de saída" erro={erros.tipo_saida}>
            <select {...controle('tipo_saida')}>
              <option value="">—</option>
              {opcoes('tipo_saida', 'tipo_saida').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="como_identificada" rotulo="Como foi identificada" erro={erros.como_identificada}>
            <select {...controle('como_identificada')}>
              <option value="">—</option>
              {opcoes('como_identificada', 'como_identificada').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          {origemAntiga && (
            <>
              <Calculado rotulo="Origem antiga (registro anterior)" valor={origemAntiga} ajuda="Guardada como estava. Não é editada aqui." />
              <Calculado rotulo="Área responsável (origem antiga)" valor={classificacaoAntiga.area ?? '—'} ajuda="Derivada da origem antiga. Não é a área de tratativa." />
              <Calculado rotulo="Evitável internamente? (origem antiga)" valor={classificacaoAntiga.evitavel ?? '—'} />
            </>
          )}
        </Secao>

        <Secao kicker="OCORRÊNCIA E RESOLUÇÃO" titulo="Detalhes da ocorrência">
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
          <Campo id="custo_situacao" rotulo="Houve custo?" erro={erros.custo_situacao} ajuda="Vazio = não informado. Nunca é zero nem Não.">
            <select {...controle('custo_situacao')}>
              {!nc.custo_situacao && <option value="">Não informado</option>}
              {SITUACOES_CUSTO_NC.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
          {custoDinheiroVisivel && (
            <>
              <Campo id="custo_produto" rotulo="Custo — produto (R$)" erro={erros.custo_produto} ajuda="Em branco = ainda não apurado.">
                <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_produto')} />
              </Campo>
              <Campo id="custo_frete_adicional" rotulo="Custo — frete adicional (reenvio / reverso) (R$)" erro={erros.custo_frete_adicional}>
                <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_frete_adicional')} />
              </Campo>
              <Campo id="custo_multa_outros" rotulo="Custo — multa / outros (R$)" erro={erros.custo_multa_outros}>
                <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_multa_outros')} />
              </Campo>
              <Calculado
                rotulo="Custo total"
                valor={rotuloCustoTotal(form.custo_situacao, custos)}
              />
            </>
          )}
          <Campo id="reembolso_correios" rotulo="Reembolso Correios?" erro={erros.reembolso_correios}>
            <select {...controle('reembolso_correios')}>
              <option value="">—</option>
              {opcoes('reembolso', 'reembolso_correios').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="numero_pi" rotulo="Nº do pedido de indenização (PI)" erro={erros.numero_pi}>
            <input type="text" maxLength={50} {...controle('numero_pi')} />
          </Campo>
          {custoDinheiroVisivel && (
            <>
              <Campo id="valor_reembolsado" rotulo="Valor reembolsado (R$)" erro={erros.valor_reembolsado} ajuda={rotuloReembolso(form.valor_reembolsado)}>
                <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_reembolsado')} />
              </Campo>
              <Calculado
                rotulo="Custo líquido"
                valor={descreverCusto(form.custo_situacao, custos).rotuloLiquido}
                ajuda={descreverCusto(form.custo_situacao, custos).notaReembolso ?? undefined}
              />
            </>
          )}
          {estado.conflitoNao && <p className="nc-aviso nc-field-wide" role="alert">{estado.conflitoNao}</p>}
          {form.custo_situacao === 'Não' && !custoDinheiroVisivel && (
            <p className="nc-dica nc-field-wide">Sem custo (situação Não). Os valores já gravados continuam guardados; os campos de valor ficam ocultos e nada é apagado.</p>
          )}
        </Secao>

        <Secao kicker="ESFORÇO E STATUS" titulo="Tratativa">
          <Campo id="tempo_tratativa_min" rotulo="Tempo de tratativa (min)" erro={erros.tempo_tratativa_min}>
            <input type="number" min="0" step="1" inputMode="numeric" {...controle('tempo_tratativa_min')} />
          </Campo>
          <Campo id="status" rotulo="Status da NC" erro={erros.status}>
            <select {...controle('status')}>
              {/* Ocorrências antigas da planilha podem não ter status */}
              {nc.status === null && <option value="">Sem status</option>}
              {STATUS_NC.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
          <Campo id="data_encerramento" rotulo="Data de encerramento" erro={erros.data_encerramento}>
            <input type="date" {...controle('data_encerramento')} />
          </Campo>
          <Calculado rotulo="Dias em aberto" valor={dias === null ? '—' : String(dias)} />
        </Secao>

        {editar && conflito && (
          <NcConflitoEdicao
            consultando={consultandoVersao}
            diferencas={versaoAtual ? diferencasParaVersaoAtual() : null}
            onConsultar={consultarVersaoAtual}
            onReaplicar={reaplicarSobreVersaoAtual}
          />
        )}
        {editar && correcao && (
          <NcConfirmarCorrecao
            correcoes={correcao.correcoes}
            motivo={motivo}
            disabled={salvando}
            onMotivo={setMotivo}
            onConfirmar={confirmarCorrecao}
            onCancelar={cancelarCorrecao}
          />
        )}
        {editar && (
          <div className="nc-actions">
            {avisoGravacao && <p className="nc-erro" role="alert">{avisoGravacao}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              {admin && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmarApagamento(true)}
                  disabled={nc.qtd_reversas > 0}
                  title={nc.qtd_reversas > 0 ? 'NC com reversa vinculada não pode ser apagada' : 'Apagar NC'}
                >
                  <Trash2 size={14} /> Apagar NC
                </button>
              )}
              <div className="nc-actions-right">
                <Link to="/admin/nc" className="btn btn-secondary">Cancelar</Link>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                  Salvar alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </form>

      <NcReversas nc={nc} onAlterada={recarregarNc} />
      <NcLinhaDoTempo ncId={nc.id} podeAnotar={editar} versao={`${nc.updated_at}-${versao}`} />
      <ConfirmDialog
        open={confirmarApagamento}
        title={`Apagar ${nc.codigo}?`}
        message="Esta ação não pode ser desfeita."
        confirmLabel="Apagar NC"
        busy={apagando}
        onCancel={() => setConfirmarApagamento(false)}
        onConfirm={() => void apagar()}
      />
    </div>
  );
}
