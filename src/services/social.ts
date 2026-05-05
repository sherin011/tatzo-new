import { Share } from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { writeNotificationDual } from './notifications';

export type SocialNotificationType = 'like' | 'follow';

type ArtistIdentity = {
  uid?: string;
  displayName: string;
  handle?: string;
};

export const buildShareLink = (postId: string) => {
  const safe = encodeURIComponent(postId);
  return `tatzo://post/${safe}`;
};

export const buildArtistShareLink = (artistUid: string) => {
  const safe = encodeURIComponent(artistUid);
  return `tatzo://artist/${safe}`;
};

const buildWebFallbackLink = (kind: 'post' | 'artist', id: string) => {
  const safe = encodeURIComponent(id);
  return `https://tatzo.app/${kind}/${safe}`;
};

const resolveTargetUid = async (identity: ArtistIdentity): Promise<string | null> => {
  if (identity.uid) return identity.uid;

  // With max privacy, resolve only from public artists collection.
  const byDisplay = query(collection(db, 'artists'), where('displayName', '==', identity.displayName), limit(1));
  const byArtistName = query(collection(db, 'artists'), where('artistName', '==', identity.displayName), limit(1));
  const [displaySnap, artistNameSnap] = await Promise.all([getDocs(byDisplay), getDocs(byArtistName)]);
  if (displaySnap.docs.length) return displaySnap.docs[0].id;
  if (artistNameSnap.docs.length) return artistNameSnap.docs[0].id;

  const safeHandle = String(identity.handle ?? '')
    .trim()
    .replace(/^@/, '');
  if (safeHandle) {
    const all = await getDocs(query(collection(db, 'artists'), limit(60)));
    const match = all.docs.find((row) => {
      const data = row.data() as any;
      const display = String(data.displayName ?? '').trim().toLowerCase();
      const artistName = String(data.artistName ?? '').trim().toLowerCase();
      const candidateHandle = (artistName || display).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      return candidateHandle === safeHandle.toLowerCase();
    });
    if (match) return match.id;
  }

  return null;
};

const notificationDocId = (type: SocialNotificationType, params: { toUid: string; fromUid: string; postId?: string }) => {
  if (type === 'follow') return `follow_${params.toUid}_${params.fromUid}`;
  return `${type}_${params.postId ?? 'na'}_${params.fromUid}`;
};

export const toggleLike = async (params: { postId: string; artist: ArtistIdentity; postPreview: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';
  const targetUidPromise = resolveTargetUid(params.artist);

  const likeRef = doc(db, 'posts', params.postId, 'likes', actorUid);
  const postRef = doc(db, 'posts', params.postId);
  const likeSnap = await getDoc(likeRef);

  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likesCount: increment(-1), updatedAt: serverTimestamp() }).catch(() => {});
    return { liked: false, targetUid: params.artist.uid ?? null, likeDelta: -1 };
  }

  await setDoc(likeRef, { uid: actorUid, createdAt: serverTimestamp() }, { merge: true });
  await updateDoc(postRef, { likesCount: increment(1), updatedAt: serverTimestamp() }).catch(() => {});
  const targetUid = await targetUidPromise.catch(() => null);
  const notifId = targetUid ? notificationDocId('like', { toUid: targetUid, fromUid: actorUid, postId: params.postId }) : '';

  if (targetUid && notifId) {
    try {
      await writeNotificationDual({
        id: notifId,
        toUid: targetUid,
        type: 'like',
        fromUid: actorUid,
        fromName: actorName,
        title: 'New Like',
        message: `${actorName} liked your post.`,
        entityType: 'post',
        entityId: params.postId,
        postId: params.postId,
        postPreview: params.postPreview,
        createOnly: true,
      });
    } catch {
      // Keep like interaction successful even if notification write fails.
    }
  }

  return { liked: true, targetUid, likeDelta: 1 };
};

export const sharePost = async (params: {
  postId: string;
  artist: ArtistIdentity;
  postPreview: string;
  shareMessage: string;
}) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const targetUidPromise = resolveTargetUid(params.artist);

  const postLink = buildShareLink(params.postId);
  const postFallback = buildWebFallbackLink('post', params.postId);
  const artistLink = params.artist.uid ? buildArtistShareLink(params.artist.uid) : '';
  const artistFallback = params.artist.uid ? buildWebFallbackLink('artist', params.artist.uid) : '';

  await Share.share({
    message: `${params.shareMessage}\n\n${postLink}\n${postFallback}${artistLink ? `\n${artistLink}\n${artistFallback}` : ''}`,
  });

  const shareRef = doc(db, 'posts', params.postId, 'shares', actorUid);
  await setDoc(
    shareRef,
    { uid: actorUid, link: postLink, createdAt: serverTimestamp() },
    { merge: true },
  );

  const artistUid = await targetUidPromise.catch(() => null);
  return { shared: true, artistUid };
};

export const toggleFollow = async (params: { artist: ArtistIdentity }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';

  const targetUid = await resolveTargetUid(params.artist);
  if (!targetUid) return { following: false, targetUid: null };

  const followRef = doc(db, 'follows', `${actorUid}_${targetUid}`);
  const followSnap = await getDoc(followRef);
  const notifId = notificationDocId('follow', { toUid: targetUid, fromUid: actorUid });

  if (followSnap.exists()) {
    await deleteDoc(followRef);
    return { following: false, targetUid };
  }

  await setDoc(
    followRef,
    { id: followRef.id, fromUid: actorUid, toUid: targetUid, createdAt: serverTimestamp() },
    { merge: true },
  );

  try {
    await writeNotificationDual({
      id: notifId,
      toUid: targetUid,
      type: 'follow',
      fromUid: actorUid,
      fromName: actorName,
      title: 'New Follower',
      message: `${actorName} started following you.`,
      entityType: 'profile',
      entityId: actorUid,
      createOnly: true,
    });
  } catch {
    // Keep follow relation successful even if notification write fails.
  }

  return { following: true, targetUid };
};

export const getPostLikeState = async (postId: string, uid: string) => {
  if (!postId || !uid) return false;
  const snap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
  return snap.exists();
};

export const getFollowState = async (targetUid: string | undefined, uid: string) => {
  const safeTarget = String(targetUid ?? '').trim();
  if (!safeTarget || !uid || safeTarget === uid) return false;
  const snap = await getDoc(doc(db, 'follows', `${uid}_${safeTarget}`));
  return snap.exists();
};
