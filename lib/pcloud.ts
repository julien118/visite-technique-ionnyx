// Helper pCloud — API HTTP/JSON
// Doc: https://docs.pcloud.com/

import { createHash } from 'crypto';

const DEFAULT_HOSTNAME = 'eapi.pcloud.com'; // EU

function sha1hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export type PCloudHostname = 'eapi.pcloud.com' | 'api.pcloud.com';

export interface PCloudError {
  result: number;
  error: string;
}

export interface PCloudUserInfo {
  result: number;
  auth?: string;
  email?: string;
  userid?: number;
  error?: string;
}

export interface PCloudUploadResponse {
  result: number;
  fileids?: number[];
  metadata?: Array<{
    fileid: number;
    name: string;
    size: number;
    parentfolderid: number;
  }>;
  error?: string;
}

/**
 * Authentifie un utilisateur avec email/mot de passe et renvoie un auth token.
 * Le mot de passe ne doit JAMAIS être stocké — seul le token l'est.
 */
export async function pcloudLogin(
  email: string,
  password: string,
  hostname: PCloudHostname = DEFAULT_HOSTNAME
): Promise<PCloudUserInfo> {
  // Essai 1 — auth par mot de passe direct
  const plainUrl = new URL(`https://${hostname}/userinfo`);
  plainUrl.searchParams.set('getauth', '1');
  plainUrl.searchParams.set('username', email);
  plainUrl.searchParams.set('password', password);
  const plainRes = await fetch(plainUrl.toString());
  const plainData = await plainRes.json();

  if (plainData.result === 0 && plainData.auth) {
    return plainData;
  }

  // Essai 2 — auth par digest (pour comptes modernes)
  const digestRes = await fetch(`https://${hostname}/getdigest`);
  const digestData = await digestRes.json();
  if (digestData.result !== 0 || !digestData.digest) {
    return plainData;
  }

  const emailLower = email.toLowerCase();
  const passwordDigest = sha1hex(password + sha1hex(emailLower + digestData.digest));

  const digestUrl = new URL(`https://${hostname}/userinfo`);
  digestUrl.searchParams.set('getauth', '1');
  digestUrl.searchParams.set('username', emailLower);
  digestUrl.searchParams.set('digest', digestData.digest);
  digestUrl.searchParams.set('passworddigest', passwordDigest);
  const response = await fetch(digestUrl.toString());
  return response.json();
}

/**
 * Vérifie qu'un token est toujours valide.
 */
export async function pcloudVerifyToken(
  auth: string,
  hostname: PCloudHostname = DEFAULT_HOSTNAME
): Promise<boolean> {
  const url = new URL(`https://${hostname}/userinfo`);
  url.searchParams.set('auth', auth);
  const response = await fetch(url.toString());
  const data = await response.json();
  return data.result === 0;
}

/**
 * Upload un fichier dans un dossier pCloud identifié par son folderid.
 */
export async function pcloudUploadFile(
  auth: string,
  folderId: number,
  fileName: string,
  fileBuffer: Buffer,
  hostname: PCloudHostname = DEFAULT_HOSTNAME
): Promise<PCloudUploadResponse> {
  const url = new URL(`https://${hostname}/uploadfile`);
  url.searchParams.set('auth', auth);
  url.searchParams.set('folderid', String(folderId));
  url.searchParams.set('filename', fileName);
  url.searchParams.set('nopartial', '1');

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' });
  formData.append('file', blob, fileName);

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
  });
  return response.json();
}

/**
 * Génère un lien de partage public pour un fichier uploadé.
 */
export async function pcloudGetFileLink(
  auth: string,
  fileId: number,
  hostname: PCloudHostname = DEFAULT_HOSTNAME
): Promise<string | null> {
  const url = new URL(`https://${hostname}/getfilepublink`);
  url.searchParams.set('auth', auth);
  url.searchParams.set('fileid', String(fileId));

  const response = await fetch(url.toString());
  const data = await response.json();
  return data.link || null;
}

/**
 * Révoque un token pCloud.
 */
export async function pcloudLogout(
  auth: string,
  hostname: PCloudHostname = DEFAULT_HOSTNAME
): Promise<void> {
  const url = new URL(`https://${hostname}/logout`);
  url.searchParams.set('auth', auth);
  await fetch(url.toString()).catch(() => {});
}
