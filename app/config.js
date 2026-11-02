export const settings = {
  databaseName: "TaipeiBusOffline-v1",
  syncIntervalMs: 60 * 60 * 1000,
  retryMs: 15 * 1000,
  maxRetryMs: 5 * 60 * 1000,
  timeoutMs: 30 * 1000,
  sources: {
    routes: "https://tcgbusfs.blob.core.windows.net/blobbus/GetRoute.gz",
    stops: "https://tcgbusfs.blob.core.windows.net/blobbus/GetStop.gz",
    locations:
      "https://tcgbusfs.blob.core.windows.net/blobbus/GetStopLocation.gz",
  },
};
