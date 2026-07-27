export const MAX_ONLINE_IMAGE_BYTES = 5 * 1024 * 1024

const COMPRESSION_QUALITIES = [80, 65, 50, 35, 20, 10]

export interface ImageCompressionApi {
  getFileInfo(options: {
    filePath: string
    success: (result: { size: number }) => void
    fail: () => void
  }): void
  compressImage(options: {
    src: string
    quality: number
    success: (result: { tempFilePath: string }) => void
    fail: () => void
  }): void
}

export type ImageUploadPreparer = (filePath: string) => Promise<string>

function defaultImageApi(): ImageCompressionApi {
  return {
    getFileInfo: (options) => {
      wx.getFileInfo({
        filePath: options.filePath,
        success: (result) => options.success({ size: result.size }),
        fail: () => options.fail(),
      })
    },
    compressImage: (options) => {
      wx.compressImage({
        src: options.src,
        quality: options.quality,
        success: (result) => options.success({ tempFilePath: result.tempFilePath }),
        fail: () => options.fail(),
      })
    },
  }
}

function imageSize(filePath: string, imageApi: ImageCompressionApi): Promise<number> {
  return new Promise((resolve, reject) => {
    imageApi.getFileInfo({
      filePath,
      success: (result) => resolve(result.size),
      fail: () => reject(new Error('无法获取图片大小，请重新选择')),
    })
  })
}

function compressImage(
  filePath: string,
  quality: number,
  imageApi: ImageCompressionApi,
): Promise<string> {
  return new Promise((resolve, reject) => {
    imageApi.compressImage({
      src: filePath,
      quality,
      success: (result) => resolve(result.tempFilePath),
      fail: () => reject(new Error('图片压缩失败，请重新拍摄或选择')),
    })
  })
}

export async function prepareImageForUpload(
  filePath: string,
  imageApi: ImageCompressionApi = defaultImageApi(),
): Promise<string> {
  const originalSize = await imageSize(filePath, imageApi)
  if (originalSize <= MAX_ONLINE_IMAGE_BYTES) return filePath

  for (const quality of COMPRESSION_QUALITIES) {
    const compressedPath = await compressImage(filePath, quality, imageApi)
    const compressedSize = await imageSize(compressedPath, imageApi)
    if (compressedSize <= MAX_ONLINE_IMAGE_BYTES) return compressedPath
  }

  throw new Error('图片压缩后仍超过 5 MB，请靠近拍摄或重新选择图片')
}
