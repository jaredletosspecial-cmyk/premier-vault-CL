import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowDownToLine, TrendingUp, PieChart, Plus, Minus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DepositModal from '@/components/DepositModal';
import WithdrawalModal from '@/components/WithdrawalModal';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [investments, setInvestments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [hasWithdrawalDetails, setHasWithdrawalDetails] = useState(false);

  const loadData = async () => {
    if (!user) return;
    const [inv, tx, wd] = await Promise.all([
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', user.id),
      supabase.from('withdrawal_details').select('id').eq('user_id', user.id).maybeSingle(),
    ]);
    setInvestments(inv.data || []);
    setTransactions(tx.data || []);
    setHasWithdrawalDetails(!!wd.data);
  };

  useEffect(() => { loadData(); }, [user]);

  if (!profile) return null;

  const activeInvestments = investments.filter(i => i.status === 'Active');
  const totalReturns = investments.reduce((s, i) => s + Number(i.weekly_return), 0);
  const totalWithdrawn = transactions.filter(t => t.type === 'Withdrawal' && t.status !== 'Failed' && t.status !== 'Rejected').reduce((s, t) => s + Number(t.amount), 0);

  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const deposited = transactions.filter(t => t.type === 'Deposit' && t.status === 'Completed').reduce((s, t) => s + Number(t.amount), 0);
  const chartData = months.map((m, i) => ({ month: m, value: Math.round(deposited * (0.3 + i * 0.14)) }));

  const handleWithdraw = async () => {
    if (!hasWithdrawalDetails) {
      navigate('/withdrawal-details');
      return;
    }
    setWithdrawOpen(true);
  };

  const onModalClose = async () => {
    setDepositOpen(false);
    setWithdrawOpen(false);
    await refreshProfile();
    await loadData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Dashboard</h1>

      <div className="glass-card p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5 gradient-gold -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Wallet className="w-5 h-5" />
            <span className="text-sm">Total Balance</span>
          </div>
          <p className="text-4xl lg:text-5xl font-display font-bold gradient-gold-text mb-6">
            ${Number(profile.wallet_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setDepositOpen(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Deposit
            </button>
            <button onClick={handleWithdraw} className="btn-secondary flex items-center gap-2">
              <Minus className="w-4 h-4" /> Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Weekly Returns</span>
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">${totalReturns.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Active Investments</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <PieChart className="w-4 h-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{activeInvestments.length}</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total Withdrawn</span>
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <ArrowDownToLine className="w-4 h-4 text-destructive" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">${totalWithdrawn.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-display font-semibold text-foreground mb-4">Portfolio Growth</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(40, 96%, 52%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(40, 96%, 52%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
              <XAxis dataKey="month" stroke="hsl(220, 15%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(220, 15%, 55%)" fontSize={12} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(222, 40%, 10%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', color: 'hsl(40, 20%, 92%)' }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Portfolio Value']}
              />
              <Area type="monotone" dataKey="value" stroke="hsl(40, 96%, 52%)" fill="url(#goldGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {activeInvestments.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-display font-semibold text-foreground mb-4">Active Investments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2">Plan</th>
                  <th className="text-left py-3 px-2">Amount</th>
                  <th className="text-left py-3 px-2">Weekly ROI</th>
                  <th className="text-left py-3 px-2 hidden sm:table-cell">Next Payout</th>
                  <th className="text-left py-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeInvestments.map(inv => (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-3 px-2 font-medium text-foreground">{inv.plan_name}</td>
                    <td className="py-3 px-2 text-foreground">${Number(inv.amount).toLocaleString()}</td>
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

      <DepositModal open={depositOpen} onClose={onModalClose} />
      <WithdrawalModal open={withdrawOpen} onClose={onModalClose} />
    </div>
  );
}
