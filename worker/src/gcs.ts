// worker/src/gcs.ts
import { Storage } from '@google-cloud/storage'

const storage = new Storage()

function getBucket() {
  return storage.bucket(process.env.GCS_BUCKET || '')
}

export async function readGcsJson(path: string): Promise<unknown> {
  const [content] = await getBucket().file(path).download()
  return JSON.parse(content.toString())
}

export async function readGcsBuffer(path: string): Promise<Buffer> {
  const [content] = await getBucket().file(path).download()
  return content
}

export async function writeGcsJson(path: string, data: unknown): Promise<void> {
  await getBucket().file(path).save(JSON.stringify(data), {
    contentType: 'application/json',
  })
}

export async function gcsFileExists(path: string): Promise<boolean> {
  const [exists] = await getBucket().file(path).exists()
  return exists
}
