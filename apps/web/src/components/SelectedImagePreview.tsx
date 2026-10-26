import { useEffect, useState } from 'react';
import { Button, Image } from 'antd';

export function SelectedImagePreview({
  file,
  onRemove,
  onPreviewChange,
  disabled = false,
}: {
  file: File | null;
  onRemove: () => void;
  onPreviewChange?: (visible: boolean) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  if (!file || !url) return null;
  return (
    <div className="selected-image-preview">
      <Image
        src={url}
        alt="Ảnh sách vừa chọn"
        width={180}
        height={180}
        preview={{ onVisibleChange: onPreviewChange }}
        style={{ objectFit: 'contain' }}
      />
      <div>
        <p className="selected-image-name">{file.name}</p>
        <p>Bấm vào ảnh để phóng to. Ảnh được tải lên khi gửi biểu mẫu.</p>
        <Button size="small" disabled={disabled} onClick={onRemove}>Bỏ ảnh đã chọn</Button>
      </div>
    </div>
  );
}
