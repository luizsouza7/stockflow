import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { productService } from '../services/productService';
import { formatCentsToBRL, formatDate } from '../utils/formatters';
import { useMemo, useState } from 'react';
import { needsRestock } from '../domain/stockStatus';

export function Products() {
  const [search, setSearch] = useState('');
  const { data: products } = useDexieQuery(() => productService.listActive(), []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return products;
    }

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.code.toLowerCase().includes(normalizedSearch),
    );
  }, [products, search]);

  async function handleDelete(id: number | undefined) {
    if (!id) {
      return;
    }

    const confirmed = window.confirm(
      'Excluir este produto? O historico de movimentacoes sera preservado.',
    );

    if (confirmed) {
      await productService.softDelete(id);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Produtos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre, edite e acompanhe os itens do estoque.
          </p>
        </div>
        <Link
          to="/produtos/novo"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900"
        >
          Novo produto
        </Link>
      </section>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-700" htmlFor="product-search">
          Buscar por nome ou codigo
        </label>
        <input
          id="product-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
          placeholder="Ex.: Arroz ou COD-001"
        />
      </div>

      {filteredProducts.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
          description={
            products.length === 0
              ? 'Crie o primeiro produto para comecar o controle de estoque.'
              : 'Tente buscar por outro nome ou codigo.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1fr] gap-4 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Produto</span>
            <span>Categoria</span>
            <span>Preco</span>
            <span>Estoque</span>
            <span className="text-right">Acoes</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              const isLowStock = needsRestock(product);

              return (
                <article
                  key={product.id}
                  className="grid gap-4 px-4 py-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1fr] lg:items-center"
                >
                  <div>
                    <h2 className="font-semibold text-slate-950">{product.name}</h2>
                    <p className="text-sm text-slate-500">
                      {product.code} • Atualizado em {formatDate(product.updatedAt)}
                    </p>
                  </div>
                  <p className="text-sm text-slate-700">{product.category}</p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCentsToBRL(product.salePriceInCents)}
                  </p>
                  <div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        isLowStock
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {product.currentQuantity} un.
                    </span>
                    <p className="mt-1 text-xs text-slate-500">Min. {product.minimumStock}</p>
                  </div>
                  <div className="flex gap-2 lg:justify-end">
                    <Link
                      to={`/produtos/${product.id}/editar`}
                      className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(product.id)}
                      className="inline-flex min-h-10 items-center rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
