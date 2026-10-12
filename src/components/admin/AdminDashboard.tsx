import React from 'react';
import {
  Users,
  CheckCircle,
  Clock,
  TrendingUp,
  UserCheck,
  UserX,
  QrCode,
  Award,
  Filter,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { DashboardStats } from '../../types.js';

interface AdminDashboardProps {
  stats: DashboardStats;
  onFilterPreset?: (preset: string) => void;
  onNavigateToStudent?: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  S: '#EAB308', // warm dandelion gold
  A: '#10b981', // emerald-500
  B: '#3b82f6', // blue-500
  C: '#9ca3af', // zinc-400
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  stats,
  onFilterPreset,
  onNavigateToStudent,
}) => {
  // Format capability data for RadarChart
  const radarData = [
    { subject: '学习能力', score: stats.capabilityAverages.learning, fullMark: 100 },
    { subject: '探索主动性', score: stats.capabilityAverages.initiative, fullMark: 100 },
    { subject: '逻辑思维', score: stats.capabilityAverages.logic, fullMark: 100 },
    { subject: '技术兴趣', score: stats.capabilityAverages.technology_interest, fullMark: 100 },
    { subject: '沟通表达', score: stats.capabilityAverages.communication, fullMark: 100 },
    { subject: '技术基础', score: stats.capabilityAverages.technical_foundation, fullMark: 100 },
  ];

  // Grade Distribution
  const gradeData = [
    { name: 'S 级 (高分)', count: stats.gradeDistribution.S, grade: 'S' },
    { name: 'A 级 (较高分)', count: stats.gradeDistribution.A, grade: 'A' },
    { name: 'B 级 (综合考量)', count: stats.gradeDistribution.B, grade: 'B' },
    { name: 'C 级 (需重点复核)', count: stats.gradeDistribution.C, grade: 'C' },
  ];

  // Funnel steps
  const funnelSteps = [
    { label: '新生报名', count: stats.totalRegistered },
    { label: 'AI 初筛完成', count: stats.aiCompleted },
    { label: 'AI 建议优先复核', count: stats.aiRecommended },
    { label: '正式录取', count: stats.admittedCount },
    { label: '已扫码入群', count: stats.groupJoinConfirmed },
  ];

  return (
    <div className="space-y-6">
      {/* Ready state guide banner */}
      {stats.totalRegistered === 0 && (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs text-zinc-700 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-pulse shrink-0" />
            <span>招新系统当前处于就绪状态（暂无候选人记录）。新生通过新生端登记并完成 AI 初筛后，数据将在此实时生成多维画像与能力图谱。</span>
          </div>
          {onNavigateToStudent && (
            <button
              onClick={onNavigateToStudent}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] px-3.5 py-1.5 text-xs font-bold text-zinc-950 transition-colors shrink-0 shadow-xs"
            >
              <span>查看新生端首页</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      {/* 7 Metrics Bento Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <div
          onClick={() => onFilterPreset?.('ALL')}
          className="cursor-pointer rounded-[12px] border border-zinc-200 bg-white p-3.5 transition-all hover:border-amber-400 hover:bg-amber-50/20 shadow-xs"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">报名总数</span>
            <Users className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-zinc-900">
            {stats.totalRegistered}
          </div>
        </div>

        <div className="rounded-[12px] border border-zinc-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">AI完成</span>
            <CheckCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-600">
            {stats.aiCompleted}
          </div>
        </div>

        <div
          onClick={() => onFilterPreset?.('AI_RECOMMENDED')}
          className="cursor-pointer rounded-[12px] border border-amber-200 bg-amber-50/40 p-3.5 transition-all hover:border-amber-400 hover:bg-amber-50/70 shadow-xs"
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="font-mono text-[10px] uppercase tracking-wider font-bold">AI建议复核</span>
            <Award className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-700">
            {stats.aiRecommended}
          </div>
        </div>

        <div
          onClick={() => onFilterPreset?.('ADMITTED')}
          className="cursor-pointer rounded-[12px] border border-amber-300 bg-amber-100/50 p-3.5 transition-all hover:border-amber-400 hover:bg-amber-100 shadow-xs"
        >
          <div className="flex items-center justify-between text-amber-800">
            <span className="font-mono text-[10px] uppercase tracking-wider font-bold">正式录取</span>
            <UserCheck className="h-3.5 w-3.5 text-amber-700" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-900">
            {stats.admittedCount}
          </div>
        </div>

        <div
          onClick={() => onFilterPreset?.('REJECTED')}
          className="cursor-pointer rounded-[12px] border border-zinc-200 bg-white p-3.5 transition-all hover:border-zinc-300 hover:bg-zinc-50 shadow-xs"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">未予录用</span>
            <UserX className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-zinc-400">
            {stats.rejectedCount || stats.manualRejected || 0}
          </div>
        </div>

        <div
          onClick={() => onFilterPreset?.('GROUP_CONFIRMED')}
          className="cursor-pointer rounded-[12px] border border-zinc-200 bg-white p-3.5 transition-all hover:border-amber-400 hover:bg-amber-50/20 shadow-xs"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">已入微信群</span>
            <QrCode className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-700">
            {stats.groupJoinConfirmed}
          </div>
        </div>

        <div className="rounded-[12px] border border-zinc-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">入群确认率</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-zinc-900">
            {stats.groupJoinRate}%
          </div>
        </div>
      </div>

      {/* Visual Recruitment Funnel */}
      <div className="rounded-[14px] border border-zinc-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 pb-4 gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] text-zinc-500 uppercase tracking-[0.2em] font-mono font-bold">
              Recruitment Funnel · 招新全链路流转
            </h2>
          </div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
            AI SCREENING ➜ HUMAN INTERVIEW ➜ QR ONBOARDING ➜ FINAL ADMISSION
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {funnelSteps.map((step, idx) => {
            const prevCount = idx > 0 ? funnelSteps[idx - 1].count : step.count;
            const convRate = prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 0;
            const isHighlighted = step.label === 'AI 建议优先复核' || step.label === '正式录取';
            return (
              <div
                key={step.label}
                className={`relative rounded-[10px] border p-3 font-mono transition-colors shadow-xs ${
                  isHighlighted
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-zinc-200 bg-zinc-50/60'
                }`}
              >
                <div className="flex justify-between items-center text-[10px] text-zinc-500 uppercase font-semibold">
                  <span>{step.label}</span>
                </div>
                <div className={`mt-2 text-xl font-bold ${isHighlighted ? 'text-amber-800' : 'text-zinc-900'}`}>
                  {step.count}
                </div>
                {idx > 0 && (
                  <div className="mt-1 text-[10px] text-amber-700 font-mono font-medium">
                    转化率 {convRate}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Charts: Capability Radar & Grade Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Radar Chart */}
        <div className="rounded-[14px] border border-zinc-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <h2 className="text-[11px] text-zinc-500 uppercase tracking-[0.2em] font-mono font-bold">
              Capability Matrix · 六维能力群体画像
            </h2>
            <span className="font-mono text-[10px] text-zinc-400 uppercase">大一新生样本</span>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="#e4e4e7" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#d4d4d8" />
                <Radar
                  name="群体均值"
                  dataKey="score"
                  stroke="#EAB308"
                  fill="#FACC15"
                  fillOpacity={0.25}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e4e4e7', borderRadius: '8px', color: '#18181b', fontSize: '11px', fontFamily: 'monospace', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-4 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
            <span>重点考察：自驱学习 (25%) · 主动性 (20%) · 逻辑思维 (20%)</span>
          </div>
        </div>

        {/* AI Recommendation Grades Distribution */}
        <div className="rounded-[14px] border border-zinc-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <h2 className="text-[11px] text-zinc-500 uppercase tracking-[0.2em] font-mono font-bold">
              Grade Distribution · AI 评估等级分布
            </h2>
            <span className="font-mono text-[10px] text-amber-700 font-bold uppercase">
              共 {stats.aiCompleted} 份评估
            </span>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" stroke="#d4d4d8" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis dataKey="grade" type="category" stroke="#d4d4d8" tick={{ fill: '#18181b', fontSize: 12, fontWeight: 'bold' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e4e4e7', borderRadius: '8px', color: '#18181b', fontSize: '11px', fontFamily: 'monospace', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {gradeData.map(entry => (
                    <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap justify-around gap-2 text-[10px] font-mono uppercase tracking-wider">
            <span className="text-amber-600 font-semibold">S: 极高自驱/核心骨干</span>
            <span className="text-emerald-600 font-semibold">A: 综合素质突出</span>
            <span className="text-blue-600 font-semibold">B: 潜质良好可培养</span>
            <span className="text-zinc-400">C: 需人工重点复核</span>
          </div>
        </div>
      </div>
    </div>
  );
};
