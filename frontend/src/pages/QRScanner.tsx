import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import {
  QrCode as QrIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';

const QRScanner: React.FC = () => {
  const { user } = useAuth();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const isRecoveringSession = useRef(false);
  const disconnectedPollsRef = useRef(0);
  const forcedResetRef = useRef(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (status === 'scanning' && user) {
      console.log('🔄 [QR] Starting polling for', user.id);

      const poll = async () => {
        try {
          const res = await client.get(`/sessions/${user.id}/status`);
          const data = res.data;
          const backendStatus = data.status as string;

          if (data.qrDataUrl) {
            setQrCodeUrl(data.qrDataUrl);
            disconnectedPollsRef.current = 0;
          }

          if (backendStatus === 'connected') {
            setPhone(data.phone);
            setStatus('connected');
            if (pollInterval) clearInterval(pollInterval);
            return;
          }

          if (backendStatus === 'qr_pending' || backendStatus === 'connecting') {
            setStatus('scanning');
            disconnectedPollsRef.current = 0;
            return;
          }

          if (backendStatus === 'no_session' && !isRecoveringSession.current) {
            isRecoveringSession.current = true;
            try {
              await client.post('/sessions', {});
            } finally {
              isRecoveringSession.current = false;
            }
            return;
          }

          if (backendStatus === 'disconnected') {
            disconnectedPollsRef.current++;
            if (disconnectedPollsRef.current >= 15) {
              setError('Connection lost. Please try scanning the QR code again.');
              setStatus('error');
              if (pollInterval) clearInterval(pollInterval);
              return;
            }
            return;
          }

          if (backendStatus === 'error') {
            setError(data.message || 'Connection failed');
            setStatus('error');
            if (pollInterval) clearInterval(pollInterval);
          }
        } catch (err) {
          console.error('Polling failed', err);
        }
      };

      poll();
      pollInterval = setInterval(poll, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [status, user]);

  const startConnection = async () => {
    if (!user) return;
    isRecoveringSession.current = false;
    disconnectedPollsRef.current = 0;
    forcedResetRef.current = false;
    setError(null);
    setQrCodeUrl(null);
    setStatus('scanning');
    try {
      await client.post('/sessions', {});
    } catch (err) {
      console.error('Failed to start session', err);
      setError('Failed to start session. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold text-ink-400">Connect WhatsApp</h1>
        <p className="text-[13px] text-ink-50">Link your business phone to activate the AI assistant.</p>
      </div>

      <motion.div layout>
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6 py-16"
            >
              <div className="w-20 h-20 rounded-full bg-pastel-lilac flex items-center justify-center">
                <QrIcon className="w-10 h-10 text-soft-lavender" />
              </div>
              <div className="text-center max-w-sm space-y-2">
                <h3 className="font-display text-xl font-bold text-ink-300">Ready to connect?</h3>
                <p className="text-sm text-ink-50">
                  Generate a QR code and scan it from your phone's WhatsApp to link your business number.
                </p>
              </div>
              <Button variant="primary" size="lg" onClick={startConnection}>
                Generate QR Code
              </Button>
            </motion.div>
          )}

          {status === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-8 py-10"
            >
              <div className="space-y-3 text-center">
                <div className="inline-flex items-center gap-2 bg-pastel-honey text-soft-honey px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider">
                  <Smartphone className="w-3.5 h-3.5" /> Waiting for Scan
                </div>
                <h3 className="font-display text-xl font-bold text-ink-300">Scan with your phone</h3>
              </div>

              <div className="bg-white rounded-[24px] p-8">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="WhatsApp QR Code" className="w-[280px] h-[280px]" />
                ) : (
                  <div className="w-[280px] h-[280px] flex items-center justify-center">
                    <RefreshCw className="w-12 h-12 text-ink-50 animate-spin" />
                  </div>
                )}
              </div>

              <div className="max-w-md w-full bg-pastel-sky/40 rounded-2xl p-4">
                <p className="text-sm font-semibold text-ink-200 mb-2">Steps to connect:</p>
                <ol className="list-decimal list-inside text-sm text-ink-100 space-y-1">
                  <li>Open WhatsApp on your phone</li>
                  <li>Go to Settings {'>'} Linked Devices</li>
                  <li>Tap "Link a Device" and scan the code</li>
                </ol>
              </div>

              <button
                onClick={() => setStatus('idle')}
                className="text-sm text-ink-50 font-semibold hover:text-ink-200 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {status === 'connected' && (
            <motion.div
              key="connected"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6 py-16"
            >
              <div className="w-20 h-20 rounded-full bg-pastel-sage flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-soft-sage" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-display text-2xl font-bold text-ink-400">Device Linked!</h3>
                <p className="text-ink-100">
                  Connected with <span className="font-semibold text-ink-300">{phone}</span>
                </p>
              </div>
              <Button variant="primary" size="lg" onClick={() => window.location.href = '/dashboard'}>
                Go to Dashboard
              </Button>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-6 py-16"
            >
              <div className="w-20 h-20 rounded-full bg-pastel-rose flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-soft-rose" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-display text-xl font-bold text-soft-rose">Connection Failed</h3>
                <p className="text-sm text-ink-50">{error}</p>
              </div>
              <Button variant="ghost" onClick={startConnection}>
                Try Again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default QRScanner;
