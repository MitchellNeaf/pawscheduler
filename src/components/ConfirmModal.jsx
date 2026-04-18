/**
 * ConfirmModal — replaces window.confirm() throughout the app.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   // Trigger:
 *   setConfirm({
 *     message: "Delete this appointment?",
 *     confirmLabel: "Delete",          // optional, default "Confirm"
 *     danger: true,                    // optional, makes confirm button red
 *     onConfirm: () => handleDelete(id),
 *   });
 *
 *   // In JSX:
 *   <ConfirmModal config={confirm} onClose={() => setConfirm(null)} />
 */
export default function ConfirmModal({ config, onClose }) {
  if (!config) return null;

  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel  = "Cancel",
    danger       = false,
    onConfirm,
  } = config;

  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">

        {title && (
          <h2 className="font-bold text-gray-900 text-base">{title}</h2>
        )}

        <p className="text-sm text-gray-600 leading-relaxed">
          {message}
        </p>

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            {cancelLabel}
          </button>

          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white
              ${danger
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}