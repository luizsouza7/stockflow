interface OfflineBannerProps {
  isOnline: boolean;
}

export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  if (isOnline) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
      Modo offline ativado. Suas alterações serão sincronizadas quando a conexão voltar.
    </div>
  );
}
