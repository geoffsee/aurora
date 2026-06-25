export const MIC_FFT_SIZE = 2048;
export const MIC_MIN_DB = -100;
export const MIC_MAX_DB = -30;
export const MIC_SEND_INTERVAL_MS = 50;

export {
	extractMicFeatures,
	micSecureContextError,
} from "../../../bridge/mic-features.ts";
