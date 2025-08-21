import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand, BucketLocationConstraint } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export async function uploadJson(s3: S3Client, bucket: string, key: string, obj: unknown) {
  const body = Buffer.from(JSON.stringify(obj));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json' }));
}

export async function getJson(s3: S3Client, bucket: string, key: string): Promise<any> {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

export async function uploadText(s3: S3Client, bucket: string, key: string, text: string, contentType = 'text/plain') {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(text), ContentType: contentType }));
}

export async function ensureBucketExists(s3: S3Client, bucket: string, region: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return false; // already existed
  } catch (e: any) {
    const isUsEast1 = region === 'us-east-1';
    const location = region as BucketLocationConstraint;
    await s3.send(
      new CreateBucketCommand(
        isUsEast1
          ? { Bucket: bucket }
          : { Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: location } }
      )
    );
    return true; // created
  }
}

export async function emptyAndDeleteBucket(s3: S3Client, bucket: string) {
  try {
    let token: string | undefined = undefined;
    do {
      const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      const objects = (resp.Contents || []).map(o => ({ Key: o.Key! }));
      if (objects.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
      }
      token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (token);
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  } catch (e) {
    console.warn(`Failed to delete bucket ${bucket}:`, e);
  }
}


