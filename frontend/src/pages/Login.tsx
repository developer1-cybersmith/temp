import React, { useState } from 'react';
import { supabase } from '../api/supabase';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import VyavsayLogo from '../components/brand/VyavsayLogo';

const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError("Check your email for the confirmation link!");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Soft pastel decorative blurs */}
      <div className="absolute top-[-8%] right-[-5%] w-[35%] h-[35%] bg-pastel-lavender/40 rounded-full blur-[100px]" />
      <div className="absolute bottom-[10%] left-[-8%] w-[30%] h-[30%] bg-pastel-honey/40 rounded-full blur-[100px]" />
      <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] bg-pastel-sage/30 rounded-full blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-[24px] bg-white/80 border border-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)] flex items-center justify-center mb-6 backdrop-blur-sm">
            <VyavsayLogo className="w-11 h-11" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-50 mb-2">
            Vyavsay Assist
          </p>
          <h1 className="font-display text-[30px] font-bold text-ink-400 text-center">
            {isLogin ? 'Welcome back.' : 'Create account.'}
          </h1>
          <p className="text-ink-50 text-[15px] mt-1.5 text-center">
            {isLogin
              ? 'Your business is waiting for you.'
              : 'Get started with your AI sales copilot.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Email"
            type="email"
            color="honey"
            icon={<Mail className="w-[18px] h-[18px]" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@business.com"
            autoComplete="email"
            required
          />

          <Input
            label="Password"
            type="password"
            color="lavender"
            icon={<Lock className="w-[18px] h-[18px]" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
          />

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              role="alert"
              className="bg-pastel-rose/60 rounded-2xl p-3.5 flex items-center gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-soft-rose shrink-0" />
              <span className="text-soft-rose text-sm">{error}</span>
            </motion.div>
          )}

          <div className="pt-1">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
            >
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </div>
        </form>

        {/* Toggle link */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
            className="text-sm text-ink-50 hover:text-ink-200 transition-colors cursor-pointer"
          >
            {isLogin ? (
              <>Don't have an account?{' '}<span className="text-ink-300 font-semibold">Create one</span></>
            ) : (
              <>Already have an account?{' '}<span className="text-ink-300 font-semibold">Sign in</span></>
            )}
          </button>
        </div>
      </motion.div>

      {/* Decorative bottom color band */}
      <div className="fixed bottom-0 left-0 right-0 flex">
        <div className="flex-1 h-2 bg-pastel-peach" />
        <div className="flex-1 h-2 bg-pastel-sage" />
        <div className="flex-1 h-2 bg-pastel-lavender" />
        <div className="flex-1 h-2 bg-pastel-sky" />
        <div className="flex-1 h-2 bg-pastel-honey" />
      </div>
    </div>
  );
};

export default Login;
