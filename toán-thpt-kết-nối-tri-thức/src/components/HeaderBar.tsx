import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  LayoutDashboard,
  BookOpen,
  Gamepad2,
  Bot,
  Box,
  Trophy,
  UserCircle2,
  Flame,
  FileSpreadsheet,
  Sun,
  Moon,
  ChevronDown,
  Tv,
  Flag,
  Sparkles,
  Menu,
  X,
  BookOpenText,
} from 'lucide-react';
import { AccountWorkspaceData, GradeLevel, TabId } from '../types';
import {
  calculateDaysRemainingBadge,
  getExamTargetDate,
} from '../utils/examCountdown';
import { MathNovaLogo } from './MathNovaLogo';

export type NavActionTarget =
  | { tab: TabId; arenaMode?: 'minigames' | 'millionaire'; gameType?: 'survival' }
  | { tab: 'comics' };

interface HeaderBarProps {
  grade: GradeLevel;
  onSelectGrade: (grade: GradeLevel) => void;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onLaunchArena?: (mode: 'minigames' | 'millionaire', gameType?: 'survival') => void;
  isDark: boolean;
  onToggleTheme: () => void;
  hasCustomKey: boolean;
  onOpenApiKeyModal: () => void;
  activeAccount: AccountWorkspaceData | null;
  onOpenAccountModal: () => void;
  energy: number;
  onOpenEnergyModal: () => void;
}

const GRADES: Array<{ id: GradeLevel; label: string }> = [
  { id: '10', label: 'Lớp 10' },
  { id: '11', label: 'Lớp 11' },
  { id: '12', label: 'Lớp 12' },
  { id: 'thpt', label: 'Ôn THPT' },
];

type DropdownId = 'arena' | 'tools' | null;

export const HeaderBar: React.FC<HeaderBarProps> = ({
  grade,
  onSelectGrade,
  activeTab,
  onSelectTab,
  onLaunchArena,
  isDark,
  onToggleTheme,
  hasCustomKey,
  onOpenApiKeyModal,
  activeAccount,
  onOpenAccountModal,
  energy,
  onOpenEnergyModal,
}) => {
  const [daysLeft, setDaysLeft] = useState<number>(() =>
    calculateDaysRemainingBadge(getExamTargetDate('thpt2027'))
  );
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const refreshDays = () => {
      setDaysLeft(calculateDaysRemainingBadge(getExamTargetDate('thpt2027')));
    };
    refreshDays();
    const interval = setInterval(refreshDays, 60000);
    window.addEventListener('mathnova:exam-dates-updated', refreshDays);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mathnova:exam-dates-updated', refreshDays);
    };
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const navigateDirect = (tab: TabId) => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
    onSelectTab(tab);
  };

  const navigateArena = (mode: 'minigames' | 'millionaire', gameType?: 'survival') => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
    if (onLaunchArena) {
      onLaunchArena(mode, gameType);
    } else {
      onSelectTab('games');
    }
  };

  const isArenaGroupActive = activeTab === 'games' || activeTab === 'comics';
  const isToolsGroupActive =
    activeTab === 'tutor' || activeTab === 'lab' || activeTab === 'leaderboard';

  const navBtnClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
      active
        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
        : 'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10'
    }`;

  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/95 dark:bg-[#070B19]/95 border-b border-slate-200/80 dark:border-blue-500/20 transition-colors">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 h-16 flex items-center justify-between gap-2">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => navigateDirect('dashboard')}
              className="flex items-center gap-2 cursor-pointer text-left shrink-0 whitespace-nowrap"
            >
              <MathNovaLogo size={34} />
              <div className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 whitespace-nowrap">
                <span>MathNova</span>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 dark:bg-cyan-500/20 text-blue-600 dark:text-cyan-300 text-[10px] font-bold border border-blue-500/30 dark:border-cyan-500/40">
                  AI
                </span>
              </div>
            </button>
          </div>

          {/* Center: Clean 5-Group Single-Row Desktop Nav */}
          <nav
            ref={navRef}
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-slate-100/90 dark:bg-[#0F172A]/90 border border-slate-200 dark:border-blue-500/20 shrink-0"
          >
            {/* 1. Trang chủ */}
            <button
              type="button"
              onClick={() => navigateDirect('dashboard')}
              aria-current={activeTab === 'dashboard' ? 'page' : undefined}
              className={navBtnClass(activeTab === 'dashboard')}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Trang chủ</span>
            </button>

            {/* 2. Công thức */}
            <button
              type="button"
              onClick={() => navigateDirect('formulas')}
              aria-current={activeTab === 'formulas' ? 'page' : undefined}
              className={navBtnClass(activeTab === 'formulas')}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Công thức</span>
            </button>

            {/* 3. Tạo & Trộn Đề */}
            <button
              type="button"
              onClick={() => navigateDirect('exam')}
              aria-current={activeTab === 'exam' ? 'page' : undefined}
              className={navBtnClass(activeTab === 'exam')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Tạo & Trộn Đề</span>
            </button>

            {/* 4. Dropdown: Giải trí & Đấu trường ▾ */}
            <div className="relative">
              <button
                type="button"
                data-testid="nav-dropdown-arena"
                aria-expanded={openDropdown === 'arena'}
                onClick={() =>
                  setOpenDropdown((prev) => (prev === 'arena' ? null : 'arena'))
                }
                className={navBtnClass(isArenaGroupActive || openDropdown === 'arena')}
              >
                <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                <span>Giải trí & Đấu trường</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    openDropdown === 'arena' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openDropdown === 'arena' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-2 w-64 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-blue-500/30 shadow-2xl p-1.5 z-50 space-y-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateArena('minigames', 'survival')}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/15 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2.5 transition-colors"
                  >
                    <Flag className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <div>Đảo Sinh Tồn & Mini-games</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Kho 10 đề tức thì · 4 chế độ game
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateArena('millionaire')}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/15 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2.5 transition-colors"
                  >
                    <Tv className="w-4 h-4 text-sky-500 shrink-0" />
                    <div>
                      <div>Ai Là Triệu Phú (THPT)</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Đấu trường tổng hợp 10–11–12
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    data-testid="nav-item-comics"
                    onClick={() => navigateDirect('comics')}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      activeTab === 'comics'
                        ? 'bg-blue-50 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <BookOpenText className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <div>📖 Truyện Tranh Toán Học</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Đọc truyện nhận +15 XP & +2 ⚡/ngày
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 5. Dropdown: Công cụ AI & 3D ▾ */}
            <div className="relative">
              <button
                type="button"
                data-testid="nav-dropdown-tools"
                aria-expanded={openDropdown === 'tools'}
                onClick={() =>
                  setOpenDropdown((prev) => (prev === 'tools' ? null : 'tools'))
                }
                className={navBtnClass(isToolsGroupActive || openDropdown === 'tools')}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Công cụ AI & 3D</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    openDropdown === 'tools' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openDropdown === 'tools' && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-blue-500/30 shadow-2xl p-1.5 z-50 space-y-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateDirect('tutor')}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      activeTab === 'tutor'
                        ? 'bg-blue-50 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <Bot className="w-4 h-4 text-cyan-500 shrink-0" />
                    <div>
                      <div>Gia sư AI Socratic</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Gợi mở giải toán & đọc ảnh đề
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateDirect('lab')}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      activeTab === 'lab'
                        ? 'bg-blue-50 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <Box className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <div>Đồ họa 2D/3D</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Vẽ hàm số & hình không gian Oxyz
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateDirect('leaderboard')}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      activeTab === 'leaderboard'
                        ? 'bg-blue-50 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <div>🏆 Bảng Xếp Hạng</div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Thi đua XP & Sổ tay Bẫy Sai
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* Right: Compact Grade, Compact Status Badges beside Account, Utilities */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Grade Selector (Desktop) */}
            <div className="hidden md:block">
              <label htmlFor="header-grade-select" className="sr-only">
                Chọn khối lớp
              </label>
              <select
                id="header-grade-select"
                value={grade}
                onChange={(e) => onSelectGrade(e.target.value as GradeLevel)}
                className="h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-[#0F172A]/90 border border-slate-200 dark:border-blue-500/25 text-xs font-bold text-slate-800 dark:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer whitespace-nowrap"
              >
                {GRADES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ultra-Compact Countdown & Energy Badges right beside Account */}
            <div
              data-testid="header-countdown-badge"
              title={`Còn ${daysLeft} ngày đến kỳ thi THPT 2027`}
              className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-cyan-300 text-[11px] font-extrabold whitespace-nowrap tabular-nums"
            >
              ⏳ {daysLeft}d
            </div>

            <button
              type="button"
              onClick={onOpenEnergyModal}
              title="Thể lực tri thức — Bấm để nạp thêm lượt chơi"
              className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-extrabold hover:scale-105 transition-transform whitespace-nowrap tabular-nums"
            >
              ⚡ {energy}
            </button>

            {/* Theme & Settings (Desktop) */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
              title={isDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
              className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-blue-500/20 bg-slate-100 dark:bg-[#0F172A]/80 text-slate-700 dark:text-amber-300 hover:border-blue-400 transition-all shrink-0"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onOpenApiKeyModal}
              aria-label="Cài đặt API Key và Cấu hình Firebase JSON"
              title="Cài đặt API Key và Cấu hình Firebase JSON"
              className={`hidden md:inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all shrink-0 ${
                hasCustomKey
                  ? 'border-cyan-500/40 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-blue-500/20 bg-slate-100 dark:bg-[#0F172A]/80 text-slate-700 dark:text-slate-300 hover:border-blue-400'
              }`}
            >
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            </button>

            {/* Account / Sign-in Button */}
            <button
              type="button"
              onClick={onOpenAccountModal}
              aria-label={
                activeAccount
                  ? `Tài khoản ${activeAccount.profile.displayName}`
                  : 'Tài khoản / Đăng nhập'
              }
              className={`h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                activeAccount
                  ? 'border-cyan-400/40 bg-gradient-to-r from-blue-950/90 to-cyan-950/60 text-white shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:border-cyan-300'
                  : 'border-blue-500/40 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25 hover:scale-[1.02]'
              }`}
            >
              {activeAccount ? (
                <>
                  <span className="text-sm leading-none">{activeAccount.profile.avatar}</span>
                  <span className="hidden sm:inline max-w-[90px] truncate">
                    {activeAccount.profile.displayName}
                  </span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-300 text-[10px] font-extrabold tabular-nums">
                    <Flame className="w-3 h-3" />
                    {activeAccount.progress.streak}
                  </span>
                  <span
                    data-testid="header-xp-badge"
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 text-[10px] font-extrabold tabular-nums whitespace-nowrap"
                  >
                    {activeAccount.progress.xp} XP
                  </span>
                </>
              ) : (
                <>
                  <UserCircle2 className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Đăng nhập</span>
                </>
              )}
            </button>

            {/* Mobile Hamburger Drawer Button */}
            <button
              type="button"
              data-testid="mobile-menu-toggle"
              aria-label="Mở menu điều hướng"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-blue-500/25 bg-slate-100 dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Sliding Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-blue-500/20 bg-white dark:bg-[#070B19] px-4 py-4 space-y-4 shadow-2xl max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {GRADES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGrade(g.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      grade === g.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-amber-300"
                  aria-label="Đổi giao diện Sáng/Tối"
                >
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenApiKeyModal();
                  }}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-cyan-400"
                  aria-label="Cài đặt API Key"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => navigateDirect('formulas')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-left flex items-center gap-2 text-slate-800 dark:text-slate-100"
              >
                <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Công thức 10–12</span>
              </button>
              <button
                type="button"
                onClick={() => navigateArena('millionaire')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-left flex items-center gap-2 text-slate-800 dark:text-slate-100"
              >
                <Tv className="w-4 h-4 text-sky-500 shrink-0" />
                <span>Ai Là Triệu Phú</span>
              </button>
              <button
                type="button"
                onClick={() => navigateDirect('lab')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-left flex items-center gap-2 text-slate-800 dark:text-slate-100"
              >
                <Box className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Đồ họa 2D/3D</span>
              </button>
              <button
                type="button"
                onClick={() => navigateDirect('leaderboard')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-left flex items-center gap-2 text-slate-800 dark:text-slate-100"
              >
                <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Bảng Xếp Hạng</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Minimal 5-Icon Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Điều hướng di động"
        data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#070B19]/95 backdrop-blur-xl border-t border-slate-200 dark:border-blue-500/25 px-1.5 py-1.5 grid grid-cols-5 gap-1 shadow-[0_-8px_24px_rgba(15,23,42,0.12)]"
      >
        {[
          { id: 'dashboard' as TabId, label: 'Trang chủ', icon: LayoutDashboard },
          { id: 'exam' as TabId, label: 'Đề thi', icon: FileSpreadsheet },
          { id: 'games' as TabId, label: 'Trò chơi', icon: Gamepad2 },
          { id: 'comics' as TabId, label: 'Truyện', icon: BookOpenText },
          { id: 'tutor' as TabId, label: 'Gia sư AI', icon: Bot },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateDirect(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition-colors whitespace-nowrap ${
                active
                  ? 'text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-500/15'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
