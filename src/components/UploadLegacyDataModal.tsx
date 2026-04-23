import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle, Loader, Upload } from 'lucide-react';
import { verifyLegacyUserCode, getLegacyTransactions, uploadLegacyData } from '@/lib/api';

interface UploadLegacyDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  onUploadSuccess: () => void;
}

export default function UploadLegacyDataModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  onUploadSuccess,
}: UploadLegacyDataModalProps) {
  const [step, setStep] = useState<'input' | 'verification' | 'processing' | 'success'>('input');
  const [portalUsername, setPortalUsername] = useState('');
  const [userCode, setUserCode] = useState('');
  const [verifiedBalance, setVerifiedBalance] = useState<number | null>(null);
  const [transactionCount, setTransactionCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!portalUsername.trim() || !userCode.trim()) {
      setError('Please enter both portal username and user code');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const result = await verifyLegacyUserCode(portalUsername, userCode);

      if (!result.valid) {
        setError(result.error || 'Invalid credentials');
        setIsProcessing(false);
        return;
      }

      setVerifiedBalance(result.balance || 0);
      
      // Get transaction count
      const transactions = await getLegacyTransactions(portalUsername);
      setTransactionCount(transactions.length);

      setStep('verification');
      setIsProcessing(false);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
      setIsProcessing(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (verifiedBalance === null) return;

    setIsProcessing(true);
    setError('');
    setStep('processing');

    try {
      const transactions = await getLegacyTransactions(portalUsername);
      const result = await uploadLegacyData(userId, portalUsername, verifiedBalance, transactions);

      if (!result.success) {
        setError(result.error || 'Upload failed');
        setStep('verification');
        setIsProcessing(false);
        return;
      }

      setTransactionCount(result.transactionCount || 0);
      setStep('success');
      setIsProcessing(false);

      setTimeout(() => {
        toast({
          title: '✅ Legacy Data Uploaded Successfully',
          description: `€${verifiedBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} added to your account with ${result.transactionCount} transactions`,
        });
        onUploadSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setStep('verification');
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep('input');
    setPortalUsername('');
    setUserCode('');
    setVerifiedBalance(null);
    setError('');
    setIsProcessing(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Upload Legacy Portal Data
          </DialogTitle>
          <DialogDescription>
            Restore your account data from the old Premier Portal system
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-900 dark:text-blue-200">
                We've detected your account: <strong>{userEmail}</strong>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Portal Username
                </label>
                <Input
                  placeholder="e.g., User00571J1"
                  value={portalUsername}
                  onChange={(e) => setPortalUsername(e.target.value.toUpperCase())}
                  disabled={isProcessing}
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  User Code
                </label>
                <Input
                  type="password"
                  placeholder="Enter your legacy user code"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                  disabled={isProcessing}
                  className="input-dark"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex gap-2 text-sm text-red-900 dark:text-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleVerify}
                disabled={isProcessing || !portalUsername || !userCode}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Credentials'
                )}
              </Button>
            </div>
          )}

          {step === 'verification' && verifiedBalance !== null && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-900 dark:text-green-200 font-semibold">
                  <CheckCircle className="w-5 h-5" />
                  Verified Successfully
                </div>
                <div className="text-sm text-green-800 dark:text-green-300">
                  <p className="font-medium">Portal Username:</p>
                  <p className="text-lg font-semibold">{portalUsername}</p>
                </div>
                <div className="text-sm text-green-800 dark:text-green-300">
                  <p className="font-medium">Account Balance to Transfer:</p>
                  <p className="text-2xl font-bold">€{verifiedBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-sm text-green-800 dark:text-green-300">
                  <p className="font-medium">Transactions to Import:</p>
                  <p className="text-lg">{transactionCount} transactions</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                By confirming, your legacy account data will be merged with your new Premier Vault account.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('input');
                    setError('');
                  }}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmUpload}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Confirm Upload'
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="space-y-4 py-8 text-center">
              <Loader className="w-12 h-12 animate-spin text-primary mx-auto" />
              <div>
                <p className="font-semibold text-foreground">Processing Your Data</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Migrating {transactionCount} transactions...
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-4 py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <p className="font-semibold text-foreground">Upload Complete!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your legacy data has been successfully imported
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
