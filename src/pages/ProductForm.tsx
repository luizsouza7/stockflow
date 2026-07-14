import { FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productService } from '../services/productService';
import type { ProductFormData } from '../types/Product';
import { formatCentsForInput, parseCurrencyToCents } from '../utils/formatters';
import { categoryService } from '../services/categoryService';
import { useDexieQuery } from '../hooks/useDexieQuery';

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
  const { data: categories } = useDexieQuery(() => categoryService.listActive(), []);

  useEffect(() => {
    if (!productId) {
      return;
    }

    productService.getById(productId).then((product) => {
      if (product) {
        setFormData({
          name: product.name,
          code: product.code,
          categoryId: product.categoryId ?? '',
          salePrice: formatCentsForInput(product.salePriceInCents),
          currentQuantity: product.currentQuantity,
          minimumStock: product.minimumStock,
        });
      }
    });
  }, [productId]);

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

      navigate('/produtos');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o produto.',
      );
    }
  }

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
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
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
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-900"
          >
            Salvar produto
          </button>
        </div>
      </form>
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
