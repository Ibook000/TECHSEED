import { useState, useEffect } from 'react';

interface AIProviderConfigView {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  apiKeyMasked: string;
}

interface AISettingsView {
  id: string;
  primary: AIProviderConfigView;
  fallback: AIProviderConfigView;
  updatedAt: string;
  updatedBy: string;
}

interface ProviderFormState {
  baseUrl: string;
  model: string;
  apiKey: string; // empty string means "do not change the key"
}

export function AISettingsManager() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [settings, setSettings] = useState<AISettingsView | null>(null);

  const [primaryForm, setPrimaryForm] = useState<ProviderFormState>({ baseUrl: '', model: '', apiKey: '' });
  const [fallbackForm, setFallbackForm] = useState<ProviderFormState>({ baseUrl: '', model: '', apiKey: '' });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-settings');
      const data = await res.json();
      setSettings(data);
      setPrimaryForm({ baseUrl: data.primary.baseUrl, model: data.primary.model, apiKey: '' });
      setFallbackForm({ baseUrl: data.fallback.baseUrl, model: data.fallback.model, apiKey: '' });
    } catch (err) {
      console.error('Failed to load AI settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveProvider = async (provider: 'primary' | 'fallback', form: ProviderFormState) => {
    setSaving(true);
    setSavedMsg('');
    try {
      const body: any = { updatedBy: '技术部管理员' };
      body[provider] = {
        baseUrl: form.baseUrl,
        model: form.model,
      };
      // Only include apiKey if user typed something (empty = don't change)
      if (form.apiKey.trim() !== '') {
        body[provider].apiKey = form.apiKey.trim();
      }

      const res = await fetch('/api/ai-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '保存失败');
      }

      const data = await res.json();
      setSettings(data);
      // Clear the apiKey input after save (key is never echoed back)
      if (provider === 'primary') {
        setPrimaryForm(prev => ({ ...prev, baseUrl: data.primary.baseUrl, model: data.primary.model, apiKey: '' }));
      } else {
        setFallbackForm(prev => ({ ...prev, baseUrl: data.fallback.baseUrl, model: data.fallback.model, apiKey: '' }));
      }
      setSavedMsg(`${provider === 'primary' ? '主用' : '备用'}端点配置已保存`);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err: any) {
      setSavedMsg('保存失败：' + (err.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return <div className="p-6 text-zinc-500">加载中...</div>;
  }

  if (!settings) {
    return <div className="p-6 text-zinc-500">无法加载 AI 设置</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">AI 模型配置</h2>
          <p className="text-sm text-zinc-500 mt-1">
            配置 OpenAI 兼容接口的主用与备用端点。主用支持多 API Key 轮询分流，故障自动转移；全部主用 key 失败后降级到备用端点。
          </p>
        </div>
        {savedMsg && (
          <div className="text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
            {savedMsg}
          </div>
        )}
      </div>

      {/* Primary Provider */}
      <div className="bg-white rounded-lg border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">主</span>
          <h3 className="font-medium text-zinc-900">主用端点</h3>
          <span className="text-xs text-zinc-400 ml-auto">
            最后更新：{new Date(settings.updatedAt).toLocaleString('zh-CN')} · {settings.updatedBy}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Base URL</label>
            <input
              type="text"
              value={primaryForm.baseUrl}
              onChange={e => setPrimaryForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">模型名称</label>
            <input
              type="text"
              value={primaryForm.model}
              onChange={e => setPrimaryForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="例如：gpt-4o-mini / deepseek-v4-flash / ark-code-latest"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              API Key
              <span className="text-zinc-400 font-normal ml-2">
                {settings.primary.hasKey
                  ? `当前：${settings.primary.apiKeyMasked}（留空则不修改）`
                  : '（未配置）'}
              </span>
            </label>
            <textarea
              value={primaryForm.apiKey}
              onChange={e => setPrimaryForm(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="一个 key 一行，或用逗号分隔。支持多 key 轮询，自动故障转移"
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono resize-none"
            />
            <p className="text-xs text-zinc-400 mt-1">
              可填入多个 API Key，系统自动轮询分流，单个 key 限流或故障时自动切换到下一个
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => saveProvider('primary', primaryForm)}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存主用配置'}
            </button>
          </div>
        </div>
      </div>

      {/* Fallback Provider */}
      <div className="bg-white rounded-lg border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-200 text-zinc-600 text-xs font-bold">备</span>
          <h3 className="font-medium text-zinc-900">备用端点</h3>
          <span className="text-xs text-zinc-400 ml-auto">主用失败时自动降级</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Base URL</label>
            <input
              type="text"
              value={fallbackForm.baseUrl}
              onChange={e => setFallbackForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">模型名称</label>
            <input
              type="text"
              value={fallbackForm.model}
              onChange={e => setFallbackForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="例如：gpt-4o-mini / deepseek-v4-flash"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              API Key
              <span className="text-zinc-400 font-normal ml-2">
                {settings.fallback.hasKey
                  ? `当前：${settings.fallback.apiKeyMasked}（留空则不修改）`
                  : '（未配置）'}
              </span>
            </label>
            <textarea
              value={fallbackForm.apiKey}
              onChange={e => setFallbackForm(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="一个 key 一行，或用逗号分隔。主用全部失败后自动切换到此端点"
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono resize-none"
            />
            <p className="text-xs text-zinc-400 mt-1">
              备用端点也支持多 key 轮询，主用端点全部 key 均失败后自动降级到备用端点
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => saveProvider('fallback', fallbackForm)}
              disabled={saving}
              className="px-4 py-2 bg-zinc-700 text-white text-sm font-medium rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存备用配置'}
            </button>
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-400 bg-zinc-50 rounded-md p-3 border border-zinc-100">
        <p>💡 提示：</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>接口需兼容 OpenAI Chat Completions 协议（支持 <code className="bg-zinc-200/60 px-1 rounded">response_format: json_object</code>）</li>
          <li>密钥以加密形式存储在服务器数据库中，后台页面永远只显示脱敏后的值</li>
          <li>修改即时生效，无需重启服务</li>
          <li>如果 .env 文件中也配置了相同变量，数据库配置优先级更高</li>
        </ul>
      </div>
    </div>
  );
}
