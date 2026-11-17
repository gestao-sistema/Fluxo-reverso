import { describe, expect, it } from 'vitest';
import { extrairCamposEtiqueta } from '../lib/etiquetaPdf';

describe('extração de códigos da etiqueta', () => {
  it('separa código de autorização do código de rastreamento', () => {
    const campos = extrairCamposEtiqueta([
      'Código de autorização de postagem: AUT-123456',
      'Objeto: AA123456785BR',
    ].join('\n'));

    expect(campos.codigo_autorizacao).toBe('AUT-123456');
    expect(campos.codigo_rastreio).toBe('AA123456785BR');
    expect(campos.codigos_rastreio).toEqual(['AA123456785BR']);
  });

  it('não reutiliza o rastreamento como autorização quando só um código aparece', () => {
    const campos = extrairCamposEtiqueta('Objeto: AA123456785BR');
    expect(campos.codigo_autorizacao).toBeUndefined();
    expect(campos.codigo_rastreio).toBe('AA123456785BR');
  });

  it('número com formato de rastreio mas dígito verificador errado não vira rastreio', () => {
    const campos = extrairCamposEtiqueta('Objeto: AA123456789BR\nCEP 01310-100\nTelefone 11 98765-4321');
    expect(campos.codigo_rastreio).toBeUndefined();
    expect(campos.codigos_rastreio).toBeUndefined();
  });

  it('com dois códigos válidos, nenhum é escolhido sozinho; os dois ficam para conferência', () => {
    const campos = extrairCamposEtiqueta('Objeto 1: AB123456785BR\nObjeto 2: JT987654326BR');
    expect(campos.codigo_rastreio).toBeUndefined();
    expect(campos.codigos_rastreio).toEqual(['AB123456785BR', 'JT987654326BR']);
  });
});
