const crypto = require('crypto');

const PROJECT_NUMBER = process.env.FIREBASE_PROJECT_NUMBER || '809997459519';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nucleaai-30555';
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID || '1:809997459519:web:392698d2eccfe3380e988a';
const JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_ALLOWED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash'
];
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;

let jwksCache = null;
let jwksCacheExpiresAt = 0;
let firebaseCertsCache = null;
let firebaseCertsCacheExpiresAt = 0;
let rateBuckets = new Map();
let concurrency = 0;
let queue = [];

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function json(res, status, body) {
  return res.status(status).json(body);
}

function getClientAddress(req) {
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isFirebaseAuthRequired() {
  if (process.env.REQUIRE_FIREBASE_AUTH === 'true') return true;
  if (process.env.REQUIRE_FIREBASE_AUTH === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function getRateLimitRetryAfter(req, userId) {
  const configured = parseInt(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE || '', 10);
  const limit = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_REQUESTS_PER_MINUTE;
  const now = Date.now();
  const address = userId ? 'uid:' + userId : getClientAddress(req);
  let bucket = rateBuckets.get(address);

  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(address, bucket);
  }

  bucket.count++;
  if (rateBuckets.size > 1000) {
    rateBuckets.forEach(function(item, key) {
      if (now - item.startedAt >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
    });
  }

  if (bucket.count <= limit) return 0;
  return Math.max(1, Math.ceil((bucket.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
}

function normalizeModel(value) {
  let model = String(value || DEFAULT_MODEL).trim();
  if (model.indexOf('models/') === 0) model = model.slice('models/'.length);
  return model;
}

function getAllowedModels() {
  const rawAllowlist = String(process.env.GEMINI_ALLOWED_MODELS || '').trim();
  const configured = rawAllowlist
    ? rawAllowlist.split(',').map(function(item) { return item.trim(); }).filter(Boolean).map(normalizeModel)
    : DEFAULT_ALLOWED_MODELS.slice();
  const models = new Set(configured);
  const envModel = String(process.env.GEMINI_MODEL || '').trim();
  if (envModel) models.add(normalizeModel(envModel));
  return models;
}

function wrapTask(fn) {
  return new Promise(function(resolve, reject) {
    queue.push({ fn: fn, resolve: resolve, reject: reject });
    pumpQueue();
  });
}

function pumpQueue() {
  if (concurrency >= 1 || queue.length === 0) return;
  concurrency++;
  const task = queue.shift();
  task.fn().then(task.resolve, task.reject).finally(function() {
    concurrency--;
    pumpQueue();
  });
}

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function parseJwt(token, tokenName) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error((tokenName || 'Token App Check') + ' invalido');
  return {
    header: JSON.parse(decodeBase64Url(parts[0])),
    payload: JSON.parse(decodeBase64Url(parts[1])),
    signingInput: parts[0] + '.' + parts[1],
    signature: parts[2]
  };
}

async function getJwks(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && jwksCache && now < jwksCacheExpiresAt) return jwksCache;

  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error('Falha ao carregar chaves App Check');

  const cacheControl = (response.headers && response.headers.get('cache-control')) || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;

  jwksCache = await response.json();
  jwksCacheExpiresAt = now + Math.min(maxAgeMs, 6 * 60 * 60 * 1000);
  return jwksCache;
}

async function getFirebaseCerts(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && firebaseCertsCache && now < firebaseCertsCacheExpiresAt) {
    return firebaseCertsCache;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) throw new Error('Falha ao carregar certificados do Firebase');
  const certs = await response.json();
  if (!certs || typeof certs !== 'object') throw new Error('Certificados do Firebase invalidos');

  firebaseCertsCache = certs;
  firebaseCertsCacheExpiresAt = now + 60 * 60 * 1000;
  return certs;
}

async function verifyFirebaseIdToken(token) {
  const parsed = parseJwt(token, 'Token Firebase');
  if (parsed.header.alg !== 'RS256' || !parsed.header.kid) {
    throw new Error('Token Firebase sem assinatura valida');
  }

  let certs = await getFirebaseCerts();
  let certificate = certs[parsed.header.kid];
  if (!certificate) {
    certs = await getFirebaseCerts(true);
    certificate = certs[parsed.header.kid];
  }
  if (!certificate) throw new Error('Certificado Firebase desconhecido');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parsed.signingInput);
  verifier.end();
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: certificate, format: 'pem' });
  } catch (certificateError) {
    publicKey = certificate;
  }
  const signature = Buffer.from(parsed.signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!verifier.verify(publicKey, signature)) {
    throw new Error('Assinatura Firebase invalida');
  }

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(parsed.payload.aud) ? parsed.payload.aud : [parsed.payload.aud];
  const validIssuer = parsed.payload.iss === 'https://securetoken.google.com/' + PROJECT_ID;
  const validAudience = audience.includes(PROJECT_ID) || audience.includes(PROJECT_NUMBER);
  if (!validIssuer) throw new Error('Emissor Firebase invalido');
  if (!validAudience) throw new Error('Audiencia Firebase invalida');
  if (!parsed.payload.sub) throw new Error('Token Firebase sem usuario');
  if (!parsed.payload.exp || parsed.payload.exp < now - 30) throw new Error('Token Firebase expirado');
  if (!parsed.payload.iat || parsed.payload.iat > now + 30) throw new Error('Token Firebase emitido no futuro');

  return parsed.payload;
}

async function verifyAppCheckToken(token) {
  const parsed = parseJwt(token);
  if (parsed.header.alg !== 'RS256' || !parsed.header.kid) {
    throw new Error('Token App Check sem assinatura valida');
  }

  let jwks = await getJwks();
  let jwk = (jwks.keys || []).find(function(key) { return key.kid === parsed.header.kid; });
  if (!jwk) {
    jwks = await getJwks(true);
    jwk = (jwks.keys || []).find(function(key) { return key.kid === parsed.header.kid; });
  }
  if (!jwk) throw new Error('Chave App Check desconhecida');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parsed.signingInput);
  verifier.end();

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signature = Buffer.from(parsed.signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!verifier.verify(publicKey, signature)) {
    throw new Error('Assinatura App Check invalida');
  }

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(parsed.payload.aud) ? parsed.payload.aud : [parsed.payload.aud];
  const validAudience = audience.includes('projects/' + PROJECT_NUMBER) || audience.includes('projects/' + PROJECT_ID);
  const validIssuer = parsed.payload.iss === 'https://firebaseappcheck.googleapis.com/' + PROJECT_NUMBER;
  const validSubject = !FIREBASE_APP_ID || parsed.payload.sub === FIREBASE_APP_ID;

  if (!validAudience) throw new Error('Audiencia App Check invalida');
  if (!validIssuer) throw new Error('Emissor App Check invalido');
  if (!validSubject) throw new Error('App ID App Check invalido');
  if (!parsed.payload.exp || parsed.payload.exp < now - 30) throw new Error('Token App Check expirado');
  if (!parsed.payload.iat || parsed.payload.iat > now + 30) throw new Error('Token App Check emitido no futuro');

  return parsed.payload;
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function normalizePart(part) {
  if (typeof part === 'string') {
    return part ? { text: part } : null;
  }
  if (!part || typeof part !== 'object') return null;

  if (typeof part.text === 'string' && part.text.length) {
    return { text: part.text };
  }

  const inline = part.inlineData || part.inline_data;
  if (inline && typeof inline === 'object' && inline.data) {
    const parsedDataUrl = parseDataUrl(inline.data);
    const mimeType = parsedDataUrl ? parsedDataUrl.mimeType : (inline.mimeType || inline.mime_type);
    const data = parsedDataUrl ? parsedDataUrl.data : inline.data;
    if (mimeType && data) {
      return {
        inline_data: {
          mime_type: String(mimeType),
          data: String(data)
        }
      };
    }
  }

  // Também aceita o formato de imagem usado por APIs de chat compatíveis.
  if (part.type === 'image_url' || part.type === 'input_image') {
    const imageUrl = typeof part.image_url === 'string'
      ? part.image_url
      : part.image_url && (part.image_url.url || part.image_url.data);
    const parsed = parseDataUrl(imageUrl);
    if (parsed) {
      return {
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.data
        }
      };
    }
  }

  return null;
}

function normalizeContent(content) {
  let value = content;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.parts) {
    value = value.parts;
  }
  if (typeof value === 'string') value = [{ text: value }];
  if (!Array.isArray(value)) value = [value];

  const parts = value.map(normalizePart).filter(Boolean);
  if (!parts.length || !parts.some(function(part) { return part.text || part.inline_data; })) {
    throw { status: 400, message: 'Mensagem vazia ou invalida' };
  }
  return parts;
}

function getErrorMessage(data, fallback) {
  if (data && data.error) {
    if (typeof data.error === 'string') return data.error;
    if (data.error.message) return data.error.message;
  }
  if (data && data.message) return data.message;
  return fallback;
}

function getRetryAfterMs(response) {
  const raw = response && response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('retry-after')
    : '';
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 5000);
  return 0;
}

async function requestGemini(apiKey, model, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT_MS);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await response.json().catch(function() { return {}; });
    return { response: response, data: data };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error('O Gemini demorou demais para responder. Tente novamente.');
      timeoutError.noRetry = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAnswer(data) {
  const candidate = data && data.candidates && data.candidates[0];
  const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
  const finishReason = candidate && candidate.finishReason;

  if (blockReason) {
    throw { status: 422, message: 'Conteudo bloqueado pelo Gemini (' + blockReason + '). Reformule a mensagem.' };
  }
  if (finishReason && finishReason !== 'STOP') {
    throw { status: 422, message: 'O Gemini interrompeu a resposta (' + finishReason + '). Tente uma mensagem menor.' };
  }

  const parts = candidate && candidate.content && candidate.content.parts;
  if (Array.isArray(parts)) {
    const answer = parts
      .filter(function(part) { return part && !part.thought && typeof part.text === 'string'; })
      .map(function(part) { return part.text; })
      .join('')
      .trim();
    if (answer) return answer;
  }

  throw { status: 502, message: 'Resposta vazia do Gemini.' };
}

async function callGemini(apiKey, model, parts) {
  const payload = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { maxOutputTokens: 2048 }
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let result;
    try {
      result = await requestGemini(apiKey, model, payload);
    } catch (error) {
      if (error && error.noRetry) {
        throw { status: 504, message: error.message };
      }
      if (attempt < MAX_RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw { status: 502, message: 'Erro de rede ao conectar ao Gemini: ' + (error.message || 'tente novamente') };
    }

    const response = result.response;
    const data = result.data;
    if (response.ok) {
      const answer = extractAnswer(data);
      return { resposta: answer, model: model };
    }

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const wait = getRetryAfterMs(response) || Math.min(800 * (attempt + 1), 3000);
      await sleep(wait);
      continue;
    }

    if (response.status === 429) {
      throw { status: 429, message: 'Limite de requisicoes do Gemini atingido. Aguarde alguns instantes e tente novamente.' };
    }
    if (response.status === 401 || response.status === 403) {
      throw { status: response.status, message: 'Chave do Gemini invalida ou sem permissao. Confira GEMINI_API_KEY no Vercel.' };
    }
    if (response.status === 404) {
      throw { status: 404, message: 'Modelo do Gemini indisponivel: ' + model + '.' };
    }

    throw {
      status: response.status,
      message: getErrorMessage(data, 'Erro ' + response.status + ' ao chamar o Gemini.')
    };
  }

  throw { status: 502, message: 'Nao foi possivel obter uma resposta do Gemini.' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Metodo nao permitido' });
  }

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
    return json(res, 500, { error: 'GEMINI_API_KEY nao configurada no servidor. Adicione a chave no Vercel.' });
  }

  if (process.env.DISABLE_APP_CHECK !== 'true') {
    const appCheckToken = req.headers && (
      req.headers['x-firebase-appcheck'] || req.headers['X-Firebase-AppCheck']
    );
    if (!appCheckToken) {
      return json(res, 401, { error: 'Token App Check ausente' });
    }

    try {
      await verifyAppCheckToken(appCheckToken);
    } catch (error) {
      return json(res, 401, { error: 'Token App Check invalido' });
    }
  }

  let firebaseUser = null;
  if (isFirebaseAuthRequired()) {
    const authHeader = req.headers && (
      req.headers.authorization || req.headers.Authorization || ''
    );
    const idToken = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (!idToken || !/^Bearer\s+/i.test(String(authHeader))) {
      return json(res, 401, { error: 'Token Firebase ausente' });
    }

    try {
      firebaseUser = await verifyFirebaseIdToken(idToken);
    } catch (error) {
      return json(res, 401, { error: 'Token Firebase invalido' });
    }
  }

  const retryAfter = getRateLimitRetryAfter(req, firebaseUser && firebaseUser.sub);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter));
    return json(res, 429, { error: 'Limite de requisicoes por usuario/IP atingido. Tente novamente em alguns instantes.' });
  }

  try {
    let body = req.body || {};
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch (parseError) {
        return json(res, 400, { error: 'JSON invalido' });
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { error: 'Corpo da requisicao invalido' });
    }

    const serverModel = String(process.env.GEMINI_MODEL || '').trim();
    const model = serverModel
      ? normalizeModel(serverModel)
      : normalizeModel(body.model || DEFAULT_MODEL);
    if (!getAllowedModels().has(model)) {
      return json(res, 400, { error: 'Modelo do Gemini nao permitido' });
    }

    const rawContent = body.content !== undefined ? body.content : (body.parts !== undefined ? body.parts : body.prompt);
    const contentSize = Buffer.byteLength(JSON.stringify(rawContent || ''), 'utf8');
    if (contentSize > MAX_CONTENT_BYTES) {
      return json(res, 413, { error: 'Mensagem ou imagem muito grande (limite de 4 MB)' });
    }

    const parts = normalizeContent(rawContent);
    const result = await wrapTask(function() {
      return callGemini(apiKey, model, parts);
    });

    return json(res, 200, result);
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Erro interno' });
  }
};
