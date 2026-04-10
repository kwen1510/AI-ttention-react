import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSupabaseClient } from "../config/supabaseClient";
import { sanitizeRedirect } from "../lib/sanitizeRedirect.js";
import { Alert } from "../components/ui/alert.jsx";
import { Button } from "../components/ui/button.jsx";
import { Field, Input } from "../components/ui/field.jsx";
import { Badge } from "../components/ui/badge.jsx";
import { Panel } from "../components/ui/panel.jsx";

function LoginPage() {
  const { user, loading, isTeacher } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("email"); // email, otp
  const [status, setStatus] = useState({ type: "", message: "" });
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      if (!isTeacher) {
        navigate("/student?blocked=teacher", { replace: true });
        return;
      }
      const redirect = sanitizeRedirect(params.get("redirect"));
      navigate(redirect || "/admin", { replace: true });
    }
  }, [isTeacher, loading, navigate, params, user]);

  useEffect(() => {
    let interval;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setStatus({ type: "info", message: "Sending code..." });

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + "/admin",
        },
      });

      if (error) throw error;

      setStatus({ type: "success", message: "OTP sent! Check your inbox." });
      setStep("otp");
      setCooldown(30);
    } catch (err) {
      console.error("Login error:", err);
      setStatus({ type: "error", message: err.message || "Failed to send OTP." });
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setStatus({ type: "info", message: "Verifying..." });

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });

      if (error) throw error;
      if (!data.session) throw new Error("Invalid OTP response");

      setStatus({ type: "success", message: "Verified! Signing in..." });
      // AuthContext will handle the redirect via useEffect
    } catch (err) {
      console.error("Verification error:", err);
      setStatus({ type: "error", message: err.message || "Verification failed." });
    }
  };

  return (
    <div className="page-shell flex min-h-screen items-center justify-center py-12">
      <Panel padding="lg" className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <p className="eyebrow">Teacher sign in</p>
          <h1 className="mt-2 text-3xl font-semibold">AI(ttention)</h1>
          <p className="mt-3">Use the one-time code sent to your approved teacher email.</p>
          <div className="mt-4 flex justify-center">
            <Badge tone="neutral">{step === "email" ? "Step 1 of 2" : "Step 2 of 2"}</Badge>
          </div>
        </div>

          {step === "email" ? (
            <form onSubmit={handleSendOtp}>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                  autoComplete="email"
                  required
                />
              </Field>

              <Button type="submit" variant="primary" size="lg" className="mt-4 w-full">
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <Field label="Enter code" htmlFor="otp" hint="Check your inbox for the latest one-time code.">
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  required
                />
              </Field>

              <Button type="submit" variant="primary" size="lg" className="mt-4 w-full">
                Verify and sign in
              </Button>

              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={cooldown > 0}
                variant="secondary"
                size="lg"
                className="mt-2 w-full"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </Button>
            </form>
          )}

          {status.message && (
            <Alert
              className="mt-4"
              tone={
                status.type === "error"
                  ? "danger"
                  : status.type === "success"
                    ? "success"
                    : "primary"
              }
            >
              <p>{status.message}</p>
            </Alert>
          )}
      </Panel>
    </div>
  );
}

export default LoginPage;
