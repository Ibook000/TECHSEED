import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Award,
  CheckCircle,
  Phone,
  MessageCircle,
  MessageSquare,
  History,
  FileText,
  ChevronRight,
  UserCheck,
  UserX,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Candidate,
  AIEvaluation,
  StatusTransition,
  CandidateNote,
  InterviewSession,
  AdminUser,
} from '../../types.js';
import { useModalAccessibility } from '../../lib/useModalAccessibility.js';

interface CandidateDetailModalProps {
  candidateId: string | null;
  onClose: () => void;
  currentUser: AdminUser | null;
  onRefreshList: () => void;
}

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidateId,
  onClose,
  currentUser,
  onRefreshList,
}) => {
  const modalRef = useModalAccessibility<HTMLDivElement>(Boolean(candidateId), onClose);
  const [activeTab, setActiveTab] = useState<'report' | 'transcript' | 'history'>('report');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    candidate: Candidate;
    evaluation: AIEvaluation | null;
    statusHistory: StatusTransition[];
    notes: CandidateNote[];
    interview: InterviewSession | null;
  } | null>(null);

  // Notes Form State
  const [noteContent, setNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [actionLoading, setActionLoading] = useState<'admit' | 'reject' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeleteCandidate = async () => {
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, { method: 'DELETE' });
      if (res.ok) {
        onRefreshList();
        onClose();
      } else {
        const d = await res.json();
        setActionNotice({ type: 'error', text: d.error || '删除失败' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || '网络连接异常' });
    } finally {
      setActionLoading(null);
    }
  };

  // Load detail
  const loadDetail = async () => {
    if (!candidateId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load candidate detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [candidateId]);

  if (!candidateId) return null;

  const candidate = data?.candidate;
  const evaluation = data?.evaluation;
  const interview = data?.interview;

  const isAdmitted = candidate && ['ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED', 'QR_AVAILABLE'].includes(candidate.status);
  const isRejected = candidate?.status === 'MANUAL_REJECTED';

  const handleAdmit = async () => {
    if (actionLoading) return;
    setActionLoading('admit');
    setActionNotice(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser?.name || '技术部管理员',
          comment: '技术部审核通过，正式录取为技术部成员并开放微信群',
        }),
      });
      if (res.ok) {
        setActionNotice({
          type: 'success',
          text: `已正式录取候选人【${candidate?.profile.name}】，该生客户端已即刻开放微信群二维码！`,
        });
        await loadDetail();
        onRefreshList();
      } else {
        const d = await res.json();
        setActionNotice({ type: 'error', text: d.error || '录取操作失败' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || '网络连接异常' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (actionLoading) return;
    setActionLoading('reject');
    setActionNotice(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser?.name || '技术部管理员',
          reason: '综合考量未予录用',
        }),
      });
      if (res.ok) {
        setActionNotice({
          type: 'success',
          text: `已将候选人【${candidate?.profile.name}】状态设为未予录用。`,
        });
        await loadDetail();
        onRefreshList();
      } else {
        const d = await res.json();
        setActionNotice({ type: 'error', text: d.error || '操作失败' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || '网络连接异常' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorId: currentUser?.id || 'admin',
          authorName: currentUser?.name || '技术部管理员',
          content: noteContent.trim(),
        }),
      });
      if (res.ok) {
        setNoteContent('');
        loadDetail();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingNote(false);
    }
  };

  // Radar data for candidate
  const candidateRadarData = evaluation
    ? [
        { subject: '学习能力', candidateScore: evaluation.scores.learning, fullMark: 100 },
        { subject: '探索主动性', candidateScore: evaluation.scores.initiative, fullMark: 100 },
        { subject: '逻辑思维', candidateScore: evaluation.scores.logic, fullMark: 100 },
        { subject: '技术兴趣', candidateScore: evaluation.scores.technology_interest, fullMark: 100 },
        { subject: '沟通表达', candidateScore: evaluation.scores.communication, fullMark: 100 },
        { subject: '技术基础', candidateScore: evaluation.scores.technical_foundation, fullMark: 100 },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-900/50 backdrop-blur-xs overflow-y-auto">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-detail-title"
        tabIndex={-1}
        className="relative w-full max-w-5xl rounded-[16px] border border-zinc-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-4 text-zinc-800"
      >
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-amber-100 border border-amber-300 text-amber-900 font-mono font-bold text-sm shadow-xs">
              {candidate?.profile.name.slice(0, 1) || 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="candidate-detail-title" className="text-lg font-bold text-zinc-900 font-sans">
                  {candidate?.profile.name || '候选人档案'}
                </h2>
                <span className="font-mono text-xs text-zinc-500">
                  [{candidate?.profile.studentId}]
                </span>
                {evaluation?.recommendation && (
                  <span className="rounded-[4px] bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900 border border-amber-300">
                    AI 初筛等级（仅供参考）: {evaluation.recommendation} ({evaluation.overallScore} 分)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-1 font-mono">
                <span>{candidate?.profile.major} · {candidate?.profile.className}</span>
                <span>方向: <strong className="text-zinc-800">{candidate?.profile.techDirection}</strong></span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-zinc-400" /> {candidate?.profile.phone}</span>
                {candidate?.profile.wechat && (
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-zinc-400" /> {candidate?.profile.wechat}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 sm:mt-0">
            {/* Admission Actions */}
            {isAdmitted ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-amber-900 font-mono text-xs font-bold border border-amber-300 bg-amber-100 px-3 py-1.5 rounded-[8px]">
                  <CheckCircle className="h-3.5 w-3.5 text-amber-600" />
                  已正式录取 · 微信群已开放
                </span>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                  className="rounded-[8px] bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 text-xs font-mono text-zinc-500 hover:text-rose-600 hover:border-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
                  title="撤销录用"
                >
                  {actionLoading === 'reject' ? '撤销中...' : '设为未录用'}
                </button>
              </div>
            ) : isRejected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-rose-700 font-mono text-xs font-bold border border-rose-200 bg-rose-50 px-3 py-1.5 rounded-[8px]">
                  <UserX className="h-3.5 w-3.5" />
                  未予录用
                </span>
                <button
                  onClick={handleAdmit}
                  disabled={actionLoading !== null}
                  className="rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {actionLoading === 'admit' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>处理中...</span>
                    </>
                  ) : (
                    '改为正式录取并开放群码'
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdmit}
                  disabled={actionLoading !== null}
                  className="rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer shadow-xs"
                >
                  {actionLoading === 'admit' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>正在开放群码...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>正式录取并开放群码</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                  className="rounded-[8px] bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 text-xs font-mono text-zinc-500 hover:text-rose-600 hover:border-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === 'reject' ? '提交中...' : '未予录用'}
                </button>
              </div>
            )}

            {confirmDelete ? (
              <div className="flex items-center gap-1.5 border border-rose-300 bg-rose-50 px-2.5 py-1 rounded-[8px] ml-2">
                <span className="text-[11px] font-mono text-rose-700 font-bold">确定删除该档案？</span>
                <button
                  type="button"
                  onClick={handleDeleteCandidate}
                  disabled={actionLoading === 'delete'}
                  className="px-2 py-0.5 rounded-[6px] bg-rose-600 hover:bg-rose-700 text-white font-mono text-[10px] font-bold cursor-pointer disabled:opacity-60"
                >
                  {actionLoading === 'delete' ? '删除中...' : '确认删除'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-0.5 rounded-[6px] bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-mono text-[10px] cursor-pointer"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="彻底删除此候选人记录"
                className="rounded-[8px] p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors ml-1 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="关闭候选人档案"
              className="rounded-[8px] p-2 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 transition-colors ml-1 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Action Notice Banner */}
        {actionNotice && (
          <div
            className={`px-6 py-2.5 font-mono text-xs flex items-center justify-between border-b ${
              actionNotice.type === 'success'
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">{actionNotice.type === 'success' ? '✓' : '✕'}</span>
              <span>{actionNotice.text}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-zinc-400 hover:text-zinc-800 text-xs ml-4 cursor-pointer font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Headers */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 px-6 font-mono text-xs uppercase tracking-wider">
          <button
            onClick={() => setActiveTab('report')}
            aria-pressed={activeTab === 'report'}
            className={`flex items-center gap-2 border-b-2 py-3 px-4 transition-all font-mono text-xs font-bold uppercase tracking-wider ${
              activeTab === 'report'
                ? 'border-amber-500 text-zinc-900 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>AI 初筛评估画像</span>
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            aria-pressed={activeTab === 'transcript'}
            className={`flex items-center gap-2 border-b-2 py-3 px-4 transition-all font-mono text-xs font-bold uppercase tracking-wider ${
              activeTab === 'transcript'
                ? 'border-amber-500 text-zinc-900 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
            <span>问答实录 ({interview?.messages.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            aria-pressed={activeTab === 'history'}
            className={`flex items-center gap-2 border-b-2 py-3 px-4 transition-all font-mono text-xs font-bold uppercase tracking-wider ${
              activeTab === 'history'
                ? 'border-amber-500 text-zinc-900 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <History className="h-3.5 w-3.5 text-amber-500" />
            <span>管理备忘与流转 ({data?.statusHistory.length || 0})</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div role="status" aria-live="polite" className="flex h-64 items-center justify-center font-mono text-xs text-zinc-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EAB308] border-t-transparent mr-2" />
              正在加载候选人档案...
            </div>
          ) : activeTab === 'report' ? (
            /* TAB 1: AI PORTRAIT & EVALUATION REPORT */
            <div className="space-y-6">
              <div className="rounded-[8px] border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
                AI 报告用于整理面试线索，所有候选人均由管理员人工审核。AI 等级不会自动决定录用或淘汰。
              </div>
              {evaluation ? (
                <>
                  {/* Top Score & Persona Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Score Card */}
                    <div className="rounded-[12px] border border-amber-200 bg-amber-50/50 p-5 flex flex-col justify-between relative overflow-hidden shadow-xs">
                      <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl font-mono select-none font-black text-amber-900">
                        {evaluation.recommendation}
                      </div>
                      <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                        <span>AI 初筛参考分</span>
                        <Award className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="mt-1 inline-flex w-fit rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                        {evaluation.evaluationSource === 'heuristic'
                          ? '规则评分 · 语义能力有限'
                          : evaluation.evaluationSource === 'llm'
                          ? 'AI 结构化评估'
                          : '历史报告 · 评估方式未记录'}
                      </span>
                      <div className="my-3 flex items-baseline gap-2">
                        <span className="font-mono text-5xl font-extrabold text-zinc-900">
                          {evaluation.overallScore}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">/ 100 PTS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">报告标签:</span>
                        <span className="text-xs font-mono font-bold text-amber-800">
                          {evaluation.candidateType || '高潜力自驱型'}
                        </span>
                      </div>
                    </div>

                    {/* Radar Chart */}
                    <div className="rounded-[12px] border border-zinc-200 bg-white p-4 flex flex-col items-center justify-center min-h-[220px] shadow-xs">
                      <span className="self-start font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-semibold">
                        六个初筛维度参考分
                      </span>
                      <div className="w-full h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={candidateRadarData}>
                            <PolarGrid stroke="#E4E4E7" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717A', fontSize: 10 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar
                              name="AI 参考分"
                              dataKey="candidateScore"
                              stroke="#EAB308"
                              fill="#FACC15"
                              fillOpacity={0.4}
                            />
                            <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E4E4E7', borderRadius: 8, fontSize: 11 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Highlights & Weaknesses */}
                    <div className="rounded-[12px] border border-zinc-200 bg-white p-5 space-y-4 flex flex-col justify-between shadow-xs">
                      <div>
                        <div className="text-[10px] font-mono text-amber-800 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-amber-600" />
                          <span>回答中提到的线索</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-zinc-700 font-mono">
                          {(evaluation.strengths || (evaluation as any).highlights || []).map((h: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-amber-600 font-bold">›</span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {((evaluation.risks && evaluation.risks.length > 0) || ((evaluation as any).weaknesses && (evaluation as any).weaknesses.length > 0)) && (
                        <div className="pt-3 border-t border-zinc-100">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold mb-1.5">
                            待核实信息 / 培养关注点
                          </div>
                          <ul className="space-y-1 text-xs text-zinc-500 font-mono">
                            {(evaluation.risks || (evaluation as any).weaknesses || []).map((w: string, i: number) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-zinc-300">•</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary & Suggestions */}
                  <div className="rounded-[12px] border border-zinc-200 bg-zinc-50/70 p-5 space-y-3 font-sans shadow-xs">
                    <div>
                      <h4 className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        AI 初筛摘要
                      </h4>
                      <p className="mt-1 text-xs text-zinc-700 leading-relaxed font-mono">
                        {evaluation.summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-200/60">
                      <h4 className="font-mono text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                        人工复核提示
                      </h4>
                      <p className="mt-1 text-xs text-zinc-700 leading-relaxed font-mono">
                        {evaluation.recommendationReason}
                      </p>
                    </div>

                    {evaluation.templateAnalysis && (
                      <div className="pt-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        回答证据提示: {evaluation.templateAnalysis}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center font-mono text-xs text-zinc-400 uppercase tracking-wider">
                  该候选人尚未完成 AI 初筛面试或报告正在生成中。
                </div>
              )}
            </div>
          ) : activeTab === 'transcript' ? (
            /* TAB 2: INTERVIEW TRANSCRIPT */
            <div className="space-y-4">
              <div className="flex items-center justify-between font-mono text-xs text-zinc-500 border-b border-zinc-200 pb-3">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold">完整 AI 初筛交互问答实录</span>
                <span className="text-[10px] uppercase tracking-wider">TOTAL {interview?.messages.length || 0} MESSAGES</span>
              </div>

              {interview?.messages && interview.messages.length > 0 ? (
                <div className="space-y-4">
                  {interview.messages.map((m, idx) => {
                    const isAI = m.sender === 'ai';
                    return (
                      <div
                        key={m.id || idx}
                        className={`rounded-[12px] border p-4 ${
                          isAI
                            ? 'border-amber-200 bg-amber-50/40'
                            : 'border-zinc-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-xs mb-1.5">
                          <span className={isAI ? 'text-amber-800 font-bold uppercase tracking-wider text-[11px]' : 'text-zinc-900 font-bold text-[11px]'}>
                            {isAI ? '技术部 AI 面试官' : `${candidate?.profile.name} (候选人)`}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            ROUND {m.round || 1} · {new Date(m.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed font-mono">
                          {m.content}
                        </p>

                        {m.analysis && (
                          <div className="mt-2.5 rounded-[8px] border border-amber-200/80 bg-white p-2.5 font-mono text-[10px] text-zinc-600">
                            <strong className="text-amber-700 font-bold uppercase mr-1">[AI 内部分析]</strong> {m.analysis}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center font-mono text-xs text-zinc-400 uppercase tracking-wider">
                  暂无对话记录
                </div>
              )}
            </div>
          ) : (
            /* TAB 3: INTERNAL NOTES & STATUS AUDIT TRAIL */
            <div className="space-y-6">
              {/* Add Note */}
              <form onSubmit={handleAddNote} className="rounded-[12px] border border-zinc-200 bg-zinc-50/80 p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 font-mono text-xs text-zinc-800 uppercase tracking-wider font-semibold">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span>添加管理员内部备忘</span>
                </div>
                <label htmlFor="candidate-internal-note" className="sr-only">管理员内部备忘</label>
                <textarea
                  id="candidate-internal-note"
                  rows={2}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="记录该同学的沟通细节、意向变动或技术帮带方向..."
                  className="w-full rounded-[8px] border border-zinc-200 bg-white p-3 text-xs font-mono text-zinc-800 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingNote || !noteContent.trim()}
                    className="rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 transition-colors disabled:opacity-50 shadow-xs"
                  >
                    保存备注
                  </button>
                </div>
              </form>

              {/* Notes List */}
              {data?.notes && data.notes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">历史管理备忘</h4>
                  {data.notes.map(note => (
                    <div key={note.id} className="rounded-[10px] border border-zinc-200 bg-white p-3 text-xs font-mono shadow-xs">
                      <div className="flex items-center justify-between text-zinc-400 text-[10px] mb-1 uppercase tracking-wider">
                        <span className="text-zinc-800 font-bold">{note.authorName}</span>
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-zinc-700 leading-relaxed font-sans">{note.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Status Audit Trail */}
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">状态全生命周期流转审计日志</h4>
                <div className="rounded-[12px] border border-zinc-200 bg-white p-4 space-y-3 font-mono text-xs shadow-xs">
                  {data?.statusHistory.map(h => (
                    <div key={h.id} className="flex items-start gap-3 border-l-2 border-amber-400 pl-3 py-1">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{h.fromStatus || 'INIT'}</span>
                          <ChevronRight className="h-3 w-3 text-zinc-400" />
                          <span className="font-bold text-amber-800">{h.toStatus}</span>
                        </div>
                        {h.comment && <div className="text-zinc-700 font-mono text-xs">{h.comment}</div>}
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          OPERATOR: {h.operator} · {new Date(h.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
