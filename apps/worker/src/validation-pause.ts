// A validation-only pause for one designated synthetic job. The caller has already verified a successful R2 PUT.
export async function pauseAfterR2(jobId: string, targetJobId: string | null, onPause: () => void): Promise<void> {
  if (targetJobId !== jobId) return;
  onPause();
  await new Promise<never>(() => { setInterval(() => {}, 60_000); });
}
