import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { X, CreditCard, Building2, Bitcoin } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRef, getDailyTotal } from '@/lib/api';

interface Props { open: boolean; onClose: () => void; }

export default function DepositModal({ open, onClose }: Props) {
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'card' | 'bank' | 'crypto'>('card');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [submittedRef, setSubmittedRef] = useState('');
  const [error, setError] = useState('');
  const [dailyTotal, setDailyTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && user) getDailyTotal(user.id, 'Deposit').then(setDailyTotal);
  }, [open, user]);

  if (!open || !user || !profile) return null;

  const numAmount = parseFloat(amount) || 0;

  const validate = () => {
    if (numAmount <= 0) return 'Enter a valid amount.';
    if (numAmount < 100) return 'Minimum deposit is $100.';
    if (numAmount > 50000) return 'Maximum deposit is $50,000 per transaction.';
    if (dailyTotal + numAmount > 50000) return `Daily deposit limit is $50,000. You've requested $${dailyTotal.toLocaleString()} today.`;
    return null;
  };

  const handleProceed = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const ref = generateRef();
    const { data: req, error: reqErr } = await supabase.from('deposit_requests').insert({
      user_id: user.id, amount: numAmount, payment_method: method, payment_reference: reference || null, status: 'Pending',
    }).select().single();

    if (reqErr) { toast({ title: 'Error', description: reqErr.message, variant: 'destructive' }); setSubmitting(false); return; }

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'Deposit', amount: numAmount, status: 'Pending',
      reference: ref, description: `Deposit via ${method} (pending review)`, related_request_id: req.id,
    });

    setSubmittedRef(ref);
    setStep('success');
    setSubmitting(false);
    toast({ title: '⏳ Deposit Submitted', description: 'Your deposit is awaiting admin approval.' });
  };

  const handleClose = () => {
    setStep('form'); setAmount(''); setReference(''); setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-foreground">
            {step === 'success' ? 'Deposit Submitted' : 'Deposit Funds'}
          </h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Amount (USD)</label>
              <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} placeholder="Min $100" className="input-dark w-full" />
              <p className="text-xs text-muted-foreground mt-1">Min: $100 · Max: $50,000</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {([['card', CreditCard, 'Card'], ['bank', Building2, 'Bank'], ['crypto', Bitcoin, 'Crypto']] as const).map(([key, Icon, label]) => (
                  <button key={key} onClick={() => setMethod(key)} className={`p-3 rounded-lg border text-center text-xs transition-all ${method === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/60'}`}>
                    <Icon className="w-5 h-5 mx-auto mb-1" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Payment Reference (optional)</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Bank ref / Tx hash" className="input-dark w-full" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <button onClick={handleProceed} className="btn-primary w-full">Continue</button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="text-foreground font-medium">${numAmount.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Method</span><span className="text-foreground font-medium capitalize">{method}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Status</span><span className="text-warning">Pending review</span></div>
            </div>
            <p className="text-xs text-muted-foreground">Your deposit will be credited after admin approval.</p>
            <div className="flex gap-3">
              <button onClick={() => setStep('form')} className="btn-secondary flex-1">Back</button>
              <button onClick={handleConfirm} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Submitting...' : 'Submit Deposit'}
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
            <p className="text-muted-foreground text-sm">${numAmount.toLocaleString()} will be credited once an admin approves it.</p>
            <p className="text-xs text-muted-foreground">Reference: {submittedRef}</p>
            <button onClick={handleClose} className="btn-primary w-full">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
