import React, { useEffect, useState } from 'react';
import { X, Search, AlertCircle, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { Candidate, InterviewSession } from '../../types.js';
import { useModalAccessibility } from '../../lib/useModalAccessibility.js';
import {
  clearStudentSession,
  getStudentAccessToken,
  getStoredValue,
  saveStudentSession,
  setStoredValue,
  STUDENT_CANDIDATE_ID_KEY,
} from '../../lib/auth.js';

interface StatusQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCandidateFound: (candidate: Candidate, interview: InterviewSession | null) => void;
  defaultStudentId?: string;
  defaultCandidateName?: string;
}

export const StatusQueryModal: React.FC<StatusQueryModalProps> = ({
  isOpen,
  onClose,
  onCandidateFound,
  defaultStudentId,
  defaultCandidateName,
}) => {
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedRecentId, setDetectedRecentId] = useState('');
  const [detectedRecentName, setDetectedRecentName] = useState('');
  const dialogRef = useModalAccessibility<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const storedId = getStoredValue('tech_last_student_id') || '';
    const storedName = getStoredValue('tech_last_candidate_name') || '';
    const effectiveId = (defaultStudentId || storedId).trim();
    const effectiveName = (defaultCandidateName || storedName).trim();
    setStudentId(effectiveId);
    setName(effectiveName);
    setPhone('');
    setDetectedRecentId(effectiveId);
    setDetectedRecentName(effectiveName);
    setError(null);
  }, [isOpen, defaultStudentId, defaultCandidateName]);

  if (!isOpen) return null;

  const executeQuery = async (targetId: string) => {
    const cleanId = targetId.trim();
    if (!cleanId) return;

    setLoading(true);
    setError(null);
    try {
      const storedCandidateId = getStoredValue(STUDENT_CANDIDATE_ID_KEY) || '';
      const storedStudentId = getStoredValue('tech_last_student_id') || '';
      const hasMatchingSession = Boolean(
        getStudentAccessToken() && storedCandidateId && cleanId === storedStudentId.trim(),
      );

      if (hasMatchingSession) {
        const sessionRes = await fetch(`/api/candidates/${encodeURIComponent(storedCandidateId)}`);
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData?.candidate?.profile?.studentId === cleanId) {
            onCandidateFound(sessionData.candidate, sessionData.interview || null);
            onClose();
            return;
          }
          clearStudentSession();
        } else if (sessionRes.status === 401 || sessionRes.status === 404) {
          clearStudentSession();
        } else {
          throw new Error('暂时无法连接报名档案，请稍后重试');
        }
      }

      const res = await fetch('/api/student/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cleanId, name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '验证失败，请检查报名时填写的信息');
        return;
      }

      saveStudentSession(data.candidate.id, data.studentToken);
      setStoredValue('tech_last_student_id', data.candidate.profile.studentId);
      setStoredValue('tech_last_candidate_name', data.candidate.profile.name);
      onCandidateFound(data.candidate, data.interview || null);
      onClose();
    } catch (err: any) {
      setError(err.message || '网络请求错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeQuery(studentId);
  };

  const hasSavedSession = Boolean(
    typeof window !== 'undefined' &&
    getStudentAccessToken() &&
    getStoredValue(STUDENT_CANDIDATE_ID_KEY) &&
    getStoredValue('tech_last_student_id') === studentId.trim(),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start sm:items-center p-2.5 sm:p-4 bg-zinc-900/40 backdrop-blur-xs font-mono text-xs overflow-y-auto overflow-x-hidden overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-query-modal-title"
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-full sm:max-w-md rounded-[18px] border border-zinc-200 bg-white p-4 sm:p-6 shadow-2xl text-zinc-800 my-auto sm:my-8 max-h-[96dvh] overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div className="flex items-start gap-2 sm:gap-3 pb-3 border-b border-zinc-100">
          <div className="shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700">
            <Search className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-amber-700">
              STATUS QUERY
            </div>
            <h3 id="status-query-modal-title" className="mt-1 text-base sm:text-lg font-bold text-zinc-950 tracking-tight break-words">
              找回报名进度
            </h3>
            <p className="mt-1 text-[11px] sm:text-xs text-zinc-600 font-sans leading-relaxed">
              本设备有有效会话时可直接进入；换设备后请填写报名时的学号、姓名和手机号。
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 -mr-1 mt-0.5 rounded-[8px] p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {detectedRecentId && (
          <div className="mt-3.5 rounded-[12px] border border-amber-200 bg-amber-50/80 p-3 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-pulse shrink-0" />
                <span className="text-[11px] font-bold text-amber-900 break-words">
                  最近使用：{detectedRecentId}{detectedRecentName ? `（${detectedRecentName}）` : ''}
                </span>
              </div>
              {hasSavedSession && (
                <button
                  type="button"
                  onClick={() => executeQuery(detectedRecentId)}
                  disabled={loading}
                  className="shrink-0 px-2.5 py-1.5 bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 font-bold text-[10px] rounded-[6px] transition-colors shadow-xs disabled:opacity-50"
                >
                  直接进入 →
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-xs font-mono text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleSearch} className="mt-5 space-y-3.5">
          <div>
            <label htmlFor="status-query-student-id" className="block text-[11px] text-zinc-600 font-medium tracking-wider">大学学号</label>
            <div className="relative mt-1.5">
              <input
                id="status-query-student-id"
                type="text"
                required
                maxLength={64}
                autoComplete="username"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="请输入本人学号"
                className="w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
              />
              {detectedRecentId && studentId === detectedRecentId && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-300 text-[9px] font-bold text-amber-900 rounded-[4px] pointer-events-none">
                  <Check className="h-2.5 w-2.5" />
                  <span>最近使用</span>
                </div>
              )}
            </div>
          </div>

          {!hasSavedSession && (
            <>
              <div>
                <label htmlFor="status-query-name" className="block text-[11px] text-zinc-600 font-medium tracking-wider">报名时填写的姓名</label>
                <input
                  id="status-query-name"
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="请输入报名表中的姓名"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>
              <div>
                <label htmlFor="status-query-phone" className="block text-[11px] text-zinc-600 font-medium tracking-wider">报名时填写的手机号</label>
                <input
                  id="status-query-phone"
                  type="tel"
                  required
                  maxLength={40}
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="请输入报名表中的手机号"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>
            </>
          )}

          {detectedRecentId && studentId !== detectedRecentId && (
            <button
              type="button"
              onClick={() => setStudentId(detectedRecentId)}
              className="text-[10px] text-amber-700 hover:underline flex items-center gap-1 font-semibold py-1"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              填入最近使用的学号
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !studentId.trim() || (!hasSavedSession && (!name.trim() || !phone.trim()))}
            className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 py-3 text-xs font-mono font-bold tracking-wider disabled:opacity-50 transition-colors shadow-xs"
          >
            {loading ? '正在验证...' : hasSavedSession ? '进入报名档案' : '验证并找回档案'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
