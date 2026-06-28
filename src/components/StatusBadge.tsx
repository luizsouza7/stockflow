interface StatusBadgeProps {
  isOnline: boolean;
}

export function StatusBadge({ isOnline }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
        isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}
