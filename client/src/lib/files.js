function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function looksBinary(text) {
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 2000);
  let ctrl = 0;
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code < 9 || (code > 13 && code < 32)) ctrl += 1;
  }
  return sample.length > 40 && ctrl / sample.length > 0.1;
}

async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (!broken) return utf8;
  return new TextDecoder("windows-1251").decode(bytes);
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const packed = bytes.subarray(dataStart, dataStart + compSize);
    let raw = new Uint8Array();
    if (method === 0) raw = packed;
    else if (method === 8) raw = await inflateRaw(packed);
    entries.push({ name, text: new TextDecoder().decode(raw) });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readOfficeText(file) {
  const entries = await readZipEntries(file);
  const chunks = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const useful =
      name === "word/document.xml" ||
      name.startsWith("word/header") ||
      name.startsWith("word/footer") ||
      name === "xl/sharedstrings.xml" ||
      name.startsWith("xl/worksheets/") ||
      name.startsWith("ppt/slides/slide");
    if (!useful) continue;
    const text = xmlToText(entry.text);
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n").slice(0, 12000);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

export function isImageFile(file) {
  const name = file?.name || "";
  const type = file?.type || "";
  return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(name);
}

export async function readAttachment(file) {
  const name = file.name || "file";
  const type = file.type || "";
  if (isImageFile(file)) return { kind: "image", name, dataUrl: await compressImage(file) };
  if (type === "application/pdf" || /\.pdf$/i.test(name)) {
    return { kind: "file", name, dataUrl: await readDataUrl(file) };
  }
  if (/\.(docx|xlsx|pptx)$/i.test(name)) {
    return { kind: "text", name, text: await readOfficeText(file) };
  }
  const text = await readTextFile(file);
  if (looksBinary(text)) return { kind: "text", name, text: "" };
  return { kind: "text", name, text };
}
