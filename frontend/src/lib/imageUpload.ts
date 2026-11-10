/** Image upload helpers: validation and in-browser canvas downscaling */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Validates file type and size.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateImageFile(file: File): string | null {
  const isTypeAllowed = ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())
  const name = file.name.toLowerCase()
  const isExtAllowed =
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')

  if (!isTypeAllowed && !isExtAllowed) {
    return 'Only JPEG, PNG, and WebP images are supported.'
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'File size exceeds 10 MB limit.'
  }

  return null
}

/**
 * Downscale image in the browser using HTML5 Canvas to at most maxDim pixels
 * on its longest side. Preserves aspect ratio and requires zero libraries.
 */
export async function downscaleImageIfNeeded(file: File, maxDim = 1024): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img

      if (width <= maxDim && height <= maxDim) {
        resolve(file)
        return
      }

      let targetW = width
      let targetH = height
      if (width > height) {
        targetW = maxDim
        targetH = Math.round((height * maxDim) / width)
      } else {
        targetH = maxDim
        targetW = Math.round((width * maxDim) / height)
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, targetW, targetH)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const downscaled = new File([blob], file.name, {
            type: file.type || 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(downscaled)
        },
        file.type || 'image/jpeg',
        0.92
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

