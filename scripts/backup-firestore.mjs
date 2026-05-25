#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_DOCUMENT_PATH = 'organizations/default';
const DEFAULT_OUTPUT_DIR = 'backups/firestore';

const readJsonFile = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const readDefaultProject = () => {
  const firebaseRc = readJsonFile('.firebaserc');
  return firebaseRc?.projects?.default || null;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    projectId: process.env.FIREBASE_PROJECT || readDefaultProject(),
    documentPath: DEFAULT_DOCUMENT_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    account: process.env.FIREBASE_ACCOUNT || null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split('=');
    const readValue = () => inlineValue ?? args[++index];

    if (key === '--project') parsed.projectId = readValue();
    else if (key === '--document') parsed.documentPath = readValue();
    else if (key === '--out') parsed.outputDir = readValue();
    else if (key === '--account') parsed.account = readValue();
    else if (key === '--help' || key === '-h') {
      console.log('Usage: npm run backup:firestore -- [--project PROJECT_ID] [--document organizations/default] [--out backups/firestore] [--account email@example.com]');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!parsed.projectId) {
    throw new Error('Firebase project id is required. Pass --project or set FIREBASE_PROJECT.');
  }

  return parsed;
};

const collectCredentialCandidates = (value, candidates = []) => {
  if (!value || typeof value !== 'object') return candidates;

  if (Array.isArray(value)) {
    value.forEach(item => collectCredentialCandidates(item, candidates));
    return candidates;
  }

  const accessToken =
    value.tokens?.access_token ||
    value.tokens?.accessToken ||
    value.access_token ||
    value.accessToken;
  const email = value.user?.email || value.email || value.account || null;
  const expiresAt = value.tokens?.expires_at || value.expires_at || value.expiresAt || null;

  if (typeof accessToken === 'string' && accessToken.length > 0) {
    candidates.push({ accessToken, email, expiresAt });
  }

  Object.values(value).forEach(item => collectCredentialCandidates(item, candidates));
  return candidates;
};

const readFirebaseCliLogins = () => {
  const result = spawnSync('npx', ['--yes', 'firebase-tools', 'login:list', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error('Could not read Firebase CLI login. Run `npx firebase-tools login` and try again.');
  }

  let loginList;
  try {
    loginList = JSON.parse(result.stdout);
  } catch {
    throw new Error('Firebase CLI returned an unexpected login format.');
  }

  return loginList;
};

const refreshFirebaseCliLogin = () => {
  const result = spawnSync('npx', ['--yes', 'firebase-tools', 'projects:list', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  if (result.status !== 0) {
    throw new Error('Could not refresh Firebase CLI login. Run `npx firebase-tools login` and try again.');
  }
};

const selectCredential = (loginList, account) => {
  const candidates = collectCredentialCandidates(loginList);
  return account
    ? candidates.find(candidate => candidate.email === account)
    : candidates[0];
};

const isExpiredOrNearExpiry = (credential) => {
  const expiresAt = Number(credential?.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;
};

const getFirebaseAccessToken = (account) => {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  let loginList = readFirebaseCliLogins();
  let credential = selectCredential(loginList, account);

  if (!credential) {
    throw new Error(account
      ? `No Firebase CLI login found for ${account}.`
      : 'No Firebase CLI login found. Run `npx firebase-tools login` and try again.');
  }

  if (isExpiredOrNearExpiry(credential)) {
    refreshFirebaseCliLogin();
    loginList = readFirebaseCliLogins();
    credential = selectCredential(loginList, account);
  }

  if (!credential || isExpiredOrNearExpiry(credential)) {
    throw new Error('Firebase CLI access token could not be refreshed.');
  }

  return credential.accessToken;
};

const encodeDocumentPath = (documentPath) =>
  documentPath
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/');

const decodeFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) {
    const numberValue = Number(value.integerValue);
    return Number.isSafeInteger(numberValue) ? numberValue : value.integerValue;
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return {
    latitude: value.geoPointValue.latitude,
    longitude: value.geoPointValue.longitude,
  };
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(item => decodeFirestoreValue(item));
  }
  if ('mapValue' in value) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }
  return value;
};

const decodeFirestoreFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );

const fetchFirestoreDocument = async ({ projectId, documentPath, accessToken }) => {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeDocumentPath(documentPath)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const body = await response.text();

  if (!response.ok) {
    let message = body;
    try {
      message = JSON.parse(body)?.error?.message || body;
    } catch {
      // Keep the raw message from the API.
    }
    throw new Error(`Firestore export failed: HTTP ${response.status} ${message}`);
  }

  return JSON.parse(body);
};

const formatLocalTimestamp = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
};

const safeFilePart = (value) =>
  value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';

const main = async () => {
  const options = parseArgs();
  const accessToken = getFirebaseAccessToken(options.account);
  const document = await fetchFirestoreDocument({ ...options, accessToken });
  const createdAt = new Date();
  const backup = {
    schemaVersion: 1,
    source: 'predeploy-backup-script',
    projectId: options.projectId,
    documentPath: options.documentPath,
    backupCreatedAt: createdAt.toISOString(),
    firestoreCreateTime: document.createTime,
    firestoreUpdateTime: document.updateTime,
    data: decodeFirestoreFields(document.fields || {}),
    raw: document,
  };

  mkdirSync(options.outputDir, { recursive: true });
  const fileName = `${formatLocalTimestamp(createdAt)}-${safeFilePart(options.projectId)}-${safeFilePart(options.documentPath)}.json`;
  const filePath = join(options.outputDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

  console.log(`Firestore backup saved: ${filePath}`);
  console.log(`Project: ${options.projectId}`);
  console.log(`Document: ${options.documentPath}`);
  if (document.updateTime) console.log(`Firestore updateTime: ${document.updateTime}`);
};

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
