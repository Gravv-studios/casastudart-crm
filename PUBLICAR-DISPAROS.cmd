@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Publicando a tela de Disparos WhatsApp no GitHub (a Vercel publica sozinha)...
git add WHATSAPP-DISPAROS.md PUBLICAR-DISPAROS.cmd api components/dispatch.tsx components/crm.tsx lib/whatsapp.ts app/globals.css supabase/whatsapp.sql tests/whatsapp-api.test.mjs vercel.json package.json .env.example README.md
git commit -m "Add official WhatsApp dispatch by state (Meta Cloud API)"
git push
echo.
echo Pronto. Confira o deploy em https://vercel.com (projeto casastudart-crm).
pause
