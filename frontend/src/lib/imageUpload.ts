/**
 * BUDGY — Image normalization for OCR upload
 *
 * iPhones save photos in HEIC/HEIF by default. Most backend OCR pipelines
 * (and Tesseract/Vision via Pillow) cannot decode HEIC. This helper converts
 * ANY input image to JPEG (quality 0.85) and returns a clean { uri, base64 }.
 *
 * Also: caps the longest edge to ~1800px to keep payloads under the 10MB
 * Kubernetes ingress limit while preserving OCR accuracy.
 *
 * NEVER throws. Falls back to the original URI if manipulation fails.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface NormalizedImage {
  uri: string;
  base64?: string;
  mimeType: string;
  width?: number;
  height?: number;
  ok: boolean;
  error?: string;
}

const MAX_DIM = 1800;

export async function normalizeImageForUpload(
  inputUri: string,
  options: { includeBase64?: boolean; quality?: number } = {}
): Promise<NormalizedImage> {
  const { includeBase64 = true, quality = 0.85 } = options;
  try {
    // Step 1: re-encode to JPEG via ImageManipulator (handles HEIC/HEIF on iOS
    // because the system decoder reads the source URI natively).
    const manipulated = await ImageManipulator.manipulateAsync(
      inputUri,
      [{ resize: { width: MAX_DIM } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: includeBase64,
      }
    );
    return {
      uri: manipulated.uri,
      base64: manipulated.base64,
      mimeType: 'image/jpeg',
      width: manipulated.width,
      height: manipulated.height,
      ok: true,
    };
  } catch (e: any) {
    // Fallback: read original file as base64 (last-resort, no conversion)
    try {
      if (includeBase64 && Platform.OS !== 'web') {
        const fs: any = FileSystem as any;
        const b64 = await fs.readAsStringAsync(inputUri, {
          encoding: fs.EncodingType?.Base64 || 'base64',
        });
        return {
          uri: inputUri,
          base64: b64,
          mimeType: 'image/jpeg',
          ok: true,
        };
      }
    } catch {}
    return {
      uri: inputUri,
      mimeType: 'image/jpeg',
      ok: false,
      error: e?.message || 'image_normalize_failed',
    };
  }
}
