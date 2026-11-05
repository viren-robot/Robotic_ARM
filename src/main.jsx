import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import '@lobehub/ui/theme.css';
import '@lobehub/ui/style.css';
import './app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider motion={motion}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
