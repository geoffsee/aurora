import { setupWebGLXRFallback } from 'three/addons/webxr/WebGLXRFallback.js';
import { WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { isStaticHosting } from '../../shared/static-hosting.ts';
import { attachDisplayTransport, createDisplayTransport } from '../display-transport.ts';
import { mountRelayHost } from '../projector-bridge.ts';
import { outputIdFromLocation, VisualizerDataBridge } from './data-bridge.ts';
import { SpatialSceneController } from './spatial-scene.ts';
import {
  ensureXrSessionEnabledFeatures,
  forceLegacyWebGlLayer,
  withoutXrProjectionLayers,
  xrSessionNeedsLegacyWebGlLayer,
} from './xr-compat.ts';

type AuroraRenderer = WebGPURenderer | WebGLRenderer;
type BackendFlags = { isWebGPUBackend?: boolean };

function requiredElement<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Aurora Spatial is missing ${selector}`);
  return value;
}

const viewport = requiredElement<HTMLElement>('#viewport');
const enterButton = requiredElement<HTMLButtonElement>('#enter-vr');
const status = requiredElement<HTMLElement>('#status');
const details = requiredElement<HTMLElement>('#details');

const dataBridge = new VisualizerDataBridge(outputIdFromLocation(location.search));
const spatial = new SpatialSceneController(dataBridge.snapshot());
const transport = createDisplayTransport();
let renderer: AuroraRenderer | null = null;
let session: XRSession | null = null;
let disposeRelay = () => {};
let dataTimer = 0;
let useLegacyWebGlLayer = false;

function setStatus(message: string, detail = ''): void {
  status.textContent = message;
  details.textContent = detail;
}

function rendererName(value: AuroraRenderer): string {
  return value instanceof WebGLRenderer || !(value.backend as BackendFlags).isWebGPUBackend
    ? 'WebGL2 fallback'
    : 'WebGPU';
}

function sizeRenderer(value: AuroraRenderer): void {
  value.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  value.setSize(window.innerWidth, window.innerHeight);
  spatial.resize(window.innerWidth, window.innerHeight);
}

function renderFrame(time: number): void {
  spatial.step(time);
  renderer?.render(spatial.scene, spatial.camera);
}

function replaceRendererCanvas(next: AuroraRenderer, previous?: AuroraRenderer): void {
  if (previous?.domElement.isConnected) previous.domElement.replaceWith(next.domElement);
  else viewport.replaceChildren(next.domElement);
  sizeRenderer(next);
}

async function initializeRenderer(): Promise<AuroraRenderer> {
  const primary = new WebGPURenderer({
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  primary.xr.enabled = true;
  primary.xr.setReferenceSpaceType('local');
  await primary.init();
  renderer = primary;
  await primary.setAnimationLoop(renderFrame);
  replaceRendererCanvas(primary);

  setupWebGLXRFallback(
    primary,
    () => {
      const fallback = new WebGPURenderer({
        forceWebGL: true,
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
      });
      if (useLegacyWebGlLayer) forceLegacyWebGlLayer(fallback.xr);
      return fallback;
    },
    (fallback, previous) => {
      renderer = fallback;
      replaceRendererCanvas(fallback, previous);
      previous.dispose();
      setStatus('VR session active', `${rendererName(fallback)} · local reference space`);
    },
  );
  return primary;
}

async function switchToClassicWebGlRenderer(): Promise<WebGLRenderer> {
  if (renderer instanceof WebGLRenderer) return renderer;

  const previous = renderer;
  if (previous) await previous.setAnimationLoop(null);
  const fallback = new WebGLRenderer({
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
  });
  fallback.xr.enabled = true;
  fallback.xr.setReferenceSpaceType('local');
  fallback.setAnimationLoop(renderFrame);
  renderer = fallback;
  replaceRendererCanvas(fallback, previous ?? undefined);
  previous?.dispose();
  return fallback;
}

async function enterVr(): Promise<void> {
  if (!renderer || !navigator.xr) return;
  enterButton.disabled = true;
  setStatus('Entering VR…');
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['webgpu'],
    } as XRSessionInit);
    useLegacyWebGlLayer = xrSessionNeedsLegacyWebGlLayer(session);
    ensureXrSessionEnabledFeatures(session);
    session.addEventListener(
      'end',
      () => {
        session = null;
        document.body.classList.remove('xr-active');
        enterButton.disabled = false;
        enterButton.textContent = 'Enter VR';
        setStatus(
          'Ready for VR',
          `${renderer ? rendererName(renderer) : 'renderer'} · audio ${dataBridge.snapshot().source}`,
        );
      },
      { once: true },
    );
    if (useLegacyWebGlLayer) {
      const fallback = await switchToClassicWebGlRenderer();
      await withoutXrProjectionLayers(() => fallback.xr.setSession(session));
    } else {
      await renderer.xr.setSession(session);
    }
    document.body.classList.add('xr-active');
    enterButton.textContent = 'VR active';
    setStatus('VR session active', `${rendererName(renderer)} · local reference space`);
  } catch (error) {
    session = null;
    enterButton.disabled = false;
    setStatus('Could not enter VR', error instanceof Error ? error.message : String(error));
  }
}

async function boot(): Promise<void> {
  if (!window.isSecureContext) {
    setStatus('HTTPS is required', 'Open Aurora from an HTTPS URL or localhost.');
    return;
  }
  if (!navigator.gpu && typeof WebGL2RenderingContext === 'undefined') {
    setStatus('No supported graphics backend', 'WebGPU or WebGL2 is required.');
    return;
  }
  if (!navigator.xr) {
    setStatus('WebXR is unavailable', 'Use a browser and headset with immersive-vr support.');
    return;
  }
  const supported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!supported) {
    setStatus('Immersive VR is unavailable', 'This browser does not expose immersive-vr sessions.');
    return;
  }

  try {
    renderer = await initializeRenderer();
  } catch (error) {
    setStatus(
      'Renderer initialization failed',
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  attachDisplayTransport(transport, {
    onMessage: (frame) => dataBridge.ingest(frame),
    onOpen: () =>
      setStatus(
        'Ready for VR',
        `${rendererName(renderer as AuroraRenderer)} · live bridge connected`,
      ),
    onClose: () =>
      setStatus(
        'Ready for VR',
        `${rendererName(renderer as AuroraRenderer)} · waiting for visualizer data`,
      ),
  });
  if (isStaticHosting(location)) {
    disposeRelay = await mountRelayHost({ onMessage: (frame) => dataBridge.ingest(frame) });
  }
  dataTimer = window.setInterval(() => spatial.commit(dataBridge.snapshot()), 1_000 / 45);
  enterButton.disabled = false;
  setStatus(
    'Ready for VR',
    `${rendererName(renderer)} · ${navigator.gpu ? 'WebGPU available' : 'WebGL2 available'}`,
  );
}

enterButton.addEventListener('click', () => void enterVr());
window.addEventListener('resize', () => {
  if (renderer && !session) sizeRenderer(renderer);
});
window.addEventListener('beforeunload', () => {
  window.clearInterval(dataTimer);
  disposeRelay();
  transport.close();
  spatial.dispose();
  renderer?.dispose();
});

void boot();
