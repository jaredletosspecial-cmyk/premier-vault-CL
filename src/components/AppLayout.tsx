import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, TrendingUp, CreditCard, History, Settings, LogOut, Menu, Bell, ShieldCheck,
} from 'lucide-react';

const baseNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/investments', icon: TrendingUp, label: 'Investment Plans' },
  { to: '/withdrawal-details', icon: CreditCard, label: 'Withdrawal Details' },
  { to: '/transactions', icon: History, label: 'Transactions' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = isAdmin
    ? [...baseNavItems, { to: '/admin', icon: ShieldCheck, label: 'Admin Panel' }]
    : baseNavItems;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex w-full" style={{ background: 'linear-gradient(180deg, hsl(222 47% 6%), hsl(222 47% 4%))' }}>
      {sidebarOpen && <div className="fixed inset-0 bg-background/80 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-gold flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground leading-tight">TREVO</h1>
              <p className="text-[8px] tracking-[0.2em] text-muted-foreground uppercase">Premier-Executive-EXCO</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <button onClick={handleLogout} className="sidebar-link w-full text-destructive hover:text-destructive hover:bg-destructive/10">
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-8 bg-card/30 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <p className="text-sm text-muted-foreground">Welcome back,</p>
              <p className="text-sm font-semibold text-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-sm font-bold gradient-gold-text">${Number(profile?.wallet_balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <button className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-bold text-sm">
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
