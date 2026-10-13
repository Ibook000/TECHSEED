import React, { useEffect, useState } from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import { RecruitmentBatch } from '../../types.js';

export interface NewBatchInput {
  name: string;
  year: number;
  description: string;
}

interface BatchManagerProps {
  batches: RecruitmentBatch[];
  activeBatchId: string;
  onActivateBatch: (batchId: string) => Promise<void>;
  onCreateBatch: (batch: NewBatchInput) => Promise<void>;
}

export const BatchManager: React.FC<BatchManagerProps> = ({
  batches,
  activeBatchId,
  onActivateBatch,
  onCreateBatch,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(activeBatchId);
  const [name, setName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setSelectedBatchId(activeBatchId), [activeBatchId]);

  const handleActivate = async (batchId: string) => {
    if (!batchId || batchId === activeBatchId) return;
    setError('');
    setSaving(true);
    try {
      await onActivateBatch(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换批次失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericYear = Number(year);
    if (!name.trim()) {
      setError('请输入批次名称');
      return;
    }
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
      setError('年份请输入 2000–2200 之间的整数');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await onCreateBatch({ name: name.trim(), year: numericYear, description: description.trim() });
      setName('');
      setDescription('');
      setIsCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建批次失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="active-recruitment-batch">当前招新批次</label>
      <select
        id="active-recruitment-batch"
        value={selectedBatchId}
        disabled={saving || batches.length === 0}
        onChange={event => { setSelectedBatchId(event.target.value); setError(''); }}
        className="max-w-[min(55vw,20rem)] rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-xs disabled:opacity-60"
      >
        {batches.map(batch => (
          <option key={batch.id} value={batch.id}>
            {batch.isActive ? '当前 · ' : ''}{batch.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={saving || !selectedBatchId || selectedBatchId === activeBatchId}
        onClick={() => void handleActivate(selectedBatchId)}
        className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-xs transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && !isCreateOpen ? '切换中…' : '启用所选批次'}
      </button>
      <button
        type="button"
        onClick={() => { setError(''); setIsCreateOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs transition-colors hover:border-amber-300 hover:text-zinc-950"
      >
        <Plus className="h-3.5 w-3.5" />
        新建批次
      </button>
      <p className="w-full text-[11px] text-zinc-500">
        启用后，新报名会进入所选批次；已报名记录仍保留在原批次。
      </p>

      {error && !isCreateOpen && (
        <p role="alert" className="w-full text-xs text-rose-700">{error}</p>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4" onMouseDown={event => {
          if (event.target === event.currentTarget && !saving) setIsCreateOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-batch-title"
            className="w-full max-w-lg rounded-[16px] border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <div className="mb-1 flex items-center gap-2 text-amber-700">
                  <CalendarDays className="h-4 w-4" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest">Recruitment Batch</span>
                </div>
                <h2 id="new-batch-title" className="text-lg font-bold text-zinc-950">新建招新批次</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                disabled={saving}
                onClick={() => setIsCreateOpen(false)}
                className="rounded-[8px] p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={event => void handleCreate(event)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                <div>
                  <label htmlFor="new-batch-name" className="mb-1 block text-xs font-medium text-zinc-700">批次名称 *</label>
                  <input
                    id="new-batch-name"
                    autoFocus
                    required
                    maxLength={120}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="例如：秋季新生招新"
                    className="w-full rounded-[8px] border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
                <div>
                  <label htmlFor="new-batch-year" className="mb-1 block text-xs font-medium text-zinc-700">年份 *</label>
                  <input
                    id="new-batch-year"
                    required
                    type="number"
                    min={2000}
                    max={2200}
                    step={1}
                    value={year}
                    onChange={event => setYear(event.target.value)}
                    className="w-full rounded-[8px] border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="new-batch-description" className="mb-1 block text-xs font-medium text-zinc-700">说明</label>
                <textarea
                  id="new-batch-description"
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="可选，简要说明招新范围或方向"
                  className="w-full resize-y rounded-[8px] border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>

              {error && <p role="alert" className="rounded-[8px] bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

              <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-[8px] border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[8px] bg-amber-300 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '创建批次'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
