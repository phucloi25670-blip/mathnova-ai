import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Plus,
  CheckCircle2,
  Trash2,
  Bell,
  Download,
  AlertCircle,
  X,
  Pencil,
} from 'lucide-react';
import { CustomReminder } from '../types';
import {
  calculateCountdownParts,
  calculateDaysRemainingBadge,
  DEFAULT_EXAM_MILESTONES,
  ExamMilestone,
  getExamTargetDate,
  loadSavedExamDates,
  saveExamDates,
} from '../utils/examCountdown';

interface ExamCountdownWidgetProps {
  reminders: CustomReminder[];
  onAddReminder: (reminder: Omit<CustomReminder, 'id' | 'createdAt' | 'completed'>) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onRecordXpReward: (xp: number) => void;
}

const MOTIVATIONAL_QUOTES = [
  "Hôm nay nỗ lực 1%, ngày mai bứt phá 100%. Toán học không khó, quan trọng là bạn đã luyện đúng phương pháp!",
  "Đừng đếm những gì đã qua, hãy nhìn những gì sắp tới và làm cho nó tốt nhất.",
  "Mỗi công thức ghi nhớ hôm nay là một bước tiến vững chắc tới điểm 10 THPT Quốc gia.",
  "Tư duy logic và kiên trì là chìa khóa mở mọi cánh cửa thành công.",
  "Thử thách hôm nay chính là bàn đạp cho thành tựu ngày mai của bạn tại MathNova AI.",
];

function downloadIcsFile(title: string, targetDateIso: string) {
  const dt = new Date(targetDateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatIcsDate = (d: Date) =>
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z';

  const dtStart = formatIcsDate(dt);
  const endDate = new Date(dt.getTime() + 3600 * 1000);
  const dtEnd = formatIcsDate(endDate);

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MathNova AI//Study Planner//VI',
    'BEGIN:VEVENT',
    `UID:mathnova-${Date.now()}@mathnova.ai`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Lịch học MathNova: ${title}`,
    `DESCRIPTION:Mục tiêu học tập cá nhân trên nền tảng MathNova AI.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-zA-Z0-9à-úÀ-Ú]/g, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '2027-06-10T07:30';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ExamCountdownWidget: React.FC<ExamCountdownWidgetProps> = ({
  reminders,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onRecordXpReward,
}) => {
  const [selectedExamId, setSelectedExamId] = useState<ExamMilestone['id']>('thpt2027');
  const [customExamDates, setCustomExamDates] = useState<Record<string, string>>(() =>
    loadSavedExamDates()
  );
  const [now, setNow] = useState<number>(Date.now());

  // Edit exam date inline state
  const [isEditingExamDate, setIsEditingExamDate] = useState<boolean>(false);
  const [editDateInput, setEditDateInput] = useState<string>('');

  // Modal / Form state for adding custom reminder
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');
  const [customPriority, setCustomPriority] = useState<'high' | 'medium' | 'normal'>('medium');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Daily quote based on day of year
  const dailyQuote = useMemo(() => {
    const startOfYear = new Date(new Date().getFullYear(), 0, 0).getTime();
    const diff = now - startOfYear;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
  }, [now]);

  const activeExam =
    DEFAULT_EXAM_MILESTONES.find((e) => e.id === selectedExamId) ||
    DEFAULT_EXAM_MILESTONES[0];
  const activeTargetDate = getExamTargetDate(activeExam.id, customExamDates);

  const examTime = calculateCountdownParts(activeTargetDate, now);
  const daysRemainingBadge = calculateDaysRemainingBadge(activeTargetDate, now);

  const handleOpenEditDate = () => {
    setEditDateInput(toDatetimeLocalValue(activeTargetDate));
    setIsEditingExamDate(true);
  };

  const handleSaveCustomExamDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDateInput) return;
    const parsed = new Date(editDateInput);
    if (Number.isNaN(parsed.getTime())) return;
    const next = {
      ...customExamDates,
      [activeExam.id]: parsed.toISOString(),
    };
    setCustomExamDates(next);
    saveExamDates(next);
    setIsEditingExamDate(false);
  };

  const handleResetExamDate = () => {
    const next = { ...customExamDates };
    delete next[activeExam.id];
    setCustomExamDates(next);
    saveExamDates(next);
    setIsEditingExamDate(false);
  };

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customDate) {
      setFormError('Vui lòng nhập tên sự kiện và chọn thời gian.');
      return;
    }
    const targetMs = new Date(customDate).getTime();
    if (targetMs <= Date.now()) {
      setFormError('Thời gian hẹn phải ở tương lai.');
      return;
    }

    onAddReminder({
      title: customTitle.trim(),
      targetDate: new Date(customDate).toISOString(),
      priority: customPriority,
    });

    setCustomTitle('');
    setCustomDate('');
    setCustomPriority('medium');
    setFormError(null);
    setIsModalOpen(false);
  };

  const requestBrowserNotification = () => {
    if (!('Notification' in window)) {
      return;
    }
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification('MathNova AI — Nhắc Nhở Học Tập', {
          body: 'Đã bật thông báo thành công! Chúng tôi sẽ nhắc bạn đúng giờ hẹn.',
          icon: '/favicon.ico',
        });
      }
    });
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-blue-500/30 dark:border-cyan-500/40 p-6 sm:p-7 shadow-[0_12px_40px_rgba(37,99,235,0.12)] space-y-6 transition-colors">
      {/* Header & Exam Countdown Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-cyan-400 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>Đếm Ngược Kỳ Thi & Lịch Hẹn 2027</span>
            </div>
            <span
              data-testid="widget-countdown-days-badge"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-extrabold tabular-nums"
            >
              ⏳ Còn {daysRemainingBadge} ngày
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeExam.name}
            </h2>
            <button
              type="button"
              onClick={handleOpenEditDate}
              aria-label="Sửa ngày thi"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              <span>Sửa ngày thi</span>
            </button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 italic">
            "{dailyQuote}"
          </p>
        </div>

        {/* Milestone Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 self-start lg:self-auto">
          {DEFAULT_EXAM_MILESTONES.map((exam) => {
            const active = exam.id === selectedExamId;
            return (
              <button
                key={exam.id}
                type="button"
                onClick={() => {
                  setSelectedExamId(exam.id);
                  setIsEditingExamDate(false);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {exam.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {isEditingExamDate && (
        <form
          onSubmit={handleSaveCustomExamDate}
          className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-blue-200 dark:border-blue-800 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="edit-exam-date-input" className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Tùy chỉnh ngày giờ cho {activeExam.shortLabel}:
            </label>
            <input
              id="edit-exam-date-input"
              type="datetime-local"
              value={editDateInput}
              onChange={(e) => setEditDateInput(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Lưu ngày thi
            </button>
            {customExamDates[activeExam.id] && (
              <button
                type="button"
                onClick={handleResetExamDate}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Khôi phục mặc định
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsEditingExamDate(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Real-time Countdown Timer Display Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-blue-950/50 border border-blue-200 dark:border-blue-800/60 p-4 text-center shadow-xs">
          <div
            data-testid="countdown-days-value"
            className="text-3xl sm:text-4xl font-black text-blue-700 dark:text-cyan-400 tabular-nums"
          >
            {String(daysRemainingBadge).padStart(2, '0')}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">
            Ngày
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-blue-950/50 border border-blue-200 dark:border-blue-800/60 p-4 text-center shadow-xs">
          <div className="text-3xl sm:text-4xl font-black text-blue-700 dark:text-cyan-400 tabular-nums">
            {String(examTime.hours).padStart(2, '0')}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">
            Giờ
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-blue-950/50 border border-blue-200 dark:border-blue-800/60 p-4 text-center shadow-xs">
          <div className="text-3xl sm:text-4xl font-black text-blue-700 dark:text-cyan-400 tabular-nums">
            {String(examTime.mins).padStart(2, '0')}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">
            Phút
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-blue-950/50 border border-blue-200 dark:border-blue-800/60 p-4 text-center shadow-xs">
          <div className="text-3xl sm:text-4xl font-black text-blue-700 dark:text-cyan-400 tabular-nums">
            {String(examTime.secs).padStart(2, '0')}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">
            Giây
          </div>
        </div>
      </div>

      {/* Custom Schedule & Reminders Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Lịch Hẹn & Mục Tiêu Cá Nhân</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tự tạo lịch ôn thi riêng, tích cực hoàn thành để nhận +15 XP vào tài khoản.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestBrowserNotification}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span>Bật Thông Báo</span>
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:scale-[1.02] transition-transform"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm lịch hẹn / Mục tiêu</span>
            </button>
          </div>
        </div>

        {/* Reminders List */}
        {reminders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Chưa có lịch hẹn cá nhân nào được tạo.
            </p>
            <p className="text-[11px] text-slate-400">
              Bấm "+ Thêm lịch hẹn / Mục tiêu" để ghi nhớ lịch làm bài kiểm tra hoặc ôn tập chuyên đề.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {reminders.map((rem) => {
              const remTime = calculateCountdownParts(rem.targetDate, now);
              const priorityClass =
                rem.priority === 'high'
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : rem.priority === 'medium'
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800';

              return (
                <div
                  key={rem.id}
                  className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    rem.completed
                      ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-70 line-through'
                      : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!rem.completed) {
                          onRecordXpReward(15);
                        }
                        onToggleReminder(rem.id);
                      }}
                      className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                        rem.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-400 dark:border-slate-500 hover:border-blue-600'
                      }`}
                    >
                      {rem.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {rem.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase shrink-0 ${priorityClass}`}>
                          {rem.priority === 'high' ? 'Ưu tiên cao' : rem.priority === 'medium' ? 'Quan trọng' : 'Bình thường'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Thời hạn: {new Date(rem.targetDate).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                    {!rem.completed && !remTime.isPast && (
                      <span className="text-xs font-bold text-blue-600 dark:text-cyan-400 tabular-nums px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
                        Còn {remTime.days} ngày {remTime.hours}h {remTime.mins}p
                      </span>
                    )}
                    {remTime.isPast && !rem.completed && (
                      <span className="text-xs font-bold text-rose-500 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40">
                        Đã quá hạn
                      </span>
                    )}

                    <button
                      type="button"
                      title="Tải file lịch .ics để đồng bộ Google/Apple Calendar"
                      onClick={() => downloadIcsFile(rem.title, rem.targetDate)}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title="Xóa sự kiện"
                      onClick={() => onDeleteReminder(rem.id)}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Reminder Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-blue-500/30 p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Thêm Lịch Hẹn & Mục Tiêu Mới
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-4">
              {formError && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tên sự kiện / Mục tiêu học tập
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="VD: Thi thử Toán lần 1, Ôn xong chương Oxyz..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Thời gian diễn ra
                </label>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mức độ ưu tiên
                </label>
                <select
                  value={customPriority}
                  onChange={(e) => setCustomPriority(e.target.value as 'high' | 'medium' | 'normal')}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">🔴 Ưu tiên cao (Thi cử / Cấp bách)</option>
                  <option value="medium">🟡 Quan trọng (Ôn tập chuyên đề)</option>
                  <option value="normal">🔵 Bình thường (Luyện tập hàng ngày)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  Tạo Lịch Hẹn (+15 XP)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
