import React, { useState } from 'react';
import {
  Shield,
  ChevronDown,
  LogOut,
  ExternalLink,
  Trash2,
  AlertTriangle,
  RotateCcw,
  KeyRound,
} from 'lucide-react';
import { AdminUser } from '../types.js';
import { PgyMascot } from './PgyMascot.js';
import { ChangePasswordModal } from './admin/ChangePasswordModal.js';

interface AdminNavbarProps {
  adminUser: AdminUser | null;
  onAdminLogout: () => void;
  onNavigateToStudent: () => void;
  onClearTestData: () => Promise<void>;
  onAdminLoginClick?: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({
  adminUser,
  onAdminLogout,
  onNavigateToStudent,
  onClearTestData,
  onAdminLoginClick,
}) => {
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      await onClearTestData();
      setShowClearConfirm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <PgyMascot size="sm" variant="badge" className="shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold tracking-[0.16em] text-zinc-950">
                  TECHSEED
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308] animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 tracking-wider">
                <span className="text-amber-700 font-bold">学生会技术部</span>
                <span>·</span>
                <span className="text-amber-600 font-semibold">管理后台</span>
              </div>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3 font-mono text-xs">
            {/* Clear Testing Data Button */}
            <button
              id="btn-clear-test-data"
              onClick={() => setShowClearConfirm(true)}
              title="清空当前所有候选人档案与初筛答卷，恢复初始就绪状态"
              className="flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all shadow-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">重置数据</span>
            </button>

            {/* Switch to Student Portal */}
            <button
              id="btn-go-to-student-portal"
              onClick={onNavigateToStudent}
              className="flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-zinc-700 hover:border-amber-400 hover:text-zinc-950 transition-all shadow-xs"
            >
              <span>学生端</span>
              <ExternalLink className="h-3 w-3 text-zinc-500" />
            </button>

            {/* Admin User Menu */}
            {adminUser ? (
              <div className="relative">
                <button
                  id="admin-user-dropdown-btn"
                  onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-zinc-800 hover:border-amber-400 transition-all shadow-xs"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-[#EAB308]" />
                  <span className="font-semibold font-mono text-xs text-zinc-900">{adminUser.name || '技术部管理员'}</span>
                  <ChevronDown className="h-3 w-3 text-zinc-400" />
                </button>

                {roleDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-[14px] border border-zinc-200 bg-white p-2 shadow-xl z-50">
                    <div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-zinc-400 uppercase border-b border-zinc-100">
                      管理账号
                    </div>
                    <div className="px-2 py-2 text-xs font-mono text-zinc-800">
                      <div className="font-bold text-amber-700">{adminUser.name || '技术部管理员'}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 font-mono">账号: {adminUser.username}</div>
                    </div>
                    <div className="my-1 border-t border-zinc-100" />
                    <button
                      onClick={() => {
                        setShowPasswordModal(true);
                        setRoleDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-2.5 text-left text-xs font-mono text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50 transition-colors rounded-[6px]"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                      修改独立密码
                    </button>
                    <button
                      onClick={() => {
                        onAdminLogout();
                        setRoleDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-2.5 text-left text-xs font-mono text-rose-600 hover:bg-rose-50 transition-colors rounded-[6px]"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      退出控制台
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onAdminLoginClick}
                className="rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3.5 py-2.5 text-xs font-mono font-bold transition-colors shadow-xs"
              >
                管理员登录
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Clearing Test Data */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[16px] border border-rose-200 bg-white p-6 shadow-2xl font-mono text-zinc-800">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-zinc-950 uppercase">确认重置候选人数据库？</h3>
            </div>
            <p className="mt-4 text-xs text-zinc-600 leading-relaxed">
              此操作将清空当前批次所有已报名的学生档案、AI 面试记录、多维评估画像报告及复试备注。
            </p>
            <p className="mt-2 text-xs text-emerald-700 leading-relaxed">
              ✓ 管理员账号、招新批次设置、微信群二维码及 AI 提示词配置将完好保留。
            </p>
            <p className="mt-2 text-[11px] text-zinc-400">
              重置后，招新系统将恢复就绪状态，迎接大一新生正式报名与初筛。
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                disabled={isClearing}
                onClick={() => setShowClearConfirm(false)}
                className="rounded-[8px] border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 shadow-xs"
              >
                取消
              </button>
              <button
                disabled={isClearing}
                onClick={handleConfirmClear}
                className="rounded-[8px] border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isClearing ? (
                  <>
                    <RotateCcw className="h-3 w-3 animate-spin" />
                    <span>正在清空...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>确认立即清空</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        adminUser={adminUser}
      />
    </>
  );
};
