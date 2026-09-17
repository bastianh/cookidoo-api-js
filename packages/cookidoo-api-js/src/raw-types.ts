/**
 * Raw JSON shapes as returned by the Cookidoo backend.
 *
 * Only the shapes actually consumed so far are declared here; more are added
 * as more API methods are ported from the Python client.
 */

export interface CommunityProfileJSON {
  id: string;
  userInfo: {
    username: string;
    description?: string | null;
    picture: string | null;
  };
}
