// src/pages/PaymentSuccess.jsx
export default function PaymentSuccess() {
  return (
    <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">Payment Received!</h1>
        <p className="text-[var(--text-2)]">
          Thank you — your payment was processed successfully.
          Your groomer has been notified.
        </p>
        <p className="text-sm text-[var(--text-3)]">You can close this page.</p>
      </div>
    </main>
  );
}