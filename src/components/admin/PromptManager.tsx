import React, { useState, useEffect } from 'react';
import { Terminal, Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { PromptConfig } from '../../types.js';

export const PromptManager: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [selectedPromptKey, setSelectedPromptKey] = useState<string>('interviewer_system_prompt');
  const [promptContent, setPromptContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const fetchPrompts = async () => {
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const data: PromptConfig[] = await res.json();
        setPrompts(data);
        const current = data.find(p => p.key === selectedPromptKey) || data[0];
        if (current) {
          setSelectedPromptKey(current.key);
          setPromptContent(current.prompt);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleSelectPrompt = (key: string) => {
    setSelectedPromptKey(key);
    const p = prompts.find(item => item.key === key);
    if (p) setPromptContent(p.prompt);
  };

  const handleSave = async () => {
    const current = prompts.find(p => p.key === selectedPromptKey);
    if (!current) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/prompts/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptContent, updatedBy: '技术部管理员' }),
      });

      if (res.ok) {
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
        fetchPrompts();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentPrompt = prompts.find(p => p.key === selectedPromptKey);

  return (
    <div className="space-y-6 text-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <h3 className="text-xs font-bold text-zinc-900 font-mono uppercase tracking-[0.2em]">
            AI 面试官 Prompt 策略与评分规则配置
          </h3>
          <p className="mt-1 text-xs text-zinc-500 font-mono">
            可调整初筛开场、动态追问引导策略与深度评估画像维度权重。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left selector */}
        <div className="md:col-span-4 space-y-2 font-mono text-xs">
          {(prompts || []).map(p => (
            <button
              key={p.key}
              onClick={() => handleSelectPrompt(p.key)}
              aria-pressed={selectedPromptKey === p.key}
              className={`w-full rounded-[10px] border p-3.5 text-left transition-all shadow-xs ${
                selectedPromptKey === p.key
                  ? 'border-amber-300 bg-amber-50 text-amber-900 font-bold'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
              }`}
            >
              <div className="font-bold text-zinc-900 uppercase tracking-wider text-xs">{p.name}</div>
              <div className="mt-1 text-[10px] text-zinc-500 line-clamp-1 font-mono">{p.key}</div>
              <div className="mt-2 text-[10px] text-zinc-400 uppercase tracking-wider">
                VERSION: v{p.version} · UPDATED: {new Date(p.updatedAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        {/* Right Editor */}
        <div className="md:col-span-8 rounded-[12px] border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3 font-mono text-xs">
            <span className="font-bold text-zinc-900 uppercase tracking-wider text-xs">{currentPrompt?.name}</span>
            <span className="text-zinc-400 text-[10px] uppercase tracking-wider">{promptContent.length} CHARACTERS</span>
          </div>

          <label htmlFor="prompt-content" className="sr-only">
            {currentPrompt ? `${currentPrompt.name} Prompt 内容` : 'Prompt 内容'}
          </label>
          <textarea
            id="prompt-content"
            rows={14}
            value={promptContent}
            onChange={e => setPromptContent(e.target.value)}
            aria-describedby="prompt-content-help"
            className="w-full rounded-[8px] border border-zinc-200 bg-zinc-50/50 p-4 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:bg-white focus:outline-none leading-relaxed"
          />
          <p id="prompt-content-help" className="sr-only">
            编辑当前选中的 AI 面试提示词。修改后保存会对后续面试生效。
          </p>

          <div className="flex items-center justify-between pt-2">
            {savedMsg ? (
              <span className="flex items-center gap-1.5 font-mono text-xs text-amber-800 font-bold uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                Prompt 已保存并立即在后续面试生效！
              </span>
            ) : (
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                提示：包含系统角色约束与评分 JSON Schema 规范
              </span>
            )}

            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-5 py-2 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-50 transition-colors shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {loading ? 'SAVING...' : '保存 Prompt 配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
