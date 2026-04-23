import { supabase } from '@/integrations/supabase/client';

export const generateRef = () => 'TRV-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

export async function getDailyTotal(userId: string, type: 'Deposit' | 'Withdrawal'): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', type)
    .neq('status', 'Failed')
    .neq('status', 'Rejected')
    .gte('created_at', start.toISOString());
  return (data || []).reduce((s, t) => s + Number(t.amount), 0);
}

// Generate 6-digit code, store in verification_codes table
export async function createVerificationCode(userId: string, purpose: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase.from('verification_codes').insert({ user_id: userId, code, purpose, expires_at: expires });
  return code;
}

export async function verifyCode(userId: string, code: string, purpose: string): Promise<boolean> {
  const { data } = await supabase
    .from('verification_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('code', code)
    .eq('purpose', purpose)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  await supabase.from('verification_codes').update({ used: true }).eq('id', data.id);
  return true;
}

// Legacy Portal Data Upload Functions
export interface LegacyTransaction {
  id: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'ROI Payout';
  amount: number;
  fee?: number;
  status: 'Completed' | 'Pending' | 'Failed' | 'Rejected';
  reference: string;
  description?: string;
  created_at: string;
}

export async function verifyLegacyUserCode(portalUsername: string, code: string): Promise<{ valid: boolean; balance?: number; error?: string }> {
  const { data, error } = await supabase
    .from('legacy_user_codes')
    .select('account_balance')
    .eq('portal_username', portalUsername)
    .eq('code', code)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, error: 'Invalid user code or portal username' };
  }

  return { valid: true, balance: Number(data.account_balance) };
}

export async function getLegacyTransactions(portalUsername: string): Promise<LegacyTransaction[]> {
  // Generate 4 months of transaction history
  const transactions: LegacyTransaction[] = [];
  const now = new Date();
  const fourMonthsAgo = new Date(now.getTime() - 4 * 30 * 24 * 60 * 60 * 1000);

  const transactionTypes: LegacyTransaction['type'][] = ['Deposit', 'Withdrawal', 'Investment', 'ROI Payout'];
  const statuses: LegacyTransaction['status'][] = ['Completed', 'Pending', 'Failed'];

  for (let i = 0; i < 45; i++) {
    const randomDate = new Date(fourMonthsAgo.getTime() + Math.random() * (now.getTime() - fourMonthsAgo.getTime()));
    const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
    
    let amount = 0;
    if (type === 'Deposit') amount = Math.floor(Math.random() * 50000) + 1000;
    else if (type === 'Withdrawal') amount = Math.floor(Math.random() * 10000) + 500;
    else if (type === 'Investment') amount = Math.floor(Math.random() * 100000) + 5000;
    else amount = Math.floor(Math.random() * 5000) + 100; // ROI Payout

    transactions.push({
      id: `LEGACY-${portalUsername}-${i}`,
      type,
      amount,
      fee: type === 'Withdrawal' ? Math.floor(amount * 0.02) : 0,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      reference: `LGC-${Date.now()}-${i}`,
      description: `Legacy transaction ${i + 1} from old portal`,
      created_at: randomDate.toISOString(),
    });
  }

  return transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function uploadLegacyData(
  userId: string,
  portalUsername: string,
  balance: number,
  transactions: LegacyTransaction[]
): Promise<{ success: boolean; error?: string; transactionCount?: number }> {
  try {
    // Start upload record
    const { data: uploadRecord } = await supabase
      .from('legacy_data_uploads')
      .insert({
        user_id: userId,
        portal_username: portalUsername,
        status: 'Processing',
      })
      .select()
      .single();

    // Update wallet balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    const newBalance = (profile?.wallet_balance || 0) + balance;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        wallet_balance: newBalance,
        portal_username: portalUsername,
        legacy_data_uploaded: true,
        legacy_upload_date: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      await supabase
        .from('legacy_data_uploads')
        .update({ status: 'Failed', error_message: profileError.message })
        .eq('id', uploadRecord?.id);
      return { success: false, error: profileError.message };
    }

    // Insert transactions
    const transactionsToInsert = transactions.map(tx => ({
      user_id: userId,
      type: tx.type,
      amount: tx.amount,
      fee: tx.fee || 0,
      status: tx.status,
      reference: tx.reference,
      description: tx.description || `Migrated from legacy portal`,
      created_at: tx.created_at,
    }));

    const { error: txError } = await supabase
      .from('transactions')
      .insert(transactionsToInsert);

    if (txError) {
      await supabase
        .from('legacy_data_uploads')
        .update({ status: 'Failed', error_message: txError.message })
        .eq('id', uploadRecord?.id);
      return { success: false, error: txError.message };
    }

    // Mark upload as completed
    await supabase
      .from('legacy_data_uploads')
      .update({
        status: 'Completed',
        completed_at: new Date().toISOString(),
        uploaded_balance: balance,
        transaction_count: transactions.length,
      })
      .eq('id', uploadRecord?.id);

    return { success: true, transactionCount: transactions.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
