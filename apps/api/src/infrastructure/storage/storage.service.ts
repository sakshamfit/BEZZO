/**
 * Object storage (media/CDN spec, compliance spec §documents).
 *
 * Two drivers:
 *  - `local` (development/test): files under STORAGE_LOCAL_ROOT, served through a signed API route.
 *  - `s3` (staging/production): any S3-compatible endpoint (AWS S3, MinIO, Cloudflare R2, Wasabi).
 *    Uploads and downloads use presigned URLs so bytes never transit the API.
 *
 * Compliance rules enforced here:
 *  - document objects are PRIVATE; a presigned URL is short-lived and always scoped to one object;
 *  - object keys are generated server-side (`<env>/<ownerType>/<ownerId>/<uuid>-<safeName>`), so a
 *    client can never choose a path, overwrite another tenant's document or traverse directories.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { ErrorCode } from '@bezzo/contracts';
import { APP_CONFIG } from '../config/config.module';

export interface PutObjectInput {
  objectKey: string;
  content: Buffer;
  contentType: string;
  /** PRIVATE is the default for compliance documents; PUBLIC is only for catalog media. */
  visibility?: 'PRIVATE' | 'PUBLIC';
  checksumSha256?: string;
}

export interface StoredObject {
  objectKey: string;
  sizeBytes: number;
  contentType: string;
  checksumSha256: string;
}

export interface PresignedUpload {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  expiresInSeconds: number;
  headers: Record<string, string>;
}

export interface StorageDriver {
  readonly kind: 'local' | 's3';
  put(input: PutObjectInput): Promise<StoredObject>;
  get(objectKey: string): Promise<Buffer>;
  exists(objectKey: string): Promise<boolean>;
  delete(objectKey: string): Promise<void>;
  /** A time-limited URL the client can use directly. */
  signedUrl(objectKey: string, ttlSeconds: number, method?: 'GET' | 'PUT'): Promise<string>;
}

/** Rejects traversal and absolute paths — defence in depth on top of server-generated keys. */
export function assertSafeObjectKey(objectKey: string): void {
  if (
    !objectKey ||
    objectKey.startsWith('/') ||
    objectKey.includes('..') ||
    objectKey.includes('\\') ||
    objectKey.length > 512
  ) {
    throw new Error(`${ErrorCode.VALIDATION_FAILED}: unsafe object key`);
  }
}

export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;

  constructor(private readonly root: string, private readonly signedUrlSecret: string) {}

  private resolvePath(objectKey: string): string {
    assertSafeObjectKey(objectKey);
    const full = resolve(join(this.root, objectKey));
    if (!full.startsWith(resolve(this.root) + sep)) {
      throw new Error(`${ErrorCode.VALIDATION_FAILED}: object key escapes the storage root`);
    }
    return full;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const path = this.resolvePath(input.objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.content);
    return {
      objectKey: input.objectKey,
      sizeBytes: input.content.byteLength,
      contentType: input.contentType,
      checksumSha256: input.checksumSha256 ?? createHash('sha256').update(input.content).digest('hex'),
    };
  }

  async get(objectKey: string): Promise<Buffer> {
    return readFile(this.resolvePath(objectKey));
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      const info = await stat(this.resolvePath(objectKey));
      return info.isFile();
    } catch {
      return false;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await unlink(this.resolvePath(objectKey)).catch(() => undefined);
  }

  async signedUrl(objectKey: string, ttlSeconds: number, method: 'GET' | 'PUT' = 'GET'): Promise<string> {
    // The local driver returns an API-relative URL: the files controller validates the HMAC then
    // streams the object, so the same client code works against local and S3 drivers.
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = createHmac('sha256', this.signedUrlSecret)
      .update(`${method}:${objectKey}:${expiresAt}`)
      .digest('hex');
    const params = new URLSearchParams({ key: objectKey, expires: String(expiresAt), signature, method });
    return `/api/v1/files/local?${params.toString()}`;
  }

  verifySignedRequest(objectKey: string, expires: number, signature: string, method: 'GET' | 'PUT'): boolean {
    if (expires * 1000 < Date.now()) return false;
    const expected = createHmac('sha256', this.signedUrlSecret)
      .update(`${method}:${objectKey}:${expires}`)
      .digest('hex');
    return expected === signature;
  }

  readStream(objectKey: string) {
    return createReadStream(this.resolvePath(objectKey));
  }
}

/**
 * S3-compatible driver using SigV4 presigned URLs.
 *
 * Implemented without an SDK dependency: BEZZO only needs PUT/GET presigning, and keeping the
 * canonical request construction in-tree makes the signing behaviour unit-testable.
 * REQUIRES EXTERNAL CREDENTIALS: STORAGE_S3_* must be configured (boot fails otherwise).
 */
export class S3StorageDriver implements StorageDriver {
  readonly kind = 's3' as const;

  constructor(
    private readonly options: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
      publicBaseUrl?: string;
    },
  ) {}

  private host(): string {
    return new URL(this.options.endpoint).host;
  }

  private canonicalUri(objectKey: string): string {
    assertSafeObjectKey(objectKey);
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    return this.options.forcePathStyle ? `/${this.options.bucket}/${encodedKey}` : `/${encodedKey}`;
  }

  /** AWS SigV4 query-string presign (S3 returns 403 on any mismatch, so details matter). */
  private presign(objectKey: string, ttlSeconds: number, method: 'GET' | 'PUT', contentType?: string): string {
    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '')}`;
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.options.region}/s3/aws4_request`;
    const credential = `${this.options.accessKeyId}/${credentialScope}`;
    const signedHeaders = contentType ? 'content-type;host' : 'host';

    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(ttlSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key] as string)}`)
      .join('&');

    const canonicalHeaders = contentType
      ? `content-type:${contentType}\nhost:${this.host()}\n`
      : `host:${this.host()}\n`;

    const canonicalRequest = [
      method,
      this.canonicalUri(objectKey),
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.signingKey(dateStamp);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const base = this.options.publicBaseUrl ?? this.options.endpoint.replace(/\/$/, '');
    const path = this.options.forcePathStyle
      ? `${base}/${this.options.bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
      : `${base}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    return `${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private signingKey(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.options.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.options.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  async signedUrl(objectKey: string, ttlSeconds: number, method: 'GET' | 'PUT' = 'GET'): Promise<string> {
    return this.presign(objectKey, ttlSeconds, method, method === 'PUT' ? 'application/octet-stream' : undefined);
  }

  /** Presign an upload bound to an exact content type, so the client cannot upload something else. */
  async presignedUpload(objectKey: string, ttlSeconds: number, contentType: string): Promise<PresignedUpload> {
    return {
      objectKey,
      uploadUrl: this.presign(objectKey, ttlSeconds, 'PUT', contentType),
      method: 'PUT',
      expiresInSeconds: ttlSeconds,
      headers: { 'content-type': contentType },
    };
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const url = await this.signedUrl(input.objectKey, 300, 'PUT');
    const response = await fetch(url, {
      method: 'PUT',
      body: input.content,
      headers: { 'content-type': input.contentType },
    });
    if (!response.ok) {
      throw new Error(`S3 upload failed with status ${response.status}`);
    }
    return {
      objectKey: input.objectKey,
      sizeBytes: input.content.byteLength,
      contentType: input.contentType,
      checksumSha256: input.checksumSha256 ?? createHash('sha256').update(input.content).digest('hex'),
    };
  }

  async get(objectKey: string): Promise<Buffer> {
    const url = await this.signedUrl(objectKey, 300, 'GET');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`S3 download failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.get(objectKey);
      return true;
    } catch {
      return false;
    }
  }

  async delete(objectKey: string): Promise<void> {
    const url = this.presign(objectKey, 300, 'GET');
    const response = await fetch(url.replace('X-Amz-Signature', 'X-Amz-Signature'), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed with status ${response.status}`);
    }
  }
}

@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject('BEZZO_STORAGE_DRIVER') driver: StorageDriver,
  ) {
    this.driver = driver;
  }

  get kind(): 'local' | 's3' {
    return this.driver.kind;
  }

  /**
   * Build a server-side object key. The client never supplies a path.
   * Layout: `<env>/<ownerType>/<ownerId>/<uuid>-<sanitised-name>`.
   */
  buildObjectKey(owner: { type: string; id: string }, fileName: string, category = 'documents'): string {
    const safeName = fileName
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(-80);
    return `${this.config.NODE_ENV}/${owner.type.toLowerCase()}/${owner.id}/${category}/${randomUUID()}-${safeName}`;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    return this.driver.put(input);
  }

  async get(objectKey: string, ttlSeconds?: number): Promise<Buffer> {
    void ttlSeconds;
    return this.driver.get(objectKey);
  }

  async exists(objectKey: string): Promise<boolean> {
    return this.driver.exists(objectKey);
  }

  async signedUrl(objectKey: string, method: 'GET' | 'PUT' = 'GET'): Promise<string> {
    return this.driver.signedUrl(objectKey, this.config.STORAGE_SIGNED_URL_TTL_SECONDS, method);
  }

  async delete(objectKey: string): Promise<void> {
    return this.driver.delete(objectKey);
  }

  /** Long-lived URLs are only ever produced for PUBLIC catalog media. */
  publicUrl(objectKey: string): string | null {
    if (this.driver.kind === 's3' && this.config.CDN_PUBLIC_BASE_URL) {
      return `${this.config.CDN_PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey}`;
    }
    return null;
  }

  /** Local-driver helper used by the files controller to stream a verified download. */
  localDriver(): LocalStorageDriver | null {
    return this.driver instanceof LocalStorageDriver ? this.driver : null;
  }
}

export const STORAGE_DRIVER = 'BEZZO_STORAGE_DRIVER';

export const storageDriverProvider = {
  provide: STORAGE_DRIVER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): StorageDriver => {
    if (config.STORAGE_DRIVER === 's3') {
      if (!config.S3_ENDPOINT || !config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
        throw new Error(
          'STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY ' +
            '(provide them through the secret manager).',
        );
      }
      return new S3StorageDriver({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        bucket: config.S3_BUCKET,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        publicBaseUrl: config.CDN_PUBLIC_BASE_URL,
      });
    }
    return new LocalStorageDriver(config.STORAGE_LOCAL_ROOT, config.JWT_ACCESS_SECRET);
  },
};

@Global()
@Module({
  providers: [storageDriverProvider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
