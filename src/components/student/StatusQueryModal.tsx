import React, { useState, useEffect } from 'react';
import { X, Search, AlertCircle, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { Candidate, InterviewSession } from '../../types.js';

interface StatusQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCandidateFound: (candidate: Candidate, interview: InterviewSession | null) => void;
  activeBatchId?: string;
  defaultStudentId?: string;
  defaultCandidateName?: string;
}

export const StatusQueryModal: React.FC<StatusQueryModalProps> = ({
  isOpen,
  onClose,
  onCandidateFound,
  activeBatchId,
  defaultStudentId,
  defaultCandidateName,
}) => {
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedRecentId, setDetectedRecentId] = useState('');
  const [detectedRecentName, setDetectedRecentName] = useState('');

  // Automatically default to the student ID that was just interviewed or registered
  useEffect(() => {
    if (isOpen) {
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('tech_last_student_id') || '' : '';
      const storedName = typeof window !== 'undefined' ? localStorage.getItem('tech_last_candidate_name') || '' : '';
      const effectiveId = (defaultStudentId || storedId).trim();
      const effectiveName = (defaultCandidateName || storedName).trim();

      if (effectiveId) {
        setStudentId(effectiveId);
        setDetectedRecentId(effectiveId);
        setDetectedRecentName(effectiveName);
      } else {
        setStudentId('');
        setDetectedRecentId('');
        setDetectedRecentName('');
      }
      setError(null);
    }
  }, [isOpen, defaultStudentId, defaultCandidateName]);

  if (!isOpen) return null;

  const executeQuery = async (targetId: string) => {
    const cleanId = targetId.trim();
    if (!cleanId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/by-student-id/${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof window !== 'undefined') {
          localStorage.setItem('tech_last_student_id', data.candidate.profile.studentId);
          localStorage.setItem('tech_last_candidate_name', data.candidate.profile.name);
        }
        onCandidateFound(data.candidate, data.interview);
        onClose();
      } else {
        const err = await res.json();
        setError(err.error || '未查找到该学号的报名档案，请确认学号是否正确或先报名');
      }
    } catch (err: any) {
      setError(err.message || '网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeQuery(studentId);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start sm:items-center p-2.5 sm:p-4 bg-zinc-900/40 backdrop-blur-xs font-mono text-xs overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="relative w-full max-w-full sm:max-w-md rounded-[18px] border border-zinc-200 bg-white p-4 sm:p-6 shadow-2xl text-zinc-800 my-auto sm:my-8 max-h-[96dvh] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Header — close button is a flex item (not absolute) so it can never overlap the title */}
        <div className="flex items-start gap-2 sm:gap-3 pb-3 border-b border-zinc-100">
          <div className="shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700">
            <Search className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-amber-700">
              STATUS QUERY
            </div>
            <h3 className="mt-1 text-base sm:text-lg font-bold text-zinc-950 tracking-tight break-words">
              输入学号 · 进度找回与结果查询
            </h3>
            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-zinc-600 font-sans leading-relaxed break-words">
              若此前已填写过报名表或初筛中途退出，可在此找回档案继续作答或查看录取通知。
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

        {/* Highlight banner if defaulted to recent interview student ID */}
        {detectedRecentId && (
          <div className="mt-3.5 rounded-[12px] border border-amber-200 bg-amber-50/80 p-3 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-pulse shrink-0" />
                <span className="text-[11px] font-bold text-amber-900 break-words">
                  刚刚作答的学号：{detectedRecentId} {detectedRecentName ? `(${detectedRecentName})` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => executeQuery(detectedRecentId)}
                className="shrink-0 px-2.5 py-1.5 bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 font-bold text-[10px] rounded-[6px] transition-colors shadow-xs"
              >
                直接进入 →
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-xs font-mono text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleSearch} className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">大学学号</label>
              {detectedRecentId && studentId === detectedRecentId ? (
                <button
                  type="button"
                  onClick={() => setStudentId('')}
                  className="text-[10px] text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1 py-1"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span>换其他学号</span>
                </button>
              ) : detectedRecentId ? (
                <button
                  type="button"
                  onClick={() => setStudentId(detectedRecentId)}
                  className="text-[10px] text-amber-700 hover:underline flex items-center gap-1 font-semibold py-1 break-words"
                >
                  <span>填入刚刚的学号 ({detectedRecentId})</span>
                </button>
              ) : null}
            </div>

            <div className="relative">
              <input
                type="text"
                required
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="请输入本人学号（例如：2026xxxxx）"
                className="w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
              />
              {detectedRecentId && studentId === detectedRecentId && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-300 text-[9px] font-bold text-amber-900 rounded-[4px] pointer-events-none">
                  <Check className="h-2.5 w-2.5" />
                  <span>默认当前</span>
                </div>
              )}
            </div>
            {detectedRecentId && studentId === detectedRecentId && (
              <p className="mt-1 text-[10px] text-amber-700 font-mono break-words">
                ✓ 系统已默认填入您刚刚初筛或报名的学号，直接点击下方按钮即可进入
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !studentId.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 py-3 text-xs font-mono font-bold tracking-wider disabled:opacity-50 transition-colors shadow-xs"
          >
            {loading ? '正在查询...' : '查询并进入档案'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
