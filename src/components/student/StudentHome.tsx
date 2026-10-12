import React from 'react';
import {
  Terminal,
  Code2,
  Cpu,
  Database,
  Palette,
  Bot,
  ShieldCheck,
  ArrowRight,
  Search,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { TechDirection } from '../../types.js';

interface StudentHomeProps {
  onStartRegistration: () => void;
  onCheckStatus: () => void;
  onResumeInterview?: () => void;
  hasActiveSession?: boolean;
}

const TECH_DIRECTIONS: Array<{ name: TechDirection; icon: any; tag: string; desc: string }> = [
  { name: 'Web 前端', icon: Code2, tag: 'UI / CLIENT', desc: '现代化应用界面与交互开发，深入 React、TypeScript 与前端工程化实践。' },
  { name: '后端', icon: Database, tag: 'CORE ENGINE', desc: '高性能服务端架构、微服务设计、数据库调优与高并发链路处理。' },
  { name: 'AI', icon: Bot, tag: 'MODELS & AGENT', desc: '大模型落地应用、Agent 自动化工作流、知识库 RAG 与工程化结合。' },
  { name: '算法', icon: Terminal, tag: 'ACM / LOGIC', desc: '图论、动态规划与数据结构攻坚，面向 ICPC / 蓝桥杯程序设计竞赛。' },
  { name: '嵌入式', icon: Cpu, tag: 'HARDWARE / RTOS', desc: '软硬件结合，玩转 STM32、ESP32、FreeRTOS 与各类传感器物联网应用。' },
  { name: '硬件', icon: Cpu, tag: 'PCB & CIRCUITS', desc: '原理图设计、PCB 制板打样、元器件焊接与智能硬件原型系统搭建。' },
  { name: 'UI / UX', icon: Palette, tag: 'DESIGN SYSTEM', desc: '建立数字产品规范与设计语言，雕琢克制高级的交互排版与体验细节。' },
  { name: '产品', icon: ShieldCheck, tag: 'PRODUCT SPEC', desc: '挖掘真实校园场景需求，梳理功能原型、版本迭代与用户闭环交付。' },
];

export const StudentHome: React.FC<StudentHomeProps> = ({
  onStartRegistration,
  onCheckStatus,
  onResumeInterview,
  hasActiveSession,
}) => {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#FAFAFA] tech-grid-bg text-zinc-900 selection:bg-amber-100 selection:text-amber-900">
      {/* Top subtle warm golden ambient glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[300px] bg-amber-300/[0.08] blur-[120px] rounded-full pointer-events-none" />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {/* Left-Aligned Editorial Hero Section */}
        <div className="max-w-3xl space-y-6">
          {/* Status Label */}
          <div className="inline-flex items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50/70 px-3.5 py-1.5 font-mono text-[11px] text-zinc-800">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308] animate-pulse" />
            <span className="font-bold text-zinc-900 tracking-wider">TECHSEED 2026</span>
            <span className="text-zinc-300">/</span>
            <span>学生会技术部招新</span>
          </div>

          {/* Hero Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-zinc-950 font-sans leading-[1.1]">
            发现真正<br />
            <span className="text-amber-600 font-black">热爱动手</span>的技术人。
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-zinc-600 font-sans leading-relaxed max-w-2xl">
            面向 xxxxx学院全体大一新生。啥也不会没关系，只要想学、积极、开朗的同学就可以！
          </p>

          {/* Key Metrics / Technical Data Grid */}
          <div className="pt-2 grid grid-cols-3 gap-4 border-y border-zinc-200 py-5 font-mono">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">08</div>
              <div className="text-[11px] text-zinc-400 uppercase tracking-widest mt-0.5">TRACKS 开设方向</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">10 MIN</div>
              <div className="text-[11px] text-zinc-400 uppercase tracking-widest mt-0.5">AI 初筛交流时长</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-amber-600 tracking-tight">0PEN</div>
              <div className="text-[11px] text-zinc-400 uppercase tracking-widest mt-0.5">零基础开放包容</div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
            {hasActiveSession && onResumeInterview ? (
              <button
                id="hero-btn-resume-interview"
                onClick={onResumeInterview}
                className="flex items-center justify-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-7 py-3.5 text-xs font-mono font-bold tracking-wider transition-colors shadow-xs"
              >
                <Terminal className="h-4 w-4" />
                <span>继续当前作答 / 查看进度</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                id="hero-btn-start-registration"
                onClick={onStartRegistration}
                className="flex items-center justify-center gap-2 rounded-[10px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-7 py-3.5 text-xs font-mono font-bold tracking-wider transition-colors shadow-xs"
              >
                <span>立即填写报名与初筛</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            <button
              id="hero-btn-check-status"
              onClick={onCheckStatus}
              className="flex items-center justify-center gap-2 rounded-[10px] border border-zinc-300 bg-white px-6 py-3.5 text-xs font-mono font-semibold tracking-wider text-zinc-700 hover:text-zinc-950 hover:border-zinc-400 hover:bg-zinc-50 transition-all shadow-xs"
            >
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <span>学号查询录取结果</span>
            </button>
          </div>
        </div>

        {/* 4-Step Clean Pipeline Section */}
        <div className="mt-20">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 mb-4">
            <span>PIPELINE</span>
            <span>//</span>
            <span>招新全流程</span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <div id="pipeline-step-1" className="rounded-[14px] border border-zinc-200 bg-white p-5 space-y-2 hover:border-amber-300/80 hover:shadow-xs transition-all shadow-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-xs font-bold text-amber-600">01</span>
                <span className="text-[10px] text-zinc-400 tracking-wider">STEP 01</span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">填写报名</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-sans pt-0.5">
                基本信息 + 技术方向
              </p>
            </div>

            <div id="pipeline-step-2" className="rounded-[14px] border border-zinc-200 bg-white p-5 space-y-2 hover:border-amber-300/80 hover:shadow-xs transition-all shadow-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-xs font-bold text-amber-600">02</span>
                <span className="text-[10px] text-zinc-400 tracking-wider">STEP 02</span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">AI 初筛</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-sans pt-0.5">
                动态对话式面试
              </p>
            </div>

            <div id="pipeline-step-3" className="rounded-[14px] border border-zinc-200 bg-white p-5 space-y-2 hover:border-amber-300/80 hover:shadow-xs transition-all shadow-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-xs font-bold text-amber-600">03</span>
                <span className="text-[10px] text-zinc-400 tracking-wider">STEP 03</span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">技术部决定</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-sans pt-0.5">
                AI 报告 + 录取决定
              </p>
            </div>

            <div id="pipeline-step-4" className="rounded-[14px] border border-zinc-200 bg-white p-5 space-y-2 hover:border-amber-300/80 hover:shadow-xs transition-all shadow-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-xs font-bold text-amber-600">04</span>
                <span className="text-[10px] text-zinc-400 tracking-wider">STEP 04</span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">加入团队</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-sans pt-0.5">
                扫码入群 · 开始旅程
              </p>
            </div>
          </div>
        </div>

        {/* Tracks Grid Section */}
        <div className="mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-4 mb-6">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">TRACKS</div>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight mt-1">技术方向</h2>
            </div>
            <span className="font-mono text-xs text-zinc-500">涵盖应用研发、算法逻辑、智能硬件与产品工学</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TECH_DIRECTIONS.map(td => {
              const Icon = td.icon;
              return (
                <div
                  key={td.name}
                  className="rounded-[16px] border border-zinc-200 bg-white p-5 hover:border-amber-300 hover:shadow-md transition-all group shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">{td.tag}</span>
                    <div className="h-7 w-7 rounded-[8px] bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 group-hover:bg-[#FACC15] group-hover:text-zinc-950 transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <h3 className="font-bold text-sm text-zinc-900 tracking-tight mt-3">{td.name}</h3>
                  <p className="mt-2 text-xs text-zinc-500 leading-relaxed font-sans line-clamp-2">
                    {td.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
