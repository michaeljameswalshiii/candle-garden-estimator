import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Convert any phone photo (including iPhone HEIC) to a resized JPEG base64
 * payload that Bedrock vision models accept.
 *
 * @param {string} uri - local file / content URI from ImagePicker
 * @returns {Promise<{ base64: string, uri: string, width: number, height: number }>}
 */
export async function prepareImageForDetect(uri) {
  // Resize long edge ~1600px to stay under API Gateway ~10MB limit
  // and keep Bedrock vision fast/reliable.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    {
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  if (!result.base64) {
    throw new Error('Image conversion produced no base64 data');
  }

  return {
    base64: result.base64,
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}
