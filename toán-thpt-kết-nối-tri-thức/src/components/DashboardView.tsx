import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  BookOpen,
  Gamepad2,
  Bot,
  Box,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { ChapterData, CustomReminder, GradeLevel, TabId, UserProgress } from '../types';
import { ExamCountdownWidget } from './ExamCountdownWidget';

interface DashboardViewProps {
  grade: GradeLevel;
  chapters: ChapterData[];
  progress: UserProgress;
  isDark?: boolean;
  onToggleChapterComplete: (chapterId: string) => void;
  onToggleTopicComplete: (chapterId: string, topicIndex: number) => void;
  onNavigateTab: (tab: TabId) => void;
  onLaunchSurvival?: () => void;
  onOpenChapterFormulas: (chapterId: string) => void;
  onOpenChapterGame: (chapterId: string) => void;
  onSelectGrade: (grade: GradeLevel) => void;
  onAddReminder: (reminder: Omit<CustomReminder, 'id' | 'createdAt' | 'completed'>) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onRecordXpReward: (xp: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  isDark = false,
  onNavigateTab,
  onLaunchSurvival,
  onSelectGrade,
  progress,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onRecordXpReward,
}) => {
  const [formulaQuery, setFormulaQuery] = useState('');

  const handleSearchFormulas = (e: React.FormEvent) => {
    e.preventDefault();
    if (formulaQuery.trim()) {
      onNavigateTab('formulas');
    }
  };

  return (
    <div className="space-y-10">
      {/* Hero Section (2 Columns) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-cyan-400 text-xs font-extrabold tracking-wide uppercase">
            <Sparkles className="w-4 h-4 text-blue-700 dark:text-cyan-400" />
            <span>Toán THPT 10 · 11 · 12 • Chuẩn SGK Kết Nối Tri Thức • Hệ Sinh Thái MathNova AI</span>
          </div>

          <h1
            style={{ color: isDark ? '#ffffff' : '#0f172a' }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight !text-slate-900 dark:!text-white leading-tight"
          >
            Bứt Phá Tư Duy Toán Học <br className="hidden sm:inline" />
            <span
              style={isDark ? undefined : { color: '#1d4ed8' }}
              className="!text-blue-700 dark:!text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-blue-400 dark:via-cyan-400 dark:to-indigo-400"
            >
              Với Trợ Lý AI & Đồ Họa 3D
            </span>
          </h1>

          <p
            style={{ color: isDark ? '#cbd5e1' : '#334155' }}
            className="text-base sm:text-lg !text-slate-700 dark:!text-slate-300 leading-relaxed max-w-2xl font-medium"
          >
            Chụp ảnh giải nhanh bài tập, tự động dựng hình không gian Oxyz sắc nét, luyện đề chuẩn cấu trúc mới và chinh phục Đảo Sinh Tồn Toán Học mỗi ngày.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab('exam')}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white text-sm font-bold shadow-[0_10px_25px_rgba(37,99,235,0.3)] hover:scale-[1.02] transition-all whitespace-nowrap"
            >
              <span>🚀 Luyện Đề &amp; Trộn Đề AI →</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onLaunchSurvival) {
                  onLaunchSurvival();
                } else {
                  onNavigateTab('games');
                }
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white dark:bg-[#0F172A]/90 hover:bg-slate-100 dark:hover:bg-[#0F172A] border-2 border-slate-900 dark:border-cyan-400/60 text-slate-900 dark:text-white text-sm font-extrabold transition-all whitespace-nowrap shadow-sm hover:scale-[1.02]"
            >
              <span>🏝️ Đảo Sinh Tồn Toán Học</span>
            </button>
          </div>

          {/* Quick Formula Search Bar */}
          <form onSubmit={handleSearchFormulas} className="pt-2 max-w-xl">
            <div className="relative">
              <Search className="w-5 h-5 text-blue-600 dark:text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={formulaQuery}
                onChange={(e) => setFormulaQuery(e.target.value)}
                placeholder="Nhập từ khóa công thức cần tìm (ví dụ: tích phân, thể tích, đạo hàm...)..."
                className="w-full pl-12 pr-28 py-3.5 rounded-2xl bg-white dark:bg-[#0F172A]/90 border border-slate-200 dark:border-blue-500/30 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Tìm ngay
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Neon Glowing 3D Geometric Card (Keeps deep dark navy #0B1120 background for brilliant contrast) */}
        <div className="lg:col-span-5 relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 opacity-25 blur-xl animate-pulse" />
          <div className="relative rounded-3xl bg-[#0B1120] backdrop-blur-xl border border-cyan-500/40 p-6 sm:p-8 space-y-6 shadow-[0_20px_50px_rgba(7,11,25,0.85)] text-slate-100">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                MÔ HÌNH OXYZ & ĐỒ HỌA 3D
              </span>
              <span className="text-[11px] font-mono text-slate-400">v3.8 Flash</span>
            </div>

            {/* Neon SVG 3D Wireframe Graphic */}
            <div className="relative h-64 sm:h-72 w-full flex items-center justify-center bg-[#070B19] rounded-2xl border border-blue-500/20 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
              <svg aria-hidden="true" className="w-full h-full p-4" viewBox="0 0 300 240" fill="none">
                {/* Oxyz axes */}
                <path d="M150 190 L150 50" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4 2" />
                <path d="M70 190 L230 110" stroke="#3B82F6" strokeWidth="2" />
                <path d="M50 210 L150 190 L250 210" stroke="#8B5CF6" strokeWidth="1.5" />
                {/* Glowing 3D Sphere & Polyhedron */}
                <circle cx="150" cy="120" r="45" stroke="#06B6D4" strokeWidth="2" fill="rgba(6,182,212,0.1)" />
                <ellipse cx="150" cy="120" rx="45" ry="18" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="3 3" />
                <ellipse cx="150" cy="120" rx="18" ry="45" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="3 3" />
                <polygon points="150,70 185,140 115,140" stroke="#F59E0B" strokeWidth="2" fill="rgba(245,158,11,0.15)" />
                {/* Nodes */}
                <circle cx="150" cy="70" r="4" fill="#F59E0B" />
                <circle cx="185" cy="140" r="4" fill="#06B6D4" />
                <circle cx="115" cy="140" r="4" fill="#8B5CF6" />
                <circle cx="150" cy="120" r="5" fill="#3B82F6" />
              </svg>

              <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-xl bg-[#0F172A]/95 border border-blue-500/30 flex items-center justify-between text-xs text-white">
                <span className="font-semibold text-cyan-300">Mặt cầu & Khối chóp Oxyz</span>
                <span className="text-[11px] text-emerald-400 font-bold">✓ Tự động dựng hình</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                <div className="text-lg font-extrabold text-cyan-400">24 Chương</div>
                <div className="text-[11px] text-slate-400">Chuẩn SGK 10–12</div>
              </div>
              <div className="rounded-xl bg-[#070B19] border border-blue-500/20 p-3 text-center">
                <div className="text-lg font-extrabold text-indigo-400">100% Socratic AI</div>
                <div className="text-[11px] text-slate-400">Gợi mở từng bước</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Exam Countdown & Custom Schedule/Reminders Widget */}
      <section className="pt-2">
        <ExamCountdownWidget
          reminders={progress.customReminders || []}
          onAddReminder={onAddReminder}
          onToggleReminder={onToggleReminder}
          onDeleteReminder={onDeleteReminder}
          onRecordXpReward={onRecordXpReward}
        />
      </section>

      {/* Grid of Feature & Grade Cards (3-4 Columns with Top Color Accent Borders) */}
      <section aria-label="Các tính năng trọng tâm" className="space-y-6 pt-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Hệ Thống Luyện Thi & Khám Phá Toàn Diện
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Lựa chọn chuyên đề hoặc khối lớp để bắt đầu hành trình chinh phục điểm 10 môn Toán.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Card 1: Lớp 10 & Hình học AI (Blue #3B82F6) */}
          <div className="rounded-3xl bg-white dark:bg-[#0F172A]/80 border border-slate-200 dark:border-blue-500/20 border-t-4 border-t-[#3B82F6] p-6 space-y-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(7,11,25,0.6)] hover:border-blue-400/50 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/20 text-[#3B82F6] flex items-center justify-center font-bold shadow-xs">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Toán Lớp 10 & Nền Tảng</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Mệnh đề, vectơ mặt phẳng, hàm số bậc hai và hệ thống xác suất thống kê cốt lõi.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Mệnh đề & Tập hợp</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Bất phương trình & Parabol</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Vectơ và hệ thức lượng</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => {
                onSelectGrade('10');
                onNavigateTab('dashboard');
              }}
              className="w-full mt-2 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-600 text-[#3B82F6] hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Vào học Lớp 10</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Lớp 11 & Đồ họa 2D/3D (Emerald #10B981) */}
          <div className="rounded-3xl bg-white dark:bg-[#0F172A]/80 border border-slate-200 dark:border-blue-500/20 border-t-4 border-t-[#10B981] p-6 space-y-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(7,11,25,0.6)] hover:border-emerald-400/50 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/20 text-[#10B981] flex items-center justify-center font-bold shadow-xs">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Toán Lớp 11 & Đồ Họa</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Lượng giác, dãy số, mũ - lôgarit, đạo hàm và quan hệ vuông góc trong không gian.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Lượng giác & Cấp số cộng/nhân</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Quan hệ vuông góc Oxyz</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Đạo hàm & Mũ lôgarit</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => {
                onSelectGrade('11');
                onNavigateTab('dashboard');
              }}
              className="w-full mt-2 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-[#10B981] hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Vào học Lớp 11</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Lớp 12 & Triệu phú AI (Amber #F59E0B) */}
          <div className="rounded-3xl bg-white dark:bg-[#0F172A]/80 border border-slate-200 dark:border-blue-500/20 border-t-4 border-t-[#F59E0B] p-6 space-y-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(7,11,25,0.6)] hover:border-amber-400/50 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/20 text-[#F59E0B] flex items-center justify-center font-bold shadow-xs">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Toán Lớp 12 & Trò Chơi</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Ứng dụng đạo hàm khảo sát hàm số, nguyên hàm tích phân và tọa độ Oxyz nâng cao.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Khảo sát hàm số & Tiệm cận</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Nguyên hàm & Thể tích tròn xoay</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Oxyz: Mặt phẳng, Đường thẳng</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => {
                onSelectGrade('12');
                onNavigateTab('games');
              }}
              className="w-full mt-2 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-600/20 hover:bg-amber-600 text-[#F59E0B] hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Vào Đấu Trường Game</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 4: Ôn thi THPT & Socratic AI (Purple #8B5CF6) */}
          <div className="rounded-3xl bg-white dark:bg-[#0F172A]/80 border border-slate-200 dark:border-blue-500/20 border-t-4 border-t-[#8B5CF6] p-6 space-y-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(7,11,25,0.6)] hover:border-purple-400/50 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/20 text-[#8B5CF6] flex items-center justify-center font-bold shadow-xs">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Ôn Thi THPT & Socratic AI</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Đấu trường Ai Là Triệu Phú chuẩn cấu trúc 3 định dạng đề thi mới & trợ lý AI gợi mở 24/7.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>Ai Là Triệu Phú (10-20-70)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>Đúng/Sai & Trả lời ngắn</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>Gia sư AI phản hồi tức thì</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => {
                onSelectGrade('thpt');
                onNavigateTab('games');
              }}
              className="w-full mt-2 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-600/20 hover:bg-purple-600 text-[#8B5CF6] hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Vào Đấu Trường THPT</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlight Banner */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-[0_20px_50px_rgba(37,99,235,0.25)] text-white">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/20 text-white text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-cyan-200" />
            <span>Cam kết chất lượng GDPT 2018</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Nền Tảng Đột Phá Cho Học Sinh & Giáo Viên Toán
          </h2>
          <p className="text-sm text-blue-100 leading-relaxed">
            Hệ thống tự động loại bỏ các chuyên đề cũ không còn trong chương trình (như số phức hay hệ 3 ẩn thủ công), tập trung 100% vào tư duy thực tiễn, không gian Oxyz và ứng dụng đạo hàm tích phân.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('tutor')}
            className="px-6 py-3.5 rounded-2xl bg-white text-blue-700 text-sm font-extrabold shadow-md hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            Trò chuyện với Gia Sư AI
          </button>
        </div>
      </section>
    </div>
  );
};
