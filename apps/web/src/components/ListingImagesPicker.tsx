import { useRef, useState } from 'react';
import { Alert, Button, Image } from 'antd';
import { SelectedImagePreview } from './SelectedImagePreview';

export function ListingImagesPicker({ files, onChange, existing = [], onRemoveExisting, disabled = false, onPreviewChange }: {
  files: File[];
  onChange: (files: File[]) => void;
  existing?: string[];
  onRemoveExisting?: (key: string) => void;
  disabled?: boolean;
  onPreviewChange?: (visible: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const count = existing.length + files.length;
  return <div className="cover-upload">
    <label htmlFor="book-image">Chọn ảnh thật của cuốn sách</label>
    <input id="book-image" ref={input} type="file" multiple disabled={disabled}
      accept="image/jpeg,image/png,image/webp"
      onChange={(event) => {
        const chosen = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!chosen.length) return;
        if (chosen.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
          setError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.'); return;
        }
        if (chosen.some(file => file.size > 5 * 1024 * 1024)) {
          setError('Mỗi ảnh tối đa 5 MB.'); return;
        }
        const added = chosen.filter(file => !files.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified));
        if (count + added.length > 5) {
          setError('Mỗi tin tối đa 5 ảnh. Hãy chọn ít ảnh hơn hoặc bỏ bớt ảnh hiện tại.'); return;
        }
        setError(''); onChange([...files, ...added]);
      }} />
    <p>Tối thiểu 2, tối đa 5 ảnh · JPEG, PNG hoặc WebP · mỗi ảnh tối đa 5 MB.</p>
    <p role="status">Đã chọn {count}/5 ảnh. Ảnh đầu tiên là ảnh bìa.</p>
    {error && <Alert type="error" showIcon message={error} />}
    <div className="listing-image-grid">
      {existing.map((key, index) => <div className="selected-image-preview" key={key}>
        <Image src={`/api/images/${key}`} alt={`Ảnh sách hiện có ${index + 1}`} width={180} height={180}
          style={{objectFit:'contain'}} preview={{onVisibleChange:onPreviewChange}} />
        <div><p>Ảnh hiện có {index + 1}</p><Button size="small" disabled={disabled} onClick={() => {setError(''); onRemoveExisting?.(key);}}>Bỏ ảnh hiện có {index + 1}</Button></div>
      </div>)}
      {files.map((file, index) => <SelectedImagePreview key={`${file.name}-${file.lastModified}-${index}`} file={file}
        disabled={disabled} onPreviewChange={onPreviewChange}
        onRemove={() => {setError(''); onChange(files.filter((_, at) => at !== index));}} />)}
    </div>
  </div>;
}
