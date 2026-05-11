import { useSelector } from 'react-redux';

/**
 * Returns the user's region code ('AU' or 'IN') based on head_office.region,
 * outlet.currency, or outlet.country.  Falls back to 'IN'.
 */
export function useRegion() {
  const { user } = useSelector((s) => s.auth);
  const region =
    user?.head_office?.region ||
    (user?.outlet?.currency === 'AUD' ? 'AU' : null) ||
    (user?.outlet?.country === 'Australia' ? 'AU' : null) ||
    'IN';
  return region;
}
