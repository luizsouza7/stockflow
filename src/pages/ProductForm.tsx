import { FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  productService,
  type ProductEditingLookup,
} from '../services/productService';
import type { ProductFormData } from '../types/Product';
import { formatCentsForInput, parseCurrencyToCents } from '../utils/formatters';
import { categoryService } from '../services/categoryService';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getUserFacingError } from '../utils/errors';

const initialFormData: ProductFormData = {
  name: '',
  code: '',
  categoryId: '',
  salePrice: '0,00',
  currentQuantity: 0,
  minimumStock: 0,
};

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const productId = id;
  const isEditing = Boolean(productId);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const categoriesQuery = useDexieQuery(() => categoryService.listActive(), []);
  const productQuery = useDexieQuery<ProductEditingLookup>(
    () =>
      productId
        ? productService.getForEditing(productId)
        : Promise.resolve({ status: 'not-found' }),
    { status: 'not-found' },
  );

  useEffect(() => {
    if (!productId || productQuery.data.status !== 'active') {
      return;
    }

    const { product } = productQuery.data;
    setFormData({
      name: product.name,
      code: product.code,
      categoryId: product.categoryId ?? '',
      salePrice: formatCentsForInput(product.salePriceInCents),
      currentQuantity: product.currentQuantity,
      minimumStock: product.minimumStock,
    });
  }, [productId, productQuery.data]);

  function updateField(field: keyof ProductFormData, value: string) {
    const numericFields: Array<keyof ProductFormData> = [
      'currentQuantity',
      'minimumStock',
    ];

    setFormData((current) => ({
      ...current,
      [field]: numericFields.includes(field) ? Number(value) : value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    setError('');

    if (!formData.name.trim() || !formData.code.trim()) {
      setError('Preencha nome e codigo.');
      return;
    }

    if (!Number.isInteger(formData.currentQuantity) || !Number.isInteger(formData.minimumStock)) {
      setError('Informe valores numericos validos.');
      return;
    }

    if (formData.currentQuantity < 0 || formData.minimumStock < 0) {
      setError('Valores numericos nao podem ser negativos.');
      return;
    }

    let salePriceInCents: number;

    try {
      salePriceInCents = parseCurrencyToCents(formData.salePrice);
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : 'Informe um preco valido.');
      return;
    }

    const productData = {
      name: formData.name,
      code: formData.code,
      categoryId: formData.categoryId || undefined,
      salePriceInCents,
      currentQuantity: formData.currentQuantity,
      minimumStock: formData.minimumStock,
    };

    const now = new Date().toISOString();
    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      if (isEditing && productId) {
        await productService.update(productId, productData);
      } else {
        await productService.create({
          ...productData,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      navigate('/produtos', {
        state: {
          successMessage: isEditing
            ? 'Produto atualizado com sucesso.'
            : 'Produto cadastrado com sucesso.',
        },
      });
    } catch (saveError) {
      setError(
        getUserFacingError(saveError, 'Nao foi possivel salvar o produto.', [
          'Produto nao encontrado.',
          'Selecione uma categoria ativa valida.',
          'O preco deve ser armazenado em centavos inteiros e nao negativos.',
        ]),
      );
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  if (isEditing && productQuery.isLoading) {
    return <LoadingState message="Carregando produto..." />;
  }

  if (isEditing && productQuery.error) {
    return (
      <ErrorState
        message="Nao foi possivel carregar o produto."
        onRetry={productQuery.refetch}
      />
    );
  }

  if (isEditing && productQuery.data.status === 'not-found') {
    return <UnavailableProduct message="Produto nao encontrado." />;
  }

  if (isEditing && productQuery.data.status === 'deleted') {
    return <UnavailableProduct message="Este produto nao esta mais disponivel." />;
  }

  if (categoriesQuery.isLoading) {
    return <LoadingState message="Carregando categorias..." />;
  }

  if (categoriesQuery.error) {
    return (
      <ErrorState
        message="Nao foi possivel carregar as categorias do formulario."
        onRetry={categoriesQuery.refetch}
      />
    );
  }

  const categories = categoriesQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950">
          {isEditing ? 'Editar produto' : 'Novo produto'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Os dados serao salvos localmente neste dispositivo.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" id="name">
            <input
              id="name"
              value={formData.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Codigo" id="code">
            <input
              id="code"
              value={formData.code}
              onChange={(event) => updateField('code', event.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Categoria" id="categoryId">
            <select
              id="categoryId"
              value={formData.categoryId}
              onChange={(event) => updateField('categoryId', event.target.value)}
              className="input"
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preco" id="salePrice">
            <input
              id="salePrice"
              type="text"
              inputMode="decimal"
              value={formData.salePrice}
              onChange={(event) => updateField('salePrice', event.target.value)}
              className="input"
              placeholder="0,00"
              required
            />
          </Field>
          <Field label="Quantidade atual" id="currentQuantity">
            <input
              id="currentQuantity"
              type="number"
              min="0"
              value={formData.currentQuantity}
              onChange={(event) => updateField('currentQuantity', event.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Estoque minimo" id="minimumStock">
            <input
              id="minimumStock"
              type="number"
              min="0"
              value={formData.minimumStock}
              onChange={(event) => updateField('minimumStock', event.target.value)}
              className="input"
              required
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            to="/produtos"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-900"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar produto'}
          </button>
        </div>
      </form>
    </div>
  );
}

function UnavailableProduct({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
      <h1 className="text-xl font-bold text-amber-900">{message}</h1>
      <p className="mt-2 text-sm text-amber-800">
        Verifique o endereco informado ou retorne para a lista de produtos.
      </p>
      <Link
        to="/produtos"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Voltar para produtos
      </Link>
    </div>
  );
}

interface FieldProps {
  label: string;
  id: string;
  children: ReactNode;
}

function Field({ label, id, children }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
