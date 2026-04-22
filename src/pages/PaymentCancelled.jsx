// src/pages/PaymentCancelled.jsx
export default function PaymentCancelled() {
  return (
    <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl">↩️</div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">Payment Cancelled</h1>
        <p className="text-[var(--text-2)]">
          No payment was taken. If you'd like to pay, use the link your groomer sent you.
        </p>
        <p className="text-sm text-[var(--text-3)]">You can close this page.</p>
      </div>
    </main>
  );
}