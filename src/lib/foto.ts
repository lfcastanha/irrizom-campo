/**
 * Reduz a foto no próprio celular antes de guardar (≈150–300 KB em vez de 3–5 MB).
 * Economiza dados móveis e o espaço do plano gratuito do Supabase.
 */
export async function comprimirFoto(arquivo: File, ladoMaximo = 1600, qualidade = 0.72): Promise<Blob> {
  const fonte = await carregar(arquivo);
  const escala = Math.min(1, ladoMaximo / Math.max(fonte.width, fonte.height));
  const w = Math.round(fonte.width * escala);
  const h = Math.round(fonte.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return arquivo;
  ctx.drawImage(fonte.img, 0, 0, w, h);
  if ('close' in fonte.img) (fonte.img as ImageBitmap).close();
  return new Promise((ok) =>
    canvas.toBlob((b) => ok(b ?? arquivo), 'image/jpeg', qualidade),
  );
}

async function carregar(arquivo: File): Promise<{ img: CanvasImageSource; width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    return { img: bmp, width: bmp.width, height: bmp.height };
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { img, width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
