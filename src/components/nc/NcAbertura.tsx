// ── Abertura simplificada de NC ─────────────────────────────────────────────
// Pergunta só o que aconteceu, onde se originou, a data, a empresa, o cliente (quando
// houver) e se houve custo. Os demais dados ficam em "Detalhes opcionais"; resolução e
// encerramento pertencem ao acompanhamento depois de registrar.
// Não atribui área nem pessoa: área de registro e de tratativa só são gravadas se a
// pessoa informar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';
import ncService from '../../services/ncService';
import { useEmpresaDaTela } from '../../context/TemaContext';
import { ncAberturaSchema, type NcFormInput } from '../../schemas/ncSchema';
import { hojeIso, opcoesComAtual, valoresDaLista } from '../../lib/ncCalculos';
import { estadoCustos, novaAbertura, rotuloCustoTotal } from '../../lib/ncFormulario';
import { validarClassificacaoNc } from '../../lib/ncClassificacao';
import type { ListaNc, ListasNc, NaoConformidade } from '../../types';
import { SITUACOES_CUSTO_NC } from '../../types';
import { Calculado, Campo } from './NcCampo';

type Erros = Partial<Record<keyof NcFormInput, string>>;

const paraNumero = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Ajuda dos campos de valor: em branco não é zero, é "ainda não sabido". Uma vez só, acima dos campos. */
const AJUDA_CUSTO = 'Em branco significa ainda não apurado, não zero.';

export default function NcAbertura({ listas, onRegistrada }: {
  listas: ListasNc;
  onRegistrada: (nc: NaoConformidade) => void;
}) {
  const [form, setForm] = useState<NcFormInput>(() => novaAbertura(hojeIso()));
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGravacao, setErroGravacao] = useState<string | null>(null);
  // Só o tema visual acompanha a empresa escolhida
  useEmpresaDaTela(form.empresa || null);

  const alterar = (campo: keyof NcFormInput, valor: string) => {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => (atual[campo] ? { ...atual, [campo]: undefined } : atual));
  };

  const controle = (campo: keyof NcFormInput) => ({
    id: campo,
    name: campo,
    value: form[campo] ?? '',
    disabled: salvando,
    'aria-invalid': !!erros[campo],
    'aria-describedby': erros[campo] ? `erro-${campo}` : undefined,
    className: `field-control${erros[campo] ? ' nc-field-invalid' : ''}`,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => alterar(campo, e.target.value),
  });

  const opcoes = (lista: ListaNc, campo: keyof NcFormInput) =>
    opcoesComAtual(valoresDaLista(listas, lista), form[campo] || null);

  const custos = {
    custo_produto: paraNumero(form.custo_produto),
    custo_frete_adicional: paraNumero(form.custo_frete_adicional),
    custo_multa_outros: paraNumero(form.custo_multa_outros),
  };
  const estado = estadoCustos(form);
  const tipoOutro = form.tipo_problema === 'Outro';

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    setErroGravacao(null);
    const resultado = ncAberturaSchema.safeParse(form);
    if (!resultado.success) {
      const novos: Erros = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof NcFormInput;
        if (!novos[campo]) novos[campo] = issue.message;
      }
      setErros(novos);
      toast.error('Revise os campos destacados.');
      const primeiro = Object.keys(novos)[0];
      if (primeiro) document.getElementById(primeiro)?.focus();
      return;
    }

    // Mesma regra do banco, antes de enviar: se algo mudar lá, a gravação ainda é recusada com a mensagem do banco.
    const regra = validarClassificacaoNc(null, resultado.data, listas);
    if (regra) {
      setErroGravacao(regra);
      toast.error('A ocorrência não foi registrada.');
      return;
    }

    setSalvando(true);
    try {
      const criada = await ncService.criar(resultado.data);
      toast.success(`${criada.codigo} registrada.`);
      onRegistrada(criada);
    } catch (err) {
      const motivo = err instanceof Error && err.message ? err.message : 'erro desconhecido.';
      setErroGravacao(`Não foi possível registrar a ocorrência: ${motivo} Os dados digitados foram mantidos.`);
      toast.error('Não foi possível registrar a ocorrência.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={registrar} noValidate className="nc-page nc-abertura" aria-label="Registrar ocorrência">
      <section className="surface-panel" aria-label="O que aconteceu">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">OCORRÊNCIA</span>
            <h2 className="panel-title">O que aconteceu</h2>
          </div>
        </div>
        <div className="nc-grid">
          <Campo id="empresa" rotulo="Empresa / contrato" obrigatorio erro={erros.empresa}>
            <select {...controle('empresa')}>
              <option value="">Selecione</option>
              {opcoes('empresa', 'empresa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="data_ocorrencia" rotulo="Data da ocorrência" obrigatorio erro={erros.data_ocorrencia} ajuda="Sugerimos hoje. Você pode alterar.">
            <input type="date" max={hojeIso()} {...controle('data_ocorrencia')} />
          </Campo>
          <Campo id="cliente" rotulo="Cliente / pedido" erro={erros.cliente} ajuda="Quando a ocorrência estiver ligada a um cliente ou pedido.">
            <input type="text" maxLength={150} {...controle('cliente')} />
          </Campo>
          <Campo id="tipo_problema" rotulo="O que aconteceu? (tipo do problema)" obrigatorio erro={erros.tipo_problema}>
            <select {...controle('tipo_problema')}>
              <option value="">Selecione</option>
              {opcoes('tipo_problema', 'tipo_problema').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="causador" rotulo="Onde se originou? (origem / causador)" obrigatorio erro={erros.causador} ajuda='Quem deu causa. Use "A apurar" se ainda não souber.'>
            <select {...controle('causador')}>
              <option value="">Selecione</option>
              {opcoes('causador', 'causador').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo
            id="descricao"
            rotulo={tipoOutro ? 'Descrição (obrigatória para Outro)' : 'Descrição curta'}
            obrigatorio={tipoOutro}
            erro={erros.descricao}
            largo
          >
            <textarea rows={3} maxLength={2000} {...controle('descricao')} className={`${controle('descricao').className} nc-textarea`} />
          </Campo>
        </div>
      </section>

      <section className="surface-panel" aria-label="Houve custo?">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">CUSTO</span>
            <h2 className="panel-title">Houve custo?</h2>
          </div>
        </div>
        <fieldset className="nc-escolha" aria-describedby={erros.custo_situacao ? 'erro-custo_situacao' : undefined}>
          <legend className="field-label">Houve custo? <span className="nc-required">*</span></legend>
          {SITUACOES_CUSTO_NC.map((opcao) => (
            <label key={opcao} className={`nc-escolha-opcao${form.custo_situacao === opcao ? ' is-marcada' : ''}`}>
              <input
                type="radio"
                name="custo_situacao"
                value={opcao}
                checked={form.custo_situacao === opcao}
                disabled={salvando}
                onChange={() => alterar('custo_situacao', opcao)}
              />
              {opcao}
            </label>
          ))}
        </fieldset>
        {erros.custo_situacao && <p id="erro-custo_situacao" className="nc-erro" role="alert">{erros.custo_situacao}</p>}

        {estado.mostrarValores && (
          <div className="nc-grid">
            <p className="nc-dica nc-field-wide">{AJUDA_CUSTO}</p>
            <Campo id="custo_produto" rotulo="Custo — produto (R$)" erro={erros.custo_produto}>
              <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_produto')} />
            </Campo>
            <Campo id="custo_frete_adicional" rotulo="Custo — frete adicional (R$)" erro={erros.custo_frete_adicional}>
              <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_frete_adicional')} />
            </Campo>
            <Campo id="custo_multa_outros" rotulo="Custo — multa / outros (R$)" erro={erros.custo_multa_outros}>
              <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('custo_multa_outros')} />
            </Campo>
            <Calculado rotulo="Custo total" valor={rotuloCustoTotal(form.custo_situacao, custos)} />
          </div>
        )}
        {estado.conflitoNao && <p className="nc-aviso" role="alert">{estado.conflitoNao}</p>}
        {form.custo_situacao === 'Não' && !estado.mostrarValores && (
          <p className="nc-dica">Sem custo registrado. Os campos de valor não são pedidos.</p>
        )}
      </section>

      <details className="surface-panel nc-detalhes">
        <summary className="panel-title">Detalhes opcionais</summary>
        <p className="nc-dica">
          NF, romaneio, rastreio e valores podem ser preenchidos agora ou depois. Resolução e encerramento ficam no acompanhamento.
        </p>
        <div className="nc-grid">
          <Campo id="data_identificacao" rotulo="Data de identificação" erro={erros.data_identificacao}>
            <input type="date" max={hojeIso()} {...controle('data_identificacao')} />
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
          <Campo id="status_correios" rotulo="Status no Correios" erro={erros.status_correios}>
            <input type="text" maxLength={300} {...controle('status_correios')} />
          </Campo>
          <Campo id="area_registro" rotulo="Área que registrou" erro={erros.area_registro} ajuda="Preencha quando souber. Nenhuma área é atribuída sozinha.">
            <select {...controle('area_registro')}>
              <option value="">Não informada</option>
              {opcoes('area', 'area_registro').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="area_tratativa" rotulo="Área responsável pela tratativa" erro={erros.area_tratativa} ajuda="Sempre uma área, nunca uma pessoa. Vazio = não atribuída.">
            <select {...controle('area_tratativa')}>
              <option value="">Não atribuída</option>
              {opcoes('area', 'area_tratativa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <Campo id="valor_declarado" rotulo="Valor declarado do produto (R$)" erro={erros.valor_declarado}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_declarado')} />
          </Campo>
          <Campo id="valor_venda" rotulo="Valor da venda (R$)" erro={erros.valor_venda}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('valor_venda')} />
          </Campo>
          <Campo id="frete_original" rotulo="Frete original (R$)" erro={erros.frete_original}>
            <input type="number" min="0" step="0.01" inputMode="decimal" {...controle('frete_original')} />
          </Campo>
        </div>
      </details>

      <div className="nc-actions">
        {erroGravacao && <p className="nc-erro" role="alert">{erroGravacao}</p>}
        <div className="nc-actions-right">
          <Link to="/admin/nc" className="btn btn-secondary">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Registrar ocorrência
          </button>
        </div>
      </div>
    </form>
  );
}
