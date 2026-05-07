"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid reset link - no token provided");
    }
  }, [token]);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!newPassword || !confirmPassword) {
      setError("Please fill in both password fields");
      return;
    }

    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Password must contain at least one special character");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // Exchange token for session
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });

      if (sessionError) {
        setError(sessionError.message || "Failed to verify reset link");
        setLoading(false);
        return;
      }

      // Update password with the active session
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Failed to update password");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Reset Password</h1>
        <p style={styles.subtitle}>Enter your new password below</p>

        {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}
        {success && (
          <div style={{ ...styles.alert, ...styles.alertSuccess }}>
            Password updated successfully! Redirecting to login...
          </div>
        )}

        <form onSubmit={handleResetPassword} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={styles.input}
              disabled={loading || success}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={styles.input}
              disabled={loading || success}
            />
          </div>

          <div style={styles.requirements}>
            <p style={styles.requirementTitle}>Password requirements:</p>
            <ul style={styles.requirementList}>
              <li style={checkRequirement(newPassword.length >= 12)}>
                ✓ At least 12 characters
              </li>
              <li style={checkRequirement(/[A-Z]/.test(newPassword))}>
                ✓ One uppercase letter
              </li>
              <li style={checkRequirement(/[a-z]/.test(newPassword))}>
                ✓ One lowercase letter
              </li>
              <li style={checkRequirement(/[0-9]/.test(newPassword))}>
                ✓ One number
              </li>
              <li style={checkRequirement(/[^A-Za-z0-9]/.test(newPassword))}>
                ✓ One special character
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || success || !newPassword || !confirmPassword}
            style={{
              ...styles.button,
              opacity: loading || success || !newPassword || !confirmPassword ? 0.6 : 1,
            }}
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            style={styles.backButton}
            disabled={loading}
          >
            Back to Login
          </button>
        </form>
      </div>
    </div>
  );
}

function checkRequirement(met) {
  return {
    color: met ? "#10b981" : "#94a3b8",
    fontSize: 14,
  };
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "40px",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.1)",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: "8px",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "#64748b",
    marginBottom: "24px",
  },
  alert: {
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
    lineHeight: "1.5",
  },
  alertError: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
  alertSuccess: {
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
  },
  form: {
    display: "grid",
    gap: "16px",
  },
  formGroup: {
    display: "grid",
    gap: "6px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#1e293b",
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "inherit",
  },
  requirements: {
    background: "#f8fafc",
    padding: "12px 14px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
  },
  requirementTitle: {
    margin: "0 0 8px 0",
    fontSize: "13px",
    fontWeight: "600",
    color: "#475569",
  },
  requirementList: {
    margin: 0,
    paddingLeft: "20px",
    display: "grid",
    gap: "4px",
  },
  button: {
    padding: "10px 16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  backButton: {
    padding: "10px 16px",
    background: "white",
    color: "#667eea",
    border: "1px solid #667eea",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};
