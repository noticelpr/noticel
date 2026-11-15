// Reads the details photographers save inside a JPEG (what PhotoShelter reads too), so they don't type them again:
//   · IPTC (Photo Mechanic, Lightroom, newsroom tools): caption, headline, keywords, by-line, credit, city, date
//   · XMP (Lightroom, Photoshop, phones): the same fields in their newer form
//   · EXIF (every camera and phone): when it was taken, camera and lens
// Everything is read in the browser; nothing is sent anywhere. Missing pieces just stay empty.

export type PhotoInfo = {
  caption?: string; headline?: string; keywords?: string[]; photographer?: string; credit?: string;
  city?: string; place?: string; takenOn?: string; camera?: string; copyright?: string;
};

const dec = new TextDecoder('utf-8'), latin = new TextDecoder('latin1');
const text = (b: Uint8Array) => { try { return dec.decode(b); } catch { return latin.decode(b); } };

/** The parts of a JPEG we read: APP1 (EXIF and XMP) and APP13 (IPTC). */
function segments(buf: ArrayBuffer) {
  const v = new DataView(buf); const out: Array<{ marker: number; start: number; len: number }> = [];
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
  let i = 2;
  while (i + 4 <= v.byteLength) {
    if (v.getUint8(i) !== 0xff) break;
    const marker = v.getUint8(i + 1);
    if (marker === 0xda || marker === 0xd9) break; // the picture itself starts: no more details after this
    const len = v.getUint16(i + 2);
    out.push({ marker, start: i + 4, len: len - 2 });
    i += 2 + len;
  }
  return out;
}

function readIptc(bytes: Uint8Array, info: PhotoInfo) {
  // Photoshop "8BIM" resource 0x0404 holds the IPTC records
  for (let i = 0; i + 12 < bytes.length; i++) {
    if (bytes[i] !== 0x38 || bytes[i + 1] !== 0x42 || bytes[i + 2] !== 0x49 || bytes[i + 3] !== 0x4d) continue;
    const id = (bytes[i + 4] << 8) | bytes[i + 5];
    const nameLen = bytes[i + 6]; let p = i + 7 + nameLen; if ((nameLen + 1) % 2) p++;
    const size = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]; p += 4;
    if (id === 0x0404) {
      const end = Math.min(bytes.length, p + size); const kw: string[] = [];
      while (p + 5 <= end && bytes[p] === 0x1c) {
        const rec = bytes[p + 1], ds = bytes[p + 2], n = (bytes[p + 3] << 8) | bytes[p + 4];
        const val = text(bytes.subarray(p + 5, p + 5 + n)).trim();
        if (rec === 2 && val) {
          if (ds === 120) info.caption ??= val;            // Caption/Abstract
          else if (ds === 105) info.headline ??= val;      // Headline
          else if (ds === 25) kw.push(val);                 // Keywords
          else if (ds === 80) info.photographer ??= val;   // By-line
          else if (ds === 110) info.credit ??= val;         // Credit
          else if (ds === 90) info.city ??= val;            // City
          else if (ds === 92) info.place ??= val;           // Sub-location
          else if (ds === 116) info.copyright ??= val;      // Copyright
          else if (ds === 55 && /^\d{8}$/.test(val)) info.takenOn ??= `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`; // Date created
        }
        p += 5 + n;
      }
      if (kw.length) info.keywords ??= kw;
      return;
    }
    i = p + size - 1;
  }
}

function readXmp(xml: string, info: PhotoInfo) {
  const one = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>\\s*(?:<rdf:(?:Alt|Seq|Bag)>\\s*)?(?:<rdf:li[^>]*>)?([^<]+)`)) ?? xml.match(new RegExp(`${tag}="([^"]+)"`));
    return m?.[1]?.trim();
  };
  const list = (tag: string) => { const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? [...m[1].matchAll(/<rdf:li[^>]*>([^<]+)<\/rdf:li>/g)].map((x) => x[1].trim()) : []; };
  info.caption ??= one('dc:description');
  info.headline ??= one('photoshop:Headline');
  info.photographer ??= one('dc:creator');
  info.credit ??= one('photoshop:Credit');
  info.city ??= one('photoshop:City');
  info.place ??= one('Iptc4xmpCore:Location');
  info.copyright ??= one('dc:rights');
  const kw = list('dc:subject'); if (kw.length) info.keywords ??= kw;
  const d = one('photoshop:DateCreated') ?? one('exif:DateTimeOriginal') ?? one('xmp:CreateDate');
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) info.takenOn ??= d.slice(0, 10);
}

function readExif(v: DataView, start: number, info: PhotoInfo) {
  // "Exif\0\0" then a TIFF header
  const t = start + 6; if (t + 8 > v.byteLength) return;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le), u32 = (o: number) => v.getUint32(t + o, le);
  const str = (o: number, n: number) => latin.decode(new Uint8Array(v.buffer, t + o, Math.max(0, Math.min(n, v.byteLength - t - o)))).replace(/\0+$/, '').trim();
  const tags = (ifd: number) => {
    const out = new Map<number, string>(); if (ifd <= 0 || t + ifd + 2 > v.byteLength) return { out, exif: 0 };
    let exif = 0; const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12; if (t + e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (tag === 0x8769) exif = u32(e + 8);
      if (type === 2) out.set(tag, str(count > 4 ? u32(e + 8) : e + 8, count));
    }
    return { out, exif };
  };
  try {
    const main = tags(u32(4));
    const make = main.out.get(0x010f) ?? '', model = main.out.get(0x0110) ?? '';
    if (model) info.camera ??= model.startsWith(make) ? model : `${make} ${model}`.trim();
    if (main.exif) {
      const ex = tags(main.exif).out;
      const when = ex.get(0x9003) ?? ex.get(0x9004); // DateTimeOriginal / DateTimeDigitized: "2026:11:15 10:30:00"
      if (when && /^\d{4}:\d{2}:\d{2}/.test(when)) info.takenOn ??= when.slice(0, 10).replace(/:/g, '-');
      const lens = ex.get(0xa434); if (lens && info.camera && !info.camera.includes(lens)) info.camera = `${info.camera} · ${lens}`;
    }
  } catch { /* unusual EXIF: skip it */ }
}

/** Reads the details saved inside a photo file. Never fails: returns what it could find. */
export async function readPhotoInfo(file: File): Promise<PhotoInfo> {
  const info: PhotoInfo = {};
  if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return info;
  try {
    const buf = await file.slice(0, 512 * 1024).arrayBuffer(); // the details are at the start of the file
    const v = new DataView(buf);
    for (const s of segments(buf)) {
      const bytes = new Uint8Array(buf, s.start, Math.min(s.len, buf.byteLength - s.start));
      const head = latin.decode(bytes.subarray(0, 40));
      if (s.marker === 0xed) readIptc(bytes, info);
      else if (s.marker === 0xe1 && head.startsWith('Exif')) readExif(v, s.start, info);
      else if (s.marker === 0xe1 && head.startsWith('http://ns.adobe.com/xap/1.0/')) readXmp(text(bytes), info);
    }
  } catch { /* not readable: no details */ }
  return info;
}

/** A short fingerprint of the file, to warn when the same photo was already uploaded. */
export async function fingerprint(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
