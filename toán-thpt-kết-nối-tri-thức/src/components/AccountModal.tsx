import React, { useEffect, useState } from 'react';
import {
  X,
  LogOut,
  Download,
  Upload,
  Check,
  Copy,
  Flame,
  Sparkles,
  BookOpen,
  MessageSquare,
  Box,
  AlertCircle,
  UserCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  UserPlus,
  LogIn,
  ShieldCheck,
  Settings2,
} from 'lucide-react';
import { AccountWorkspaceData, GradeLevel } from '../types';
import {
  AVATAR_OPTIONS,
  exportAccountBackupCode,
} from '../utils/accountStore';
import {
  signInWithFacebookPopup,
  signInWithGooglePopup,
  signInWithUsernameOrEmail,
  signUpWithUsernameOrEmail,
  translateFirebaseAuthError,
} from '../firebase';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: AccountWorkspaceData | null;
  onUpdateProfile: (params: {
    displayName: string;
    grade: GradeLevel;
    avatar: string;
  }) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onImportBackupCode: (code: string) => Promise<void> | void;
  onNavigateTab: (tab: 'leaderboard' | 'tutor' | 'lab') => void;
  onOpenFirebaseSettings: () => void;
  pendingSignupProfileRef: React.MutableRefObject<{
    displayName: string;
    grade: GradeLevel;
    avatar: string;
  } | null>;
}

const GRADE_CHOICES: Array<{ id: GradeLevel; label: string }> = [
  { id: '10', label: 'Lớp 10' },
  { id: '11', label: 'Lớp 11' },
  { id: '12', label: 'Lớp 12' },
  { id: 'thpt', label: 'Ôn thi THPT' },
];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  onUpdateProfile,
  onLogout,
  onImportBackupCode,
  onNavigateTab,
  onOpenFirebaseSettings,
  pendingSignupProfileRef,
}) => {
  const [viewMode, setViewMode] = useState<'profile' | 'auth' | 'backup'>(
    activeAccount ? 'profile' : 'auth'
  );

  // Auth states (when signed out)
  const [authSection, setAuthSection] = useState<'social' | 'password'>('social');
  const [passwordMode, setPasswordMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Editable Profile fields (also used during registration)
  const [displayName, setDisplayName] = useState('');
  const [grade, setGrade] = useState<GradeLevel>('12');
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0].emoji);
  const [formError, setFormError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Backup Export/Import states
  const [backupCodeOutput, setBackupCodeOutput] = useState('');
  const [backupCopied, setBackupCopied] = useState(false);
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [backupMsg, setBackupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setProfileStatus(null);
    setBackupMsg(null);
    setBackupCopied(false);
    setIsAuthenticating(false);
    if (activeAccount) {
      setViewMode('profile');
      setDisplayName(activeAccount.profile.displayName);
      setGrade(activeAccount.profile.grade);
      setAvatar(activeAccount.profile.avatar);
      setBackupCodeOutput(exportAccountBackupCode(activeAccount));
    } else {
      setViewMode('auth');
      setAuthSection('social');
      setPasswordMode('login');
      setIdentifier('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setDisplayName('');
      setGrade('12');
      setAvatar(AVATAR_OPTIONS[0].emoji);
      setBackupCodeOutput('');
    }
  }, [isOpen, activeAccount]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setFormError(null);
    setIsAuthenticating(true);
    try {
      await signInWithGooglePopup();
      onClose();
    } catch (err) {
      setFormError(translateFirebaseAuthError(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFacebookLogin = async () => {
    setFormError(null);
    setIsAuthenticating(true);
    try {
      await signInWithFacebookPopup();
      onClose();
    } catch (err) {
      setFormError(translateFirebaseAuthError(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (passwordMode === 'register') {
      if (password.length < 6) {
        setFormError('Mật khẩu đăng ký phải có ít nhất 6 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Mật khẩu xác nhận không trùng khớp.');
        return;
      }
      const nickname = displayName.trim();
      if (nickname && nickname.length < 2) {
        setFormError('Tên hiển thị (Nickname) cần tối thiểu 2 ký tự.');
        return;
      }

      pendingSignupProfileRef.current = {
        displayName: nickname || identifier.trim().split('@')[0] || 'Học viên',
        grade,
        avatar,
      };
    }

    setIsAuthenticating(true);
    try {
      if (passwordMode === 'login') {
        await signInWithUsernameOrEmail(identifier, password);
      } else {
        await signUpWithUsernameOrEmail(
          identifier,
          password,
          displayName.trim() || undefined
        );
      }
      onClose();
    } catch (err) {
      pendingSignupProfileRef.current = null;
      setFormError(translateFirebaseAuthError(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = displayName.trim();
    if (cleaned.length < 2 || cleaned.length > 60) {
      setFormError('Tên hiển thị (Nickname) cần từ 2 đến 60 ký tự.');
      return;
    }
    setFormError(null);
    setProfileStatus(null);
    setIsSavingProfile(true);
    try {
      await onUpdateProfile({ displayName: cleaned, grade, avatar });
      setProfileStatus({
        type: 'ok',
        text: 'Đã lưu hồ sơ và đồng bộ ngay lên Bảng Xếp Hạng thời gian thực!',
      });
    } catch (err) {
      setProfileStatus({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Không thể cập nhật hồ sơ lên Cloud Firestore.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCopyBackup = async () => {
    if (!activeAccount) return;
    const code = exportAccountBackupCode(activeAccount);
    setBackupCodeOutput(code);
    try {
      await navigator.clipboard.writeText(code);
      setBackupCopied(true);
      window.setTimeout(() => setBackupCopied(false), 2000);
    } catch {
      // User can copy manually
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCodeInput.trim()) {
      setBackupMsg({ type: 'err', text: 'Vui lòng dán mã sao lưu trước khi nhập.' });
      return;
    }
    try {
      await onImportBackupCode(backupCodeInput);
      setBackupCodeInput('');
      setBackupMsg({
        type: 'ok',
        text: activeAccount
          ? 'Đã khôi phục dữ liệu học tập vào tài khoản hiện tại!'
          : 'Đã nạp dữ liệu! Hãy đăng nhập Firebase để lưu lên đám mây.',
      });
    } catch (err) {
      setBackupMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Mã sao lưu không hợp lệ.',
      });
    }
  };

  const providerBadgeLabel =
    activeAccount?.profile.provider === 'google'
      ? 'Google Account'
      : activeAccount?.profile.provider === 'facebook'
      ? 'Facebook Account'
      : 'Tài khoản & Mật khẩu';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl rounded-3xl bg-[#0F172A] border border-blue-500/30 shadow-[0_25px_60px_rgba(7,11,25,0.95)] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-blue-500/20 bg-[#070B19] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl shrink-0">
              {activeAccount ? activeAccount.profile.avatar : '🔐'}
            </span>
            <div className="min-w-0">
              <h2
                id="account-modal-title"
                className="text-base font-extrabold text-white truncate"
              >
                {activeAccount
                  ? `Hồ sơ: ${activeAccount.profile.displayName}`
                  : 'Tài khoản & Hồ sơ học tập'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {activeAccount
                  ? `${providerBadgeLabel}${activeAccount.profile.email ? ` · ${activeAccount.profile.email}` : ''}`
                  : 'Đăng nhập bảo mật bằng Firebase Authentication · Đồng bộ XP & Streak'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ tài khoản"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white inline-flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-tab switch */}
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          {activeAccount ? (
            <button
              type="button"
              onClick={() => setViewMode('profile')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                viewMode === 'profile'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                  : 'bg-[#070B19] border border-blue-500/20 text-slate-300 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Hồ sơ của tôi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setViewMode('auth')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                viewMode === 'auth'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                  : 'bg-[#070B19] border border-blue-500/20 text-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Đăng nhập / Đăng ký
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewMode('backup')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              viewMode === 'backup'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                : 'bg-[#070B19] border border-blue-500/20 text-slate-300 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Xuất / Nhập mã sao lưu
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* SIGNED-IN PROFILE EDITOR */}
          {viewMode === 'profile' && activeAccount && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                  <div className="text-lg font-extrabold text-orange-400 inline-flex items-center gap-1 tabular-nums">
                    <Flame className="w-4 h-4" />
                    {activeAccount.progress.streak}
                  </div>
                  <div className="text-[11px] text-slate-400">Ngày Streak</div>
                </div>
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                  <div className="text-lg font-extrabold text-cyan-400 inline-flex items-center gap-1 tabular-nums">
                    <Sparkles className="w-4 h-4" />
                    {activeAccount.progress.xp}
                  </div>
                  <div className="text-[11px] text-slate-400">Tổng XP</div>
                </div>
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                  <div className="text-lg font-extrabold text-indigo-400 inline-flex items-center gap-1 tabular-nums">
                    <Box className="w-4 h-4" />
                    {activeAccount.drawnHistory.length}
                  </div>
                  <div className="text-[11px] text-slate-400">Hình đã vẽ</div>
                </div>
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                  <div className="text-lg font-extrabold text-rose-400 inline-flex items-center gap-1 tabular-nums">
                    <BookOpen className="w-4 h-4" />
                    {activeAccount.wrongNotebook.filter((w) => !w.mastered).length}
                  </div>
                  <div className="text-[11px] text-slate-400">Lỗi cần ôn</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab('leaderboard');
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-colors"
                >
                  🏆 Xem Bảng Xếp Hạng & Sổ Tay Lỗi Sai
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab('lab');
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25 transition-colors inline-flex items-center gap-1.5"
                >
                  <Box className="w-3.5 h-3.5" />
                  Lịch sử vẽ ({activeAccount.drawnHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab('tutor');
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-bold hover:bg-blue-500/25 transition-colors inline-flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Lịch sử chat ({Math.max(0, activeAccount.chatHistory.length - 1)})
                </button>
              </div>

              {/* Edit Profile Form */}
              <form
                onSubmit={handleProfileSave}
                className="space-y-4 pt-3 border-t border-blue-500/20"
              >
                <div className="text-xs font-bold text-cyan-400">
                  Tùy chỉnh hồ sơ hiển thị trên Bảng Xếp Hạng (không lộ Email cá nhân)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="profile-display-name"
                      className="block text-xs font-bold text-slate-300"
                    >
                      Tên hiển thị (Nickname)
                    </label>
                    <input
                      id="profile-display-name"
                      type="text"
                      maxLength={60}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ví dụ: Minh Khang 12A7"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="profile-grade-select"
                      className="block text-xs font-bold text-slate-300"
                    >
                      Khối lớp đang học
                    </label>
                    <select
                      id="profile-grade-select"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value as GradeLevel)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                      {GRADE_CHOICES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-slate-300">
                    Chọn Avatar biểu tượng
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {AVATAR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAvatar(opt.emoji)}
                        aria-label={`Chọn avatar ${opt.label}`}
                        className={`py-2 rounded-xl border text-xl flex items-center justify-center transition-all ${
                          avatar === opt.emoji
                            ? 'bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/50 scale-105'
                            : 'bg-[#070B19] border-blue-500/20 hover:border-blue-400'
                        }`}
                      >
                        {opt.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {formError && (
                  <p className="text-xs text-rose-400 font-semibold">{formError}</p>
                )}
                {profileStatus && (
                  <p
                    className={`text-xs font-semibold ${
                      profileStatus.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {profileStatus.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onLogout();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Đăng xuất
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold shadow-md shadow-blue-500/30 hover:scale-[1.02] disabled:opacity-60 transition-transform"
                  >
                    {isSavingProfile
                      ? 'Đang đồng bộ...'
                      : 'Lưu thay đổi & Đồng bộ Bảng Xếp Hạng'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* MULTI-PROVIDER FIREBASE AUTH (WHEN SIGNED OUT) */}
          {viewMode === 'auth' && !activeAccount && (
            <div className="space-y-4">
              {/* Method Tabs: Social vs Password */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#070B19] border border-blue-500/20">
                <button
                  type="button"
                  onClick={() => {
                    setAuthSection('social');
                    setFormError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    authSection === 'social'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Google & Facebook
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthSection('password');
                    setFormError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    authSection === 'password'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tài khoản & Mật khẩu riêng
                </button>
              </div>

              {authSection === 'social' ? (
                <div className="space-y-3 rounded-2xl bg-[#070B19] border border-blue-500/20 p-5">
                  <div className="text-center space-y-1 mb-2">
                    <h3 className="text-sm font-extrabold text-white">
                      Đăng nhập nhanh 1 chạm qua Firebase
                    </h3>
                    <p className="text-xs text-slate-400">
                      Sau khi đăng nhập, bạn có thể đổi tên hiển thị (Nickname), chọn lớp và Avatar thoải mái.
                    </p>
                  </div>

                  {/* Google Button */}
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isAuthenticating}
                    className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 text-sm font-bold flex items-center justify-center gap-3 shadow-md transition-colors"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                      />
                    </svg>
                    <span>Tiếp tục với Google</span>
                  </button>

                  {/* Facebook Button */}
                  <button
                    type="button"
                    onClick={handleFacebookLogin}
                    disabled={isAuthenticating}
                    className="w-full py-3 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-3 shadow-md shadow-blue-600/25 transition-colors"
                  >
                    <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    <span>Tiếp tục với Facebook</span>
                  </button>

                  <div className="pt-2 border-t border-blue-500/15 text-center">
                    <button
                      type="button"
                      onClick={() => setAuthSection('password')}
                      className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Hoặc dùng Tài khoản & Mật khẩu riêng →
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handlePasswordSubmit}
                  className="space-y-4 rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 sm:p-5"
                >
                  {/* Login vs Register Toggle */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-500/15">
                    <span className="text-sm font-extrabold text-white">
                      {passwordMode === 'login'
                        ? 'Đăng nhập bằng mật khẩu'
                        : 'Đăng ký tài khoản mới'}
                    </span>
                    <div className="inline-flex rounded-xl bg-[#0F172A] border border-blue-500/20 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordMode('login');
                          setFormError(null);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          passwordMode === 'login'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Đăng nhập
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordMode('register');
                          setFormError(null);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          passwordMode === 'register'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Đăng ký
                      </button>
                    </div>
                  </div>

                  {/* Identifier */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-identifier-input"
                      className="block text-xs font-bold text-slate-300"
                    >
                      Tên đăng nhập hoặc Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-identifier-input"
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="Ví dụ: minhkhang12a7 hoặc email@gmail.com"
                        autoComplete="username"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-password-input"
                      className="block text-xs font-bold text-slate-300"
                    >
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Tối thiểu 6 ký tự"
                        autoComplete={
                          passwordMode === 'login' ? 'current-password' : 'new-password'
                        }
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password & Initial Profile for Sign Up */}
                  {passwordMode === 'register' && (
                    <>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="auth-confirm-password-input"
                          className="block text-xs font-bold text-slate-300"
                        >
                          Xác nhận mật khẩu
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="auth-confirm-password-input"
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu để xác nhận"
                            autoComplete="new-password"
                            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((prev) => !prev)}
                            aria-label={
                              showConfirmPassword
                                ? 'Ẩn mật khẩu xác nhận'
                                : 'Hiện mật khẩu xác nhận'
                            }
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="auth-display-name"
                            className="block text-xs font-bold text-slate-300"
                          >
                            Tên hiển thị (Nickname)
                          </label>
                          <input
                            id="auth-display-name"
                            type="text"
                            maxLength={60}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Ví dụ: Minh Khang 12A7"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="auth-grade-select"
                            className="block text-xs font-bold text-slate-300"
                          >
                            Khối lớp
                          </label>
                          <select
                            id="auth-grade-select"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value as GradeLevel)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          >
                            {GRADE_CHOICES.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold text-slate-300">
                          Chọn Avatar biểu tượng
                        </span>
                        <div className="grid grid-cols-5 gap-2">
                          {AVATAR_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAvatar(opt.emoji)}
                              aria-label={`Avatar ${opt.label}`}
                              className={`py-2 rounded-xl border text-xl flex items-center justify-center transition-all ${
                                avatar === opt.emoji
                                  ? 'bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/50 scale-105'
                                  : 'bg-[#0F172A] border-blue-500/20 hover:border-blue-400'
                              }`}
                            >
                              {opt.emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-bold shadow-md shadow-blue-500/30 hover:scale-[1.01] disabled:opacity-60 transition-transform inline-flex items-center justify-center gap-2"
                  >
                    {passwordMode === 'login' ? (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>
                          {isAuthenticating ? 'Đang đăng nhập...' : 'Đăng nhập ngay'}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>
                          {isAuthenticating
                            ? 'Đang tạo tài khoản...'
                            : 'Tạo tài khoản & Ghi danh'}
                        </span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-slate-400 text-center">
                    Mật khẩu được mã hóa và bảo vệ trực tiếp bởi Firebase Authentication.
                  </p>
                </form>
              )}

              {/* Shared Auth Error Display */}
              {formError && (
                <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 p-3.5 space-y-2 text-xs text-rose-300">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                  {(formError.includes('Firebase Console') ||
                    formError.includes('Authorized Domains') ||
                    formError.includes('API Key')) && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenFirebaseSettings();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-blue-500/30 text-cyan-300 text-[11px] font-bold hover:text-white transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      Mở Cài đặt Firebase JSON
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BACKUP EXPORT / IMPORT */}
          {viewMode === 'backup' && (
            <div className="space-y-5">
              {activeAccount ? (
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-cyan-400">
                      1. Xuất mã sao lưu hồ sơ hiện tại
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyBackup}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-colors"
                    >
                      {backupCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Đã sao chép
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Sao chép mã
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={3}
                    aria-label="Mã sao lưu hồ sơ"
                    value={backupCodeOutput}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 font-mono text-[11px] text-slate-300 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400">
                    Mã này chứa toàn bộ XP, Streak, Lịch sử chat AI, Hình 2D/3D đã vẽ và Sổ tay lỗi sai để bạn sao lưu thủ công bất kỳ lúc nào.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 text-xs text-slate-300">
                  Hãy đăng nhập bằng tài khoản Firebase để đồng bộ tự động trên đám mây, hoặc dán mã sao lưu từ máy cũ vào bên dưới để khôi phục dữ liệu.
                </div>
              )}

              <form
                onSubmit={handleImportSubmit}
                className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 space-y-3"
              >
                <label
                  htmlFor="import-backup-textarea"
                  className="block text-xs font-bold text-emerald-400"
                >
                  2. Nhập mã sao lưu từ máy khác
                </label>
                <textarea
                  id="import-backup-textarea"
                  rows={3}
                  value={backupCodeInput}
                  onChange={(e) => setBackupCodeInput(e.target.value)}
                  placeholder="Dán chuỗi bắt đầu bằng MATHNOVA_V1:..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-blue-500/30 font-mono text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />

                {backupMsg && (
                  <p
                    className={`text-xs font-semibold ${
                      backupMsg.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {backupMsg.text}
                  </p>
                )}

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Khôi phục dữ liệu từ mã
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
