export interface ChapterRoadmapMeta {
  examFocusLabel: string;
  examSharePct: number;
  topics: string[];
}

export const CHAPTER_ROADMAP_META: Record<string, ChapterRoadmapMeta> = {
  // TOÁN 10
  '10-c1': {
    examFocusLabel: 'Nền tảng tư duy · Chiếm 8%',
    examSharePct: 8,
    topics: [
      'Mệnh đề, mệnh đề kéo theo & mệnh đề chứa biến',
      'Tập hợp, các phép toán giao/hợp/hiệu & biểu đồ Ven',
    ],
  },
  '10-c2': {
    examFocusLabel: 'Vận dụng thực tế · Chiếm 8%',
    examSharePct: 8,
    topics: [
      'Bất phương trình bậc nhất hai ẩn & miền nghiệm',
      'Hệ BPT bậc nhất hai ẩn & bài toán tối ưu lợi nhuận',
    ],
  },
  '10-c3': {
    examFocusLabel: 'Hình học thực tiễn · Chiếm 10%',
    examSharePct: 10,
    topics: [
      'Giá trị lượng giác của góc từ 0° đến 180°',
      'Định lí Côsin, Định lí Sin & công thức diện tích tam giác',
    ],
  },
  '10-c4': {
    examFocusLabel: 'Nền tảng Oxyz · Chiếm 10%',
    examSharePct: 10,
    topics: [
      'Khái niệm vectơ, tổng và hiệu hai vectơ',
      'Tích của một số với một vectơ & hệ thức trọng tâm',
      'Tọa độ vectơ & tích vô hướng trong mặt phẳng',
    ],
  },
  '10-c5': {
    examFocusLabel: 'Thống kê mô tả · Chiếm 7%',
    examSharePct: 7,
    topics: [
      'Số trung bình, trung vị, tứ phân vị và mốt',
      'Khoảng biến thiên, khoảng tứ phân vị & độ lệch chuẩn',
    ],
  },
  '10-c6': {
    examFocusLabel: 'Trọng tâm Đại số 10 · Chiếm 15%',
    examSharePct: 15,
    topics: [
      'Hàm số, tập xác định và sự biến thiên',
      'Hàm số bậc hai (Parabol) và ứng dụng cực trị',
      'Dấu của tam thức bậc hai & bất phương trình bậc hai',
    ],
  },
  '10-c7': {
    examFocusLabel: 'Hình học giải tích · Chiếm 12%',
    examSharePct: 12,
    topics: [
      'Phương trình đường thẳng, góc và khoảng cách',
      'Phương trình đường tròn trong mặt phẳng Oxy',
      'Ba đường Conic: Elip, Hypebol, Parabol',
    ],
  },
  '10-c8': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 15%',
    examSharePct: 15,
    topics: [
      'Quy tắc cộng và quy tắc nhân',
      'Hoán vị, chỉnh hợp và tổ hợp',
      'Khai triển nhị thức Newton (bậc n = 4, 5)',
    ],
  },
  '10-c9': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 15%',
    examSharePct: 15,
    topics: [
      'Không gian mẫu, biến cố và định nghĩa cổ điển',
      'Tính xác suất bằng biến cố đối & quy tắc đếm',
    ],
  },

  // TOÁN 11
  '11-c1': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 14%',
    examSharePct: 14,
    topics: [
      'Góc lượng giác & công thức cộng, nhân đôi cơ bản',
      'Hàm số lượng giác, tính chẵn lẻ và chu kì',
      'Phương trình lượng giác cơ bản',
    ],
  },
  '11-c2': {
    examFocusLabel: 'Vận dụng thực tế · Chiếm 12%',
    examSharePct: 12,
    topics: [
      'Dãy số tăng/giảm và dãy số bị chặn',
      'Cấp số cộng: số hạng tổng quát & tổng n số hạng',
      'Cấp số nhân & bài toán lãi kép ngân hàng',
    ],
  },
  '11-c3': {
    examFocusLabel: 'Thống kê ghép nhóm · Chiếm 8%',
    examSharePct: 8,
    topics: [
      'Bảng phân bố tần số ghép nhóm',
      'Số trung bình, trung vị, tứ phân vị và mốt ghép nhóm',
    ],
  },
  '11-c4': {
    examFocusLabel: 'Hình không gian 11 · Chiếm 12%',
    examSharePct: 12,
    topics: [
      'Đường thẳng và mặt phẳng trong không gian',
      'Hai đường thẳng song song & đường thẳng song song mặt phẳng',
      'Hai mặt phẳng song song & phép chiếu song song',
    ],
  },
  '11-c5': {
    examFocusLabel: 'Nền tảng Giải tích · Chiếm 10%',
    examSharePct: 10,
    topics: [
      'Giới hạn của dãy số và tổng cấp số nhân lùi vô hạn',
      'Giới hạn của hàm số (hữu hạn & vô cực)',
      'Hàm số liên tục tại một điểm và trên khoảng',
    ],
  },
  '11-c6': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 14%',
    examSharePct: 14,
    topics: [
      'Phép tính lũy thừa với số mũ thực & lôgarit',
      'Hàm số mũ và hàm số lôgarit',
      'Phương trình, bất phương trình mũ và lôgarit',
    ],
  },
  '11-c7': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 14%',
    examSharePct: 14,
    topics: [
      'Hai đường thẳng vuông góc & đường thẳng vuông góc mặt phẳng',
      'Hai mặt phẳng vuông góc & góc phẳng nhị diện',
      'Khoảng cách & thể tích khối chóp, lăng trụ, chóp cụt đều',
    ],
  },
  '11-c8': {
    examFocusLabel: 'Nền tảng Xác suất 12 · Chiếm 8%',
    examSharePct: 8,
    topics: [
      'Biến cố hợp, biến cố giao và hai biến cố độc lập',
      'Công thức cộng và công thức nhân xác suất',
    ],
  },
  '11-c9': {
    examFocusLabel: 'Nền tảng Giải tích 12 · Chiếm 8%',
    examSharePct: 8,
    topics: [
      'Định nghĩa đạo hàm, tiếp tuyến & vận tốc tức thời',
      'Quy tắc tính đạo hàm và đạo hàm cấp hai',
    ],
  },

  // TOÁN 12
  '12-c1': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 22%',
    examSharePct: 22,
    topics: [
      'Tính đơn điệu và cực trị của hàm số',
      'Giá trị lớn nhất và nhỏ nhất trên đoạn [a; b]',
      'Đường tiệm cận (đứng, ngang, xiên) & khảo sát đồ thị',
    ],
  },
  '12-c2': {
    examFocusLabel: 'Nền tảng Oxyz · Chiếm 12%',
    examSharePct: 12,
    topics: [
      'Vectơ và các phép toán vectơ trong không gian',
      'Hệ trục tọa độ Oxyz & tọa độ điểm, vectơ',
      'Biểu thức tọa độ phép cộng, trừ, tích vô hướng',
    ],
  },
  '12-c3': {
    examFocusLabel: 'Thống kê thi THPT · Chiếm 10%',
    examSharePct: 10,
    topics: [
      'Khoảng biến thiên và khoảng tứ phân vị ghép nhóm',
      'Phương sai và độ lệch chuẩn mẫu số liệu ghép nhóm',
    ],
  },
  '12-c4': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 22%',
    examSharePct: 22,
    topics: [
      'Nguyên hàm và bảng nguyên hàm cơ bản',
      'Tích phân xác định và tính chất tuyến tính',
      'Diện tích hình phẳng & thể tích khối tròn xoay quanh Ox',
    ],
  },
  '12-c5': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 20%',
    examSharePct: 20,
    topics: [
      'Phương trình tổng quát mặt phẳng & khoảng cách',
      'Phương trình đường thẳng & góc trong không gian Oxyz',
      'Phương trình mặt cầu trong không gian Oxyz',
    ],
  },
  '12-c6': {
    examFocusLabel: 'Trọng tâm thi THPT · Chiếm 14%',
    examSharePct: 14,
    topics: [
      'Xác suất có điều kiện & công thức nhân xác suất',
      'Công thức xác suất toàn phần và Công thức Bayes',
    ],
  },
};

export function getChapterRoadmapMeta(chapterId: string): ChapterRoadmapMeta {
  return (
    CHAPTER_ROADMAP_META[chapterId] ?? {
      examFocusLabel: 'Chuyên đề chuẩn GDPT 2018',
      examSharePct: 10,
      topics: ['Lý thuyết trọng tâm', 'Công thức & bài tập vận dụng'],
    }
  );
}

export type ChapterCategoryId = 'algebra' | 'geometry' | 'statistics';

export interface ChapterCategoryMeta {
  id: ChapterCategoryId;
  label: string;
}

const GEOMETRY_CHAPTER_IDS = new Set([
  '10-c3',
  '10-c4',
  '10-c7',
  '11-c4',
  '11-c7',
  '12-c2',
  '12-c5',
]);

const STATISTICS_CHAPTER_IDS = new Set([
  '10-c5',
  '10-c9',
  '11-c3',
  '11-c8',
  '12-c3',
  '12-c6',
]);

export function getChapterCategoryMeta(chapterId: string): ChapterCategoryMeta {
  if (GEOMETRY_CHAPTER_IDS.has(chapterId)) {
    return { id: 'geometry', label: 'Hình học & Oxyz' };
  }
  if (STATISTICS_CHAPTER_IDS.has(chapterId)) {
    return { id: 'statistics', label: 'Thống kê & Xác suất' };
  }
  return { id: 'algebra', label: 'Đại số & Giải tích' };
}

