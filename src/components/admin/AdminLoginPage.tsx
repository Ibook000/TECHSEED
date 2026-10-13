import React, { useState } from 'react';
import { Lock, User, ArrowLeft, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AdminUser } from '../../types.js';
import { PgyMascot } from '../PgyMascot.js';
import { ADMIN_USER_KEY, saveAdminToken, setSessionStoredValue } from '../../lib/auth.js';

interface AdminLoginPageProps {
  onLoginSuccess: (user: AdminUser) => void;
  onBackToStudent: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onBackToStudent,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入技术部管理账号与访问密码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Save session storage for browser session continuity
        setSessionStoredValue(ADMIN_USER_KEY, JSON.stringify(data.user));
        if (data.token) saveAdminToken(data.token);
        onLoginSuccess(data.user);
      } else {
        setError(data.error || '登录失败：账号或密码不正确');
      }
    } catch (err: any) {
      setError(err.message || '网络通讯异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col justify-between selection:bg-amber-400/20 selection:text-amber-900">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] max-w-full h-[300px] bg-amber-400/[0.08] blur-[100px] rounded-full pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 border-b border-zinc-200 bg-white/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PgyMascot size="sm" variant="badge" className="shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm sm:text-base font-bold tracking-[0.16em] text-zinc-900">
                TECHSEED
              </span>
              <span className="h-2 w-2 rounded-full bg-[#FACC15] animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 tracking-wider">
              <span className="text-amber-800 font-semibold">学生会技术部</span>
              <span>·</span>
              <span>xxxxx学院管理后台</span>
            </div>
          </div>
        </div>

        <button
          onClick={onBackToStudent}
          className="flex items-center gap-2 rounded-[8px] border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-mono text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-zinc-500" />
          <span>返回新生端</span>
        </button>
      </header>

      {/* Main Login Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-[18px] border border-zinc-200 bg-white p-4 sm:p-8 shadow-xl">
          {/* Badge & Title */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 border-b border-zinc-100 pb-5">
            <PgyMascot size="md" variant="glow" className="shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-sm font-bold tracking-wider text-zinc-900 uppercase">
                  技术部管理后台
                </h2>
                <span className="rounded-[4px] border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold text-amber-900">
                  STAFF ONLY
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 mt-1">
                学生会技术部 · 招新管理控制台
              </p>
            </div>
          </div>

          {/* Security Notice removed */}
          {error && (
            <div role="alert" className="mt-4 border border-rose-200 bg-rose-50 rounded-[8px] p-3 text-xs font-mono text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4 font-mono text-xs">
            <div>
              <label htmlFor="admin-login-username" className="block text-[10px] sm:text-xs uppercase text-zinc-500 tracking-wider mb-1.5 font-semibold">
                管理员账号 (ACCOUNT)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <input
                  id="admin-login-username"
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="请输入技术部管理账号"
                  className="w-full rounded-[8px] border border-zinc-200 bg-white pl-10 pr-3 py-3 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-login-password" className="block text-[10px] sm:text-xs uppercase text-zinc-500 tracking-wider mb-1.5 font-semibold">
                独立访问密码 (PASSWORD)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入后台独立密码"
                  className="w-full rounded-[8px] border border-zinc-200 bg-white pl-10 pr-10 py-3 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 py-3.5 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {loading ? (
                  <span>正在校验管理员权限...</span>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    <span>验证并进入管理控制台</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 bg-white py-4 text-center font-mono text-[11px] text-zinc-500">
        © {new Date().getFullYear()} xxxxx学院学生会技术部 · 招新管理后台
      </footer>
    </div>
  );
};
