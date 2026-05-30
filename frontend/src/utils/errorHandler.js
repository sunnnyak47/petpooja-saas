/**
 * Extract a user-friendly error message from an Axios error or generic Error.
 * Used by API call sites to display meaningful toast/notification messages
 * instead of raw HTTP status codes or stack traces.
 */
export function getErrorMessage(error) {
  // Backend returned a structured error with a message field
  if (error.response?.data?.message) return error.response.data.message;

  // Network-level failure (no response received)
  if (error.message === 'Network Error')
    return 'Unable to connect to server. Please check your internet connection.';

  // HTTP status-based messages
  if (error.response?.status === 401)
    return 'Session expired. Please log in again.';
  if (error.response?.status === 403)
    return "You don't have permission to perform this action.";
  if (error.response?.status === 404)
    return 'The requested resource was not found.';
  if (error.response?.status === 409)
    return 'This action conflicts with the current state. Please refresh and try again.';
  if (error.response?.status === 422)
    return 'The submitted data is invalid. Please check your input.';
  if (error.response?.status >= 500)
    return 'Server error. Please try again later.';

  // Fallback
  return error.message || 'An unexpected error occurred.';
}
