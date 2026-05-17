import { z } from 'zod';

const envSchema = z.object({
  BASE_PATH: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .default('/')
      .transform(basePath => {
        const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
        return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
      })
  ),
});

export const getEnvConfig = () =>
  envSchema.parse({
    BASE_PATH: import.meta.env.VITE_BASE_PATH,
  });

export const envConfig = getEnvConfig();

export type EnvConfig = z.infer<typeof envSchema>;
