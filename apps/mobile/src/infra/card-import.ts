import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { CARD_LIMITS, CardImportError, inspectImportFile } from '@mobile-ai-rp/rp-card-codecs';

/** Import only a user-selected cached file. No image rendering, remote assets or code execution. */
export async function pickProbeCard() {
  const selection = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;
  const asset = selection.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    if (file.size > CARD_LIMITS.fileBytes)
      throw new CardImportError('too_large', {
        kind: 'fileBytes',
        maximum: CARD_LIMITS.fileBytes,
        actual: file.size,
      });
    const bytes = new Uint8Array(await file.arrayBuffer());
    return inspectImportFile(bytes);
  } finally {
    // copyToCacheDirectory creates an app-owned temporary copy; never delete the original.
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  }
}
