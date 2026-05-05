import * as DocumentPicker from 'expo-document-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';

type PickedImage = {
  uri: string;
  name: string;
  mimeType: string;
  blob?: Blob;
};

export type UploadedImage = {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
};

const sanitizeFileName = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

const uriToBlobWithXhr = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Could not read file.'));
    xhr.onload = () => resolve(xhr.response);
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

const uriToBlob = async (uri: string): Promise<Blob> => {
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read file.');
    return await response.blob();
  } catch {
    return uriToBlobWithXhr(uri);
  }
};

export const pickSingleImageFromDevice = async (): Promise<PickedImage | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const name = sanitizeFileName(String(asset.name || `image_${Date.now()}.jpg`));
  const mimeType = String(asset.mimeType || 'image/jpeg');

  return {
    uri: asset.uri,
    name,
    mimeType,
    blob: (asset as any).file instanceof Blob ? ((asset as any).file as Blob) : undefined,
  };
};

export const uploadPickedImage = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  mimeType?: string;
  blob?: Blob;
}): Promise<UploadedImage> => {
  const safeFolder = String(params.folderPath || 'uploads').replace(/\/+$/, '');
  const safeName = sanitizeFileName(params.fileName || `image_${Date.now()}.jpg`);
  const finalPath = `${safeFolder}/${Date.now()}_${safeName}`;

  const blob = params.blob ?? (await uriToBlob(params.uri));
  if (blob.size > 8 * 1024 * 1024) {
    throw new Error('Image is too large. Please upload an image below 8 MB.');
  }

  const storageRef = ref(storage, finalPath);
  try {
    await uploadBytes(storageRef, blob, {
      contentType: params.mimeType || 'image/jpeg',
    });
  } catch (error: any) {
    const code = String(error?.code ?? '');
    if (code.includes('unauthorized')) {
      throw new Error('Upload permission denied. Please sign in again and deploy latest storage rules.');
    }
    throw new Error(error?.message ?? 'Image upload failed. Please try again.');
  }

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    downloadUrl,
    storagePath: finalPath,
    fileName: safeName,
  };
};
