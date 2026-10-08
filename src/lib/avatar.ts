// Reader profile picture: cropped to a square and shrunk to 160×160 JPEG in the browser, then kept with the
// profile (localStorage 'nc-profile'.photo, about 10–20 KB). Shown wherever the reader's initial was.
// PREVIEW: with accounts, the photo is uploaded to Supabase Storage and checked by image moderation first.

export type Profile = { name?: string; color?: string; photo?: string };

export const getProfile = (): Profile => { try { return JSON.parse(localStorage.getItem('nc-profile') || '{}'); } catch { return {}; } };

/** Reads an image file and returns a centered square 160×160 JPEG data URL. */
export function squarePhoto(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type)) { reject(new Error('type')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('size')); return; }
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('read'));
    img.src = URL.createObjectURL(file);
  });
}

/** Shows the photo (or the colored initial) in an avatar element. */
export function paintAvatar(el: HTMLElement, p: Profile = getProfile(), fallbackColor = '#2B1185') {
  el.classList.toggle('has-photo', !!p.photo);
  el.style.backgroundImage = p.photo ? `url("${p.photo}")` : '';
  el.style.backgroundColor = p.photo ? '' : p.color || fallbackColor;
  el.textContent = p.photo ? '' : (p.name || 'T')[0].toUpperCase();
}
