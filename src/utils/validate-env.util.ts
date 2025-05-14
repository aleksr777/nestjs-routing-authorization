export function validateEnvVariables(requiredVars: readonly string[]): void {
  const missing = requiredVars.filter((key) => {
    const val = process.env[key];
    return val === undefined || val.trim() === '';
  });
  if (missing.length) {
    console.error(
      `The following required environment variables are missing or empty: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
}
