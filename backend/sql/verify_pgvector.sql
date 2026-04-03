SELECT extname AS extension_name
FROM pg_extension
WHERE extname = 'vector';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'courses', 'user_profiles')
ORDER BY table_name;

SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name = 'embedding';
