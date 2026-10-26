import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import App from './App';
import { MotionProvider } from './lib/motion';
import './styles.css';
import './styles/experience.css';
import './styles/bookstore.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#2659f3',
          colorText: '#1f2937',
          colorTextSecondary: '#667085',
          colorBorder: '#c6d2e2',
          colorBgLayout: '#ffffff',
          borderRadius: 8,
          fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
          fontSize: 14,
          controlHeight: 44,
          fontSizeHeading1: 32,
          fontSizeHeading2: 24,
          fontSizeHeading3: 20,
          lineHeight: 1.65,
        },
        components: {
          Button: { primaryShadow: 'none', defaultShadow: 'none' },
          Tabs: { inkBarColor: '#2659f3', itemSelectedColor: '#1f2937' },
        },
      }}
    >
      <MotionProvider><App /></MotionProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
