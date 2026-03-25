// localStorage helpers for the investment portal

export interface User {
  id: string;
  fullName: string;
  email: string;
  password: string;
  createdAt: string;
  walletBalance: number;
  investments: Investment[];
  transactions: Transaction[];
  withdrawalDetails: WithdrawalDetails | null;
  withdrawalDetailsUpdatedAt: string | null;
  settings: UserSettings;
  loginAttempts: number;
  lockedUntil: string | null;
}

export interface Investment {
  id: string;
  planName: string;
  amount: number;
  roiRate: number;
  startDate: string;
  nextPayoutDate: string;
  status: 'Active' | 'Matured';
  weeklyReturn: number;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'ROI Payout';
  amount: number;
  status: 'Completed' | 'Pending' | 'Failed';
  reference: string;
  description: string;
}

export interface WithdrawalDetails {
  method: 'bank' | 'crypto';
  // Bank fields
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  sortCode?: string;
  // Crypto fields
  network?: string;
  walletAddress?: string;
  preferredCurrency?: string;
  registeredAt: string;
}

export interface UserSettings {
  emailAlerts: boolean;
  depositAlerts: boolean;
  withdrawalAlerts: boolean;
  payoutAlerts: boolean;
  twoFactorEnabled: boolean;
}

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  rememberMe: boolean;
  lastActivity: string;
}

const USERS_KEY = 'trevo_users';
const SESSION_KEY = 'trevo_session';
const VERIFICATION_KEY = 'trevo_verification';

// Users
export function getUsers(): User[] {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getUserByEmail(email: string): User | undefined {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function createUser(fullName: string, email: string, password: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    fullName,
    email: email.toLowerCase(),
    password,
    createdAt: new Date().toISOString(),
    walletBalance: 0,
    investments: [],
    transactions: [],
    withdrawalDetails: null,
    withdrawalDetailsUpdatedAt: null,
    settings: {
      emailAlerts: true,
      depositAlerts: true,
      withdrawalAlerts: true,
      payoutAlerts: true,
      twoFactorEnabled: false,
    },
    loginAttempts: 0,
    lockedUntil: null,
  };
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  return user;
}

export function updateUser(userId: string, updates: Partial<User>) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
    return users[idx];
  }
  return null;
}

export function getUserById(userId: string): User | undefined {
  return getUsers().find(u => u.id === userId);
}

// Session
export function getSession(): Session | null {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;
  const session: Session = JSON.parse(data);
  // Check 30 min timeout
  const lastActivity = new Date(session.lastActivity).getTime();
  const now = Date.now();
  if (!session.rememberMe && now - lastActivity > 30 * 60 * 1000) {
    clearSession();
    return null;
  }
  return session;
}

export function setSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function updateSessionActivity() {
  const session = getSession();
  if (session) {
    session.lastActivity = new Date().toISOString();
    setSession(session);
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Verification codes
export function storeVerificationCode(email: string, code: string) {
  const data = { email, code, createdAt: new Date().toISOString() };
  localStorage.setItem(VERIFICATION_KEY, JSON.stringify(data));
}

export function getVerificationCode(): { email: string; code: string; createdAt: string } | null {
  const data = localStorage.getItem(VERIFICATION_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearVerificationCode() {
  localStorage.removeItem(VERIFICATION_KEY);
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Transaction helpers
export function addTransaction(userId: string, tx: Omit<Transaction, 'id' | 'date' | 'reference'>) {
  const user = getUserById(userId);
  if (!user) return;
  const transaction: Transaction = {
    ...tx,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    reference: 'TRV-' + Date.now().toString(36).toUpperCase(),
  };
  user.transactions.unshift(transaction);
  updateUser(userId, { transactions: user.transactions });
  return transaction;
}

// Daily limits
export function getDailyTotal(userId: string, type: 'Deposit' | 'Withdrawal'): number {
  const user = getUserById(userId);
  if (!user) return 0;
  const today = new Date().toDateString();
  return user.transactions
    .filter(t => t.type === type && new Date(t.date).toDateString() === today && t.status !== 'Failed')
    .reduce((sum, t) => sum + t.amount, 0);
}
