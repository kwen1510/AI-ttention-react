import { useEffect } from "react";
import { initAdminAuth } from "../scripts/initAdminAuth.js";
import { useAuth } from "../components/AuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (!loading && user) {
      const redirect = params.get("redirect");
      navigate(redirect || "/admin", { replace: true });
    }
  }, [loading, navigate, params, user]);

  useEffect(() => {
    const destroy = initAdminAuth();
    return () => {
      destroy?.();
    };
  }, []);

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

          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-800 mb-2"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="teacher@ri.edu.sg or teacher@schools.gov.sg"
            autoComplete="email"
            className="w-full rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur px-4 py-3 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 min-h-touch"
          />

          <button
            id="sendCodeBtn"
            type="button"
            className="btn btn-primary glow w-full mt-4 justify-center text-sm sm:text-base min-h-touch"
          >
            Send OTP
          </button>

          <button
            id="resendBtn"
            type="button"
            disabled
            className="btn btn-muted w-full mt-2 justify-center hidden"
          >
            Resend in 30s
          </button>

          <div id="otpSection" className="hidden mt-6">
            <label
              htmlFor="otp"
              className="block text-sm font-medium text-slate-800 mb-2"
            >
              Enter OTP Code
            </label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              className="w-full rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur px-4 py-3 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 min-h-touch"
            />
            <button
              id="verifyBtn"
              type="button"
              className="btn btn-primary glow w-full mt-4 justify-center text-sm sm:text-base min-h-touch"
            >
              Verify &amp; Sign In
            </button>
          </div>

          <button
            id="signOutBtn"
            type="button"
            className="btn btn-muted w-full mt-4 hidden justify-center"
          >
            Sign Out
          </button>

          <div
            id="msg"
            aria-live="polite"
            className="text-sm text-slate-700 mt-4"
          />
          <div
            id="error"
            aria-live="assertive"
            className="text-sm text-rose-700 mt-2"
          />
          <div
            id="ok"
            aria-live="polite"
            className="text-sm text-emerald-700 mt-2"
          />
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
