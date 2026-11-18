let activePrint;

export async function printEmployeeBadge(canvases, mode) {
  activePrint?.();
  const layer = document.createElement('section');
  layer.id = 'employee-badge-print';
  layer.hidden = true;
  const style = document.createElement('style');
  const a4 = mode === 'a4';
  style.textContent = `
    @page { size: ${a4 ? 'A4 portrait' : '53.98mm 85.60mm'}; margin: ${a4 ? '12mm' : '0'}; }
    @media print {
      html, body { direction: ltr !important; overflow: visible !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body::before, body::after, body > :not(#employee-badge-print) { display: none !important; }
      #employee-badge-print { display: ${a4 ? 'flex' : 'block'} !important; direction: ltr; gap: 12mm; justify-content: center; }
      #employee-badge-print img { display: block; width: 53.98mm; height: 85.60mm; max-width: none; break-inside: avoid; }
      ${a4 ? '' : '#employee-badge-print img + img { break-before: page; }'}
    }
  `;
  try {
    for (const [index, canvas] of canvases.entries()) {
      const image = new Image();
      image.alt = index ? 'الوجه الخلفي' : 'الوجه الأمامي';
      image.src = canvas.toDataURL('image/png');
      await image.decode();
      layer.append(image);
    }
  } catch {
    throw new Error('تعذّر تجهيز البطاقة للطباعة.');
  }
  const cleanup = () => {
    style.remove();
    layer.remove();
    window.removeEventListener('afterprint', cleanup);
    activePrint = null;
  };
  activePrint = cleanup;
  document.head.append(style);
  document.body.append(layer);
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
