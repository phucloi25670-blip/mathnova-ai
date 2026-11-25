import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  X,
  Check,
  Trash2,
  Database,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import {
  getActiveFirebaseConfig,
  getDefaultFirebaseConfig,
  getSavedCustomFirebaseConfig,
  hasCustomFirebaseConfig,
  resetToDefaultFirebaseConfig,
  saveAndActivateFirebaseConfig,
} from '../firebase';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSave: (key: string) => void;
  hasServerKey: boolean;
  initialTab?: 'gemini' | 'firebase';
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSave,
  hasServerKey,
  initialTab = 'gemini',
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'firebase'>(initialTab);
  const [draft, setDraft] = useState(apiKey);

  // Firebase config editor state
  const [firebaseJsonText, setFirebaseJsonText] = useState('');
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [firebaseSuccess, setFirebaseSuccess] = useState<string | null>(null);
  const [isCustomFirebase, setIsCustomFirebase] = useState<boolean>(false);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isApplyingFirebase, setIsApplyingFirebase] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setDraft(apiKey);
    setFirebaseError(null);
    setFirebaseSuccess(null);
    const saved = getSavedCustomFirebaseConfig();
    const active = getActiveFirebaseConfig();
    setIsCustomFirebase(hasCustomFirebaseConfig());
    setActiveProjectId(active.projectId);
    setFirebaseJsonText(
      saved ? JSON.stringify(saved, null, 2) : JSON.stringify(active, null, 2)
    );
  }, [isOpen, apiKey, initialTab]);

  if (!isOpen) return null;

  const handleSubmitGemini = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft.trim());
    onClose();
  };

  const handleClearGemini = () => {
    setDraft('');
    onSave('');
  };

  const handleActivateFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseError(null);
    setFirebaseSuccess(null);
    setIsApplyingFirebase(true);
    try {
      const activated = await saveAndActivateFirebaseConfig(firebaseJsonText);
      setIsCustomFirebase(true);
      setActiveProjectId(activated.projectId);
      setFirebaseJsonText(JSON.stringify(activated, null, 2));
      setFirebaseSuccess(
        `Đã kích hoạt Firebase Project "${activated.projectId}" thành công! Hệ thống Auth & Cloud Firestore đã kết nối lại.`
      );
    } catch (err) {
      setFirebaseError(
        err instanceof Error ? err.message : 'Không thể kích hoạt cấu hình Firebase.'
      );
    } finally {
      setIsApplyingFirebase(false);
    }
  };

  const handleResetFirebase = async () => {
    setFirebaseError(null);
    setFirebaseSuccess(null);
    setIsApplyingFirebase(true);
    try {
      const def = await resetToDefaultFirebaseConfig();
      setIsCustomFirebase(false);
      setActiveProjectId(def.projectId);
      setFirebaseJsonText(JSON.stringify(getDefaultFirebaseConfig(), null, 2));
      setFirebaseSuccess(
        `Đã khôi phục cấu hình Firebase mặc định (${def.projectId}).`
      );
    } catch (err) {
      setFirebaseError(
        err instanceof Error ? err.message : 'Không thể khôi phục cấu hình mặc định.'
      );
    } finally {
      setIsApplyingFirebase(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="w-full max-w-xl rounded-3xl bg-[#0F172A] border border-blue-500/30 shadow-[0_25px_60px_rgba(7,11,25,0.95)] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-blue-500/20 bg-[#070B19] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-base sm:text-lg font-extrabold text-white"
              >
                Cài đặt Hệ thống (API & Firebase)
              </h2>
              <p className="text-[11px] text-slate-400">
                Cấu hình Gemini API Key cá nhân hoặc kết nối Firebase Project riêng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại cài đặt"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white inline-flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Tabs */}
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'gemini'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                : 'bg-[#070B19] border border-blue-500/20 text-slate-300 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Gemini API Key
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('firebase')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'firebase'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                : 'bg-[#070B19] border border-blue-500/20 text-slate-300 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Cấu hình Firebase JSON
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {activeTab === 'gemini' ? (
            <form onSubmit={handleSubmitGemini} className="space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {hasServerKey
                  ? 'Hệ thống đã có sẵn kết nối Gemini mặc định trên máy chủ. Bạn có thể nhập thêm Gemini API Key cá nhân nếu muốn dùng hạn mức riêng.'
                  : 'Nhập Gemini API Key của bạn để kích hoạt Gia sư AI Socratic, Đấu trường Mini-games và Trợ lý dịch đề vẽ hình 2D/3D.'}
              </p>

              <div>
                <label
                  htmlFor="gemini-api-key-input"
                  className="block text-xs font-bold text-slate-200 mb-1.5"
                >
                  Gemini API Key (Lưu cục bộ trên trình duyệt)
                </label>
                <input
                  id="gemini-api-key-input"
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-white text-sm font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {apiKey ? (
                  <button
                    type="button"
                    onClick={handleClearGemini}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa key cá nhân
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">
                    {hasServerKey ? 'Đang dùng cấu hình máy chủ' : 'Chưa lưu key cá nhân'}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30 hover:scale-[1.02] transition-transform"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu API Key
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleActivateFirebase} className="space-y-4">
              <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 space-y-2 text-xs text-slate-300 leading-relaxed">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-cyan-400">
                    Hướng dẫn kết nối Firebase cho Quản trị viên:
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                      isCustomFirebase
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-blue-500/15 border-blue-500/30 text-cyan-300'
                    }`}
                  >
                    {isCustomFirebase
                      ? `Đang dùng cấu hình tùy chỉnh (${activeProjectId})`
                      : `Mặc định hệ thống (${activeProjectId})`}
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>
                    Mở <strong className="text-slate-200">Firebase Console → Project Settings → Your apps</strong>, sao chép đối tượng <code className="text-cyan-300">firebaseConfig</code> (JSON hoặc JS snippet).
                  </li>
                  <li>
                    Trong <strong className="text-slate-200">Authentication → Sign-in method</strong>, bật <strong className="text-slate-200">Google</strong>, <strong className="text-slate-200">Facebook</strong> và <strong className="text-slate-200">Email/Password</strong>, rồi thêm tên miền ứng dụng vào <strong className="text-slate-200">Authorized domains</strong>.
                  </li>
                  <li>
                    Dán vào khung bên dưới và bấm <strong className="text-slate-200">Kích hoạt cấu hình Firebase</strong> để chuyển đổi ngay không cần sửa mã nguồn.
                  </li>
                </ol>
              </div>

              <div>
                <label
                  htmlFor="firebase-config-json-textarea"
                  className="block text-xs font-bold text-slate-200 mb-1.5"
                >
                  Đoạn mã Firebase Config JSON (hoặc JS const firebaseConfig = {'{...}'})
                </label>
                <textarea
                  id="firebase-config-json-textarea"
                  rows={8}
                  value={firebaseJsonText}
                  onChange={(e) => setFirebaseJsonText(e.target.value)}
                  spellCheck={false}
                  placeholder={`{\n  "apiKey": "AIzaSy...",\n  "authDomain": "your-project.firebaseapp.com",\n  "projectId": "your-project-id",\n  "appId": "1:..."\n}`}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#070B19] border border-blue-500/30 text-cyan-200 text-xs font-mono leading-relaxed placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              {firebaseError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{firebaseError}</span>
                </div>
              )}

              {firebaseSuccess && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{firebaseSuccess}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResetFirebase}
                  disabled={isApplyingFirebase || !isCustomFirebase}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed text-slate-200 text-xs font-bold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Khôi phục mặc định
                </button>

                <button
                  type="submit"
                  disabled={isApplyingFirebase}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold shadow-md shadow-blue-500/30 hover:scale-[1.02] disabled:opacity-60 transition-transform"
                >
                  <Database className="w-3.5 h-3.5" />
                  {isApplyingFirebase ? 'Đang kết nối...' : 'Kích hoạt cấu hình Firebase'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
