import { useCallback, useEffect, useRef, useState } from 'react';

// Mount with an account/object/filter key. Reads and actions cannot outlive that scope.
export default function useRemoteResource(read) {
  const live = useRef(false), sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const isCurrent = useCallback(() => live.current, []);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setState({ data: null, loading: true, error: null });
    try {
      const data = await read();
      if (!live.current || request !== sequence.current) return false;
      setState({ data, loading: false, error: null }); return true;
    } catch (error) {
      if (live.current && request === sequence.current) setState({ data: null, loading: false, error });
      return false;
    }
  }, [read]);
  const update = useCallback((apply) => setState((current) => ({ ...current, data: apply(current.data) })), []);
  useEffect(() => {
    live.current = true;
    const timer = setTimeout(() => { void reload(); }, 0);
    return () => { live.current = false; invalidate(); clearTimeout(timer); };
  }, [reload, invalidate]);
  return { ...state, reload, update, isCurrent };
}
