import React, { useEffect, useState } from 'react';
import { X, Sparkles, AlertCircle, Check } from 'lucide-react';
import { CandidateProfile, TechnicalFoundation, TechDirection, REGISTRATION_CONSENT_VERSION } from '../../types.js';
import { PgyMascot } from '../PgyMascot.js';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: CandidateProfile, privacyConsentVersion: string) => Promise<void>;
}

const FOUNDATIONS: TechnicalFoundation[] = [
  '完全没有',
  '了解一点',
  '有基础',
  '可以独立写简单程序',
  '有项目经验',
];

const DIRECTIONS: TechDirection[] = [
  'Web 前端',
  '后端',
  'AI',
  '算法',
  '嵌入式',
  '硬件',
  'UI / UX',
  '产品',
  '暂时不确定',
];

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [major, setMajor] = useState('');
  const [className, setClassName] = useState('');
  const [phone, setPhone] = useState('');
  const [wechat, setWechat] = useState('');
  const [technicalFoundation, setTechnicalFoundation] = useState<TechnicalFoundation>('了解一点');
  const [techDirection, setTechDirection] = useState<TechDirection>('后端');
  const [selfIntro, setSelfIntro] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setPrivacyAcknowledged(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !studentId.trim() || !phone.trim()) {
      setError('请填写姓名、学号和手机联系方式');
      return;
    }

    if (!selfIntro.trim() || selfIntro.trim().length < 8) {
      setError('请在自我介绍中多写两句你折腾过的小事或为什么对技术感兴趣（至少8个字）');
      return;
    }

    if (!privacyAcknowledged) {
      setError('请先阅读并确认报名信息使用说明');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await onSubmit({
        name: name.trim(),
        studentId: studentId.trim(),
        major: major.trim(),
        className: className.trim(),
        phone: phone.trim(),
        wechat: wechat.trim() || phone.trim(),
        technicalFoundation,
        techDirection,
        selfIntro: selfIntro.trim(),
      }, REGISTRATION_CONSENT_VERSION);
      onClose();
    } catch (err: any) {
      setError(err.message || '提交失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start sm:items-center p-2.5 sm:p-4 bg-zinc-900/40 backdrop-blur-xs overflow-y-auto overflow-x-hidden font-mono text-xs overscroll-contain">
      <div className="relative w-full max-w-full sm:max-w-2xl rounded-[18px] border border-zinc-200 bg-white p-4 sm:p-8 shadow-2xl my-auto sm:my-8 text-zinc-800 flex flex-col max-h-[96dvh] sm:max-h-[92vh] overflow-hidden">
        {/* Header — close button is a flex item (not absolute) so it can never overlap the title */}
        <div className="shrink-0 flex items-start gap-2 sm:gap-3 pb-3 border-b border-zinc-100">
          <PgyMascot size="md" variant="badge" className="shrink-0 mt-0.5 scale-90 sm:scale-100 origin-top-left" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-2 font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-amber-700">
              <span>TECHSEED 2026</span>
              <span>/</span>
              <span className="text-amber-600">学生会技术部</span>
            </div>
            <h2 className="mt-1 text-base sm:text-xl font-bold text-zinc-950 tracking-tight break-words">
              填写基本信息 · 开启初筛
            </h2>
            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-zinc-600 font-sans leading-relaxed break-words">
              真实表达即可，xxxxx学院学生会技术部看重自学排障与动手热情，零基础同学完全不影响录用。
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

        {error && (
          <div className="mt-2.5 shrink-0 flex items-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 p-2.5 sm:p-3 text-xs font-mono text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col flex-1 min-h-0">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto space-y-3.5 sm:space-y-4 pr-1 sm:pr-2 overscroll-contain">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">姓名 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="请输入真实姓名"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">学号 *</label>
                <input
                  type="text"
                  required
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder="请输入本人真实学号"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">专业 *</label>
                <input
                  id="input-student-major"
                  type="text"
                  required
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  placeholder="请输入所学专业"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">班级 *</label>
                <input
                  id="input-student-class"
                  type="text"
                  required
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="例如：软件1 / 软件2"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">手机联系方式 *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="13800000000"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">微信号 (方便后续联系)</label>
                <input
                  type="text"
                  value={wechat}
                  onChange={e => setWechat(e.target.value)}
                  placeholder="例如：wxid_xxx"
                  className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            {/* Technical Foundation */}
            <div>
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">当前技术基础</label>
                <span className="text-[10px] text-amber-700 font-mono">「完全没有」不作为减分项</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                {FOUNDATIONS.map(f => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setTechnicalFoundation(f)}
                    className={`rounded-[8px] border px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-mono tracking-wider transition-all text-center shadow-xs ${
                      technicalFoundation === f
                        ? 'border-amber-400 bg-amber-100/80 text-amber-950 font-bold'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Tech Direction Interest */}
            <div>
              <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">期望加入的技术方向</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:gap-2">
                {DIRECTIONS.map(d => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setTechDirection(d)}
                    className={`rounded-[8px] border px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-mono tracking-wider transition-all shadow-xs ${
                      techDirection === d
                        ? 'border-amber-400 bg-[#FACC15] text-zinc-950 font-bold'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Self Intro */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] text-zinc-600 font-medium tracking-wider">个人自我介绍 *</label>
                <span className="text-[10px] text-zinc-400 font-mono">{selfIntro.length} 字</span>
              </div>
              <textarea
                required
                rows={3}
                value={selfIntro}
                onChange={e => setSelfIntro(e.target.value)}
                placeholder="聊聊你平时的兴趣爱好、动手折腾过的小事、或是为什么想要加入技术部？（AI 初筛将围绕你的介绍展开针对性交流）"
                className="mt-1.5 w-full rounded-[10px] border border-zinc-200 bg-zinc-50/60 p-2.5 sm:p-3 text-xs font-sans text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 focus:outline-none shadow-xs"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50/70 p-3 font-sans text-[11px] leading-relaxed text-zinc-700">
              <input
                type="checkbox"
                required
                checked={privacyAcknowledged}
                onChange={e => setPrivacyAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
              />
              <span>
                <strong className="text-zinc-900">报名信息使用说明：</strong>
                为完成本次招新，系统会保存你提交的个人信息和 AI 面试问答，用于招新审核与联系；若管理员配置外部 AI 服务，面试内容会发送给所配置的服务商处理。请勿提交与报名无关的敏感信息。
                <span className="mt-1 block font-medium">我已阅读并知悉以上信息。</span>
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="shrink-0 mt-3 pt-3 flex items-center justify-end gap-2.5 sm:gap-3 border-t border-zinc-200 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-zinc-200 px-3.5 py-2 sm:px-4 sm:py-2 text-xs font-mono tracking-wider text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-xs"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-4 py-2 sm:px-6 sm:py-2.5 text-xs font-mono font-bold tracking-wider disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading ? (
                <>正在提交...</>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  提交并进入 AI 初筛
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
