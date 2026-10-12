import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  Terminal,
  Check,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Candidate, WeChatGroupQR } from '../../types.js';
import { PgyMascot } from '../PgyMascot.js';

interface CandidateStatusViewProps {
  candidate: Candidate;
  onResumeInterview: () => void;
  onRefresh: () => void;
}

export const CandidateStatusView: React.FC<CandidateStatusViewProps> = ({
  candidate,
  onResumeInterview,
  onRefresh,
}) => {
  const [qrData, setQrData] = useState<{ authorized: boolean; qr: WeChatGroupQR | null; message: string } | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [confirmingJoin, setConfirmingJoin] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const status = candidate.status;

  const isAdmitted = [
    'ADMITTED',
    'MANUAL_PASSED',
    'QR_AVAILABLE',
    'GROUP_JOIN_PENDING',
    'GROUP_JOIN_CONFIRMED',
  ].includes(status);

  const isGroupConfirmed = status === 'GROUP_JOIN_CONFIRMED' || joinSuccess;
  const isRejected = status === 'MANUAL_REJECTED';

  // Fetch WeChat QR if authorized
  useEffect(() => {
    if (isAdmitted) {
      setLoadingQR(true);
      fetch(`/api/wechat-qr?candidateId=${candidate.id}`)
        .then(r => r.json())
        .then(data => {
          setQrData(data);
        })
        .catch(err => {
          console.error('Failed to load WeChat QR:', err);
        })
        .finally(() => setLoadingQR(false));
    }
  }, [candidate.id, status, isAdmitted]);

  const handleConfirmJoin = async () => {
    setConfirmingJoin(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/join-confirm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setJoinSuccess(true);
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 },
        });
        onRefresh();
      } else {
        setJoinError(data.error || '入群确认失败');
      }
    } catch (err: any) {
      setJoinError(err.message || '网络请求错误');
    } finally {
      setConfirmingJoin(false);
    }
  };

  // Download QR code image directly
  const handleDownloadQR = () => {
    if (!qrData?.qr?.imageUrl) return;
    try {
      const link = document.createElement('a');
      link.href = qrData.qr.imageUrl;
      // Determine file extension
      const isJpeg = qrData.qr.imageUrl.startsWith('data:image/jpeg');
      const isSvg = qrData.qr.imageUrl.includes('svg');
      const ext = isJpeg ? 'jpg' : isSvg ? 'svg' : 'png';
      link.download = `TECHSEED_技术部招新微信群_${candidate.profile.name || '新生'}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (e) {
      console.error('Download error:', e);
      // Fallback
      window.open(qrData.qr.imageUrl, '_blank');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 font-mono text-xs text-zinc-800">
      {/* Main Container Card */}
      <div className="rounded-[18px] border border-zinc-200 bg-white p-6 sm:p-8 shadow-md">
        {/* Candidate Profile Bar - Left-aligned Editorial with Mascot */}
        <div className="flex flex-wrap items-start justify-between border-b border-zinc-200 pb-6 gap-4">
          <div className="flex items-start gap-4">
            <PgyMascot size="md" variant="badge" className="shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 uppercase tracking-[0.18em]">
                <span>TECHSEED</span>
                <span>/</span>
                <span className="text-amber-700 font-bold">学生会技术部</span>
                <span>/</span>
                <span className="text-amber-600 font-bold">{candidate.profile.studentId}</span>
              </div>
              <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold text-zinc-950 tracking-tight">
                {candidate.profile.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-500 font-sans">
                <span>{candidate.profile.major}</span>
                <span className="text-zinc-300">·</span>
                <span>{candidate.profile.className}</span>
                <span className="text-zinc-300">·</span>
                <span className="text-amber-700 font-mono font-semibold">{candidate.profile.techDirection}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-mono font-medium text-zinc-600 hover:text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50 transition-all shadow-xs"
            >
              <RotateCcw className="h-3 w-3" />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* 3-Step Lifecycle Overview */}
        <div className="my-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            {/* Step 1 */}
            <div className="rounded-[14px] border border-amber-200 bg-amber-50/70 p-3.5 shadow-xs">
              <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px] text-amber-800">
                <span>01 报名登记</span>
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-1 text-[10px] text-zinc-500 tracking-wider">已提交基本信息</p>
            </div>

            {/* Step 2 */}
            <div
              className={`rounded-[14px] border p-3.5 transition-all shadow-xs ${
                ['AI_COMPLETED', 'AI_RECOMMENDED', 'ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED', 'MANUAL_REJECTED'].includes(status)
                  ? 'border-amber-200 bg-amber-50/70 text-amber-800'
                  : status === 'AI_INTERVIEWING'
                  ? 'border-amber-400 bg-amber-100/50 text-amber-900'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px]">
                <span>02 AI 初筛</span>
                {['AI_COMPLETED', 'AI_RECOMMENDED', 'ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED', 'MANUAL_REJECTED'].includes(status) ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <p className="mt-1 text-[10px] text-zinc-500 tracking-wider">
                {status === 'AI_INTERVIEWING'
                  ? '初筛进行中'
                  : ['AI_COMPLETED', 'AI_RECOMMENDED', 'ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED', 'MANUAL_REJECTED'].includes(status)
                  ? '初筛已完成'
                  : '待开启'}
              </p>
            </div>

            {/* Step 3 */}
            <div
              className={`rounded-[14px] border p-3.5 transition-all shadow-xs ${
                isAdmitted
                  ? 'border-amber-200 bg-amber-50/70 text-amber-800'
                  : isRejected
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-400'
                  : 'border-amber-200/60 bg-amber-50/30 text-amber-700'
              }`}
            >
              <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px]">
                <span>03 录用入群</span>
                {isAdmitted ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                ) : isRejected ? (
                  <span className="text-zinc-400 font-bold">✕</span>
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <p className="mt-1 text-[10px] text-zinc-500 tracking-wider">
                {isAdmitted
                  ? '已正式录取'
                  : isRejected
                  ? '未予录用'
                  : '审核评定中'}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Detail Card Based on Status */}

        {/* CASE 1: ADMITTED -> SHOW WECHAT GROUP QR CODE WITH DOWNLOAD */}
        {isAdmitted ? (
          <div className="rounded-[16px] border border-amber-200 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/20 p-6 sm:p-10 space-y-7 shadow-xs">
            {/* Clean Section Header with Mascot */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between border-b border-zinc-200 pb-6">
              <div className="space-y-1.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#EAB308] animate-pulse" />
                  <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-amber-700 uppercase">
                    OFFICIAL ADMISSION // 录用凭证
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-zinc-950 tracking-tight">
                  JOIN TECH DEPARTMENT
                </h3>
                <p className="text-xs text-zinc-600 font-sans leading-relaxed pt-1 max-w-xl">
                  恭喜你通过技术部初筛与综合评定，欢迎正式成为黎明职大信电学院学生会技术部的一员！请保存并加入官方招新群。
                </p>
              </div>
              <PgyMascot size="lg" variant="glow" className="shrink-0 self-center sm:self-auto" />
            </div>

            {/* QR Section with Clear Whitespace & Direct Download */}
            <div className="flex flex-col items-center justify-center pt-2 pb-4">
              {loadingQR ? (
                <div className="h-56 w-56 flex flex-col items-center justify-center rounded-[14px] border border-zinc-200 bg-zinc-50">
                  <div className="h-5 w-5 border-2 border-zinc-200 border-t-amber-500 rounded-full animate-spin mb-3" />
                  <span className="text-zinc-500 text-xs">加载微信群二维码...</span>
                </div>
              ) : qrData?.qr?.imageUrl ? (
                <div className="flex flex-col items-center space-y-4">
                  {/* Clean QR frame with generous whitespace */}
                  <div className="p-4 bg-white rounded-[14px] border border-zinc-200 shadow-md transition-transform hover:scale-[1.01]">
                    <img
                      src={qrData.qr.imageUrl}
                      alt="信电技术部招新群二维码"
                      className="h-52 w-52 sm:h-56 sm:w-56 object-contain rounded-[6px]"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* QR Title & Advice */}
                  <div className="text-center max-w-sm">
                    <p className="text-xs font-bold text-amber-800 font-mono tracking-wide">
                      {qrData.qr.title || '信电学院技术部 · 2026 招新官方微信群'}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono mt-1 leading-relaxed">
                      进群后请将群昵称修改为：<span className="text-zinc-800 font-medium">专业班级-姓名</span>（如：物联网2601-张三）
                    </p>
                  </div>

                  {/* Download Action Controls */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      id="btn-download-qr-image"
                      onClick={handleDownloadQR}
                      className="flex items-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-5 py-2.5 text-xs font-mono font-bold tracking-wider transition-colors shadow-xs"
                    >
                      <Download className="h-4 w-4 text-zinc-950" />
                      <span>{downloadSuccess ? '已触发下载' : '保存 / 下载群二维码'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-56 w-56 flex flex-col items-center justify-center rounded-[14px] border border-zinc-200 bg-zinc-50 p-4 text-center">
                  <QrCode className="h-10 w-10 text-zinc-300 mb-2" />
                  <span className="text-zinc-500 text-xs leading-relaxed">
                    群二维码正在配置中，请联系技术部学长学姐
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Join Button */}
            <div className="border-t border-zinc-200 pt-6 text-center space-y-3">
              {joinError && (
                <div className="p-2.5 rounded-[10px] border border-rose-200 bg-rose-50 text-rose-700 font-mono text-xs">
                  {joinError}
                </div>
              )}
              {isGroupConfirmed ? (
                <div className="inline-flex items-center gap-2 rounded-[10px] border border-amber-300 bg-amber-100 px-6 py-2.5 font-mono text-xs font-bold text-amber-900 shadow-xs">
                  <Check className="h-4 w-4" />
                  <span>已确认加入技术部招新微信群</span>
                </div>
              ) : (
                <button
                  onClick={handleConfirmJoin}
                  disabled={confirmingJoin}
                  className="rounded-[10px] border border-zinc-300 bg-white text-zinc-800 px-6 py-2.5 font-mono text-xs font-semibold tracking-wider hover:border-amber-400 hover:text-amber-800 hover:bg-zinc-50 transition-all disabled:opacity-50 shadow-xs"
                >
                  {confirmingJoin ? '正在确认...' : '我已完成扫码进群'}
                </button>
              )}
            </div>
          </div>
        ) : isRejected ? (
          /* CASE 2: REJECTED */
          <div className="rounded-[16px] border border-zinc-200 bg-zinc-50 p-8 text-left space-y-3 shadow-xs">
            <h3 className="text-base font-bold text-zinc-800 font-mono uppercase tracking-wider">
              感谢你的积极参与
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-lg">
              本次招新名额有限，虽然本次暂未录用，但你在面试中展现的技术热情令我们印象深刻。技术部后续主办的开源分享会、公开技术沙龙均面向全院开放，期待与你共同交流成长！
            </p>
          </div>
        ) : status === 'REGISTERED' || status === 'AI_INTERVIEWING' ? (
          /* CASE 3: INTERVIEW IN PROGRESS OR READY */
          <div className="rounded-[16px] border border-amber-200 bg-amber-50/50 p-8 text-left space-y-4 shadow-xs">
            <div className="inline-flex items-center gap-2 rounded-[8px] border border-amber-300 bg-amber-100/70 px-3 py-1 text-[11px] font-mono text-amber-900">
              <Terminal className="h-3 w-3" />
              <span>AI 初筛面试就绪</span>
            </div>
            <h3 className="text-xl font-bold text-zinc-950 tracking-tight">
              {status === 'REGISTERED' ? '报名已登记，请进入 AI 初筛面试' : '你此前退出了初筛，可随时恢复作答'}
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
              共 4-5 道交互式提问，重点考察你真实的解决问题思路与自学探索潜力，无须死记硬背概念。
            </p>
            <div className="pt-2">
              <button
                onClick={onResumeInterview}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
              >
                <span>{status === 'REGISTERED' ? '开始 AI 初筛面试' : '继续作答'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* CASE 4: AI COMPLETED / EVALUATING */
          <div className="rounded-[16px] border border-zinc-200 bg-zinc-50 p-8 text-left space-y-3 shadow-xs">
            <div className="inline-flex items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-mono text-amber-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>AI 初筛已完成</span>
            </div>
            <h3 className="text-lg font-bold text-zinc-950 tracking-tight">
              初筛答卷已归档，技术部正在进行综合审核
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-lg">
              技术部管理员将结合你的报名初衷与 AI 初筛报告进行审核，录取结果与招新微信群二维码将第一时间同步于此页面。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
