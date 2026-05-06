import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Hook to fetch and hold system branding settings.
 * Returns the branding object and loading state.
 */
export default function useBranding() {
  const { data: branding, isLoading } = useQuery({
    queryKey: ['public-branding'],
    queryFn: async () => {
      try {
        const res = await api.get('/auth/branding');
        return res.data;
      } catch (error) {
        console.error('Failed to fetch branding:', error);
        return {
          platform_name: 'MS-RM System',
          support_whatsapp: '+91 9999999999',
          support_email: 'support@madsundigital.com',
          restaurant_app_url: 'petpooja-saas.vercel.app'
        };
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
    retry: 2
  });

  return {
    branding: branding || {
      platform_name: 'MS-RM System',
      support_whatsapp: '',
      support_email: '',
      restaurant_app_url: ''
    },
    isLoading,
    // Helper to get initials
    getPlatformInitial: () => {
      const name = branding?.platform_name || 'MS-RM System';
      return name.charAt(0).toUpperCase();
    }
  };
}
