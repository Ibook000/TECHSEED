import React, { useState } from 'react';
import { X, Lock, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminUser } from '../../types.js';
import { saveAdminToken } from '../../lib/auth.js';
import {
  getAdminPasswordPolicyError,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
} from '../../lib/passwordPolicy.js';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminUser: AdminUser | null;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  adminUser,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen || !adminUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const passwordPolicyError = getAdminPasswordPolicyError(newPassword);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致，请重新核对');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUser.username,
          oldPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) saveAdminToken(data.token);
        setSuccess('后台独立密码已成功修改，其他登录会话已失效。请妥善保管新密码。');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          onClose();
          setSuccess(null);
        }, 1800);
      } else {
        setError(data.error || '密码修改失败，请检查原密码是否正确');
      }
    } catch (err: any) {
      setError(err.message || '网络通讯异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-6 shadow-2xl text-zinc-800">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 rounded-[6px] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center border border-amber-200 bg-amber-50 text-amber-700 rounded-[10px] font-mono">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wider">
              修改后台独立访问密码
            </h3>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              当前操作账号：<span className="text-amber-800 font-bold">{adminUser.name} ({adminUser.username})</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 border border-rose-200 bg-rose-50 rounded-[8px] p-3 text-xs font-mono text-rose-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 border border-amber-300 bg-amber-50 rounded-[8px] p-3 text-xs font-mono text-amber-900 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5 font-mono text-xs">
          <div>
            <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
              当前原密码 (CURRENT PASSWORD)
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="password"
                required
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="请输入当前生效的原密码"
                className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
              设置新密码 (NEW PASSWORD, 至少6位)
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="password"
                required
                minLength={MIN_ADMIN_PASSWORD_LENGTH}
                maxLength={MAX_ADMIN_PASSWORD_LENGTH}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="请输入 12–128 个字符的新密码"
                className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
              确认新密码 (CONFIRM NEW PASSWORD)
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码以确认"
                className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[8px] border border-zinc-200 py-2.5 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-xs"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 py-2.5 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading ? '正在保存...' : '确认修改密码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
