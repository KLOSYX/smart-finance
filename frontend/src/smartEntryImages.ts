export interface ImageAttachment {
  filename: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  data_url: string;
  digest: string;
}

const acceptedTypes = new Set<ImageAttachment['mime_type']>([
  'image/jpeg', 'image/png', 'image/webp',
]);
const maxBytes = 5 * 1024 * 1024;

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  if (!acceptedTypes.has(file.type as ImageAttachment['mime_type'])) {
    throw new Error(`不支持 ${file.name}；请选择 JPG、PNG 或 WebP 图片`);
  }
  if (file.size > maxBytes) throw new Error(`${file.name} 超过 5 MB`);
  const bytes = await file.arrayBuffer();
  const digest = toHex(await crypto.subtle.digest('SHA-256', bytes));
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
    reader.readAsDataURL(file);
  });
  return {
    filename: file.name || `粘贴图片-${digest.slice(0, 8)}.png`,
    mime_type: file.type as ImageAttachment['mime_type'],
    data_url: dataUrl,
    digest,
  };
}

export async function smartSourceHash(text: string, images: ImageAttachment[]) {
  const source = JSON.stringify({
    text: text.trim(),
    images: images.map((image) => image.digest),
  });
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
}
