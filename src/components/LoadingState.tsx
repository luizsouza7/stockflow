interface LoadingStateProps {
  message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600"
    >
      {message}
    </div>
  );
}
