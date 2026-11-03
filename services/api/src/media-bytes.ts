export type SniffedFile =
  | { kind: 'image'; contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; extension: '.png' | '.jpg' | '.webp' | '.gif' }
  | { kind: 'video'; contentType: 'video/mp4'; extension: '.mp4' }

export function sniffMedia(bytes: Buffer): SniffedFile | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: 'image', contentType: 'image/png', extension: '.png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', contentType: 'image/jpeg', extension: '.jpg' }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', contentType: 'image/webp', extension: '.webp' }
  }
  if (bytes.length >= 6) {
    const gif = bytes.subarray(0, 6).toString('ascii')
    if (gif === 'GIF87a' || gif === 'GIF89a') {
      return { kind: 'image', contentType: 'image/gif', extension: '.gif' }
    }
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { kind: 'video', contentType: 'video/mp4', extension: '.mp4' }
  }
  return null
}
