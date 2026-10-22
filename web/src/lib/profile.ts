import { api } from '@/lib/api';
import { getUserProfile, setUserProfile, type UserProfile } from '@/lib/auth';

/** Pull profile from the server; migrates a customized local cache if the DB still has defaults. */
export async function syncProfileFromServer(): Promise<UserProfile | null> {
  try {
    const server = await api.profile.get();
    const local = getUserProfile();
    const serverIsDefault =
      server.name === 'Admin User' && server.email === 'admin@crm.local';
    const localWasCustomized =
      local.name !== 'Admin User' || local.email !== 'admin@crm.local';

    if (serverIsDefault && localWasCustomized) {
      const migrated = await api.profile.update({
        name: local.name,
        email: local.email,
      });
      setUserProfile(migrated);
      return migrated;
    }

    setUserProfile(server);
    return server;
  } catch {
    return null;
  }
}
