import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Flame,
  Sparkles,
  BookX,
  CheckCircle2,
  Trash2,
  UserPlus,
  Medal,
  RotateCcw,
  Users,
  AlertCircle,
} from 'lucide-react';
import { AccountWorkspaceData, WrongQuestionEntry } from '../types';
import {
  buildRankedLeaderboard,
  RealLeaderboardUser,
} from '../utils/accountStore';
import { MathText } from './MathText';

interface LeaderboardViewProps {
  activeAccount: AccountWorkspaceData | null;
  realUsers: RealLeaderboardUser[];
  isLoadingLeaderboard?: boolean;
  leaderboardError?: string | null;
  wrongNotebook: WrongQuestionEntry[];
  onToggleWrongMastered: (entryId: string) => void;
  onDeleteWrongEntry: (entryId: string) => void;
  onOpenAccountModal: () => void;
  onPracticeGames: () => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  activeAccount,
  realUsers,
  isLoadingLeaderboard = false,
  leaderboardError = null,
  wrongNotebook,
  onToggleWrongMastered,
  onDeleteWrongEntry,
  onOpenAccountModal,
  onPracticeGames,
}) => {
  const [subTab, setSubTab] = useState<'ranking' | 'notebook'>('ranking');
  const [sortBy, setSortBy] = useState<'streak' | 'xp'>('streak');
  const [notebookFilter, setNotebookFilter] = useState<'unmastered' | 'all'>('unmastered');

  const rankedList = useMemo(
    () =>
      buildRankedLeaderboard(
        realUsers,
        sortBy,
        activeAccount?.profile.id ?? null
      ),
    [realUsers, sortBy, activeAccount?.profile.id]
  );

  const currentUserEntry = rankedList.find((e) => e.isCurrentUser) ?? null;
  const nextAboveUser =
    currentUserEntry && currentUserEntry.rank > 1
      ? rankedList.find((e) => e.rank === currentUserEntry.rank - 1) ?? null
      : null;

  const filteredWrongList = useMemo(() => {
    if (notebookFilter === 'all') return wrongNotebook;
    return wrongNotebook.filter((w) => !w.mastered);
  }, [wrongNotebook, notebookFilter]);

  const unmasteredCount = wrongNotebook.filter((w) => !w.mastered).length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 p-6 sm:p-7 text-white shadow-[0_20px_50px_-15px_rgba(37,99,235,0.4)] border border-blue-400/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/20 backdrop-blur-md text-xs font-bold text-white mb-1">
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Đấu Trường Thi Đua Thời Gian Thực & Sổ Tay Bẫy Sai</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Bảng Xếp Hạng Streak & Sổ Tay Bẫy Sai
          </h1>
          <p className="text-sm text-blue-100/90">
            100% học viên thật từ Cloud Firestore — hoàn thành bài luyện tập hoặc vẽ hình 2D/3D mỗi ngày để tăng Streak 🔥 và leo Top MathNova AI.
          </p>
        </div>

        {!activeAccount ? (
          <button
            type="button"
            onClick={onOpenAccountModal}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-slate-950 text-xs sm:text-sm font-extrabold shadow-lg hover:scale-105 transition-transform shrink-0 self-start lg:self-auto"
          >
            <UserPlus className="w-4 h-4 text-blue-600" />
            Đăng nhập để ghi danh lên Bảng Vàng
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/40 backdrop-blur-md border border-white/20 shrink-0 self-start lg:self-auto">
            <span className="text-2xl">{activeAccount.profile.avatar}</span>
            <div>
              <div className="text-xs font-bold text-white">
                {activeAccount.profile.displayName} · Hạng #{currentUserEntry?.rank ?? '-'}
              </div>
              <div className="text-[11px] text-cyan-200 flex items-center gap-2.5 mt-0.5 tabular-nums">
                <span className="inline-flex items-center gap-1 text-orange-300 font-bold">
                  🔥 {activeAccount.progress.streak} ngày
                </span>
                <span>⚡ {activeAccount.progress.xp} XP</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Sub-tabs */}
      <div
        role="group"
        aria-label="Chuyển mục Bảng xếp hạng và Sổ tay lỗi sai"
        className="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl bg-[#0F172A]/80 border border-blue-500/20"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('ranking')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'ranking'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>Bảng Xếp Hạng Streak & XP</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('notebook')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              subTab === 'notebook'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookX className="w-4 h-4 text-rose-400" />
            <span>Sổ Tay Lỗi Sai</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-extrabold tabular-nums">
              {unmasteredCount}
            </span>
          </button>
        </div>

        {subTab === 'ranking' && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#070B19] border border-blue-500/20">
            <button
              type="button"
              onClick={() => setSortBy('streak')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 ${
                sortBy === 'streak'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Theo Chuỗi Streak
            </button>
            <button
              type="button"
              onClick={() => setSortBy('xp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 ${
                sortBy === 'xp'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Theo Điểm XP
            </button>
          </div>
        )}
      </div>

      {subTab === 'ranking' ? (
        <div className="space-y-6">
          {leaderboardError && (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 p-4 flex items-center gap-2.5 text-xs text-rose-300 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{leaderboardError}</span>
            </div>
          )}

          {/* Motivational overtake banner */}
          {currentUserEntry && nextAboveUser && (
            <div className="rounded-2xl bg-[#0F172A]/90 border border-cyan-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-slate-200">
                Bạn đang đứng <strong className="text-cyan-400">Hạng #{currentUserEntry.rank}</strong>. Chỉ cần thêm{' '}
                {sortBy === 'streak' ? (
                  <strong className="text-orange-400">
                    {Math.max(1, nextAboveUser.streak - currentUserEntry.streak + 1)} ngày Streak 🔥
                  </strong>
                ) : (
                  <strong className="text-cyan-300">
                    {Math.max(10, nextAboveUser.xp - currentUserEntry.xp + 1)} XP
                  </strong>
                )}{' '}
                nữa để vượt qua <strong>{nextAboveUser.displayName}</strong> (Hạng #{nextAboveUser.rank})!
              </div>
              <button
                type="button"
                onClick={onPracticeGames}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold whitespace-nowrap self-start sm:self-auto"
              >
                Cày XP ngay
              </button>
            </div>
          )}

          {isLoadingLeaderboard && rankedList.length === 0 ? (
            <div className="rounded-3xl bg-[#0F172A]/80 border border-blue-500/20 p-10 text-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs text-slate-400">
                Đang tải Bảng Xếp Hạng thời gian thực từ Cloud Firestore...
              </p>
            </div>
          ) : rankedList.length === 0 ? (
            <section className="rounded-3xl bg-[#0F172A]/90 border border-blue-500/25 p-8 sm:p-12 text-center space-y-4 shadow-[0_12px_32px_rgba(7,11,25,0.6)]">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  Chưa có học viên nào trên Bảng Vàng thực tế
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  MathNova AI chỉ hiển thị 100% học viên thật đã đăng nhập hoặc đăng ký tài khoản trên hệ thống. Hãy đăng nhập ngay để trở thành người đầu tiên ghi danh lên Bảng Vàng!
                </p>
              </div>
              {!activeAccount && (
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-500/30 hover:scale-[1.02] transition-transform"
                >
                  <UserPlus className="w-4 h-4" />
                  Đăng nhập để ghi danh ngay
                </button>
              )}
            </section>
          ) : (
            <>
              {/* Top 3 Podium */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {rankedList.slice(0, 3).map((student, idx) => {
                  const borderStyle =
                    idx === 0
                      ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/15 to-[#0F172A]'
                      : idx === 1
                      ? 'border-slate-300/40 bg-gradient-to-b from-slate-400/10 to-[#0F172A]'
                      : 'border-orange-500/40 bg-gradient-to-b from-orange-500/10 to-[#0F172A]';
                  const medalColor =
                    idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-orange-400';

                  return (
                    <div
                      key={student.id}
                      className={`rounded-3xl border p-5 flex items-center justify-between gap-4 shadow-lg ${borderStyle} ${
                        student.isCurrentUser ? 'ring-2 ring-cyan-400' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-[#070B19] border border-blue-500/20 flex items-center justify-center text-2xl">
                            {student.avatar}
                          </div>
                          <span
                            className={`absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#070B19] border border-current flex items-center justify-center text-xs font-extrabold ${medalColor}`}
                          >
                            {student.rank}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-white truncate flex items-center gap-1.5">
                            <span>{student.displayName}</span>
                            {student.isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px]">
                                Bạn
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {student.grade === 'thpt' ? 'Ôn thi THPT' : `Lớp ${student.grade}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <div className="text-sm font-extrabold text-orange-400">
                          🔥 {student.streak} ngày
                        </div>
                        <div className="text-xs font-bold text-cyan-300">
                          {student.xp.toLocaleString('vi-VN')} XP
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full Ranking List */}
              <section className="rounded-3xl bg-[#0F172A]/90 border border-blue-500/20 overflow-hidden shadow-[0_12px_32px_rgba(7,11,25,0.6)]">
                <div className="px-6 py-4 border-b border-blue-500/20 bg-[#070B19] flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Medal className="w-4 h-4 text-cyan-400" />
                    Top Học Viên Thực Tế ({rankedList.length} thành viên)
                  </h2>
                  <span className="text-xs text-slate-400">
                    Đồng bộ trực tiếp Cloud Firestore
                  </span>
                </div>

                <div className="divide-y divide-blue-500/10">
                  {rankedList.map((entry) => (
                    <div
                      key={entry.id}
                      className={`px-6 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                        entry.isCurrentUser
                          ? 'bg-cyan-500/10 border-l-4 border-l-cyan-400'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span
                          className={`w-7 text-center text-sm font-extrabold tabular-nums ${
                            entry.rank === 1
                              ? 'text-amber-400'
                              : entry.rank === 2
                              ? 'text-slate-300'
                              : entry.rank === 3
                              ? 'text-orange-400'
                              : 'text-slate-500'
                          }`}
                        >
                          #{entry.rank}
                        </span>
                        <span className="text-2xl shrink-0">{entry.avatar}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate flex items-center gap-2">
                            <span>{entry.displayName}</span>
                            {entry.isCurrentUser && (
                              <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold">
                                Hồ sơ của bạn
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {entry.grade === 'thpt' ? 'Ôn thi THPT' : `Khối Lớp ${entry.grade}`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 shrink-0 tabular-nums">
                        <div className="text-right">
                          <div className="text-xs sm:text-sm font-extrabold text-orange-400">
                            🔥 {entry.streak} ngày
                          </div>
                          <div className="text-[10px] text-slate-500">Streak</div>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <div className="text-xs sm:text-sm font-extrabold text-cyan-300">
                            {entry.xp.toLocaleString('vi-VN')} XP
                          </div>
                          <div className="text-[10px] text-slate-500">Điểm tích lũy</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      ) : (
        /* Wrong-Answer Notebook */
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotebookFilter('unmastered')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  notebookFilter === 'unmastered'
                    ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                    : 'bg-[#0F172A] border border-blue-500/20 text-slate-400 hover:text-white'
                }`}
              >
                Cần ôn lại ({unmasteredCount})
              </button>
              <button
                type="button"
                onClick={() => setNotebookFilter('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  notebookFilter === 'all'
                    ? 'bg-blue-500/20 border border-blue-500/40 text-cyan-300'
                    : 'bg-[#0F172A] border border-blue-500/20 text-slate-400 hover:text-white'
                }`}
              >
                Tất cả ({wrongNotebook.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onPracticeGames}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold"
            >
              Luyện tập thêm ở Đấu Trường
            </button>
          </div>

          {filteredWrongList.length === 0 ? (
            <div className="rounded-3xl bg-[#0F172A]/80 border border-blue-500/20 p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                {wrongNotebook.length === 0
                  ? 'Sổ tay lỗi sai đang trống!'
                  : 'Bạn đã ôn xong toàn bộ câu lỗi sai!'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Mỗi khi bạn trả lời sai câu hỏi trong Đấu trường Game hoặc Kiểm tra nhanh 30 giây, hệ thống sẽ tự động lưu lại câu hỏi và đáp án chuẩn vào đây để bạn ôn tập.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredWrongList.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-3xl bg-[#0F172A]/90 border p-5 sm:p-6 space-y-4 transition-all ${
                    item.mastered
                      ? 'border-emerald-500/30 opacity-75'
                      : 'border-rose-500/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-cyan-300 font-bold">
                        Lớp {item.grade} · {item.chapterTitle}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
                        Sai {item.wrongCount} lần
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleWrongMastered(item.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          item.mastered
                            ? 'bg-slate-800 text-slate-300 hover:text-white'
                            : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                        }`}
                      >
                        {item.mastered ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            Ôn lại
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đánh dấu đã hiểu
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteWrongEntry(item.id)}
                        aria-label="Xóa câu khỏi sổ tay lỗi sai"
                        className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-sm sm:text-base font-bold text-white leading-relaxed math-wrap">
                    <MathText text={item.prompt} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-3.5 space-y-1">
                      <div className="font-bold text-rose-400">Đáp án bạn đã chọn:</div>
                      <div className="text-slate-200 math-wrap">
                        <MathText text={item.userAnswerText} />
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/30 p-3.5 space-y-1">
                      <div className="font-bold text-emerald-400">Đáp án đúng:</div>
                      <div className="text-slate-100 font-semibold math-wrap">
                        <MathText text={item.correctAnswerText} />
                      </div>
                    </div>
                  </div>

                  {item.explanation && (
                    <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 text-xs text-slate-300 leading-relaxed math-wrap">
                      <strong className="text-cyan-400 block mb-1">Giải thích chi tiết:</strong>
                      <MathText text={item.explanation} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
