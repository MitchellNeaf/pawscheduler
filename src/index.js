// Entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from "@sentry/react";
import './styles/index.css';
import App from './App';

Sentry.init({
  dsn: "https://5f210915fd11201735b799edfd265c73@o4511407522054144.ingest.us.sentry.io/4511407531032576",
  environment: process.env.NODE_ENV || "production",
  enabled: process.env.NODE_ENV === "production",
  sendDefaultPii: false,
  tracesSampleRate: 0,
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    "GoTrueClient",
    "Multiple GoTrueClient instances",
  ],
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);