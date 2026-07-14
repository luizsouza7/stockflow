// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useDexieQuery } from './useDexieQuery';

afterEach(cleanup);

describe('useDexieQuery', () => {
  it('inicia em loading e expoe os dados apos sucesso', async () => {
    render(<QueryProbe query={() => Promise.resolve(['produto'])} />);

    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('produto')).toBeTruthy());
    expect(screen.queryByText('loading')).toBeNull();
  });

  it('expoe erro quando a consulta falha', async () => {
    render(<QueryProbe query={() => Promise.reject(new Error('falha controlada'))} />);

    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('falha controlada')).toBeTruthy());
    expect(screen.queryByText('loading')).toBeNull();
  });
});

function QueryProbe({ query }: { query: () => Promise<string[]> }) {
  const { data, isLoading, error } = useDexieQuery(query, []);

  if (isLoading) return <p>loading</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data.join(',')}</p>;
}
