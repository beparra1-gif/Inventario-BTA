import { describe, expect, it } from 'vitest';
import { urlFotoMinuscula, urlFotoMayuscula } from './fotos.js';

describe('urlFotoMinuscula / urlFotoMayuscula', () => {
  it('arma la URL contra el repo público de buscador-precio', () => {
    expect(urlFotoMinuscula('0012345')).toBe(
      'https://raw.githubusercontent.com/beparra1-gif/buscador-precio/main/fotos/0012345.jpg'
    );
    expect(urlFotoMayuscula('0012345')).toBe(
      'https://raw.githubusercontent.com/beparra1-gif/buscador-precio/main/fotos/0012345.JPG'
    );
  });
});
