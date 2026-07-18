/**
 * Image prep for vessel detection (HEIC → JPEG + resize).
 * Loads expo-image-manipulator lazily so the app can start in Expo Go
 * even when that native module is missing / mismatched.
 */

/**
 * JPEG base64 always starts with /9j/ (magic bytes FF D8 FF).
 * HEIC/HEIF never does — use this to catch failed conversions.
 */
export function isJpegBase64(base64) {
  if (!base64 || typeof base64 !== 'string') return false;
  const cleaned = base64.replace(/\s/g, '');
  return cleaned.startsWith('/9j/');
}

/**
 * @returns {typeof import('expo-image-manipulator') | null}
 */
function loadImageManipulator() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const mod = require('expo-image-manipulator');
    // Touch a known export so missing native module throws here, not later
    if (!mod || typeof mod.manipulateAsync !== 'function') {
      return null;
    }
    return mod;
  } catch (e) {
    return null;
  }
}

/**
 * Probe whether the native ImageManipulator module is available.
 * Safe to call at runtime; never crashes the app shell.
 */
export function isImageManipulatorAvailable() {
  const mod = loadImageManipulator();
  if (!mod) return false;
  try {
    // Accessing SaveFormat can also throw if native module is missing
    return Boolean(mod.SaveFormat && mod.SaveFormat.JPEG);
  } catch {
    return false;
  }
}

/**
 * Best-effort base64 read without ImageManipulator (JPEG gallery picks only).
 */
async function readUriAsBase64(uri) {
  // Prefer FileSystem when available (Expo)
  try {
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system');
    if (FileSystem?.readAsStringAsync && FileSystem?.EncodingType?.Base64) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (base64) return base64;
    }
  } catch {
    /* fall through */
  }

  // fetch(file://) works for some URIs in RN
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const comma = String(dataUrl).indexOf(',');
        resolve(comma >= 0 ? String(dataUrl).slice(comma + 1) : '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (base64) return base64;
  } catch {
    /* fall through */
  }

  return null;
}

/**
 * Convert any phone photo (including iPhone HEIC) to resized JPEG base64.
 * Bedrock rejects HEIC; we must re-encode before upload when possible.
 *
 * @param {string} uri
 * @returns {Promise<{ base64: string, uri: string, width?: number, height?: number }>}
 */
export async function prepareImageForDetect(uri) {
  if (!uri) {
    throw new Error('No image URI to convert');
  }

  const ImageManipulator = loadImageManipulator();

  if (!ImageManipulator) {
    // Expo Go / mismatched client: try raw base64 (works for real JPEGs only)
    const base64 = await readUriAsBase64(uri);
    if (base64 && isJpegBase64(base64)) {
      return { base64, uri };
    }
    throw new Error(
      'Photo conversion is unavailable in this app build (missing ImageManipulator). ' +
        'Update Expo Go to the latest version, or open the TestFlight build. ' +
        'On iPhone you can also use Settings → Camera → Formats → Most Compatible, ' +
        'or enter ounces manually on the estimator.'
    );
  }

  try {
    // Step 1: force decode + JPEG encode (critical for HEIC)
    const jpegOnly = await ImageManipulator.manipulateAsync(
      uri,
      [], // no ops — still re-encodes when format is JPEG
      {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // Step 2: resize for API size limits
    const resized = await ImageManipulator.manipulateAsync(
      jpegOnly.uri,
      [{ resize: { width: 1600 } }],
      {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!resized.base64) {
      throw new Error('Image conversion produced no base64 data');
    }

    if (!isJpegBase64(resized.base64)) {
      const retry = await ImageManipulator.manipulateAsync(
        resized.uri || jpegOnly.uri,
        [{ resize: { width: 1280 } }],
        {
          compress: 0.65,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (!retry.base64 || !isJpegBase64(retry.base64)) {
        throw new Error(
          'Could not convert this photo to JPEG. On iPhone: Settings → Camera → Formats → Most Compatible, then retake/re-pick the photo.'
        );
      }

      return {
        base64: retry.base64,
        uri: retry.uri,
        width: retry.width,
        height: retry.height,
      };
    }

    return {
      base64: resized.base64,
      uri: resized.uri,
      width: resized.width,
      height: resized.height,
    };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/native module|ExpoImageManipulator|cannot find/i.test(msg)) {
      const base64 = await readUriAsBase64(uri);
      if (base64 && isJpegBase64(base64)) {
        return { base64, uri };
      }
      throw new Error(
        'Photo conversion native module is not available. Update Expo Go or use the TestFlight app. You can still enter ounces manually.'
      );
    }
    throw err;
  }
}
