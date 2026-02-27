// pages/login.tsx
import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const username = (form.elements.namedItem('username') as HTMLInputElement)
      ?.value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement)
      ?.value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Clear session storage flags for fresh login experience
      sessionStorage.removeItem('warzone_intro_played');
      
      // Play login sound (user clicked login button, so autoplay is allowed)
      try {
        const audio = new Audio('/sounds/login-success.mp3');
        audio.volume = 0.7;
        await audio.play();
        // Give a brief moment for the intro to hit, then redirect
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (audioErr) {
        // Sound blocked or failed - continue anyway
        console.log('Login sound skipped:', audioErr);
      }

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Team Shred – Login</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center text-slate-100 px-4 py-8 bg-slate-950">
        {/* Logo + Login form centered */}
        <div className="w-full max-w-sm sm:max-w-md">
          <img
            src="/images/teamshred-logo.png"
            alt="Team Shred"
            className="w-full rounded-t-2xl object-contain mb-4"
            data-testid="img-login-logo"
          />
        </div>
        <div className="w-full max-w-sm sm:max-w-md">
          <form
            onSubmit={handleSubmit}
            className="bg-slate-900/85 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl backdrop-blur-sm"
          >
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-200 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-200 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-medium text-sm px-3 py-2 transition-colors"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          {/* Version text below login box */}
          <div className="text-center mt-3">
            <p className="text-xs text-slate-500">Team Shred v2.0</p>
          </div>
        </div>
      </main>
    </>
  );
}
