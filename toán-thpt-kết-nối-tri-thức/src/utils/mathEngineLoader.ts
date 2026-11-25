/**
 * Dynamic script loaders & TypeScript interfaces for Desmos Graphing Calculator API
 * and GeoGebra Math Apps 3D API (deployggb.js).
 */

export interface DesmosCalculatorApi {
  setExpression: (expr: { id?: string; latex: string; color?: string }) => void;
  removeExpression: (expr: { id: string }) => void;
  getExpressions: () => Array<{ id: string; latex?: string }>;
  setBlank: () => void;
  resize: () => void;
  destroy: () => void;
}

export interface GgbAppletApi {
  evalCommand: (cmd: string) => boolean;
  reset: () => void;
  getAllObjectNames: (type?: string) => string[];
  deleteObject: (objName: string) => void;
  setSize: (width: number, height: number) => void;
  setColor: (objName: string, r: number, g: number, b: number) => void;
  setFilling: (objName: string, opacity: number) => void;
  setLineThickness: (objName: string, thickness: number) => void;
  setAnimating: (objName: string, animate: boolean) => void;
  setAnimationSpeed: (objName: string, speed: number) => void;
  setAxes: (show: boolean) => void;
  setGrid: (show: boolean) => void;
}

interface DesmosGlobal {
  GraphingCalculator: (
    element: HTMLElement,
    options?: Record<string, unknown>
  ) => DesmosCalculatorApi;
}

interface GgbAppletConstructor {
  new (params: Record<string, unknown>, auto?: boolean): {
    inject: (elementId: string) => void;
  };
}

declare global {
  interface Window {
    Desmos?: DesmosGlobal;
    GGBApplet?: GgbAppletConstructor;
  }
}

const DESMOS_SCRIPT_URL =
  'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
const GEOGEBRA_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js';

let desmosPromise: Promise<DesmosGlobal> | null = null;
let geogebraPromise: Promise<GgbAppletConstructor> | null = null;

function loadExternalScript(src: string, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Hết thời gian tải thư viện ${src}`));
      }
    }, timeoutMs);

    const onLoad = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.dataset.loaded = 'true';
      resolve();
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error(`Không thể tải thư viện ${src}`));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function loadDesmosApi(): Promise<DesmosGlobal> {
  if (typeof window !== 'undefined' && window.Desmos) {
    return Promise.resolve(window.Desmos);
  }
  if (!desmosPromise) {
    desmosPromise = loadExternalScript(DESMOS_SCRIPT_URL)
      .then(() => {
        if (!window.Desmos) {
          throw new Error('Desmos API chưa sẵn sàng sau khi tải script.');
        }
        return window.Desmos;
      })
      .catch((err) => {
        desmosPromise = null;
        throw err;
      });
  }
  return desmosPromise;
}

export function loadGeoGebraApi(): Promise<GgbAppletConstructor> {
  if (typeof window !== 'undefined' && window.GGBApplet) {
    return Promise.resolve(window.GGBApplet);
  }
  if (!geogebraPromise) {
    geogebraPromise = loadExternalScript(GEOGEBRA_SCRIPT_URL)
      .then(() => {
        if (!window.GGBApplet) {
          throw new Error('GeoGebra Math Apps API (deployggb.js) chưa sẵn sàng.');
        }
        return window.GGBApplet;
      })
      .catch((err) => {
        geogebraPromise = null;
        throw err;
      });
  }
  return geogebraPromise;
}
