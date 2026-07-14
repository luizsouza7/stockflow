import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { categoryRepository } from '../repositories/categoryRepository';
import { productRepository } from '../repositories/productRepository';
import { categoryService } from './categoryService';
import { localDb } from './db/localDb';
import { productService } from './productService';

async function createProduct(categoryId?: string, deletedAt?: string) {
  const now = new Date().toISOString();
  return productService.create({
    name: 'Produto teste',
    code: crypto.randomUUID(),
    categoryId,
    salePriceInCents: 1000,
    currentQuantity: 3,
    minimumStock: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt,
    syncStatus: 'pending',
  });
}

describe('categoryService', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('cria categoria com UUID, trim, timestamps e status pendente', async () => {
    const categoryId = await categoryService.create('  Bebidas   Geladas  ');
    const category = await categoryRepository.findById(categoryId);

    expect(categoryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(category).toMatchObject({
      id: categoryId,
      name: 'Bebidas Geladas',
      syncStatus: 'pending',
    });
    expect(category?.createdAt).toBeTruthy();
    expect(category?.updatedAt).toBeTruthy();
  });

  it.each(['bebidas', ' BEBIDAS ', 'Bebidas   '])(
    'rejeita nome ativo logicamente duplicado: %s',
    async (duplicateName) => {
      await categoryService.create('Bebidas');
      await expect(categoryService.create(duplicateName)).rejects.toThrow(
        'Ja existe uma categoria ativa com este nome.',
      );
    },
  );

  it('edita categoria aplicando as mesmas regras de nome', async () => {
    const categoryId = await categoryService.create('Bebidas');

    await categoryService.update(categoryId, '  Bebidas   frias ');

    expect(await categoryRepository.findById(categoryId)).toMatchObject({
      name: 'Bebidas frias',
      syncStatus: 'pending',
    });
  });

  it('rejeita duplicidade durante edicao', async () => {
    await categoryService.create('Alimentos');
    const cleaningId = await categoryService.create('Limpeza');

    await expect(categoryService.update(cleaningId, ' alimentos ')).rejects.toThrow(
      'Ja existe uma categoria ativa com este nome.',
    );
  });

  it('faz soft delete e omite a categoria da listagem ativa', async () => {
    const categoryId = await categoryService.create('Limpeza');

    await categoryService.softDelete(categoryId);

    expect((await categoryRepository.findById(categoryId))?.deletedAt).toBeTruthy();
    expect(await categoryService.listActive()).toEqual([]);
  });

  it('permite recriar o nome de uma categoria excluida', async () => {
    const oldCategoryId = await categoryService.create('Limpeza');
    await categoryService.softDelete(oldCategoryId);

    const newCategoryId = await categoryService.create(' limpeza ');

    expect(newCategoryId).not.toBe(oldCategoryId);
    expect((await categoryRepository.findById(newCategoryId))?.name).toBe('limpeza');
  });

  it('bloqueia exclusao quando produto ativo usa a categoria', async () => {
    const categoryId = await categoryService.create('Bebidas');
    await createProduct(categoryId);

    await expect(categoryService.softDelete(categoryId)).rejects.toThrow(
      'Nao e possivel excluir esta categoria porque ela esta sendo utilizada por 1 produto(s) ativo(s).',
    );
  });

  it('ignora produtos excluidos ao validar exclusao da categoria', async () => {
    const categoryId = await categoryService.create('Bebidas');
    await createProduct(categoryId, new Date().toISOString());

    await expect(categoryService.softDelete(categoryId)).resolves.toBeUndefined();
  });

  it('permite produto sem categoria', async () => {
    const productId = await createProduct();

    expect((await productRepository.findById(productId))?.categoryId).toBeUndefined();
  });

  it('associa produto a categoria ativa e resolve seu nome sem consulta N+1', async () => {
    const categoryId = await categoryService.create('Bebidas');
    await createProduct(categoryId);

    expect(await productService.listActive()).toEqual([
      expect.objectContaining({ categoryId, categoryName: 'Bebidas' }),
    ]);
  });

  it('rejeita categoria inexistente ou excluida no produto', async () => {
    await expect(createProduct(crypto.randomUUID())).rejects.toThrow(
      'Selecione uma categoria ativa valida.',
    );
    const categoryId = await categoryService.create('Temporaria');
    await categoryService.softDelete(categoryId);
    await expect(createProduct(categoryId)).rejects.toThrow(
      'Selecione uma categoria ativa valida.',
    );
  });

  it('rejeita associacao invalida ao editar produto', async () => {
    const productId = await createProduct();

    await expect(
      productService.update(productId, { categoryId: crypto.randomUUID() }),
    ).rejects.toThrow('Selecione uma categoria ativa valida.');
  });
});
