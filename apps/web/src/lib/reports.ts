export const reportReasons = [
  { value: 'fraud', label: 'Nghi ngờ lừa đảo' },
  { value: 'misleading', label: 'Thông tin hoặc hình ảnh sai lệch' },
  { value: 'prohibited', label: 'Nội dung không phù hợp / bị cấm' },
  { value: 'spam', label: 'Tin rác / trùng lặp' },
  { value: 'other', label: 'Lý do khác' },
];
export const reportStatuses: Record<string, string> = { pending: 'Chờ xử lý', resolved: 'Đã xử lý', dismissed: 'Không đủ cơ sở' };
