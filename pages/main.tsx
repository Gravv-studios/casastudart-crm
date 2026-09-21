import React from 'react';
import { createRoot } from 'react-dom/client';
import CRM from '@/components/crm';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><CRM/></React.StrictMode>);
