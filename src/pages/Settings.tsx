import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User, Shield, Bell, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!user || !profile) return null;

  const handleProfileSave = async () => {
    if (!fullName.trim()) { toast({ title: 'Error', description: 'Name cannot be empty.', variant: 'destructive' }); return; }
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await refreshProfile();
    toast({ title: '✅ Profile Updated' });
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) { toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' }); return; }
    if (newPassword !== confirmPassword) { toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' }); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setNewPassword(''); setConfirmPassword('');
    toast({ title: '✅ Password Updated' });
  };

  const handleToggleSetting = async (key: 'deposit_alerts' | 'withdrawal_alerts' | 'payout_alerts' | 'email_alerts' | 'two_factor_enabled') => {
    const newVal = !profile[key];
    await supabase.from('profiles').update({ [key]: newVal } as any).eq('id', user.id);
    await refreshProfile();
    toast({ title: 'Setting Updated' });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Settings</h1>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <User className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">Profile</h3>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="input-dark w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
          <input type="email" value={profile.email} disabled className="input-dark w-full opacity-50 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
        </div>
        <button onClick={handleProfileSave} className="btn-primary flex items-center gap-2 text-sm">
          <Save className="w-4 h-4" /> Save Changes
        </button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">Security</h3>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-dark w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-dark w-full" />
        </div>
        <button onClick={handlePasswordChange} className="btn-primary text-sm">Change Password</button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">Notifications</h3>
        </div>
        {([
          ['deposit_alerts', 'Deposit Alerts', 'Get notified for deposits'],
          ['withdrawal_alerts', 'Withdrawal Alerts', 'Get notified for withdrawals'],
          ['payout_alerts', 'Payout Alerts', 'Get notified for ROI payouts'],
        ] as const).map(([key, title, desc]) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <button onClick={() => handleToggleSetting(key)} className={`w-12 h-6 rounded-full transition-colors ${(profile as any)[key] ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`w-5 h-5 rounded-full bg-foreground transition-transform ${(profile as any)[key] ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
