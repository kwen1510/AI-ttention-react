import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSupabaseClient } from "../config/supabaseClient";
import { isAllowedTeacherUser } from "../lib/teacherAccess.js";

function LoginPage() {
  const { user, loading, allowedDomains, allowedEmails } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("email"); // email, otp
  const [status, setStatus] = useState({ type: "", message: "" });
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      if (!isAllowedTeacherUser(user, allowedDomains, allowedEmails)) {
        navigate("/student?blocked=teacher", { replace: true });
        return;
      }
      const redirect = params.get("redirect");
      navigate(redirect || "/admin", { replace: true });
    }
  }, [allowedDomains, allowedEmails, loading, navigate, params, user]);

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
          shouldCreateUser: true,
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
    <div className="min-h-screen text-black font-sans relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[36rem] h-[36rem] rounded-full bg-emerald-200 blur-3xl opacity-60" />
        <div className="absolute -bottom-32 -right-16 w-[32rem] h-[32rem] rounded-full bg-sky-200 blur-3xl opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.75),_transparent_60%),radial-gradient(ellipse_at_bottom,_rgba(255,255,255,0.6),_transparent_60%)]" />
      </div>

      <div
        className="brand-mini"
        style={{
          position: "fixed",
          top: "12px",
          left: "16px",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "0.9rem",
          color: "#0f172a",
          opacity: 0.9,
        }}
      >
        AI(ttention)
      </div>

      <div className="mx-auto max-w-lg px-4 sm:px-6 md:px-8 pt-16 sm:pt-20 pb-12 sm:pb-16">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
            Teacher Sign In
          </h1>
        </div>

        <div className="relative rounded-2xl border border-white/50 bg-white/70 backdrop-blur-xl shadow-glow p-4 sm:p-6 md:p-8">
          <div className="absolute -inset-px rounded-2xl pointer-events-none shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" />

          {step === "email" ? (
            <form onSubmit={handleSendOtp}>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-800 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur px-4 py-3 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 min-h-touch"
              />

              <button
                type="submit"
                className="btn btn-primary glow w-full mt-4 justify-center text-sm sm:text-base min-h-touch"
              >
                Send OTP
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-slate-800 mb-2"
              >
                Enter OTP Code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoComplete="one-time-code"
                placeholder="6-digit code"
                required
                className="w-full rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur px-4 py-3 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 min-h-touch"
              />

              <button
                type="submit"
                className="btn btn-primary glow w-full mt-4 justify-center text-sm sm:text-base min-h-touch"
              >
                Verify & Sign In
              </button>

              <button
                type="button"
                onClick={handleSendOtp}
                disabled={cooldown > 0}
                className="btn btn-muted w-full mt-2 justify-center"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </button>
            </form>
          )}

          {status.message && (
            <div
              className={`text-sm mt-4 p-2 rounded ${status.type === "error"
                ? "text-rose-700 bg-rose-50"
                : status.type === "success"
                  ? "text-emerald-700 bg-emerald-50"
                  : "text-slate-700 bg-slate-50"
                }`}
            >
              {status.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
