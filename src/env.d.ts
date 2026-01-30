interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly OPENROUTER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
