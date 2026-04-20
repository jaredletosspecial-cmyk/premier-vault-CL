import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRef, getDailyTotal, createVerificationCode, verifyCode } from '@/lib/api';

interface Props { open: boolean; onClose: () => void; }

export default function WithdrawalModal({ open, onClose }: Props) {
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'form' | 'verify' | 'success'>('form');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);
  const [submittedRef, setSubmittedRef] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && user) {
      supabase.from('withdrawal_details').select('*').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setDetails(data));
      getDailyTotal(user.id, 'Withdrawal').then(setDailyTotal);
    }
  }, [open, user]);

  useEffect(() => {
    if (step === 'verify' && timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [step, timer]);

  if (!open || !user || !profile || !details) return null;

  const numAmount = parseFloat(amount) || 0;
  const fee = numAmount * 0.02;
  const net = numAmount - fee;

  const methodSummary = details.method === 'bank'
    ? `Bank: ${details.bank_name} · ****${details.account_number?.slice(-4)}`
    : `${details.network} · ${details.wallet_address?.slice(0, 8)}...${details.wallet_address?.slice(-6)}`;

  const validate = () => {
    if (numAmount <= 0) return 'Enter a valid amount.';
    if (numAmount < 50) return 'Minimum withdrawal is $50.';
    if (numAmount > 10000) return 'Maximum withdrawal is $10,000 per transaction.';
    if (numAmount > Number(profile.wallet_balance)) return 'Insufficient balance.';
    if (dailyTotal + numAmount > 20000) return `Daily withdrawal limit is $20,000. You've requested $${dailyTotal.toLocaleString()} today.`;
    return null;
  };

  const sendCode = async () => {
    const c = await createVerificationCode(user.id, 'withdrawal');
    setTimer(60);
    toast({ title: '📧 Verification Code Sent', description: `Code: ${c}` });
  };

  const handleProceed = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    await sendCode();
    setStep('verify');
  };

  const handleVerify = async () => {
    const ok = await verifyCode(user.id, code, 'withdrawal');
    if (!ok) { setError('Invalid or expired verification code.'); return; }

    setSubmitting(true);
    const ref = generateRef();

    // Deduct balance immediately (escrow); admin approval will finalize
    const { error: balErr } = await supabase.from('profiles')
      .update({ wallet_balance: Number(profile.wallet_balance) - numAmount })
      .eq('id', user.id);
    if (balErr) { toast({ title: 'Error', description: balErr.message, variant: 'destructive' }); setSubmitting(false); return; }

    const { data: req, error: reqErr } = await supabase.from('withdrawal_requests').insert({
      user_id: user.id, amount: numAmount, fee, net_amount: net,
      withdrawal_details_snapshot: details, status: 'Pending',
    }).select().single();

    if (reqErr) {
      // rollback
      await supabase.from('profiles').update({ wallet_balance: Number(profile.wallet_balance) }).eq('id', user.id);
      toast({ title: 'Error', description: reqErr.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'Withdrawal', amount: numAmount, fee, status: 'Pending',
      reference: ref, description: `Withdrawal to ${details.method === 'bank' ? details.bank_name : details.network} (Fee: $${fee.toFixed(2)})`,
      related_request_id: req.id,
    });

    setSubmittedRef(ref);
    setStep('success');
    setSubmitting(false);
    toast({ title: '⏳ Withdrawal Submitted', description: 'Awaiting admin approval.' });
  };

  const handleClose = () => {
    setStep('form'); setAmount(''); setCode(''); setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-foreground">
            {step === 'success' ? 'Withdrawal Submitted' : 'Withdraw Funds'}
          </h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {step === 'form' && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="text-muted-foreground mb-1">Withdrawal Method</p>
              <p className="text-foreground font-medium">{methodSummary}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Amount (USD)</label>
              <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} placeholder="Min $50" className="input-dark w-full" />
              <p className="text-xs text-muted-foreground mt-1">Min: $50 · Max: $10,000 · Fee: 2%</p>
            </div>

            {numAmount > 0 && (
              <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="text-foreground">${numAmount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee (2%)</span><span className="text-destructive">${fee.toFixed(2)}</span></div>
                <div className="border-t border-border my-1" />
                <div className="flex justify-between font-medium"><span className="text-foreground">You'll receive</span><span className="text-foreground">${net.toFixed(2)}</span></div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <button onClick={handleProceed} className="btn-primary w-full">Continue</button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to your email.</p>
            <input type="text" maxLength={6} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} placeholder="000000" className="input-dark w-full text-center text-2xl tracking-widest" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{timer > 0 ? `Resend in ${timer}s` : ''}</span>
              {timer === 0 && <button onClick={sendCode} className="text-primary hover:underline">Resend Code</button>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep('form'); setError(''); }} className="btn-secondary flex-1">Back</button>
              <button onClick={handleVerify} disabled={code.length !== 6 || submitting} className="btn-primary flex-1">
                {submitting ? 'Processing...' : 'Verify & Submit'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto">
              <span className="text-3xl">⏳</span>
            </div>
            <p className="text-foreground font-semibold">Awaiting Approval</p>
            <p className="text-muted-foreground text-sm">Your withdrawal of ${numAmount.toLocaleString()} is under review.</p>
            <p className="text-xs text-muted-foreground">Estimated processing: 24-48 hours after approval</p>
            <p className="text-xs text-muted-foreground">Reference: {submittedRef}</p>
            <button onClick={handleClose} className="btn-primary w-full">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
