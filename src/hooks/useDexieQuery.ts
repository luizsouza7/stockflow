import { liveQuery } from 'dexie';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export function useDexieQuery<T>(
  query: () => Promise<T>,
  initialValue: T,
  dependencies: DependencyList = [],
) {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [queryVersion, setQueryVersion] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const dependencySignal = useDependencySignal(dependencies);

  const refetch = useCallback(() => setQueryVersion((version) => version + 1), []);

  useEffect(() => {
    setIsLoading(true);
    setError(undefined);

    const subscription = liveQuery(() => queryRef.current()).subscribe({
      next: (value) => {
        setData(value);
        setIsLoading(false);
      },
      error: (queryError) => {
        setError(
          queryError instanceof Error
            ? queryError
            : new Error('Falha desconhecida ao consultar o banco local.'),
        );
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [dependencySignal, queryVersion]);

  return { data, isLoading, error, refetch };
}

function useDependencySignal(dependencies: DependencyList): number {
  const previousDependencies = useRef<DependencyList>(dependencies);
  const signal = useRef(0);

  if (!haveEqualDependencies(previousDependencies.current, dependencies)) {
    previousDependencies.current = dependencies;
    signal.current += 1;
  }

  return signal.current;
}

function haveEqualDependencies(previous: DependencyList, next: DependencyList): boolean {
  return (
    previous.length === next.length &&
    previous.every((dependency, index) => Object.is(dependency, next[index]))
  );
}
