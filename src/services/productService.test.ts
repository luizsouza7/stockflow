import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { productRepository } from '../repositories/productRepository';
import type { Product } from '../types/Product';
import { localDb } from './db/localDb';
import { productService } from './productService';

describe('productService', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('cria produto preservando quantidade inicial e codigo opcional vazio', async () => {
    const productId = await createProduct({ code: '   ', currentQuantity: 10 });

    expect(await productRepository.findById(productId)).toMatchObject({
      code: '',
      currentQuantity: 10,
    });
  });

  it.each(['', '   '])('rejeita criacao com nome invalido: %j', async (name) => {
    await expect(createProduct({ name })).rejects.toThrow('Informe o nome do produto.');
    expect(await localDb.products.count()).toBe(0);
  });

  it('remove espacos externos do nome antes de persistir', async () => {
    const productId = await createProduct({ name: '  Produto A  ' });

    expect((await productRepository.findById(productId))?.name).toBe('Produto A');
  });

  it.each([-1, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejeita estoque minimo invalido na criacao: %s',
    async (minimumStock) => {
      await expect(createProduct({ minimumStock })).rejects.toThrow(
        'O estoque minimo deve ser um numero inteiro nao negativo.',
      );
      expect(await localDb.products.count()).toBe(0);
    },
  );

  it('permite estoque minimo zero na criacao', async () => {
    const productId = await createProduct({ minimumStock: 0 });

    expect((await productRepository.findById(productId))?.minimumStock).toBe(0);
  });

  it.each([-1, 1.5])('rejeita quantidade inicial invalida: %s', async (currentQuantity) => {
    await expect(createProduct({ currentQuantity })).rejects.toThrow(
      'A quantidade inicial deve ser um numero inteiro nao negativo.',
    );
    expect(await localDb.products.count()).toBe(0);
  });

  it('aplica trim ao codigo sem alterar caixa ou caracteres internos', async () => {
    const productId = await createProduct({ code: '  AbC 123  ' });

    expect((await productRepository.findById(productId))?.code).toBe('AbC 123');
  });

  it.each(['ABC123', 'abc123', '  AbC123  '])(
    'rejeita duplicidade logica de codigo ativo: %s',
    async (duplicateCode) => {
      await createProduct({ code: 'AbC123' });

      await expect(createProduct({ code: duplicateCode, name: 'Outro produto' })).rejects.toThrow(
        'Ja existe um produto ativo com este codigo.',
      );
      expect(await localDb.products.count()).toBe(1);
    },
  );

  it('permite codigos vazios e codigos nao vazios diferentes', async () => {
    await createProduct({ code: '' });
    await createProduct({ code: '   ', name: 'Sem codigo 2' });
    await createProduct({ code: 'COD-2', name: 'Codigo diferente' });

    expect(await localDb.products.count()).toBe(3);
  });

  it('produto excluido nao bloqueia reutilizacao do codigo', async () => {
    const deletedId = await createProduct({ code: 'REUTILIZAVEL' });
    await productService.softDelete(deletedId);

    const newId = await createProduct({ code: ' reutilizavel ', name: 'Novo produto' });

    expect(newId).not.toBe(deletedId);
    expect((await productRepository.findById(newId))?.code).toBe('reutilizavel');
  });

  it('permite preservar ou reapresentar o proprio codigo durante edicao', async () => {
    const productId = await createProduct({ code: 'AbC123' });

    await productService.update(productId, { code: '  abc123  ', name: 'Produto editado' });

    expect(await productRepository.findById(productId)).toMatchObject({
      code: 'abc123',
      name: 'Produto editado',
    });
  });

  it('rejeita edicao para codigo de outro produto ativo', async () => {
    await createProduct({ code: 'OCUPADO' });
    const editableId = await createProduct({ code: 'LIVRE', name: 'Editavel' });

    await expect(productService.update(editableId, { code: ' ocupado ' })).rejects.toThrow(
      'Ja existe um produto ativo com este codigo.',
    );
    expect((await productRepository.findById(editableId))?.code).toBe('LIVRE');
  });

  it.each(['', '   '])('rejeita update com nome invalido: %j', async (name) => {
    const productId = await createProduct();

    await expect(productService.update(productId, { name })).rejects.toThrow(
      'Informe o nome do produto.',
    );
    expect((await productRepository.findById(productId))?.name).toBe('Produto teste');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejeita estoque minimo invalido no update: %s',
    async (minimumStock) => {
      const productId = await createProduct();

      await expect(productService.update(productId, { minimumStock })).rejects.toThrow(
        'O estoque minimo deve ser um numero inteiro nao negativo.',
      );
      expect((await productRepository.findById(productId))?.minimumStock).toBe(2);
    },
  );

  it('sanitiza nome e permite estoque minimo zero em update legitimo', async () => {
    const productId = await createProduct();

    await productService.update(productId, { name: '  Produto revisado  ', minimumStock: 0 });

    expect(await productRepository.findById(productId)).toMatchObject({
      name: 'Produto revisado',
      minimumStock: 0,
    });
  });

  it('update comum preserva estoque mesmo quando recebe propriedade extra em runtime', async () => {
    const productId = await createProduct({ currentQuantity: 7 });
    const attemptedUpdate = { name: 'Nome atualizado', currentQuantity: 99 };

    await productService.update(productId, attemptedUpdate);

    expect(await productRepository.findById(productId)).toMatchObject({
      name: 'Nome atualizado',
      currentQuantity: 7,
    });
  });

  it('edicao de outros campos preserva o estoque persistido', async () => {
    const productId = await createProduct({ currentQuantity: 6 });

    await productService.update(productId, {
      name: 'Novo nome',
      salePriceInCents: 2500,
      minimumStock: 3,
    });

    expect(await productRepository.findById(productId)).toMatchObject({
      name: 'Novo nome',
      salePriceInCents: 2500,
      minimumStock: 3,
      currentQuantity: 6,
    });
  });

  it('preserva duplicidades legadas sem perda e permite editar outros campos', async () => {
    const first = legacyProduct('LEGADO', 'Produto legado 1');
    const second = legacyProduct(' legado ', 'Produto legado 2');
    await localDb.products.bulkAdd([first, second]);

    await productService.update(first.id, { name: 'Legado revisado' });

    expect(await localDb.products.count()).toBe(2);
    expect(await productRepository.findById(first.id)).toMatchObject({
      name: 'Legado revisado',
      code: 'LEGADO',
    });
    expect((await productRepository.findById(second.id))?.code).toBe(' legado ');
    await expect(createProduct({ code: 'LEGADO', name: 'Terceiro' })).rejects.toThrow(
      'Ja existe um produto ativo com este codigo.',
    );
  });
});

async function createProduct(
  changes: Partial<Pick<Product, 'name' | 'code' | 'currentQuantity' | 'minimumStock'>> = {},
) {
  const now = '2026-07-14T10:00:00.000Z';
  return productService.create({
    name: changes.name ?? 'Produto teste',
    code: changes.code ?? 'COD-1',
    salePriceInCents: 1000,
    currentQuantity: changes.currentQuantity ?? 5,
    minimumStock: changes.minimumStock ?? 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

function legacyProduct(code: string, name: string): Product {
  return {
    id: crypto.randomUUID(),
    name,
    code,
    salePriceInCents: 1000,
    currentQuantity: 4,
    minimumStock: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    syncStatus: 'synced',
  };
}
