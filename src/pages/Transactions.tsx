import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { History, Search, Download, ArrowUpRight, ArrowDownToLine, TrendingUp, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const typeIcons: Record<string, React.ElementType> = {
  Deposit: ArrowUpRight,
  Withdrawal: ArrowDownToLine,
  Investment: TrendingUp,
  'ROI Payout': DollarSign,
};

export default function Transactions() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => setTransactions(data || []));
  }, [user]);

  if (!user) return null;

  const filters = ['All', 'Deposit', 'Withdrawal', 'Investment', 'ROI Payout'];

  const filtered = transactions
    .filter(t => filter === 'All' || t.type === filter)
    .filter(t => !search || (t.description || '').toLowerCase().includes(search.toLowerCase()) || t.reference.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const header = 'Date,Type,Amount,Status,Reference,Description\n';
    const rows = filtered.map(t =>
      `${new Date(t.created_at).toLocaleDateString()},${t.type},${t.amount},${t.status},${t.reference},"${t.description || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trevo-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Transactions</h1>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm w-fit">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === f ? 'gradient-gold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input-dark w-full pl-9 py-2" />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No transactions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground bg-muted/30">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Description</th>
                  <th className="text-right py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4 hidden sm:table-cell">Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const Icon = typeIcons[tx.type] || History;
                  const isCredit = tx.type === 'Deposit' || tx.type === 'ROI Payout';
                  const badgeClass = tx.status === 'Completed' ? 'badge-completed'
                    : tx.status === 'Pending' ? 'badge-pending'
                    : 'stat-badge bg-destructive/20 text-destructive';
                  return (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">{tx.type}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">{tx.description}</td>
                      <td className={`py-3 px-4 text-right font-medium ${isCredit ? 'text-success' : 'text-destructive'}`}>
                        {isCredit ? '+' : '-'}${Number(tx.amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4"><span className={badgeClass}>{tx.status}</span></td>
                      <td className="py-3 px-4 text-muted-foreground text-xs hidden sm:table-cell">{tx.reference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
