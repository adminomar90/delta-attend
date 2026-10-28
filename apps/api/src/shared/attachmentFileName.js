// Multipart parsers can interpret UTF-8 filename bytes as Latin-1.
// Decode only complete, valid UTF-8 sequences; retain valid Unicode names.
export const normalizeAttachmentFileName = (value) => {
  let name = String(value || 'attachment');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!/[^\x00-\x7f]/.test(name) || /[^\x00-\xff]/.test(name)) break;
    try {
      const decoded = decoder.decode(Buffer.from(name, 'latin1'));
      if (decoded === name) break;
      name = decoded;
    } catch { break; }
  }
  return name.normalize('NFC').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').trim() || 'attachment';
};
