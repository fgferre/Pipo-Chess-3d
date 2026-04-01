export function withBasePath(baseUrl: string, assetPath: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedAssetPath = assetPath.replace(/^\/+/, "");

  return `${normalizedBase}${normalizedAssetPath}`;
}

export const engineAssetUrls = {
  scriptUrl: withBasePath(import.meta.env.BASE_URL, "assets/stockfish/stockfish-18-lite-single.js"),
  wasmUrl: withBasePath(import.meta.env.BASE_URL, "assets/stockfish/stockfish-18-lite-single.wasm"),
};
