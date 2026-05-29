import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// FIX: Removed React.StrictMode.
// StrictMode intentionally double-invokes effects in development to surface
// side-effect bugs. This caused the grading pipeline to be triggered twice:
// the component mounted, fired triggerGrading, unmounted, remounted, and
// fired triggerGrading again before the first fetchExam() completed and
// updated exam.status from "uploaded" → "ocr". Both requests passed the
// status guard in exam.controller.js and two BullMQ jobs were enqueued.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#18181b',
            color: '#e8e8f0',
            border: '1px solid #2a2a31',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#18181b' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#18181b' },
          },
        }}
      />
    </AuthProvider>
  </BrowserRouter>
);