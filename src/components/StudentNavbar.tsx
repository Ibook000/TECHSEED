import React from 'react';
import { ArrowRight, Search, RotateCcw } from 'lucide-react';
import { Candidate } from '../types.js';
import { PgyMascot } from './PgyMascot.js';

interface StudentNavbarProps {
  candidateSession: Candidate | null;
  onClearCandidateSession: () => void;
  onOpenRegistration: () => void;
  onOpenStatusQuery: () => void;
  onResumeInterview?: () => void;
  onGoHome?: () => void;
}

export const StudentNavbar: React.FC<StudentNavbarProps> = ({
  candidateSession,
  onClearCandidateSession,
  onOpenRegistration,
  onOpenStatusQuery,
  onResumeInterview,
  onGoHome,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Typographic Brand & Mascot */}
        <button
          onClick={onGoHome}
          className="flex items-center gap-3 text-left group transition-opacity hover:opacity-90"
        >
          <PgyMascot size="sm" variant="badge" className="shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold tracking-[0.16em] text-zinc-900">
                TECHSEED
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308] animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 tracking-wider">
              <span className="text-amber-600 font-bold">学生会技术部</span>
              <span>·</span>
              <span>xxxxx学院 2026</span>
            </div>
          </div>
        </button>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 font-mono text-xs">
          {candidateSession ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-zinc-800">
                <span className="h-2 w-2 rounded-full bg-[#EAB308] shrink-0" />
                <span className="font-medium text-zinc-900">{candidateSession.profile.name}</span>
                <span className="text-zinc-400 text-[11px] hidden sm:inline font-mono">
                  {candidateSession.profile.studentId}
                </span>
              </div>

              {onResumeInterview && (
                <button
                  onClick={onResumeInterview}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3.5 py-1.5 font-bold tracking-wider transition-colors shadow-xs"
                >
                  <span>继续作答 / 查看进度</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}

              <button
                id="student-clear-session-btn"
                onClick={onClearCandidateSession}
                title="退出当前考生登录档案"
                className="flex items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden md:inline">退出档案</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                id="btn-nav-status-query"
                onClick={onOpenStatusQuery}
                className="flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-all font-medium"
              >
                <Search className="h-3.5 w-3.5 text-zinc-400" />
                <span>查询进度</span>
              </button>
              <button
                id="btn-nav-register"
                onClick={onOpenRegistration}
                className="flex items-center gap-1.5 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3.5 py-1.5 text-xs font-bold tracking-wider transition-colors shadow-xs"
              >
                <span>立即报名 →</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
