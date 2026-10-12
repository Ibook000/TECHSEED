import React, { useState } from 'react';
import {
  Search,
  Download,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Users,
  ChevronRight,
} from 'lucide-react';
import { Candidate, AIRecommendationGrade, TechDirection, CandidateStatus } from '../../types.js';

interface CandidateListProps {
  candidates: Candidate[];
  onSelectCandidate: (candidate: Candidate) => void;
  onRefresh: () => void;
  selectedPreset: string;
  onSelectPreset: (preset: string) => void;
  onNavigateToStudent?: () => void;
}

export type SortField =
  | 'score'
  | 'grade'
  | 'name'
  | 'studentId'
  | 'major'
  | 'techDirection'
  | 'foundation'
  | 'candidateType'
  | 'registeredAt'
  | 'status';

export type SortDirection = 'asc' | 'desc';

const SORT_LABELS: Record<SortField, string> = {
  score: 'AI评分',
  grade: 'AI等级',
  name: '姓名',
  studentId: '学号',
  major: '专业/班级',
  techDirection: '意向方向',
  foundation: '技术基础',
  candidateType: '画像定位',
  registeredAt: '报名时间',
  status: '流程状态',
};

const GRADE_STYLES: Record<AIRecommendationGrade, string> = {
  S: 'border-amber-300 bg-amber-50 text-amber-800 font-bold',
  A: 'border-emerald-300 bg-emerald-50 text-emerald-700 font-bold',
  B: 'border-blue-200 bg-blue-50 text-blue-700 font-medium',
  C: 'border-zinc-200 bg-zinc-50 text-zinc-500',
};

const STATUS_TEXT: Record<CandidateStatus, { label: string; color: string; rank: number }> = {
  ADMITTED: { label: '已正式录取', color: 'text-amber-900 bg-amber-100 border-amber-300 font-bold', rank: 10 },
  GROUP_JOIN_CONFIRMED: { label: '已确认入群', color: 'text-amber-800 bg-amber-50 border-amber-200', rank: 9 },
  MANUAL_PASSED: { label: '已正式录取', color: 'text-amber-900 bg-amber-100 border-amber-300 font-bold', rank: 8 },
  QR_AVAILABLE: { label: '已开放群二维码', color: 'text-amber-800 bg-amber-50 border-amber-200', rank: 7 },
  GROUP_JOIN_PENDING: { label: '待扫码入群', color: 'text-amber-700 bg-amber-50 border-amber-200', rank: 6 },
  AI_RECOMMENDED: { label: 'AI初筛建议优先复核', color: 'text-amber-800 bg-amber-50 border-amber-200 font-semibold', rank: 5 },
  AI_COMPLETED: { label: 'AI初筛完成 · 待人工审核', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', rank: 4 },
  AI_INTERVIEWING: { label: 'AI面试进行中', color: 'text-amber-700 bg-amber-50 border-amber-200', rank: 3 },
  WAITING_MANUAL_INTERVIEW: { label: '待审核', color: 'text-amber-700 bg-amber-50 border-amber-200', rank: 2 },
  MANUAL_INTERVIEWING: { label: '审核中', color: 'text-amber-700 bg-amber-50 border-amber-200', rank: 2 },
  REGISTERED: { label: '已报名待面试', color: 'text-zinc-600 bg-zinc-50 border-zinc-200', rank: 1 },
  MANUAL_WAITLIST: { label: '候补观察名单', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', rank: 0 },
  AI_NOT_RECOMMENDED: { label: 'AI初筛需人工复核', color: 'text-zinc-500 bg-zinc-50 border-zinc-200', rank: 2 },
  MANUAL_REJECTED: { label: '未予录用', color: 'text-zinc-400 bg-zinc-50 border-zinc-200', rank: -2 },
};

const FOUNDATION_RANK: Record<string, number> = {
  '精通': 4,
  '熟悉': 3,
  '熟练掌握': 3,
  '了解': 2,
  '入门': 2,
  '稍微接触过': 2,
  '完全没有': 1,
  '无基础': 1,
};

const GRADE_RANK: Record<string, number> = {
  'S': 4,
  'A': 3,
  'B': 2,
  'C': 1,
};

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  onSelectCandidate,
  onRefresh,
  selectedPreset,
  onSelectPreset,
  onNavigateToStudent,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [minScore, setMinScore] = useState<number | ''>('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortDirection>('desc');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  // Free table header sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      // Sensible defaults: numbers, dates, recommendations and status default to descending
      if (['score', 'grade', 'registeredAt', 'status', 'foundation'].includes(field)) {
        setSortOrder('desc');
      } else {
        setSortOrder('asc');
      }
    }
  };

  const handleResetSort = () => {
    setSortField('score');
    setSortOrder('desc');
  };

  // Filter candidates
  const filteredCandidates = candidates.filter(c => {
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const match =
        c.profile.name.toLowerCase().includes(q) ||
        c.profile.studentId.toLowerCase().includes(q) ||
        c.profile.major.toLowerCase().includes(q) ||
        c.profile.className.toLowerCase().includes(q) ||
        (c.candidateType && c.candidateType.toLowerCase().includes(q));
      if (!match) return false;
    }

    // Direction
    if (directionFilter !== 'ALL' && c.profile.techDirection !== directionFilter) {
      return false;
    }

    // Grade
    if (gradeFilter !== 'ALL' && c.aiRecommendation !== gradeFilter) {
      return false;
    }

    // Min Score
    if (minScore !== '' && (c.aiScore || 0) < Number(minScore)) {
      return false;
    }

    // Presets
    if (selectedPreset === 'S') return c.aiRecommendation === 'S';
    if (selectedPreset === 'AI_RECOMMENDED') {
      return ['S', 'A', 'B'].includes(c.aiRecommendation || '') || c.status === 'AI_RECOMMENDED';
    }
    if (selectedPreset === 'ZERO_FOUNDATION') {
      return (
        c.profile.technicalFoundation === '完全没有' &&
        (c.aiScore || 0) >= 80
      );
    }
    if (selectedPreset === 'ADMITTED') {
      return ['ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED'].includes(c.status);
    }
    if (selectedPreset === 'REJECTED') {
      return c.status === 'MANUAL_REJECTED';
    }
    if (selectedPreset === 'GROUP_CONFIRMED') {
      return c.status === 'GROUP_JOIN_CONFIRMED';
    }
    if (selectedPreset === 'PENDING_GROUP') {
      return ['ADMITTED', 'MANUAL_PASSED', 'QR_AVAILABLE', 'GROUP_JOIN_PENDING'].includes(c.status);
    }

    return true;
  });

  // Sort candidates freely
  filteredCandidates.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'score': {
        const scoreA = a.aiScore !== undefined ? a.aiScore : -1;
        const scoreB = b.aiScore !== undefined ? b.aiScore : -1;
        cmp = scoreA - scoreB;
        break;
      }
      case 'grade': {
        const gradeA = a.aiRecommendation ? (GRADE_RANK[a.aiRecommendation] || 0) : 0;
        const gradeB = b.aiRecommendation ? (GRADE_RANK[b.aiRecommendation] || 0) : 0;
        cmp = gradeA - gradeB;
        break;
      }
      case 'name':
        cmp = a.profile.name.localeCompare(b.profile.name, 'zh-Hans');
        break;
      case 'studentId':
        cmp = a.profile.studentId.localeCompare(b.profile.studentId, undefined, { numeric: true });
        break;
      case 'major':
        cmp = `${a.profile.major} ${a.profile.className}`.localeCompare(
          `${b.profile.major} ${b.profile.className}`,
          'zh-Hans'
        );
        break;
      case 'techDirection':
        cmp = a.profile.techDirection.localeCompare(b.profile.techDirection, 'zh-Hans');
        break;
      case 'foundation': {
        const rankA = FOUNDATION_RANK[a.profile.technicalFoundation] || 0;
        const rankB = FOUNDATION_RANK[b.profile.technicalFoundation] || 0;
        cmp = rankA - rankB;
        break;
      }
      case 'candidateType': {
        const typeA = a.candidateType || '';
        const typeB = b.candidateType || '';
        cmp = typeA.localeCompare(typeB, 'zh-Hans');
        break;
      }
      case 'registeredAt': {
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        cmp = timeA - timeB;
        break;
      }
      case 'status': {
        const statA = STATUS_TEXT[a.status]?.rank ?? 0;
        const statB = STATUS_TEXT[b.status]?.rank ?? 0;
        cmp = statA - statB;
        break;
      }
      default:
        cmp = 0;
    }

    return sortOrder === 'desc' ? -cmp : cmp;
  });

  const handleExportCSV = async () => {
    // Fetch rather than navigate: a window.location.href download would have to
    // carry the token in the URL, which lands it in browser history, proxy logs
    // and Referer headers. The Authorization header is attached by the global
    // fetch wrapper in src/lib/auth.ts.
    try {
      const res = await fetch('/api/export/candidates.csv');
      if (!res.ok) {
        alert(res.status === 401 ? '登录状态已失效，请重新登录管理后台' : '导出失败');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'candidates-recruitment.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('导出失败：网络连接异常');
    }
  };

  const renderSortTh = (
    label: string,
    field: SortField,
    className = '',
    align: 'left' | 'right' = 'left'
  ) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`px-3 py-3 font-medium cursor-pointer select-none transition-colors group hover:bg-zinc-100/70 ${className} ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
        title={`点击按「${label}」${isCurrent && sortOrder === 'desc' ? '升序' : '降序'}自由排序`}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span
            className={`transition-colors whitespace-nowrap ${
              isCurrent ? 'text-amber-700 font-bold' : 'text-zinc-600 group-hover:text-zinc-950'
            }`}
          >
            {label}
          </span>
          {isCurrent ? (
            sortOrder === 'desc' ? (
              <ArrowDown className="h-3 w-3 text-amber-600 shrink-0" />
            ) : (
              <ArrowUp className="h-3 w-3 text-amber-600 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-zinc-300 group-hover:text-zinc-500 transition-opacity shrink-0" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter Presets Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mr-2 font-bold">Presets:</span>
        {[
          { id: 'ALL', label: '全部候选人' },
          { id: 'S', label: 'S 级较高分' },
          { id: 'ZERO_FOUNDATION', label: '高潜力 · 零基础' },
          { id: 'ADMITTED', label: '已正式录取' },
          { id: 'PENDING_GROUP', label: '待扫码进群' },
          { id: 'GROUP_CONFIRMED', label: '已确认进群' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => onSelectPreset(p.id)}
            className={`rounded-[8px] border px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-all shadow-xs ${
              selectedPreset === p.id
                ? 'border-amber-300 bg-amber-100 text-amber-900 font-bold'
                : 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-[8px] border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        AI 评分只用于整理初筛线索。所有完成 AI 面试的候选人都会进入人工审核，系统不会按 AI 等级自动淘汰。
      </div>

      {/* Control Bar: Search + Filter + Export + Active Sort Indicator */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索姓名、学号、专业、画像..."
              className="w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-4 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
            />
          </div>

          <button
            onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
            className={`flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-xs ${
              showAdvancedFilter || directionFilter !== 'ALL' || gradeFilter !== 'ALL' || minScore !== ''
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-zinc-200 bg-white text-zinc-700 hover:border-amber-400'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>筛选条件</span>
            {(directionFilter !== 'ALL' || gradeFilter !== 'ALL' || minScore !== '') && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308]" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Current Sort Indicator with Reset */}
          <div className="flex items-center gap-2 rounded-[8px] border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700 shadow-xs">
            <span className="text-zinc-400 text-[10px] uppercase">当前排序:</span>
            <span className="font-bold text-amber-700">
              {SORT_LABELS[sortField]} · {sortOrder === 'desc' ? '降序 ↓' : '升序 ↑'}
            </span>
            {(sortField !== 'score' || sortOrder !== 'desc') && (
              <button
                onClick={handleResetSort}
                title="恢复默认按评分降序"
                className="ml-1 text-zinc-400 hover:text-zinc-800 transition-colors flex items-center gap-0.5"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span className="text-[10px]">重置</span>
              </button>
            )}
          </div>

          {/* Export CSV */}
          <button
            id="btn-export-csv"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-zinc-950" />
            <span>导出 CSV</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Box */}
      {showAdvancedFilter && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-[10px] border border-zinc-200 bg-zinc-50/80 p-4 font-mono text-xs shadow-xs">
          <div>
            <label className="text-zinc-500 block mb-1 uppercase tracking-wider text-[10px] font-semibold">技术方向</label>
            <select
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value)}
              className="w-full rounded-[6px] border border-zinc-200 bg-white p-2 text-zinc-800 focus:border-amber-400 focus:outline-none shadow-xs"
            >
              <option value="ALL">全部方向</option>
              {['Web 前端', '后端', 'AI', '算法', '嵌入式', '硬件', 'UI / UX', '产品'].map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-zinc-500 block mb-1 uppercase tracking-wider text-[10px] font-semibold">AI 初筛等级</label>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="w-full rounded-[6px] border border-zinc-200 bg-white p-2 text-zinc-800 focus:border-amber-400 focus:outline-none shadow-xs"
            >
              <option value="ALL">全部等级</option>
              <option value="S">S 级 (高分，需人工审核)</option>
              <option value="A">A 级 (较高分，需人工审核)</option>
              <option value="B">B 级 (可培养，需人工审核)</option>
              <option value="C">C 级 (需重点人工复核)</option>
            </select>
          </div>

          <div>
            <label className="text-zinc-500 block mb-1 uppercase tracking-wider text-[10px] font-semibold">最低 AI 评分 (分)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={minScore}
              onChange={e => setMinScore(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="例如 80"
              className="w-full rounded-[6px] border border-zinc-200 bg-white p-2 text-zinc-800 focus:border-amber-400 focus:outline-none shadow-xs"
            />
          </div>
        </div>
      )}

      {/* Candidate Sortable Table */}
      <div className="rounded-[12px] border border-zinc-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-zinc-50/90 border-b border-zinc-200 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                {renderSortTh('候选人姓名', 'name')}
                {renderSortTh('学号', 'studentId')}
                {renderSortTh('专业与班级', 'major')}
                {renderSortTh('意向方向', 'techDirection')}
                {renderSortTh('技术基础', 'foundation')}
                {renderSortTh('AI 评分', 'score')}
                {renderSortTh('推荐等级', 'grade')}
                {renderSortTh('画像定位', 'candidateType')}
                {renderSortTh('报名时间', 'registeredAt')}
                {renderSortTh('招新状态', 'status')}
                <th className="px-3 py-3 font-medium text-right text-zinc-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-50 text-zinc-400">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-bold text-zinc-800 font-sans">
                        {candidates.length === 0 ? '暂无报名候选人数据' : '未找到符合当前筛选条件的候选人'}
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed font-mono">
                        {candidates.length === 0
                          ? '当前招新批次暂无学生提交报名。新生在新生端登记并完成初筛作答后，将实时呈现于管理控制台。'
                          : '请尝试调整搜索关键词、技术方向或流程状态筛选条件。'}
                      </p>
                      {candidates.length === 0 && onNavigateToStudent && (
                        <button
                          onClick={onNavigateToStudent}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] px-3.5 py-1.5 text-xs font-mono font-bold text-zinc-950 transition-colors shadow-xs"
                        >
                          <span>预览新生端报名页面</span>
                          <span>→</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(c => {
                  const statusInfo = STATUS_TEXT[c.status] || { label: c.status, color: 'text-zinc-400' };
                  const formattedDate = c.registeredAt
                    ? new Date(c.registeredAt).toLocaleDateString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-';

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectCandidate(c)}
                      className="group cursor-pointer transition-colors hover:bg-amber-50/30 border-l-2 border-transparent hover:border-amber-500"
                    >
                      {/* Name */}
                      <td className="px-3 py-3">
                        <span className="font-sans font-bold text-zinc-900 group-hover:text-amber-700 transition-colors whitespace-nowrap">
                          {c.profile.name}
                        </span>
                      </td>

                      {/* Student ID */}
                      <td className="px-3 py-3 text-zinc-500 whitespace-nowrap font-mono text-[11px]">
                        {c.profile.studentId}
                      </td>

                      {/* Major & Class */}
                      <td className="px-3 py-3 text-zinc-700 whitespace-nowrap">
                        <div>{c.profile.major}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{c.profile.className}</div>
                      </td>

                      {/* Direction */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="rounded-[4px] border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                          {c.profile.techDirection}
                        </span>
                      </td>

                      {/* Foundation */}
                      <td className="px-3 py-3 text-zinc-600 whitespace-nowrap text-[11px]">
                        {c.profile.technicalFoundation}
                      </td>

                      {/* AI Score */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {c.aiScore !== undefined ? (
                          <span className="font-mono text-sm font-bold text-zinc-900">
                            {c.aiScore}
                            <span className="text-[10px] text-zinc-400 font-normal ml-0.5">分</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-zinc-400">评测中</span>
                        )}
                      </td>

                      {/* Recommendation Grade */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {c.aiRecommendation ? (
                          <span
                            className={`rounded-[4px] border px-2 py-0.5 font-mono text-[10px] font-bold ${
                              GRADE_STYLES[c.aiRecommendation]
                            }`}
                          >
                            {c.aiRecommendation} 级
                          </span>
                        ) : (
                          <span className="text-zinc-300 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Persona Type */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-block rounded-[4px] border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-700 font-mono">
                          {c.candidateType || '综合候选人'}
                        </span>
                      </td>

                      {/* Registered Date */}
                      <td className="px-3 py-3 text-zinc-500 whitespace-nowrap text-[11px] font-mono">
                        {formattedDate}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectCandidate(c);
                          }}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-mono uppercase font-bold text-zinc-700 hover:bg-[#FACC15] hover:border-amber-400 hover:text-zinc-950 transition-colors shadow-xs"
                        >
                          <span>查看档案</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 flex items-center justify-between font-mono text-xs text-zinc-500">
          <span>共计 {filteredCandidates.length} 名候选人档案</span>
          <span className="text-[10px] uppercase tracking-wider">
            点击任意表头列自由切换升序 / 降序
          </span>
        </div>
      </div>
    </div>
  );
};
