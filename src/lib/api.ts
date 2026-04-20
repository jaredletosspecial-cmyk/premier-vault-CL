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
