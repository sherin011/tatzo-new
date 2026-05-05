import * as DocumentPicker from 'expo-document-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';

type PickedImage = {
  uri: string;
  name: string;
  mimeType: string;
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

const uriToBlob = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Could not read file.'));
    xhr.onload = () => resolve(xhr.response);
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

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
  };
};

export const uploadPickedImage = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  mimeType?: string;
}): Promise<UploadedImage> => {
  const safeFolder = String(params.folderPath || 'uploads').replace(/\/+$/, '');
  const safeName = sanitizeFileName(params.fileName || `image_${Date.now()}.jpg`);
  const finalPath = `${safeFolder}/${Date.now()}_${safeName}`;

  const blob = await uriToBlob(params.uri);
  const storageRef = ref(storage, finalPath);
  await uploadBytes(storageRef, blob, {
    contentType: params.mimeType || 'image/jpeg',
  });
  const downloadUrl = await getDownloadURL(storageRef);

  return {
    downloadUrl,
    storagePath: finalPath,
    fileName: safeName,
  };
};

