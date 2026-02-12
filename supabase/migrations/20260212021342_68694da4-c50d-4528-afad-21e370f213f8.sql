
-- Grant decrypt/encrypt to service_role for edge functions
GRANT EXECUTE ON FUNCTION encrypt_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION _get_pw_key() TO service_role;
