export async function restoreWorkerKey({ status, setKey, waitDeploy, deployedKeyMatches, validKey }) {
  let previous;
  try { previous = (await status()).deploymentId; } catch { /* Restoration must still run. */ }
  let mutationError;
  try { await setKey(validKey); } catch (error) { mutationError = error; }
  let matches = false;
  let online = false;
  try { matches = await deployedKeyMatches(); } catch { /* Report unconfirmed restoration. */ }
  try {
    const deployed = await waitDeploy(previous);
    online = deployed.status === "SUCCESS" && !deployed.stopped;
  } catch { /* Report unconfirmed health. */ }
  return { deployedKeyMatchesLocal: matches, online, confirmed: matches && online,
    ...(mutationError ? { mutationErrorKind: String(mutationError.name ?? "unknown").slice(0, 50) } : {}) };
}
