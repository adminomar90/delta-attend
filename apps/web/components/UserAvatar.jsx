'use client';

import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../lib/api';

export default function UserAvatar({
  fullName = '',
  avatarUrl = '',
  alt = '',
  className = '',
  imgClassName = '',
  fallbackClassName = '',
  fallbackStyle,
}) {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [avatarUrl]);

  const initials = useMemo(() => (
    (fullName || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  ), [fullName]);

  if (avatarUrl && !hasLoadError) {
    return (
      <img
        className={imgClassName || className}
        src={assetUrl(avatarUrl)}
        alt={alt || fullName || 'avatar'}
        onError={() => setHasLoadError(true)}
      />
    );
  }

  return (
    <span className={fallbackClassName || className} style={fallbackStyle}>
      {initials}
    </span>
  );
}
