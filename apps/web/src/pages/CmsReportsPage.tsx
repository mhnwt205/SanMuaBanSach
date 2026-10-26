import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Empty, Form, Input, Modal, Radio, Result, Select, Table, Tag, message } from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPermission, statusNames, type ListingStatus } from '../lib/types';
import { reportReasons, reportStatuses } from '../lib/reports';
import type { CmsLayoutContext } from '../lib/cms';

type Report = { id: string; listing_id: string; listing_title: string; listing_version: number; reason: string; description: string; status: string; resolution: string | null; review_note: string | null; reviewed_at: string | null; created_at: string; version: number; reporter: string; reviewer: string | null; current_title: string; listing_status: ListingStatus; current_listing_version: number; listing_deleted_at: string | null };
const date = (value: string) => new Date(value.replace(' ', 'T')+'Z').toLocaleString('vi-VN');
export default function CmsReportsPage() {
  const { user } = useAuth();
  const { refreshSummary } = useOutletContext<CmsLayoutContext>();
  const allowed = hasPermission(user, 'reports.view'), review = hasPermission(user, 'reports.review');
  const [filter, setFilter] = useState('pending'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [items, setItems] = useState<Report[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState<Report | null>(null), [busy, setBusy] = useState(false), [decisionError, setDecisionError] = useState('');
  const [form] = Form.useForm(), [toast, holder] = message.useMessage();
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true); setError('');
    api<{ items: Report[]; total: number }>(`/admin/reports?status=${filter}&page=${page}`)
      .then(data => { if (active) { setItems(data.items); setTotal(data.total); } })
      .catch(issue => { if (active) setError(errorMessage(issue)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, filter, page, revision]);
  if (!allowed) return <Result status="403" title="Bạn chưa có quyền xem báo cáo vi phạm" />;
  async function decide(values: { action: string; note: string }) {
    if (!selected) return;
    setBusy(true); setDecisionError('');
    try {
      await api(`/admin/reports/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ ...values, version: selected.version, listing_version: selected.current_listing_version }) });
      setSelected(null); setPage(1); setRevision(value => value+1);
      await refreshSummary();
      void toast.success(values.action === 'hide' ? 'Đã xử lý báo cáo và ẩn tin.' : 'Đã lưu kết quả xử lý.', 5);
    } catch (issue) { setDecisionError(errorMessage(issue)); } finally { setBusy(false); }
  }
  const hide = hasPermission(user,'listings.view') && hasPermission(user,'listings.update') && selected?.listing_status === 'active' && !selected.listing_deleted_at;
  return <section className="cms-section">{holder}
    <div className="page-heading"><div><h1>Báo cáo vi phạm</h1><p>Kiểm tra phản ánh và lưu quyết định xử lý. Báo cáo không tự động ẩn tin.</p></div></div>
    <div className="report-toolbar"><Select aria-label="Trạng thái báo cáo" value={filter} options={[...Object.entries(reportStatuses).map(([value,label]) => ({value,label})),{value:'all',label:'Tất cả'}]} onChange={value => { setFilter(value); setPage(1); }} /><Button onClick={() => setRevision(value => value+1)} disabled={loading}>Tải lại</Button></div>
    {error ? <Alert type="error" message={error} showIcon /> : <Table<Report> rowKey="id" loading={loading} dataSource={items} scroll={{ x: 760 }} locale={{ emptyText: <Empty description="Chưa có báo cáo trong mục này" /> }} pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: setPage }} columns={[
      {title:'Tin được báo cáo',dataIndex:'listing_title',render:(value:string,row:Report) => <><strong>{value}</strong><div>{reportReasons.find(item => item.value === row.reason)?.label}</div></>},
      {title:'Trạng thái',dataIndex:'status',render:(value:string) => <Tag color={value === 'pending' ? 'gold' : 'default'}>{reportStatuses[value]}</Tag>},
      {title:'Ngày báo cáo',dataIndex:'created_at',render:date},
      {title:'Thao tác',render:(_,row) => <Button onClick={() => { setSelected(row); setDecisionError(''); form.resetFields(); }}>Xem / xử lý</Button>},
    ]} />}
    <Modal title="Chi tiết báo cáo" open={Boolean(selected)} onCancel={() => { if (!busy) setSelected(null); }} closable={!busy} maskClosable={!busy} footer={null} width={700}>
      {selected && <>
        <Descriptions bordered size="small" column={1} items={[
          {key:'title',label:'Tin lúc báo cáo',children:selected.listing_title},
          {key:'version',label:'Phiên bản lúc báo cáo',children:selected.listing_version},
          {key:'current',label:'Tin hiện tại',children:<>{selected.current_title} · {selected.listing_deleted_at ? 'Đã đưa vào thùng rác' : statusNames[selected.listing_status]} {selected.listing_status === 'active' && !selected.listing_deleted_at && <Link target="_blank" rel="noopener noreferrer" to={`/sach/${selected.listing_id}`}>Xem tin</Link>}</>},
          {key:'reason',label:'Lý do',children:reportReasons.find(item => item.value === selected.reason)?.label},
          {key:'description',label:'Mô tả',children:<span className="report-description">{selected.description}</span>},
          {key:'reporter',label:'Người báo cáo (nội bộ)',children:selected.reporter},
          {key:'created',label:'Ngày báo cáo',children:date(selected.created_at)},
          {key:'status',label:'Trạng thái',children:reportStatuses[selected.status]},
          ...(selected.reviewed_at ? [{key:'result',label:'Kết quả xử lý',children:<>{selected.resolution === 'hide' && <p>Đã ẩn tin khi xử lý.</p>}<p className="report-description">{selected.review_note}</p><small>{selected.reviewer} · {date(selected.reviewed_at)}</small></>}] : []),
        ]} />
        {decisionError && <Alert type="error" showIcon message={decisionError} description="Nếu dữ liệu đã thay đổi, đóng hộp thoại và bấm Tải lại trước khi xử lý tiếp." />}
        {selected.status === 'pending' && (review ? <Form form={form} layout="vertical" onFinish={decide} disabled={busy} className="report-decision-form">
          <Form.Item label="Quyết định xử lý" name="action" rules={[{required:true,message:'Chọn quyết định xử lý.'}]}><Radio.Group><div className="report-options"><Radio value="resolve">Đã kiểm tra / xử lý, giữ trạng thái tin</Radio><Radio value="dismiss">Không đủ cơ sở xác định vi phạm</Radio><Radio value="hide" disabled={!hide}>Xác nhận vi phạm và ẩn tin</Radio></div></Radio.Group></Form.Item>
          {!hide && <p>Ẩn tin cần quyền xem/sửa tin đăng và tin đang hiển thị.</p>}
          <Form.Item label="Lý do / ghi chú xử lý" name="note" rules={[{validator:(_,value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500 ? Promise.resolve() : Promise.reject(new Error('Nhập lý do từ 1 đến 500 ký tự.'))}]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
          <p>Quyết định được lưu vào lịch sử và kết thúc báo cáo này. Chọn ẩn tin sẽ gỡ tin khỏi danh sách công khai.</p>
          <div className="report-form-actions"><Button disabled={busy} onClick={() => setSelected(null)}>Hủy</Button><Button type="primary" htmlType="submit" loading={busy}>Lưu kết quả xử lý</Button></div>
        </Form> : <Alert type="info" message="Bạn chỉ có quyền xem; chưa được cấp quyền xử lý báo cáo." />)}
      </>}
    </Modal>
  </section>;
}
