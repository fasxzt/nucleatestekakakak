// ============================================================
//  config.js — Configurações da API Gemini
//  Em produção, configure GEMINI_API_KEY no Vercel.
//  Para testar localmente, use o campo de chave da interface com a flag abaixo ativa.
//  Obtenha sua chave em: https://aistudio.google.com/app/apikey
// ============================================================

const CONFIG = {
  // Opcional no navegador somente quando ALLOW_BROWSER_GEMINI_KEY é true em localhost.
  // Em produção, a chave deve ficar somente no servidor/Vercel.
  GEMINI_API_KEY: 'AQ.Ab8RN6LziqlKYPaHuUpTn3tLah2-zGkrzK38lAquHSGNjxl45w',
  ALLOW_BROWSER_GEMINI_KEY: false,

  // Modelos disponíveis no nível gratuito do Google AI Studio.
  // O modelo pode ser alterado no campo de configurações do app.
  GEMINI_MODEL: 'gemini-3.5-flash-lite',

  // Firebase App Check (reCAPTCHA v3)
  // Cole aqui a SITE KEY publica do reCAPTCHA v3 depois de registrar o App Check.
  FIREBASE_APP_CHECK_SITE_KEY: '6LeyABktAAAAAG9ytSc1jHJ2wC1UVkbBAWO7Jj4L',

  // Use somente em localhost/desenvolvimento. Deixe false em producao.
  // Para gerar um token local, troque para true, abra o site e copie o token do console.
  FIREBASE_APP_CHECK_DEBUG_TOKEN: false,
};
