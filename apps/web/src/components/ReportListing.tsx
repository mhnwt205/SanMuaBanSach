import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Modal, Select, message } from 'antd';
import { FlagOutlined } from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import { reportReasons } from '../lib/reports';

export default function ReportListing({ id, sellerId }: { id: string; sellerId?: string }) {
  const { user } = useAuth(), navigate = useNavigate(), location = useLocation();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [form] = Form.useForm();
  const [toast, holder] = message.useMessage();
  if (user && user.id === sellerId) return null;
  async function submit(values: { reason: string; description: string }) {
    setBusy(true); setError('');
    try {
      await api(`/listings/${encodeURIComponent(id)}/reports`, { method: 'POST', body: JSON.stringify(values) });
      setOpen(false); form.resetFields();
      void toast.success('Đã gửi báo cáo. Quản trị viên sẽ xem xét; tin chưa bị tự động ẩn.', 6);
    } catch (issue) { setError(errorMessage(issue)); } finally { setBusy(false); }
  }
  return <>{holder}<Button aria-label="Báo cáo tin vi phạm" icon={<FlagOutlined />} block onClick={() => {
    if (!user) { navigate('/dang-nhap', { state: { from: location.pathname } }); return; }
    setError(''); setOpen(true);
  }}>Báo cáo tin vi phạm</Button>
    <Modal title="Báo cáo tin vi phạm" open={open} onCancel={() => { if (!busy) setOpen(false); }} maskClosable={!busy} closable={!busy} footer={null}>
      <p>Danh tính người báo cáo không hiển thị công khai hoặc cung cấp cho người bán. Vui lòng mô tả vấn đề để quản trị viên kiểm tra.</p>
      {error && <Alert type="error" showIcon message={error} />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy}>
        <Form.Item label="Lý do báo cáo" name="reason" rules={[{ required: true, message: 'Chọn lý do báo cáo.' }]}><Select options={reportReasons} placeholder="Chọn vấn đề của tin" /></Form.Item>
        <Form.Item label="Mô tả vấn đề" name="description" rules={[{ validator: (_, value) => typeof value === 'string' && Array.from(value.trim()).length >= 10 && value.trim().length <= 1000 ? Promise.resolve() : Promise.reject(new Error('Nhập mô tả từ 10 đến 1.000 ký tự.')) }]}>
          <Input.TextArea rows={4} maxLength={1000} showCount placeholder="Không gửi mật khẩu, số tài khoản hoặc thông tin riêng tư." />
        </Form.Item>
        <div className="report-form-actions"><Button onClick={() => setOpen(false)} disabled={busy}>Hủy</Button><Button type="primary" htmlType="submit" loading={busy}>Gửi báo cáo</Button></div>
      </Form>
    </Modal>
  </>;
}
