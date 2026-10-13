import React, { useState } from 'react';
import { X, Shield, Lock, User } from 'lucide-react';
import { AdminUser } from '../../types.js';
import { useModalAccessibility } from '../../lib/useModalAccessibility.js';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AdminUser) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入账号与访问密码');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess(data.user);
        onClose();
      } else {
        setError(data.error || '登录失败，请检查账号密码');
      }
    } catch (err: any) {
      setError(err.message || '网络连接异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-modal-title"
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-6 shadow-2xl text-zinc-800"
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-[6px] p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 font-mono">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 id="admin-login-modal-title" className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wider">学生会技术部管理员登录</h3>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">仅供学生会技术部招新工作组成员登录管理控制台</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-[8px] border border-rose-200 bg-rose-50 p-3 text-xs font-mono text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-5 space-y-3.5 font-mono text-xs">
          <div>
            <label htmlFor="admin-login-modal-username" className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">账号 ACCOUNT</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                id="admin-login-modal-username"
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-login-modal-password" className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">密码 PASSWORD</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                id="admin-login-modal-password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入后台管理密码"
                className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 py-2.5 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading ? 'VERIFYING...' : '进入技术部工作台'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
