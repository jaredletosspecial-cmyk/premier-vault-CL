import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CreditCard, Bitcoin, Check, ArrowRight, Shield } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { createVerificationCode, verifyCode } from '@/lib/api';

const banks = ['Chase Bank', 'Bank of America', 'Wells Fargo', 'Citibank', 'US Bank', 'Capital One', 'TD Bank', 'PNC Bank', 'Other'];
const networks = ['ERC20', 'BEP20', 'TRC20'];
const currencies = ['USDT', 'BTC', 'ETH'];

export default function WithdrawalDetailsPage() {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<'bank' | 'crypto'>('bank');
  const [existing, setExisting] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');

  const [network, setNetwork] = useState('ERC20');
  const [walletAddress, setWalletAddress] = useState('');
  const [confirmWalletAddress, setConfirmWalletAddress] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USDT');

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);

  const loadExisting = async () => {
    if (!user) return;
    const { data } = await supabase.from('withdrawal_details').select('*').eq('user_id', user.id).maybeSingle();
    setExisting(data);
  };

  useEffect(() => { loadExisting(); }, [user]);

  useEffect(() => {
    if (step === 2 && timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [step, timer]);

  if (!user || !profile) return null;

  const cooldownActive = existing?.updated_at
    ? Date.now() - new Date(existing.updated_at).getTime() < 24 * 60 * 60 * 1000 && !updating
    : false;

  const validateStep1 = () => {
    if (method === 'bank') {
      if (!bankName) return 'Select a bank.';
      if (!/^\d{10}$/.test(accountNumber)) return 'Account number must be 10 digits.';
      if (accountNumber !== confirmAccountNumber) return 'Account numbers do not match.';
      if (!accountName) return 'Enter account name.';
    } else {
      if (!walletAddress || walletAddress.length < 20) return 'Enter a valid wallet address.';
      if (walletAddress !== confirmWalletAddress) return 'Wallet addresses do not match.';
    }
    return null;
  };

  const handleProceedToVerify = async () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    const c = await createVerificationCode(user.id, 'withdrawal_details');
    setTimer(60);
    toast({ title: '📧 Verification Code Sent', description: `Code sent to ${profile.email}: ${c}` });
    setStep(2);
  };

  const handleVerify = async () => {
    const ok = await verifyCode(user.id, code, 'withdrawal_details');
    if (!ok) { setError('Invalid or expired verification code.'); return; }

    const payload = method === 'bank'
      ? { user_id: user.id, method: 'bank' as const, bank_name: bankName, account_number: accountNumber, account_name: accountName, sort_code: sortCode || null }
      : { user_id: user.id, method: 'crypto' as const, network, wallet_address: walletAddress, preferred_currency: preferredCurrency };

    if (existing) {
      await supabase.from('withdrawal_details').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('withdrawal_details').insert(payload);
    }
    await loadExisting();
    setUpdating(false);
    setStep(3);
    toast({ title: '✅ Withdrawal Details Saved' });
  };

  const handleResend = async () => {
    const c = await createVerificationCode(user.id, 'withdrawal_details');
    setTimer(60);
    toast({ title: '📧 Code Resent', description: `New code: ${c}` });
  };

  // Already registered view
  if (existing && !updating && step !== 3) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Withdrawal Details</h1>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Registered Payment Method</h3>
              <p className="text-xs text-muted-foreground">Updated on {new Date(existing.updated_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
            {existing.method === 'bank' ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="text-foreground">Bank Transfer</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="text-foreground">{existing.bank_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="text-foreground">****{existing.account_number?.slice(-4)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="text-foreground">{existing.account_name}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="text-foreground">Cryptocurrency</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="text-foreground">{existing.network}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-foreground">{existing.wallet_address?.slice(0, 8)}...{existing.wallet_address?.slice(-6)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span className="text-foreground">{existing.preferred_currency}</span></div>
              </>
            )}
          </div>

          {cooldownActive ? (
            <div className="mt-4 flex items-center gap-2 text-warning text-sm">
              <Shield className="w-4 h-4" /> Cooldown: can update again 24h after last change.
            </div>
          ) : (
            <button onClick={() => { setUpdating(true); setStep(1); }} className="btn-secondary mt-4 w-full sm:w-auto">
              Update Details
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
        {existing ? 'Update Withdrawal Details' : 'Register Withdrawal Details'}
      </h1>

      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'gradient-gold text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s}</div>
            {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="glass-card p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">Withdrawal Method</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMethod('bank')} className={`p-4 rounded-lg border text-left transition-all ${method === 'bank' ? 'border-primary bg-primary/10' : 'border-border hover:border-border/60'}`}>
                <CreditCard className={`w-6 h-6 mb-2 ${method === 'bank' ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-foreground text-sm">Bank Transfer</p>
                <p className="text-xs text-muted-foreground">Fiat currency</p>
              </button>
              <button onClick={() => setMethod('crypto')} className={`p-4 rounded-lg border text-left transition-all ${method === 'crypto' ? 'border-primary bg-primary/10' : 'border-border hover:border-border/60'}`}>
                <Bitcoin className={`w-6 h-6 mb-2 ${method === 'crypto' ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-foreground text-sm">Cryptocurrency</p>
                <p className="text-xs text-muted-foreground">USDT / BTC / ETH</p>
              </button>
            </div>
          </div>

          {method === 'bank' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Bank Name</label>
                <select value={bankName} onChange={e => setBankName(e.target.value)} className="input-dark w-full">
                  <option value="">Select bank</option>
                  {banks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Account Number</label>
                <input type="text" maxLength={10} value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))} placeholder="10-digit account number" className="input-dark w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Account Number</label>
                <input type="text" maxLength={10} value={confirmAccountNumber} onChange={e => setConfirmAccountNumber(e.target.value.replace(/\D/g, ''))} placeholder="Re-enter account number" className="input-dark w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Account Name</label>
                <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Name on account" className="input-dark w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Sort Code / Routing Number</label>
                <input type="text" value={sortCode} onChange={e => setSortCode(e.target.value)} placeholder="Optional" className="input-dark w-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Network</label>
                <div className="flex gap-2 flex-wrap">
                  {networks.map(n => (
                    <button key={n} onClick={() => setNetwork(n)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${network === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Wallet Address</label>
                <input type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="Enter wallet address" className="input-dark w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Wallet Address</label>
                <input type="text" value={confirmWalletAddress} onChange={e => setConfirmWalletAddress(e.target.value)} placeholder="Re-enter wallet address" className="input-dark w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Preferred Currency</label>
                <div className="flex gap-2 flex-wrap">
                  {currencies.map(c => (
                    <button key={c} onClick={() => setPreferredCurrency(c)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${preferredCurrency === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{c}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button onClick={handleProceedToVerify} className="btn-primary w-full flex items-center justify-center gap-2">
            Register Withdrawal Details <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-lg font-display font-semibold text-foreground">Email Verification</h3>
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to your email.</p>
          <input type="text" maxLength={6} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} placeholder="000000" className="input-dark w-full text-center text-2xl tracking-widest" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{timer > 0 ? `Resend in ${timer}s` : ''}</span>
            {timer === 0 && <button onClick={handleResend} className="text-primary hover:underline">Resend Code</button>}
          </div>
          <button onClick={handleVerify} disabled={code.length !== 6} className="btn-primary w-full">Verify & Save</button>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-xl font-display font-bold text-foreground">Details Registered!</h3>
          <p className="text-muted-foreground text-sm">Your withdrawal details have been saved.</p>
          <button onClick={() => { setStep(1); setUpdating(false); }} className="btn-primary w-full">Done</button>
        </div>
      )}
    </div>
  );
}
