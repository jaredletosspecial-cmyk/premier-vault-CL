import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, Check, X, Clock, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRef } from '@/lib/api';

type Tab = 'deposits' | 'withdrawals';

export default function Admin() {
  const { user, isAdmin, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('deposits');
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending');

  const loadData = async () => {
    const [d, w, p] = await Promise.all([
      supabase.from('deposit_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, wallet_balance'),
    ]);
    setDeposits(d.data || []);
    setWithdrawals(w.data || []);
    const map: Record<string, any> = {};
    (p.data || []).forEach(prof => { map[prof.id] = prof; });
    setProfilesMap(map);
  };

  useEffect(() => { if (isAdmin) loadData(); }, [isAdmin]);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const approveDeposit = async (req: any) => {
    setBusy(req.id);
    const prof = profilesMap[req.user_id];
    if (!prof) { setBusy(null); return; }

    await supabase.from('profiles').update({ wallet_balance: Number(prof.wallet_balance) + Number(req.amount) }).eq('id', req.user_id);
    await supabase.from('deposit_requests').update({ status: 'Approved', reviewed_at: new Date().toISOString(), reviewed_by: user!.id }).eq('id', req.id);
    await supabase.from('transactions').update({ status: 'Completed', description: `Deposit via ${req.payment_method} (approved)` }).eq('related_request_id', req.id);

    toast({ title: '✅ Deposit Approved', description: `Credited $${Number(req.amount).toLocaleString()} to ${prof.full_name}` });
    await loadData();
    setBusy(null);
  };

  const rejectDeposit = async (req: any, note: string) => {
    setBusy(req.id);
    await supabase.from('deposit_requests').update({ status: 'Rejected', reviewed_at: new Date().toISOString(), reviewed_by: user!.id, admin_note: note }).eq('id', req.id);
    await supabase.from('transactions').update({ status: 'Rejected', description: `Deposit rejected: ${note}` }).eq('related_request_id', req.id);
    toast({ title: 'Deposit Rejected' });
    await loadData();
    setBusy(null);
  };

  const approveWithdrawal = async (req: any) => {
    setBusy(req.id);
    // Balance was already deducted at request time
    await supabase.from('withdrawal_requests').update({ status: 'Approved', reviewed_at: new Date().toISOString(), reviewed_by: user!.id }).eq('id', req.id);
    await supabase.from('transactions').update({ status: 'Completed', description: 'Withdrawal approved & processed' }).eq('related_request_id', req.id);
    toast({ title: '✅ Withdrawal Approved' });
    await loadData();
    setBusy(null);
  };

  const rejectWithdrawal = async (req: any, note: string) => {
    setBusy(req.id);
    const prof = profilesMap[req.user_id];
    // Refund the balance
    if (prof) {
      await supabase.from('profiles').update({ wallet_balance: Number(prof.wallet_balance) + Number(req.amount) }).eq('id', req.user_id);
    }
    await supabase.from('withdrawal_requests').update({ status: 'Rejected', reviewed_at: new Date().toISOString(), reviewed_by: user!.id, admin_note: note }).eq('id', req.id);
    await supabase.from('transactions').update({ status: 'Rejected', description: `Withdrawal rejected: ${note}` }).eq('related_request_id', req.id);
    toast({ title: 'Withdrawal Rejected', description: 'Funds refunded to user.' });
    await loadData();
    setBusy(null);
  };

  const filteredDeposits = deposits.filter(d => filter === 'All' || d.status === filter);
  const filteredWithdrawals = withdrawals.filter(w => filter === 'All' || w.status === filter);
  const pendingDepositsCount = deposits.filter(d => d.status === 'Pending').length;
  const pendingWithdrawalsCount = withdrawals.filter(w => w.status === 'Pending').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Admin Panel</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Pending Deposits</span>
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingDepositsCount}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Pending Withdrawals</span>
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingWithdrawalsCount}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Users</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{Object.keys(profilesMap).length}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('deposits')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'deposits' ? 'gradient-gold text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          Deposits ({pendingDepositsCount})
        </button>
        <button onClick={() => setTab('withdrawals')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'withdrawals' ? 'gradient-gold text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          Withdrawals ({pendingWithdrawalsCount})
        </button>
        <div className="flex-1" />
        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="input-dark py-2 text-sm">
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="All">All</option>
        </select>
      </div>

      {tab === 'deposits' && (
        <div className="glass-card overflow-hidden">
          {filteredDeposits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No {filter.toLowerCase()} deposits.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/30">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">User</th>
                    <th className="text-right py-3 px-4">Amount</th>
                    <th className="text-left py-3 px-4">Method</th>
                    <th className="text-left py-3 px-4">Reference</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeposits.map(d => {
                    const prof = profilesMap[d.user_id];
                    const badge = d.status === 'Pending' ? 'badge-pending' : d.status === 'Approved' ? 'badge-completed' : 'stat-badge bg-destructive/20 text-destructive';
                    return (
                      <tr key={d.id} className="border-b border-border/50">
                        <td className="py-3 px-4 text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-foreground">{prof?.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{prof?.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-success">${Number(d.amount).toLocaleString()}</td>
                        <td className="py-3 px-4 text-muted-foreground capitalize">{d.payment_method}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{d.payment_reference || '—'}</td>
                        <td className="py-3 px-4"><span className={badge}>{d.status}</span></td>
                        <td className="py-3 px-4 text-right">
                          {d.status === 'Pending' && (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => approveDeposit(d)} disabled={busy === d.id} className="px-3 py-1 rounded bg-success/20 text-success text-xs font-medium hover:bg-success/30">
                                <Check className="w-3 h-3 inline mr-1" />Approve
                              </button>
                              <button onClick={() => { const n = prompt('Reason for rejection:') || 'Rejected by admin'; rejectDeposit(d, n); }} disabled={busy === d.id} className="px-3 py-1 rounded bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30">
                                <X className="w-3 h-3 inline mr-1" />Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className="glass-card overflow-hidden">
          {filteredWithdrawals.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No {filter.toLowerCase()} withdrawals.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/30">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">User</th>
                    <th className="text-right py-3 px-4">Amount</th>
                    <th className="text-right py-3 px-4">Net</th>
                    <th className="text-left py-3 px-4">Destination</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWithdrawals.map(w => {
                    const prof = profilesMap[w.user_id];
                    const snap: any = w.withdrawal_details_snapshot;
                    const dest = snap?.method === 'bank'
                      ? `${snap.bank_name} ****${snap.account_number?.slice(-4)}`
                      : `${snap?.network} ${snap?.wallet_address?.slice(0, 8)}...`;
                    const badge = w.status === 'Pending' ? 'badge-pending' : w.status === 'Approved' ? 'badge-completed' : 'stat-badge bg-destructive/20 text-destructive';
                    return (
                      <tr key={w.id} className="border-b border-border/50">
                        <td className="py-3 px-4 text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4">
                          <p className="text-foreground">{prof?.full_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{prof?.email}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-destructive">${Number(w.amount).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-foreground">${Number(w.net_amount).toFixed(2)}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{dest}</td>
                        <td className="py-3 px-4"><span className={badge}>{w.status}</span></td>
                        <td className="py-3 px-4 text-right">
                          {w.status === 'Pending' && (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => approveWithdrawal(w)} disabled={busy === w.id} className="px-3 py-1 rounded bg-success/20 text-success text-xs font-medium hover:bg-success/30">
                                <Check className="w-3 h-3 inline mr-1" />Approve
                              </button>
                              <button onClick={() => { const n = prompt('Reason for rejection:') || 'Rejected by admin'; rejectWithdrawal(w, n); }} disabled={busy === w.id} className="px-3 py-1 rounded bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30">
                                <X className="w-3 h-3 inline mr-1" />Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
