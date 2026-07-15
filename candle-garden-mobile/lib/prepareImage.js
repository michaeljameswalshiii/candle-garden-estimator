import * as ImageManipulator from 'expo-image-manipulator';

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
 * Convert any phone photo (including iPhone HEIC) to resized JPEG base64.
 * Bedrock rejects HEIC; we must re-encode before upload.
 *
 * Strategy:
 *  1) Force re-encode to JPEG with no resize (most reliable HEIC→JPEG path)
 *  2) Resize long edge to 1600 and re-encode again
 *  3) Verify JPEG magic bytes; throw if still not JPEG
 *
 * @param {string} uri
 * @returns {Promise<{ base64: string, uri: string, width: number, height: number }>}
 */
export async function prepareImageForDetect(uri) {
  if (!uri) {
    throw new Error('No image URI to convert');
  }

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
    // One more hard retry from the intermediate JPEG file
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
}
