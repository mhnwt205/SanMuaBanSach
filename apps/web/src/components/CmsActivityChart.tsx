import type { CmsActivityDay } from '../lib/cms';
import { useEffect, useRef, useState } from 'react';

const series = [
  { key: 'listings', label: 'Tin đăng mới', color: '#2659f3', dash: '' },
  { key: 'sellers', label: 'Yêu cầu Seller', color: '#697586', dash: '6 5' },
  { key: 'reports', label: 'Báo cáo mới', color: '#c4242a', dash: '2 5' },
] as const;

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export default function CmsActivityChart({ days }: { days: CmsActivityDay[] }) {
  const visible = series.filter(({ key }) => days.some((day) => day[key] !== null));
  const allZero = visible.every(({ key }) => days.every((day) => (day[key] ?? 0) === 0));
  const showChart = visible.length > 0 && !allZero;
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    const element = frame.current;
    if (!showChart || !element) return;
    const update = () => setWidth(Math.max(240, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [showChart]);
  if (!visible.length) return null;

  const height = width < 440 ? 224 : 248;
  const left = 40, right = 22, top = 18, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(2, ...visible.flatMap(({ key }) => days.map((day) => day[key] ?? 0)));
  const yFor = (value: number) => top + plotHeight - (value / maximum) * plotHeight;
  const xFor = (index: number) => left + (days.length <= 1 ? plotWidth / 2 : index / (days.length - 1) * plotWidth);

  return (
    <section className="cms-activity-panel" aria-labelledby="cms-activity-title">
      <div className="cms-panel-heading">
        <div>
          <span className="cms-eyebrow">7 ngày gần nhất</span>
          <h2 id="cms-activity-title">Hoạt động gửi mới</h2>
        </div>
        <div className="cms-chart-legend" aria-label="Chú giải biểu đồ">
          {visible.map((item) => <span key={item.key}><i style={{ borderColor: item.color, borderStyle: item.dash ? 'dashed' : 'solid' }} />{item.label}</span>)}
        </div>
      </div>
      {allZero ? (
        <div className="cms-chart-empty">Chưa ghi nhận tin đăng, yêu cầu Seller hoặc báo cáo mới trong 7 ngày gần đây.</div>
      ) : (
        <div className="cms-chart-frame" ref={frame}>
          <svg viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label="Biểu đồ số tin đăng, yêu cầu Seller và báo cáo mới trong bảy ngày gần nhất">
            <title>Số hoạt động mới theo ngày</title>
            {[0, 0.5, 1].map((ratio) => {
              const value = Math.round(maximum * ratio);
              const y = yFor(value);
              return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} className="cms-chart-gridline" /><text x={left - 10} y={y + 4} textAnchor="end" className="cms-chart-axis">{value}</text></g>;
            })}
            {visible.map(({ key, color, dash, label }) => {
              const points = days.map((day, index) => `${xFor(index)},${yFor(day[key] ?? 0)}`).join(' ');
              return <g key={key}>
                <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={dash || undefined} strokeLinecap="round" strokeLinejoin="round" />
                {days.map((day, index) => <circle key={day.day} cx={xFor(index)} cy={yFor(day[key] ?? 0)} r="3.5" fill="white" stroke={color} strokeWidth="2"><title>{`${label}: ${day[key] ?? 0} · ${day.day}`}</title></circle>)}
              </g>;
            })}
            {days.map((day, index) => (width >= 400 || index % 2 === 0 || index === days.length - 1) && <text key={day.day} x={xFor(index)} y={height - 8} textAnchor="middle" className="cms-chart-axis">{shortDay(day.day)}</text>)}
          </svg>
        </div>
      )}
    </section>
  );
}
