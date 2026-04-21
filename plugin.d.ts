export interface NextrayPluginOptions {
  enabled?: boolean;
  include?: string[];
  exclude?: string[];
}

export declare function withNextray<TConfig = Record<string, unknown>>(
  nextConfig?: TConfig,
  options?: NextrayPluginOptions
): TConfig;
