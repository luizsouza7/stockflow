// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDexieQuery } from './useDexieQuery';

const subscriptionTracker = vi.hoisted(() => ({
  active: 0,
  maximumActive: 0,
  unsubscribeCount: 0,
  ignoredAfterUnsubscribe: 0,
}));

vi.mock('dexie', () => ({
  liveQuery: (querier: () => Promise<unknown>) => ({
    subscribe(observer: {
      next: (value: unknown) => void;
      error: (error: unknown) => void;
    }) {
      let active = true;
      subscriptionTracker.active += 1;
      subscriptionTracker.maximumActive = Math.max(
        subscriptionTracker.maximumActive,
        subscriptionTracker.active,
      );

      Promise.resolve()
        .then(querier)
        .then(
          (value) => {
            if (active) {
              observer.next(value);
            } else {
              subscriptionTracker.ignoredAfterUnsubscribe += 1;
            }
          },
          (error) => {
            if (active) {
              observer.error(error);
            } else {
              subscriptionTracker.ignoredAfterUnsubscribe += 1;
            }
          },
        );

      return {
        unsubscribe() {
          if (!active) return;
          active = false;
          subscriptionTracker.active -= 1;
          subscriptionTracker.unsubscribeCount += 1;
        },
      };
    },
  }),
}));

beforeEach(() => {
  subscriptionTracker.active = 0;
  subscriptionTracker.maximumActive = 0;
  subscriptionTracker.unsubscribeCount = 0;
  subscriptionTracker.ignoredAfterUnsubscribe = 0;
});

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

  it('executa refetch manual sem manter duas subscriptions', async () => {
    const query = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['primeiro'])
      .mockResolvedValueOnce(['segundo']);
    render(<QueryProbe query={query} />);

    await waitFor(() => expect(screen.getByText('primeiro')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('segundo')).toBeTruthy());
    expect(query).toHaveBeenCalledTimes(2);
    expect(subscriptionTracker.maximumActive).toBe(1);
    expect(subscriptionTracker.active).toBe(1);
  });

  it('troca de A para B, encerra a assinatura anterior e consulta a nova dependencia', async () => {
    const queryA = vi.fn(() => Promise.resolve(['A']));
    const queryBResult = deferred<string[]>();
    const queryB = vi.fn(() => queryBResult.promise);
    const view = render(<QueryProbe query={queryA} dependencies={['A']} />);

    await waitFor(() => expect(screen.getByText('A')).toBeTruthy());
    expect(subscriptionTracker.active).toBe(1);

    view.rerender(<QueryProbe query={queryB} dependencies={['B']} />);

    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(queryB).toHaveBeenCalledTimes(1));
    expect(subscriptionTracker.unsubscribeCount).toBe(1);
    expect(subscriptionTracker.active).toBe(1);
    expect(subscriptionTracker.maximumActive).toBe(1);

    await act(async () => {
      queryBResult.resolve(['B']);
      await queryBResult.promise;
    });

    await waitFor(() => expect(screen.getByText('B')).toBeTruthy());
    expect(screen.queryByText('A')).toBeNull();
    expect(queryA).toHaveBeenCalledTimes(1);
  });

  it('faz cleanup no unmount e ignora resultado concluido depois dele', async () => {
    const pendingResult = deferred<string[]>();
    const view = render(<QueryProbe query={() => pendingResult.promise} />);

    await waitFor(() => expect(subscriptionTracker.active).toBe(1));
    view.unmount();

    expect(subscriptionTracker.active).toBe(0);
    expect(subscriptionTracker.unsubscribeCount).toBe(1);

    await act(async () => {
      pendingResult.resolve(['tardio']);
      await pendingResult.promise;
    });

    await waitFor(() => expect(subscriptionTracker.ignoredAfterUnsubscribe).toBe(1));
    expect(screen.queryByText('tardio')).toBeNull();
  });
});

function QueryProbe({
  query,
  dependencies = [],
}: {
  query: () => Promise<string[]>;
  dependencies?: readonly unknown[];
}) {
  const { data, isLoading, error, refetch } = useDexieQuery(query, [], dependencies);
  const message = isLoading ? 'loading' : error ? error.message : data.join(',');

  return (
    <>
      <p>{message}</p>
      <button type="button" onClick={refetch}>
        Atualizar
      </button>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
