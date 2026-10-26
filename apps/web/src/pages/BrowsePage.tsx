import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Breadcrumb, Button, Drawer, Empty, Form, InputNumber, Select, Tag } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { demoBooks, filterDemoBooks } from '../lib/demo';
import { BookGrid } from '../components/Books';
import { api, errorMessage } from '../lib/api';
import { useCategories } from '../lib/categories';
import { cities, money, normalizeBook, type Book } from '../lib/types';

type Update = (values: Record<string,string|undefined>) => void;
function FilterPanel({params,update,close}:{params:URLSearchParams;update:Update;close?:()=>void}) {
  const { categories, error, loading, refresh } = useCategories();
  return <div className="filter-panel">
    <div className="filter-title"><h2>Bộ lọc</h2><Button type="text" onClick={() => { update({category:undefined,city:undefined,min:undefined,max:undefined});close?.(); }}>Đặt lại</Button></div>
    <div className="filter-group"><h3>Danh mục</h3>
      {error && <Alert type="error" showIcon message="Chưa tải được danh mục" action={<Button onClick={() => void refresh().catch(() => {})}>Thử lại</Button>} />}
      {loading && <p role="status">Đang tải danh mục…</p>}
      <button className={!params.get('category') ? 'selected' : ''} aria-pressed={!params.get('category')} onClick={() => update({category:undefined})}>Tất cả sách <span>→</span></button>
      {categories.map(category => <button key={category} aria-pressed={params.get('category')===category} className={params.get('category')===category ? 'selected' : ''} onClick={() => update({category})}>{category}<span>→</span></button>)}
    </div>
    <div className="filter-group"><h3>Khu vực</h3><Select aria-label="Lọc khu vực" allowClear placeholder="Tất cả tỉnh thành" value={params.get('city') ?? undefined} options={cities.map(city => ({value:city,label:city}))} onChange={city => update({city})} /></div>
    <div className="filter-group"><h3>Khoảng giá</h3>
      <Form key={`${params.get('min')}-${params.get('max')}`} initialValues={{min:params.has('min') ? Number(params.get('min')) : undefined,max:params.has('max') ? Number(params.get('max')) : undefined}} onFinish={(values:{min?:number|null;max?:number|null}) => {
        update({min:values.min == null ? undefined : String(values.min),max:values.max == null ? undefined : String(values.max)});close?.();
      }}>
        <Form.Item name="min"><InputNumber aria-label="Giá thấp nhất" min={0} max={100000000} placeholder="Từ (đ)" precision={0} /></Form.Item><span className="price-divider">đến</span>
        <Form.Item name="max" dependencies={['min']} rules={[({getFieldValue}) => ({validator:(_,value) => value == null || getFieldValue('min') == null || value >= getFieldValue('min') ? Promise.resolve() : Promise.reject(new Error('Giá cao nhất phải từ giá thấp nhất trở lên.'))})]}><InputNumber aria-label="Giá cao nhất" min={0} max={100000000} placeholder="Đến (đ)" precision={0} /></Form.Item>
        <Button htmlType="submit" block>Áp dụng khoảng giá</Button>
      </Form>
    </div>
    <div className="filter-help"><p>Chưa tìm thấy sách?</p><Link to="/huong-dan">Cách tìm và mua sách →</Link></div>
  </div>;
}

type ResultState={key:string;items:Book[];hasMore:boolean;demo?:boolean;loading:boolean;error:string};
export default function BrowsePage() {
  const [params,setParams] = useSearchParams(), serialized=params.toString();
  const [revision,setRevision]=useState(0), [filtersOpen,setFiltersOpen]=useState(false);
  const [result,setResult]=useState<ResultState>({key:'',items:[],hasMore:false,loading:true,error:''});
  const page=Math.max(1,Math.min(1000,Math.floor(Number(params.get('page')))||1));
  const current:ResultState=result.key===serialized ? result : {key:serialized,items:[],hasMore:false,loading:true,error:''};
  const update:Update=values => setParams(previous => {
    const next=new URLSearchParams(previous);next.delete('page');
    for (const [key,value] of Object.entries(values)) {if(value!==undefined && value!=='') next.set(key,value);else next.delete(key);}
    return next;
  });
  const clear=() => setParams({});
  useEffect(() => {
    const controller=new AbortController(), query=new URLSearchParams(serialized);query.set('limit','24');
    setResult({key:serialized,items:[],hasMore:false,loading:true,error:''});
    api<{items:Record<string,unknown>[];has_more:boolean;catalog_empty?:boolean}>(`/listings?${query}`,{signal:controller.signal})
      .then(data => {
        if(controller.signal.aborted) return;
        const samples=data.catalog_empty ? filterDemoBooks(demoBooks,new URLSearchParams(serialized)) : [];
        setResult({key:serialized,items:data.catalog_empty ? samples.slice((page-1)*24,page*24) : data.items.map(normalizeBook),hasMore:data.catalog_empty ? samples.length>page*24 : data.has_more,demo:data.catalog_empty,loading:false,error:''});
      })
      .catch(issue => {if(!controller.signal.aborted)setResult({key:serialized,items:[],hasMore:false,loading:false,error:errorMessage(issue)});});
    return () => controller.abort();
  },[serialized,revision]);
  const tags=[
    ...(params.get('q') ? [{key:'q',label:`Từ khóa: ${params.get('q')}`}] : []),
    ...(params.get('category') ? [{key:'category',label:`Danh mục: ${params.get('category')}`}] : []),
    ...(params.get('city') ? [{key:'city',label:`Khu vực: ${params.get('city')}`}] : []),
    ...(params.has('min') ? [{key:'min',label:`Từ ${money(Number(params.get('min')))}`}] : []),
    ...(params.has('max') ? [{key:'max',label:`Đến ${money(Number(params.get('max')))}`}] : []),
  ];
  return <div className="container browse-page">
    <Breadcrumb items={[{title:<Link to="/">Trang chủ</Link>},{title:'Khám phá sách'}]} />
    <div className="browse-layout">
      <aside className="desktop-filters"><FilterPanel params={params} update={update} /></aside>
      <section className="browse-sheet" aria-busy={current.loading}>
        <div className="page-heading"><div><h1>{params.get('q') ? `Kết quả cho “${params.get('q')}”` : params.get('category') ?? 'Khám phá sách'}</h1><p>Sách giấy cũ từ những người bán đã được xét duyệt</p></div>
          <Button className="filter-toggle" aria-label="Mở bộ lọc" icon={<FilterOutlined />} onClick={() => setFiltersOpen(true)}>Bộ lọc</Button></div>
        <div className="result-toolbar"><span>{params.get('city') ?? 'Toàn quốc'}</span><Select aria-label="Sắp xếp sách" value={['newest','price_asc','price_desc'].includes(params.get('sort') ?? '') ? params.get('sort') : 'newest'} options={[{value:'newest',label:'Mới đăng'},{value:'price_asc',label:'Giá thấp đến cao'},{value:'price_desc',label:'Giá cao đến thấp'}]} onChange={sort => update({sort})} /></div>
        {tags.length>0 && <div className="active-filters" aria-label="Bộ lọc đang áp dụng">{tags.map(tag => <Tag key={tag.key}>{tag.label}<button type="button" className="filter-remove" aria-label={`Bỏ ${tag.label}`} onClick={() => update({[tag.key]:undefined})}>×</button></Tag>)}<Button type="link" onClick={clear}>Xóa tất cả bộ lọc</Button></div>}
        {current.demo && !current.loading && <div className="sample-notice" role="note">Đang xem sách minh họa, chưa phải tin bán thật. Bạn có thể thử tìm kiếm và bộ lọc.</div>}
        {current.error ? <Alert type="error" showIcon message={current.error} action={<Button onClick={() => setRevision(value=>value+1)}>Thử lại</Button>} /> : current.loading ? <><p className="sr-only" role="status">Đang tìm sách…</p><BookGrid books={[]} columns={4} loading /></> : current.items.length ? <BookGrid books={current.items} columns={4} /> : <div className="empty-panel" role="status"><Empty description={page>1 ? 'Trang này không còn tin đăng. Bạn có thể quay về trang đầu.' : 'Chưa tìm thấy sách phù hợp. Thử đổi từ khóa hoặc bớt bộ lọc.'} /><Button onClick={page>1 ? () => update({}) : clear}>{page>1 ? 'Về trang đầu' : 'Xóa bộ lọc và tìm lại'}</Button></div>}
        {!current.error && !current.loading && (page>1 || current.hasMore) && <nav className="browse-pagination" aria-label="Phân trang sách"><Button disabled={page===1} onClick={() => setParams(previous => {const next=new URLSearchParams(previous);if(page===2)next.delete('page');else next.set('page',String(page-1));return next;})}>Trang trước</Button><span aria-live="polite">Trang {page}</span><Button disabled={!current.hasMore || page>=1000} onClick={() => setParams(previous => {const next=new URLSearchParams(previous);next.set('page',String(page+1));return next;})}>Trang sau</Button></nav>}
      </section>
    </div>
    <Drawer title="Lọc sách" placement="bottom" height="85dvh" open={filtersOpen} onClose={() => setFiltersOpen(false)} extra={<Button onClick={() => setFiltersOpen(false)}>Xem kết quả</Button>}><FilterPanel params={params} update={update} close={() => setFiltersOpen(false)} /></Drawer>
  </div>;
}
