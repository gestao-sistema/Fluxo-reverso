import { describe, expect, it } from 'vitest';
import { extrairCamposEtiqueta } from '../lib/etiquetaPdf';

describe('extração de códigos da etiqueta', () => {
  it('separa código de autorização do código de rastreamento', () => {
    const campos = extrairCamposEtiqueta([
      'Código de autorização de postagem: AUT-123456',
      'Objeto: AA123456789BR',
    ].join('\n'));

    expect(campos.codigo_autorizacao).toBe('AUT-123456');
    expect(campos.codigo_rastreio).toBe('AA123456789BR');
  });

  it('não reutiliza o rastreamento como autorização quando só um código aparece', () => {
    const campos = extrairCamposEtiqueta('Objeto: AA123456789BR');
    expect(campos.codigo_autorizacao).toBeUndefined();
    expect(campos.codigo_rastreio).toBe('AA123456789BR');
  });
});
