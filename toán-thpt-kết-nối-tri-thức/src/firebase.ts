import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import {
  Auth,
  FacebookAuthProvider,
  GoogleAuthProvider,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import defaultAppletConfig from '../firebase-applet-config.json';
import {
  CustomFirebaseConfig,
  normalizeAuthIdentifier,
  parseFirebaseConfigInput,
} from './utils/accountStore';

export const CUSTOM_FIREBASE_CONFIG_STORAGE_KEY = 'mathnova_custom_firebase_config_v1';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

interface FirebaseRuntimeState {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  config: CustomFirebaseConfig;
  isCustom: boolean;
  version: number;
}

const DEFAULT_CONFIG: CustomFirebaseConfig = {
  projectId: defaultAppletConfig.projectId,
  appId: defaultAppletConfig.appId,
  apiKey: defaultAppletConfig.apiKey,
  authDomain: defaultAppletConfig.authDomain,
  firestoreDatabaseId: defaultAppletConfig.firestoreDatabaseId,
  storageBucket: defaultAppletConfig.storageBucket,
  messagingSenderId: defaultAppletConfig.messagingSenderId,
  measurementId: defaultAppletConfig.measurementId || undefined,
};

export function getDefaultFirebaseConfig(): CustomFirebaseConfig {
  return { ...DEFAULT_CONFIG };
}

export function getSavedCustomFirebaseConfig(): CustomFirebaseConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return parseFirebaseConfigInput(raw);
  } catch {
    return null;
  }
}

export function getActiveFirebaseConfig(): CustomFirebaseConfig {
  return getSavedCustomFirebaseConfig() ?? getDefaultFirebaseConfig();
}

export function hasCustomFirebaseConfig(): boolean {
  return getSavedCustomFirebaseConfig() !== null;
}

function createFirebaseRuntime(
  config: CustomFirebaseConfig,
  isCustom: boolean,
  version: number
): FirebaseRuntimeState {
  const appName = version === 0 ? undefined : `mathnova-custom-${version}`;
  const app = appName ? initializeApp(config, appName) : initializeApp(config);
  const auth = getAuth(app);
  const db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  return {
    app,
    auth,
    db,
    config,
    isCustom,
    version,
  };
}

const initialCustom = getSavedCustomFirebaseConfig();
let runtime: FirebaseRuntimeState = createFirebaseRuntime(
  initialCustom ?? getDefaultFirebaseConfig(),
  initialCustom !== null,
  0
);

const listeners = new Set<() => void>();

export function subscribeFirebaseRuntimeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyRuntimeChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getFirebaseRuntime(): FirebaseRuntimeState {
  return runtime;
}

export async function testFirestoreConnection(
  targetDb: Firestore = runtime.db
): Promise<boolean> {
  try {
    await getDocFromServer(doc(targetDb, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('the client is offline')
    ) {
      console.error(
        'Please check your Firebase configuration. Firestore client is offline.'
      );
      return false;
    }
    // Other errors (such as missing document or network block) still mean SDK reached or attempted endpoint
    return true;
  }
}

// Run startup connectivity validation
void testFirestoreConnection(runtime.db);

export async function saveAndActivateFirebaseConfig(
  rawText: string
): Promise<CustomFirebaseConfig> {
  const parsed = parseFirebaseConfigInput(rawText);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      CUSTOM_FIREBASE_CONFIG_STORAGE_KEY,
      JSON.stringify(parsed, null, 2)
    );
  }
  const prevApp = runtime.app;
  runtime = createFirebaseRuntime(parsed, true, runtime.version + 1);
  try {
    await deleteApp(prevApp);
  } catch {
    // Ignore cleanup errors on previous app
  }
  void testFirestoreConnection(runtime.db);
  notifyRuntimeChange();
  return parsed;
}

export async function resetToDefaultFirebaseConfig(): Promise<CustomFirebaseConfig> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_STORAGE_KEY);
  }
  const def = getDefaultFirebaseConfig();
  const prevApp = runtime.app;
  runtime = createFirebaseRuntime(def, false, runtime.version + 1);
  try {
    await deleteApp(prevApp);
  } catch {
    // Ignore cleanup errors on previous app
  }
  void testFirestoreConnection(runtime.db);
  notifyRuntimeChange();
  return def;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = runtime.auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function inferAuthProviderKind(
  user: User | null
): 'google' | 'facebook' | 'password' {
  const providerId = user?.providerData?.[0]?.providerId ?? '';
  if (providerId.includes('google')) return 'google';
  if (providerId.includes('facebook')) return 'facebook';
  return 'password';
}

export async function signInWithGooglePopup(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(runtime.auth, provider);
}

export async function signInWithFacebookPopup(): Promise<UserCredential> {
  const provider = new FacebookAuthProvider();
  provider.addScope('public_profile');
  provider.addScope('email');
  return signInWithPopup(runtime.auth, provider);
}

export async function signInWithUsernameOrEmail(
  identifier: string,
  password: string
): Promise<UserCredential> {
  const { email } = normalizeAuthIdentifier(identifier);
  if (!password) {
    throw new Error('Vui lòng nhập mật khẩu.');
  }
  return signInWithEmailAndPassword(runtime.auth, email, password);
}

export async function signUpWithUsernameOrEmail(
  identifier: string,
  password: string,
  customDisplayName?: string
): Promise<UserCredential> {
  const { email, displayNameHint } = normalizeAuthIdentifier(identifier);
  if (password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }
  const cred = await createUserWithEmailAndPassword(runtime.auth, email, password);
  const chosenName = (customDisplayName?.trim() || displayNameHint).slice(0, 60);
  if (chosenName && cred.user) {
    await updateProfile(cred.user, { displayName: chosenName });
  }
  return cred;
}

export async function updateFirebaseDisplayName(displayName: string): Promise<void> {
  const user = runtime.auth.currentUser;
  if (!user) return;
  await updateProfile(user, { displayName: displayName.trim().slice(0, 60) });
}

export async function signOutFirebase(): Promise<void> {
  await signOut(runtime.auth);
}

export function translateFirebaseAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Đăng nhập thất bại. Vui lòng thử lại.';
  }
  const code = (error as { code?: string }).code ?? '';
  const msg = error.message || '';

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'Phương thức đăng nhập này chưa được bật trong Firebase Console (Authentication → Sign-in method). Quản trị viên cần bật Google / Facebook / Email-Password trong bảng điều khiển Firebase.';
  }
  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return `Tên miền hiện tại (${host}) chưa được thêm vào Authorized Domains trong Firebase Console → Authentication → Settings.`;
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đang chặn cửa sổ bật lên (Popup). Vui lòng cho phép popup rồi bấm lại.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Email này đã liên kết với một phương thức đăng nhập khác (ví dụ Google hoặc Mật khẩu). Hãy dùng đúng phương thức đã đăng ký.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Tên đăng nhập / Email hoặc mật khẩu không chính xác.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Tên đăng nhập hoặc Email này đã tồn tại trên hệ thống. Hãy chuyển sang tab Đăng nhập.';
  }
  if (code === 'auth/weak-password') {
    return 'Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.';
  }
  if (code === 'auth/invalid-api-key') {
    return 'Firebase API Key không hợp lệ. Vui lòng kiểm tra lại Cấu hình Firebase JSON trong phần Cài đặt.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Lỗi kết nối mạng tới máy chủ Firebase. Vui lòng kiểm tra kết nối Internet.';
  }

  return msg || 'Có lỗi xảy ra khi xác thực tài khoản Firebase.';
}
