import { Navigate } from 'react-router-dom';

/** @deprecated Use /services */
export function WebsitesPage() {
  return <Navigate to="/services" replace />;
}
