import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

export default defineConfig({
 base:'/crm-hugo/',
 root:'pages',
 publicDir:'../public',
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 css:{postcss:{plugins:[tailwindcss()]}},
 plugins:[react()],
 build:{outDir:'../docs',emptyOutDir:true},
});
