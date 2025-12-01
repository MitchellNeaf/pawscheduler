import { useState } from "react";
import { supabase } from "../supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);

  const handleUpdate = async () => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      alert(error.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold mb-4">Password Updated</h2>
        <p>You can now close this tab and log in.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-sm mx-auto">
      <h2 className="text-xl font-bold mb-6">Set New Password</h2>

      <input
        type="password"
        className="w-full border px-3 py-2 rounded mb-4"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="w-full bg-blue-600 text-white py-2 rounded"
        onClick={handleUpdate}
      >
        Update Password
      </button>
    </div>
  );
}
