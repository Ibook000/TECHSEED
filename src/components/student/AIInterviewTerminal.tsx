import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, User, Clock, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Candidate, InterviewSession } from '../../types.js';
import { PgyMascot } from '../PgyMascot.js';

interface AIInterviewTerminalProps {
  candidate: Candidate;
  interview: InterviewSession;
  onSubmitAnswer: (answer: string) => Promise<void>;
  onCompleteInterview: () => Promise<void>;
  isLoading: boolean;
}

export const AIInterviewTerminal: React.FC<AIInterviewTerminalProps> = ({
  candidate,
  interview,
  onSubmitAnswer,
  onCompleteInterview,
  isLoading,
}) => {
  const [inputText, setInputText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [interview.messages, isLoading]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText;
    setInputText('');
    setSubmitError(null);
    try {
      await onSubmitAnswer(text);
    } catch (error) {
      setInputText(current => current || text);
      setSubmitError(error instanceof Error ? error.message : '提交失败，请稍后重试');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isCompleted = interview.status === 'COMPLETED';
  const progressPercent = Math.min(100, Math.round((interview.currentRound / interview.maxRounds) * 100));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 font-mono text-xs text-zinc-800">
      {/* Terminal Container */}
      <div className="rounded-[18px] border border-zinc-200 bg-white shadow-md overflow-hidden">
        {/* Terminal Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-3 gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#EAB308]" />
            </div>
            <div className="h-3.5 w-[1px] bg-zinc-200" />
            <div className="flex items-center gap-2.5">
              <PgyMascot size="xs" variant="badge" className="shrink-0" />
              <span className="font-mono text-xs font-bold tracking-wider text-zinc-900">
                技术部 AI 初筛 // {candidate.profile.name} ({candidate.profile.studentId})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 sm:mt-0 font-mono text-[11px] tracking-wider">
            <span className="rounded-[6px] border border-zinc-200 bg-white px-2.5 py-1 text-zinc-600 shadow-xs">
              方向: <strong className="text-zinc-900">{candidate.profile.techDirection}</strong>
            </span>
            <div className="flex items-center gap-1.5 text-amber-600 font-bold">
              <Clock className="h-3 w-3" />
              <span>ROUND {interview.currentRound} / {interview.maxRounds}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-zinc-100">
          <div
            className="h-full bg-[#EAB308] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Messages Stream */}
        <div className="min-h-[440px] max-h-[580px] overflow-y-auto p-5 sm:p-6 space-y-6 bg-white">
          {/* Welcome Banner */}
          <div className="rounded-[14px] border border-amber-200/80 bg-amber-50/60 p-4 font-mono text-xs text-zinc-700 leading-relaxed shadow-xs">
            <div className="flex items-start gap-3">
              <PgyMascot size="sm" variant="badge" className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-bold uppercase tracking-wider text-[11px]">
                  <span>学生会技术部 AI 初筛交互核心已连接</span>
                  <span className="text-amber-300">|</span>
                  <span className="text-amber-600 text-[10px]">信电学生会技术部</span>
                </div>
                <p className="font-sans text-xs text-zinc-600">
                  请放松心态，把这次初筛当成与技术部学长学姐的技术漫谈。系统会围绕你的自述和技术方向展开追问，没有标准答案，关注你的自学实践与排查思路。
                </p>
              </div>
            </div>
          </div>

          {interview.messages.map((msg, idx) => {
            const isAI = msg.sender === 'ai';
            return (
              <div
                key={msg.id || idx}
                className={`flex gap-3 sm:gap-4 ${isAI ? 'items-start' : 'items-start flex-row-reverse'}`}
              >
                {/* Avatar (PGY Mascot for AI, User Icon for Candidate) */}
                {isAI ? (
                  <PgyMascot size="xs" variant="badge" className="shrink-0 mt-0.5" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-amber-300 bg-amber-100/70 text-amber-900 shadow-xs">
                    <User className="h-4 w-4" />
                  </div>
                )}

                {/* Message Bubble */}
                <div className={`max-w-[85%] space-y-1.5 ${isAI ? 'text-left' : 'text-right'}`}>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 tracking-wider">
                    <span className="font-semibold text-zinc-700">{isAI ? '技术部 AI 初筛助手' : candidate.profile.name}</span>
                    {msg.round && <span>· ROUND {msg.round}</span>}
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div
                    className={`rounded-[14px] px-4 py-3 text-xs font-sans leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere border shadow-xs ${
                      isAI
                        ? 'border-zinc-200 bg-zinc-50 text-zinc-800'
                        : 'border-amber-300 bg-[#FACC15] text-zinc-950 font-medium text-left'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}

          {/* AI Typing indicator */}
          {isLoading && (
            <div className="flex gap-3 sm:gap-4 items-start">
              <PgyMascot size="xs" variant="badge" className="animate-pulse shrink-0 mt-0.5" />
              <div className="rounded-[14px] border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 font-mono flex items-center gap-2 shadow-xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#EAB308]" />
                <span className="tracking-wider">AI 正在分析上一轮作答，生成深度追问...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar / Completion View */}
        <div className="border-t border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
          {isCompleted ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[12px] border border-amber-200 bg-amber-50/80 p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">AI 初筛作答已圆满提交</h4>
                  <p className="text-[11px] text-zinc-600 mt-0.5 font-sans">
                    已生成初筛画像并汇总至技术部后台，请留意学号查询通知。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  disabled={isLoading}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    setSubmitError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder="具体描述你的思考过程、动手排查细节或实际经验... (Enter 发送，Shift + Enter 换行)"
                  className="w-full resize-none rounded-[12px] border border-zinc-200 bg-white p-3.5 text-xs font-sans text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none disabled:opacity-50 shadow-xs"
                />

                {submitError && (
                  <p role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{submitError} 你的回答仍保留在输入框中，可以重试。</span>
                  </p>
                )}

                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  <button
                    id="interview-send-btn"
                    onClick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    className="flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-4 py-1.5 text-xs font-mono font-bold tracking-wider disabled:opacity-30 transition-colors shadow-xs"
                  >
                    <Send className="h-3 w-3" />
                    发送回答
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 font-mono tracking-wider">
                <span>提示：真诚具体地描述真实细节，多讲遇到的困难与排障思考</span>
                {interview.currentRound >= 4 && (
                  <button
                    onClick={onCompleteInterview}
                    disabled={isLoading}
                    className="text-amber-600 hover:underline font-bold"
                  >
                    内容已充分表达？可点击提前完成初筛
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
