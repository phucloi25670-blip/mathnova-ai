export interface PreparedImagePayload {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

/**
 * Compresses and resizes an uploaded or camera-captured math problem image
 * to max 1280px so Multimodal Gemini Vision responds in 1-2 seconds even on mobile networks.
 */
export async function prepareImageForVision(file: File): Promise<PreparedImagePayload> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc dữ liệu ảnh.'));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi đọc file ảnh.'));
    reader.readAsDataURL(file);
  });

  // Resize via canvas when possible
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
      image.src = rawDataUrl;
    });

    const maxDim = 1280;
    let targetW = img.naturalWidth || img.width;
    let targetH = img.naturalHeight || img.height;

    if (targetW > maxDim || targetH > maxDim) {
      if (targetW >= targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, targetW);
    canvas.height = Math.max(1, targetH);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const commaIdx = compressedDataUrl.indexOf(',');
      return {
        base64: commaIdx >= 0 ? compressedDataUrl.slice(commaIdx + 1) : compressedDataUrl,
        mimeType: 'image/jpeg',
        dataUrl: compressedDataUrl,
      };
    }
  } catch {
    // Fallback to raw image data URL if canvas resize fails
  }

  const match = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1] || file.type || 'image/jpeg',
      base64: match[2],
      dataUrl: rawDataUrl,
    };
  }

  throw new Error('Định dạng ảnh không được hỗ trợ.');
}
