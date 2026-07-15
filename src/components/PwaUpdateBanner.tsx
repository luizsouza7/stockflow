interface PwaUpdateBannerProps {
  isVisible: boolean;
  onUpdate: () => void;
}

export function PwaUpdateBanner({ isVisible, onUpdate }: PwaUpdateBannerProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <span className="font-medium">Nova versão disponível.</span>
      <button
        type="button"
        onClick={onUpdate}
        className="shrink-0 rounded-md bg-sky-700 px-3 py-1.5 font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
      >
        Atualizar agora
      </button>
    </div>
  );
}
