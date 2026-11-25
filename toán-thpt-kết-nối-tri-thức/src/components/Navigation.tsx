import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Gamepad2,
  Bot,
  Box,
  Flame,
  Trophy,
} from 'lucide-react';
import { TabId, UserProgress } from '../types';

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  progress: UserProgress;
}

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Trang chủ', mobileLabel: 'Trang chủ', icon: LayoutDashboard },
  { id: 'formulas', label: 'Kho công thức', mobileLabel: 'Công thức', icon: BookOpen },
  { id: 'games', label: 'Đấu trường Game', mobileLabel: 'Game', icon: Gamepad2 },
  { id: 'tutor', label: 'Gia sư AI', mobileLabel: 'Gia sư', icon: Bot },
  { id: 'lab', label: 'Phòng thí nghiệm 2D/3D', mobileLabel: '2D / 3D', icon: Box },
];

export const DesktopSidebar: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  progress,
}) => {
  return (
    <aside className="hidden lg:flex lg:w-68 lg:shrink-0 lg:flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-r border-slate-200/80 dark:border-slate-800/80 min-h-screen sticky top-0 h-screen">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center font-extrabold text-base shrink-0 shadow-sm shadow-blue-500/25">
            Σ
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              Toán THPT 2018
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Kết nối tri thức 10–12
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Điều hướng chính" className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all duration-200 text-left ${
                active
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 m-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span>Tiến độ học tập</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{progress.streak} ngày</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
            <Trophy className="w-4 h-4 shrink-0" />
            <span>{progress.xp} XP</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export const MobileBottomNav: React.FC<Omit<NavigationProps, 'progress'>> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav
      aria-label="Điều hướng di động"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800/80 px-2 py-1.5 shadow-lg"
    >
      <div className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[48px] px-1 py-1 rounded-xl text-[11px] font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5 shrink-0" />
              <span className="truncate max-w-full">{item.mobileLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
