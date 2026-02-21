'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '../components/modal';
import { changePassword } from './actions';
import { setup2FA, enable2FA, disable2FA } from './2fa-actions';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldAlert, KeyRound } from 'lucide-react';
import Image from 'next/image';

interface ProfileClientProps {
  admin: {
    name: string;
    email: string;
    profileImage?: string | null;
    twoFactorEnabled: boolean;
  };
}

export default function ProfileClient({ admin }: ProfileClientProps) {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);

  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isSetupPending, startSetupTransition] = useTransition();
  const [isEnablePending, startEnableTransition] = useTransition();
  const [isDisablePending, startDisableTransition] = useTransition();

  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const handlePasswordSubmit = async (formData: FormData) => {
    startPasswordTransition(async () => {
      const result = await changePassword({}, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.message) {
        toast.success(result.message);
        setIsPasswordModalOpen(false);
      }
    });
  };

  const handleSetup2FA = () => {
    startSetupTransition(async () => {
      const result = await setup2FA();
      if (result.error) {
        toast.error(result.error);
      } else if (result.secret && result.qrCode) {
        setSetupData({ secret: result.secret, qrCode: result.qrCode });
        setIs2FAModalOpen(true);
      }
    });
  };

  const handleEnable2FA = () => {
    if (!setupData || !verificationCode) return;

    startEnableTransition(async () => {
      const result = await enable2FA(setupData.secret, verificationCode);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('2FA enabled successfully');
        setIs2FAModalOpen(false);
        setSetupData(null);
        setVerificationCode('');
      }
    });
  };

  const handleDisable2FA = () => {
    if (!confirm('Are you sure you want to disable 2FA? This will decrease your account security.')) return;

    startDisableTransition(async () => {
      const result = await disable2FA();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('2FA disabled successfully');
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground">Manage your account settings.</p>
      </div>

      {/* Personal Information */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Full Name</label>
              <div className="mt-1 text-base font-medium text-foreground">{admin.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Email Address</label>
              <div className="mt-1 text-base font-medium text-foreground">{admin.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
        </div>
        <div className="p-6 space-y-6 divide-y divide-border">
          {/* Password Section */}
          <div className="flex items-center justify-between pb-6">
            <div>
              <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                Password
              </h3>
              <p className="text-sm text-muted-foreground">Update your password to keep your account secure.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsPasswordModalOpen(true)}
              className="border-border text-foreground hover:bg-muted"
            >
              Change Password
            </Button>
          </div>

          {/* 2FA Section */}
          <div className="flex items-center justify-between pt-6">
            <div>
              <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                {admin.twoFactorEnabled ? (
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                Two-Factor Authentication (2FA)
              </h3>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account using an authenticator app.
              </p>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    admin.twoFactorEnabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}
                >
                  {admin.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            {admin.twoFactorEnabled ? (
              <Button
                variant="outline"
                onClick={handleDisable2FA}
                disabled={isDisablePending}
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20"
              >
                {isDisablePending ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            ) : (
              <Button
                onClick={handleSetup2FA}
                disabled={isSetupPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSetupPending ? 'Setting up...' : 'Enable 2FA'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Change Password">
        <form action={handlePasswordSubmit} className="space-y-4 py-4 px-6">
          <div className="space-y-2">
            <label htmlFor="currentPassword" className="block text-sm font-medium text-foreground">
              Current Password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPasswordModalOpen(false)}
              className="border-border text-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPasswordPending}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {isPasswordPending ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2FA Setup Modal */}
      <Modal
        isOpen={is2FAModalOpen}
        onClose={() => {
          setIs2FAModalOpen(false);
          setSetupData(null);
          setVerificationCode('');
        }}
        title="Setup Two-Factor Authentication"
      >
        <div className="py-4 px-6 space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              1. Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
            </p>
            {setupData?.qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg border border-border">
                <Image
                  src={setupData.qrCode}
                  alt="2FA QR Code"
                  width={192}
                  height={192}
                  unoptimized // data: urls don't need optimization
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-foreground">2. Or enter this secret key manually:</p>
            <div className="bg-muted p-3 rounded-lg border border-border flex items-center justify-between">
              <code className="text-sm font-mono font-bold text-foreground break-all">{setupData?.secret}</code>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="verificationCode" className="block text-sm font-medium text-foreground">
                3. Enter the 6-digit code from your app:
              </label>
              <input
                id="verificationCode"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center text-2xl tracking-[0.5em] font-bold"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIs2FAModalOpen(false)}
                className="border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEnable2FA}
                disabled={isEnablePending || verificationCode.length !== 6}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isEnablePending ? 'Verifying...' : 'Verify and Enable'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
