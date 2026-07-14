import { type FormEvent, useRef, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { categoryService } from '../services/categoryService';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getUserFacingError } from '../utils/errors';

export function Categories() {
  const categoriesQuery = useDexieQuery(() => categoryService.listActive(), []);
  const categories = categoriesQuery.data;
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const submissionInProgress = useRef(false);
  const deletionInProgress = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    setError('');
    setSuccess('');
    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      if (editingId) {
        await categoryService.update(editingId, name);
        setSuccess('Categoria atualizada com sucesso.');
      } else {
        await categoryService.create(name);
        setSuccess('Categoria cadastrada com sucesso.');
      }

      setName('');
      setEditingId(undefined);
    } catch (categoryError) {
      setError(
        getUserFacingError(categoryError, 'Nao foi possivel salvar a categoria.', [
          'Informe o nome da categoria.',
          'O nome da categoria deve ter no maximo',
          'Ja existe uma categoria ativa com este nome.',
          'Categoria nao encontrada.',
        ]),
      );
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  function startEditing(id: string, categoryName: string) {
    setEditingId(id);
    setName(categoryName);
    setError('');
    setSuccess('');
  }

  function cancelEditing() {
    setEditingId(undefined);
    setName('');
    setError('');
  }

  async function handleDelete(id: string, categoryName: string) {
    if (deletionInProgress.current) {
      return;
    }

    const confirmed = window.confirm(`Excluir a categoria "${categoryName}"?`);

    if (!confirmed) {
      return;
    }

    setError('');
    setSuccess('');
    deletionInProgress.current = true;
    setDeletingId(id);

    try {
      await categoryService.softDelete(id);
      setSuccess('Categoria excluida com sucesso.');
    } catch (categoryError) {
      setError(
        getUserFacingError(categoryError, 'Nao foi possivel excluir a categoria.', [
          'Categoria nao encontrada.',
          'Nao e possivel excluir esta categoria porque ela esta sendo utilizada por',
        ]),
      );
    } finally {
      deletionInProgress.current = false;
      setDeletingId(undefined);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Categorias</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize os produtos sem depender de conexao com a internet.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <h2 className="font-semibold text-slate-950">
            {editingId ? 'Editar categoria' : 'Nova categoria'}
          </h2>

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="category-name">
            Nome
            <input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              className="input mt-2"
              maxLength={80}
              required
            />
          </label>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
            >
              {isSubmitting
                ? editingId
                  ? 'Salvando...'
                  : 'Cadastrando...'
                : editingId
                  ? 'Salvar alteracoes'
                  : 'Cadastrar categoria'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Categorias ativas</h2>
        </div>
        {categoriesQuery.isLoading ? (
          <div className="p-4">
            <LoadingState message="Carregando categorias..." />
          </div>
        ) : categoriesQuery.error ? (
          <div className="p-4">
            <ErrorState
              message="Nao foi possivel carregar as categorias."
              onRetry={categoriesQuery.refetch}
            />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma categoria cadastrada"
              description="Cadastre uma categoria ou mantenha produtos sem categoria."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((category) => (
              <article
                key={category.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="font-semibold text-slate-950">{category.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(category.id, category.name)}
                    disabled={isSubmitting || deletingId !== undefined}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category.id, category.name)}
                    disabled={isSubmitting || deletingId !== undefined}
                    className="min-h-10 rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    {deletingId === category.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
