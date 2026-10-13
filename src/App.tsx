import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  Users,
  QrCode,
  Sliders,
  Settings,
  Sparkles,
  ArrowRight,
  Shield,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { StudentNavbar } from './components/StudentNavbar.js';
import { StudentHome } from './components/student/StudentHome.js';
import { RegistrationModal } from './components/student/RegistrationModal.js';
import { AIInterviewTerminal } from './components/student/AIInterviewTerminal.js';
import { CandidateStatusView } from './components/student/CandidateStatusView.js';
import { StatusQueryModal } from './components/student/StatusQueryModal.js';
import type { NewBatchInput } from './components/admin/BatchManager.js';
import {
  getAdminToken,
  getStudentAccessToken,
  clearAdminSession,
  clearStudentSession,
  saveStudentSession,
  STUDENT_CANDIDATE_ID_KEY,
} from './lib/auth.js';
import {
  Candidate,
  CandidateProfile,
  InterviewSession,
  DashboardStats,
  RecruitmentBatch,
  AdminUser,
  REGISTRATION_CONSENT_VERSION,
} from './types.js';

const AdminNavbar = lazy(() => import('./components/AdminNavbar.js').then(module => ({ default: module.AdminNavbar })));
const AdminLoginPage = lazy(() => import('./components/admin/AdminLoginPage.js').then(module => ({ default: module.AdminLoginPage })));
const CandidateList = lazy(() => import('./components/admin/CandidateList.js').then(module => ({ default: module.CandidateList })));
const BatchManager = lazy(() => import('./components/admin/BatchManager.js').then(module => ({ default: module.BatchManager })));
const CandidateDetailModal = lazy(() => import('./components/admin/CandidateDetailModal.js').then(module => ({ default: module.CandidateDetailModal })));
const QRCodeManager = lazy(() => import('./components/admin/QRCodeManager.js').then(module => ({ default: module.QRCodeManager })));
const PromptManager = lazy(() => import('./components/admin/PromptManager.js').then(module => ({ default: module.PromptManager })));
const AISettingsManager = lazy(() => import('./components/admin/AISettingsManager.js').then(module => ({ default: module.AISettingsManager })));
const AdminLoginModal = lazy(() => import('./components/admin/AdminLoginModal.js').then(module => ({ default: module.AdminLoginModal })));

export default function App() {
  // Top Level Navigation & URL Routing sync
  type StudentScreen = 'home' | 'interview' | 'status';

  const parseStudentScreenFromUrl = (): StudentScreen => {
    if (typeof window === 'undefined') return 'home';
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/interview')) return 'interview';
    if (path.startsWith('/status')) return 'status';
    return 'home';
  };

  const getInitialView = (): 'student' | 'admin' => {
    if (typeof window === 'undefined') return 'student';
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path.startsWith('/admin') || hash === '#admin' ? 'admin' : 'student';
  };

  const [currentView, setCurrentView] = useState<'student' | 'admin'>(getInitialView);
  const [adminTab, setAdminTab] = useState<'candidates' | 'qr' | 'prompts' | 'ai-settings'>('candidates');
  const [studentScreen, setStudentScreenState] = useState<StudentScreen>(parseStudentScreenFromUrl);

  // Sync studentScreen to URL via pushState
  const setStudentScreen = (screen: StudentScreen) => {
    setStudentScreenState(screen);
    if (typeof window === 'undefined') return;
    let targetPath = '/';
    if (screen === 'interview') targetPath = '/interview';
    else if (screen === 'status') targetPath = '/status';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  const navigateToView = (view: 'student' | 'admin') => {
    setCurrentView(view);
    const targetUrl = view === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
    if (view === 'student') {
      setStudentScreenState('home');
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const isAdmin = path.startsWith('/admin') || hash === '#admin';
      setCurrentView(isAdmin ? 'admin' : 'student');
      if (!isAdmin) {
        setStudentScreenState(parseStudentScreenFromUrl());
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Authentication State - Strictly null by default so students cannot enter backend without credentials
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('tech_admin_user');
        if (stored) return JSON.parse(stored);
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  // Shortcut for tech dept staff (Ctrl+Shift+A or Cmd+Shift+A) to jump to admin portal login
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return;
        e.preventDefault();
        navigateToView('admin');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Candidate session (Student Portal)
  const [candidateSession, setCandidateSession] = useState<Candidate | null>(null);
  const [activeInterview, setActiveInterview] = useState<InterviewSession | null>(null);
  const [isInterviewLoading, setIsInterviewLoading] = useState(false);

  // Remember most recently used student ID & name for quick status query and session continuity
  const [recentStudentId, setRecentStudentId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tech_last_student_id') || '';
    }
    return '';
  });
  const [recentCandidateName, setRecentCandidateName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tech_last_candidate_name') || '';
    }
    return '';
  });

  // Batches & Candidates Data (Admin Portal)
  const [batches, setBatches] = useState<RecruitmentBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const activeBatch = batches.find(batch => batch.id === activeBatchId) || batches.find(batch => batch.isActive);
  const activeBatchYear = activeBatch?.year ?? new Date().getFullYear();

  // Modals
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isStatusQueryOpen, setIsStatusQueryOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('ALL');

  useEffect(() => {
    if (currentView === 'student' && !candidateSession && studentScreen !== 'home') {
      setIsStatusQueryOpen(true);
    }
  }, [currentView, studentScreen, candidateSession]);

  // Load Batches
  const loadBatches = async () => {
    try {
      const res = await fetch('/api/recruitment-batches');
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
        const active = data.find((b: RecruitmentBatch) => b.isActive) || data[0];
        if (active) setActiveBatchId(active.id);
      }
    } catch (err) {
      console.error('Failed to load batches:', err);
    }
  };

  const activateBatch = async (batchId: string) => {
    const res = await fetch(`/api/recruitment-batches/${encodeURIComponent(batchId)}/active`, { method: 'PATCH' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '切换批次失败，请重试');
    setActiveBatchId(data.activeBatchId || batchId);
    setBatches(current => current.map(batch => ({ ...batch, isActive: batch.id === batchId })));
  };

  const createBatch = async (batch: NewBatchInput) => {
    const res = await fetch('/api/recruitment-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '创建批次失败，请重试');
    setBatches(current => [...current, data as RecruitmentBatch]);
  };

  // Load Candidates & Stats (admin-only data)
  // Gated on the persisted token rather than adminUser, which is not yet committed
  // when this runs from onLoginSuccess. Called on mount for every visitor, so without
  // this students would hammer protected admin routes on first load.
  const loadCandidatesAndStats = async (batchId = activeBatchId) => {
    if (!getAdminToken()) {
      setCandidates([]);
      setStats(null);
      return;
    }
    if (!batchId) return;
    try {
      const [candRes, statsRes] = await Promise.all([
        fetch(`/api/candidates?batchId=${batchId}`),
        fetch(`/api/dashboard/stats?batchId=${batchId}`),
      ]);

      if (candRes.ok) {
        const cList = await candRes.json();
        setCandidates(cList);
      }
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData);
      }
    } catch (err) {
      console.error('Failed to load candidates and stats:', err);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // Synchronize candidate session changes with localStorage & state
  useEffect(() => {
    if (candidateSession?.profile?.studentId) {
      const sId = candidateSession.profile.studentId;
      const sName = candidateSession.profile.name || '';
      setRecentStudentId(sId);
      setRecentCandidateName(sName);
      try {
        localStorage.setItem('tech_last_student_id', sId);
        if (sName) {
          localStorage.setItem('tech_last_candidate_name', sName);
        }
      } catch (e) {}
    }
  }, [candidateSession]);

  // Auto-restore candidate session from localStorage if available on launch
  useEffect(() => {
    const savedCandidateId = typeof window !== 'undefined' ? localStorage.getItem(STUDENT_CANDIDATE_ID_KEY) : null;
    const savedStudentToken = getStudentAccessToken();
    if (savedCandidateId && savedStudentToken && !candidateSession) {
      fetch(`/api/candidates/${encodeURIComponent(savedCandidateId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.candidate) {
            setCandidateSession(data.candidate);
            setActiveInterview(data.interview);
            setRecentStudentId(data.candidate.profile.studentId);
            setRecentCandidateName(data.candidate.profile.name);
            setIsStatusQueryOpen(false);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (activeBatchId) {
      loadCandidatesAndStats(activeBatchId);
    }
  }, [activeBatchId]);

  // Handle Candidate Registration
  const handleRegister = async (profile: CandidateProfile, privacyConsentVersion: string) => {
    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, batchId: activeBatchId, privacyConsentVersion }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '报名失败');
    }

    const { candidate, studentToken } = await res.json();
    if (!candidate?.id || !studentToken) {
      throw new Error('报名成功，但未能建立安全会话，请通过“进度找回”继续');
    }
    saveStudentSession(candidate.id, studentToken);
    setCandidateSession(candidate);
    setRecentStudentId(candidate.profile.studentId);
    setRecentCandidateName(candidate.profile.name);
    try {
      localStorage.setItem('tech_last_student_id', candidate.profile.studentId);
      localStorage.setItem('tech_last_candidate_name', candidate.profile.name);
    } catch (e) {}

    // Automatically trigger or resume AI interview
    const intvRes = await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candidate.id }),
    });

    if (intvRes.ok) {
      const data = await intvRes.json();
      if (data.candidate) setCandidateSession(data.candidate);
      setActiveInterview(data.interview);
      setStudentScreen('interview');
    } else {
      setStudentScreen('status');
    }

    loadCandidatesAndStats(activeBatchId);
  };

  const startOrResumeInterview = async () => {
    if (!candidateSession) return;
    setIsInterviewLoading(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candidateSession.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '暂时无法开始面试，请稍后重试');
        return;
      }
      if (data.candidate) setCandidateSession(data.candidate);
      setActiveInterview(data.interview);
      setStudentScreen('interview');
    } catch (err: any) {
      alert(err.message || '网络连接异常，请稍后重试');
    } finally {
      setIsInterviewLoading(false);
    }
  };

  // Submit Answer in Interview Terminal
  const handleSubmitAnswer = async (answer: string) => {
    if (!candidateSession) return;
    setIsInterviewLoading(true);
    try {
      const res = await fetch(`/api/interviews/${candidateSession.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveInterview(data.interview);

        if (data.isCompleted) {
          // Refresh candidate session with new status
          const candRes = await fetch(`/api/candidates/${candidateSession.id}`);
          if (candRes.ok) {
            const candData = await candRes.json();
            setCandidateSession(candData.candidate);
          }
          setStudentScreen('status');
          loadCandidatesAndStats(activeBatchId);
        }
      } else {
        const err = await res.json();
        alert(err.error || '提交回答失败');
      }
    } catch (err: any) {
      alert(err.message || '网络连接异常');
    } finally {
      setIsInterviewLoading(false);
    }
  };

  // Complete Interview Early
  const handleCompleteInterview = async () => {
    if (!candidateSession) return;
    setIsInterviewLoading(true);
    try {
      const res = await fetch(`/api/interviews/${candidateSession.id}/complete`, {
        method: 'POST',
      });
      if (res.ok) {
        const candRes = await fetch(`/api/candidates/${candidateSession.id}`);
        if (candRes.ok) {
          const candData = await candRes.json();
          setCandidateSession(candData.candidate);
        }
        setStudentScreen('status');
        loadCandidatesAndStats(activeBatchId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInterviewLoading(false);
    }
  };

  // Refresh current candidate session
  const refreshCandidateSession = async () => {
    if (!candidateSession) return;
    try {
      const res = await fetch(`/api/candidates/${candidateSession.id}`);
      if (res.ok) {
        const data = await res.json();
        setCandidateSession(data.candidate);
        setActiveInterview(data.interview);
      }
      loadCandidatesAndStats(activeBatchId);
    } catch (err) {
      console.error(err);
    }
  };

  // Reset All Candidate Data (Database cleanup)
  const handleClearTestData = async () => {
    try {
      const res = await fetch('/api/admin/clear-data', { method: 'POST' });
      if (!res.ok) {
        throw new Error('数据重置失败');
      }
      setCandidates([]);
      setCandidateSession(null);
      setActiveInterview(null);
      setStudentScreen('home');
      setRecentStudentId(null);
      setRecentCandidateName(null);
      try {
        localStorage.removeItem('tech_last_student_id');
        localStorage.removeItem('tech_last_candidate_name');
      } catch (e) {}
      clearStudentSession();
      await loadCandidatesAndStats(activeBatchId);
    } catch (err: any) {
      console.error('Failed to reset candidate database:', err);
    }
  };

  // Dedicated Admin Gatekeeper: If visiting /admin without authenticated admin user, show strict login page
  if (currentView === 'admin' && !adminUser) {
    return (
      <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-zinc-500">正在加载管理入口…</div>}>
        <AdminLoginPage
          onLoginSuccess={user => {
            setAdminUser(user);
            loadCandidatesAndStats(activeBatchId);
          }}
          onBackToStudent={() => navigateToView('student')}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#18181B] font-sans antialiased selection:bg-amber-100 selection:text-amber-900 flex flex-col">
      {/* Dynamic Navbar: Completely separated Student and Admin interfaces */}
      {currentView === 'student' ? (
        <StudentNavbar
          batchYear={activeBatchYear}
          candidateSession={candidateSession}
          onClearCandidateSession={() => {
            setCandidateSession(null);
            setActiveInterview(null);
            setStudentScreen('home');
            setRecentStudentId(null);
            setRecentCandidateName(null);
            try {
              localStorage.removeItem('tech_last_student_id');
              localStorage.removeItem('tech_last_candidate_name');
            } catch (e) {}
            clearStudentSession();
          }}
          onOpenRegistration={() => setIsRegistrationOpen(true)}
          onOpenStatusQuery={() => setIsStatusQueryOpen(true)}
          onResumeInterview={() => {
            if (activeInterview && activeInterview.status !== 'COMPLETED') {
              setStudentScreen('interview');
            } else if (candidateSession) {
              if (!activeInterview) startOrResumeInterview();
              else setStudentScreen('status');
            }
          }}
          onGoHome={() => setStudentScreen('home')}
        />
      ) : (
        <Suspense fallback={<div className="h-16 border-b border-zinc-200 bg-white" />}>
          <AdminNavbar
            adminUser={adminUser}
            onAdminLogout={() => {
              setAdminUser(null);
              clearAdminSession();
              setCandidates([]);
              setStats(null);
              navigateToView('student');
            }}
            onNavigateToStudent={() => navigateToView('student')}
            onClearTestData={handleClearTestData}
          />
        </Suspense>
      )}

      {/* Main View Container */}
      <main className="flex-1 pb-16">
        {currentView === 'student' ? (
          /* ================= STUDENT PORTAL ================= */
          <div>
            {studentScreen === 'home' && (
              <StudentHome
                batchYear={activeBatchYear}
                onStartRegistration={() => setIsRegistrationOpen(true)}
                onCheckStatus={() => setIsStatusQueryOpen(true)}
                onResumeInterview={() => {
                  if (activeInterview && activeInterview.status !== 'COMPLETED') {
                    setStudentScreen('interview');
                  } else if (candidateSession) {
                    if (!activeInterview) startOrResumeInterview();
                    else setStudentScreen('status');
                  }
                }}
                hasActiveSession={Boolean(candidateSession)}
              />
            )}

            {studentScreen === 'interview' && candidateSession && activeInterview && (
              <div className="space-y-4 pt-4">
                <div className="mx-auto max-w-4xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-zinc-500">
                  <button
                    onClick={() => setStudentScreen('home')}
                    className="text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    ← 返回招新主页
                  </button>
                  <button
                    onClick={() => setStudentScreen('status')}
                    className="text-amber-600 font-semibold hover:underline"
                  >
                    查看当前招新流转状态 →
                  </button>
                </div>
                <AIInterviewTerminal
                  candidate={candidateSession}
                  interview={activeInterview}
                  onSubmitAnswer={handleSubmitAnswer}
                  onCompleteInterview={handleCompleteInterview}
                  isLoading={isInterviewLoading}
                />
              </div>
            )}

            {studentScreen === 'status' && candidateSession && (
              <div className="space-y-4 pt-4">
                <div className="mx-auto max-w-3xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-zinc-500">
                  <button
                    onClick={() => setStudentScreen('home')}
                    className="text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    ← 返回主页
                  </button>
                  {candidateSession.status === 'AI_INTERVIEWING' && activeInterview && (
                    <button
                      onClick={() => setStudentScreen('interview')}
                      className="text-amber-600 font-semibold hover:underline"
                    >
                      继续初筛答题 →
                    </button>
                  )}
                </div>
                <CandidateStatusView
                  candidate={candidateSession}
                  onResumeInterview={startOrResumeInterview}
                  onRefresh={refreshCandidateSession}
                />
              </div>
            )}
          </div>
        ) : (
          /* ================= ADMIN CENTER ================= */
          <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 space-y-6">
            {/* Admin Header and Sub-tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rotate-45 bg-[#EAB308] shrink-0" />
                  技术部招新管理控制台
                </h1>
                <p className="text-[11px] sm:text-xs text-zinc-500 font-mono tracking-wider mt-1 uppercase">
                  ACTIVE BATCH: <span className="text-amber-700 font-semibold">{batches.find(b => b.id === activeBatchId)?.name || activeBatchId}</span> · AI SCREENING · HUMAN FINAL REVIEW
                </p>
                <div className="mt-3">
                  <BatchManager
                    batches={batches}
                    activeBatchId={activeBatchId}
                    onActivateBatch={activateBatch}
                    onCreateBatch={createBatch}
                  />
                </div>
              </div>

              {/* Sub-tab switcher */}
              <div className="flex items-center rounded-[10px] border border-zinc-200 bg-white p-1 font-mono text-xs shadow-xs">
                <button
                  id="tab-admin-candidates"
                  onClick={() => setAdminTab('candidates')}
                  className={`flex items-center gap-1.5 rounded-[8px] px-3 py-2.5 uppercase font-bold tracking-wider transition-all ${
                    adminTab === 'candidates'
                      ? 'bg-[#FACC15] text-zinc-950 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  候选人档案 ({candidates.length})
                </button>

                {adminUser?.role === 'ADMIN' && (
                  <button
                    id="tab-admin-qr"
                    onClick={() => setAdminTab('qr')}
                    className={`flex items-center gap-1.5 rounded-[8px] px-3 py-2.5 uppercase font-bold tracking-wider transition-all ${
                      adminTab === 'qr'
                        ? 'bg-[#FACC15] text-zinc-950 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    微信群二维码
                  </button>
                )}

                {adminUser?.role === 'ADMIN' && (
                  <button
                    id="tab-admin-prompts"
                    onClick={() => setAdminTab('prompts')}
                    className={`flex items-center gap-1.5 rounded-[8px] px-3 py-2.5 uppercase font-bold tracking-wider transition-all ${
                      adminTab === 'prompts'
                        ? 'bg-[#FACC15] text-zinc-950 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    AI 策略配置
                  </button>
                )}

                {adminUser?.role === 'ADMIN' && (
                  <button
                    id="tab-admin-ai-settings"
                    onClick={() => setAdminTab('ai-settings')}
                    className={`flex items-center gap-1.5 rounded-[8px] px-3 py-2.5 uppercase font-bold tracking-wider transition-all ${
                      adminTab === 'ai-settings'
                        ? 'bg-[#FACC15] text-zinc-950 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    AI 模型配置
                  </button>
                )}
              </div>
            </div>

            {/* Admin Content Area */}
            <Suspense fallback={<div className="py-8 text-sm text-zinc-500">正在加载管理面板…</div>}>
            {adminTab === 'candidates' && (
              <CandidateList
                candidates={candidates}
                selectedPreset={selectedPreset}
                onSelectPreset={p => setSelectedPreset(p)}
                onSelectCandidate={c => setSelectedCandidateId(c.id)}
                onRefresh={() => loadCandidatesAndStats(activeBatchId)}
                onNavigateToStudent={() => navigateToView('student')}
              />
            )}

            {adminTab === 'qr' && (
              <QRCodeManager
                batches={batches}
                activeBatchId={activeBatchId}
              />
            )}

            {adminTab === 'prompts' && <PromptManager />}
            {adminTab === 'ai-settings' && <AISettingsManager />}
            </Suspense>
          </div>
        )}
      </main>

      {/* Footer */}
      <div className="mt-24 border-t border-zinc-200 pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-zinc-500">
        <div>© {new Date().getFullYear()} xxxxx学院学生会技术部</div>
        <div className="flex items-center gap-3 text-zinc-400 text-[10px]">
          <span className="text-amber-600 font-medium">学生会技术部</span>
          <span>·</span>
          <span>TECHSEED RECRUITMENT ENGINE</span>
        </div>
      </div>

      {/* Modals */}
      <RegistrationModal
        batchYear={activeBatchYear}
        isOpen={isRegistrationOpen}
        onClose={() => setIsRegistrationOpen(false)}
        onSubmit={handleRegister}
      />

      <StatusQueryModal
        isOpen={isStatusQueryOpen}
        onClose={() => setIsStatusQueryOpen(false)}
        defaultStudentId={candidateSession?.profile?.studentId || recentStudentId}
        defaultCandidateName={candidateSession?.profile?.name || recentCandidateName}
        onCandidateFound={(cand, intv) => {
          setCandidateSession(cand);
          setActiveInterview(intv);
          setRecentStudentId(cand.profile.studentId);
          setRecentCandidateName(cand.profile.name);
          try {
            localStorage.setItem('tech_last_student_id', cand.profile.studentId);
            localStorage.setItem('tech_last_candidate_name', cand.profile.name);
          } catch (e) {}
          if (intv && intv.status !== 'COMPLETED') {
            setStudentScreen('interview');
          } else {
            setStudentScreen('status');
          }
        }}
      />

      {isAdminLoginOpen && (
        <Suspense fallback={null}>
          <AdminLoginModal
            isOpen
            onClose={() => setIsAdminLoginOpen(false)}
            onLoginSuccess={user => {
              setAdminUser(user);
              setCurrentView('admin');
            }}
          />
        </Suspense>
      )}

      {selectedCandidateId && (
        <Suspense fallback={null}>
          <CandidateDetailModal
            candidateId={selectedCandidateId}
            onClose={() => setSelectedCandidateId(null)}
            currentUser={adminUser}
            onRefreshList={() => loadCandidatesAndStats(activeBatchId)}
          />
        </Suspense>
      )}
    </div>
  );
}
