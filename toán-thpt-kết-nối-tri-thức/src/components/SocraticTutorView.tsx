import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  Bot,
  AlertCircle,
  Sparkles,
  Square,
  Camera,
  X,
  Loader2,
} from 'lucide-react';
import { ChatMessage, GradeLevel } from '../types';
import { streamTutorMessageApi } from '../utils/api';
import { createDefaultWelcomeChat } from '../utils/accountStore';
import { prepareImageForVision } from '../utils/imageUtils';
import { MathText } from './MathText';

interface SocraticTutorViewProps {
  grade: GradeLevel;
  onOpenApiKeyModal: () => void;
  accountKey?: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (msgs: ChatMessage[]) => void;
  onRecordActivity?: () => void;
  onAddEnergy?: (amount: number) => void;
}

const STARTER_PROMPTS: Record<GradeLevel, string[]> = {
  '10': [
    'Em muốn tối ưu lợi nhuận cho bài toán hệ bất phương trình bậc nhất hai ẩn, bước đầu tiên cần đặt ẩn như thế nào ạ?',
    'Làm sao biết khi nào dùng Định lí Côsin và khi nào dùng Định lí Sin để đo khoảng cách thực tế qua hồ nước?',
    'Thầy/cô gợi ý cho em cách tính xác suất biến cố "có ít nhất một" bằng biến cố đối với ạ!',
  ],
  '11': [
    'Chị em gửi tiết kiệm lãi kép ngân hàng theo cấp số nhân, em nên thiết lập công thức số tiền sau n năm thế nào?',
    'Làm thế nào để xác định góc phẳng nhị diện giữa hai mặt phẳng trong hình chóp đều?',
    'Giúp em hiểu ý nghĩa của đạo hàm khi tính vận tốc tức thời từ phương trình quãng đường s(t)!',
  ],
  '12': [
    'Em cần tìm đường tiệm cận xiên của đồ thị hàm phân thức bậc hai trên bậc nhất, em nên bắt đầu chia đa thức ra sao?',
    'Cách thiết lập tích phân tính thể tích vật thể tròn xoay quay quanh trục Ox là gì ạ?',
    'Trong không gian Oxyz, để viết phương trình mặt cầu đi qua trạm phát sóng và bán kính cho trước thì cần xác định gì?',
  ],
  thpt: [
    'Gợi ý em từng bước giải bài toán thực tế Công thức Bayes về độ chính xác của bộ xét nghiệm y khoa!',
    'Trong bài toán tối ưu chi phí hình hộp chữ nhật bằng đạo hàm, làm sao tìm tập xác định của biến x?',
    'Phân biệt giúp em khi nào dùng công thức tính khoảng cách từ điểm đến mặt phẳng trong Oxyz!',
  ],
};

export const SocraticTutorView: React.FC<SocraticTutorViewProps> = ({
  grade,
  onOpenApiKeyModal,
  accountKey = 'guest',
  initialMessages,
  onMessagesChange,
  onRecordActivity,
  onAddEnergy,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : createDefaultWelcomeChat()
  );
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.8-flash');
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeAccountKeyRef = useRef<string>(accountKey);
  const skipNextSyncRef = useRef<boolean>(false);

  // Sync messages when switching accounts
  useEffect(() => {
    if (activeAccountKeyRef.current !== accountKey) {
      abortRef.current?.abort();
      abortRef.current = null;
      setIsSending(false);
      setStreamingMsgId(null);
      setFallbackStatus(null);
      setErrorMsg(null);
      setPendingImage(null);
      activeAccountKeyRef.current = accountKey;
      skipNextSyncRef.current = true;
      setMessages(
        initialMessages && initialMessages.length > 0
          ? initialMessages
          : createDefaultWelcomeChat()
      );
    }
  }, [accountKey, initialMessages]);

  // Persist messages back to active account workspace
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (activeAccountKeyRef.current === accountKey && onMessagesChange) {
      onMessagesChange(messages);
    }
  }, [messages, accountKey, onMessagesChange]);

  useEffect(() => {
    if (messages.length > 1 || isSending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleStopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    setStreamingMsgId(null);
    setFallbackStatus(null);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsPreparingImage(true);
    setErrorMsg(null);
    try {
      const prepared = await prepareImageForVision(file);
      setPendingImage({
        dataUrl: prepared.dataUrl,
        name: file.name || 'anh-de-bai.jpg',
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể xử lý ảnh đã chọn.'
      );
    } finally {
      setIsPreparingImage(false);
    }
  };

  const sendPrompt = async (text: string) => {
    const trimmed = text.trim();
    const attachedImage = pendingImage?.dataUrl;
    if ((!trimmed && !attachedImage) || isSending) return;

    const finalText =
      trimmed ||
      'Hãy nhận diện đề bài toán trong ảnh này và gợi ý bước đầu tiên theo phương pháp Socratic giúp em nhé!';

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: finalText,
      imageDataUrl: attachedImage,
      timestamp: Date.now(),
    };

    const modelMsgId = `m-${Date.now() + 1}`;
    const placeholderModelMsg: ChatMessage = {
      id: modelMsgId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
    };

    const historyForApi = [...messages, userMsg]
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageDataUrl: m.imageDataUrl,
      }));

    setMessages((prev) => [...prev, userMsg, placeholderModelMsg]);
    setInput('');
    setPendingImage(null);
    setIsSending(true);
    setStreamingMsgId(modelMsgId);
    setFallbackStatus(null);
    setErrorMsg(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fullReply = await streamTutorMessageApi({
        grade,
        messages: historyForApi,
        signal: controller.signal,
        onModel: (modelName) => setActiveModel(modelName),
        onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
        onChunk: (delta) => {
          setFallbackStatus(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === modelMsgId ? { ...m, content: m.content + delta } : m
            )
          );
        },
      });

      onRecordActivity?.();
      onAddEnergy?.(2);

      if (!fullReply.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? {
                  ...m,
                  content:
                    'Em thử diễn đạt rõ hơn bước em đang vướng để Thầy/Cô gợi ý nhé!',
                }
              : m
          )
        );
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return;
      }
      // Remove empty placeholder message on failure
      setMessages((prev) =>
        prev.filter((m) => !(m.id === modelMsgId && !m.content.trim()))
      );
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể kết nối Gia Sư AI. Vui lòng kiểm tra Gemini API Key.'
      );
    } finally {
      abortRef.current = null;
      setIsSending(false);
      setStreamingMsgId(null);
      setFallbackStatus(null);
    }
  };

  const handleReset = () => {
    handleStopStreaming();
    setPendingImage(null);
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content:
          'Chúng ta bắt đầu bài mới nhé! Em có thể gõ đề bài hoặc chụp ảnh bài toán để thầy/cô hướng dẫn theo chương trình Kết nối tri thức.',
        timestamp: Date.now(),
      },
    ]);
    setErrorMsg(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <section className="rounded-2xl bg-[#0F172A]/85 border border-blue-500/20 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xl shadow-blue-950/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white">
                Gia Sư AI (Streaming & Vision)
              </h1>
              <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-md">
                {activeModel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Phản hồi tức thì · Nhận diện đề bài qua Camera/Ảnh · Tự động lưu lịch sử theo tài khoản
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-500/25 bg-[#070B19]/70 hover:bg-blue-950/60 text-xs font-semibold text-slate-200 self-start sm:self-auto transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          Cuộc trò chuyện mới
        </button>
      </section>

      {/* Suggested Real-world Prompts */}
      <div className="flex sm:flex-wrap gap-2 overflow-x-auto pb-1">
        {STARTER_PROMPTS[grade].map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => sendPrompt(prompt)}
            disabled={isSending}
            className="text-left text-xs px-3.5 py-2 rounded-xl bg-[#0F172A]/85 border border-blue-500/20 hover:border-cyan-400/50 text-slate-200 transition-colors inline-flex items-center gap-1.5 shrink-0 max-w-[280px] sm:max-w-full"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate sm:whitespace-normal sm:line-clamp-1">
              {prompt}
            </span>
          </button>
        ))}
      </div>

      {/* Chat Transcript */}
      <section className="rounded-2xl bg-[#0F172A]/85 border border-blue-500/20 flex flex-col h-[calc(100vh-25.5rem)] min-h-[280px] sm:h-[58vh] sm:min-h-[430px] shadow-xl shadow-blue-950/30">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isCurrentlyStreaming = msg.id === streamingMsgId;
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed space-y-2.5 ${
                    isUser
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-950/40'
                      : 'bg-[#070B19]/90 border border-blue-500/20 text-slate-100'
                  }`}
                >
                  {msg.imageDataUrl && (
                    <img
                      src={msg.imageDataUrl}
                      alt="Ảnh đề bài đã gửi"
                      className="max-h-52 rounded-xl border border-white/20 object-contain bg-black/30"
                    />
                  )}
                  {msg.content ? (
                    <div>
                      <MathText text={msg.content} />
                      {isCurrentlyStreaming && (
                        <span
                          aria-hidden="true"
                          className="inline-block w-1.5 h-4 ml-1 align-middle bg-cyan-400 animate-pulse rounded-xs"
                        />
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-xs inline-flex items-center gap-1.5 ${
                        fallbackStatus ? 'text-cyan-300/95 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {fallbackStatus && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                      {fallbackStatus || 'Đang kết nối luồng phản hồi tức thì...'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {errorMsg && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={onOpenApiKeyModal}
                className="px-3 py-1.5 rounded-lg bg-[#070B19] border border-amber-500/40 text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
              >
                Cài đặt API Key
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Pending image preview */}
        {pendingImage && (
          <div className="px-4 pt-3 pb-1 border-t border-blue-500/15 bg-[#070B19]/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={pendingImage.dataUrl}
                alt="Xem trước ảnh đề bài"
                className="w-12 h-12 rounded-lg object-cover border border-cyan-500/40 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-cyan-300 truncate">
                  📷 Ảnh đề bài đã sẵn sàng
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {pendingImage.name} · Nhập thêm câu hỏi hoặc bấm Gửi ngay
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              aria-label="Gỡ ảnh đính kèm"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-3.5 sm:p-4 border-t border-blue-500/20 flex items-center gap-2 sm:gap-3"
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImagePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isSending || isPreparingImage}
            title="Quét Camera / Chọn Ảnh Đề Bài"
            aria-label="Quét Camera / Chọn Ảnh Đề Bài"
            className="min-h-[44px] px-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
          >
            {isPreparingImage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span className="hidden md:inline">Quét Camera / Chọn Ảnh</span>
          </button>

          <label htmlFor="tutor-chat-input" className="sr-only">
            Nhập câu hỏi hoặc bước giải của bạn
          </label>
          <input
            id="tutor-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập đề bài hoặc chụp ảnh đề toán để Gia sư AI hướng dẫn..."
            className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 rounded-xl bg-[#070B19]/90 border border-blue-500/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {isSending ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              aria-label="Dừng phản hồi"
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold inline-flex items-center gap-2 transition-colors shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Dừng</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !pendingImage}
              aria-label="Gửi tin nhắn cho Gia sư AI"
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-all shrink-0 shadow-md shadow-blue-500/20"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          )}
        </form>
      </section>
    </div>
  );
};
