import { liveQuery } from 'dexie';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useDexieQuery<T>(query: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [queryVersion, setQueryVersion] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;

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
  }, [queryVersion]);

  return { data, isLoading, error, refetch };
}
