import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Zap, Crown, Shield } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRef } from '@/lib/api';

const planIcons: Record<string, any> = {
  'Starter EXCO': Zap,
  'Premier Elite': Crown,
  'Executive Trust': Shield,
};
const planColors: Record<string, string> = {
  'Starter EXCO': 'primary',
  'Premier Elite': 'warning',
  'Executive Trust': 'success',
};

export default function Investments() {
  const { user, profile, refreshProfile } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;
    const [p, i] = await Promise.all([
      supabase.from('investment_plans').select('*').eq('active', true).order('display_order'),
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setPlans(p.data || []);
    setInvestments(i.data || []);
  };

  useEffect(() => { loadData(); }, [user]);

  if (!profile || !user) return null;

  const handleInvest = async (plan: any) => {
    const amount = parseFloat(amounts[plan.id] || '0');
    const errs: Record<string, string> = {};
    const min = Number(plan.min_amount), max = Number(plan.max_amount), roi = Number(plan.weekly_roi_rate);

    if (amount < min) errs[plan.id] = `Minimum investment is $${min.toLocaleString()}`;
    else if (amount > max) errs[plan.id] = `Maximum investment is $${max.toLocaleString()}`;
    else if (amount > Number(profile.wallet_balance)) errs[plan.id] = 'Insufficient wallet balance.';

    if (errs[plan.id]) { setErrors(errs); return; }

    setSubmitting(plan.id);
    const weeklyReturn = amount * roi / 100;
    const nextPayout = new Date();
    nextPayout.setDate(nextPayout.getDate() + 7);

    // Insert investment + transaction + update balance
    const { error: invErr } = await supabase.from('investments').insert({
      user_id: user.id,
      plan_id: plan.id,
      plan_name: plan.name,
      amount,
      weekly_roi_rate: roi,
      weekly_return: weeklyReturn,
      next_payout_date: nextPayout.toISOString(),
      status: 'Active',
    });
    if (invErr) { toast({ title: 'Error', description: invErr.message, variant: 'destructive' }); setSubmitting(null); return; }

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'Investment', amount, status: 'Completed',
      reference: generateRef(), description: `Invested in ${plan.name}`,
    });

    await supabase.from('profiles').update({ wallet_balance: Number(profile.wallet_balance) - amount }).eq('id', user.id);

    await refreshProfile();
    await loadData();
    setAmounts({ ...amounts, [plan.id]: '' });
    setErrors({});
    setSubmitting(null);
    toast({ title: '🎉 Investment Successful', description: `$${amount.toLocaleString()} invested in ${plan.name}. Weekly return: $${weeklyReturn.toFixed(2)}` });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Investment Plans</h1>
        <p className="text-muted-foreground text-sm mt-1">Choose a plan that matches your investment goals</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => {
          const Icon = planIcons[plan.name] || Zap;
          const color = planColors[plan.name] || 'primary';
          return (
            <div key={plan.id} className="glass-card-hover p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg bg-${color}/10 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 text-${color}`} />
                </div>
                <h3 className="text-lg font-display font-bold text-foreground">{plan.name}</h3>
              </div>

              <div className="space-y-3 mb-6 flex-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Investment Range</span>
                  <span className="text-foreground font-medium">${Number(plan.min_amount).toLocaleString()} - ${Number(plan.max_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Weekly ROI</span>
                  <span className="text-success font-bold">{plan.weekly_roi_rate}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payout</span>
                  <span className="text-foreground">Every 7 days</span>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="number"
                  value={amounts[plan.id] || ''}
                  onChange={e => { setAmounts({ ...amounts, [plan.id]: e.target.value }); setErrors({}); }}
                  placeholder={`$${Number(plan.min_amount).toLocaleString()} - $${Number(plan.max_amount).toLocaleString()}`}
                  className="input-dark w-full"
                />
                {errors[plan.id] && <p className="text-xs text-destructive">{errors[plan.id]}</p>}
                <button onClick={() => handleInvest(plan)} disabled={submitting === plan.id} className="btn-primary w-full text-sm">
                  {submitting === plan.id ? 'Processing...' : 'Invest Now'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {investments.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-display font-semibold text-foreground mb-4">Your Investments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2">Plan</th>
                  <th className="text-left py-3 px-2">Amount</th>
                  <th className="text-left py-3 px-2">ROI Rate</th>
                  <th className="text-left py-3 px-2">Weekly Return</th>
                  <th className="text-left py-3 px-2 hidden sm:table-cell">Next Payout</th>
                  <th className="text-left py-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {investments.map(inv => (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-3 px-2 font-medium text-foreground">{inv.plan_name}</td>
                    <td className="py-3 px-2 text-foreground">${Number(inv.amount).toLocaleString()}</td>
                    <td className="py-3 px-2 text-primary">{inv.weekly_roi_rate}%</td>
                    <td className="py-3 px-2 text-success">${Number(inv.weekly_return).toFixed(2)}</td>
                    <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">{new Date(inv.next_payout_date).toLocaleDateString()}</td>
                    <td className="py-3 px-2"><span className="badge-active">{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
