'use client';

import { useEffect, useState } from 'react';

export default function NetworkCustomerLogo({ src, name }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img src={src} alt={`شعار ${name || 'الزبون'}`} width={44} height={44} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10, padding: 3, background: '#fff' }} />
    : <span aria-hidden="true">{name?.trim().slice(0, 1) || 'ز'}</span>;
}
