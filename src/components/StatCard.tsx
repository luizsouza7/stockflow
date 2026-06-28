interface StatCardProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'success';
}

const toneStyles = {
  default: 'border-slate-200 bg-white text-slate-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneStyles[tone]}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <strong className="mt-2 block text-3xl font-semibold tracking-normal">{value}</strong>
    </div>
  );
}
