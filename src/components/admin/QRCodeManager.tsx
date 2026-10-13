import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Upload,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { WeChatGroupQR, RecruitmentBatch } from '../../types.js';

function toDateTimeLocal(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function currentDateTimeLocal(): string {
  return toDateTimeLocal(new Date().toISOString());
}

interface QRCodeManagerProps {
  batches?: RecruitmentBatch[];
  activeBatchId?: string;
}

export const QRCodeManager: React.FC<QRCodeManagerProps> = ({
  batches = [],
  activeBatchId = 'default',
}) => {
  const [selectedBatchId, setSelectedBatchId] = useState(activeBatchId || 'default');
  const [currentQR, setCurrentQR] = useState<WeChatGroupQR | null>(null);
  const [title, setTitle] = useState('技术部招新官方微信群');
  const [imageUrl, setImageUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchQR = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wechat-qr?batchId=${selectedBatchId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentQR(data);
        if (data) {
          setTitle(data.title);
          setImageUrl(data.imageUrl);
          setExpiresAt(toDateTimeLocal(data.expiresAt));
        } else {
          setTitle('技术部招新官方微信群');
          setImageUrl('');
          setExpiresAt('');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQR();
  }, [selectedBatchId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setImageUrl(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      setMsg({ text: '请上传或填入微信群二维码图片', type: 'error' });
      return;
    }
    if (expiresAt && (!Number.isFinite(new Date(expiresAt).getTime()) || new Date(expiresAt).getTime() <= Date.now())) {
      setMsg({ text: '有效期必须设置为未来时间', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/wechat-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentQR?.id,
          batchId: selectedBatchId,
          title: title.trim(),
          imageUrl: imageUrl.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        setCurrentQR(saved);
        setMsg({ text: '招新微信群二维码已成功保存并在全系统生效！', type: 'success' });
        await fetchQR();
      } else {
        const err = await res.json();
        setMsg({ text: err.error || '保存失败', type: 'error' });
      }
    } catch (err: any) {
      setMsg({ text: err.message || '网络错误', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQR = async () => {
    if (!currentQR) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/wechat-qr/${currentQR.id}?batchId=${selectedBatchId}`, { method: 'DELETE' });
      if (res.ok) {
        setCurrentQR(null);
        setImageUrl('');
        setExpiresAt('');
        setMsg({ text: '微信群二维码已成功移除', type: 'success' });
        await fetchQR();
      }
    } catch (err: any) {
      setMsg({ text: err.message || '删除失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-zinc-800">
      {msg && (
        <div
          className={`flex items-center gap-2 rounded-[8px] border p-3.5 font-mono text-xs shadow-xs ${
            msg.type === 'success'
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-rose-300 bg-rose-50 text-rose-700'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-amber-600" /> : <AlertCircle className="h-4 w-4 text-rose-600" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Settings & Upload */}
        <div className="lg:col-span-7 rounded-[12px] border border-zinc-200 bg-white p-6 space-y-5 shadow-xs">
          <div className="border-b border-zinc-200 pb-3">
            <h4 className="text-xs font-bold text-zinc-900 font-mono uppercase tracking-[0.2em]">配置招新微信群二维码</h4>
          </div>

          <form onSubmit={handleSaveQR} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
                群聊标题 / 提示文案 *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`例如：学生会技术部 ${batches.find(batch => batch.id === selectedBatchId)?.year ?? new Date().getFullYear()} 招新官方微信群`}
                className="w-full rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>

            {/* File Upload Box */}
            <div>
              <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
                二维码图片来源 (本地上传 / 图片URL)
              </label>

              <div className="mt-1 flex justify-center rounded-[8px] border-2 border-dashed border-zinc-200 px-6 py-8 text-center hover:border-amber-400 transition-colors bg-zinc-50/50">
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-zinc-400" />
                  <div className="flex text-xs text-zinc-600 justify-center font-mono">
                    <label className="relative cursor-pointer font-bold text-amber-700 hover:text-amber-800 uppercase tracking-wider underline">
                      <span>点击选择图片上传</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />
                    </label>
                    <span className="pl-1">或拖拽二维码至此</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">SUPPORT PNG, JPG, WEBP</p>
                </div>
              </div>
            </div>

            {/* Direct URL input fallback */}
            <div>
              <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
                或者直接输入图片 URL / Base64 Data URL
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://... 或 data:image/..."
                className="w-full rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-amber-400 focus:outline-none shadow-xs"
              />
            </div>

            <div>
              <label htmlFor="wechat-qr-expires-at" className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1 font-semibold">
                二维码有效期至（可选）
              </label>
              <input
                id="wechat-qr-expires-at"
                type="datetime-local"
                min={currentDateTimeLocal()}
                value={expiresAt}
                onChange={event => setExpiresAt(event.target.value)}
                className="w-full rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-xs font-mono text-zinc-900 focus:border-amber-400 focus:outline-none shadow-xs"
              />
              <p className="mt-1 text-[10px] text-zinc-500">到期后学生端会自动隐藏该二维码；留空表示持续有效。</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
              {currentQR ? (
                <button
                  type="button"
                  onClick={handleDeleteQR}
                  className="flex items-center gap-1 text-xs font-mono text-rose-600 hover:text-rose-700 uppercase tracking-wider font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  移除当前批次二维码
                </button>
              ) : (
                <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">未绑定二维码</span>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 rounded-[8px] bg-[#FACC15] hover:bg-[#EAB308] text-zinc-950 px-6 py-2.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shadow-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {loading ? 'SAVING...' : '保存并发布二维码'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Preview: Live Student Preview */}
        <div className="lg:col-span-5 rounded-[12px] border border-zinc-200 bg-white p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
          <div className="w-full text-left border-b border-zinc-200 pb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
              复试通过新生端展示效果预览
            </span>
          </div>

          <div className="rounded-[12px] border border-amber-200 bg-zinc-50/80 p-6 shadow-md max-w-xs w-full space-y-3">
            <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-800 font-bold">
              <QrCode className="h-3.5 w-3.5 text-amber-600" />
              <span>复试通过 · 扫码入群</span>
            </div>

            {imageUrl ? (
              <div className="overflow-hidden rounded-[8px] border border-zinc-200 bg-white p-2 shadow-xs">
                <img
                  src={imageUrl}
                  alt="群二维码预览"
                  className="h-48 w-48 object-contain mx-auto"
                />
              </div>
            ) : (
              <div className="flex h-48 w-48 flex-col items-center justify-center border border-dashed border-zinc-300 rounded-[8px] mx-auto text-zinc-400 font-mono text-xs bg-white">
                <ImageIcon className="h-8 w-8 mb-2 text-zinc-300" />
                <span className="text-[10px] uppercase tracking-wider">暂无生效中的二维码</span>
              </div>
            )}

            <div className="font-mono text-xs">
              <p className="font-bold text-zinc-900">{title}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">请使用微信扫一扫入群</p>
            </div>

            <div className="pt-2">
              <span className="inline-block rounded-[6px] bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider">
                新生已完成人工复试后可见
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
