import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import { errorMessage } from '../lib/api';

export function RejectionDialog({ open, title, onCancel, onSubmit }: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {form.resetFields(); setError('');}
  }, [open, form]);
  return <Modal open={open} title={title} okText="Xác nhận từ chối" cancelText="Hủy"
    okButtonProps={{danger:true}} confirmLoading={busy} cancelButtonProps={{disabled:busy}}
    closable={!busy} maskClosable={!busy} keyboard={!busy}
    onCancel={onCancel} onOk={() => form.submit()}>
    {error && <Alert type="error" showIcon message={error} />}
    <Form form={form} layout="vertical" disabled={busy} onFinish={async ({note}: {note: string}) => {
      setBusy(true); setError('');
      try {await onSubmit(note.trim());}
      catch(issue) {setError(errorMessage(issue));}
      finally {setBusy(false);}
    }}>
      <p>Người gửi sẽ thấy lý do này để bổ sung hoặc sửa thông tin.</p>
      <Form.Item name="note" label="Lý do từ chối" rules={[{required:true, whitespace:true, max:500, message:'Vui lòng nhập lý do từ chối (tối đa 500 ký tự).'}]}>
        <Input.TextArea autoFocus rows={4} maxLength={500} showCount placeholder="Nêu rõ nội dung cần bổ sung hoặc điều chỉnh…" />
      </Form.Item>
    </Form>
  </Modal>;
}
