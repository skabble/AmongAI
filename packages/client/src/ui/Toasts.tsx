import { useT } from '../i18n';
import { useStore } from '../store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const t = useT();
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          {t(`ev.${toast.code}`, toast.params)}
        </div>
      ))}
    </div>
  );
}
