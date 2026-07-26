import { useRef, type ClipboardEvent, type DragEvent } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { AddPhotoAlternateOutlined, ImageOutlined } from '@mui/icons-material';
import { fileToImageAttachment, type ImageAttachment } from '../smartEntryImages';

const maxImages = 5;

export function ImageAttachmentPicker({ images, setImages, onError }: {
  images: ImageAttachment[];
  setImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    onError('');
    try {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (!imageFiles.length) throw new Error('没有检测到图片文件');
      if (images.length + imageFiles.length > maxImages) throw new Error(`最多添加 ${maxImages} 张图片`);
      const next = await Promise.all(imageFiles.map(fileToImageAttachment));
      setImages((current) => {
        const known = new Set(current.map((image) => image.digest));
        return [...current, ...next.filter((image) => !known.has(image.digest))];
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : '图片读取失败');
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      void addFiles(files);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <Stack gap={1}>
      <Typography variant="body2" fontWeight={700}>图片资料</Typography>
      <Paper
        variant="outlined"
        tabIndex={0}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        sx={{
          p: 2, borderStyle: 'dashed', borderColor: '#AFC7EA', bgcolor: '#F7FAFF',
          outline: 'none', '&:focus-visible': { borderColor: 'primary.main', boxShadow: '0 0 0 3px rgba(23,100,216,.14)' },
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5}>
          <ImageOutlined color="primary" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={700}>粘贴、拖入或上传图片</Typography>
            <Typography variant="caption" color="text.secondary">支持 JPG、PNG、WebP；最多5张，每张不超过5 MB</Typography>
          </Box>
          <Button size="small" variant="outlined" startIcon={<AddPhotoAlternateOutlined />} onClick={() => inputRef.current?.click()}>选择图片</Button>
          <input
            ref={inputRef}
            hidden
            multiple
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </Stack>
      </Paper>
      {images.length > 0 && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {images.map((image) => (
            <Chip
              key={image.digest}
              avatar={<Box component="img" src={image.data_url} alt="" sx={{ objectFit: 'cover' }} />}
              label={image.filename}
              onDelete={() => setImages((current) => current.filter((item) => item.digest !== image.digest))}
              sx={{ maxWidth: 240 }}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
