import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Building2, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const Onboarding: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState({
    business_name: '',
    industry: '',
    services: [] as string[]
  });

  const [servicesInput, setServicesInput] = useState('');

  const nextStep = () => setStep(s => s + 1);

  const handleComplete = async () => {
    setLoading(true);
    try {
      await client.patch(`/users/${user?.id}`, {
        ...profile,
        services: servicesInput.split(',').map(s => s.trim()).filter(Boolean)
      });
      navigate('/dashboard');
    } catch (err) {
      alert('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Soft pastel decorative blurs */}
      <div className="absolute top-[-8%] right-[-5%] w-[35%] h-[35%] bg-pastel-lavender/40 rounded-full blur-[100px]" />
      <div className="absolute bottom-[10%] left-[-8%] w-[30%] h-[30%] bg-pastel-honey/40 rounded-full blur-[100px]" />

      <div className="w-full max-w-xl relative z-10">
        {/* Step indicator */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-ink-50 uppercase tracking-[0.08em] mb-3">
            Step {step} of 2
          </p>
          <div className="flex gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-ink-300" />
            <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-ink-300' : 'bg-cream-200'}`} />
          </div>
        </div>

        {/* Step content */}
        {step === 1 && (
          <motion.div
            key={1}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <h1 className="font-display text-[24px] font-bold text-ink-400">
                Tell us about your business
              </h1>
              <p className="text-[15px] text-ink-50 mt-1.5">
                We'll personalize your AI assistant.
              </p>
            </div>

            <div className="space-y-5">
              <Input
                label="Business Name"
                color="honey"
                icon={<Building2 className="w-[18px] h-[18px]" />}
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                placeholder="Your business name"
              />

              <Input
                label="Industry"
                color="lavender"
                icon={<Briefcase className="w-[18px] h-[18px]" />}
                value={profile.industry}
                onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                placeholder="e.g. Used Cars, Real Estate"
              />
            </div>

            <div className="pt-1">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={nextStep}
                disabled={!profile.business_name || !profile.industry}
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key={2}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <h1 className="font-display text-[24px] font-bold text-ink-400">
                What do you sell?
              </h1>
              <p className="text-[15px] text-ink-50 mt-1.5">
                Your AI uses this to answer customer enquiries.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-100 uppercase tracking-wider">
                Products & Services
              </label>
              <textarea
                className="w-full h-40 bg-pastel-sage/40 rounded-input p-4 text-sm text-ink-300 placeholder:text-ink-50 focus:ring-2 focus:ring-ink-200/30 outline-none border-0 transition-all duration-150"
                placeholder="List products/services, comma separated..."
                value={servicesInput}
                onChange={(e) => setServicesInput(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-[2]"
                loading={loading}
                disabled={!servicesInput.trim() || loading}
                onClick={handleComplete}
              >
                {loading ? 'Setting up...' : 'Start using Vyavsay'}
              </Button>
            </div>
          </motion.div>
        )}
      </div>

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

export default Onboarding;
