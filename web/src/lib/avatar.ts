import { useEffect, useState } from 'react';

const PROFILE_AVATAR_KEY = 'crm_profile_avatar';
const PROFILE_AVATAR_EVENT = 'crm_profile_avatar_changed';

export function getProfileAvatar(): string | null {
  try {
    return localStorage.getItem(PROFILE_AVATAR_KEY);
  } catch {
    return null;
  }
}

export function setProfileAvatar(value: string) {
  localStorage.setItem(PROFILE_AVATAR_KEY, value);
  window.dispatchEvent(new Event(PROFILE_AVATAR_EVENT));
}

export function clearProfileAvatar() {
  localStorage.removeItem(PROFILE_AVATAR_KEY);
  window.dispatchEvent(new Event(PROFILE_AVATAR_EVENT));
}

export function useProfileAvatar() {
  const [avatar, setAvatar] = useState(() => getProfileAvatar());

  useEffect(() => {
    function syncAvatar() {
      setAvatar(getProfileAvatar());
    }

    window.addEventListener(PROFILE_AVATAR_EVENT, syncAvatar);
    window.addEventListener('storage', syncAvatar);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_EVENT, syncAvatar);
      window.removeEventListener('storage', syncAvatar);
    };
  }, []);

  return avatar;
}
