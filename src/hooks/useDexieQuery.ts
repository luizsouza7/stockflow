import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

export function useDexieQuery<T>(query: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (value) => {
        setData(value);
        setIsLoading(false);
      },
      error: () => setIsLoading(false),
    });

    return () => subscription.unsubscribe();
    // A consulta do Dexie fica reativa por liveQuery; as telas passam funcoes estaveis no ciclo de vida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, isLoading };
}
